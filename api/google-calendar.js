/**
 * /api/google-calendar
 *
 * OAuth Google Calendar + confirmation d'événements
 *
 * ?action=start      → redirige vers la page de consentement Google
 * ?action=callback   → échange le code OAuth, stocke le refresh_token
 * ?action=status     → retourne { connected: bool, email: string|null }
 * ?action=disconnect → supprime les tokens
 * ?action=confirm&id=uuid  → crée l'événement dans Google Calendar
 * ?action=dismiss&id=uuid  → ignore la suggestion
 */
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function buildAuthUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
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

async function getGoogleAccessToken() {
  const rows = await sql`SELECT value FROM config WHERE key = 'google_calendar_refresh_token'`;
  if (!rows.length) throw new Error('Google Calendar non connecté');
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: rows[0].value,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
  });
  if (!res.ok) throw new Error(`Refresh token Google ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
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

  const { action, id } = req.query;

  // Le callback Google arrive sans session (redirection externe) — on l'exempte
  if (action !== 'callback' && !requireSession(req, res)) return;
  const appUrl      = process.env.APP_URL ?? `https://${req.headers.host}`;
  const redirectUri = `${appUrl}/api/google-calendar?action=callback`;

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
    return res.redirect(302, buildAuthUrl(redirectUri, state));
  }

  // ── OAuth : callback ───────────────────────────────────────────────────────
  if (action === 'callback') {
    const { code, error: oauthError } = req.query;
    if (oauthError) return res.redirect(302, `/settings?error=${encodeURIComponent(oauthError)}`);
    if (!code)      return res.redirect(302, '/settings?error=Code+OAuth+manquant');
    try {
      const tokens = await exchangeCode(code, redirectUri);
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
