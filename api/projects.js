import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  const projects = await sql`
    SELECT
      c.project_name,
      COUNT(c.id)::int                                                       AS call_count,
      MAX(c.created_at)                                                      AS last_call_at,
      SUM(CASE WHEN c.status = 'done'       THEN 1 ELSE 0 END)::int         AS done_calls,
      SUM(CASE WHEN c.status = 'processing' THEN 1 ELSE 0 END)::int         AS processing_calls,
      SUM(CASE WHEN c.status = 'error'      THEN 1 ELSE 0 END)::int         AS error_calls,
      COALESCE(SUM(ca_stats.total_actions),  0)::int                         AS total_actions,
      COALESCE(SUM(ca_stats.done_actions),   0)::int                         AS done_actions
    FROM calls c
    LEFT JOIN (
      SELECT
        call_id,
        COUNT(*)::int                                       AS total_actions,
        SUM(CASE WHEN done THEN 1 ELSE 0 END)::int         AS done_actions
      FROM call_actions
      GROUP BY call_id
    ) ca_stats ON ca_stats.call_id = c.id
    GROUP BY c.project_name
    ORDER BY last_call_at DESC NULLS LAST
  `;

  return res.status(200).json(projects);
}
