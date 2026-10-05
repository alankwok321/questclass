'use strict';
// Loads server.js against the fake express / firebase-admin modules in test/fakes/modules
// and gives tests a way to call route handlers directly.
const path = require('path');
const fs = require('fs');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..');
const FAKES = path.join(__dirname, '..', 'fakes', 'modules');
const WEB_DIST = path.join(ROOT, 'web', 'dist');

// Point bare-module resolution at the fakes (works without setting NODE_PATH on the command line).
process.env.NODE_PATH = [FAKES, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

const fbState = require(path.join(FAKES, 'firebase-admin', 'state.js'));

// Every env var server.js reads. Cleared so the developer's shell can't change results.
const ENV_KEYS = [
  'PORT', 'VERCEL', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_BASE_URL', 'OPENROUTER_BASE_URL', 'AI_MODEL',
  'AI_CONFIG_ENCRYPTION_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_APP_ID',
  'FIREBASE_MEASUREMENT_ID', 'ADMIN_EMAILS', 'AI_ALLOWED_HOSTS',
];
const FIREBASE_ON = { FIREBASE_API_KEY: 'web-api-key', FIREBASE_PROJECT_ID: 'questclass', FIREBASE_APP_ID: '1:2:web:3' };

function setEnv(vars = {}) {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.VERCEL = '1';
  for (const [k, v] of Object.entries(vars)) if (v !== undefined && v !== null) process.env[k] = String(v);
}

// --- outgoing AI calls ---
const ai = {
  calls: [],
  responder: null,
  reply(text) { ai.responder = () => ({ status: 200, body: { choices: [{ message: { content: text } }] } }); },
  reset() { ai.calls = []; ai.reply('好的'); },
  get last() { return ai.calls[ai.calls.length - 1]; },
};
ai.reset();
global.fetch = async (url, init = {}) => {
  let parsed = null;
  if (init.body) { try { parsed = JSON.parse(String(init.body)); } catch { parsed = String(init.body); } }
  const call = { url: String(url), headers: init.headers || {}, body: parsed };
  ai.calls.push(call);
  const r = ai.responder(call);
  const raw = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => raw, json: async () => JSON.parse(raw) };
};

// --- virtual web/dist (the Vite build is not present in the repo) ---
let spaIndexHtml = null;
const realExists = fs.existsSync;
const realRead = fs.readFileSync;
const inDist = (p) => typeof p === 'string' && (p === WEB_DIST || p.startsWith(WEB_DIST + path.sep));
fs.existsSync = function (p) {
  if (inDist(p)) {
    if (spaIndexHtml == null) return false;
    return p === WEB_DIST || p === path.join(WEB_DIST, 'index.html');
  }
  return realExists.apply(this, arguments);
};
fs.readFileSync = function (p, ...rest) {
  if (inDist(p) && spaIndexHtml != null && p === path.join(WEB_DIST, 'index.html')) return spaIndexHtml;
  return realRead.call(this, p, ...rest);
};
function setSpaIndex(html) { spaIndexHtml = html; }

function loadServer({ env = {}, spaIndex = null } = {}) {
  setEnv(env);
  setSpaIndex(spaIndex);
  const express = require('express');
  const app = require(path.join(ROOT, 'server.js'));
  if (app !== express.lastApp) throw new Error('server.js did not export the express app');
  return app;
}

function makeRes() {
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    contentType: undefined,
    status(c) { res.statusCode = c; return res; },
    type(t) { res.contentType = t; return res; },
    set(k, v) { res.headers[k] = v; return res; },
    json(d) { res.body = d; res.contentType = res.contentType || 'json'; resolve(); return res; },
    send(s) { res.body = s; resolve(); return res; },
  };
  return { res, done };
}

async function call(app, method, routePath, { body, path: reqPath } = {}) {
  const handler = app.routes[`${method} ${routePath}`];
  if (!handler) throw new Error(`No handler for ${method} ${routePath}`);
  const { res, done } = makeRes();
  const req = { method, body: body === undefined ? {} : body, path: reqPath || routePath, headers: {}, query: {} };
  await Promise.race([Promise.all([handler(req, res), done]), new Promise((_, rej) => setTimeout(() => rej(new Error('handler did not respond')), 2000))]);
  return { status: res.statusCode, body: res.body, type: res.contentType };
}

const post = (app, p, body) => call(app, 'POST', p, { body });
const get = (app, reqPath) => call(app, 'GET', reqPath);
// GET through the catch-all route, as Express would for a path without its own handler.
const getFallback = (app, reqPath) => call(app, 'GET', '*', { path: reqPath });

// Standard users: token string === uid.
function seedUsers(extra = {}) {
  const users = {
    stu: { email: 'stu@school.hk', role: 'student' },
    stu2: { email: 'stu2@school.hk', role: 'student' },
    tea: { email: 'tea@school.hk', role: 'Teacher' },
    adm: { email: 'adm@school.hk', role: 'admin' },
    par: { email: 'par@school.hk', role: 'parent' },
    sus: { email: 'sus@school.hk', role: 'student', accountStatus: 'suspended' },
    newbie: { email: 'newbie@school.hk', role: null },
    ...extra,
  };
  for (const [uid, u] of Object.entries(users)) {
    fbState.tokens[uid] = { uid, email: u.email, email_verified: u.email_verified !== false, name: u.name };
    if (u.role) {
      fbState.data.users = fbState.data.users || {};
      fbState.data.users[uid] = {
        role: u.role, email: u.email,
        ...(u.accountStatus ? { accountStatus: u.accountStatus } : {}),
        ...(u.schoolId ? { schoolId: u.schoolId } : {}),
        ...(u.platformAdmin ? { platformAdmin: true } : {}),
      };
    }
  }
  const expired = new Error('Firebase ID token has expired.');
  expired.code = 'auth/id-token-expired';
  fbState.tokens.expired = expired;
}

function resetAll() {
  fbState.reset();
  ai.reset();
}

module.exports = { loadServer, setEnv, setSpaIndex, call, post, get, getFallback, ai, fbState, seedUsers, resetAll, FIREBASE_ON, ROOT };
