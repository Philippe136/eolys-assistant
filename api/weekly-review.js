/**
 * /api/weekly-review
 * GET                        → dernière rétrospective + historique (8 dernières semaines)
 * GET ?action=settings       → statut des variables d'env
 * GET ?action=patterns&days= → analyse comportementale agrégée (défaut: 30j)
 * GET ?resource=context      → liste les entités de contexte (ex-context.js)
 * POST ?resource=context     → crée une entité
 * PATCH ?resource=context&id=→ met à jour une entité
 * DELETE ?resource=context&id=→ supprime une entité
 * POST                       → déclenche manuellement la génération
 */
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';
import Anthropic from '@anthropic-ai/sdk';
import { WEEKLY_REVIEW_PROMPT, PATTERNS_PROMPT, RADAR_PROMPT, IMPROVE_PROMPT } from '../lib/prompts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL',
  'TRIGGER_SECRET_KEY', 'BLOB_READ_WRITE_TOKEN', 'INGEST_SECRET', 'DASHBOARD_SECRET',
];
const MICROSOFT_VARS = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID'];

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  // ── Context entities CRUD (?resource=context) ─────────────────────────────
  if (req.query.resource === 'context') {
    if (req.method === 'GET') {
      let entities;
      try {
        entities = await sql`
          SELECT id, alias, real_name, relation, notes, type, created_at, updated_at
          FROM context_entities ORDER BY type ASC, lower(alias) ASC
        `;
      } catch (colErr) {
        // Colonne type absente (migration V3.5 non encore exécutée) — fallback
        entities = await sql`
          SELECT id, alias, real_name, relation, notes, 'personne' AS type, created_at, updated_at
          FROM context_entities ORDER BY lower(alias) ASC
        `;
      }
      return res.status(200).json(entities);
    }
    if (req.method === 'POST') {
      const { alias, real_name, relation, notes, type } = req.body || {};
      if (!alias?.trim()) return res.status(400).json({ error: 'alias requis.' });
      const validTypes = ['personne','lieu','ambition','envie','entourage','reference'];
      const safeType = validTypes.includes(type) ? type : 'personne';
      try {
        const [entity] = await sql`
          INSERT INTO context_entities (alias, real_name, relation, notes, type)
          VALUES (${alias.trim()}, ${real_name?.trim() || null}, ${relation?.trim() || null}, ${notes?.trim() || null}, ${safeType})
          RETURNING *
        `;
        return res.status(201).json(entity);
      } catch (e) {
        if (e.message.includes('unique')) return res.status(409).json({ error: `L'alias "${alias}" existe déjà.` });
        throw e;
      }
    }
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
      const { alias, real_name, relation, notes, type } = req.body || {};
      if (!alias?.trim()) return res.status(400).json({ error: 'alias requis.' });
      const validTypes2 = ['personne','lieu','ambition','envie','entourage','reference'];
      const safeType2 = validTypes2.includes(type) ? type : 'personne';
      try {
        const [entity] = await sql`
          UPDATE context_entities
          SET alias = ${alias.trim()}, real_name = ${real_name?.trim() || null},
              relation = ${relation?.trim() || null}, notes = ${notes?.trim() || null},
              type = ${safeType2}, updated_at = NOW()
          WHERE id = ${id} RETURNING *
        `;
        if (!entity) return res.status(404).json({ error: 'Entité introuvable.' });
        return res.status(200).json(entity);
      } catch (e) {
        if (e.message.includes('unique')) return res.status(409).json({ error: `L'alias "${alias}" est déjà utilisé.` });
        throw e;
      }
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
      await sql`DELETE FROM context_entities WHERE id = ${id}`;
      return res.status(200).json({ deleted: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── GET ?action=settings : statut env vars ────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'settings') {
    const vars = [...REQUIRED_VARS, ...MICROSOFT_VARS].map(key => ({ key, set: Boolean(process.env[key]) }));
    return res.status(200).json({ vars, microsoft_configured: MICROSOFT_VARS.every(k => Boolean(process.env[k])) });
  }

  // ── GET ?action=radar : signaux faibles proactifs ────────────────────────
  if (req.method === 'GET' && req.query.action === 'radar') {
    const [overdueItems, stagnantItems, hotTags, silentProjects, weeklyVol, pendingCount] = await Promise.all([
      // Tâches avec deadline dépassée
      sql`
        SELECT i.text, i.due, e.title, e.category
        FROM items i JOIN entries e ON i.entry_id = e.id
        WHERE i.status != 'done' AND i.due IS NOT NULL AND i.due < CURRENT_DATE
        ORDER BY i.due ASC LIMIT 10
      `,
      // Tâches en attente depuis >7 jours
      sql`
        SELECT i.text, e.title, e.created_at
        FROM items i JOIN entries e ON i.entry_id = e.id
        WHERE i.status != 'done' AND i.type = 'task'
          AND e.created_at < NOW() - INTERVAL '7 days'
        ORDER BY e.created_at ASC LIMIT 10
      `,
      // Tags récurrents (14 derniers jours)
      sql`
        SELECT tag, COUNT(*)::int AS count
        FROM entries, unnest(tags) AS tag
        WHERE created_at > NOW() - INTERVAL '14 days' AND status = 'done'
        GROUP BY tag HAVING COUNT(*) >= 2
        ORDER BY count DESC LIMIT 8
      `,
      // Projets sans activité récente (>14 jours)
      sql`
        SELECT p.name, MAX(e.created_at)::text AS last_entry
        FROM projects p
        LEFT JOIN entries e ON e.project_id = p.id
        WHERE p.archived_at IS NULL
        GROUP BY p.id, p.name
        HAVING MAX(e.created_at) IS NULL OR MAX(e.created_at) < NOW() - INTERVAL '14 days'
        ORDER BY last_entry ASC NULLS FIRST LIMIT 5
      `,
      // Volume hebdomadaire (4 dernières semaines)
      sql`
        SELECT DATE_TRUNC('week', created_at AT TIME ZONE 'Europe/Paris')::date AS week,
               COUNT(*)::int AS count
        FROM entries WHERE status = 'done' AND created_at > NOW() - INTERVAL '4 weeks'
        GROUP BY week ORDER BY week DESC
      `,
      // Total tâches non terminées
      sql`
        SELECT COUNT(*)::int AS total
        FROM items i JOIN entries e ON i.entry_id = e.id
        WHERE i.status != 'done' AND i.type = 'task'
      `,
    ]);

    const total = pendingCount[0]?.total ?? 0;
    const daysSince = t => t ? Math.round((Date.now() - new Date(t)) / 86400000) : null;

    const report = [
      overdueItems.length
        ? `TÂCHES EN RETARD (deadline dépassée) : ${overdueItems.length}\n` +
          overdueItems.map(i => `  - "${i.text}" (échéance: ${i.due}, note: "${i.title}")`).join('\n')
        : 'TÂCHES EN RETARD : aucune',

      stagnantItems.length
        ? `TÂCHES EN ATTENTE >7 JOURS : ${stagnantItems.length}\n` +
          stagnantItems.slice(0, 5).map(i => `  - "${i.text}" (${daysSince(i.created_at)}j)`).join('\n')
        : 'TÂCHES EN ATTENTE >7 JOURS : aucune',

      `TOTAL TÂCHES NON TERMINÉES : ${total}`,

      hotTags.length
        ? `SUJETS RÉCURRENTS (14 derniers jours) :\n  ` + hotTags.map(t => `"${t.tag}" x${t.count}`).join(', ')
        : 'SUJETS RÉCURRENTS : aucun tag répété',

      silentProjects.length
        ? `PROJETS SILENCIEUX (>14 jours sans note) : ${silentProjects.length}\n` +
          silentProjects.map(p => `  - "${p.name}" (${p.last_entry ? `${daysSince(p.last_entry)}j` : 'jamais'})`).join('\n')
        : 'PROJETS SILENCIEUX : aucun',

      weeklyVol.length
        ? `VOLUME HEBDOMADAIRE (du plus récent) : ` + weeklyVol.map(w => `${w.count} notes`).join(', ')
        : 'VOLUME HEBDOMADAIRE : données insuffisantes',
    ].join('\n\n');

    let analysis = null;
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system:     RADAR_PROMPT,
        messages:   [{ role: 'user', content: report }],
      });
      const raw = msg.content.map(b => b.text || '').join('');
      try { analysis = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { analysis = null; }
    }

    return res.status(200).json({
      analysis,
      raw_data: { overdueItems, stagnantItems, hotTags, silentProjects, weeklyVol, pending_total: total },
      generated_at: new Date().toISOString(),
    });
  }

  // ── GET ?action=patterns : analyse comportementale ───────────────────────
  if (req.method === 'GET' && req.query.action === 'patterns') {
    const days  = parseInt(req.query.days || '30', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // Agrégations SQL parallèles
    const [byHour, byDow, byCategory, topTags, completionRaw, totalRaw] = await Promise.all([
      sql`
        SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Europe/Paris')::int AS hour, COUNT(*)::int AS count
        FROM entries WHERE status = 'done' AND created_at >= ${since.toISOString()}
        GROUP BY hour ORDER BY hour
      `,
      sql`
        SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'Europe/Paris')::int AS dow, COUNT(*)::int AS count
        FROM entries WHERE status = 'done' AND created_at >= ${since.toISOString()}
        GROUP BY dow ORDER BY dow
      `,
      sql`
        SELECT category, COUNT(*)::int AS count
        FROM entries WHERE status = 'done' AND created_at >= ${since.toISOString()}
        GROUP BY category ORDER BY count DESC
      `,
      sql`
        SELECT tag, COUNT(*)::int AS count
        FROM entries, unnest(tags) AS tag
        WHERE status = 'done' AND created_at >= ${since.toISOString()}
        GROUP BY tag ORDER BY count DESC LIMIT 10
      `,
      sql`
        SELECT COUNT(*)::int AS done
        FROM items i JOIN entries e ON i.entry_id = e.id
        WHERE i.status = 'done' AND e.created_at >= ${since.toISOString()}
      `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM items i JOIN entries e ON i.entry_id = e.id
        WHERE e.created_at >= ${since.toISOString()}
      `,
    ]);

    const totalEntries = byCategory.reduce((s, r) => s + r.count, 0);
    const totalItems   = totalRaw[0]?.total ?? 0;
    const doneItems    = completionRaw[0]?.done ?? 0;
    const completionPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null;

    const stats = {
      period_days: days,
      total_entries: totalEntries,
      by_hour: byHour,
      by_dow: byDow,
      by_category: byCategory,
      top_tags: topTags,
      items_total: totalItems,
      items_done: doneItems,
      completion_pct: completionPct,
    };

    // Appel Claude pour les insights narratifs
    let insights = null;
    if (totalEntries >= 3 && process.env.ANTHROPIC_API_KEY) {
      const DOW_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const statsText = [
        `Période : ${days} derniers jours — ${totalEntries} notes enregistrées.`,
        `Par heure : ${byHour.map(r => `${r.hour}h=${r.count}`).join(', ')}`,
        `Par jour : ${byDow.map(r => `${DOW_NAMES[r.dow]}=${r.count}`).join(', ')}`,
        `Par catégorie : ${byCategory.map(r => `${r.category}=${r.count}`).join(', ')}`,
        `Top tags : ${topTags.map(r => `${r.tag}(${r.count})`).join(', ')}`,
        completionPct !== null ? `Taux complétion tâches : ${completionPct}% (${doneItems}/${totalItems})` : 'Pas de tâches sur la période.',
      ].join('\n');

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:     PATTERNS_PROMPT,
        messages:   [{ role: 'user', content: statsText }],
      });
      const raw = msg.content.map(b => b.text || '').join('');
      try { insights = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { insights = null; }
    }

    return res.status(200).json({ stats, insights });
  }

  // ── GET ?action=improve : auto-amélioration Vox ──────────────────────────
  if (req.method === 'GET' && req.query.action === 'improve') {
    const days  = parseInt(req.query.days || '60', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [
      totalEntries, byCategory, bySource, modeUsage,
      taskStats, stagnantCount, completionByCategory,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int AS total FROM entries WHERE status='done' AND created_at >= ${since.toISOString()}`,
      sql`
        SELECT category, COUNT(*)::int AS count
        FROM entries WHERE status='done' AND created_at >= ${since.toISOString()}
        GROUP BY category ORDER BY count DESC
      `,
      sql`
        SELECT source, COUNT(*)::int AS count
        FROM entries WHERE status='done' AND created_at >= ${since.toISOString()}
        GROUP BY source ORDER BY count DESC
      `,
      sql`
        SELECT COALESCE(tags[1], 'standard') AS mode, COUNT(*)::int AS count
        FROM entries WHERE status='done' AND created_at >= ${since.toISOString()} AND source='text'
        GROUP BY mode ORDER BY count DESC LIMIT 6
      `,
      sql`
        SELECT COUNT(*)::int AS total,
               SUM(CASE WHEN i.status='done' THEN 1 ELSE 0 END)::int AS done
        FROM items i JOIN entries e ON i.entry_id = e.id
        WHERE i.type='task' AND e.created_at >= ${since.toISOString()}
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM items i JOIN entries e ON i.entry_id = e.id
        WHERE i.status!='done' AND i.type='task'
          AND e.created_at < NOW() - INTERVAL '14 days'
      `,
      sql`
        SELECT e.category,
               COUNT(i.id)::int AS total_tasks,
               SUM(CASE WHEN i.status='done' THEN 1 ELSE 0 END)::int AS done_tasks
        FROM entries e JOIN items i ON i.entry_id = e.id
        WHERE i.type='task' AND e.created_at >= ${since.toISOString()} AND e.status='done'
        GROUP BY e.category ORDER BY total_tasks DESC
      `,
    ]);

    const total       = totalEntries[0]?.total ?? 0;
    const taskTotal   = taskStats[0]?.total ?? 0;
    const taskDone    = taskStats[0]?.done ?? 0;
    const completionPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : null;

    const statsText = [
      `Période analysée : ${days} derniers jours`,
      `Total notes : ${total}`,
      `Sources : ${bySource.map(s => `${s.source}=${s.count}`).join(', ')}`,
      `Par catégorie : ${byCategory.map(c => `${c.category}=${c.count}`).join(', ')}`,
      completionPct !== null
        ? `Tâches : ${taskTotal} total, ${taskDone} complétées (${completionPct}%)`
        : 'Tâches : aucune sur la période',
      stagnantCount[0]?.count
        ? `Tâches bloquées depuis >14 jours : ${stagnantCount[0].count}`
        : 'Tâches bloquées : aucune',
      completionByCategory.length
        ? `Complétion par catégorie :\n${completionByCategory.map(c =>
            `  ${c.category}: ${c.done_tasks}/${c.total_tasks} (${Math.round((c.done_tasks/c.total_tasks)*100)}%)`
          ).join('\n')}`
        : '',
    ].filter(Boolean).join('\n');

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(200).json({ insights: null, stats: { total, byCategory, taskTotal, taskDone, completionPct } });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system:     IMPROVE_PROMPT,
      messages:   [{ role: 'user', content: statsText }],
    });
    const raw = msg.content.map(b => b.text || '').join('');
    let insights = null;
    try { insights = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { insights = null; }

    return res.status(200).json({
      insights,
      stats: { total, byCategory, bySource, taskTotal, taskDone, completionPct, stagnant: stagnantCount[0]?.count ?? 0 },
      period_days: days,
      generated_at: new Date().toISOString(),
    });
  }

  // ── GET : historique ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, week_start, entry_count, data, created_at
      FROM weekly_reviews
      ORDER BY week_start DESC
      LIMIT 8
    `;
    return res.status(200).json(rows);
  }

  // ── POST : génération manuelle ────────────────────────────────────────────
  if (req.method === 'POST') {
    const days  = parseInt(req.query.days || '7', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const entries = await sql`
      SELECT title, summary, category, created_at
      FROM entries
      WHERE status = 'done' AND created_at >= ${since.toISOString()}
      ORDER BY created_at ASC
    `;

    if (!entries.length) {
      return res.status(200).json({ skipped: true, reason: 'Aucune note sur cette période' });
    }

    const digest = entries.map(e => {
      const date = new Date(e.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return `[${e.category}] ${date} — ${e.title} : ${e.summary}`;
    }).join('\n');

    const weekStartStr = since.toISOString().slice(0, 10);
    const period = `${since.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} → aujourd'hui`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system:     WEEKLY_REVIEW_PROMPT,
      messages:   [{ role: 'user', content: `Semaine : ${period}\n\nNotes :\n${digest}` }],
    });

    const raw    = message.content.map(b => b.text || '').join('');
    const review = JSON.parse(raw.replace(/```json|```/g, '').trim());

    await sql`
      INSERT INTO weekly_reviews (week_start, entry_count, data)
      VALUES (${weekStartStr}, ${entries.length}, ${JSON.stringify(review)})
      ON CONFLICT (week_start)
      DO UPDATE SET data = ${JSON.stringify(review)}, entry_count = ${entries.length}, created_at = NOW()
    `;

    return res.status(200).json({ ok: true, review, entryCount: entries.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
