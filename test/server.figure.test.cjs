'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeEach(() => {
  h.resetAll();
  h.setEnv({ OPENROUTER_API_KEY: 'sk-server', ...h.FIREBASE_ON });
  h.seedUsers();
});

const call = (body) => h.post(app, '/api/teacher/figure-from-image', body);

test('teacher: the picture goes to the AI as an image and figures come back cleaned', async () => {
  h.ai.reply(JSON.stringify({
    figures: [
      { type: 'plot', axes: false, polygons: [{ vertices: [{ x: 0, y: 0, label: 'A', mark: 'right' }] }], evil: 'data:image/png;base64,AAAA' },
      { type: 'script', code: 'alert(1)' },
    ],
    note: '',
  }).replace('"A"', '"A","angleLabel":"$\\theta$"').replace('\\\\theta', '\\theta'));
  const r = await call({ idToken: 'tea', image: IMG, hint: '直角三角形' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.figures.length, 1);
  assert.equal(r.body.figures[0].type, 'plot');
  assert.equal(r.body.figures[0].evil, undefined);
  assert.equal(r.body.figures[0].polygons[0].vertices[0].angleLabel, '$\\theta$');
  const msg = h.ai.last.body.messages.at(-1);
  assert.ok(Array.isArray(msg.content));
  assert.equal(msg.content[1].type, 'image_url');
  assert.equal(msg.content[1].image_url.url, IMG);
  assert.match(msg.content[0].text, /直角三角形/);
});

test('students cannot use it', async () => {
  const r = await call({ idToken: 'stu', image: IMG });
  assert.equal(r.status, 403);
  assert.equal(h.ai.calls.length, 0);
});

test('signed-out requests and non-images are rejected before any AI call', async () => {
  assert.equal((await call({ image: IMG })).status, 401);
  assert.equal((await call({ idToken: 'tea', image: 'https://example.com/x.png' })).status, 400);
  assert.equal((await call({ idToken: 'tea', image: 'data:text/html;base64,PGgxPg==' })).status, 400);
  assert.equal(h.ai.calls.length, 0);
});

test('no recognisable figure → 422 with the AI note', async () => {
  h.ai.reply('{"figures":[],"note":"這不是數學圖"}');
  const r = await call({ idToken: 'tea', image: IMG });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /不是數學圖/);
});
