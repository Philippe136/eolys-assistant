/**
 * GET /api/migrate-v1-actions
 * Migration one-shot : backfille call_actions depuis le JSONB actions des appels V1.
 * N'insère que pour les appels qui ont des actions JSONB mais aucune ligne call_actions.
 * Idempotent : sûr à appeler plusieurs fois.
 */
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  // Sélectionner les appels avec actions JSONB non migrés
  const toMigrate = await sql`
    SELECT id, actions
    FROM calls
    WHERE status = 'done'
      AND jsonb_typeof(COALESCE(actions, 'null'::jsonb)) = 'array'
      AND jsonb_array_length(actions) > 0
      AND NOT EXISTS (SELECT 1 FROM call_actions ca WHERE ca.call_id = calls.id)
  `;

  if (!toMigrate.length) {
    return res.status(200).json({ migrated: 0, message: 'Aucun appel à migrer.' });
  }

  let migrated = 0;
  let errors   = 0;

  for (const call of toMigrate) {
    try {
      const actions = Array.isArray(call.actions) ? call.actions : JSON.parse(call.actions);
      for (let i = 0; i < actions.length; i++) {
        const text = typeof actions[i] === 'string' ? actions[i] : String(actions[i]);
        await sql`
          INSERT INTO call_actions (call_id, text, position)
          VALUES (${call.id}, ${text}, ${i})
          ON CONFLICT DO NOTHING
        `;
      }
      migrated++;
    } catch (e) {
      console.warn(`[migrate] Appel ${call.id} ignoré :`, e.message);
      errors++;
    }
  }

  return res.status(200).json({
    migrated,
    errors,
    message: `${migrated} appel(s) migré(s)${errors ? `, ${errors} erreur(s)` : ''}.`,
  });
}
