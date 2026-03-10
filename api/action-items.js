import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  const rows = await sql`
    SELECT
      ca.id,
      ca.text,
      ca.done,
      ca.position,
      c.id         AS call_id,
      c.titre      AS call_titre,
      c.call_type,
      c.project_name,
      c.created_at AS call_date
    FROM call_actions ca
    JOIN calls c ON c.id = ca.call_id
    WHERE c.status = 'done'
    ORDER BY
      c.project_name NULLS LAST,
      ca.done ASC,
      c.created_at DESC,
      ca.position
  `;

  return res.status(200).json(rows);
}
