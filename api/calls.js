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

    // Enrichir avec les actions cochables (V2)
    if (calls.length) {
      const ids = calls.map(c => c.id);
      const actionRows = await sql`
        SELECT id, call_id, text, done
        FROM call_actions
        WHERE call_id = ANY(${ids}::uuid[])
        ORDER BY call_id, position
      `;
      const byCall = {};
      for (const a of actionRows) {
        if (!byCall[a.call_id]) byCall[a.call_id] = [];
        byCall[a.call_id].push({ id: a.id, text: a.text, done: a.done });
      }
      for (const c of calls) c.action_items = byCall[c.id] || [];
    }

    return res.status(200).json(calls);
  }

  // ── DELETE : suppression simple ou multiple ───────────────────────────────
  if (req.method === 'DELETE') {
    const { id, ids } = req.query;

    // Suppression multiple : DELETE /api/calls?ids=uuid1,uuid2,...
    if (ids) {
      const list = ids.split(',').map(s => s.trim()).filter(s => UUID.test(s));
      if (!list.length) return res.status(400).json({ error: 'Aucun ID valide fourni.' });
      const rows = await sql`SELECT audio_url FROM calls WHERE id = ANY(${list}::uuid[])`;
      await sql`DELETE FROM calls WHERE id = ANY(${list}::uuid[])`;
      await deleteBlobs(rows.map(r => r.audio_url));
      return res.status(200).json({ deleted: list.length });
    }

    // Suppression simple : DELETE /api/calls?id=uuid
    if (id) {
      if (!UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });
      const rows = await sql`SELECT audio_url FROM calls WHERE id = ${id}`;
      await sql`DELETE FROM calls WHERE id = ${id}`;
      await deleteBlobs(rows.map(r => r.audio_url));
      return res.status(200).json({ deleted: 1 });
    }

    return res.status(400).json({ error: 'Paramètre id ou ids requis.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
