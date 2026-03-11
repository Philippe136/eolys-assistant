import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  const rows = await sql`
    SELECT
      i.id,
      i.type,
      i.text,
      i.done,
      i.due_date,
      i.position,
      e.id         AS entry_id,
      e.title      AS entry_title,
      e.category,
      e.tags,
      e.created_at AS entry_date
    FROM items i
    JOIN entries e ON e.id = i.entry_id
    WHERE e.status = 'done' AND e.archived = false
    ORDER BY
      i.done ASC,
      e.created_at DESC,
      i.position
  `;

  return res.status(200).json(rows);
}
