/**
 * /api/microsoft-oauth
 *
 * ?action=start    → redirige vers la page de consentement Microsoft
 * ?action=callback → reçoit le code OAuth, l'échange contre des tokens,
 *                    stocke le refresh_token dans la table config
 * ?action=status   → retourne { connected: bool }
 * ?action=disconnect → supprime le refresh_token de la table config
 */
import { cors, requireSession } from '../lib/auth.js';
import { sql } from '../lib/db.js';

const SCOPES = 'offline_access Mail.ReadWrite User.Read';

function buildAuthUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    state,
    response_mode: 'query',
  });
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeCode(code, redirectUri) {
  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    scope:         SCOPES,
  });
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft token exchange ${res.status}: ${err}`);
  }
  return res.json();
}

async function getConnectedEmail(accessToken) {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.mail || data.userPrincipalName || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  cors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireSession(req, res)) return;

  const { action } = req.query;
  const appUrl = process.env.APP_URL ?? `https://${req.headers.host}`;
  const redirectUri = `${appUrl}/api/microsoft-oauth?action=callback`;

  // ── status ────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const rows = await sql`SELECT value FROM config WHERE key = 'microsoft_refresh_token'`;
    const emailRow = await sql`SELECT value FROM config WHERE key = 'microsoft_email'`;
    return res.status(200).json({
      connected: rows.length > 0,
      email: emailRow.length > 0 ? emailRow[0].value : null,
    });
  }

  // ── start ─────────────────────────────────────────────────────────────────
  if (action === 'start') {
    if (!process.env.MICROSOFT_CLIENT_ID) {
      return res.status(500).json({ error: 'MICROSOFT_CLIENT_ID non configurée.' });
    }
    const state = Math.random().toString(36).slice(2);
    // Stocke le state pour vérification (optionnel mais bonne pratique)
    await sql`
      INSERT INTO config (key, value, updated_at) VALUES ('microsoft_oauth_state', ${state}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${state}, updated_at = NOW()
    `;
    const url = buildAuthUrl(redirectUri, state);
    return res.redirect(302, url);
  }

  // ── callback ──────────────────────────────────────────────────────────────
  if (action === 'callback') {
    const { code, error: oauthError, error_description } = req.query;

    if (oauthError) {
      console.error('OAuth Microsoft error:', oauthError, error_description);
      return res.redirect(302, `/settings?error=${encodeURIComponent(error_description || oauthError)}`);
    }

    if (!code) {
      return res.redirect(302, '/settings?error=Code+OAuth+manquant');
    }

    try {
      const tokens = await exchangeCode(code, redirectUri);

      // Sauvegarde refresh_token
      await sql`
        INSERT INTO config (key, value, updated_at)
        VALUES ('microsoft_refresh_token', ${tokens.refresh_token}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${tokens.refresh_token}, updated_at = NOW()
      `;

      // Sauvegarde l'email de l'utilisateur si on a l'access_token
      if (tokens.access_token) {
        const email = await getConnectedEmail(tokens.access_token);
        if (email) {
          await sql`
            INSERT INTO config (key, value, updated_at)
            VALUES ('microsoft_email', ${email}, NOW())
            ON CONFLICT (key) DO UPDATE SET value = ${email}, updated_at = NOW()
          `;
        }
      }

      console.log('Microsoft OAuth ✅ refresh_token stocké');
      return res.redirect(302, '/settings?connected=1');

    } catch (err) {
      console.error('Erreur échange code OAuth:', err.message);
      return res.redirect(302, `/settings?error=${encodeURIComponent(err.message)}`);
    }
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if ((req.method === 'POST' || req.method === 'GET') && action === 'disconnect') {
    await sql`DELETE FROM config WHERE key IN ('microsoft_refresh_token', 'microsoft_email', 'microsoft_oauth_state')`;
    return res.redirect(302, '/settings?disconnected=1');
  }

  return res.status(400).json({ error: 'Action inconnue. Utilisez ?action=start|callback|status|disconnect' });
}
