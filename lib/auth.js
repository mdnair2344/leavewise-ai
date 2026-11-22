// Email + password accounts with no extra packages: scrypt password hashing (node:crypto) and a
// signed session token (HMAC-SHA256) kept in an httpOnly cookie. Guests keep working without an account.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { HttpError } from './util.js';

const COOKIE = 'lw_session';
const DAYS = 30;
const secret = () => (process.env.AUTH_SECRET || '').trim();

/** Accounts need a database and a secret of at least 16 characters. */
export const authEnabled = () => !!(process.env.MONGODB_URI || '').trim() && secret().length >= 16;

// ---------- passwords ----------
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `s1:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [v, s, h] = String(stored || '').split(':');
  if (v !== 's1' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const got = scryptSync(password, Buffer.from(s, 'base64'), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (e.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, 'Enter a valid email address.');
  return e;
}

export function cleanPassword(v) {
  const p = String(v || '');
  if (p.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (p.length > 200) throw new HttpError(400, 'Password is too long.');
  return p;
}

// ---------- session token ----------
const b64 = (x) => Buffer.from(x).toString('base64url');
const sign = (data) => createHmac('sha256', secret()).update(data).digest('base64url');

export function signToken(user, now = Date.now()) {
  const payload = b64(JSON.stringify({ id: user.id, email: user.email, exp: now + DAYS * 864e5 }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!secret() || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return p.exp > now && p.id ? { id: String(p.id), email: String(p.email || '') } : null;
  } catch { return null; }
}

// ---------- cookies ----------
export function readCookie(req, name = COOKIE) {
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

const secure = (req) => (req.headers?.['x-forwarded-proto'] || '').includes('https') || process.env.VERCEL === '1';

export function setSession(req, res, user) {
  const attrs = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure(req) ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${signToken(user)}; ${attrs}`);
}

export function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(req) ? '; Secure' : ''}`);
}

/** The signed-in user for this request, or null (guest). */
export const currentUser = (req) => verifyToken(readCookie(req));