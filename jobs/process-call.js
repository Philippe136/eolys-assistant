import { task } from '@trigger.dev/sdk/v3';
import OpenAI, { toFile } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../lib/db.js';
import { SYSTEM_PROMPT } from '../lib/prompts.js';

// ── Microsoft Graph : obtenir un access token depuis le refresh token ──────
async function getMicrosoftAccessToken(sql) {
  const rows = await sql`SELECT value FROM config WHERE key = 'microsoft_refresh_token'`;
  if (!rows.length) return null;

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: rows[0].value,
    scope:         'offline_access Mail.ReadWrite',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
  );

  if (!res.ok) return null;
  const data = await res.json();

  if (data.refresh_token) {
    await sql`
      INSERT INTO config (key, value, updated_at) VALUES ('microsoft_refresh_token', ${data.refresh_token}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${data.refresh_token}, updated_at = NOW()
    `;
  }

  return data.access_token ?? null;
}

// ── Créer un brouillon Outlook via Graph API ───────────────────────────────
async function createOutlookDraft(accessToken, emailText, title) {
  const lines     = emailText.split('\n');
  const subjLine  = lines.find(l => l.toLowerCase().startsWith('objet:'));
  const subject   = subjLine ? subjLine.replace(/^objet\s*:\s*/i, '').trim() : title;
  const bodyStart = emailText.indexOf('\n\n');
  const body      = bodyStart > -1 ? emailText.substring(bodyStart + 2) : emailText;

  const res = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject,
      body:    { contentType: 'Text', content: body },
      isDraft: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API ${res.status}: ${err}`);
  }

  return await res.json();
}

export const processCall = task({
  id: 'process-call',
  maxDuration: 300,

  run: async ({ callId, audioUrl, initialTags = [] }) => {
    try {
      // ── Étape 1 : Télécharger l'audio ─────────────────────────────────────
      console.log(`[${callId}] Téléchargement audio...`);
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error(`Impossible de télécharger l'audio : ${audioRes.status}`);

      const audioBuffer = await audioRes.arrayBuffer();
      const ext         = new URL(audioUrl).pathname.split('.').pop() || 'm4a';
      const mimeMap     = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };
      const audioFile   = await toFile(Buffer.from(audioBuffer), `audio.${ext}`, { type: mimeMap[ext] ?? 'audio/mpeg' });

      // ── Étape 2 : Transcription Whisper ───────────────────────────────────
      console.log(`[${callId}] Transcription Whisper...`);
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile, model: 'whisper-1', language: 'fr',
      });

      const transcript = transcription.text?.trim();
      if (!transcript) throw new Error('Transcription vide — audio inaudible ou trop court.');
      console.log(`[${callId}] Transcript : ${transcript.substring(0, 80)}...`);

      // ── Étape 3 : Analyse Claude Haiku (avec retry si JSON invalide) ────────
      console.log(`[${callId}] Analyse Claude...`);
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      let result;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const message = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system:     SYSTEM_PROMPT,
          messages:   [{ role: 'user', content: `Transcription :\n${transcript}` }],
        });

        const raw = message.content.map(b => b.text || '').join('');
        try {
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
          if (typeof parsed.title !== 'string' || typeof parsed.summary !== 'string' || !Array.isArray(parsed.items)) {
            throw new Error('Champs requis manquants (title, summary, items)');
          }
          result = parsed;
          break;
        } catch (e) {
          console.warn(`[${callId}] Claude JSON invalide (tentative ${attempt}/3) :`, e.message, '— raw:', raw.substring(0, 200));
          if (attempt === 3) throw new Error(`Claude n'a pas retourné un JSON valide après 3 tentatives : ${e.message}`);
        }
      }

      // ── Étape 4 : Brouillon Outlook (si email_draft présent) ──────────────
      let outlookDraftId  = null;
      let outlookDraftUrl = null;

      if (result.email_draft && process.env.MICROSOFT_CLIENT_ID) {
        try {
          console.log(`[${callId}] Création brouillon Outlook...`);
          const accessToken = await getMicrosoftAccessToken(sql);
          if (accessToken) {
            const draft     = await createOutlookDraft(accessToken, result.email_draft, result.title);
            outlookDraftId  = draft.id;
            outlookDraftUrl = draft.webLink;
            console.log(`[${callId}] Outlook ✅ brouillon créé`);
          } else {
            console.warn(`[${callId}] Outlook ignoré : pas de token`);
          }
        } catch (e) { console.warn(`[${callId}] Outlook ignoré :`, e.message); }
      }

      // ── Étape 5 : Sauvegarde en base ──────────────────────────────────────
      // Merger les tags IA + tags pré-remplis par l'utilisateur (dédupliqués)
      const aiTags   = Array.isArray(result.tags) ? result.tags : [];
      const userTags = Array.isArray(initialTags) ? initialTags : [];
      const tags     = [...new Set([...userTags, ...aiTags])];

      await sql`
        UPDATE entries SET
          status      = 'done',
          transcript  = ${transcript},
          category    = ${result.category ?? 'inbox'},
          title       = ${result.title ?? null},
          summary     = ${result.summary ?? null},
          tags        = ${tags},
          email_draft = ${result.email_draft ?? null}
        WHERE id = ${callId}
      `;

      // ── Étape 6 : Items extraits ───────────────────────────────────────────
      if (result.items && result.items.length > 0) {
        await sql`DELETE FROM items WHERE entry_id = ${callId}`;
        for (let i = 0; i < result.items.length; i++) {
          const item = result.items[i];
          const validTypes = ['task', 'idea', 'decision', 'reminder'];
          const type = validTypes.includes(item.type) ? item.type : 'task';
          await sql`
            INSERT INTO items (entry_id, type, text, due_date, position)
            VALUES (${callId}, ${type}, ${item.text}, ${item.due ?? null}, ${i})
          `;
        }
        console.log(`[${callId}] ✅ ${result.items.length} item(s) inséré(s)`);
      }

      console.log(`[${callId}] ✅ Traitement terminé`);
      return { success: true, callId, outlookDraftId };

    } catch (err) {
      console.error(`[${callId}] ❌ Erreur :`, err.message);
      await sql`UPDATE entries SET status = 'error', error = ${err.message} WHERE id = ${callId}`;
      throw err;
    }
  },
});
