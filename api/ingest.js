import formidable from 'formidable';
import fs from 'fs';
import { put } from '@vercel/blob';
import { tasks } from '@trigger.dev/sdk/v3';
import { cors, requireBearer, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';
import Anthropic from '@anthropic-ai/sdk';
import { DOC_EXTRACT_PROMPT } from '../lib/prompts.js';

export default async function handler(req, res) {
  cors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth dual-mode : Bearer (iOS Shortcut) ou session cookie (page /record ou dashboard)
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    if (!requireBearer(req, res)) return;
  } else {
    if (!requireSession(req, res)) return;
  }

  if (!process.env.TRIGGER_SECRET_KEY) return res.status(500).json({ error: 'TRIGGER_SECRET_KEY manquante dans Vercel' });

  // ── Document upload (PDF, TXT, MD) ─────────────────────────────────────────
  if (req.query.action === 'upload-doc') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN manquante' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' });

    const form = formidable({ maxFileSize: 20 * 1024 * 1024 }); // 20 MB
    const [fields, files] = await form.parse(req);

    const docFile = files.document?.[0];
    if (!docFile) return res.status(400).json({ error: 'Champ "document" manquant.' });

    const fileBuffer  = fs.readFileSync(docFile.filepath);
    const mimeType    = docFile.mimetype || 'application/octet-stream';
    const origName    = docFile.originalFilename || 'document';
    const category    = fields.category?.[0] || 'inbox';
    const userContext = fields.context?.[0]?.trim() || '';
    const blobName    = `docs/${Date.now()}-${origName}`;

    // Upload vers Vercel Blob
    const blob = await put(blobName, fileBuffer, { access: 'public', contentType: mimeType });

    // Extraction texte via Claude (supporte PDF nativement + texte brut)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let extractedText = '';

    const isPlainText = mimeType.startsWith('text/') || origName.endsWith('.md') || origName.endsWith('.txt');
    if (isPlainText) {
      extractedText = fileBuffer.toString('utf8');
    } else {
      // PDF ou autre binaire → Claude Document API
      const supportedMime = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      const useMime = supportedMime.includes(mimeType) ? mimeType : 'application/pdf';

      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system:     DOC_EXTRACT_PROMPT,
        messages:   [{
          role: 'user',
          content: [{
            type:   'document',
            source: { type: 'base64', media_type: useMime, data: fileBuffer.toString('base64') },
          }, {
            type: 'text',
            text: userContext
              ? `Extrais le contenu textuel complet de ce document. Consigne spécifique : ${userContext}`
              : 'Extrais le contenu textuel complet de ce document.',
          }],
        }],
      });
      extractedText = msg.content.map(b => b.text || '').join('').trim();
    }

    if (!extractedText) return res.status(422).json({ error: 'Impossible d\'extraire le texte du document.' });

    // Créer l'entrée + déclencher process-call
    const [entry] = await sql`
      INSERT INTO entries (source, category, tags, status, audio_url)
      VALUES ('document', ${category}, ${[origName.replace(/\.[^.]+$/, '')]}, 'processing', ${blob.url})
      RETURNING id
    `;

    const transcript = userContext
      ? `${extractedText}\n\n---\nConsigne utilisateur : ${userContext}`
      : extractedText;

    const handle = await tasks.trigger('process-call', {
      callId: entry.id, transcript, initialTags: [], mode: 'standard',
    });
    await sql`UPDATE entries SET job_id = ${handle.id} WHERE id = ${entry.id}`;

    return res.status(202).json({
      callId: entry.id, jobId: handle.id, status: 'processing',
      filename: origName, blobUrl: blob.url,
    });
  }

  try {
    const ct = req.headers['content-type'] || '';

    // ── Mode C : JSON texte (quick-add dashboard / iOS shortcut texte) ────────
    if (ct.includes('application/json')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

      const text = (body.text || '').trim();
      if (!text) return res.status(400).json({ error: 'Champ "text" manquant ou vide.' });

      const source        = body.source   || 'text';
      const category      = body.category || 'inbox';
      const initialTags   = body.tag ? [body.tag.trim()] : (Array.isArray(body.tags) ? body.tags : []);
      const recordingMode = body.mode?.trim() || 'standard';

      const [entry] = await sql`
        INSERT INTO entries (source, category, tags, status)
        VALUES (${source}, ${category}, ${initialTags}, 'processing')
        RETURNING id
      `;

      const handle = await tasks.trigger('process-call', {
        callId: entry.id, transcript: text, initialTags, mode: recordingMode,
      });

      await sql`UPDATE entries SET job_id = ${handle.id} WHERE id = ${entry.id}`;

      const appUrl = process.env.APP_URL ?? `https://${req.headers.host}`;
      return res.status(202).json({ callId: entry.id, jobId: handle.id, status: 'processing', resultUrl: `${appUrl}/dashboard` });
    }

    // ── Audio : vérification token Blob ───────────────────────────────────────
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN manquante dans Vercel' });

    let fileBuffer, contentType, filename, source, category, initialTag, recordingMode = 'standard';

    if (ct.includes('multipart/form-data')) {
      // ── Mode A : multipart/form-data (page /record, curl, tests) ──────────
      const form = formidable({ maxFileSize: 25 * 1024 * 1024 });
      const [fields, files] = await form.parse(req);

      const audioFile = files.audio?.[0];
      if (!audioFile) return res.status(400).json({ error: 'Champ "audio" manquant dans la requête.' });

      fileBuffer  = fs.readFileSync(audioFile.filepath);
      contentType = audioFile.mimetype ?? 'audio/mp4';
      filename    = `entries/${Date.now()}-${audioFile.originalFilename ?? 'audio.m4a'}`;
      source      = fields.source?.[0]   || 'web';
      category    = fields.category?.[0] || 'inbox';
      initialTag  = fields.tag?.[0]?.trim() || null;
      recordingMode = fields.mode?.[0]?.trim() || 'standard';

    } else {
      // ── Mode B : corps brut (iOS Shortcuts → Fichier audio) ───────────────
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
      source      = req.query.source   || 'shortcut';
      category    = req.query.category || 'inbox';
      initialTag  = req.query.tag?.trim() || null;
      recordingMode = req.query.mode?.trim() || 'standard';
    }

    const initialTags = initialTag ? [initialTag] : [];

    const blob = await put(filename, fileBuffer, { access: 'public', contentType });

    const [entry] = await sql`
      INSERT INTO entries (audio_url, source, category, tags, status)
      VALUES (${blob.url}, ${source}, ${category}, ${initialTags}, 'processing')
      RETURNING id
    `;

    const handle = await tasks.trigger('process-call', {
      callId: entry.id, audioUrl: blob.url, initialTags, mode: recordingMode,
    });

    await sql`UPDATE entries SET job_id = ${handle.id} WHERE id = ${entry.id}`;

    const appUrl = process.env.APP_URL ?? `https://${req.headers.host}`;
    return res.status(202).json({ callId: entry.id, jobId: handle.id, status: 'processing', resultUrl: `${appUrl}/dashboard` });

  } catch (err) {
    console.error('Erreur /api/ingest:', err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (max 25 MB).' });
    return res.status(500).json({ error: err.message ?? 'Erreur serveur.' });
  }
}
