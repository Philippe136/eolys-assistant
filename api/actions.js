import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  cors(req, res, 'GET, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  // ── GET : liste tous les items ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT
        i.id, i.type, i.text, i.done, i.due_date, i.position,
        e.id         AS entry_id,
        e.title      AS entry_title,
        e.category,
        e.tags,
        e.created_at AS entry_date
      FROM items i
      JOIN entries e ON e.id = i.entry_id
      WHERE e.status = 'done' AND e.archived = false
      ORDER BY i.done ASC, e.created_at DESC, i.position
    `;
    return res.status(200).json(rows);
  }

  // ── PATCH : toggle done ────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    const { done } = req.body || {};
    if (typeof done !== 'boolean') return res.status(400).json({ error: 'Champ "done" (boolean) requis.' });
    const rows = await sql`UPDATE items SET done = ${done} WHERE id = ${id} RETURNING id, done`;
    if (!rows.length) return res.status(404).json({ error: 'Action introuvable.' });
    return res.status(200).json(rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
