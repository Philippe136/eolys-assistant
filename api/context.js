import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  // ── GET : liste toutes les entités ───────────────────────────────────────
  if (req.method === 'GET') {
    const entities = await sql`
      SELECT id, alias, real_name, relation, notes, created_at, updated_at
      FROM context_entities
      ORDER BY lower(alias) ASC
    `;
    return res.status(200).json(entities);
  }

  // ── POST : créer une entité ───────────────────────────────────────────────
  if (req.method === 'POST') {
    const { alias, real_name, relation, notes } = req.body || {};
    if (!alias?.trim()) return res.status(400).json({ error: 'alias requis.' });

    try {
      const [entity] = await sql`
        INSERT INTO context_entities (alias, real_name, relation, notes)
        VALUES (${alias.trim()}, ${real_name?.trim() || null}, ${relation?.trim() || null}, ${notes?.trim() || null})
        RETURNING *
      `;
      return res.status(201).json(entity);
    } catch (e) {
      if (e.message.includes('unique')) return res.status(409).json({ error: `L'alias "${alias}" existe déjà.` });
      throw e;
    }
  }

  // ── PATCH : mettre à jour une entité ─────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });

    const { alias, real_name, relation, notes } = req.body || {};
    if (!alias?.trim()) return res.status(400).json({ error: 'alias requis.' });

    try {
      const [entity] = await sql`
        UPDATE context_entities
        SET alias      = ${alias.trim()},
            real_name  = ${real_name?.trim() || null},
            relation   = ${relation?.trim() || null},
            notes      = ${notes?.trim() || null},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!entity) return res.status(404).json({ error: 'Entité introuvable.' });
      return res.status(200).json(entity);
    } catch (e) {
      if (e.message.includes('unique')) return res.status(409).json({ error: `L'alias "${alias}" est déjà utilisé.` });
      throw e;
    }
  }

  // ── DELETE : supprimer une entité ─────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
    await sql`DELETE FROM context_entities WHERE id = ${id}`;
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
