export default function handler(req, res) {
  if (!process.env.MICROSOFT_CLIENT_ID)  return res.status(500).send('MICROSOFT_CLIENT_ID manquant');
  if (!process.env.MICROSOFT_TENANT_ID)  return res.status(500).send('MICROSOFT_TENANT_ID manquant');

  const redirectUri = `https://${req.headers.host}/api/auth-microsoft-callback`;

  const authUrl = 'https://login.microsoftonline.com/' + process.env.MICROSOFT_TENANT_ID +
    '/oauth2/v2.0/authorize?' + new URLSearchParams({
      client_id:     process.env.MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri:  redirectUri,
      scope:         'offline_access Mail.ReadWrite',
      response_mode: 'query',
    });

  res.redirect(302, authUrl);
}
