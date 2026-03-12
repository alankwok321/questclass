const express = require('express');
const path = require('path');
const fs = require('fs');

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

async function callChatCompletion({ system, user, apiKey, apiBaseUrl, model, temperature = 0.7, responseFormat }) {
  if (!apiKey) return { ok: false, status: 400, error: 'AI provider is not configured. Set an API key first.' };
  try {
    const response = await fetch(apiBaseUrl + '/chat/completions', {
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
    if (!response.ok) return { ok: false, status: response.status, error: data.error?.message || raw || 'Upstream API error' };
    const text = data.choices?.[0]?.message?.content || '';
    return { ok: true, status: 200, text, data };
  } catch (error) {
    return { ok: false, status: 500, error: error.message };
  }
}

app.get('/js/firebase-config.js', (req, res) => {
  const runtime = getFirebaseRuntimeConfig();
  res.type('application/javascript').send(`window.QUESTCLASS_FIREBASE_CONFIG = ${JSON.stringify(runtime.firebase)};`);
});

app.get('/api/runtime-config', (req, res) => {
  const firebase = getFirebaseRuntimeConfig();
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
  res.json({
    firebase: firebase.firebase,
    firebaseEnabled: firebase.enabled,
    aiConfigured
  });
});

app.use(express.static(publicDir));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'teaching-app', ts: new Date().toISOString() });
});

app.post('/api/chat', async (req, res) => {
  const { message, topic = 'general', mode = 'socratic', studentName = 'student' } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  const cfg = getProviderConfig(req.body);
  if (!cfg.apiKey) {
    return res.status(400).json({
      error: 'AI chat is not configured. Add an API key in settings or environment variables.'
    });
  }

  const system = [
    'You are an elite AI teacher and learning coach.',
    'Reply in Traditional Chinese.',
    'Be concise, supportive, and pedagogically strong.',
    'Prefer Socratic guidance over direct answers unless the student explicitly asks for the final answer.',
    'If useful, give 1 next step, 1 hint, and 1 quick check question.'
  ].join(' ');

  const user = `Student: ${studentName}\nTopic: ${topic}\nTeaching mode: ${mode}\nStudent message: ${message}\nRespond in Traditional Chinese.`;
  const result = await callChatCompletion({ ...cfg, system, user, temperature: 0.8 });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ mode: 'live', reply: result.text });
});

app.post('/api/teacher/lesson-loop', async (req, res) => {
  const { topic = 'general', weakness = '', studentName = 'student', grade = '' } = req.body || {};
  const cfg = getProviderConfig(req.body);

  if (!cfg.apiKey) {
    return res.status(400).json({
      error: 'Lesson loop is not configured. Add an API key in settings or environment variables.'
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

const pageMap = {
  '/': 'index.html',
  '/teacher': 'teacher.html',
  '/student': 'student.html',
  '/chat': 'chat.html',
  '/analytics': 'analytics.html',
  '/admin': 'admin.html'
};

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  const target = pageMap[req.path] || pageMap[req.path.replace(/\.html$/, '')];
  if (target) {
    const filePath = path.join(publicDir, target);
    return res.type('html').send(fs.readFileSync(filePath, 'utf8'));
  }
  res.type('html').send(fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ Teaching app running → http://localhost:${PORT}`);
  });
}

module.exports = app;
