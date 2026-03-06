import { task } from '@trigger.dev/sdk/v3';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { neon } from '@neondatabase/serverless';

const SYSTEM_PROMPT = `Tu es l'assistant interne d'Eolys Solutions, entreprise GTB basée à La Ciotat. Spécialiste Distech Controls, projets 100k-500k€ sur la Côte d'Azur. Dirigeant : David Cohen.
Tu reçois la transcription d'un appel téléphonique professionnel. Produis un compte rendu structuré en JSON.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni backticks.
Format :
{
  "titre": "Titre court de l'appel (ex: Appel client GICRAM - devis caméras)",
  "resume": "Résumé factuel en 3-5 phrases",
  "actions": ["Action concrète 1", "Action concrète 2"],
  "email": "Objet: ...\\n\\nBonjour [Prénom],\\n\\n[Corps du mail professionnel]\\n\\nCordialement,\\nDavid Cohen\\nEolys Solutions"
}`;

export const processCall = task({
  id: 'process-call',
  maxDuration: 300, // 5 minutes max

  run: async ({ callId, audioUrl, callType, project }) => {
    const sql = neon(process.env.DATABASE_URL);

    try {
      // ── Étape 1 : Télécharger l'audio depuis Vercel Blob ──────────────────
      console.log(`[${callId}] Téléchargement audio...`);
      const audioRes = await fetch(audioUrl, {
        headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
      });
      if (!audioRes.ok) throw new Error(`Impossible de télécharger l'audio : ${audioRes.status}`);

      const audioBuffer = await audioRes.arrayBuffer();
      const audioFile = new File([audioBuffer], 'audio.m4a', { type: 'audio/mp4' });

      // ── Étape 2 : Transcription Whisper ───────────────────────────────────
      console.log(`[${callId}] Transcription Whisper...`);
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'fr',
      });

      const transcript = transcription.text?.trim();
      if (!transcript) throw new Error('Transcription vide — audio inaudible ou trop court.');

      console.log(`[${callId}] Transcript : ${transcript.substring(0, 80)}...`);

      // ── Étape 3 : Analyse Claude Haiku ────────────────────────────────────
      console.log(`[${callId}] Analyse Claude...`);
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Type d'appel: ${callType}\nProjet/Interlocuteur: ${project}\n\nTranscription:\n${transcript}`,
        }],
      });

      const raw = message.content.map(b => b.text || '').join('');
      const result = JSON.parse(raw.replace(/```json|```/g, '').trim());

      // ── Étape 4 : Sauvegarde en base ──────────────────────────────────────
      await sql`
        UPDATE calls SET
          status     = 'done',
          transcript = ${transcript},
          titre      = ${result.titre},
          resume     = ${result.resume},
          actions    = ${JSON.stringify(result.actions ?? [])},
          email      = ${result.email}
        WHERE id = ${callId}
      `;

      console.log(`[${callId}] ✅ Traitement terminé`);
      return { success: true, callId };

    } catch (err) {
      console.error(`[${callId}] ❌ Erreur :`, err.message);
      await sql`
        UPDATE calls SET status = 'error', error = ${err.message}
        WHERE id = ${callId}
      `;
      throw err;
    }
  },
});
