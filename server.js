const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const app = express();
const PORT = process.env.PORT || 18890;
const publicDir = path.join(__dirname, 'public');

app.use(express.json({ limit: '2mb' }));

function getFirebaseRuntimeConfig() {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
  };

  const enabled = Boolean(config.apiKey && config.projectId && config.appId);
  return {
    enabled,
    firebase: enabled ? config : null
  };
}

function getServerProviderConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '',
    apiBaseUrl: (process.env.OPENAI_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    model: process.env.AI_MODEL || 'openai/gpt-4.1-mini',
    source: 'server',
  };
}

// AI providers the server will talk to. Without this, anyone could use the server to send
// requests to any address (including internal ones). Extend with AI_ALLOWED_HOSTS (comma-separated).
function allowedProviderHosts() {
  const hosts = new Set(['openrouter.ai', 'api.openai.com', 'api.deepseek.com', 'generativelanguage.googleapis.com', 'api.groq.com', 'api.together.xyz', 'api.mistral.ai']);
  for (const v of [process.env.OPENAI_BASE_URL, process.env.OPENROUTER_BASE_URL]) {
    try { if (v) hosts.add(new URL(v).hostname.toLowerCase()); } catch { /* ignore */ }
  }
  String(process.env.AI_ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean).forEach((h) => hosts.add(h));
  return hosts;
}

function isAllowedProviderUrl(raw) {
  try {
    const u = new URL(String(raw || ''));
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
      && allowedProviderHosts().has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function providerUrlError() {
  const err = new Error('不支援這個 AI 服務網址（只接受已允許的 https 服務，例如 https://openrouter.ai/api/v1）');
  err.status = 400;
  return err;
}

// ── School AI settings ──────────────────────────────────────────────────────
// Each school has its own AI key, set by that school's admin on the 「AI 設定」 page and stored
// encrypted in Firestore (schoolSecrets/{schoolId}, server-only). If a school has no key, the
// OPENROUTER_API_KEY / AI_MODEL env vars are used when set. Keys sent by browsers are ignored.
async function readSchoolAiSettings(schoolId) {
  if (!schoolId) return null;
  const { db } = getFirebaseAdmin();
  const snap = await db.collection('schoolSecrets').doc(String(schoolId)).get();
  return snap.exists ? (snap.data() || {}) : null;
}

async function getSchoolProviderConfig(schoolId) {
  const env = getServerProviderConfig();
  let cfg = { ...env, source: env.apiKey ? 'env' : 'none' };
  let stored = null;
  try {
    stored = await readSchoolAiSettings(schoolId);
  } catch {
    stored = null; // no Firestore access (e.g. demo mode): use the env vars
  }
  if (stored?.provider?.mode === 'chatgpt') {
    const cred = await getChatgptCredential(schoolId, stored);
    return { mode: 'chatgpt', apiKey: cred.access, accountId: cred.accountId, apiBaseUrl: CHATGPT.baseUrl,
      model: String(stored.provider.model || CHATGPT_DEFAULT_MODEL), source: 'chatgpt' };
  }
  if (stored) {
    const base = String(stored?.provider?.apiBaseUrl || env.apiBaseUrl).replace(/\/+$/, '');
    const model = String(stored?.provider?.model || env.model).trim();
    let key = '';
    if (stored?.secret?.ciphertext) {
      try {
        key = decryptApiKey(stored.secret);
      } catch (e) {
        throw httpError(500, '無法讀取已儲存的 AI key（請檢查 AI_CONFIG_ENCRYPTION_KEY）：' + (e?.message || 'decrypt failed'));
      }
    }
    if (key) {
      if (!isAllowedProviderUrl(base)) throw providerUrlError();
      cfg = { apiKey: key, apiBaseUrl: base, model, source: 'school' };
    } else if (env.apiKey) {
      cfg = { ...env, model: model || env.model, source: 'env' };
    }
  }
  return cfg;
}

function getEncryptionKey() {
  const raw = process.env.AI_CONFIG_ENCRYPTION_KEY || '';
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptApiKey(value) {
  const key = getEncryptionKey();
  if (!key) throw httpError(503, '伺服器未設定 AI_CONFIG_ENCRYPTION_KEY，無法儲存 API Key');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
}

function decryptApiKey(payload = {}) {
  const key = getEncryptionKey();
  if (!key) throw new Error('AI_CONFIG_ENCRYPTION_KEY is not configured');
  const iv = Buffer.from(payload.iv || '', 'base64');
  const tag = Buffer.from(payload.tag || '', 'base64');
  const data = Buffer.from(payload.ciphertext || '', 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return out.toString('utf8');
}

// ── Codex via ChatGPT sign-in ───────────────────────────────────────────────
// Same device-code login as the pi coding agent (and Codex CLI): the admin signs in to ChatGPT, and
// the school's AI requests then run on that ChatGPT subscription through the Codex backend.
// Unofficial: OpenAI may change or block it.
const CHATGPT = {
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  deviceUserCodeUrl: 'https://auth.openai.com/api/accounts/deviceauth/usercode',
  deviceTokenUrl: 'https://auth.openai.com/api/accounts/deviceauth/token',
  verificationUri: 'https://auth.openai.com/codex/device',
  deviceRedirectUri: 'https://auth.openai.com/deviceauth/callback',
  responsesUrl: 'https://chatgpt.com/backend-api/codex/responses',
  baseUrl: 'https://chatgpt.com/backend-api',
  originator: 'pi',
};
// Models available to ChatGPT-subscription Codex (from pi's list; there is no live list endpoint).
const CHATGPT_CODEX_MODELS = [
  { id: 'gpt-5.5', name: 'GPT-5.5', contextLength: 272000 },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextLength: 272000 },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextLength: 272000 },
  { id: 'gpt-6-sol', name: 'GPT-6 Sol', contextLength: 272000 },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna', contextLength: 272000 },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', contextLength: 272000 },
  { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', contextLength: 272000 },
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', contextLength: 128000 },
];
const CHATGPT_DEFAULT_MODEL = 'gpt-5.5';

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1] || '';
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function chatgptTokenRequest(params) {
  const response = await fetch(CHATGPT.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CHATGPT.clientId, ...params }).toString(),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw httpError(response.status === 400 || response.status === 401 ? 401 : 502, 'ChatGPT 登入已失效，請在 AI 設定重新登入');
  }
  const accountId = decodeJwtPayload(data.access_token)?.['https://api.openai.com/auth']?.chatgpt_account_id;
  if (!accountId) throw httpError(502, '無法讀取 ChatGPT 帳戶資料');
  const idClaims = decodeJwtPayload(data.id_token) || {};
  const profile = decodeJwtPayload(data.access_token)?.['https://api.openai.com/profile'] || {};
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000,
    accountId,
    email: String(idClaims.email || profile.email || ''),
  };
}

// The school's ChatGPT credential, refreshed (and saved) when it is about to expire.
async function getChatgptCredential(schoolId, stored) {
  if (!stored?.chatgpt?.secret?.ciphertext) throw httpError(400, '尚未登入 ChatGPT');
  let cred;
  try {
    cred = JSON.parse(decryptApiKey(stored.chatgpt.secret));
  } catch {
    throw httpError(500, '無法讀取已儲存的 ChatGPT 登入（請檢查 AI_CONFIG_ENCRYPTION_KEY）');
  }
  if (!cred.expires || cred.expires - Date.now() < 3 * 60 * 1000) {
    const next = await chatgptTokenRequest({ grant_type: 'refresh_token', refresh_token: cred.refresh });
    cred = { ...cred, ...next, email: next.email || cred.email };
    const { db } = getFirebaseAdmin();
    await db.collection('schoolSecrets').doc(String(schoolId)).set({ chatgpt: { ...stored.chatgpt, secret: encryptApiKey(JSON.stringify(cred)) } }, { merge: true });
  }
  return cred;
}

// One request to the Codex backend (streamed; the text deltas are joined).
async function callChatgptCodex({ system, user, history = [], apiKey, accountId, model, responseFormat }) {
  const content = (role, text) => ({ role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: String(text || '') }] });
  try {
    const response = await fetch(CHATGPT.responsesUrl, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'chatgpt-account-id': accountId,
        originator: CHATGPT.originator,
        'OpenAI-Beta': 'responses=experimental',
        accept: 'text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        stream: true,
        instructions: system || 'You are a helpful assistant.',
        input: [...history.map((m) => content(m.role, m.content)), content('user', user)],
        ...(responseFormat?.type === 'json_object' ? { text: { format: { type: 'json_object' } } } : {}),
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      let msg = '';
      try { const d = JSON.parse(raw); msg = d?.error?.message || d?.detail || ''; } catch { /* not JSON */ }
      if (response.status === 401) msg = 'ChatGPT 登入已失效，請在 AI 設定重新登入';
      if (response.status === 429) msg = msg || '已達 ChatGPT 方案的使用上限，請稍後再試';
      return { ok: false, status: response.status, error: String(msg || `ChatGPT 回應錯誤（${response.status}）`).slice(0, 300) };
    }
    let text = '';
    let finalText = '';
    let failure = '';
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:')) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string') text += ev.delta;
      if ((ev.type === 'response.completed' || ev.type === 'response.done') && Array.isArray(ev.response?.output)) {
        finalText = ev.response.output.flatMap((o) => (Array.isArray(o?.content) ? o.content : []))
          .filter((c) => c?.type === 'output_text').map((c) => c.text || '').join('');
      }
      if (ev.type === 'response.failed' || ev.type === 'error') failure = ev.response?.error?.message || ev.error?.message || ev.message || 'ChatGPT 回應失敗';
    }
    if (failure && !text && !finalText) return { ok: false, status: 502, error: String(failure).slice(0, 300) };
    return { ok: true, status: 200, text: text || finalText };
  } catch (error) {
    return { ok: false, status: 502, error: '無法連線到 ChatGPT：' + error.message };
  }
}

function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    const projectId = process.env.FIREBASE_PROJECT_ID || undefined;
    if (serviceAccountJson) {
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId });
    } else {
      // Without a service account, ID-token checks still need the project ID (e.g. on Vercel).
      initializeApp(projectId ? { projectId } : undefined);
    }
  }
  return {
    auth: getAuth(),
    db: getFirestore()
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function verifyUserFromToken(idToken) {
  if (!idToken) return null;
  const { auth, db } = getFirebaseAdmin();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    throw httpError(401, '登入已過期，請重新登入');
  }
  let userSnap;
  try {
    userSnap = await db.collection('users').doc(decoded.uid).get();
  } catch (e) {
    // Usually FIREBASE_SERVICE_ACCOUNT_JSON is missing on the server.
    throw httpError(500, '伺服器無法讀取 Firestore（請檢查 FIREBASE_SERVICE_ACCOUNT_JSON 設定）：' + (e?.message || 'unknown error'));
  }
  const profile = userSnap.exists ? userSnap.data() : {};
  return {
    uid: decoded.uid,
    email: decoded.email || '',
    role: String(profile?.role || 'student').trim().toLowerCase(),
    accountStatus: String(profile?.accountStatus || 'active').trim().toLowerCase(),
    schoolId: String(profile?.schoolId || ''),
    platformAdmin: profile?.platformAdmin === true,
  };
}

// Admin-SDK endpoints bypass the Firestore rules, so they must check the account status themselves.
function requireActive(actor) {
  if (actor && actor.accountStatus && actor.accountStatus !== 'active') {
    throw httpError(403, actor.accountStatus === 'suspended' ? '此帳號已停用' : '帳戶審核中，暫時不能使用這個功能');
  }
}

function sendError(res, e, fallback) {
  return res.status(e?.status || 500).json({ error: e?.message || fallback });
}

// Same page permissions as web/src/permissions.js, applied to the AI endpoints.
const AI_ROLES = {
  chat: ['admin', 'teacher', 'student'],
  lessonLoop: ['admin', 'teacher'],
};

// Who may use AI, and with which settings. Always the school's settings; never a browser-sent key.
async function resolveProviderConfig(body = {}, allowedRoles = null) {
  const firebaseOn = getFirebaseRuntimeConfig().enabled;
  if (firebaseOn) {
    if (!body?.idToken) throw httpError(401, '請先登入才能使用 AI 功能');
    const actor = await verifyUserFromToken(body.idToken); // 401 bad token, 500 config problem
    if (actor.accountStatus === 'suspended' || actor.accountStatus === 'review') {
      throw httpError(403, actor.accountStatus === 'suspended' ? '此帳號已停用' : '帳戶審核中，暫時不能使用 AI 功能');
    }
    if (allowedRoles && !allowedRoles.includes(actor.role)) throw httpError(403, '你的角色不能使用這個 AI 功能');
    // The platform admin uses the AI key of the school they are working in.
    const schoolId = actor.platformAdmin && body.schoolId ? String(body.schoolId) : actor.schoolId;
    return getSchoolProviderConfig(schoolId);
  }
  return getSchoolProviderConfig(null);
}

// Keep the last few turns so the assistant remembers the conversation (bounded for cost).
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
}

// Codex models only work through OpenAI's Responses API, not chat completions.
function usesResponsesApi(model) {
  return /codex/i.test(String(model || ''));
}

async function callResponsesApi({ system, user, history = [], apiKey, apiBaseUrl, model, responseFormat }) {
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  try {
    const response = await fetch(base + '/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model,
        ...(system ? { instructions: system } : {}),
        input: [...history, { role: 'user', content: user }],
        ...(responseFormat?.type === 'json_object' ? { text: { format: { type: 'json_object' } } } : {}),
      }),
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = {}; }
    if (!response.ok) {
      const upstreamMsg = typeof data.error?.message === 'string' ? data.error.message.slice(0, 300) : '';
      return { ok: false, status: response.status, error: upstreamMsg || `AI 服務回應錯誤（${response.status}）`, usedBaseUrl: base };
    }
    // The text is in output[].content[] items of type "output_text".
    const text = typeof data.output_text === 'string' ? data.output_text
      : (Array.isArray(data.output) ? data.output : [])
        .flatMap((o) => (Array.isArray(o?.content) ? o.content : []))
        .filter((c) => c?.type === 'output_text' && typeof c.text === 'string')
        .map((c) => c.text).join('');
    return { ok: true, status: 200, text, data, usedBaseUrl: base };
  } catch (error) {
    return { ok: false, status: 500, error: error.message, usedBaseUrl: base };
  }
}

async function callChatCompletion({ system, user, history = [], apiKey, apiBaseUrl, model, temperature = 0.7, responseFormat, mode, accountId }) {
  if (!apiKey) return { ok: false, status: 400, error: 'AI provider is not configured. Set an API key first.' };
  if (mode === 'chatgpt') return callChatgptCodex({ system, user, history, apiKey, accountId, model, responseFormat });
  if (usesResponsesApi(model)) return callResponsesApi({ system, user, history, apiKey, apiBaseUrl, model, responseFormat });

  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  const candidates = [base];
  // Common OpenAI-compatible deployments expect /v1 prefix.
  if (base && !/\/v\d+$/.test(base) && !base.endsWith('/v1')) candidates.push(base + '/v1');

  try {
    let last = null;
    for (const b of candidates) {
      const response = await fetch(b + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model,
          temperature,
          response_format: responseFormat,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            ...history,
            { role: 'user', content: user },
          ],
        }),
      });

      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = { raw }; }
      if (response.ok) {
        const text = data.choices?.[0]?.message?.content || '';
        return { ok: true, status: 200, text, data, usedBaseUrl: b };
      }

      // Only pass on the provider's own error message, never its raw response body.
      const upstreamMsg = typeof data.error?.message === 'string' ? data.error.message.slice(0, 300) : '';
      last = { status: response.status, error: upstreamMsg || `AI 服務回應錯誤（${response.status}）`, usedBaseUrl: b };
      // Only fallback baseUrl variants on 404/405.
      if (![404, 405].includes(response.status)) break;
    }

    return { ok: false, status: last?.status || 500, error: last?.error || 'Upstream API error', usedBaseUrl: last?.usedBaseUrl || base };
  } catch (error) {
    return { ok: false, status: 500, error: error.message, usedBaseUrl: base };
  }
}

app.get('/js/firebase-config.js', (req, res) => {
  const runtime = getFirebaseRuntimeConfig();
  res.type('application/javascript').send(`window.QUESTCLASS_FIREBASE_CONFIG = ${JSON.stringify(runtime.firebase)};`);
});

app.get('/api/runtime-config', (req, res) => {
  const firebase = getFirebaseRuntimeConfig();
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.AI_CONFIG_ENCRYPTION_KEY);
  res.json({
    firebase: firebase.firebase,
    firebaseEnabled: firebase.enabled,
    aiConfigured
  });
});

// Accounts listed in ADMIN_EMAILS (comma-separated) become admin when they sign in.
// Needs FIREBASE_SERVICE_ACCOUNT_JSON so the server can write to Firestore.
function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

// ── Login records (分析) ───────────────────────────────────────────────────
// One document per person per Hong Kong day: loginDays/{uid}_{YYYY-MM-DD} { count, first, last }.
// Opening the app again within 30 minutes counts as the same visit.
const HK_OFFSET_MS = 8 * 3600 * 1000;
const hkDay = (ms = Date.now()) => new Date(ms + HK_OFFSET_MS).toISOString().slice(0, 10);
const VISIT_GAP_MS = 30 * 60 * 1000;

async function recordLogin(db, uid, now = Date.now()) {
  const user = (await db.collection('users').doc(uid).get()).data();
  if (!user || !user.schoolId || user.platformAdmin === true) return;
  const day = hkDay(now);
  const ref = db.collection('loginDays').doc(`${uid}_${day}`);
  const prev = (await ref.get()).data();
  const lastMs = prev?.lastMs || 0;
  if (prev && now - lastMs < VISIT_GAP_MS) {
    await ref.set({ lastMs: now }, { merge: true });
  } else {
    await ref.set({
      uid, schoolId: user.schoolId, role: String(user.role || 'student').toLowerCase(), class: String(user.class || ''),
      day, count: (prev?.count || 0) + 1, firstMs: prev?.firstMs || now, lastMs: now,
    }, { merge: true });
  }
  await db.collection('users').doc(uid).set({ lastLoginAt: new Date(now).toISOString() }, { merge: true });
}

// Login statistics for a school: per day and per person, for the last N days (max 90).
app.post('/api/analytics/logins', async (req, res) => {
  try {
    const body = req.body || {};
    const actor = await verifyUserFromToken(body.idToken);
    if (!actor) throw httpError(401, '請先登入');
    requireActive(actor);
    if (actor.role !== 'admin') throw httpError(403, '只有管理員可以查看登入紀錄');
    const schoolId = actor.platformAdmin && body.schoolId ? String(body.schoolId) : actor.schoolId;
    if (!schoolId) throw httpError(400, actor.platformAdmin ? '請先選擇學校' : '你的帳戶尚未加入學校');
    const daysWanted = Math.max(1, Math.min(90, Number(body.days) || 30));
    const { db } = getFirebaseAdmin();
    const now = Number(body.now) && process.env.NODE_ENV === 'test' ? Number(body.now) : Date.now();
    const days = Array.from({ length: daysWanted }, (_, i) => hkDay(now - (daysWanted - 1 - i) * 86400000));

    // A teacher limited to some classes sees the students of those classes (and all staff).
    let limit = null;
    if (actor.role === 'teacher') {
      const me = (await db.collection('users').doc(actor.uid).get()).data() || {};
      if (Array.isArray(me.teacherClasses)) limit = new Set(me.teacherClasses.map((c) => String(c).trim().toLowerCase()));
    }
    const visible = (u) => !limit || String(u.role || 'student').toLowerCase() !== 'student' || limit.has(String(u.class || '').trim().toLowerCase());

    const userSnap = await db.collection('users').where('schoolId', '==', schoolId).get();
    const people = userSnap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => u.platformAdmin !== true && visible(u))
      .map((u) => ({
        uid: u.uid, name: u.name || u.email || '—', email: u.email || '', photoURL: u.photoURL || '',
        role: String(u.role || 'student').toLowerCase(), class: u.class || '', accountStatus: u.accountStatus || 'active',
        lastLoginAt: u.lastLoginAt || null, daysActive: 0, visits: 0,
      }));
    const byUid = new Map(people.map((p) => [p.uid, p]));

    const records = [];
    for (let i = 0; i < days.length; i += 30) {
      const snap = await db.collection('loginDays').where('schoolId', '==', schoolId).where('day', 'in', days.slice(i, i + 30)).get();
      snap.docs.forEach((d) => records.push(d.data()));
    }
    const perDay = Object.fromEntries(days.map((d) => [d, { day: d, total: 0, student: 0, teacher: 0, parent: 0, admin: 0, visits: 0 }]));
    for (const r of records) {
      const p = byUid.get(r.uid);
      if (!p || !perDay[r.day]) continue;
      p.daysActive += 1;
      p.visits += Number(r.count) || 0;
      const d = perDay[r.day];
      d.total += 1;
      d.visits += Number(r.count) || 0;
      if (d[p.role] != null) d[p.role] += 1;
    }
    return res.json({ ok: true, days: days.map((d) => perDay[d]), people, today: hkDay(now) });
  } catch (error) {
    return sendError(res, error, 'login statistics failed');
  }
});

app.post('/api/auth/sync-role', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(401).json({ error: 'Unauthorized' });
    const list = adminEmails();
    const { auth, db } = getFirebaseAdmin();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: 'Invalid auth token' });
    }
    const email = String(decoded.email || '').toLowerCase();
    // Every sign-in / app open is recorded for 分析 (login statistics), after any role change.
    const finish = async (payload) => {
      try { await recordLogin(db, decoded.uid); } catch { /* statistics only */ }
      return res.json(payload);
    };
    const ref = db.collection('users').doc(decoded.uid);
    // Only a Google-verified address counts.
    if (!email || decoded.email_verified !== true || !list.includes(email)) {
      // Added by a school admin (one by one or from Excel) before this person ever signed in.
      if (email && decoded.email_verified === true && !list.includes(email)) {
        try {
          const mine = (await ref.get()).data() || {};
          if (mine.pendingFirstLogin === true) {
            await ref.set({ pendingFirstLogin: FieldValue.delete(), accountStatus: 'active', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            return finish({ ok: true, changed: true, activated: true });
          } else if (await claimPrecreatedAccount(db, auth, decoded.uid, email)) {
            return finish({ ok: true, changed: true, invited: true });
          } else if (await applyInvite(db, decoded.uid, email)) {
            return finish({ ok: true, changed: true, invited: true });
          }
        } catch { /* sign-in still works */ }
      }
      // Removed from ADMIN_EMAILS: no longer a platform admin (their school role stays).
      if (!list.includes(email)) {
        const snap = await ref.get();
        if (snap.exists && snap.data()?.platformAdmin === true) {
          await ref.set({ platformAdmin: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return finish({ ok: true, changed: true, platformAdmin: false });
        }
      }
      return finish({ ok: true, changed: false });
    }

    const snap = await ref.get();
    const current = snap.exists ? String(snap.data()?.role || '').toLowerCase() : '';
    if (current === 'admin' && (snap.data()?.accountStatus || 'active') === 'active' && snap.data()?.platformAdmin === true) {
      return finish({ ok: true, changed: false });
    }

    // ADMIN_EMAILS accounts run the whole platform (create schools, move people between them).
    await ref.set({
      role: 'admin',
      accountStatus: 'active',
      platformAdmin: true,
      email: decoded.email,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { name: decoded.name || email.split('@')[0], createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    return finish({ ok: true, changed: true, role: 'admin', platformAdmin: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'role sync failed' });
  }
});

async function requireAdminActor(idToken) {
  const actor = await verifyUserFromToken(idToken);
  if (!actor) throw httpError(401, 'Unauthorized');
  requireActive(actor);
  if (actor.role !== 'admin') throw httpError(403, '只有管理員可以使用這個功能');
  return actor;
}

// A school admin acting on their own school, or the platform admin (who belongs to no school)
// acting on the school they picked. Returns the actor with schoolId = the school to act on.
async function requireSchoolAdmin(idToken, requestedSchoolId) {
  const actor = await requireAdminActor(idToken);
  if (actor.platformAdmin && requestedSchoolId) {
    const id = String(requestedSchoolId);
    const { db } = getFirebaseAdmin();
    if (!(await db.collection('schools').doc(id).get()).exists) throw httpError(404, '找不到這間學校');
    return { ...actor, schoolId: id };
  }
  if (!actor.schoolId) throw httpError(400, actor.platformAdmin ? '請先選擇學校' : '你的帳戶尚未加入學校');
  return actor;
}

async function requirePlatformAdmin(idToken) {
  const actor = await verifyUserFromToken(idToken);
  if (!actor) throw httpError(401, 'Unauthorized');
  requireActive(actor);
  if (!actor.platformAdmin) throw httpError(403, '只有平台管理員可以管理學校');
  return actor;
}

function maskKey(key) {
  const k = String(key || '');
  return k.length > 8 ? `${k.slice(0, 3)}…${k.slice(-4)}` : (k ? '已設定' : '');
}

// School admin: read their school's AI settings (never returns the key itself).
app.post('/api/admin/ai-settings/get', async (req, res) => {
  try {
    const actor = await requireSchoolAdmin((req.body || {}).idToken, (req.body || {}).schoolId);
    const env = getServerProviderConfig();
    const stored = await readSchoolAiSettings(actor.schoolId);
    return res.json({
      ok: true,
      provider: {
        apiBaseUrl: String(stored?.provider?.apiBaseUrl || env.apiBaseUrl),
        model: String(stored?.provider?.model || env.model),
      },
      hasKey: Boolean(stored?.secret?.ciphertext),
      mode: stored?.provider?.mode === 'chatgpt' ? 'chatgpt' : 'apikey',
      // The API-key setup to return to from Codex (ChatGPT) mode.
      apiKeyProvider: stored?.provider?.mode === 'chatgpt'
        ? (stored.apiKeyProvider ? { apiBaseUrl: stored.apiKeyProvider.apiBaseUrl, model: stored.apiKeyProvider.model } : null)
        : null,
      chatgpt: stored?.chatgpt?.secret?.ciphertext
        ? { connected: true, email: String(stored.chatgpt.email || ''), connectedAt: stored.chatgpt.connectedAt?.toDate ? stored.chatgpt.connectedAt.toDate().toISOString() : (stored.chatgpt.connectedAt || null) }
        : { connected: false },
      recentModels: Array.isArray(stored?.recentModels) ? stored.recentModels.slice(0, 8) : [],
      keyHint: String(stored?.keyHint || ''),
      envKeyConfigured: Boolean(env.apiKey),
      encryptionConfigured: Boolean(getEncryptionKey()),
      allowedHosts: [...allowedProviderHosts()].sort(),
      updatedBy: stored?.updatedByEmail || stored?.updatedBy || null,
      updatedAt: stored?.updatedAt?.toDate ? stored.updatedAt.toDate().toISOString() : (stored?.updatedAt || null),
    });
  } catch (error) {
    return sendError(res, error, 'get ai settings failed');
  }
});

// Admin: save the school AI settings. apiKey is optional (blank keeps the stored one);
// clearKey removes it (AI then falls back to OPENROUTER_API_KEY, if set).
app.post('/api/admin/ai-settings/save', async (req, res) => {
  try {
    const { idToken, schoolId, apiKey, apiBaseUrl, model, clearKey, mode } = req.body || {};
    const actor = await requireSchoolAdmin(idToken, schoolId);
    if (mode === 'chatgpt') {
      // Use the signed-in ChatGPT subscription (Codex) with this model.
      const cleanModel = String(model || CHATGPT_DEFAULT_MODEL).trim();
      if (!cleanModel || cleanModel.length > 200) throw httpError(400, '請選擇模型');
      const { db } = getFirebaseAdmin();
      const ref = db.collection('schoolSecrets').doc(actor.schoolId);
      const before = (await ref.get()).data() || {};
      if (!before.chatgpt?.secret?.ciphertext) throw httpError(400, '請先登入 ChatGPT');
      const recentModels = [cleanModel, ...(Array.isArray(before.recentModels) ? before.recentModels : [])]
        .filter((m, i, a) => m && a.indexOf(m) === i).slice(0, 8);
      await ref.set({
        schoolId: actor.schoolId,
        ...(before.provider && before.provider.mode !== 'chatgpt' ? { apiKeyProvider: before.provider } : {}),
        provider: { mode: 'chatgpt', apiBaseUrl: CHATGPT.baseUrl, model: cleanModel },
        recentModels, updatedBy: actor.uid, updatedByEmail: actor.email || '', updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return res.json({ ok: true });
    }
    if (clearKey && !String(apiKey || '').trim()) {
      // Remove the API key only; if the school is on Codex (ChatGPT), it stays there.
      const { db } = getFirebaseAdmin();
      const ref = db.collection('schoolSecrets').doc(actor.schoolId);
      const before = (await ref.get()).data() || {};
      await ref.set({
        secret: FieldValue.delete(), keyHint: '',
        ...(before.provider?.mode === 'chatgpt' ? {} : { provider: { ...(before.provider || {}), mode: 'apikey' } }),
        updatedBy: actor.uid, updatedByEmail: actor.email || '', updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return res.json({ ok: true });
    }
    const base = String(apiBaseUrl || 'https://openrouter.ai/api/v1').trim().replace(/\/+$/, '');
    if (!isAllowedProviderUrl(base)) throw providerUrlError();
    const cleanModel = String(model || '').trim();
    if (!cleanModel || cleanModel.length > 200) throw httpError(400, '請輸入模型名稱');
    const key = String(apiKey || '').trim();

    const { db } = getFirebaseAdmin();
    const ref = db.collection('schoolSecrets').doc(actor.schoolId);
    const before = (await ref.get()).data() || {};
    // Most recent first, so admins can switch back with one tap.
    const recentModels = [cleanModel, ...(Array.isArray(before.recentModels) ? before.recentModels : [])]
      .filter((m, i, a) => m && a.indexOf(m) === i).slice(0, 8);
    const update = {
      provider: { mode: 'apikey', apiBaseUrl: base, model: cleanModel },
      recentModels,
      updatedBy: actor.uid,
      updatedByEmail: actor.email || '',
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (key) {
      update.secret = encryptApiKey(key); // needs AI_CONFIG_ENCRYPTION_KEY
      update.keyHint = maskKey(key);
    } else if (clearKey) {
      update.secret = FieldValue.delete();
      update.keyHint = '';
    }
    await ref.set({ ...update, schoolId: actor.schoolId }, { merge: true });
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'save ai settings failed');
  }
});

// Admin: the models a provider offers, for the model picker. The school's saved key is only sent
// to the host it was saved for (never to another provider the admin is just browsing).
app.post('/api/admin/ai-settings/models', async (req, res) => {
  try {
    const { idToken, schoolId, apiBaseUrl, apiKey: typedKey, mode } = req.body || {};
    const actor = await requireSchoolAdmin(idToken, schoolId);
    const stored = await readSchoolAiSettings(actor.schoolId);
    if (mode === 'chatgpt') {
      if (!stored?.chatgpt?.secret?.ciphertext) throw httpError(400, '請先登入 ChatGPT，才會顯示可用的模型');
      return res.json({ ok: true, apiBaseUrl: CHATGPT.baseUrl, models: CHATGPT_CODEX_MODELS.map((m) => ({ ...m, promptPrice: null, completionPrice: null })) });
    }
    const env = getServerProviderConfig();
    // The provider the saved API key belongs to (while on Codex/ChatGPT, the one to switch back to).
    const keyProvider = stored?.provider?.mode === 'chatgpt' ? stored?.apiKeyProvider : stored?.provider;
    const savedBase = String(keyProvider?.apiBaseUrl || env.apiBaseUrl).replace(/\/+$/, '');
    const base = String(apiBaseUrl || savedBase).trim().replace(/\/+$/, '');
    if (!isAllowedProviderUrl(base)) throw providerUrlError();
    const host = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
    // A key the admin just typed (not saved yet) is used only for this request, to this provider.
    let key = String(typedKey || '').trim();
    if (!key && stored?.secret?.ciphertext && host(base) === host(savedBase)) {
      try { key = decryptApiKey(stored.secret); } catch { key = ''; }
    } else if (!key && env.apiKey && host(base) === host(env.apiBaseUrl)) {
      key = env.apiKey;
    }
    if (!key) throw httpError(400, '請先輸入 API Key，才會顯示可用的模型');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(base + '/models', {
        method: 'GET',
        headers: key ? { Authorization: 'Bearer ' + key } : {},
        signal: controller.signal,
      });
    } catch {
      throw httpError(502, '無法連線到 AI 服務，請稍後再試');
    } finally {
      clearTimeout(timer);
    }
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!response.ok) {
      const msg = typeof data?.error?.message === 'string' ? data.error.message.slice(0, 200) : '';
      throw httpError(response.status === 401 || response.status === 403 ? 400 : 502,
        response.status === 401 || response.status === 403 ? '這個服務需要先儲存它的 API Key，才能列出模型' : (msg || `AI 服務回應錯誤（${response.status}）`));
    }
    const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
    const perMillion = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 100) / 100 : null; };
    const models = list
      .map((m) => ({
        id: String(m?.id || m?.name || '').replace(/^models\//, ''),
        name: String(m?.name && m.name !== m.id ? m.name : '').slice(0, 120),
        contextLength: Number(m?.context_length || m?.context_window || 0) || null,
        promptPrice: perMillion(m?.pricing?.prompt),
        completionPrice: perMillion(m?.pricing?.completion),
      }))
      .filter((m) => m.id && m.id.length <= 200)
      .slice(0, 1000);
    return res.json({ ok: true, apiBaseUrl: base, usedSavedKey: Boolean(key), models });
  } catch (error) {
    return sendError(res, error, 'list models failed');
  }
});

// Admin: start "Sign in with ChatGPT" (device code). Returns a code to enter on OpenAI's page.
app.post('/api/admin/ai-settings/chatgpt/start', async (req, res) => {
  try {
    const actor = await requireSchoolAdmin((req.body || {}).idToken, (req.body || {}).schoolId);
    if (!getEncryptionKey()) throw httpError(503, '伺服器未設定 AI_CONFIG_ENCRYPTION_KEY，無法儲存登入');
    const response = await fetch(CHATGPT.deviceUserCodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CHATGPT.clientId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.device_auth_id || !data.user_code) throw httpError(502, '無法開始 ChatGPT 登入，請稍後再試');
    const { db } = getFirebaseAdmin();
    await db.collection('schoolSecrets').doc(actor.schoolId).set({
      schoolId: actor.schoolId,
      chatgptPending: { deviceAuthId: String(data.device_auth_id), userCode: String(data.user_code), startedAt: Date.now(), startedBy: actor.uid },
    }, { merge: true });
    return res.json({ ok: true, userCode: data.user_code, verificationUri: CHATGPT.verificationUri,
      interval: Math.max(3, Number(data.interval) || 5), expiresIn: 15 * 60 });
  } catch (error) {
    return sendError(res, error, 'chatgpt login start failed');
  }
});

// Admin: check once whether the ChatGPT sign-in was completed (the page calls this every few seconds).
app.post('/api/admin/ai-settings/chatgpt/poll', async (req, res) => {
  try {
    const actor = await requireSchoolAdmin((req.body || {}).idToken, (req.body || {}).schoolId);
    const { db } = getFirebaseAdmin();
    const ref = db.collection('schoolSecrets').doc(actor.schoolId);
    const stored = (await ref.get()).data() || {};
    const pending = stored.chatgptPending;
    if (!pending?.deviceAuthId) return res.json({ ok: true, status: 'none' });
    if (Date.now() - Number(pending.startedAt || 0) > 15 * 60 * 1000) {
      await ref.set({ chatgptPending: FieldValue.delete() }, { merge: true });
      return res.json({ ok: true, status: 'expired' });
    }
    const response = await fetch(CHATGPT.deviceTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_auth_id: pending.deviceAuthId, user_code: pending.userCode }),
    });
    if (response.status === 403 || response.status === 404) return res.json({ ok: true, status: 'pending' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof data?.error === 'object' ? data.error?.code : data?.error;
      if (code === 'deviceauth_authorization_pending' || code === 'slow_down') return res.json({ ok: true, status: 'pending' });
      await ref.set({ chatgptPending: FieldValue.delete() }, { merge: true });
      return res.json({ ok: true, status: 'failed', error: 'ChatGPT 登入失敗，請再試一次' });
    }
    if (!data.authorization_code || !data.code_verifier) throw httpError(502, 'ChatGPT 登入回應不完整');
    const cred = await chatgptTokenRequest({
      grant_type: 'authorization_code', code: data.authorization_code, code_verifier: data.code_verifier, redirect_uri: CHATGPT.deviceRedirectUri,
    });
    const keepModel = stored.provider?.mode === 'chatgpt' && stored.provider?.model ? stored.provider.model : CHATGPT_DEFAULT_MODEL;
    await ref.set({
      chatgpt: { secret: encryptApiKey(JSON.stringify(cred)), email: cred.email, connectedAt: FieldValue.serverTimestamp(), connectedBy: actor.uid },
      chatgptPending: FieldValue.delete(),
      // Remember the API-key setup so switching back is one tap.
      ...(stored.provider && stored.provider.mode !== 'chatgpt' ? { apiKeyProvider: stored.provider } : {}),
      // Signing in switches the school to Codex on that subscription.
      provider: { mode: 'chatgpt', apiBaseUrl: CHATGPT.baseUrl, model: keepModel },
      updatedBy: actor.uid, updatedByEmail: actor.email || '', updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return res.json({ ok: true, status: 'connected', email: cred.email });
  } catch (error) {
    return sendError(res, error, 'chatgpt login check failed');
  }
});

// Admin: sign out of ChatGPT. If the school was using it, AI goes back to the saved API key (if any).
app.post('/api/admin/ai-settings/chatgpt/disconnect', async (req, res) => {
  try {
    const actor = await requireSchoolAdmin((req.body || {}).idToken, (req.body || {}).schoolId);
    const { db } = getFirebaseAdmin();
    const ref = db.collection('schoolSecrets').doc(actor.schoolId);
    const stored = (await ref.get()).data() || {};
    const update = { chatgpt: FieldValue.delete(), chatgptPending: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() };
    if (stored.provider?.mode === 'chatgpt') {
      update.provider = stored.apiKeyProvider || { mode: 'apikey', apiBaseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' };
    }
    await ref.set(update, { merge: true });
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'chatgpt disconnect failed');
  }
});

// Admin: send a tiny request with the saved settings to check they work.
app.post('/api/admin/ai-settings/test', async (req, res) => {
  try {
    const actor = await requireSchoolAdmin((req.body || {}).idToken, (req.body || {}).schoolId);
    const cfg = await getSchoolProviderConfig(actor.schoolId);
    if (!cfg.apiKey) return res.status(400).json({ ok: false, error: '尚未設定 API Key' });
    const result = await callChatCompletion({ ...cfg, system: 'Reply with the single word: OK', user: 'ping', temperature: 0 });
    if (!result.ok) return res.status(result.status || 502).json({ ok: false, error: result.error });
    return res.json({ ok: true, model: cfg.model, source: cfg.source, reply: String(result.text || '').slice(0, 60) });
  } catch (error) {
    return sendError(res, error, 'ai test failed');
  }
});

// ── Schools ─────────────────────────────────────────────────────────────────
// schools/{id}: { name, shareQuestionBank }. Browsers may read them; only these endpoints write.
// Every user and every piece of school data carries a schoolId (see firestore.rules).

// User fields that are no longer used; removed when the first school is created.
const REMOVED_USER_FIELDS = ['requestedRole', 'learnerStage', 'roleNote', 'adminNote', 'disabledReason',
  'resolvedAt', 'issueFlag', 'studentId', 'classroomIds', 'classroomId'];

function cleanSchoolName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!n || n.length > 80) throw httpError(400, '請輸入學校名稱（最多 80 字）');
  return n;
}

async function inChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

// The first school takes over everything created before schools existed, and old user
// fields are removed. Safe to run again: it only touches documents without a schoolId.
async function adoptExistingData(db, schoolId) {
  const counts = {};
  const users = await db.collection('users').get();
  const userUpdates = [];
  for (const doc of users.docs) {
    const d = doc.data() || {};
    const update = {};
    // The platform admin stays outside every school.
    if (!d.schoolId && d.platformAdmin !== true) update.schoolId = schoolId;
    for (const f of REMOVED_USER_FIELDS) if (f in d) update[f] = FieldValue.delete();
    // Keep a student's class: the old admin page only set classroomIds.
    if (!d.class && Array.isArray(d.classroomIds) && d.classroomIds.length && String(d.role || '').toLowerCase() === 'student') {
      update.class = String(d.classroomIds[0]);
    }
    if (Object.keys(update).length) userUpdates.push([doc.id, update]);
  }
  await inChunks(userUpdates, 50, ([id, update]) => db.collection('users').doc(id).set(update, { merge: true }));
  counts.users = userUpdates.length;

  for (const col of ['homeworkAssignments', 'homeworkAnswerKeys', 'submissions', 'questionBank']) {
    const snap = await db.collection(col).get();
    const todo = snap.docs.filter((doc) => !(doc.data() || {}).schoolId);
    await inChunks(todo, 50, (doc) => {
      const d = doc.data() || {};
      const update = { schoolId };
      if (col === 'questionBank') update.shared = false;
      if ('classroomId' in d) update.classroomId = FieldValue.delete();
      if ('studentId' in d) update.studentId = FieldValue.delete();
      return db.collection(col).doc(doc.id).set(update, { merge: true });
    });
    counts[col] = todo.length;
  }

  // The school-wide AI key from before becomes this school's key.
  const oldAi = await db.collection('appSettings').doc('ai').get();
  if (oldAi.exists) {
    await db.collection('schoolSecrets').doc(schoolId).set({ ...oldAi.data(), schoolId }, { merge: true });
    await db.collection('appSettings').doc('ai').delete();
    counts.aiKey = 1;
  }
  return counts;
}

app.post('/api/platform/schools/create', async (req, res) => {
  try {
    const { idToken, name } = req.body || {};
    const actor = await requirePlatformAdmin(idToken);
    const cleanName = cleanSchoolName(name);
    const { db } = getFirebaseAdmin();
    const existing = await db.collection('schools').get();
    if (existing.docs.some((d) => String(d.data()?.name || '').toLowerCase() === cleanName.toLowerCase())) {
      throw httpError(409, '已有同名的學校');
    }
    const schoolId = 'sch_' + crypto.randomBytes(8).toString('hex');
    await db.collection('schools').doc(schoolId).set({
      name: cleanName,
      shareQuestionBank: false,
      createdBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const adopted = existing.docs.length === 0 ? await adoptExistingData(db, schoolId) : null;
    return res.json({ ok: true, schoolId, adopted });
  } catch (error) {
    return sendError(res, error, 'create school failed');
  }
});

// Platform admin, API only: give a school any documents still without a schoolId (e.g. if the
// first school's setup was interrupted). Not shown in the app.
app.post('/api/platform/schools/adopt', async (req, res) => {
  try {
    const { idToken, schoolId } = req.body || {};
    await requirePlatformAdmin(idToken);
    const { db } = getFirebaseAdmin();
    if (!schoolId || !(await db.collection('schools').doc(String(schoolId)).get()).exists) throw httpError(404, '找不到這間學校');
    return res.json({ ok: true, adopted: await adoptExistingData(db, String(schoolId)) });
  } catch (error) {
    return sendError(res, error, 'adopt failed');
  }
});

// School admin (or platform admin for a picked school): rename a 班別 everywhere it is used —
// students' class, teachers' class permissions, homework targets and submissions.
app.post('/api/school/classes/rename', async (req, res) => {
  try {
    const { idToken, schoolId, from, to } = req.body || {};
    const actor = await requireSchoolAdmin(idToken, schoolId);
    const oldName = String(from || '').trim();
    const newName = String(to || '').trim().replace(/\s+/g, ' ');
    if (!oldName) throw httpError(400, '請選擇要改名的班別');
    if (!newName || newName.length > 40) throw httpError(400, '請輸入新的班別名稱（最多 40 字）');
    const same = (v) => String(v ?? '').trim().toLowerCase() === oldName.toLowerCase();
    const { db } = getFirebaseAdmin();
    const counts = { students: 0, teachers: 0, homework: 0, submissions: 0 };
    const writes = [];

    const users = await db.collection('users').where('schoolId', '==', actor.schoolId).get();
    for (const doc of users.docs) {
      const u = doc.data() || {};
      const update = {};
      if (same(u.class)) { update.class = newName; counts.students += 1; }
      if (Array.isArray(u.teacherClasses) && u.teacherClasses.some(same)) {
        update.teacherClasses = [...new Set(u.teacherClasses.map((c) => (same(c) ? newName : c)))];
        counts.teachers += 1;
      }
      if (Object.keys(update).length) writes.push(['users', doc.id, update]);
    }
    const hw = await db.collection('homeworkAssignments').where('schoolId', '==', actor.schoolId).get();
    for (const doc of hw.docs) {
      if (same(doc.data()?.targetClass)) { writes.push(['homeworkAssignments', doc.id, { targetClass: newName }]); counts.homework += 1; }
    }
    const subs = await db.collection('submissions').where('schoolId', '==', actor.schoolId).get();
    for (const doc of subs.docs) {
      if (same(doc.data()?.class)) { writes.push(['submissions', doc.id, { class: newName }]); counts.submissions += 1; }
    }
    await inChunks(writes, 50, ([col, id, update]) => db.collection(col).doc(id).set(update, { merge: true }));
    return res.json({ ok: true, from: oldName, to: newName, updated: counts });
  } catch (error) {
    return sendError(res, error, 'rename class failed');
  }
});

app.post('/api/platform/schools/rename', async (req, res) => {
  try {
    const { idToken, schoolId, name } = req.body || {};
    await requirePlatformAdmin(idToken);
    const cleanName = cleanSchoolName(name);
    const { db } = getFirebaseAdmin();
    const ref = db.collection('schools').doc(String(schoolId || ''));
    if (!schoolId || !(await ref.get()).exists) throw httpError(404, '找不到這間學校');
    await ref.set({ name: cleanName, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'rename school failed');
  }
});

// School admin (or the platform admin, for a school they pick): share or stop sharing the
// school's question bank with other schools.
app.post('/api/school/settings/save', async (req, res) => {
  try {
    const { idToken, schoolId, shareQuestionBank } = req.body || {};
    const actor = await requireSchoolAdmin(idToken, schoolId);
    if (typeof shareQuestionBank !== 'boolean') throw httpError(400, 'shareQuestionBank must be true or false');
    const { db } = getFirebaseAdmin();
    const schoolRef = db.collection('schools').doc(actor.schoolId);
    if (!(await schoolRef.get()).exists) throw httpError(404, '找不到你的學校');
    await schoolRef.set({ shareQuestionBank, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    // Each question carries the flag so the rules can check it without extra reads.
    const snap = await db.collection('questionBank').where('schoolId', '==', actor.schoolId).get();
    const todo = snap.docs.filter((d) => (d.data()?.shared === true) !== shareQuestionBank);
    await inChunks(todo, 50, (d) => db.collection('questionBank').doc(d.id).set({ shared: shareQuestionBank }, { merge: true }));
    return res.json({ ok: true, shareQuestionBank, updatedQuestions: todo.length });
  } catch (error) {
    return sendError(res, error, 'save school settings failed');
  }
});

// Hand-ins carry the student's 班別 (so class-limited teachers and class reports find them).
// When a student's class changes, or for hand-ins saved before they had one, copy it over.
async function syncSubmissionClasses(db, schoolId, uid = null) {
  const users = uid
    ? [await db.collection('users').doc(uid).get()]
    : (await db.collection('users').where('schoolId', '==', schoolId).get()).docs;
  let updated = 0;
  for (const u of users) {
    const data = u.exists === false ? null : u.data();
    if (!data || data.schoolId !== schoolId || String(data.role || 'student').toLowerCase() !== 'student') continue;
    const cls = String(data.class || '').trim();
    const subs = await db.collection('submissions').where('studentUid', '==', u.id).get();
    const todo = subs.docs.filter((d) => d.data()?.schoolId === schoolId && String(d.data()?.class || '') !== cls);
    await inChunks(todo, 50, (d) => db.collection('submissions').doc(d.id).set(cls ? { class: cls } : { class: FieldValue.delete() }, { merge: true }));
    updated += todo.length;
  }
  return updated;
}

app.post('/api/school/submissions/sync-class', async (req, res) => {
  try {
    const { idToken, schoolId, uid } = req.body || {};
    const actor = await requireSchoolAdmin(idToken, schoolId);
    const { db } = getFirebaseAdmin();
    if (uid !== undefined && (!uid || String(uid).includes('/'))) throw httpError(400, 'uid required');
    const updated = await syncSubmissionClasses(db, actor.schoolId, uid ? String(uid) : null);
    return res.json({ ok: true, updated });
  } catch (error) {
    return sendError(res, error, 'sync failed');
  }
});

// ── Adding people from Excel ────────────────────────────────────────────────
// Accounts are created when someone first signs in with Google, so an imported row either
// updates an existing account (same e-mail) or becomes a pending invite that is applied at
// that person's first sign-in (see /api/auth/sync-role).
const INVITE_ROLES = { student: 'student', teacher: 'teacher', parent: 'parent', admin: 'admin',
  '學生': 'student', '老師': 'teacher', '教師': 'teacher', '家長': 'parent', '管理員': 'admin' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inviteId = (email) => crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 40);
const splitList = (v) => String(v || '').split(/[,，、;；\s]+/).map((x) => x.trim()).filter(Boolean);

function normalizeRosterRow(row) {
  const email = String(row?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: '電郵格式不正確' };
  const role = INVITE_ROLES[String(row?.role || 'student').trim().toLowerCase()] || INVITE_ROLES[String(row?.role || '').trim()];
  if (!role) return { error: '身分必須是 學生／老師／家長／管理員' };
  const out = { email, role, name: String(row?.name || '').trim().slice(0, 60) };
  const classes = splitList(row?.class).map((c) => c.slice(0, 40));
  if (role === 'student') out.class = classes[0] || '';
  if (role === 'teacher' && classes.length) out.teacherClasses = [...new Set(classes)].slice(0, 60);
  if (role === 'parent') out.childEmails = [...new Set(splitList(row?.children).map((x) => x.toLowerCase()).filter((x) => EMAIL_RE.test(x)))].slice(0, 10);
  return { row: out };
}

async function usersByEmail(db, emails) {
  const out = new Map();
  for (let i = 0; i < emails.length; i += 30) {
    const snap = await db.collection('users').where('email', 'in', emails.slice(i, i + 30)).get();
    snap.docs.forEach((d) => out.set(String(d.data()?.email || '').toLowerCase(), { id: d.id, ...d.data() }));
  }
  return out;
}

// The account fields an imported row sets (children resolved to accounts that exist).
async function rosterUpdate(db, schoolId, r) {
  const update = { schoolId, role: r.role, accountStatus: 'active', updatedAt: FieldValue.serverTimestamp() };
  if (r.name) update.name = r.name;
  if (r.role === 'student') update.class = r.class || '';
  if (r.role === 'teacher') update.teacherClasses = r.teacherClasses ? r.teacherClasses : FieldValue.delete();
  if (r.role !== 'parent') update.childUids = FieldValue.delete();
  if (r.role === 'parent' && r.childEmails?.length) {
    const kids = await usersByEmail(db, r.childEmails);
    update.childUids = [...kids.values()].filter((k) => k.schoolId === schoolId).map((k) => k.id);
  }
  return update;
}

// Create the account straight away (Firebase Auth user + profile) for someone who has never
// signed in. When they first sign in with Google using this e-mail, Firebase signs them in to
// this same account. The account is 待審核 (review) and marked pendingFirstLogin until then.
async function createAccount(db, auth, schoolId, r, byUid) {
  let uid;
  try {
    uid = (await auth.getUserByEmail(r.email)).uid;
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e;
    uid = (await auth.createUser({ email: r.email, ...(r.name ? { displayName: r.name } : {}) })).uid;
  }
  const update = await rosterUpdate(db, schoolId, r);
  await db.collection('users').doc(uid).set({
    ...update,
    accountStatus: 'review', // 待審核 until their first sign-in, which activates the account
    email: r.email,
    name: r.name || r.email.split('@')[0],
    pendingFirstLogin: true,
    addedBy: byUid,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return uid;
}

// Safety net: if Google sign-in made a new account instead of using the pre-created one,
// move the pre-created profile (school, role, class…) onto the new account.
async function claimPrecreatedAccount(db, auth, uid, email) {
  const snap = await db.collection('users').where('email', '==', email).get();
  const pre = snap.docs.find((d) => d.id !== uid && d.data()?.pendingFirstLogin === true);
  if (!pre) return false;
  const me = (await db.collection('users').doc(uid).get()).data() || {};
  if (me.platformAdmin === true || (me.schoolId && (me.accountStatus || 'active') === 'active')) return false;
  const { pendingFirstLogin, addedBy, createdAt, ...fields } = pre.data();
  await db.collection('users').doc(uid).set({ ...fields, email, accountStatus: 'active', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('users').doc(pre.id).delete();
  try { await auth.deleteUser(pre.id); } catch { /* already gone */ }
  if (fields.role === 'student') await syncSubmissionClasses(db, fields.schoolId, uid);
  return true;
}

app.post('/api/school/roster/import', async (req, res) => {
  try {
    const body = req.body || {};
    const actor = await requireSchoolAdmin(body.idToken, body.schoolId);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw httpError(400, '沒有資料');
    if (rows.length > 1000) throw httpError(400, '每次最多匯入 1000 人');
    const { db, auth } = getFirebaseAdmin();
    const result = { updated: [], created: [], invited: [], skipped: [] };
    const seen = new Set();
    const good = [];
    rows.forEach((raw, i) => {
      const { row, error } = normalizeRosterRow(raw);
      if (error) return result.skipped.push({ line: i + 1, email: String(raw?.email || ''), reason: error });
      if (seen.has(row.email)) return result.skipped.push({ line: i + 1, email: row.email, reason: '重複的電郵' });
      seen.add(row.email);
      good.push(row);
    });
    const existing = await usersByEmail(db, good.map((r) => r.email));
    for (const r of good) {
      const u = existing.get(r.email);
      if (u) {
        if (u.platformAdmin === true) { result.skipped.push({ email: r.email, reason: '平台管理員' }); continue; }
        if (u.schoolId && u.schoolId !== actor.schoolId && (u.accountStatus || 'active') === 'active') {
          result.skipped.push({ email: r.email, reason: '已屬於另一間學校' }); continue;
        }
        const upd = await rosterUpdate(db, actor.schoolId, r);
        if (u.pendingFirstLogin === true) upd.accountStatus = 'review'; // still waiting for their first sign-in
        await db.collection('users').doc(u.id).set(upd, { merge: true });
        if (r.role === 'student') await syncSubmissionClasses(db, actor.schoolId, u.id);
        await db.collection('schoolInvites').doc(inviteId(r.email)).delete();
        result.updated.push(r.email);
      } else {
        await createAccount(db, auth, actor.schoolId, r, actor.uid);
        await db.collection('schoolInvites').doc(inviteId(r.email)).delete();
        result.created.push(r.email);
      }
    }
    return res.json({ ok: true, ...result });
  } catch (error) {
    return sendError(res, error, 'import failed');
  }
});

app.post('/api/school/roster/list', async (req, res) => {
  try {
    const actor = await requireSchoolAdmin((req.body || {}).idToken, (req.body || {}).schoolId);
    const { db } = getFirebaseAdmin();
    const snap = await db.collection('schoolInvites').where('schoolId', '==', actor.schoolId).get();
    const invites = snap.docs.map((d) => {
      const x = d.data() || {};
      return { email: x.email, name: x.name || '', role: x.role, class: x.class || '', teacherClasses: x.teacherClasses || null, childEmails: x.childEmails || [] };
    }).sort((a, b) => String(a.email).localeCompare(String(b.email)));
    return res.json({ ok: true, invites });
  } catch (error) {
    return sendError(res, error, 'list failed');
  }
});

app.post('/api/school/roster/cancel', async (req, res) => {
  try {
    const body = req.body || {};
    const actor = await requireSchoolAdmin(body.idToken, body.schoolId);
    const { db } = getFirebaseAdmin();
    const ref = db.collection('schoolInvites').doc(inviteId(body.email || ''));
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.schoolId !== actor.schoolId) throw httpError(404, '找不到這個邀請');
    await ref.delete();
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'cancel failed');
  }
});

// At sign-in: apply a pending invite for this (Google-verified) e-mail.
async function applyInvite(db, uid, email) {
  const ref = db.collection('schoolInvites').doc(inviteId(email));
  const snap = await ref.get();
  if (!snap.exists) return false;
  const inv = snap.data() || {};
  const userRef = db.collection('users').doc(uid);
  const user = (await userRef.get()).data() || {};
  if (user.platformAdmin === true) return false;
  if (user.schoolId && user.schoolId !== inv.schoolId && (user.accountStatus || 'active') === 'active') return false;
  await userRef.set(await rosterUpdate(db, inv.schoolId, inv), { merge: true });
  if (inv.role === 'student') await syncSubmissionClasses(db, inv.schoolId, uid);
  await ref.delete();
  return true;
}

// School admin: change a member's role, status, class, children or class permissions.
// Same limits as the Firestore rules (works even when the rules on the console are older).
// The platform admin may also move someone to another school ('' = no school → awaiting approval).
const USER_ROLES = ['student', 'teacher', 'admin', 'parent'];
const USER_STATUSES = ['active', 'review', 'suspended'];
const cleanList = (v, max) => Array.from(new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean))).slice(0, max);

app.post('/api/school/users/update', async (req, res) => {
  try {
    const body = req.body || {};
    const actor = await requireAdminActor(body.idToken);
    const uid = String(body.uid || '').trim();
    if (!uid || uid.includes('/')) throw httpError(400, 'uid required');
    const { db } = getFirebaseAdmin();
    const ref = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) throw httpError(404, '找不到這個帳戶');
    const target = snap.data() || {};
    if (!actor.platformAdmin) {
      if (!actor.schoolId || target.schoolId !== actor.schoolId) throw httpError(403, '這個帳戶不屬於你的學校');
      if (target.platformAdmin === true) throw httpError(403, '不能修改平台管理員');
    }
    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (body.role !== undefined) {
      if (!USER_ROLES.includes(String(body.role))) throw httpError(400, '角色不正確');
      update.role = String(body.role);
    }
    if (body.accountStatus !== undefined) {
      if (!USER_STATUSES.includes(String(body.accountStatus))) throw httpError(400, '帳戶狀態不正確');
      update.accountStatus = String(body.accountStatus);
    }
    if (body.class !== undefined) update.class = String(body.class || '').trim().slice(0, 40);
    if (body.name !== undefined) {
      const name = String(body.name || '').trim().slice(0, 60);
      if (!name) throw httpError(400, '姓名不可以留空');
      update.name = name;
    }
    if (body.email !== undefined) {
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw httpError(400, '電郵格式不正確');
      if (email !== String(target.email || '').toLowerCase()) {
        const taken = (await db.collection('users').where('email', '==', email).get()).docs.some((d) => d.id !== uid);
        if (taken) throw httpError(409, '這個電郵已被另一個帳戶使用');
        update.email = email;
      }
    }
    if (body.childUids !== undefined) update.childUids = cleanList(body.childUids, 50);
    if (body.teacherClasses !== undefined) {
      update.teacherClasses = body.teacherClasses === null ? FieldValue.delete() : cleanList(body.teacherClasses, 60);
    }
    if (body.schoolId !== undefined) {
      if (!actor.platformAdmin) throw httpError(403, '只有平台管理員可以把帳戶轉到另一間學校');
      const sid = String(body.schoolId || '');
      if (sid && !(await db.collection('schools').doc(sid).get()).exists) throw httpError(404, '找不到這間學校');
      update.schoolId = sid;
      if (!sid) update.accountStatus = 'review';
    }
    await ref.set(update, { merge: true });
    if (body.class !== undefined || body.role !== undefined) {
      await syncSubmissionClasses(db, update.schoolId ?? target.schoolId, uid);
    }
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'update user failed');
  }
});

// Serve public/js (Firebase config + bridge). The old static pages were removed.
// These scripts keep the same name between releases, so browsers must re-check them every time
// (a 4-hour cache kept people on old code after an update). The page also asks for them with
// ?v=<content hash>, which changes whenever the file does.
app.use(express.static(publicDir, {
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

function fileVersion(rel) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(publicDir, rel))).digest('hex').slice(0, 12);
  } catch {
    return String(Date.now());
  }
}
const PUBLIC_JS_VERSION = { bridge: fileVersion('js/firebase-bridge.js') };

// Serve new React web app build at /app and for SPA routes (teacher/student/admin/chat/analytics)
const webDistDir = path.join(__dirname, 'web', 'dist');
if (fs.existsSync(webDistDir)) {
  // Static assets
  app.use('/web/assets', express.static(path.join(webDistDir, 'assets')));
  app.use('/web', express.static(webDistDir));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'teaching-app', ts: new Date().toISOString() });
});

app.get('/api/chat', (req, res) => {
  res.status(405).json({
    error: 'Method not allowed. Use POST /api/chat',
    hint: 'If you opened this in a browser, that is a GET request. The chat UI should send POST.'
  });
});

app.post('/api/chat', async (req, res) => {
  const { message, topic = 'general', mode = 'socratic', studentName = 'student', studentContext = null } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  let cfg;
  let actorRole = '';
  try {
    cfg = await resolveProviderConfig(req.body || {}, AI_ROLES.chat);
    if (req.body?.idToken) actorRole = (await verifyUserFromToken(req.body.idToken))?.role || '';
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Invalid auth token' });
  }

  if (!cfg.apiKey) {
    return res.status(400).json({ error: 'AI 尚未設定：請管理員到「AI 設定」頁面輸入 API Key。' });
  }

  const isStaff = actorRole === 'teacher' || actorRole === 'admin';
  const studentSystem = [
    'You are QuestClass AI 助教, a friendly learning coach for Hong Kong school students.',
    'Reply in Traditional Chinese (Hong Kong usage).',
    'Be concise, warm and encouraging. Use short paragraphs or short lists.',
    'Prefer Socratic guidance: give a hint and one guiding question before the full answer, unless the student explicitly asks for the final answer.',
    'Never just hand over homework answers; help the student reason.',
    'Keep content age-appropriate.'
  ].join(' ');
  const staffSystem = [
    'You are QuestClass AI 助教, an assistant for Hong Kong school teachers.',
    'Reply in Traditional Chinese (Hong Kong usage) unless asked otherwise.',
    'Be direct and practical: lesson ideas, questions, marking comments, differentiation, parent messages.',
    'Give complete answers (no Socratic questioning). Use short lists and clear headings where helpful.',
    'Match the Hong Kong curriculum and the grade level mentioned.'
  ].join(' ');

  // Custom system prompts (used by the question generators) are for staff only, so students
  // can't rewrite the assistant's instructions. Without Firebase (demo) they are allowed.
  const firebaseOn = getFirebaseRuntimeConfig().enabled;
  const customSystem = String(req.body?.system || '').trim();
  const system = customSystem && (isStaff || !firebaseOn)
    ? customSystem
    : (isStaff ? staffSystem : studentSystem);
  const history = sanitizeHistory(req.body?.history);

  const contextText = studentContext
    ? `Student profile:\n${JSON.stringify({
        studentId: studentContext.studentId || '',
        gradeLevel: studentContext.gradeLevel || '',
        mastery: studentContext.mastery ?? '',
        level: studentContext.level ?? '',
        xp: studentContext.xp ?? '',
        streak: studentContext.streak ?? '',
        weaknessLabel: studentContext.weaknessLabel || '',
        weaknessScore: studentContext.weaknessScore || '',
        focusAreas: studentContext.focusAreas || [],
        focusSkills: studentContext.focusSkills || [],
        recentQuestTitles: studentContext.recentQuestTitles || [],
        classroomId: studentContext.classroomId || '',
        classroomName: studentContext.classroomName || '',
        classroomGrade: studentContext.classroomGrade || ''
      }, null, 2)}`
    : 'Student profile: unavailable';

  const pageNote = req.body?.page ? `\n(The user is on the "${String(req.body.page).slice(0, 40)}" page.)` : '';
  // The assistant bubble sends plain messages with history; the generators still use the tagged format.
  const user = req.body?.assistant
    ? `${String(message).slice(0, isStaff ? 12000 : 4000)}${pageNote}`
    : `Student: ${studentName}\nTopic: ${topic}\nTeaching mode: ${mode}\n${contextText}\nStudent message: ${message}\nUse the student profile to personalize explanation difficulty and examples. Respond in Traditional Chinese.`;
  const result = await callChatCompletion({ ...cfg, system, user, history, temperature: req.body?.format === 'json' ? 0.5 : 0.7 });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  // If caller wants JSON, try to parse and return it.
  if (String(req.body?.format || '').toLowerCase() === 'json') {
    try {
      const text = String(result.text || '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      const json = match ? JSON.parse(match[0]) : JSON.parse(text);
      return res.json({ mode: 'live', ...json });
    } catch (e) {
      return res.status(422).json({
        error: 'JSON_PARSE_FAILED',
        detail: e?.message || 'parse failed',
        raw: String(result.text || '').slice(0, 2000)
      });
    }
  }

  res.json({ mode: 'live', reply: result.text });
});

// ── Marking a student's homework ───────────────────────────────────────────
// Runs on the server because the answers live in homeworkAnswerKeys, which students cannot read.
// Objective questions are marked exactly; open questions by the school's AI against the model
// answer / rubric (or left for the teacher). Once marked, the homework cannot be resubmitted,
// and the student sees the correct answers in their own submission.
const OBJECTIVE_TYPES = new Set(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_BLANK']);

function normAnswer(v) {
  return String(v ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[。．.]+$/, '');
}

function correctChoiceIds(q) {
  const opts = Array.isArray(q.options) ? q.options : (Array.isArray(q.choices) ? q.choices : []);
  const fromOpts = opts.filter((o) => o && o.is_correct === true).map((o) => String(o.id ?? o.value));
  if (fromOpts.length) return fromOpts;
  return (Array.isArray(q.correctChoiceIds) ? q.correctChoiceIds : []).map(String);
}

function describeCorrect(q) {
  const type = String(q.type || '').toUpperCase();
  if (type === 'MULTIPLE_CHOICE') {
    const opts = Array.isArray(q.options) ? q.options : (Array.isArray(q.choices) ? q.choices : []);
    const ids = correctChoiceIds(q);
    return ids.map((id) => { const o = opts.find((x) => String(x?.id ?? x?.value) === id); return o?.text ? `${id}. ${o.text}` : id; }).join('、');
  }
  if (type === 'TRUE_FALSE') return q.correct_answer === true ? '正確 (True)' : q.correct_answer === false ? '錯誤 (False)' : '';
  if (type === 'FILL_IN_BLANK') {
    return (Array.isArray(q.blanks) ? q.blanks : []).map((b) => (Array.isArray(b?.accepted) ? b.accepted : []).join(' / ')).filter(Boolean).join('；');
  }
  if (type === 'MATCHING') return (Array.isArray(q.pairs) ? q.pairs : []).map((p) => `${p?.prompt} → ${p?.match}`).join('；');
  return String(q.ideal_answer || '');
}

// Returns { earned, correct } for objective questions, or null when it needs judgement.
function markObjective(q, value) {
  const type = String(q.type || '').toUpperCase();
  const points = Number(q.points) || 1;
  if (value == null || value === '') return { earned: 0, correct: false };
  if (type === 'MULTIPLE_CHOICE') {
    const ids = correctChoiceIds(q);
    if (!ids.length) return null;
    const ok = ids.includes(String(value));
    return { earned: ok ? points : 0, correct: ok };
  }
  if (type === 'TRUE_FALSE') {
    if (typeof q.correct_answer !== 'boolean') return null;
    const v = value === true || value === 'true' ? true : value === false || value === 'false' ? false : null;
    const ok = v === q.correct_answer;
    return { earned: ok ? points : 0, correct: ok };
  }
  if (type === 'FILL_IN_BLANK') {
    const blanks = (Array.isArray(q.blanks) ? q.blanks : []).filter((b) => Array.isArray(b?.accepted) && b.accepted.length);
    if (!blanks.length) return null;
    const parts = blanks.length === 1 ? [String(value)] : String(value).split(/[,，、;；|\n]+/);
    const hits = blanks.filter((b, i) => b.accepted.some((a) => normAnswer(a) === normAnswer(parts[i])));
    const earned = Math.round((points * hits.length / blanks.length) * 100) / 100;
    return { earned, correct: hits.length === blanks.length };
  }
  return null;
}

async function markOpenWithAi(cfg, items) {
  if (!items.length || !cfg?.apiKey) return {};
  const result = await callChatCompletion({
    ...cfg,
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    system: '你是香港學校老師的批改助手。根據題目、參考答案和評分準則，為每條題目的學生答案評分（0 至滿分，可用 0.5 分），'
      + '並用繁體中文寫一句簡短回饋（指出做得好或需要改善之處）。只輸出 JSON：{"results":[{"id":"…","earned":數字,"feedback":"…"}]}',
    user: JSON.stringify(items.map((it) => ({
      id: it.id, question: it.question, reference_answer: it.reference, rubric: it.rubric, max_points: it.max, student_answer: it.answer,
    }))),
  });
  if (!result.ok) return {};
  try {
    const text = String(result.text || '');
    const json = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]);
    const out = {};
    for (const r of Array.isArray(json.results) ? json.results : []) {
      const it = items.find((x) => x.id === String(r?.id));
      const earned = Number(r?.earned);
      if (it && Number.isFinite(earned)) {
        out[it.id] = { earned: Math.max(0, Math.min(it.max, Math.round(earned * 2) / 2)), feedback: String(r.feedback || '').slice(0, 300) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function gradeSubmission({ db, schoolId, assignmentId, submission }) {
  const hwSnap = await db.collection('homeworkAssignments').doc(assignmentId).get();
  const hw = hwSnap.exists ? hwSnap.data() : null;
  if (!hw || hw.schoolId !== schoolId) throw httpError(404, '找不到這份作業');
  const keySnap = await db.collection('homeworkAnswerKeys').doc(assignmentId).get();
  const questions = (keySnap.exists && Array.isArray(keySnap.data()?.questions)) ? keySnap.data().questions : (Array.isArray(hw.questions) ? hw.questions : []);
  const answers = new Map((Array.isArray(submission.answers) ? submission.answers : []).map((a) => [String(a?.questionId), a?.value]));

  const results = [];
  const open = [];
  questions.forEach((q, i) => {
    const id = String(q.id ?? i);
    const points = Number(q.points) || 1;
    const value = answers.get(id);
    const type = String(q.type || '').toUpperCase();
    const marked = OBJECTIVE_TYPES.has(type) ? markObjective(q, value) : null;
    const base = { questionId: id, points, correctAnswer: describeCorrect(q).slice(0, 500) };
    if (marked) {
      results.push({ ...base, earned: marked.earned, correct: marked.correct, pending: false });
    } else if (value == null || String(value).trim() === '') {
      results.push({ ...base, earned: 0, correct: false, pending: false });
    } else {
      results.push({ ...base, earned: 0, correct: null, pending: true });
      open.push({ id, question: String(q.question_text || q.prompt || '').slice(0, 1000), reference: String(q.ideal_answer || describeCorrect(q) || '').slice(0, 1000),
        rubric: String(q.grading_rubric || '').slice(0, 1000), max: points, answer: String(value).slice(0, 3000) });
    }
  });

  if (open.length) {
    let cfg = null;
    try { cfg = await getSchoolProviderConfig(schoolId); } catch { cfg = null; }
    const ai = await markOpenWithAi(cfg, open);
    for (const r of results) {
      const a = ai[r.questionId];
      if (r.pending && a) Object.assign(r, { earned: a.earned, correct: a.earned >= r.points, pending: false, feedback: a.feedback, markedBy: 'ai' });
    }
  }

  const round = (n) => Math.round(n * 100) / 100;
  const maxScore = round(results.reduce((sum, r) => sum + r.points, 0));
  const score = round(results.reduce((sum, r) => sum + (r.earned || 0), 0));
  return { score, maxScore, results, pendingReview: results.some((r) => r.pending) };
}

// Student: mark my submission for this homework (called right after handing in). Idempotent.
app.post('/api/homework/grade', async (req, res) => {
  try {
    const { idToken, assignmentId } = req.body || {};
    const actor = await verifyUserFromToken(idToken);
    if (!actor) throw httpError(401, '請先登入');
    requireActive(actor);
    if (!actor.schoolId) throw httpError(403, '你的帳戶尚未加入學校');
    const aId = String(assignmentId || '').trim();
    if (!aId || aId.includes('/')) throw httpError(400, 'assignmentId required');
    const { db } = getFirebaseAdmin();
    const ref = db.collection('submissions').doc(`${aId}_${actor.uid}`);
    const snap = await ref.get();
    const sub = snap.exists ? snap.data() : null;
    if (!sub || sub.studentUid !== actor.uid || sub.schoolId !== actor.schoolId) throw httpError(404, '找不到你的提交');
    if (sub.status === 'graded' && Array.isArray(sub.results)) {
      return res.json({ ok: true, score: sub.score, maxScore: sub.maxScore, results: sub.results, pendingReview: Boolean(sub.pendingReview) });
    }
    const graded = await gradeSubmission({ db, schoolId: actor.schoolId, assignmentId: aId, submission: sub });
    await ref.set({
      ...graded,
      status: 'graded', // locks the hand-in: the answers are now visible to the student
      gradedBy: 'auto',
      gradedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return res.json({ ok: true, ...graded });
  } catch (error) {
    return sendError(res, error, 'grading failed');
  }
});

// Delete a homework that has been 封存 (archived), with its answer key and every hand-in.
// Admins: any homework of their school. Teachers: homework they created.
app.post('/api/teacher/homework/delete', async (req, res) => {
  try {
    const body = req.body || {};
    const actor = await verifyUserFromToken(body.idToken);
    if (!actor) throw httpError(401, '請先登入');
    requireActive(actor);
    if (!['teacher', 'admin'].includes(actor.role)) throw httpError(403, '只有老師和管理員可以刪除作業');
    const id = String(body.assignmentId || '').trim();
    if (!id || id.includes('/')) throw httpError(400, 'assignmentId required');
    const schoolId = actor.platformAdmin && body.schoolId ? String(body.schoolId) : actor.schoolId;
    const { db } = getFirebaseAdmin();
    const ref = db.collection('homeworkAssignments').doc(id);
    const snap = await ref.get();
    const hw = snap.exists ? snap.data() : null;
    if (!hw || !schoolId || hw.schoolId !== schoolId) throw httpError(404, '找不到這份作業');
    if (hw.status !== 'archived') throw httpError(400, '請先封存作業，才可以刪除');
    if (actor.role !== 'admin' && hw.createdBy !== actor.uid) throw httpError(403, '只可以刪除自己建立的作業');
    const subs = await db.collection('submissions').where('assignmentId', '==', id).get();
    const mine = subs.docs.filter((d) => d.data()?.schoolId === schoolId);
    await inChunks(mine, 50, (d) => db.collection('submissions').doc(d.id).delete());
    await db.collection('homeworkAnswerKeys').doc(id).delete();
    await ref.delete();
    return res.json({ ok: true, deletedSubmissions: mine.length });
  } catch (error) {
    return sendError(res, error, 'delete failed');
  }
});

// ── 作業批改: teachers review hand-ins (unmarked open answers, AI marks to confirm) ──────────
// A teacher/admin of the submission's school; a teacher limited to some classes only sees those.
async function requireStaffForSubmission(body) {
  const actor = await verifyUserFromToken(body.idToken);
  if (!actor) throw httpError(401, '請先登入');
  requireActive(actor);
  if (!['teacher', 'admin'].includes(actor.role)) throw httpError(403, '只有老師可以批改作業');
  const id = String(body.submissionId || '').trim();
  if (!id || id.includes('/')) throw httpError(400, 'submissionId required');
  const { db } = getFirebaseAdmin();
  const ref = db.collection('submissions').doc(id);
  const snap = await ref.get();
  const sub = snap.exists ? snap.data() : null;
  if (!sub) throw httpError(404, '找不到這份提交');
  const schoolId = actor.platformAdmin && body.schoolId ? String(body.schoolId) : actor.schoolId;
  if (!schoolId || sub.schoolId !== schoolId) throw httpError(404, '找不到這份提交');
  if (actor.role === 'teacher') {
    const me = (await db.collection('users').doc(actor.uid).get()).data() || {};
    if (Array.isArray(me.teacherClasses)) {
      const allowed = new Set(me.teacherClasses.map((c) => String(c || '').trim().toLowerCase()));
      if (!allowed.has(String(sub.class || '').trim().toLowerCase())) throw httpError(403, '你沒有權限批改這個班別的作業');
    }
  }
  return { actor, db, ref, sub, schoolId };
}

async function fullQuestionsFor(db, assignmentId) {
  const [hwSnap, keySnap] = await Promise.all([
    db.collection('homeworkAssignments').doc(assignmentId).get(),
    db.collection('homeworkAnswerKeys').doc(assignmentId).get(),
  ]);
  const hw = hwSnap.exists ? hwSnap.data() : {};
  const key = keySnap.exists && Array.isArray(keySnap.data()?.questions) ? keySnap.data().questions : null;
  return { hw, questions: key || (Array.isArray(hw.questions) ? hw.questions : []) };
}

const roundHalf = (n) => Math.round(n * 2) / 2;
const round2 = (n) => Math.round(n * 100) / 100;

// The hand-in with every question (including the answer and marking scheme) for the marking screen.
app.post('/api/teacher/submissions/detail', async (req, res) => {
  try {
    const { db, sub } = await requireStaffForSubmission(req.body || {});
    const { hw, questions } = await fullQuestionsFor(db, sub.assignmentId);
    return res.json({
      ok: true,
      submission: sub,
      assignment: { id: sub.assignmentId, title: hw.title || '作業', dueAt: hw.dueAt || null },
      questions: questions.map((q, i) => ({
        id: String(q.id ?? i), type: q.type || '', points: Number(q.points) || 1,
        question_text: q.question_text || q.prompt || '', options: q.options || null, blanks: q.blanks || null, pairs: q.pairs || null,
        correctAnswer: describeCorrect(q), ideal_answer: q.ideal_answer || '', grading_rubric: q.grading_rubric || '', topic: q.topic || '',
      })),
    });
  } catch (error) {
    return sendError(res, error, 'load failed');
  }
});

// Mark a hand-in that was never marked (e.g. the student closed the page before marking ran).
app.post('/api/teacher/submissions/autograde', async (req, res) => {
  try {
    const { db, ref, sub, schoolId } = await requireStaffForSubmission(req.body || {});
    if (sub.status === 'graded' && Array.isArray(sub.results)) {
      return res.json({ ok: true, score: sub.score, maxScore: sub.maxScore, results: sub.results, pendingReview: Boolean(sub.pendingReview) });
    }
    const graded = await gradeSubmission({ db, schoolId, assignmentId: sub.assignmentId, submission: sub });
    await ref.set({ ...graded, status: 'graded', gradedBy: 'auto', gradedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ ok: true, ...graded });
  } catch (error) {
    return sendError(res, error, 'grading failed');
  }
});

// Save the teacher's marks: marks [{ questionId, earned, feedback }] (0.5 steps, 0..points), comment.
app.post('/api/teacher/submissions/mark', async (req, res) => {
  try {
    const body = req.body || {};
    const { actor, db, ref, sub, schoolId } = await requireStaffForSubmission(body);
    let results = Array.isArray(sub.results) && sub.results.length ? sub.results.map((r) => ({ ...r })) : null;
    if (!results) results = (await gradeSubmission({ db, schoolId, assignmentId: sub.assignmentId, submission: sub })).results;
    const marks = new Map((Array.isArray(body.marks) ? body.marks : []).map((m) => [String(m?.questionId), m]));
    for (const r of results) {
      const m = marks.get(String(r.questionId));
      if (!m) continue;
      const earned = Number(m.earned);
      if (!Number.isFinite(earned)) throw httpError(400, '分數必須是數字');
      const points = Number(r.points) || 1;
      r.earned = Math.max(0, Math.min(points, roundHalf(earned)));
      r.correct = r.earned >= points;
      r.pending = false;
      r.markedBy = 'teacher';
      const fb = String(m.feedback ?? r.feedback ?? '').trim().slice(0, 1000);
      if (fb) r.feedback = fb; else delete r.feedback;
    }
    const score = round2(results.reduce((t, r) => t + (Number(r.earned) || 0), 0));
    const maxScore = round2(results.reduce((t, r) => t + (Number(r.points) || 0), 0));
    const pendingReview = results.some((r) => r.pending);
    const update = {
      results, score, maxScore, pendingReview, status: 'graded',
      teacherReviewed: !pendingReview,
      reviewedBy: actor.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (body.comment !== undefined) {
      const c = String(body.comment || '').trim().slice(0, 1000);
      update.teacherComment = c || FieldValue.delete();
    }
    await ref.set(update, { merge: true });
    return res.json({ ok: true, score, maxScore, results, pendingReview });
  } catch (error) {
    return sendError(res, error, 'save failed');
  }
});

app.post('/api/teacher/lesson-loop', async (req, res) => {
  const { topic = 'general', weakness = '', studentName = 'student', grade = '' } = req.body || {};
  let cfg;
  try {
    cfg = await resolveProviderConfig(req.body || {}, AI_ROLES.lessonLoop);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Invalid auth token' });
  }

  if (!cfg.apiKey) {
    return res.status(400).json({
      error: 'AI 尚未設定：請管理員到「AI 設定」頁面輸入 API Key。'
    });
  }

  const prompt = `Create a teacher lesson loop in Traditional Chinese for student ${studentName}, grade ${grade}, topic ${topic}, weakness ${weakness}. Return strict JSON with keys: steps (array of 5 strings), assignment (array of 3 strings), insight (string), teacherSummary (array of 3 strings). Use empty arrays if source data is insufficient.`;
  const result = await callChatCompletion({
    ...cfg,
    system: 'Return only JSON. No markdown.',
    user: prompt,
    temperature: 0.4,
    responseFormat: { type: 'json_object' }
  });

  if (!result.ok) return res.status(result.status).json({ error: result.error });
  try {
    return res.json({ mode: 'live', ...JSON.parse(result.text) });
  } catch {
    return res.json({ mode: 'live', steps: [result.text], assignment: [], insight: '', teacherSummary: [] });
  }
});

// Legacy UI removed
const legacyPageMap = {};

// Every client-side route in web/src/App.jsx; keep in sync when adding pages.
const spaRoutes = new Set(['/', '/dashboard', '/teacher', '/student', '/admin', '/chat', '/analytics', '/teacher-homework', '/student-homework',
  '/teacher-question-bank', '/classroom', '/assignments', '/progress', '/reports', '/parents', '/parent', '/teacher-homework-legacy', '/admin/ai-settings', '/admin/schools']);
const spaRoutePrefixes = ['/teacher-homework', '/student-homework', '/teacher-question-bank', '/teacher-homework-old'];

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });

    // New React SPA routes (serve web/dist/index.html if present)
  if (fs.existsSync(path.join(webDistDir, 'index.html'))) {
    const p = req.path === '/' ? '/' : req.path.replace(/\/$/, '');
    const isSpa = spaRoutes.has(p)
      || p === '/app'
      || p.startsWith('/app/')
      || spaRoutePrefixes.some((prefix) => p === prefix || p.startsWith(prefix + '/'));

    if (isSpa) {
      let html = fs.readFileSync(path.join(webDistDir, 'index.html'), 'utf8');
      // Make Vite-built asset URLs work under /teacher|/student|... by forcing absolute /web/assets/ paths.
      html = html.replaceAll('/assets/', '/web/assets/');
      html = html.replace('src="/js/firebase-bridge.js"', `src="/js/firebase-bridge.js?v=${PUBLIC_JS_VERSION.bridge}"`);
      res.set('Cache-Control', 'no-cache');
      return res.type('html').send(html);
    }
  }

  // Legacy UI removed: do not serve public/*.html as pages.
  const target = legacyPageMap[req.path] || legacyPageMap[req.path.replace(/\.html$/, '')];
  if (target) {
    const filePath = path.join(publicDir, target);
    return res.type('html').send(fs.readFileSync(filePath, 'utf8'));
  }

  // Unknown routes: return 404 (do NOT redirect to /; it can cause infinite redirect loops on deployments
  // where the SPA build output is not present in the serverless bundle).
  return res.status(404).type('text').send('Not found');
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ Teaching app running → http://localhost:${PORT}`);
  });
}

module.exports = app;
