/**
 * /api/google-oauth
 *
 * ?action=start      → redirige vers la page de consentement Google
 * ?action=callback   → reçoit le code OAuth, l'échange contre des tokens,
 *                      stocke le refresh_token dans la table config
 * ?action=status     → retourne { connected: bool, email: string|null }
 * ?action=disconnect → supprime les tokens de la table config
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
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange ${res.status}: ${err}`);
  }
  return res.json();
}

async function getConnectedEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email ?? null;
  } catch { return null; }
}

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  const { action } = req.query;
  const appUrl     = process.env.APP_URL ?? `https://${req.headers.host}`;
  const redirectUri = `${appUrl}/api/google-oauth?action=callback`;

  // ── status ─────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const rows     = await sql`SELECT value FROM config WHERE key = 'google_calendar_refresh_token'`;
    const emailRow = await sql`SELECT value FROM config WHERE key = 'google_calendar_email'`;
    return res.status(200).json({
      connected: rows.length > 0,
      email:     emailRow.length > 0 ? emailRow[0].value : null,
    });
  }

  // ── start ──────────────────────────────────────────────────────────────────
  if (action === 'start') {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'GOOGLE_CLIENT_ID non configurée.' });
    }
    const state = Math.random().toString(36).slice(2);
    await sql`
      INSERT INTO config (key, value, updated_at) VALUES ('google_oauth_state', ${state}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${state}, updated_at = NOW()
    `;
    return res.redirect(302, buildAuthUrl(redirectUri, state));
  }

  // ── callback ───────────────────────────────────────────────────────────────
  if (action === 'callback') {
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(302, `/settings?error=${encodeURIComponent(oauthError)}`);
    }
    if (!code) {
      return res.redirect(302, '/settings?error=Code+OAuth+manquant');
    }

    try {
      const tokens = await exchangeCode(code, redirectUri);

      await sql`
        INSERT INTO config (key, value, updated_at)
        VALUES ('google_calendar_refresh_token', ${tokens.refresh_token}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${tokens.refresh_token}, updated_at = NOW()
      `;

      if (tokens.access_token) {
        const email = await getConnectedEmail(tokens.access_token);
        if (email) {
          await sql`
            INSERT INTO config (key, value, updated_at)
            VALUES ('google_calendar_email', ${email}, NOW())
            ON CONFLICT (key) DO UPDATE SET value = ${email}, updated_at = NOW()
          `;
        }
        // Stocker l'access_token temporaire pour éviter un refresh immédiat
        await sql`
          INSERT INTO config (key, value, updated_at)
          VALUES ('google_calendar_access_token', ${tokens.access_token}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${tokens.access_token}, updated_at = NOW()
        `;
      }

      console.log('Google OAuth ✅ refresh_token stocké');
      return res.redirect(302, '/settings?gcal_connected=1');

    } catch (err) {
      console.error('Erreur échange code OAuth Google:', err.message);
      return res.redirect(302, `/settings?error=${encodeURIComponent(err.message)}`);
    }
  }

  // ── disconnect ─────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    await sql`DELETE FROM config WHERE key IN (
      'google_calendar_refresh_token',
      'google_calendar_access_token',
      'google_calendar_email',
      'google_oauth_state'
    )`;
    return res.redirect(302, '/settings?gcal_disconnected=1');
  }

  return res.status(400).json({ error: 'Action inconnue.' });
}
