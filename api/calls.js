import { del, put } from '@vercel/blob';
import formidable from 'formidable';
import fs from 'fs';
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';
import Anthropic from '@anthropic-ai/sdk';


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function deleteBlobs(urls) {
  const valid = urls.filter(Boolean);
  if (!valid.length) return;
  try { await del(valid); } catch (e) { console.warn('Blob delete ignoré :', e.message); }
}

const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

async function gcToken() {
  try {
    const [tok] = await sql`SELECT value FROM config WHERE key = 'gc_access' LIMIT 1`;
    const [exp] = await sql`SELECT value FROM config WHERE key = 'gc_access_exp' LIMIT 1`;
    if (tok?.value && exp?.value && Date.now() < Number(exp.value)) return tok.value;
  } catch {}
  const r = await fetch(`${GC_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret_id:  process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  });
  const t = await r.json();
  if (!t.access) throw new Error(t.detail || 'Token GoCardless invalide — vérifie GOCARDLESS_SECRET_ID et GOCARDLESS_SECRET_KEY');
  const expMs = String(Date.now() + (t.access_expires - 120) * 1000);
  await sql`INSERT INTO config(key,value) VALUES('gc_access',${t.access}) ON CONFLICT(key) DO UPDATE SET value=${t.access},updated_at=NOW()`;
  await sql`INSERT INTO config(key,value) VALUES('gc_access_exp',${expMs}) ON CONFLICT(key) DO UPDATE SET value=${expMs},updated_at=NOW()`;
  return t.access;
}

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  // ── Migrations (une seule fois par instance serverless) ──────────────────────
  if (!global.__vox_migrated) {
    try {
      await sql`CREATE TABLE IF NOT EXISTS folders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '📁', sort_order SMALLINT NOT NULL DEFAULT 0, importance SMALLINT NOT NULL DEFAULT 2, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL`;
      await sql`CREATE INDEX IF NOT EXISTS entries_folder_id_idx ON entries(folder_id)`;
      await sql`CREATE TABLE IF NOT EXISTS habits (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '🔄', frequency TEXT NOT NULL DEFAULT 'daily', target_days SMALLINT NOT NULL DEFAULT 7, folder_id UUID REFERENCES folders(id) ON DELETE SET NULL, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS habit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE, date DATE NOT NULL, done BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_uniq ON habit_logs(habit_id, date)`;
      global.__vox_migrated = true;
    } catch {}
  }

  // ── GET : liste des dossiers ───────────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'folders') {
    const folders = await sql`
      SELECT f.id, f.name, f.emoji, f.sort_order, f.importance, f.created_at,
             COUNT(e.id) FILTER (WHERE e.archived = false AND e.status = 'done') AS note_count
      FROM folders f
      LEFT JOIN entries e ON e.folder_id = f.id
      GROUP BY f.id
      ORDER BY f.sort_order ASC, f.importance DESC
    `;
    return res.status(200).json(folders);
  }

  // ── POST : créer un dossier ────────────────────────────────────────────────
  if (req.method === 'POST' && req.query.action === 'folders') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    const { name, emoji, sort_order, importance } = body || {};
    if (!name) return res.status(400).json({ error: 'Nom requis.' });
    const [folder] = await sql`
      INSERT INTO folders (name, emoji, sort_order, importance)
      VALUES (${name}, ${emoji || '📁'}, ${sort_order || 0}, ${importance || 2})
      RETURNING *
    `;
    return res.status(201).json(folder);
  }

  // ── PATCH : modifier un dossier ────────────────────────────────────────────
  if (req.method === 'PATCH' && req.query.action === 'folders') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    const { id, name, emoji, sort_order, importance } = body || {};
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    const [folder] = await sql`
      UPDATE folders SET
        name       = COALESCE(${name || null}, name),
        emoji      = COALESCE(${emoji || null}, emoji),
        sort_order = COALESCE(${sort_order != null ? sort_order : null}, sort_order),
        importance = COALESCE(${importance != null ? importance : null}, importance)
      WHERE id = ${id}
      RETURNING *
    `;
    if (!folder) return res.status(404).json({ error: 'Dossier introuvable.' });
    return res.status(200).json(folder);
  }

  // ── DELETE : supprimer un dossier (notes → folder_id NULL) ─────────────────
  if (req.method === 'DELETE' && req.query.action === 'folders') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    await sql`UPDATE entries SET folder_id = NULL WHERE folder_id = ${id}`;
    await sql`DELETE FROM folders WHERE id = ${id}`;
    return res.status(200).json({ deleted: 1 });
  }

  // ── GET : vue priorités (notes triées par importance dossier > priorité note) ─
  if (req.method === 'GET' && req.query.action === 'priorities') {
    const entries = await sql`
      SELECT e.id, e.title, e.summary, e.tags, e.created_at,
             COALESCE(e.priority, 2) AS priority,
             e.folder_id,
             f.name AS folder_name, f.emoji AS folder_emoji,
             f.importance AS folder_importance, f.sort_order AS folder_sort_order
      FROM entries e
      LEFT JOIN folders f ON f.id = e.folder_id
      WHERE e.archived = false AND e.status = 'done'
      ORDER BY COALESCE(f.importance, 0) DESC,
               COALESCE(f.sort_order, 999) ASC,
               COALESCE(e.priority, 2) DESC,
               e.created_at DESC
    `;
    return res.status(200).json(entries);
  }

  // ── POST : assigner des notes à des dossiers (bulk) ────────────────────────
  if (req.method === 'POST' && req.query.action === 'assign-folders') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    const assignments = Array.isArray(body?.assignments) ? body.assignments : [];
    if (!assignments.length) return res.status(400).json({ error: 'Aucune assignation.' });
    let count = 0;
    for (const { entry_id, folder_id } of assignments) {
      if (!entry_id || !UUID.test(entry_id)) continue;
      if (folder_id && !UUID.test(folder_id)) continue;
      await sql`UPDATE entries SET folder_id = ${folder_id || null} WHERE id = ${entry_id}`;
      count++;
    }
    return res.status(200).json({ assigned: count });
  }

  // ── GET : liste des habitudes avec streaks ─────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'habits') {
    const showAll = req.query.all === '1';
    const habits = showAll
      ? await sql`SELECT * FROM habits ORDER BY created_at`
      : await sql`SELECT * FROM habits WHERE active = true ORDER BY created_at`;
    if (!habits.length) return res.status(200).json([]);

    const ids = habits.map(h => h.id);
    const logs = await sql`
      SELECT habit_id, date, done FROM habit_logs
      WHERE habit_id = ANY(${ids}::uuid[]) AND date >= CURRENT_DATE - 60
      ORDER BY date DESC
    `;
    const logsByHabit = {};
    for (const l of logs) {
      if (!logsByHabit[l.habit_id]) logsByHabit[l.habit_id] = [];
      logsByHabit[l.habit_id].push(l);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const mondayStr = monday.toISOString().slice(0, 10);

    const result = habits.map(h => {
      const hLogs = logsByHabit[h.id] || [];
      const doneToday = hLogs.some(l => l.date.toISOString().slice(0, 10) === todayStr && l.done);
      const weekCount = hLogs.filter(l => l.date.toISOString().slice(0, 10) >= mondayStr && l.done).length;

      // Streak : jours consecutifs done en remontant depuis hier (ou aujourd'hui si done)
      let streak = 0;
      const d = new Date();
      if (!doneToday) d.setDate(d.getDate() - 1);
      const doneSet = new Set(hLogs.filter(l => l.done).map(l => l.date.toISOString().slice(0, 10)));
      for (let i = 0; i < 60; i++) {
        const ds = d.toISOString().slice(0, 10);
        if (doneSet.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }

      return { ...h, streak, done_today: doneToday, week_count: weekCount };
    });

    return res.status(200).json(result);
  }

  // ── POST : créer une habitude ──────────────────────────────────────────────
  if (req.method === 'POST' && req.query.action === 'habits') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    const { name, emoji, frequency, target_days, folder_id } = body || {};
    if (!name) return res.status(400).json({ error: 'Nom requis.' });
    const [habit] = await sql`
      INSERT INTO habits (name, emoji, frequency, target_days, folder_id)
      VALUES (${name}, ${emoji || '🔄'}, ${frequency || 'daily'}, ${target_days || 7}, ${folder_id || null})
      RETURNING *
    `;
    return res.status(201).json(habit);
  }

  // ── PATCH : modifier une habitude ──────────────────────────────────────────
  if (req.method === 'PATCH' && req.query.action === 'habits') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    const { id, name, emoji, frequency, target_days, active, folder_id } = body || {};
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    const [habit] = await sql`
      UPDATE habits SET
        name        = COALESCE(${name || null}, name),
        emoji       = COALESCE(${emoji || null}, emoji),
        frequency   = COALESCE(${frequency || null}, frequency),
        target_days = COALESCE(${target_days != null ? target_days : null}, target_days),
        active      = COALESCE(${active != null ? active : null}, active),
        folder_id   = COALESCE(${folder_id || null}, folder_id)
      WHERE id = ${id}
      RETURNING *
    `;
    if (!habit) return res.status(404).json({ error: 'Habitude introuvable.' });
    return res.status(200).json(habit);
  }

  // ── DELETE : supprimer une habitude ─────────────────────────────────────────
  if (req.method === 'DELETE' && req.query.action === 'habits') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    await sql`DELETE FROM habits WHERE id = ${id}`;
    return res.status(200).json({ deleted: 1 });
  }

  // ── POST : toggle log d'habitude (upsert) ─────────────────────────────────
  if (req.method === 'POST' && req.query.action === 'habit-log') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    const { habit_id, date, done } = body || {};
    if (!habit_id || !UUID.test(habit_id)) return res.status(400).json({ error: 'habit_id invalide.' });
    if (!date) return res.status(400).json({ error: 'date requise (YYYY-MM-DD).' });
    const doneVal = done !== false;
    await sql`
      INSERT INTO habit_logs (habit_id, date, done)
      VALUES (${habit_id}, ${date}, ${doneVal})
      ON CONFLICT (habit_id, date) DO UPDATE SET done = ${doneVal}
    `;
    return res.status(200).json({ habit_id, date, done: doneVal });
  }

  // ── GET : entrée unique par callId (ex-status.js) ────────────────────────
  if (req.method === 'GET' && req.query.callId) {
    const { callId } = req.query;
    if (!UUID.test(callId)) return res.status(400).json({ error: 'callId invalide.' });
    const [entry] = await sql`
      SELECT id, created_at, source, status, category, title, summary, tags, email_draft, error
      FROM entries WHERE id = ${callId} LIMIT 1
    `;
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });
    return res.status(200).json(entry);
  }

  // ── GET : liste des entrées ───────────────────────────────────────────────
  if (req.method === 'GET' && !req.query.action) {
    const viewArchived = req.query.archived === '1';
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 200);
    let entries;
    try {
      entries = await sql`
        SELECT e.id, e.created_at, e.source, e.status,
               e.category, e.title, e.summary, e.tags, e.email_draft,
               e.error, e.pinned, e.archived, e.project_id,
               e.calendar_event, e.calendar_event_status,
               COALESCE(e.priority, 2) AS priority,
               (e.audio_url IS NOT NULL) AS has_audio,
               e.folder_id,
               p.name  AS project_name,
               p.color AS project_color,
               fl.name AS folder_name,
               fl.emoji AS folder_emoji
        FROM entries e
        LEFT JOIN projects p ON p.id = e.project_id
        LEFT JOIN folders fl ON fl.id = e.folder_id
        WHERE e.archived = ${viewArchived}
        ORDER BY e.created_at DESC
        LIMIT ${limit}
      `;
    } catch (colErr) {
      // Colonne priority absente (migration V3.5 non encore exécutée) — fallback
      entries = await sql`
        SELECT e.id, e.created_at, e.source, e.status,
               e.category, e.title, e.summary, e.tags, e.email_draft,
               e.error, e.pinned, e.archived, e.project_id,
               e.calendar_event, e.calendar_event_status,
               2 AS priority,
               (e.audio_url IS NOT NULL) AS has_audio,
               p.name  AS project_name,
               p.color AS project_color
        FROM entries e
        LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.archived = ${viewArchived}
        ORDER BY e.created_at DESC
        LIMIT ${limit}
      `;
    }

    if (entries.length) {
      const ids = entries.map(e => e.id);
      const itemRows = await sql`
        SELECT id, entry_id, type, text, done, due_date, status, agent_result
        FROM items
        WHERE entry_id = ANY(${ids}::uuid[])
        ORDER BY entry_id, position
      `;
      const byEntry = {};
      for (const i of itemRows) {
        if (!byEntry[i.entry_id]) byEntry[i.entry_id] = [];
        byEntry[i.entry_id].push({ id: i.id, type: i.type, text: i.text, done: i.done, due_date: i.due_date });
      }
      for (const e of entries) e.action_items = byEntry[e.id] || [];
    }

    return res.status(200).json(entries);
  }

  // ── PATCH : assigner un projet ────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });

    const { project_id, archived, title, summary, tags, category, priority } = req.body || {};
    if (project_id && !UUID.test(project_id)) return res.status(400).json({ error: 'project_id invalide.' });

    // Archive toggle
    if (typeof archived === 'boolean') {
      const [entry] = await sql`
        UPDATE entries SET archived = ${archived}
        WHERE id = ${id}
        RETURNING id, archived
      `;
      if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });
      return res.status(200).json(entry);
    }

    // Edit content (title / summary / tags / category / priority)
    if (title !== undefined || summary !== undefined || tags !== undefined || category !== undefined || priority !== undefined) {
      const validCategories = ['work', 'personal', 'idea', 'meeting', 'app', 'inbox'];
      const safeCategory = validCategories.includes(category) ? category : null;
      const safeTags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : null;
      const safePriority = [1,2,3,4].includes(Number(priority)) ? Number(priority) : null;

      const [entry] = await sql`
        UPDATE entries SET
          title    = COALESCE(${title?.trim()    ?? null}, title),
          summary  = COALESCE(${summary?.trim()  ?? null}, summary),
          tags     = COALESCE(${safeTags         ?? null}, tags),
          category = COALESCE(${safeCategory     ?? null}, category),
          priority = COALESCE(${safePriority     ?? null}, priority)
        WHERE id = ${id}
        RETURNING id, title, summary, tags, category, priority
      `;
      if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });
      return res.status(200).json(entry);
    }

    const [entry] = await sql`
      UPDATE entries SET project_id = ${project_id || null}
      WHERE id = ${id}
      RETURNING id, project_id
    `;
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });
    return res.status(200).json(entry);
  }

  // ── POST : prévisualisation des groupes (sans écriture en DB) ──────────────
  if (req.method === 'POST' && req.query.action === 'merge-preview') {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' });

    const entries = await sql`
      SELECT id, title, summary, category, tags, created_at
      FROM entries
      WHERE archived = false AND status = 'done'
      ORDER BY created_at DESC
      LIMIT 100
    `;
    if (entries.length < 2) return res.status(200).json({ groups: [], message: 'Pas assez de notes à analyser.' });

    // Index titre par id pour l'affichage dans la bulle de préview
    const titleById = Object.fromEntries(entries.map(e => [e.id, e.title || 'Sans titre']));

    const list = entries.map((e, i) => {
      const tags = (e.tags || []).join(', ');
      return `${i + 1}. [${e.id}] [${e.category || 'inbox'}] ${e.title || 'Sans titre'}${tags ? ` #${tags}` : ''} — ${(e.summary || '').replace(/\n/g, ' ').slice(0, 150)}`;
    }).join('\n');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Tu es un assistant qui regroupe les notes similaires d'un utilisateur.

Analyse ces ${entries.length} notes et identifie TOUS les groupes possibles — sois GÉNÉREUX dans tes regroupements.

Critères de regroupement (chacun suffit) :
- Même sujet, thème ou projet (ex: toutes les notes sur l'app Vox, sur un client, sur un chantier)
- Même type d'action répétée (ex: plusieurs rappels du même type, plusieurs achats)
- Même contexte de vie (ex: famille, sport, santé)
- Notes complémentaires qui gagneraient à être fusionnées en une seule fiche
- Doublon ou reformulation du même besoin

Règles :
- Un groupe peut avoir 2 à 8 notes
- Une note peut appartenir à UN SEUL groupe
- Crée AUTANT de groupes que possible — 10, 15 groupes, c'est bien
- Pour chaque groupe, la note gardée est la PLUS RÉCENTE (premier ID dans la liste = plus récent)
- Le merged_summary doit synthétiser TOUS les points clés des notes du groupe en bullet points (- point 1\n- point 2)
- Si une note est vraiment isolée sans lien avec aucune autre, elle reste seule

Notes (plus récente en premier) :
${list}

Réponds UNIQUEMENT avec un JSON valide, sans markdown :
{
  "groups": [
    {
      "ids": ["uuid-le-plus-recent", "uuid2", "uuid3"],
      "merged_title": "Titre synthétique court et précis",
      "merged_summary": "- Point clé 1\n- Point clé 2\n- Point clé 3"
    }
  ]
}`,
      }],
    });

    let groups = [];
    try {
      const raw = msg.content.map(b => b.text || '').join('').trim();
      const parsed = JSON.parse(raw.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim());
      groups = (parsed.groups || []).filter(g => g.ids && g.ids.length >= 2);
    } catch (e) {
      return res.status(200).json({ groups: [], message: 'Erreur de parsing : ' + e.message });
    }

    // Déduplique : une note ne peut être dans qu'un seul groupe
    const usedIds = new Set();
    const safeGroups = [];
    for (const group of groups) {
      const validIds = group.ids.filter(id => UUID.test(id) && !usedIds.has(id));
      if (validIds.length < 2) continue;
      validIds.forEach(id => usedIds.add(id));
      // Enrichir avec les titres des notes pour l'affichage
      safeGroups.push({
        ...group,
        ids: validIds,
        note_titles: validIds.map(id => titleById[id] || id),
      });
    }

    return res.status(200).json({ groups: safeGroups });
  }

  // ── POST : confirmer la fusion (applique les groupes fournis) ──────────────
  if (req.method === 'POST' && req.query.action === 'merge-confirm') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    const groups = Array.isArray(body?.groups) ? body.groups : [];
    if (!groups.length) return res.status(400).json({ error: 'Aucun groupe fourni.' });

    // Valider et dédupliquer
    const usedIds = new Set();
    const safeGroups = [];
    for (const group of groups) {
      if (!Array.isArray(group.ids)) continue;
      const validIds = group.ids.filter(id => UUID.test(id) && !usedIds.has(id));
      if (validIds.length < 2) continue;
      validIds.forEach(id => usedIds.add(id));
      safeGroups.push({ ...group, ids: validIds });
    }

    let mergedCount = 0;
    for (const group of safeGroups) {
      const [keepId, ...removeIds] = group.ids;
      await sql`
        UPDATE entries
        SET title   = ${group.merged_title   || null},
            summary = ${group.merged_summary || null}
        WHERE id = ${keepId}
      `;
      if (removeIds.length) {
        await sql`
          UPDATE entries SET archived = true
          WHERE id = ANY(${removeIds}::uuid[])
        `;
      }
      mergedCount += removeIds.length;
    }

    return res.status(200).json({ merged: mergedCount, groups: safeGroups.length });
  }

  // ── GET : liste des pièces jointes d'une entrée ──────────────────────────
  if (req.method === 'GET' && req.query.action === 'attachments') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    try {
      const rows = await sql`
        SELECT id, blob_url, filename, mime_type, size_bytes, created_at
        FROM attachments WHERE entry_id = ${id} ORDER BY created_at
      `;
      return res.status(200).json(rows);
    } catch {
      return res.status(200).json([]);
    }
  }

  // ── POST : upload pièce jointe ────────────────────────────────────────────
  if (req.method === 'POST' && req.query.action === 'upload-attachment') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN manquante.' });

    const form = formidable({ maxFileSize: 20 * 1024 * 1024 });
    const [, files] = await form.parse(req);

    const file = files.file?.[0];
    if (!file) return res.status(400).json({ error: 'Champ "file" manquant.' });

    const mime     = file.mimetype || 'application/octet-stream';
    const ALLOWED_MIME = /^(image|audio|video|text|application\/(pdf|json|zip|csv|msword|vnd\.))/;
    if (!ALLOWED_MIME.test(mime)) return res.status(400).json({ error: `Type de fichier non autorisé : ${mime}` });

    const buffer   = fs.readFileSync(file.filepath);
    const filename = (file.originalFilename || 'fichier').slice(0, 200);

    const blob = await put(`attachments/${id}/${Date.now()}-${filename}`, buffer, {
      access: 'public', contentType: mime,
    });

    try {
      const [att] = await sql`
        INSERT INTO attachments (entry_id, blob_url, filename, mime_type, size_bytes)
        VALUES (${id}, ${blob.url}, ${filename}, ${mime}, ${buffer.length})
        RETURNING id, blob_url, filename, mime_type, size_bytes, created_at
      `;
      return res.status(201).json(att);
    } catch (e) {
      return res.status(503).json({ error: 'Migration V3.6 non encore exécutée : ' + e.message });
    }
  }

  // ── DELETE : supprimer une pièce jointe ───────────────────────────────────
  if (req.method === 'DELETE' && req.query.action === 'attachment') {
    const { attId } = req.query;
    if (!attId || !UUID.test(attId)) return res.status(400).json({ error: 'attId invalide.' });
    try {
      const [att] = await sql`DELETE FROM attachments WHERE id = ${attId} RETURNING blob_url`;
      if (att) await deleteBlobs([att.blob_url]);
    } catch {}
    return res.status(200).json({ deleted: 1 });
  }

  // ── GET : transactions finance ───────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'finance') {
    try {
      // Dédoublonnage automatique (garde la première occurrence)
      await sql`
        DELETE FROM finance WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY date, REGEXP_REPLACE(TRIM(LOWER(label)), '\\s+', ' ', 'g'), ROUND(amount::numeric, 2)
              ORDER BY created_at
            ) AS rn
            FROM finance
          ) t WHERE rn > 1
        )
      `;
      // Correction catégories connues (idempotent)
      await sql`
        UPDATE finance SET cat = 'avance' WHERE cat != 'avance' AND (
          label ILIKE '%CHATEAU GOMBERT EXT%' OR
          label ILIKE '%LA BANQUE POSTAL%' OR
          label ILIKE '%MLE FALLERI LOUANE%'
        )
      `;
      await sql`
        UPDATE finance SET cat = 'tabac' WHERE cat != 'tabac' AND (
          label ILIKE '%TABAC%' OR label ILIKE '%Bar Tabac%' OR label ILIKE '%LE GALLIA%'
          OR label ILIKE '%SNC LE BERGERAC%' OR label ILIKE '%SAINT MICHEL%'
          OR label ILIKE '%IBEKA%' OR label ILIKE '%MAXIME FONTANGE%'
        )
      `;
      await sql`
        UPDATE finance SET cat = 'abonnement' WHERE cat != 'abonnement' AND (
          label ILIKE '%ANTHROPIC%' OR label ILIKE '%OPENAI%'
        )
      `;
      await sql`
        UPDATE finance SET cat = 'frais' WHERE cat != 'frais' AND (
          label ILIKE '%N26 - ATM%' OR label ILIKE '%N26 INSTANT SAVINGS%'
        )
      `;
      await sql`
        UPDATE finance SET cat = 'restaurant' WHERE cat != 'restaurant' AND (
          label ILIKE '%BOULANGERIE%'
        )
      `;
      const rows = await sql`
        SELECT id, date, label, amount::float AS amount, cat, note, created_at
        FROM finance
        ORDER BY date DESC, created_at DESC
        LIMIT 200
      `;
      const [agg] = await sql`
        SELECT
          COUNT(*)::int                                        AS count,
          COALESCE(SUM(amount)::float, 0)                    AS balance,
          COALESCE(SUM(CASE WHEN amount < 0 AND cat != 'avance' THEN ABS(amount) ELSE 0 END)::float, 0) AS total_spend
        FROM finance
      `;
      const balance    = agg.balance;
      const totalSpend = agg.total_spend;
      const dbCount    = agg.count;

      // Pareto sur toutes les dépenses récupérées (LIMIT 200) — hors avances remboursées
      const expenses = rows
        .filter(r => Number(r.amount) < 0 && r.cat !== 'avance')
        .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
      let cumul = 0;
      const paretoIds = new Set();
      for (const e of expenses) {
        cumul += Math.abs(Number(e.amount));
        paretoIds.add(String(e.id));
        if (cumul >= totalSpend * 0.8) break;
      }
      const transactions = rows.map(r => ({ ...r, pareto: paretoIds.has(String(r.id)) }));
      return res.status(200).json({ transactions, balance, totalSpend, paretoCount: paretoIds.size, dbCount });
    } catch (e) {
      return res.status(500).json({ transactions: [], balance: 0, totalSpend: 0, paretoCount: 0, dbCount: 0, error: e.message });
    }
  }

  // ── POST : import CSV N26 ────────────────────────────────────────────────
  if (req.method === 'POST' && req.query.action === 'finance_csv_upload') {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante.' });

    const form = formidable({ maxFileSize: 5 * 1024 * 1024 });
    const [, files] = await form.parse(req);
    const file = files.file?.[0];
    if (!file) return res.status(400).json({ error: 'Fichier CSV manquant (champ "file").' });

    const csvText = fs.readFileSync(file.filepath, 'utf-8');
    if (!csvText.trim()) return res.status(400).json({ error: 'Fichier CSV vide.' });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Tu reçois un export CSV N26. Détecte automatiquement le séparateur (virgule ou point-virgule) et le séparateur décimal (point ou virgule).
Extrais TOUTES les lignes de transactions et retourne un tableau JSON.

Catégories disponibles : alimentation, restaurant, tabac, transport, logement, loisirs, santé, shopping, abonnement, transfert, avance, revenu, frais, other

Règles de catégorisation :
- alimentation : courses, supermarchés, épiceries, boulangeries
  → "Boulangerie du Coin" = déjeuner au travail, "Jungle 13" = épicerie de nuit
- restaurant : restaurants, fast-food, cafés, bars (hors tabac), Uber Eats, Deliveroo
- tabac : tout établissement de tabac/presse/débit de tabac
  → "Bar Tabac Gombert", "Tabac de la Plage", "Tabac les 2 FR", "Le Gallia", "SNC LE BERGERAC", "Le Saint Michel", "IBEKA", "MAXIME FONTANGE" = débits de tabac
  → Tout libellé contenant "TABAC" ou "Tabac"
- transport : essence, parking, transports en commun, Uber (course), taxi, SNCF
- logement : loyer, charges, eau, électricité, gaz, assurance habitation
- loisirs : cinéma, jeux, concerts, divertissements → "SHOTGUN*" = concerts
- santé : pharmacie, médecin, sport, mutuelle
- shopping : vêtements, électronique, achats divers
- abonnement : abonnements récurrents
  → "ANTHROPIC" = abonnement Claude, "OPENAI" = abonnement/API ChatGPT
  → Netflix, Spotify, Free, SFR, Amazon Prime
- transfert : virements entre particuliers = dépenses réelles non remboursées
  → prénom seul (ex: "Juliann", "Antoine", "Sophie") = participation sorties/voyages, non remboursé
- avance : retraits cash remboursés directement = à exclure de l'analyse des dépenses
  → "CHATEAU GOMBERT EXT" = retrait cash pour Louane (remboursé)
  → "LA BANQUE POSTAL" = retrait cash pour Louane (remboursé)
  → "MLE FALLERI LOUANE" = remboursement reçu de Louane
- revenu : salaires, virements entrants importants
- frais : frais bancaires → "N26 - ATM Withdrawal Fee", "N26 INSTANT SAVINGS FEE"
- other : impôts, divers → "DRFIP ILLE ET VILAINE" = timbre fiscal, "LA BANQUE POSTAL" = retrait cash

Règles de format :
- amount : nombre décimal JS (ex: -12.5), négatif = dépense, positif = revenu
- Si le montant CSV utilise une virgule décimale (ex: "-12,50"), convertis en -12.5
- date au format YYYY-MM-DD
- label = libellé nettoyé, max 200 caractères
- Ignorer les lignes d'en-tête et les lignes sans montant numérique valide
- Réponds UNIQUEMENT avec le tableau JSON, sans markdown

Format attendu :
[{"date":"YYYY-MM-DD","label":"Libellé","amount":-12.5,"category":"alimentation"}]

CSV :
${csvText.slice(0, 12000)}`,
      }],
    });

    let transactions = [];
    try {
      const raw = msg.content[0].text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      transactions = JSON.parse(raw);
      if (!Array.isArray(transactions)) throw new Error('Pas un tableau JSON');
    } catch (e) {
      return res.status(422).json({ error: 'Parsing Claude échoué : ' + e.message });
    }

    // Vérifier que la table finance existe
    try {
      await sql`SELECT 1 FROM finance LIMIT 1`;
    } catch {
      return res.status(503).json({ error: 'Table finance introuvable — exécute la migration V3.7 dans Neon SQL Editor.' });
    }

    let inserted = 0;
    let firstError = null;
    for (const t of transactions) {
      if (!t.date || t.amount === undefined || !t.label) continue;
      const amt   = Number(t.amount);
      if (isNaN(amt)) continue;
      const date  = String(t.date).slice(0, 10);
      const label = String(t.label).slice(0, 200);
      const cat   = t.category || 'other';
      try {
        const r = await sql`
          INSERT INTO finance (date, label, amount, cat)
          VALUES (${date}, ${label}, ${amt}, ${cat})
          ON CONFLICT (date, label, amount) DO NOTHING
          RETURNING id
        `;
        if (r.length) inserted++;
      } catch (e) {
        if (!firstError) firstError = e.message;
      }
    }

    return res.status(200).json({ inserted, total: transactions.length, firstError });
  }

  // ── GET : lien d'authentification GoCardless ────────────────────────────
  if (req.method === 'GET' && req.query.action === 'bank_connect') {
    if (!process.env.GOCARDLESS_SECRET_KEY || !process.env.GOCARDLESS_SECRET_ID) {
      return res.status(500).json({ error: 'GOCARDLESS_SECRET_ID et GOCARDLESS_SECRET_KEY requis dans les variables Vercel.' });
    }
    try {
      const token = await gcToken();
      const [stored] = await sql`SELECT value FROM config WHERE key = 'gc_requisition_id' LIMIT 1`;
      if (stored?.value) {
        const check = await fetch(`${GC_BASE}/requisitions/${stored.value}/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await check.json();
        if (data.status === 'LN' && data.accounts?.length) {
          return res.status(200).json({ status: 'linked', accounts: data.accounts });
        }
        if (data.link) return res.status(200).json({ status: 'pending', link: data.link });
      }
      // Créer une nouvelle connexion
      const institutionId = process.env.GOCARDLESS_INSTITUTION_ID || 'N26_NTSBDEB1';
      const r = await fetch(`${GC_BASE}/requisitions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          redirect:       'https://eolys-assistant.vercel.app/finance',
          institution_id: institutionId,
          reference:      `vox-${Date.now()}`,
          user_language:  'FR',
        }),
      });
      const data = await r.json();
      if (!data.link) return res.status(500).json({ error: 'Échec création connexion.', detail: data });
      await sql`INSERT INTO config(key,value) VALUES('gc_requisition_id',${data.id}) ON CONFLICT(key) DO UPDATE SET value=${data.id},updated_at=NOW()`;
      return res.status(200).json({ status: 'pending', link: data.link });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : synchroniser les transactions GoCardless ──────────────────────
  if (req.method === 'POST' && req.query.action === 'bank_sync') {
    if (!process.env.GOCARDLESS_SECRET_KEY || !process.env.GOCARDLESS_SECRET_ID) {
      return res.status(500).json({ error: 'GOCARDLESS_SECRET_ID requis.' });
    }
    try {
      const token = await gcToken();
      const [stored] = await sql`SELECT value FROM config WHERE key = 'gc_requisition_id' LIMIT 1`;
      if (!stored?.value) return res.status(400).json({ error: 'Aucun compte connecté.' });

      const reqRes  = await fetch(`${GC_BASE}/requisitions/${stored.value}/`, { headers: { Authorization: `Bearer ${token}` } });
      const reqData = await reqRes.json();
      if (!reqData.accounts?.length) return res.status(400).json({ error: 'Connexion non finalisée.' });

      // Récupérer les transactions
      const allTxs = [];
      for (const accountId of reqData.accounts) {
        const txRes  = await fetch(`${GC_BASE}/accounts/${accountId}/transactions/`, { headers: { Authorization: `Bearer ${token}` } });
        const txData = await txRes.json();
        for (const t of (txData.transactions?.booked || [])) {
          allTxs.push({
            ext_id: t.transactionId || t.internalTransactionId || null,
            date:   t.bookingDate   || t.valueDate,
            label:  t.remittanceInformationUnstructured || t.creditorName || t.debtorName || 'Transaction',
            amount: parseFloat(t.transactionAmount?.amount || 0),
          });
        }
      }
      if (!allTxs.length) return res.status(200).json({ synced: 0, message: 'Aucune transaction récente.' });

      // Catégorisation Claude (batch)
      let cats = {};
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const catMsg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: `Catégorise chaque transaction (index|libellé|montant) dans : alimentation, transport, logement, loisirs, santé, shopping, restaurant, abonnement, revenu, other.\nRéponds UNIQUEMENT avec un JSON {"index":"catégorie"} sans markdown.\n\n${allTxs.map((t,i)=>`${i}|${t.label}|${t.amount}`).join('\n')}` }],
        });
        cats = JSON.parse(catMsg.content[0].text.trim());
      } catch {}

      // Upsert
      let inserted = 0;
      for (let i = 0; i < allTxs.length; i++) {
        const t = allTxs[i];
        if (!t.date) continue;
        const cat   = cats[String(i)] || 'other';
        const extId = t.ext_id || `gc-${t.date}-${i}`;
        try {
          const r = await sql`
            INSERT INTO finance (date, label, amount, cat, ext_id)
            VALUES (${t.date}, ${t.label}, ${t.amount}, ${cat}, ${extId})
            ON CONFLICT (ext_id) DO NOTHING RETURNING id
          `;
          if (r.length) inserted++;
        } catch {}
      }
      return res.status(200).json({ synced: inserted, total: allTxs.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST : re-catégoriser toutes les transactions existantes ────────────
  if (req.method === 'POST' && req.query.action === 'finance_recategorize') {
    try {
      const rows = await sql`SELECT id, label, amount::float AS amount FROM finance ORDER BY date DESC`;
      if (!rows.length) return res.status(200).json({ updated: 0 });
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const items = rows.map((r, i) => `${i}|${r.label}|${r.amount}`).join('\n');
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: `Catégorise chaque transaction selon les règles suivantes.

Catégories disponibles : alimentation, restaurant, tabac, transport, logement, loisirs, santé, shopping, abonnement, transfert, avance, revenu, frais, other

Règles :
- alimentation : courses, supermarchés, épiceries, boulangeries
  → "Boulangerie du Coin" = déjeuner au travail, "Jungle 13" = épicerie de nuit
- restaurant : restaurants, fast-food, cafés, bars (hors tabac), Uber Eats, Deliveroo
- tabac : tout établissement de tabac/presse
  → "Bar Tabac Gombert", "Tabac de la Plage", "Tabac les 2 FR", "Le Gallia", "SNC LE BERGERAC", "Le Saint Michel", "IBEKA", "MAXIME FONTANGE" = débits de tabac
  → Tout libellé contenant "TABAC" ou "Tabac"
- transport : essence, parking, transports, Uber (course), taxi, SNCF
- logement : loyer, charges, eau, électricité, gaz, assurance habitation
- loisirs : cinéma, jeux, concerts → "SHOTGUN*" = concerts
- santé : pharmacie, médecin, sport, mutuelle
- shopping : vêtements, électronique, achats divers
- abonnement : "ANTHROPIC" = Claude, "OPENAI" = ChatGPT, Netflix, Spotify, Free, SFR, Amazon Prime
- transfert : dépenses réelles non remboursées → prénom seul (ex: "Juliann") = participation sorties/voyages
- avance : retraits cash REMBOURSÉS, à exclure de l'analyse
  → "CHATEAU GOMBERT EXT" = retrait cash pour Louane (remboursé direct)
  → "LA BANQUE POSTAL" = retrait cash pour Louane (remboursé direct)
  → "MLE FALLERI LOUANE" = remboursement reçu de Louane
- revenu : salaires, virements entrants
- frais : "N26 - ATM Withdrawal Fee", "N26 INSTANT SAVINGS FEE", frais bancaires
- other : "DRFIP ILLE ET VILAINE" = timbre fiscal

Transactions (format index|libellé|montant) :
${items.slice(0, 12000)}

Réponds UNIQUEMENT avec un objet JSON {"index": "categorie"} pour TOUTES les lignes, sans markdown.` }],
      });
      const raw = msg.content[0].text.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
      const catMap = JSON.parse(raw);
      let updated = 0;
      for (const [idx, cat] of Object.entries(catMap)) {
        const row = rows[Number(idx)];
        if (!row) continue;
        const valid = ['alimentation','restaurant','tabac','transport','logement','loisirs','santé','sante','shopping','abonnement','transfert','revenu','frais','other'];
        const c = valid.includes(cat) ? cat : 'other';
        await sql`UPDATE finance SET cat = ${c} WHERE id = ${row.id}`;
        updated++;
      }
      return res.status(200).json({ updated });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE : vider toutes les transactions finance ───────────────────────
  if (req.method === 'DELETE' && req.query.action === 'finance_clear') {
    try {
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM finance`;
      await sql`TRUNCATE finance`;
      return res.status(200).json({ deleted: count ?? 0 });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── PATCH : note sur transaction finance ─────────────────────────────────
  // ── GET/PUT : solde actuel ────────────────────────────────────────────────
  if (req.query.action === 'finance_balance') {
    if (req.method === 'GET') {
      try {
        const [row] = await sql`SELECT value FROM config WHERE key = 'finance_balance' LIMIT 1`;
        if (!row) return res.status(200).json({ balance: null, updated_at: null });
        const data = JSON.parse(row.value);
        return res.status(200).json(data);
      } catch {
        return res.status(200).json({ balance: null, updated_at: null });
      }
    }
    if (req.method === 'PUT') {
      const { balance } = req.body || {};
      if (balance === undefined || isNaN(Number(balance))) return res.status(400).json({ error: 'Montant invalide.' });
      const data = JSON.stringify({ balance: Number(balance), updated_at: new Date().toISOString() });
      try {
        await sql`INSERT INTO config (key, value) VALUES ('finance_balance', ${data}) ON CONFLICT (key) DO UPDATE SET value = ${data}`;
        return res.status(200).json(JSON.parse(data));
      } catch {
        return res.status(503).json({ error: 'Table config introuvable.' });
      }
    }
  }

  if (req.method === 'PATCH' && req.query.action === 'finance_update') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    const { note } = req.body || {};
    try {
      const [row] = await sql`
        UPDATE finance SET note = ${note ?? null} WHERE id = ${id}
        RETURNING id, note
      `;
      if (!row) return res.status(404).json({ error: 'Transaction introuvable.' });
      return res.status(200).json(row);
    } catch {
      return res.status(503).json({ error: 'Migration V3.7 non encore exécutée dans Neon.' });
    }
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id, ids } = req.query;

    if (ids) {
      const list = ids.split(',').map(s => s.trim()).filter(s => UUID.test(s));
      if (!list.length) return res.status(400).json({ error: 'Aucun ID valide fourni.' });
      const rows = await sql`SELECT audio_url FROM entries WHERE id = ANY(${list}::uuid[])`;
      await sql`DELETE FROM entries WHERE id = ANY(${list}::uuid[])`;
      await deleteBlobs(rows.map(r => r.audio_url));
      return res.status(200).json({ deleted: list.length });
    }

    if (id) {
      if (!UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
      const rows = await sql`SELECT audio_url FROM entries WHERE id = ${id}`;
      await sql`DELETE FROM entries WHERE id = ${id}`;
      await deleteBlobs(rows.map(r => r.audio_url));
      return res.status(200).json({ deleted: 1 });
    }

    return res.status(400).json({ error: 'Paramètre id ou ids requis.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
