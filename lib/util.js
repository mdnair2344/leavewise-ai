// Small shared helpers: validation, dates, formatting, errors, rate limiting.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round = (x, d = 0) => {
  const m = 10 ** d;
  return Math.round(x * m) / m;
};

// ---------- input validation ----------
export function num(v, { min, max, def, name = 'value' }) {
  if (v === undefined || v === null || v === '') {
    if (def === undefined) throw new HttpError(400, `${name} is required`);
    return def;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${name} must be a number`);
  return clamp(n, min, max);
}

export function oneOf(v, list, def, name = 'value') {
  if (v === undefined || v === null || v === '') return def;
  if (!list.includes(v)) throw new HttpError(400, `${name} must be one of: ${list.join(', ')}`);
  return v;
}

export function bool(v, def = false) {
  if (v === undefined || v === null) return def;
  return v === true || v === 'true' || v === 1 || v === '1';
}

export function parseDate(v, def) {
  if (v === undefined || v === null || v === '') {
    if (def) return def;
    throw new HttpError(400, 'date is required (YYYY-MM-DD)');
  }
  if (!isRealDate(v)) throw new HttpError(400, 'date must look like YYYY-MM-DD');
  return v;
}

/** True only for real calendar dates ("2026-02-31" is rejected; Date.parse alone would roll it over to March). */
export function isRealDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** "HH:MM" -> minutes after midnight */
export function parseTime(v, def, name = 'time') {
  if (v === undefined || v === null || v === '') {
    if (def === undefined) throw new HttpError(400, `${name} is required (HH:MM)`);
    return def;
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v));
  if (!m || +m[1] > 23 || +m[2] > 59) throw new HttpError(400, `${name} must look like HH:MM`);
  return +m[1] * 60 + +m[2];
}

export function cleanText(s, max = 400) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------- dates (all "wall clock", no timezone maths needed) ----------
const utc = (d) => new Date(d + 'T00:00:00Z');
export const dowOf = (d) => (utc(d).getUTCDay() + 6) % 7; // Monday = 0
export const monthOf = (d) => utc(d).getUTCMonth() + 1;
export function addDays(d, n) {
  const t = utc(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const weekStart = (d) => addDays(d, -dowOf(d));
export const DOW_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const dowName = (d) => DOW_NAMES[dowOf(d)];

// ---------- formatting ----------
export function hhmm(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
export function clock12(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}
export const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;

// ---------- best-effort rate limit (per serverless instance) ----------
const buckets = new Map();
export function rateLimit(key, { max = 30, windowMs = 10 * 60 * 1000, message = 'Too many AI requests - please wait a few minutes and try again.' } = {}) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, n: 1 });
    if (buckets.size > 5000) buckets.clear();
    return;
  }
  b.n += 1;
  if (b.n > max) throw new HttpError(429, message);
}