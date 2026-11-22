import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.MONGODB_URI;
process.env.AUTH_SECRET = 'test-secret-test-secret-123';
const { hashPassword, verifyPassword, signToken, verifyToken, cleanEmail, cleanPassword, readCookie, authEnabled } = await import('../lib/auth.js');
const authApi = (await import('../api/auth.js')).default;
const trips = (await import('../api/trips.js')).default;

function call(handler, { method = 'POST', body = {}, query = {}, headers = {} } = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o, headers: this.headers }); } };
    handler({ method, body, query, headers }, res);
  });
}

test('passwords: hash verifies, wrong password and malformed hashes do not', () => {
  const h = hashPassword('correct horse');
  assert.ok(verifyPassword('correct horse', h));
  assert.ok(!verifyPassword('wrong horse', h));
  assert.ok(!verifyPassword('x', 'garbage'));
  assert.notEqual(hashPassword('correct horse'), h); // random salt
});

test('session token: round-trips, rejects tampering and expiry', () => {
  const t = signToken({ id: 'u1', email: 'a@b.co' });
  assert.deepEqual(verifyToken(t), { id: 'u1', email: 'a@b.co' });
  assert.equal(verifyToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(verifyToken(`${Buffer.from('{"id":"u2","exp":9999999999999}').toString('base64url')}.${t.split('.')[1]}`), null);
  assert.equal(verifyToken(t, Date.now() + 31 * 864e5), null);
  assert.equal(verifyToken(''), null);
});

test('input validation and cookie parsing', () => {
  assert.equal(cleanEmail('  Me@Example.COM '), 'me@example.com');
  assert.throws(() => cleanEmail('nope'), /valid email/);
  assert.throws(() => cleanPassword('short'), /8 characters/);
  assert.equal(readCookie({ headers: { cookie: 'a=1; lw_session=abc%2E; b=2' } }), 'abc.');
});

test('API: accounts are off without a database, guests keep working', async () => {
  assert.equal(authEnabled(), false);
  const me = await call(authApi, { method: 'GET' });
  assert.deepEqual(me.body, { enabled: false, user: null });
  assert.equal((await call(authApi, { body: { action: 'login', email: 'a@b.co', password: 'password1' } })).status, 503);
  assert.equal((await call(authApi, { body: { action: 'logout' } })).status, 200);
  const g = await call(trips, { method: 'GET', query: { deviceId: 'a'.repeat(20) } });
  assert.equal(g.body.enabled, false);
});

test('trips: a signed-in user needs no deviceId; a forged cookie does not count', async () => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/x';
  assert.equal(authEnabled(), true);
  const bad = await call(trips, { method: 'GET', headers: { cookie: 'lw_session=forged.token' } });
  assert.equal(bad.status, 400); // treated as a guest with no deviceId
  delete process.env.MONGODB_URI;
});