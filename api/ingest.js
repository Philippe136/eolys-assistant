import formidable from 'formidable';
import fs from 'fs';
import { put } from '@vercel/blob';
import { tasks } from '@trigger.dev/sdk/v3';
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Parse multipart/form-data ─────────────────────────────────────────
    const form = formidable({ maxFileSize: 25 * 1024 * 1024 });
    const [fields, files] = await form.parse(req);

    const audioFile  = files.audio?.[0];
    const callType   = fields.type?.[0]    || 'inconnu';
    const project    = fields.project?.[0] || 'Non précisé';

    if (!audioFile) {
      return res.status(400).json({ error: 'Champ "audio" manquant dans la requête.' });
    }

    // ── Upload vers Vercel Blob ───────────────────────────────────────────
    const fileBuffer  = fs.readFileSync(audioFile.filepath);
    const filename    = `calls/${Date.now()}-${audioFile.originalFilename ?? 'audio.m4a'}`;
    const blob        = await put(filename, fileBuffer, {
      access:      'public',
      contentType: audioFile.mimetype ?? 'audio/mp4',
    });

    // ── Créer l'entrée en base ────────────────────────────────────────────
    const sql    = neon(process.env.DATABASE_URL);
    const [call] = await sql`
      INSERT INTO calls (call_type, project_name, audio_url, status)
      VALUES (${callType}, ${project}, ${blob.url}, 'processing')
      RETURNING id
    `;

    // ── Déclencher le job background Trigger.dev ──────────────────────────
    const handle = await tasks.trigger('process-call', {
      callId:   call.id,
      audioUrl: blob.url,
      callType,
      project,
    });

    await sql`UPDATE calls SET job_id = ${handle.id} WHERE id = ${call.id}`;

    const appUrl    = process.env.APP_URL ?? `https://${req.headers.host}`;
    const resultUrl = `${appUrl}/?callId=${call.id}`;

    // ── Réponse immédiate (< 1s) ──────────────────────────────────────────
    return res.status(202).json({
      callId:    call.id,
      jobId:     handle.id,
      status:    'processing',
      resultUrl,           // Ouvrir ce lien depuis le raccourci iOS pour voir le résultat
    });

  } catch (err) {
    console.error('Erreur /api/ingest:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Fichier trop volumineux (max 25 MB).' });
    }
    return res.status(500).json({ error: err.message ?? 'Erreur serveur.' });
  }
}
