import { tasks } from '@trigger.dev/sdk/v3';
import { cors } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  cors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const [entry] = await sql`
      SELECT id, audio_url, status FROM entries WHERE id = ${id}
    `;
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });
    if (!entry.audio_url) return res.status(400).json({ error: 'Pas d\'audio associé à cette entrée.' });

    // Remettre en processing + déclencher le job
    await sql`UPDATE entries SET status = 'processing', error = NULL WHERE id = ${id}`;

    const handle = await tasks.trigger('process-call', {
      callId:   entry.id,
      audioUrl: entry.audio_url,
    });

    await sql`UPDATE entries SET job_id = ${handle.id} WHERE id = ${id}`;

    return res.status(200).json({ success: true, jobId: handle.id });
  } catch (err) {
    console.error('Erreur /api/retry:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
