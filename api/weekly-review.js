/**
 * /api/weekly-review
 * GET                   → dernière rétrospective + historique (8 dernières semaines)
 * GET ?action=settings  → statut des variables d'env (ex-settings-status.js)
 * POST                  → déclenche manuellement la génération
 */
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';
import Anthropic from '@anthropic-ai/sdk';
import { WEEKLY_REVIEW_PROMPT } from '../lib/prompts.js';

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DATABASE_URL',
  'TRIGGER_SECRET_KEY', 'BLOB_READ_WRITE_TOKEN', 'INGEST_SECRET', 'DASHBOARD_SECRET',
];
const MICROSOFT_VARS = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID'];

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  // ── GET ?action=settings : statut env vars ────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'settings') {
    const vars = [...REQUIRED_VARS, ...MICROSOFT_VARS].map(key => ({ key, set: Boolean(process.env[key]) }));
    return res.status(200).json({ vars, microsoft_configured: MICROSOFT_VARS.every(k => Boolean(process.env[k])) });
  }

  // ── GET : historique ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, week_start, entry_count, data, created_at
      FROM weekly_reviews
      ORDER BY week_start DESC
      LIMIT 8
    `;
    return res.status(200).json(rows);
  }

  // ── POST : génération manuelle ────────────────────────────────────────────
  if (req.method === 'POST') {
    const days  = parseInt(req.query.days || '7', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const entries = await sql`
      SELECT title, summary, category, created_at
      FROM entries
      WHERE status = 'done' AND created_at >= ${since.toISOString()}
      ORDER BY created_at ASC
    `;

    if (!entries.length) {
      return res.status(200).json({ skipped: true, reason: 'Aucune note sur cette période' });
    }

    const digest = entries.map(e => {
      const date = new Date(e.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return `[${e.category}] ${date} — ${e.title} : ${e.summary}`;
    }).join('\n');

    const weekStartStr = since.toISOString().slice(0, 10);
    const period = `${since.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} → aujourd'hui`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system:     WEEKLY_REVIEW_PROMPT,
      messages:   [{ role: 'user', content: `Semaine : ${period}\n\nNotes :\n${digest}` }],
    });

    const raw    = message.content.map(b => b.text || '').join('');
    const review = JSON.parse(raw.replace(/```json|```/g, '').trim());

    await sql`
      INSERT INTO weekly_reviews (week_start, entry_count, data)
      VALUES (${weekStartStr}, ${entries.length}, ${JSON.stringify(review)})
      ON CONFLICT (week_start)
      DO UPDATE SET data = ${JSON.stringify(review)}, entry_count = ${entries.length}, created_at = NOW()
    `;

    return res.status(200).json({ ok: true, review, entryCount: entries.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
