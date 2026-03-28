import { task } from '@trigger.dev/sdk/v3';
import OpenAI, { toFile } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../lib/db.js';
import { SYSTEM_PROMPT, MODE_PROMPTS } from '../lib/prompts.js';

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

  run: async ({ callId, audioUrl, transcript: directTranscript, initialTags = [], mode = 'standard' }) => {
    try {
      let transcript;

      if (directTranscript) {
        // ── Mode texte : pas de Whisper ───────────────────────────────────────
        transcript = directTranscript.trim();
        if (!transcript) throw new Error('Texte vide.');
        console.log(`[${callId}] Mode texte : ${transcript.substring(0, 80)}...`);

      } else {
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

        transcript = transcription.text?.trim();
        if (!transcript) throw new Error('Transcription vide — audio inaudible ou trop court.');
        console.log(`[${callId}] Transcript : ${transcript.substring(0, 80)}...`);
      }

      // ── Étape 3 : Analyse Claude Haiku (avec retry si JSON invalide) ────────
      console.log(`[${callId}] Analyse Claude...`);
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // Charger les entités contextuelles personnelles
      const entities = await sql`
        SELECT alias, real_name, relation, notes FROM context_entities ORDER BY lower(alias) ASC
      `;
      const contextBlock = entities.length
        ? `\n\nContexte personnel — entités connues (utilise ces infos pour enrichir ton analyse) :\n${
            entities.map(e =>
              `- "${e.alias}"${e.real_name ? ` = ${e.real_name}` : ''}${e.relation ? ` (${e.relation})` : ''}${e.notes ? ` — ${e.notes}` : ''}`
            ).join('\n')
          }`
        : '';

      // Sélectionner le prompt selon le mode d'enregistrement
      const systemPrompt = MODE_PROMPTS[mode] ?? SYSTEM_PROMPT;
      console.log(`[${callId}] Mode : ${mode}`);

      // Modèles par ordre de préférence (du plus récent au plus sûr)
      const CLAUDE_MODELS = [
        'claude-haiku-4-5-20251001',
        'claude-3-5-haiku-20241022',
        'claude-3-haiku-20240307',
      ];

      let results; // tableau d'outputs (1 ou plusieurs)
      for (let attempt = 1; attempt <= 3; attempt++) {
        const model   = CLAUDE_MODELS[Math.min(attempt - 1, CLAUDE_MODELS.length - 1)];
        const message = await anthropic.messages.create({
          model,
          max_tokens: 2000,
          system:     systemPrompt,
          messages:   [{ role: 'user', content: `Date du jour : ${new Date().toISOString().slice(0, 10)}${contextBlock}\n\nTranscription :\n${transcript}` }],
        });

        const raw = message.content.map(b => b.text || '').join('');
        try {
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
          // ── Format multi-sujet : { "entries": [...] } ──
          if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
            results = parsed.entries.filter(e => typeof e.title === 'string' && typeof e.summary === 'string');
            if (!results.length) throw new Error('entries[] vide ou invalide');
            console.log(`[${callId}] 🔀 Multi-sujet détecté : ${results.length} entrées`);
          } else {
            // ── Format simple ──
            if (typeof parsed.title !== 'string' || typeof parsed.summary !== 'string' || !Array.isArray(parsed.items)) {
              throw new Error('Champs requis manquants (title, summary, items)');
            }
            results = [parsed];
          }
          break;
        } catch (e) {
          console.warn(`[${callId}] Claude JSON invalide (tentative ${attempt}/3) :`, e.message, '— raw:', raw.substring(0, 200));
          if (attempt === 3) throw new Error(`Claude n'a pas retourné un JSON valide après 3 tentatives : ${e.message}`);
        }
      }

      // ── Étape 4 : Persister chaque output ─────────────────────────────────
      // Le premier output met à jour l'entrée principale (callId)
      // Les suivants créent de nouvelles entrées liées au même transcript
      const userTags = Array.isArray(initialTags) ? initialTags : [];
      let outlookDraftId = null;

      for (let idx = 0; idx < results.length; idx++) {
        const result  = results[idx];
        const entryId = idx === 0 ? callId : null; // null → on va créer une nouvelle entrée

        const aiTags     = Array.isArray(result.tags) ? result.tags : [];
        const tags       = [...new Set([...userTags, ...aiTags])];
        const calEvent   = result.calendar_event ?? null;
        const calStatus  = calEvent ? 'suggested' : null;

        // Brouillon Outlook (seulement pour le premier output)
        if (idx === 0 && result.email_draft && process.env.MICROSOFT_CLIENT_ID) {
          try {
            const accessToken = await getMicrosoftAccessToken(sql);
            if (accessToken) {
              const draft = await createOutlookDraft(accessToken, result.email_draft, result.title);
              outlookDraftId = draft.id;
              console.log(`[${callId}] Outlook ✅ brouillon créé`);
            }
          } catch (e) { console.warn(`[${callId}] Outlook ignoré :`, e.message); }
        }

        let targetId;
        if (idx === 0) {
          // Mettre à jour l'entrée principale
          await sql`
            UPDATE entries SET
              status                = 'done',
              transcript            = ${transcript},
              category              = ${result.category ?? 'inbox'},
              title                 = ${result.title ?? null},
              summary               = ${result.summary ?? null},
              tags                  = ${tags},
              email_draft           = ${result.email_draft ?? null},
              calendar_event        = ${calEvent ? JSON.stringify(calEvent) : null},
              calendar_event_status = ${calStatus}
            WHERE id = ${callId}
          `;
          targetId = callId;
        } else {
          // Créer une nouvelle entrée pour les sujets supplémentaires
          const [newEntry] = await sql`
            INSERT INTO entries (status, source, transcript, category, title, summary, tags, email_draft, calendar_event, calendar_event_status)
            VALUES ('done', 'split', ${transcript}, ${result.category ?? 'inbox'}, ${result.title ?? null}, ${result.summary ?? null}, ${tags}, ${result.email_draft ?? null}, ${calEvent ? JSON.stringify(calEvent) : null}, ${calStatus})
            RETURNING id
          `;
          targetId = newEntry.id;
          console.log(`[${callId}] 🔀 Nouvelle entrée créée : ${targetId} (sujet ${idx + 1})`);
        }

        if (calEvent) console.log(`[${targetId}] 📅 Événement : ${calEvent.title} le ${calEvent.date}`);

        // Items
        const items = Array.isArray(result.items) ? result.items : [];
        if (items.length > 0) {
          await sql`DELETE FROM items WHERE entry_id = ${targetId}`;
          let inserted = 0;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const text = (item.text ?? '').trim();
            if (!text) { console.warn(`[${targetId}] Item ${i} ignoré : text vide`); continue; }
            const validTypes = ['task', 'idea', 'decision', 'reminder'];
            const type = validTypes.includes(item.type) ? item.type : 'task';
            await sql`
              INSERT INTO items (entry_id, type, text, due_date, position)
              VALUES (${targetId}, ${type}, ${text}, ${item.due ?? null}, ${inserted})
            `;
            inserted++;
          }
          console.log(`[${targetId}] ✅ ${inserted}/${items.length} items insérés`);
        }
      }

      console.log(`[${callId}] ✅ Traitement terminé (${results.length} entrée(s))`);
      return { success: true, callId, count: results.length, outlookDraftId };

    } catch (err) {
      console.error(`[${callId}] ❌ Erreur :`, err.message);
      // Double try : si le UPDATE SQL échoue aussi, on loggue mais on ne masque pas l'erreur d'origine
      try {
        await sql`UPDATE entries SET status = 'error', error = ${err.message} WHERE id = ${callId}`;
      } catch (dbErr) {
        console.error(`[${callId}] ❌ Impossible de marquer l'erreur en base :`, dbErr.message);
      }
      throw err;
    }
  },
});
