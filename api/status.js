import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const MICROSOFT_VARS = [
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID',
];

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'TRIGGER_SECRET_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'INGEST_SECRET',
  'DASHBOARD_SECRET',
  ...MICROSOFT_VARS
];

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // On regarde si on demande les "settings" ou un "callId"
  const { type, callId } = req.query;

  // --- CAS A : On demande le statut des réglages (Settings) ---
  if (type === 'settings') {
    if (!requireSession(req, res)) return; // Sécurité

    const vars = REQUIRED_VARS.map(key => ({
      key,
      set: Boolean(process.env[key]),
    }));

    const microsoft_configured = MICROSOFT_VARS.every(k => Boolean(process.env[k]));

    return res.status(200).json({ vars, microsoft_configured });
  }

  // --- CAS B : On demande le statut d'un appel (CallId) ---
  if (!callId) {
      return res.status(400).json({ error: 'Paramètre callId ou type=settings manquant.' });
  }

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
