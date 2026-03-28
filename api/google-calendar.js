/**
 * /api/google-calendar
 *
 * OAuth Google Calendar + Gmail + confirmation d'événements
 *
 * ── Calendar ──────────────────────────────────────────────
 * ?action=start      → OAuth Calendar
 * ?action=callback   → échange code, stocke refresh_token
 * ?action=status     → { connected, email }
 * ?action=disconnect → supprime tokens
 * ?action=confirm&id → crée l'événement Google Calendar
 * ?action=dismiss&id → ignore la suggestion
 *
 * ── Gmail ─────────────────────────────────────────────────
 * ?resource=gmail&action=start      → OAuth Gmail
 * ?resource=gmail&action=status     → { connected, email }
 * ?resource=gmail&action=scan       → scanne inbox, extrait tâches
 * ?resource=gmail&action=list       → liste des scans DB
 * ?resource=gmail&action=approve&id → crée une entrée Vox depuis le scan
 * ?resource=gmail&action=dismiss&id → marque dismissed
 * ?resource=gmail&action=disconnect → supprime tokens
 */
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';
import Anthropic from '@anthropic-ai/sdk';

const SCOPES_CALENDAR = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const SCOPES_GMAIL = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

// ── Helpers partagés ──────────────────────────────────────────────────────────

function getRedirectUri(req, resource = 'calendar') {
  const appUrl = process.env.APP_URL ?? `https://${req.headers.host}`;
  return resource === 'gmail'
    ? `${appUrl}/api/google-calendar?resource=gmail&action=callback`
    : `${appUrl}/api/google-calendar?action=callback`;
}

function buildAuthUrl(redirectUri, state, scopes) {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         scopes,
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code, redirectUri) {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  });
  if (!res.ok) throw new Error(`Google token exchange ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getConnectedEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()).email ?? null;
  } catch { return null; }
}

async function refreshAccessToken(configKey, label) {
  const rows = await sql`SELECT value FROM config WHERE key = ${configKey}`;
  if (!rows.length) throw new Error(`${label} non connecté`);
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: rows[0].value,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  });
  if (!res.ok) throw new Error(`Refresh token ${label} ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}
const getGoogleAccessToken  = () => refreshAccessToken('google_calendar_refresh_token', 'Google Calendar');
const getGmailAccessToken   = () => refreshAccessToken('google_gmail_refresh_token',    'Gmail');

// ── Gmail helpers ─────────────────────────────────────────────────────────────

function decodeBase64Url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractEmailBody(payload) {
  if (!payload) return '';
  // Simple body
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  // Multipart : chercher text/plain en priorité
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data)
        return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      if (part.body?.data) return decodeBase64Url(part.body.data);
    }
  }
  return '';
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

async function analyzeEmailWithClaude(email) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const body = email.body?.slice(0, 1500) || email.snippet || '';
  const prompt = `Analyse cet email et retourne UNIQUEMENT un objet JSON valide.

De: ${email.sender}
Sujet: ${email.subject}
Contenu: ${body}

JSON attendu:
{
  "is_spam": boolean,
  "importance": "low" | "medium" | "high",
  "summary": "résumé en 1 phrase",
  "tasks": [
    { "text": "action à faire", "type": "task|reminder|decision", "due": "YYYY-MM-DD ou null" }
  ],
  "suggested_reply": "brouillon de réponse si pertinent, sinon null"
}

Règles:
- is_spam = true si newsletter, pub, spam, no-reply sans valeur
- importance = high si action requise urgente, deadline, client important
- tasks = tableau vide [] si aucune action à faire
- suggested_reply = null si pas de réponse nécessaire`;

  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages:   [{ role: 'user', content: prompt }],
  });
  const raw = msg.content.map(b => b.text || '').join('').trim();
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

async function createGCalEvent(accessToken, calEvent) {
  const startDatetime = `${calEvent.date}T${calEvent.time || '09:00'}:00`;
  const endTs         = new Date(startDatetime).getTime() + (calEvent.duration_minutes || 60) * 60000;
  const endDatetime   = new Date(endTs).toISOString().slice(0, 19);
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary:     calEvent.title,
      description: calEvent.notes || '',
      start: { dateTime: startDatetime, timeZone: 'Europe/Paris' },
      end:   { dateTime: endDatetime,   timeZone: 'Europe/Paris' },
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar API ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, id, resource } = req.query;
  const isGmail = resource === 'gmail';

  // Les callbacks Google arrivent sans session — on les exempte
  if (action !== 'callback' && !requireSession(req, res)) return;

  // ══════════════════════════════════════════════════════════════════════════
  // ── GMAIL routes ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (isGmail) {
    const gmailRedirect = getRedirectUri(req, 'gmail');

    // ── Gmail status ────────────────────────────────────────────────────────
    if (action === 'status') {
      const rows     = await sql`SELECT value FROM config WHERE key = 'google_gmail_refresh_token'`;
      const emailRow = await sql`SELECT value FROM config WHERE key = 'google_gmail_email'`;
      return res.status(200).json({ connected: rows.length > 0, email: emailRow[0]?.value ?? null });
    }

    // ── Gmail OAuth start ────────────────────────────────────────────────────
    if (action === 'start') {
      if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID manquante.' });
      const state = `gmail_${Math.random().toString(36).slice(2)}`;
      await sql`INSERT INTO config (key, value, updated_at) VALUES ('google_gmail_oauth_state', ${state}, NOW())
                ON CONFLICT (key) DO UPDATE SET value = ${state}, updated_at = NOW()`;
      return res.redirect(302, buildAuthUrl(gmailRedirect, state, SCOPES_GMAIL));
    }

    // ── Gmail OAuth callback ─────────────────────────────────────────────────
    if (action === 'callback') {
      const { code, error: oauthError } = req.query;
      if (oauthError) return res.redirect(302, `/gmail?error=${encodeURIComponent(oauthError)}`);
      if (!code)      return res.redirect(302, '/gmail?error=Code+OAuth+manquant');
      try {
        const tokens = await exchangeCode(code, gmailRedirect);
        await sql`INSERT INTO config (key, value, updated_at) VALUES ('google_gmail_refresh_token', ${tokens.refresh_token}, NOW())
                  ON CONFLICT (key) DO UPDATE SET value = ${tokens.refresh_token}, updated_at = NOW()`;
        if (tokens.access_token) {
          const email = await getConnectedEmail(tokens.access_token);
          if (email) await sql`INSERT INTO config (key, value, updated_at) VALUES ('google_gmail_email', ${email}, NOW())
                               ON CONFLICT (key) DO UPDATE SET value = ${email}, updated_at = NOW()`;
        }
        return res.redirect(302, '/gmail?connected=1');
      } catch (err) {
        return res.redirect(302, `/gmail?error=${encodeURIComponent(err.message)}`);
      }
    }

    // ── Gmail disconnect ─────────────────────────────────────────────────────
    if (action === 'disconnect') {
      await sql`DELETE FROM config WHERE key IN ('google_gmail_refresh_token','google_gmail_email','google_gmail_oauth_state')`;
      return res.redirect(302, '/gmail?disconnected=1');
    }

    // ── Gmail list (scans DB) ────────────────────────────────────────────────
    if (action === 'list') {
      const scans = await sql`
        SELECT id, message_id, sender, subject, snippet, received_at,
               is_spam, importance, tasks, suggested_reply, summary, status, entry_id, created_at
        FROM gmail_scans
        ORDER BY received_at DESC NULLS LAST
        LIMIT 50
      `;
      return res.status(200).json(scans);
    }

    // ── Gmail scan (fetch + analyse) ─────────────────────────────────────────
    if (action === 'scan') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
      try {
        const accessToken = await getGmailAccessToken();

        // Récupérer les 20 derniers emails non lus — label configurable
        const ALLOWED_LABELS = ['INBOX','CATEGORY_PERSONAL','CATEGORY_PROMOTIONS','CATEGORY_SOCIAL','CATEGORY_UPDATES'];
        const labelParam = ALLOWED_LABELS.includes(req.query.label) ? req.query.label : 'INBOX';
        const gmailQuery = encodeURIComponent(`is:unread label:${labelParam}`);
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${gmailQuery}&maxResults=20`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);
        const listData = await listRes.json();
        const messages = listData.messages || [];

        const results = [];
        for (const msg of messages.slice(0, 15)) {
          // Skip si déjà scanné
          const existing = await sql`SELECT id FROM gmail_scans WHERE message_id = ${msg.id}`;
          if (existing.length) continue;

          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!msgRes.ok) continue;
          const msgData = await msgRes.json();

          const headers  = msgData.payload?.headers || [];
          const sender   = getHeader(headers, 'from');
          const subject  = getHeader(headers, 'subject');
          const dateStr  = getHeader(headers, 'date');
          const snippet  = msgData.snippet || '';
          const body     = extractEmailBody(msgData.payload);
          const receivedAt = dateStr ? new Date(dateStr).toISOString() : null;

          // Analyse Claude
          let analysis = { is_spam: false, importance: 'medium', tasks: [], suggested_reply: null, summary: snippet };
          try {
            analysis = await analyzeEmailWithClaude({ sender, subject, snippet, body });
          } catch (e) {
            console.warn('Claude analysis failed for', msg.id, e.message);
          }

          const [scan] = await sql`
            INSERT INTO gmail_scans (message_id, sender, subject, snippet, received_at, is_spam, importance, tasks, suggested_reply, summary)
            VALUES (${msg.id}, ${sender}, ${subject}, ${snippet}, ${receivedAt},
                    ${analysis.is_spam}, ${analysis.importance || 'medium'},
                    ${JSON.stringify(analysis.tasks || [])}, ${analysis.suggested_reply || null},
                    ${analysis.summary || snippet})
            ON CONFLICT (message_id) DO NOTHING
            RETURNING *
          `;
          if (scan) results.push(scan);
        }

        return res.status(200).json({ scanned: results.length, results });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // ── Gmail approve → crée une entrée Vox ─────────────────────────────────
    if (action === 'approve') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
      if (!id) return res.status(400).json({ error: 'id requis' });

      const [scan] = await sql`SELECT * FROM gmail_scans WHERE id = ${id}`;
      if (!scan) return res.status(404).json({ error: 'Scan introuvable' });
      if (scan.status === 'approved') return res.status(200).json({ ok: true, already: true });

      // Créer l'entrée Vox
      const [entry] = await sql`
        INSERT INTO entries (source, status, category, title, summary, tags)
        VALUES ('gmail', 'done', 'inbox', ${scan.subject || '(sans sujet)'}, ${scan.summary}, '{}')
        RETURNING id
      `;
      // Créer les items (tâches extraites)
      const tasks = Array.isArray(scan.tasks) ? scan.tasks : [];
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        await sql`
          INSERT INTO items (entry_id, type, text, due_date, position)
          VALUES (${entry.id}, ${t.type || 'task'}, ${t.text}, ${t.due || null}, ${i})
        `;
      }
      // Marquer le scan comme approuvé
      await sql`UPDATE gmail_scans SET status = 'approved', entry_id = ${entry.id} WHERE id = ${id}`;

      return res.status(200).json({ ok: true, entry_id: entry.id });
    }

    // ── Gmail dismiss ────────────────────────────────────────────────────────
    if (action === 'dismiss') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
      if (!id) return res.status(400).json({ error: 'id requis' });
      await sql`UPDATE gmail_scans SET status = 'dismissed' WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Action Gmail inconnue.' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── CALENDAR routes (identiques à avant) ──────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const calRedirect = getRedirectUri(req, 'calendar');

  // ── OAuth : status ─────────────────────────────────────────────────────────
  if (action === 'status') {
    const rows     = await sql`SELECT value FROM config WHERE key = 'google_calendar_refresh_token'`;
    const emailRow = await sql`SELECT value FROM config WHERE key = 'google_calendar_email'`;
    return res.status(200).json({ connected: rows.length > 0, email: emailRow[0]?.value ?? null });
  }

  // ── OAuth : start ──────────────────────────────────────────────────────────
  if (action === 'start') {
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID manquante.' });
    const state = Math.random().toString(36).slice(2);
    await sql`INSERT INTO config (key, value, updated_at) VALUES ('google_oauth_state', ${state}, NOW())
              ON CONFLICT (key) DO UPDATE SET value = ${state}, updated_at = NOW()`;
    return res.redirect(302, buildAuthUrl(calRedirect, state, SCOPES_CALENDAR));
  }

  // ── OAuth : callback ───────────────────────────────────────────────────────
  if (action === 'callback') {
    const { code, error: oauthError } = req.query;
    if (oauthError) return res.redirect(302, `/settings?error=${encodeURIComponent(oauthError)}`);
    if (!code)      return res.redirect(302, '/settings?error=Code+OAuth+manquant');
    try {
      const tokens = await exchangeCode(code, calRedirect);
      await sql`INSERT INTO config (key, value, updated_at) VALUES ('google_calendar_refresh_token', ${tokens.refresh_token}, NOW())
                ON CONFLICT (key) DO UPDATE SET value = ${tokens.refresh_token}, updated_at = NOW()`;
      if (tokens.access_token) {
        const email = await getConnectedEmail(tokens.access_token);
        if (email) await sql`INSERT INTO config (key, value, updated_at) VALUES ('google_calendar_email', ${email}, NOW())
                             ON CONFLICT (key) DO UPDATE SET value = ${email}, updated_at = NOW()`;
      }
      return res.redirect(302, '/settings?gcal_connected=1');
    } catch (err) {
      return res.redirect(302, `/settings?error=${encodeURIComponent(err.message)}`);
    }
  }

  // ── OAuth : disconnect ─────────────────────────────────────────────────────
  if (action === 'disconnect') {
    await sql`DELETE FROM config WHERE key IN ('google_calendar_refresh_token','google_calendar_access_token','google_calendar_email','google_oauth_state')`;
    return res.redirect(302, '/settings?gcal_disconnected=1');
  }

  // ── Événement : confirm ────────────────────────────────────────────────────
  if (action === 'confirm') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
    if (!id) return res.status(400).json({ error: 'id requis' });
    const rows = await sql`SELECT calendar_event, calendar_event_status FROM entries WHERE id = ${id}`;
    if (!rows.length) return res.status(404).json({ error: 'Entry introuvable' });
    const entry = rows[0];
    if (!entry.calendar_event) return res.status(400).json({ error: 'Pas d\'événement suggéré' });
    if (entry.calendar_event_status === 'confirmed') return res.status(200).json({ ok: true, already: true });
    try {
      const accessToken  = await getGoogleAccessToken();
      const gcalEvent    = await createGCalEvent(accessToken, entry.calendar_event);
      const updatedEvent = { ...entry.calendar_event, google_event_id: gcalEvent.id, google_event_url: gcalEvent.htmlLink };
      await sql`UPDATE entries SET calendar_event_status = 'confirmed', calendar_event = ${JSON.stringify(updatedEvent)} WHERE id = ${id}`;
      return res.status(200).json({ ok: true, status: 'confirmed', eventId: gcalEvent.id, url: gcalEvent.htmlLink });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Événement : dismiss ────────────────────────────────────────────────────
  if (action === 'dismiss') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
    if (!id) return res.status(400).json({ error: 'id requis' });
    await sql`UPDATE entries SET calendar_event_status = 'dismissed' WHERE id = ${id}`;
    return res.status(200).json({ ok: true, status: 'dismissed' });
  }

  return res.status(400).json({ error: 'Action inconnue.' });
}
