import { route } from '../lib/http.js';
import { getDb, dbConfigured, dbError } from '../lib/db.js';
import { HttpError, cleanText, num, parseTime, hhmm } from '../lib/util.js';
import { currentUser } from '../lib/auth.js';
import { randomUUID } from 'node:crypto';

// Saved commutes. Signed-in users (session cookie) own their trips by userId; guests use an anonymous
// per-browser deviceId. The owner always comes from the cookie, never from the request body.
//   GET    /api/trips?deviceId=...            -> { enabled, trips }
//   POST   /api/trips  { deviceId, trip }      -> { trip }
//   DELETE /api/trips?deviceId=...&id=...      -> { ok }
const ID = /^[a-zA-Z0-9-]{16,64}$/;
const MAX_TRIPS = 20;
let indexReady = null;

async function col() {
  if (!dbConfigured()) return { enabled: false };
  const db = await getDb();
  if (!db) throw new HttpError(503, `Database unavailable${dbError() ? ': ' + dbError() : ''}`);
  const c = db.collection('trips');
  indexReady ||= Promise.all([c.createIndex({ deviceId: 1, createdAt: -1 }), c.createIndex({ userId: 1, createdAt: -1 })]).catch(() => { indexReady = null; });
  await indexReady;
  return { enabled: true, c };
}

export default route(
  async (body, req) => {
    const q = req.query || {};
    const user = currentUser(req);
    const deviceId = String(body.deviceId || q.deviceId || '');
    if (!user && !ID.test(deviceId)) throw new HttpError(400, 'deviceId is missing or malformed');
    const owner = user ? { userId: user.id } : { deviceId };
    const { enabled, c } = await col();
    if (!enabled) return { enabled: false, trips: [] };

    if (req.method === 'GET') {
      const trips = await c.find(owner, { projection: { _id: 0, deviceId: 0, userId: 0 } }).sort({ createdAt: -1 }).limit(MAX_TRIPS).toArray();
      return { enabled: true, trips };
    }
    if (req.method === 'POST') {
      const t = body.trip || {};
      if (await c.countDocuments(owner) >= MAX_TRIPS) throw new HttpError(400, `You can save up to ${MAX_TRIPS} commutes. Delete one first.`);
      const trip = {
        id: randomUUID(),
        name: cleanText(t.name, 60) || 'My commute',
        freeFlowMin: num(t.freeFlowMin, { min: 5, max: 180, def: 30 }),
        arriveBy: hhmm(parseTime(t.arriveBy, 540)),
        leaveWorkAt: hhmm(parseTime(t.leaveWorkAt, 1050)),
        createdAt: new Date().toISOString(),
      };
      await c.insertOne({ ...trip, ...owner });
      return { enabled: true, trip };
    }
    // DELETE
    const id = String(q.id || body.id || '');
    if (!ID.test(id)) throw new HttpError(400, 'id is missing or malformed');
    await c.deleteOne({ ...owner, id });
    return { enabled: true, ok: true };
  },
  { methods: ['GET', 'POST', 'DELETE'] },
);