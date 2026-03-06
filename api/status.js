import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { callId } = req.query;
  if (!callId) return res.status(400).json({ error: 'Paramètre callId manquant.' });

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL manquante dans Vercel → ajouter dans Settings > Environment Variables' });
  }

  try {
    const sql    = neon(process.env.DATABASE_URL);
    const [call] = await sql`SELECT * FROM calls WHERE id = ${callId} LIMIT 1`;

    if (!call) return res.status(404).json({ error: 'Appel introuvable.' });

    return res.status(200).json(call);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
