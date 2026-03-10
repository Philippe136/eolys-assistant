import { cors, requireWebOrigin } from '../lib/auth.js';
import { SYSTEM_PROMPT } from '../lib/prompts.js';

export default async function handler(req, res) {
  cors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Restreint aux appels provenant de notre propre UI web
  if (!requireWebOrigin(req, res)) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' });

  try {
    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Payload invalide : champ messages requis.' });
    }

    // Modèle, max_tokens et prompt système forcés côté serveur — non modifiables par le client
    const payload = {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system:     SYSTEM_PROMPT,
      messages,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Erreur /api/claude:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}
