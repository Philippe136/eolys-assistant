/**
 * /api/calendar-confirm
 *
 * POST ?id=entry_uuid              → crée l'événement dans Google Calendar + status='confirmed'
 * POST ?id=entry_uuid&action=dismiss → status='dismissed' sans créer l'événement
 */
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

async function getGoogleAccessToken() {
  // Récupère un access_token valide depuis le refresh_token stocké
  const rows = await sql`SELECT value FROM config WHERE key = 'google_calendar_refresh_token'`;
  if (!rows.length) throw new Error('Google Calendar non connecté');

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: rows[0].value,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Refresh token Google ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function createGoogleCalendarEvent(accessToken, calEvent) {
  // Construire les datetimes ISO 8601
  const startDatetime = `${calEvent.date}T${calEvent.time || '09:00'}:00`;
  const durationMs    = (calEvent.duration_minutes || 60) * 60 * 1000;
  const startTs       = new Date(startDatetime).getTime();
  const endTs         = startTs + durationMs;
  const endDatetime   = new Date(endTs).toISOString().slice(0, 19);

  const body = {
    summary:     calEvent.title,
    description: calEvent.notes || '',
    start: { dateTime: `${startDatetime}`, timeZone: 'Europe/Paris' },
    end:   { dateTime: `${endDatetime}`,   timeZone: 'Europe/Paris' },
  };

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${err}`);
  }

  return res.json();
}

export default async function handler(req, res) {
  cors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
  if (!requireSession(req, res)) return;

  const { id, action } = req.query;
  if (!id) return res.status(400).json({ error: 'id requis' });

  // Récupérer l'entry
  const rows = await sql`SELECT calendar_event, calendar_event_status FROM entries WHERE id = ${id}`;
  if (!rows.length) return res.status(404).json({ error: 'Entry introuvable' });

  const entry = rows[0];
  if (!entry.calendar_event) return res.status(400).json({ error: 'Pas d\'événement suggéré' });
  if (entry.calendar_event_status === 'confirmed') return res.status(200).json({ ok: true, already: true });

  // ── Dismiss ───────────────────────────────────────────────────────────────
  if (action === 'dismiss') {
    await sql`UPDATE entries SET calendar_event_status = 'dismissed' WHERE id = ${id}`;
    return res.status(200).json({ ok: true, status: 'dismissed' });
  }

  // ── Confirm : créer dans Google Calendar ──────────────────────────────────
  try {
    const accessToken = await getGoogleAccessToken();
    const gcalEvent   = await createGoogleCalendarEvent(accessToken, entry.calendar_event);

    // Stocker l'ID Google Calendar dans le JSONB
    const updatedEvent = {
      ...entry.calendar_event,
      google_event_id:  gcalEvent.id,
      google_event_url: gcalEvent.htmlLink,
    };

    await sql`
      UPDATE entries SET
        calendar_event_status = 'confirmed',
        calendar_event = ${JSON.stringify(updatedEvent)}
      WHERE id = ${id}
    `;

    return res.status(200).json({
      ok:      true,
      status:  'confirmed',
      eventId: gcalEvent.id,
      url:     gcalEvent.htmlLink,
    });

  } catch (err) {
    console.error('Erreur création événement Google:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
