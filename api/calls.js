import { del } from '@vercel/blob';
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Supprime les blobs Vercel associés à une liste d'URLs (silencieux si erreur). */
async function deleteBlobs(urls) {
  const valid = urls.filter(Boolean);
  if (!valid.length) return;
  try { await del(valid); } catch (e) { console.warn('Blob delete ignoré :', e.message); }
}

export default async function handler(req, res) {
  cors(req, res, 'GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  // ── GET : liste des entrées ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const entries = await sql`
      SELECT id, created_at, source, status,
             category, title, summary, tags, email_draft,
             error, pinned, archived
      FROM entries
      WHERE archived = false
      ORDER BY created_at DESC
      LIMIT 100
    `;

    // Enrichir avec les items
    if (entries.length) {
      const ids = entries.map(e => e.id);
      const itemRows = await sql`
        SELECT id, entry_id, type, text, done, due_date
        FROM items
        WHERE entry_id = ANY(${ids}::uuid[])
        ORDER BY entry_id, position
      `;
      const byEntry = {};
      for (const i of itemRows) {
        if (!byEntry[i.entry_id]) byEntry[i.entry_id] = [];
        byEntry[i.entry_id].push({ id: i.id, type: i.type, text: i.text, done: i.done, due_date: i.due_date });
      }
      for (const e of entries) e.action_items = byEntry[e.id] || [];
    }

    return res.status(200).json(entries);
  }

  // ── DELETE : suppression simple ou multiple ───────────────────────────────
  if (req.method === 'DELETE') {
    const { id, ids } = req.query;

    // Suppression multiple : DELETE /api/calls?ids=uuid1,uuid2,...
    if (ids) {
      const list = ids.split(',').map(s => s.trim()).filter(s => UUID.test(s));
      if (!list.length) return res.status(400).json({ error: 'Aucun ID valide fourni.' });
      const rows = await sql`SELECT audio_url FROM entries WHERE id = ANY(${list}::uuid[])`;
      await sql`DELETE FROM entries WHERE id = ANY(${list}::uuid[])`;
      await deleteBlobs(rows.map(r => r.audio_url));
      return res.status(200).json({ deleted: list.length });
    }

    // Suppression simple : DELETE /api/calls?id=uuid
    if (id) {
      if (!UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
      const rows = await sql`SELECT audio_url FROM entries WHERE id = ${id}`;
      await sql`DELETE FROM entries WHERE id = ${id}`;
      await deleteBlobs(rows.map(r => r.audio_url));
      return res.status(200).json({ deleted: 1 });
    }

    return res.status(400).json({ error: 'Paramètre id ou ids requis.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
