import { del } from '@vercel/blob';
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function deleteBlobs(urls) {
  const valid = urls.filter(Boolean);
  if (!valid.length) return;
  try { await del(valid); } catch (e) { console.warn('Blob delete ignoré :', e.message); }
}

export default async function handler(req, res) {
  cors(req, res, 'GET, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

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
  if (req.method === 'GET') {
    const entries = await sql`
      SELECT e.id, e.created_at, e.source, e.status,
             e.category, e.title, e.summary, e.tags, e.email_draft,
             e.error, e.pinned, e.archived, e.project_id,
             e.calendar_event, e.calendar_event_status,
             p.name  AS project_name,
             p.color AS project_color
      FROM entries e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.archived = false
      ORDER BY e.created_at DESC
      LIMIT 200
    `;

    if (entries.length) {
      const ids = entries.map(e => e.id);
      const itemRows = await sql`
        SELECT id, entry_id, type, text, done, due_date
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

    const { project_id } = req.body || {};
    if (project_id && !UUID.test(project_id)) return res.status(400).json({ error: 'project_id invalide.' });

    const [entry] = await sql`
      UPDATE entries SET project_id = ${project_id || null}
      WHERE id = ${id}
      RETURNING id, project_id
    `;
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });
    return res.status(200).json(entry);
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
