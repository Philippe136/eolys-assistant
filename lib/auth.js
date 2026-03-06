// ── Middleware partagé : CORS restrictif + authentification ──────────────────

const APP_ORIGIN = process.env.APP_URL
  ? new URL(process.env.APP_URL).origin
  : 'https://eolys-assistant.vercel.app';

/**
 * CORS restreint au domaine de l'app.
 * Autorise : pas d'origin (curl/server-to-server/iOS Shortcut),
 *             le domaine de prod, et les previews Vercel (*.vercel.app).
 */
export function cors(req, res, methods = 'GET, POST, DELETE, OPTIONS') {
  const origin = req.headers.origin || '';
  const allowed =
    !origin ||
    origin === APP_ORIGIN ||
    /^https:\/\/[a-z0-9-]+-[a-z0-9]+\.vercel\.app$/.test(origin);

  res.setHeader('Access-Control-Allow-Origin', allowed ? (origin || APP_ORIGIN) : 'null');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Auth Bearer pour iOS Shortcut → /api/ingest.
 * Si INGEST_SECRET n'est pas défini : passe (rétrocompat pendant la migration).
 * Retourne true si autorisé, false + réponse 401 sinon.
 */
export function requireBearer(req, res) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return true; // variable non configurée → accès ouvert (temporaire)

  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (!token || token !== secret) {
    res.status(401).json({
      error: 'Non autorisé. Ajoutez le header Authorization: Bearer <INGEST_SECRET> dans votre raccourci iOS.',
    });
    return false;
  }
  return true;
}

/**
 * Vérifie que l'appel vient du navigateur sur notre propre domaine.
 * Utilisé pour /api/claude (appelé uniquement depuis index.html).
 * Retourne true si autorisé, false + réponse 403 sinon.
 */
export function requireWebOrigin(req, res) {
  const origin = req.headers.origin || '';
  const host   = (req.headers.host || '').split(':')[0];

  const allowed =
    !origin ||                                                             // pas d'origin (curl, server)
    origin.includes(host) ||                                              // même host
    origin === APP_ORIGIN ||                                              // prod
    /^https:\/\/[a-z0-9-]+-[a-z0-9]+\.vercel\.app$/.test(origin);      // preview

  if (!allowed) {
    res.status(403).json({ error: 'Accès refusé.' });
    return false;
  }
  return true;
}

/** Échappement HTML minimal pour les sorties dans du HTML généré côté serveur. */
export function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
