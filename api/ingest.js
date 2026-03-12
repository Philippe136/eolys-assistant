import formidable from 'formidable';
import fs from 'fs';
import { put } from '@vercel/blob';
import { tasks } from '@trigger.dev/sdk/v3';
import { cors, requireBearer, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  cors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth dual-mode : Bearer (iOS Shortcut) ou session cookie (page /record)
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    if (!requireBearer(req, res)) return;
  } else {
    if (!requireSession(req, res)) return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN manquante dans Vercel' });
  if (!process.env.TRIGGER_SECRET_KEY)    return res.status(500).json({ error: 'TRIGGER_SECRET_KEY manquante dans Vercel' });

  try {
    let fileBuffer, contentType, filename, source, category, initialTag;

    const ct = req.headers['content-type'] || '';

    if (ct.includes('multipart/form-data')) {
      // ── Mode A : multipart/form-data (page /record, curl, tests) ──────────
      const form = formidable({ maxFileSize: 25 * 1024 * 1024 });
      const [fields, files] = await form.parse(req);

      const audioFile = files.audio?.[0];
      if (!audioFile) return res.status(400).json({ error: 'Champ "audio" manquant dans la requête.' });

      fileBuffer  = fs.readFileSync(audioFile.filepath);
      contentType = audioFile.mimetype ?? 'audio/mp4';
      filename    = `entries/${Date.now()}-${audioFile.originalFilename ?? 'audio.m4a'}`;
      source      = fields.source?.[0] || 'web';
      category    = fields.category?.[0] || 'inbox';
      initialTag  = fields.tag?.[0]?.trim() || null;

    } else {
      // ── Mode B : corps brut (iOS Shortcuts → Fichier) ──────────────────────
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      fileBuffer = Buffer.concat(chunks);

      if (!fileBuffer.length) return res.status(400).json({ error: 'Corps de la requête vide.' });

      const extMap = {
        'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3',
        'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
        'audio/flac': 'flac', 'audio/aac': 'aac',
      };
      const mimeClean = ct.split(';')[0].trim();
      const ext       = extMap[mimeClean] ?? req.query.ext ?? 'm4a';

      contentType = mimeClean || 'audio/mp4';
      filename    = `entries/${Date.now()}-audio.${ext}`;
      source      = req.query.source || 'shortcut';
      category    = req.query.category || 'inbox';
      initialTag  = req.query.tag?.trim() || null;
    }

    // Tags initiaux : tag utilisateur pré-rempli si fourni
    const initialTags = initialTag ? [initialTag] : [];

    // ── Upload vers Vercel Blob ─────────────────────────────────────────────
    const blob = await put(filename, fileBuffer, { access: 'public', contentType });

    // ── Créer l'entrée en base ──────────────────────────────────────────────
    const [entry] = await sql`
      INSERT INTO entries (audio_url, source, category, tags, status)
      VALUES (${blob.url}, ${source}, ${category}, ${initialTags}, 'processing')
      RETURNING id
    `;

    // ── Déclencher le job background Trigger.dev ────────────────────────────
    const handle = await tasks.trigger('process-call', {
      callId: entry.id, audioUrl: blob.url, initialTags,
    });

    await sql`UPDATE entries SET job_id = ${handle.id} WHERE id = ${entry.id}`;

    const appUrl    = process.env.APP_URL ?? `https://${req.headers.host}`;
    const resultUrl = `${appUrl}/dashboard`;

    return res.status(202).json({ callId: entry.id, jobId: handle.id, status: 'processing', resultUrl });

  } catch (err) {
    console.error('Erreur /api/ingest:', err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (max 25 MB).' });
    return res.status(500).json({ error: err.message ?? 'Erreur serveur.' });
  }
}
