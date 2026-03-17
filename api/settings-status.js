/**
 * /api/settings-status
 * Retourne le statut des variables d'environnement (présentes/absentes, sans valeur)
 * et si Microsoft est configuré.
 */
import { cors, requireSession } from '../lib/auth.js';

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'TRIGGER_SECRET_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'INGEST_SECRET',
  'DASHBOARD_SECRET',
];

const MICROSOFT_VARS = [
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'MICROSOFT_TENANT_ID',
];

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  const allVars = [...REQUIRED_VARS, ...MICROSOFT_VARS];

  const vars = allVars.map(key => ({
    key,
    set: Boolean(process.env[key]),
  }));

  const microsoft_configured = MICROSOFT_VARS.every(k => Boolean(process.env[k]));

  return res.status(200).json({ vars, microsoft_configured });
}
