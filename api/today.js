import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const ago7d      = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
    const ago48h     = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Items en retard (due_date passée, non faits)
    const overdueItems = await sql`
      SELECT i.id, i.entry_id, i.type, i.text, i.done, i.due_date,
             e.title AS entry_title, e.project_id,
             p.name AS project_name, p.color AS project_color
      FROM items i
      JOIN entries e ON e.id = i.entry_id
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE i.done = false
        AND i.due_date IS NOT NULL
        AND i.due_date < ${todayStart}
        AND e.archived = false
      ORDER BY i.due_date ASC
      LIMIT 50
    `;

    // Items dus aujourd'hui (non faits)
    const todayItems = await sql`
      SELECT i.id, i.entry_id, i.type, i.text, i.done, i.due_date,
             e.title AS entry_title, e.project_id,
             p.name AS project_name, p.color AS project_color
      FROM items i
      JOIN entries e ON e.id = i.entry_id
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE i.done = false
        AND i.due_date >= ${todayStart}
        AND i.due_date < ${todayEnd}
        AND e.archived = false
      ORDER BY i.due_date ASC
      LIMIT 50
    `;

    // Tâches récentes sans date (7 derniers jours, non faites)
    const recentTasks = await sql`
      SELECT i.id, i.entry_id, i.type, i.text, i.done, i.due_date,
             e.title AS entry_title, e.project_id,
             p.name AS project_name, p.color AS project_color
      FROM items i
      JOIN entries e ON e.id = i.entry_id
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE i.done = false
        AND i.due_date IS NULL
        AND i.type = 'task'
        AND i.created_at >= ${ago7d}
        AND e.archived = false
      ORDER BY i.created_at DESC
      LIMIT 30
    `;

    // Idées récentes (48h)
    const recentIdeas = await sql`
      SELECT i.id, i.entry_id, i.type, i.text, i.done, i.due_date,
             e.title AS entry_title, e.project_id,
             p.name AS project_name, p.color AS project_color
      FROM items i
      JOIN entries e ON e.id = i.entry_id
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE i.type = 'idea'
        AND i.created_at >= ${ago48h}
        AND e.archived = false
      ORDER BY i.created_at DESC
      LIMIT 20
    `;

    // Nouvelles entrées (48h, status done)
    const newEntries = await sql`
      SELECT e.id, e.created_at, e.source, e.title, e.summary, e.category,
             e.tags, e.project_id,
             p.name AS project_name, p.color AS project_color
      FROM entries e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.status = 'done'
        AND e.created_at >= ${ago48h}
        AND e.archived = false
      ORDER BY e.created_at DESC
      LIMIT 20
    `;

    return res.status(200).json({
      overdueItems,
      todayItems,
      recentTasks,
      recentIdeas,
      newEntries,
      generatedAt: now.toISOString(),
    });

  } catch (err) {
    console.error('Erreur /api/today:', err);
    return res.status(500).json({ error: err.message ?? 'Erreur serveur.' });
  }
}
