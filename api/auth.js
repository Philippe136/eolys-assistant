import { createHmac } from 'crypto';
import { cors } from '../lib/auth.js';

const COOKIE_NAME = 'eolys_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

function makeToken(secret) {
  const ts   = Math.floor(Date.now() / 1000);
  const hmac = createHmac('sha256', secret).update(String(ts)).digest('hex');
  return `${ts}.${hmac}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const [ts, hmac] = token.split('.');
  if (!ts || !hmac) return false;
  // Expiration : 7 jours
  if (Date.now() / 1000 - Number(ts) > COOKIE_MAX_AGE) return false;
  const expected = createHmac('sha256', secret).update(ts).digest('hex');
  return hmac === expected;
}

export default async function handler(req, res) {
  cors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    // Pas de mot de passe configuré : accès libre
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=open; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`);
    return res.status(200).json({ ok: true });
  }

  const { password } = req.body || {};
  if (!password || password !== secret) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }

  const token = makeToken(secret);
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Secure`
  );
  return res.status(200).json({ ok: true });
}
