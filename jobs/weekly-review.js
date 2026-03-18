import { schedules } from '@trigger.dev/sdk/v3';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../lib/db.js';
import { WEEKLY_REVIEW_PROMPT } from '../lib/prompts.js';

export const weeklyReview = schedules.task({
  id: 'weekly-review',
  // Lundi 7h00 UTC+1 (6h UTC)
  cron: '0 6 * * 1',
  maxDuration: 120,

  run: async (payload) => {
    // Calculer le début de la semaine écoulée (lundi dernier)
    const now       = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekStartStr = weekStart.toISOString().slice(0, 10);
    console.log(`[weekly-review] Analyse semaine du ${weekStartStr}`);

    // Récupérer toutes les entrées de la semaine
    const entries = await sql`
      SELECT title, summary, category, created_at
      FROM entries
      WHERE status = 'done'
        AND created_at >= ${weekStart.toISOString()}
        AND created_at < NOW()
      ORDER BY created_at ASC
    `;

    console.log(`[weekly-review] ${entries.length} entrées trouvées`);

    if (entries.length === 0) {
      console.log('[weekly-review] Aucune entrée cette semaine — skipped');
      return { skipped: true, reason: 'Aucune note cette semaine' };
    }

    // Construire le digest pour Claude
    const digest = entries.map(e => {
      const date = new Date(e.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      return `[${e.category}] ${date} — ${e.title} : ${e.summary}`;
    }).join('\n');

    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - 1);
    const period = `${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} → ${weekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    // Analyse Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system:     WEEKLY_REVIEW_PROMPT,
      messages:   [{ role: 'user', content: `Semaine : ${period}\n\nNotes :\n${digest}` }],
    });

    const raw    = message.content.map(b => b.text || '').join('');
    const review = JSON.parse(raw.replace(/```json|```/g, '').trim());

    // Stocker en base (upsert sur week_start)
    await sql`
      INSERT INTO weekly_reviews (week_start, entry_count, data)
      VALUES (${weekStartStr}, ${entries.length}, ${JSON.stringify(review)})
      ON CONFLICT (week_start)
      DO UPDATE SET data = ${JSON.stringify(review)}, entry_count = ${entries.length}, created_at = NOW()
    `;

    console.log(`[weekly-review] ✅ Rétro générée — score ${review.mental_load_score}/10, tendance ${review.mood_trend}`);
    return { ok: true, weekStart: weekStartStr, entryCount: entries.length, score: review.mental_load_score };
  },
});
