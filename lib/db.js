import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL manquante dans les variables Vercel');
}

export const sql = neon(process.env.DATABASE_URL);
