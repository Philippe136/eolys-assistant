import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  cors(req, res, 'PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  const { id } = req.query;
  if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });

  const { done } = req.body || {};
  if (typeof done !== 'boolean') {
    return res.status(400).json({ error: 'Champ "done" (boolean) requis.' });
  }

  const rows = await sql`
    UPDATE call_actions SET done = ${done}
    WHERE id = ${id}
    RETURNING id, done
  `;

  if (!rows.length) return res.status(404).json({ error: 'Action introuvable.' });
  return res.status(200).json(rows[0]);
}
