import { cors } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  cors(req, res, 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // ── GET : liste des appels ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const calls = await sql`
      SELECT id, created_at, call_type, project_name, status,
             titre, resume, actions, email, trello_url,
             outlook_draft_id, outlook_draft_url, error
      FROM calls
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return res.status(200).json(calls);
  }

  // ── DELETE : suppression simple ou multiple ───────────────────────────────
  if (req.method === 'DELETE') {
    const { id, ids } = req.query;

    // Suppression multiple : DELETE /api/calls?ids=uuid1,uuid2,...
    if (ids) {
      const list = ids.split(',').map(s => s.trim()).filter(s => UUID.test(s));
      if (!list.length) return res.status(400).json({ error: 'Aucun ID valide fourni.' });
      await sql`DELETE FROM calls WHERE id = ANY(${list}::uuid[])`;
      return res.status(200).json({ deleted: list.length });
    }

    // Suppression simple : DELETE /api/calls?id=uuid
    if (id) {
      if (!UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
      await sql`DELETE FROM calls WHERE id = ${id}`;
      return res.status(200).json({ deleted: 1 });
    }

    return res.status(400).json({ error: 'Paramètre id ou ids requis.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
