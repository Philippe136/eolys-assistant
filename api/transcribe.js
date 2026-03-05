import formidable from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Ton prompt reste le cerveau de l'opération
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

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // On récupère toutes les clés nécessaires
  const config = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    trelloKey: process.env.TRELLO_KEY,
    trelloToken: process.env.TRELLO_TOKEN,
    trelloListId: process.env.TRELLO_LIST_ID
  };

  if (!config.openai || !config.anthropic) {
    return res.status(500).json({ error: 'Clés API IA manquantes dans Vercel' });
  }

  try {
    const form = formidable({ maxFileSize: 25 * 1024 * 1024, keepExtensions: true });
    const [fields, files] = await form.parse(req);

    const audioFile = files.audio?.[0];
    const callType = fields.type?.[0] || 'Appel';
    const project = fields.project?.[0] || 'Eolys';

    if (!audioFile) {
      return res.status(400).json({ error: 'Fichier audio manquant. Vérifiez le champ "audio".' });
    }

    // 1. Transcription Whisper
    const openai = new OpenAI({ apiKey: config.openai });
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: 'whisper-1',
      language: 'fr',
    });

    const transcript = transcription.text;
    if (!transcript?.trim()) return res.status(422).json({ error: 'Transcription vide.' });

    // 2. Analyse Claude
    const anthropic = new Anthropic({ apiKey: config.anthropic });
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022', // Version stable et puissante
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Type: ${callType}\nProjet: ${project}\n\nTranscription:\n${transcript}` }],
    });

    const raw = message.content.map(b => b.text || '').join('');
    const result = JSON.parse(raw.replace(/```json|```/g, '').trim());

    // 3. Action Trello : On crée la carte si les clés sont là
    if (config.trelloKey && config.trelloToken && config.trelloListId) {
      const cardDesc = `**Résumé :**\n${result.resume}\n\n**Actions :**\n${result.actions.map(a => `- ${a}`).join('\n')}\n\n**Projet :** ${project}`;
      
      const trelloUrl = `https://api.trello.com/1/cards?` + new URLSearchParams({
        idList: config.trelloListId,
        key: config.trelloKey,
        token: config.trelloToken,
        name: `📞 ${result.titre}`,
        desc: cardDesc,
        pos: 'top'
      });

      await fetch(trelloUrl, { method: 'POST' });
    }

    // On renvoie tout à l'iPhone (Transcript + JSON structuré)
    return res.status(200).json({ transcript, ...result, trelloStatus: 'Carte créée' });

  } catch (err) {
    console.error('Erreur :', err);
    return res.status(500).json({ error: err.message });
  }
}
