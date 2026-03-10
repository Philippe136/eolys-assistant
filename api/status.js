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
    const [call] = await sql`
      SELECT id, created_at, call_type, project_name, status,
             titre, resume, actions, email, trello_url,
             outlook_draft_id, outlook_draft_url, error
      FROM calls WHERE id = ${callId} LIMIT 1
    `;

    if (!call) return res.status(404).json({ error: 'Appel introuvable.' });

    return res.status(200).json(call);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
