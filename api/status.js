import { cors } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { callId } = req.query;
  if (!callId) return res.status(400).json({ error: 'Paramètre callId manquant.' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(callId)) return res.status(400).json({ error: 'callId invalide.' });

  try {
    const [entry] = await sql`
      SELECT id, created_at, source, status,
             category, title, summary, tags, email_draft, error
      FROM entries WHERE id = ${callId} LIMIT 1
    `;

    if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });

    return res.status(200).json(entry);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
