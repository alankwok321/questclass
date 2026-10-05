'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers/server-harness.cjs');

const INDEX = '<!doctype html><script type="module" src="/assets/index-abc.js"></script><link href="/assets/index.css">';
const app = h.loadServer({ spaIndex: INDEX });
beforeEach(() => {
  h.resetAll();
  h.setEnv({});
  h.setSpaIndex(INDEX);
});

// Every <Route path> in web/src/App.jsx must be served by the SPA fallback.
const appJsx = fs.readFileSync(path.join(h.ROOT, 'web', 'src', 'App.jsx'), 'utf8');
const appRoutes = [...appJsx.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
  .map((p) => p.replace(/\/\*$/, '/some/nested'));

const mustServe = ['/', '/dashboard', '/teacher', '/student', '/admin', '/chat', '/analytics', '/teacher-homework', '/student-homework',
  '/teacher-question-bank', '/classroom', '/assignments', '/progress', '/reports', '/parents', '/parent', '/teacher-homework-legacy',
  '/teacher-homework-old/x', '/teacher-homework/123', '/student-homework/abc', '/teacher-question-bank/new', '/app', '/app/anything',
  '/dashboard/', '/parent/'];

for (const p of [...new Set([...mustServe, ...appRoutes])]) {
  test(`SPA fallback serves index.html for ${p}`, async () => {
    const r = await h.getFallback(app, p);
    assert.equal(r.status, 200);
    assert.equal(r.type, 'html');
    assert.match(r.body, /\/web\/assets\/index-abc\.js/);
    assert.doesNotMatch(r.body, /"\/assets\//);
  });
}

test('App.jsx route list was found (sanity)', () => {
  assert.ok(appRoutes.length >= 15, `found ${appRoutes.length}`);
});

for (const p of ['/api/unknown', '/api/chat/extra', '/api/']) {
  test(`unknown API path ${p} → 404 JSON`, async () => {
    const r = await h.getFallback(app, p);
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: 'Not found' });
  });
}

for (const p of ['/nope', '/parentx', '/teacher-homeworkx-evil', '/index.html', '/teacher.html']) {
  test(`unknown page ${p} → 404 (no redirect loop)`, async () => {
    const r = await h.getFallback(app, p);
    assert.equal(r.status, 404);
  });
}

test('without a web build, app routes 404 instead of looping', async () => {
  h.setSpaIndex(null);
  const r = await h.getFallback(app, '/dashboard');
  assert.equal(r.status, 404);
});

test('GET /api/health', async () => {
  const r = await h.get(app, '/api/health');
  assert.equal(r.body.status, 'ok');
});

const SECRETS = {
  OPENROUTER_API_KEY: 'sk-or-SECRET1', OPENAI_API_KEY: 'sk-oa-SECRET2', AI_CONFIG_ENCRYPTION_KEY: 'enc-SECRET3',
  FIREBASE_SERVICE_ACCOUNT_JSON: '{"private_key":"pk-SECRET4"}', ADMIN_EMAILS: 'boss-SECRET5@school.hk',
  OPENAI_BASE_URL: 'https://internal-SECRET6.example',
};

test('runtime-config never exposes secret env vars', async () => {
  h.setEnv({ ...h.FIREBASE_ON, ...SECRETS });
  const r = await h.get(app, '/api/runtime-config');
  assert.equal(r.body.firebaseEnabled, true);
  assert.equal(r.body.aiConfigured, true);
  assert.equal(r.body.firebase.projectId, 'questclass');
  const s = JSON.stringify(r.body);
  for (const v of Object.values(SECRETS)) assert.ok(!s.includes(v.replace(/"/g, '\\"')) && !s.includes('SECRET'), `leaked ${v}`);
});

test('runtime-config with Firebase off', async () => {
  const r = await h.get(app, '/api/runtime-config');
  assert.deepEqual(r.body, { firebase: null, firebaseEnabled: false, aiConfigured: false });
});

test('/js/firebase-config.js only contains the public web config', async () => {
  h.setEnv({ ...h.FIREBASE_ON, ...SECRETS });
  const r = await h.get(app, '/js/firebase-config.js');
  assert.equal(r.type, 'application/javascript');
  assert.match(r.body, /^window\.QUESTCLASS_FIREBASE_CONFIG = \{/);
  assert.ok(!r.body.includes('SECRET'));
  h.setEnv({});
  const off = await h.get(app, '/js/firebase-config.js');
  assert.equal(off.body, 'window.QUESTCLASS_FIREBASE_CONFIG = null;');
});

test('server does not listen when VERCEL is set', () => {
  assert.equal(app.listening, false);
});
