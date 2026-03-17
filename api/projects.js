import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  const { resource, id } = req.query;
  const isSpaces = resource === 'spaces';

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (isSpaces) {
      const spaces = await sql`SELECT * FROM spaces ORDER BY position, name`;
      return res.status(200).json(spaces);
    }

    const projects = await sql`
      SELECT
        p.id, p.name, p.description, p.color, p.status, p.position,
        p.space_id, p.created_at, p.updated_at,
        s.name  AS space_name,
        s.icon  AS space_icon,
        s.color AS space_color,
        COUNT(DISTINCT e.id)::int                                              AS entry_count,
        MAX(e.created_at)                                                      AS last_entry_at,
        COALESCE(SUM(CASE WHEN e.status='done' THEN 1 ELSE 0 END)::int, 0)    AS done_entries,
        COALESCE(SUM(i_s.total_items)::int, 0)                                AS total_items,
        COALESCE(SUM(i_s.done_items)::int,  0)                                AS done_items
      FROM projects p
      LEFT JOIN spaces s ON s.id = p.space_id
      LEFT JOIN entries e ON e.project_id = p.id AND e.archived = false
      LEFT JOIN (
        SELECT entry_id,
               COUNT(*)::int                               AS total_items,
               SUM(CASE WHEN done THEN 1 ELSE 0 END)::int AS done_items
        FROM items GROUP BY entry_id
      ) i_s ON i_s.entry_id = e.id
      WHERE p.status != 'archived'
      GROUP BY p.id, s.name, s.icon, s.color
      ORDER BY p.position, p.name
    `;
    return res.status(200).json(projects);
  }

  // ── POST ──────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};

    if (isSpaces) {
      const { name, icon = '📁', color = '#7a7268' } = body;
      if (!name?.trim()) return res.status(400).json({ error: 'Nom requis.' });
      const [space] = await sql`
        INSERT INTO spaces (name, icon, color, position)
        VALUES (${name.trim()}, ${icon}, ${color},
          (SELECT COALESCE(MAX(position)+1, 0) FROM spaces))
        RETURNING *
      `;
      return res.status(201).json(space);
    }

    const { name, space_id = null, description = null, color = '#c8410a', status = 'active' } = body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis.' });
    if (space_id && !UUID.test(space_id)) return res.status(400).json({ error: 'space_id invalide.' });

    const [project] = await sql`
      INSERT INTO projects (name, space_id, description, color, status, position)
      VALUES (${name.trim()}, ${space_id}, ${description}, ${color}, ${status},
        (SELECT COALESCE(MAX(position)+1, 0) FROM projects))
      RETURNING *
    `;
    return res.status(201).json(project);
  }

  // ── PUT ───────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    const body = req.body || {};

    if (isSpaces) {
      const { name, icon, color } = body;
      if (!name?.trim()) return res.status(400).json({ error: 'Nom requis.' });
      const [space] = await sql`
        UPDATE spaces SET
          name  = ${name.trim()},
          icon  = ${icon  || '📁'},
          color = ${color || '#7a7268'}
        WHERE id = ${id} RETURNING *
      `;
      if (!space) return res.status(404).json({ error: 'Espace introuvable.' });
      return res.status(200).json(space);
    }

    const { name, space_id, description, color, status } = body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis.' });

    const [project] = await sql`
      UPDATE projects SET
        name        = ${name.trim()},
        space_id    = ${space_id || null},
        description = ${description || null},
        color       = ${color  || '#c8410a'},
        status      = ${status || 'active'},
        updated_at  = NOW()
      WHERE id = ${id} RETURNING *
    `;
    if (!project) return res.status(404).json({ error: 'Projet introuvable.' });
    return res.status(200).json(project);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });

    if (isSpaces) {
      await sql`UPDATE projects SET space_id = NULL WHERE space_id = ${id}`;
      await sql`DELETE FROM spaces WHERE id = ${id}`;
      return res.status(200).json({ deleted: true });
    }

    await sql`DELETE FROM projects WHERE id = ${id}`;
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
