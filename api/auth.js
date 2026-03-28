import { createHmac } from 'crypto';
import { cors } from '../lib/auth.js';

const COOKIE_NAME = 'eolys_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

// Rate-limit : max 5 tentatives par IP / 15 min
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS  = 5;
const BLOCK_MS      = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + BLOCK_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

function makeToken(secret) {
  const ts   = Math.floor(Date.now() / 1000);
  const hmac = createHmac('sha256', secret).update(String(ts)).digest('hex');
  return `${ts}.${hmac}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const [ts, hmac] = token.split('.');
  if (!ts || !hmac) return false;
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
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=open; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`);
    return res.status(200).json({ ok: true });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 15 minutes.' });
  }

  const { password } = req.body || {};
  if (!password || password !== secret) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }

  resetRateLimit(ip);
  const token = makeToken(secret);
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Secure`
  );
  return res.status(200).json({ ok: true });
}
