'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const sync = (body) => h.post(app, '/api/auth/sync-role', body);

beforeEach(() => {
  h.resetAll();
  h.setEnv({ ...h.FIREBASE_ON, ADMIN_EMAILS: ' Boss@School.HK , other@school.hk ' });
  Object.assign(h.fbState.tokens, {
    boss: { uid: 'u1', email: 'boss@school.hk', email_verified: true, name: 'Boss' },
    unverified: { uid: 'u2', email: 'boss@school.hk', email_verified: false },
    noflag: { uid: 'u2b', email: 'boss@school.hk' },
    stranger: { uid: 'u3', email: 'stranger@school.hk', email_verified: true },
    noemail: { uid: 'u4', email_verified: true },
  });
});

test('listed, verified email is promoted (case-insensitive, trimmed list)', async () => {
  const r = await sync({ idToken: 'boss' });
  assert.equal(r.status, 200);
  assert.equal(r.body.changed, true);
  const u = h.fbState.data.users.u1;
  assert.equal(u.role, 'admin');
  assert.equal(u.accountStatus, 'active');
  assert.equal(u.name, 'Boss');
  assert.ok(u.createdAt, 'new profile gets createdAt');
});

test('existing profile: promoted with merge, createdAt/name untouched', async () => {
  h.fbState.data.users = { u1: { role: 'teacher', name: 'Original', createdAt: 'old' } };
  const r = await sync({ idToken: 'boss' });
  assert.equal(r.body.changed, true);
  const w = h.fbState.writes.at(-1);
  assert.deepEqual(w.opts, { merge: true });
  assert.ok(!('createdAt' in w.data) && !('name' in w.data));
  assert.equal(h.fbState.data.users.u1.name, 'Original');
});

test('already-active admin: no write', async () => {
  h.fbState.data.users = { u1: { role: 'Admin', accountStatus: 'active' } };
  const r = await sync({ idToken: 'boss' });
  assert.equal(r.body.changed, false);
  assert.equal(h.fbState.writes.length, 0);
});

test('unverified email is ignored', async () => {
  for (const t of ['unverified', 'noflag']) {
    const r = await sync({ idToken: t });
    assert.equal(r.status, 200);
    assert.equal(r.body.changed, false);
  }
  assert.equal(h.fbState.writes.length, 0);
});

test('unlisted or missing email is ignored', async () => {
  for (const t of ['stranger', 'noemail']) {
    const r = await sync({ idToken: t });
    assert.equal(r.body.changed, false);
  }
  assert.equal(h.fbState.writes.length, 0);
});

test('no-op when ADMIN_EMAILS is empty', async () => {
  h.setEnv({ ...h.FIREBASE_ON, ADMIN_EMAILS: ' , ' });
  const r = await sync({ idToken: 'boss' });
  assert.equal(r.status, 200);
  assert.equal(r.body.changed, false);
  assert.equal(h.fbState.writes.length, 0);
});

test('no-op when ADMIN_EMAILS is unset', async () => {
  h.setEnv({ ...h.FIREBASE_ON });
  const r = await sync({ idToken: 'boss' });
  assert.equal(r.body.changed, false);
  assert.equal(h.fbState.writes.length, 0);
});

test('missing token → 401', async () => {
  assert.equal((await sync({})).status, 401);
  assert.equal((await h.post(app, '/api/auth/sync-role', undefined)).status, 401);
});

test('invalid or expired token → 401', async () => {
  h.fbState.tokens.expired = Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
  assert.equal((await sync({ idToken: 'forged' })).status, 401);
  assert.equal((await sync({ idToken: 'expired' })).status, 401);
  assert.equal(h.fbState.writes.length, 0);
});
