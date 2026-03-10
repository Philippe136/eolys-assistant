import formidable from 'formidable';
import fs from 'fs';
import { put } from '@vercel/blob';
import { tasks } from '@trigger.dev/sdk/v3';
import { cors, requireBearer } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth bearer (iOS Shortcut doit envoyer Authorization: Bearer <INGEST_SECRET>)
  if (!requireBearer(req, res)) return;

  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN manquante dans Vercel' });
  if (!process.env.TRIGGER_SECRET_KEY)    return res.status(500).json({ error: 'TRIGGER_SECRET_KEY manquante dans Vercel' });

  try {
    let fileBuffer, contentType, filename, callType, project;

    const ct = req.headers['content-type'] || '';

    if (ct.includes('multipart/form-data')) {
      // ── Mode A : multipart/form-data (curl, tests) ─────────────────────────
      const form = formidable({ maxFileSize: 25 * 1024 * 1024 });
      const [fields, files] = await form.parse(req);

      const audioFile = files.audio?.[0];
      if (!audioFile) return res.status(400).json({ error: 'Champ "audio" manquant dans la requête.' });

      fileBuffer   = fs.readFileSync(audioFile.filepath);
      contentType  = audioFile.mimetype ?? 'audio/mp4';
      filename     = `calls/${Date.now()}-${audioFile.originalFilename ?? 'audio.m4a'}`;
      callType     = fields.type?.[0]    || req.query.type    || 'inconnu';
      project      = fields.project?.[0] || req.query.project || 'Non précisé';

    } else {
      // ── Mode B : corps brut (iOS Shortcuts → Fichier) ──────────────────────
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      fileBuffer = Buffer.concat(chunks);

      if (!fileBuffer.length) return res.status(400).json({ error: 'Corps de la requête vide.' });

      // Détecter le format depuis Content-Type ou query param
      const extMap = {
        'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3',
        'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
        'audio/flac': 'flac', 'audio/aac': 'aac',
      };
      const mimeClean = ct.split(';')[0].trim();
      const ext       = extMap[mimeClean] ?? req.query.ext ?? 'm4a';

      contentType = mimeClean || 'audio/mp4';
      filename    = `calls/${Date.now()}-audio.${ext}`;
      callType    = req.query.type    || 'inconnu';
      project     = req.query.project || 'Non précisé';
    }

    // ── Upload vers Vercel Blob ─────────────────────────────────────────────
    const blob = await put(filename, fileBuffer, { access: 'public', contentType });

    // ── Créer l'entrée en base ──────────────────────────────────────────────
    const [call] = await sql`
      INSERT INTO calls (call_type, project_name, audio_url, status)
      VALUES (${callType}, ${project}, ${blob.url}, 'processing')
      RETURNING id
    `;

    // ── Déclencher le job background Trigger.dev ────────────────────────────
    const handle = await tasks.trigger('process-call', {
      callId: call.id, audioUrl: blob.url, callType, project,
    });

    await sql`UPDATE calls SET job_id = ${handle.id} WHERE id = ${call.id}`;

    const appUrl    = process.env.APP_URL ?? `https://${req.headers.host}`;
    const resultUrl = `${appUrl}/dashboard`;

    return res.status(202).json({ callId: call.id, jobId: handle.id, status: 'processing', resultUrl });

  } catch (err) {
    console.error('Erreur /api/ingest:', err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (max 25 MB).' });
    return res.status(500).json({ error: err.message ?? 'Erreur serveur.' });
  }
}
