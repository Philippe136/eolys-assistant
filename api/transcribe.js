import formidable from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `Tu es l'assistant interne d'Eolys Solutions, entreprise GTB basée à La Ciotat. Spécialiste Distech Controls, projets 100k-500k€ sur la Côte d'Azur. Dirigeant : David Cohen.
Tu reçois la transcription d'un appel téléphonique professionnel. Produis un compte rendu structuré en JSON.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni backticks.
Format :
{
  "titre": "Titre court de l'appel",
  "resume": "Résumé factuel en 3-5 phrases",
  "actions": ["Action 1", "Action 2", "Action 3"],
  "email": "Objet: ...\\n\\nBonjour [Prénom],\\n\\n[Corps du mail]\\n\\nCordialement,\\nDavid Cohen\\nEolys Solutions"
}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY manquante dans Vercel' });
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante dans Vercel' });

  try {
    // Étape 1 : Parse du fichier audio (multipart/form-data)
    const form = formidable({
      maxFileSize: 25 * 1024 * 1024, // 25 MB (limite Whisper)
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const audioFile = files.audio?.[0];
    const callType = fields.type?.[0] || 'inconnu';
    const project = fields.project?.[0] || 'Non précisé';

    if (!audioFile) {
      return res.status(400).json({ error: 'Fichier audio manquant. Envoyer le fichier dans le champ "audio".' });
    }

    // Étape 2 : Transcription avec OpenAI Whisper
    const openai = new OpenAI({ apiKey: openaiKey });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: 'whisper-1',
      language: 'fr',
    });

    const transcript = transcription.text;
    if (!transcript || transcript.trim().length === 0) {
      return res.status(422).json({ error: 'Transcription vide : audio inaudible ou trop court.' });
    }

    // Étape 3 : Analyse avec Anthropic Claude
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Type: ${callType}\nProjet: ${project}\n\nTranscription:\n${transcript}`,
      }],
    });

    const raw = message.content.map(b => b.text || '').join('');
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());

    return res.status(200).json({ transcript, ...result });

  } catch (err) {
    console.error('Erreur /api/transcribe:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Fichier trop volumineux (max 25 MB).' });
    }
    return res.status(500).json({ error: err.message || 'Erreur serveur inconnue.' });
  }
}
