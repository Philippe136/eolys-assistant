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

  // Rotation du refresh token si Microsoft en fournit un nouveau
  if (data.refresh_token) {
    await sql`
      INSERT INTO config (key, value, updated_at) VALUES ('microsoft_refresh_token', ${data.refresh_token}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${data.refresh_token}, updated_at = NOW()
    `;
  }

  return data.access_token ?? null;
}

// ── Créer un brouillon Outlook via Graph API ───────────────────────────────
async function createOutlookDraft(accessToken, emailText, titre) {
  const lines     = emailText.split('\n');
  const subjLine  = lines.find(l => l.toLowerCase().startsWith('objet:'));
  const subject   = subjLine ? subjLine.replace(/^objet\s*:\s*/i, '').trim() : titre;
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

  return await res.json(); // { id, webLink, ... }
}

export const processCall = task({
  id: 'process-call',
  maxDuration: 300,

  run: async ({ callId, audioUrl, callType, project }) => {
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
          messages:   [{ role: 'user', content: `Type d'appel: ${callType}\nProjet/Interlocuteur: ${project}\n\nTranscription:\n${transcript}` }],
        });

        const raw = message.content.map(b => b.text || '').join('');
        try {
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
          // Validation minimale des champs requis
          if (typeof parsed.titre !== 'string' || typeof parsed.resume !== 'string' || !Array.isArray(parsed.actions)) {
            throw new Error('Champs requis manquants (titre, resume, actions)');
          }
          result = parsed;
          break;
        } catch (e) {
          console.warn(`[${callId}] Claude JSON invalide (tentative ${attempt}/3) :`, e.message, '— raw:', raw.substring(0, 200));
          if (attempt === 3) throw new Error(`Claude n'a pas retourné un JSON valide après 3 tentatives : ${e.message}`);
        }
      }

      // ── Étape 4 : Créer la carte Trello (optionnel) ───────────────────────
      let trelloUrl = null;
      if (process.env.TRELLO_KEY && process.env.TRELLO_TOKEN && process.env.TRELLO_LIST_ID) {
        try {
          const cardDesc = `**Résumé :**\n${result.resume}\n\n**Actions :**\n${(result.actions ?? []).map(a => `- ${a}`).join('\n')}\n\n**Projet :** ${project}\n**Type :** ${callType}`;
          const params   = new URLSearchParams({
            idList: process.env.TRELLO_LIST_ID, key: process.env.TRELLO_KEY, token: process.env.TRELLO_TOKEN,
            name: `📞 ${result.titre}`, desc: cardDesc, pos: 'top',
          });
          const trelloRes = await fetch(`https://api.trello.com/1/cards?${params}`, { method: 'POST' });
          if (trelloRes.ok) { const card = await trelloRes.json(); trelloUrl = card.url; }
          console.log(`[${callId}] Trello ✅ ${trelloUrl}`);
        } catch (e) { console.warn(`[${callId}] Trello ignoré :`, e.message); }
      }

      // ── Étape 5 : Brouillon Outlook (si Claude juge pertinent) ────────────
      let outlookDraftId  = null;
      let outlookDraftUrl = null;

      if (result.createDraft && result.email && process.env.MICROSOFT_CLIENT_ID) {
        try {
          console.log(`[${callId}] Création brouillon Outlook...`);
          const accessToken = await getMicrosoftAccessToken(sql);
          if (accessToken) {
            const draft       = await createOutlookDraft(accessToken, result.email, result.titre);
            outlookDraftId    = draft.id;
            outlookDraftUrl   = draft.webLink;
            console.log(`[${callId}] Outlook ✅ brouillon créé`);
          } else {
            console.warn(`[${callId}] Outlook ignoré : pas de token (visiter /api/auth-microsoft)`);
          }
        } catch (e) { console.warn(`[${callId}] Outlook ignoré :`, e.message); }
      }

      // ── Étape 6 : Sauvegarde en base ──────────────────────────────────────
      await sql`
        UPDATE calls SET
          status           = 'done',
          transcript       = ${transcript},
          titre            = ${result.titre},
          resume           = ${result.resume},
          actions          = ${JSON.stringify(result.actions ?? [])},
          email            = ${result.email ?? null},
          trello_url       = ${trelloUrl},
          outlook_draft_id = ${outlookDraftId},
          outlook_draft_url = ${outlookDraftUrl}
        WHERE id = ${callId}
      `;

      console.log(`[${callId}] ✅ Traitement terminé`);
      return { success: true, callId, trelloUrl, outlookDraftId };

    } catch (err) {
      console.error(`[${callId}] ❌ Erreur :`, err.message);
      await sql`UPDATE calls SET status = 'error', error = ${err.message} WHERE id = ${callId}`;
      throw err;
    }
  },
});
