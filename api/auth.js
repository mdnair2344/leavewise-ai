import { route } from '../lib/http.js';
import { getDb, dbError } from '../lib/db.js';
import { HttpError, rateLimit } from '../lib/util.js';
import { authEnabled, hashPassword, verifyPassword, cleanEmail, cleanPassword, setSession, clearSession, currentUser } from '../lib/auth.js';
import { randomUUID } from 'node:crypto';

// Accounts.
//   GET  /api/auth                                  -> { enabled, user }
//   POST /api/auth { action: 'signup', email, password, deviceId? }
//   POST /api/auth { action: 'login',  email, password, deviceId? }
//   POST /api/auth { action: 'logout' }
// On signup/login, trips this browser saved as a guest (matching deviceId) move into the account.
const DEVICE = /^[a-zA-Z0-9-]{16,64}$/;
const ip = (req) => String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
let indexReady = null;

async function collections() {
  const db = await getDb();
  if (!db) throw new HttpError(503, `Database unavailable${dbError() ? ': ' + dbError() : ''}`);
  const users = db.collection('users');
  indexReady ||= users.createIndex({ email: 1 }, { unique: true }).catch(() => { indexReady = null; });
  await indexReady;
  return { users, trips: db.collection('trips') };
}

export default route(
  async (body, req, res) => {
    if (req.method === 'GET') {
      if (!authEnabled()) return { enabled: false, user: null };
      return { enabled: true, user: currentUser(req) };
    }
    const action = String(body.action || '');
    if (action === 'logout') { clearSession(req, res); return { ok: true }; }
    if (!authEnabled()) throw new HttpError(503, 'Accounts are not set up on this server (needs MONGODB_URI and AUTH_SECRET).');
    if (action !== 'signup' && action !== 'login') throw new HttpError(400, 'action must be signup, login or logout');

    rateLimit(`auth:${ip(req)}`, { max: 15, message: 'Too many attempts. Please wait a few minutes and try again.' });
    const email = cleanEmail(body.email);
    const password = cleanPassword(body.password);
    const { users, trips } = await collections();

    let user;
    if (action === 'signup') {
      user = { id: randomUUID(), email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
      try { await users.insertOne(user); } catch (e) {
        if (e?.code === 11000) throw new HttpError(409, 'An account with this email already exists. Try logging in.');
        throw e;
      }
    } else {
      const found = await users.findOne({ email });
      // Same message and similar work whether the email exists or not, so it can't be used to probe accounts.
      const ok = verifyPassword(password, found?.passwordHash || hashPassword('x'.repeat(12)));
      if (!found || !ok) throw new HttpError(401, 'Incorrect email or password.');
      user = found;
    }

    const deviceId = String(body.deviceId || '');
    if (DEVICE.test(deviceId)) {
      await trips.updateMany({ deviceId, userId: { $exists: false } }, { $set: { userId: user.id }, $unset: { deviceId: '' } });
    }
    setSession(req, res, user);
    return { enabled: true, user: { id: user.id, email: user.email } };
  },
  { methods: ['GET', 'POST'] },
);