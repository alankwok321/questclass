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

function getProviderConfig(body = {}) {
  return {
    apiKey: body.apiKey || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '',
    apiBaseUrl: (body.apiBaseUrl || process.env.OPENAI_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    model: body.model || process.env.AI_MODEL || 'openai/gpt-4.1-mini',
  };
}

function getEncryptionKey() {
  const raw = process.env.AI_CONFIG_ENCRYPTION_KEY || '';
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptApiKey(value) {
  const key = getEncryptionKey();
  if (!key) throw new Error('AI_CONFIG_ENCRYPTION_KEY is not configured');
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

function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (serviceAccountJson) {
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
    } else {
      initializeApp();
    }
  }
  return {
    auth: getAuth(),
    db: getFirestore()
  };
}

async function verifyUserFromToken(idToken) {
  if (!idToken) return null;
  const { auth, db } = getFirebaseAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const profile = userSnap.exists ? userSnap.data() : {};
  return {
    uid: decoded.uid,
    email: decoded.email || '',
    role: profile?.role || 'student'
  };
}

function canManageStudent(user, targetUid) {
  if (!user || !targetUid) return false;
  if (user.role === 'admin' || user.role === 'teacher') return true;
  return user.uid === targetUid;
}

async function resolveProviderConfig(body = {}) {
  let cfg = getProviderConfig(body);
  if (!body?.idToken) return cfg;

  const actor = await verifyUserFromToken(body.idToken);
  if (!actor) return cfg;
  const targetUid = String(body.studentUid || '').trim() || actor.uid;
  if (!canManageStudent(actor, targetUid)) {
    const err = new Error('Insufficient role to use this student config');
    err.status = 403;
    throw err;
  }

  const { db } = getFirebaseAdmin();
  const snap = await db.collection('aiProviderConfigs').doc(targetUid).get();
  if (!snap.exists) return cfg;
  const data = snap.data() || {};
  return {
    apiKey: decryptApiKey(data.secret || {}),
    apiBaseUrl: String(data?.provider?.apiBaseUrl || cfg.apiBaseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    model: String(data?.provider?.model || cfg.model || 'openai/gpt-4.1-mini')
  };
}

async function callChatCompletion({ system, user, apiKey, apiBaseUrl, model, temperature = 0.7, responseFormat }) {
  if (!apiKey) return { ok: false, status: 400, error: 'AI provider is not configured. Set an API key first.' };

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

      last = { status: response.status, error: data.error?.message || raw || 'Upstream API error', usedBaseUrl: b };
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

app.post('/api/ai-config/upsert', async (req, res) => {
  try {
    const { idToken, studentUid, apiKey, apiBaseUrl, model } = req.body || {};
    const actor = await verifyUserFromToken(idToken);
    if (!actor) return res.status(401).json({ error: 'Unauthorized' });

    const targetUid = String(studentUid || '').trim() || actor.uid;
    if (!canManageStudent(actor, targetUid)) return res.status(403).json({ error: 'Insufficient role to manage this student config' });
    if (!String(apiKey || '').trim()) return res.status(400).json({ error: 'apiKey required' });

    const enc = encryptApiKey(apiKey);
    const { db } = getFirebaseAdmin();
    await db.collection('aiProviderConfigs').doc(targetUid).set({
      studentUid: targetUid,
      provider: {
        apiBaseUrl: String(apiBaseUrl || 'https://openrouter.ai/api/v1').trim().replace(/\/+$/, ''),
        model: String(model || 'openai/gpt-4.1-mini').trim()
      },
      secret: enc,
      updatedBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return res.json({ ok: true, studentUid: targetUid });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'save ai config failed' });
  }
});

app.post('/api/admin/seed', async (req, res) => {
  try {
    const { idToken, mode = 'merge' } = req.body || {};
    const actor = await verifyUserFromToken(idToken);
    if (!actor) return res.status(401).json({ error: 'Unauthorized' });
    if (String(actor.role || '').toLowerCase() !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const seedPath = path.join(__dirname, 'seeds', 'sample-firestore-data.json');
    if (!fs.existsSync(seedPath)) return res.status(500).json({ error: 'Seed file missing on server' });

    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const { db } = getFirebaseAdmin();

    const convert = (value) => {
      if (Array.isArray(value)) return value.map(convert);
      if (value && typeof value === 'object') {
        if (value.__type === 'serverTimestamp') return FieldValue.serverTimestamp();
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v)]));
      }
      return value;
    };

    const merge = mode !== 'overwrite';
    const result = { ok: true, merge, written: {} };

    const writeCollection = async (collectionName, docs = {}) => {
      const entries = Object.entries(docs || {});
      for (const [docId, payload] of entries) {
        await db.collection(collectionName).doc(docId).set(convert(payload), { merge });
      }
      result.written[collectionName] = entries.length;
    };

    await writeCollection('classrooms', seed.classrooms);
    await writeCollection('students', seed.students);
    await writeCollection('progressSummaries', seed.progressSummaries);
    await writeCollection('submissions', seed.submissions);
    await writeCollection('users', seed.users || {});

    return res.json({ ...result, ts: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'seed failed' });
  }
});

// Serve legacy static assets (but DO NOT auto-serve public/index.html on /)
app.use(express.static(publicDir, { index: false }));

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
  try {
    cfg = await resolveProviderConfig(req.body || {});
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Invalid auth token' });
  }

  if (!cfg.apiKey) {
    return res.status(400).json({
      error: 'AI chat is not configured. Ask admin/teacher to set student AI key or add one in settings.'
    });
  }

  const system = [
    'You are an elite AI teacher and learning coach.',
    'Reply in Traditional Chinese.',
    'Be concise, supportive, and pedagogically strong.',
    'Prefer Socratic guidance over direct answers unless the student explicitly asks for the final answer.',
    'If useful, give 1 next step, 1 hint, and 1 quick check question.'
  ].join(' ');

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

  const user = `Student: ${studentName}\nTopic: ${topic}\nTeaching mode: ${mode}\n${contextText}\nStudent message: ${message}\nUse the student profile to personalize explanation difficulty and examples. Respond in Traditional Chinese.`;
  const result = await callChatCompletion({ ...cfg, system, user, temperature: 0.8 });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ mode: 'live', reply: result.text });
});

app.post('/api/teacher/lesson-loop', async (req, res) => {
  const { topic = 'general', weakness = '', studentName = 'student', grade = '' } = req.body || {};
  let cfg;
  try {
    cfg = await resolveProviderConfig(req.body || {});
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Invalid auth token' });
  }

  if (!cfg.apiKey) {
    return res.status(400).json({
      error: 'Lesson loop is not configured. Ask admin/teacher to set student AI key or add one in settings.'
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

const legacyPageMap = {
  // legacy landing moved off root
  '/legacy': 'index.html'
};

const spaRoutes = new Set(['/', '/dashboard', '/teacher', '/student', '/admin', '/chat', '/analytics']);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });

    // New React SPA routes (serve web/dist/index.html if present)
  if (fs.existsSync(path.join(webDistDir, 'index.html'))) {
    const p = req.path === '/' ? '/' : req.path.replace(/\/$/, '');
    if (spaRoutes.has(p) || p === '/app' || p.startsWith('/app/')) {
      let html = fs.readFileSync(path.join(webDistDir, 'index.html'), 'utf8');
      // Make Vite-built asset URLs work under /teacher|/student|... by forcing absolute /web/assets/ paths.
      html = html.replaceAll('/assets/', '/web/assets/');
      return res.type('html').send(html);
    }
  }

  // Legacy landing
  const target = legacyPageMap[req.path] || legacyPageMap[req.path.replace(/\.html$/, '')];
  if (target) {
    const filePath = path.join(publicDir, target);
    return res.type('html').send(fs.readFileSync(filePath, 'utf8'));
  }

  // Fallback: legacy index
  res.type('html').send(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ Teaching app running → http://localhost:${PORT}`);
  });
}

module.exports = app;
