import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';
import Anthropic from '@anthropic-ai/sdk';
import { AGENT_PROMPT } from '../lib/prompts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  // ── GET : liste tous les items ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT
        i.id, i.type, i.text, i.done, i.due_date, i.position,
        i.status, i.started_at, i.completed_at, i.agent_result,
        e.id         AS entry_id,
        e.title      AS entry_title,
        e.category,
        e.tags,
        e.created_at AS entry_date
      FROM items i
      JOIN entries e ON e.id = i.entry_id
      WHERE e.status = 'done' AND e.archived = false
      ORDER BY i.done ASC, e.created_at DESC, i.position
    `;
    return res.status(200).json(rows);
  }

  // ── POST ?action=execute : Claude exécute la tâche ────────────────────────
  if (req.method === 'POST' && req.query.action === 'execute') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });

    const [item] = await sql`
      SELECT i.id, i.text, i.type, e.title AS entry_title, e.summary AS entry_summary
      FROM items i
      JOIN entries e ON i.entry_id = e.id
      WHERE i.id = ${id}
    `;
    if (!item) return res.status(404).json({ error: 'Tâche introuvable.' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante.' });

    const anthropic = new Anthropic({ apiKey });
    const userContent = [
      item.entry_title ? `Contexte de l'enregistrement : "${item.entry_title}"` : '',
      item.entry_summary ? `Résumé : "${item.entry_summary}"` : '',
      `Tâche à exécuter : "${item.text}"`,
    ].filter(Boolean).join('\n');

    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system:     AGENT_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    });

    const result = msg.content.map(b => b.text || '').join('').trim();

    // Marquer en cours + sauvegarder résultat
    const [updated] = await sql`
      UPDATE items
      SET status       = 'in_progress',
          started_at   = COALESCE(started_at, NOW()),
          agent_result = ${result}
      WHERE id = ${id}
      RETURNING id, status, started_at, agent_result
    `;

    return res.status(200).json({ result, item: updated });
  }

  // ── PATCH : mettre à jour statut / done ───────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id || !UUID.test(id)) return res.status(400).json({ error: 'ID invalide.' });

    const { done, status } = req.body || {};
    const VALID_STATUSES = ['todo', 'in_progress', 'done'];

    // Mise à jour par status (3 états)
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Status invalide.' });
      const isDone = status === 'done';
      const [row] = await sql`
        UPDATE items SET
          status       = ${status},
          done         = ${isDone},
          started_at   = CASE
                           WHEN ${status} = 'in_progress' AND started_at IS NULL THEN NOW()
                           ELSE started_at
                         END,
          completed_at = CASE
                           WHEN ${status} = 'done'  THEN NOW()
                           WHEN ${status} != 'done' THEN NULL
                           ELSE completed_at
                         END
        WHERE id = ${id}
        RETURNING id, status, done, started_at, completed_at
      `;
      if (!row) return res.status(404).json({ error: 'Action introuvable.' });
      return res.status(200).json(row);
    }

    // Rétrocompat : mise à jour par booléen done
    if (typeof done === 'boolean') {
      const newStatus = done ? 'done' : 'todo';
      const [row] = await sql`
        UPDATE items SET
          done         = ${done},
          status       = ${newStatus},
          completed_at = CASE WHEN ${done} THEN NOW() ELSE NULL END
        WHERE id = ${id}
        RETURNING id, done, status, completed_at
      `;
      if (!row) return res.status(404).json({ error: 'Action introuvable.' });
      return res.status(200).json(row);
    }

    return res.status(400).json({ error: 'Champ "status" ou "done" requis.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
