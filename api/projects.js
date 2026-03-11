import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  const projects = await sql`
    SELECT
      t.tag,
      COUNT(DISTINCT e.id)::int                                               AS entry_count,
      MAX(e.created_at)                                                       AS last_entry_at,
      SUM(CASE WHEN e.status = 'done'       THEN 1 ELSE 0 END)::int          AS done_entries,
      SUM(CASE WHEN e.status = 'processing' THEN 1 ELSE 0 END)::int          AS processing_entries,
      SUM(CASE WHEN e.status = 'error'      THEN 1 ELSE 0 END)::int          AS error_entries,
      COALESCE(SUM(i_stats.total_items),   0)::int                            AS total_items,
      COALESCE(SUM(i_stats.done_items),    0)::int                            AS done_items
    FROM entries e
    CROSS JOIN LATERAL unnest(e.tags) AS t(tag)
    LEFT JOIN (
      SELECT
        entry_id,
        COUNT(*)::int                                       AS total_items,
        SUM(CASE WHEN done THEN 1 ELSE 0 END)::int         AS done_items
      FROM items
      GROUP BY entry_id
    ) i_stats ON i_stats.entry_id = e.id
    WHERE e.archived = false AND array_length(e.tags, 1) > 0
    GROUP BY t.tag
    ORDER BY last_entry_at DESC NULLS LAST
  `;

  return res.status(200).json(projects);
}
