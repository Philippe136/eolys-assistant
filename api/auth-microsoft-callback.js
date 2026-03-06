import { neon } from '@neondatabase/serverless';
import { escHtml } from '../lib/auth.js';

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>❌ Erreur OAuth</h2>
        <p>${escHtml(error)}: ${escHtml(error_description || '')}</p>
        <a href="/dashboard">← Retour</a>
      </body></html>`);
  }

  if (!code) return res.status(400).send('Code manquant');

  try {
    const redirectUri = `https://${req.headers.host}/api/auth-microsoft-callback`;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     process.env.MICROSOFT_CLIENT_ID,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
          scope:         'offline_access Mail.ReadWrite',
        }),
      }
    );

    const tokens = await tokenRes.json();

    if (!tokens.refresh_token) {
      return res.status(500).send(`
        <html><body style="font-family:sans-serif;padding:40px;text-align:center">
          <h2>❌ Pas de refresh token</h2>
          <pre style="text-align:left;background:#f5f5f5;padding:16px;border-radius:8px">${JSON.stringify(tokens, null, 2)}</pre>
          <a href="/dashboard">← Retour</a>
        </body></html>`);
    }

    // Sauvegarder les tokens en base
    const sql = neon(process.env.DATABASE_URL);
    await sql`
      INSERT INTO config (key, value, updated_at)
      VALUES ('microsoft_refresh_token', ${tokens.refresh_token}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${tokens.refresh_token}, updated_at = NOW()
    `;

    // Vérifier l'identité connectée
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = meRes.ok ? await meRes.json() : {};

    return res.status(200).send(`
      <html>
      <head><link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700&display=swap" rel="stylesheet"></head>
      <body style="font-family:'Syne',sans-serif;background:#f5f2ed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
        <div style="background:#fff;border:1px solid #e0d9cf;border-radius:16px;padding:40px 48px;text-align:center;max-width:400px">
          <div style="font-size:40px;margin-bottom:16px">✅</div>
          <h2 style="margin:0 0 8px;font-size:20px">Outlook connecté !</h2>
          <p style="color:#7a7268;font-size:14px;margin:0 0 24px">
            ${me.displayName || me.userPrincipalName || 'Compte connecté'}<br>
            Les brouillons seront créés automatiquement.
          </p>
          <a href="/dashboard" style="background:#c8410a;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
            Voir le dashboard →
          </a>
        </div>
      </body></html>`);

  } catch (err) {
    console.error('Erreur /api/auth-microsoft-callback:', err.message);
    return res.status(500).send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>❌ Erreur serveur</h2><a href="/dashboard">← Retour</a></body></html>`);
  }
}
