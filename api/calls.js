import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL manquante' });

  const sql = neon(process.env.DATABASE_URL);
  const calls = await sql`
    SELECT id, created_at, call_type, project_name, status,
           titre, resume, actions, email, trello_url, error
    FROM calls
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return res.status(200).json(calls);
}
