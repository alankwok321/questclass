// AI requests go through our server with the signed-in user's ID token. The server uses the
// school's AI settings (set by an admin on 「AI 設定」); browsers never hold or send an API key.

// Older versions stored API keys in this browser; remove them.
try { window.localStorage?.removeItem('questclass_settings_v1'); } catch { /* ignore */ }

export async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function currentIdToken() {
  // Call it as a method: the bridge's getIdToken uses `this`.
  const fb = window.QuestClassFirebase;
  if (typeof fb?.getIdToken !== 'function') return null;
  try { return await fb.getIdToken(); } catch { return null; }
}

async function withAuth(payload = {}) {
  const idToken = payload?.idToken || await currentIdToken();
  return idToken ? { ...payload, idToken } : { ...payload };
}

export async function chat(payload) {
  return postJson('/api/chat', await withAuth(payload));
}

export async function lessonLoop(payload) {
  return postJson('/api/teacher/lesson-loop', await withAuth(payload));
}

// Ask the AI for questions as JSON. Surfaces the server's real error
// (not configured, not signed in, bad JSON) instead of "no questions".
export async function generateQuestions(body) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(await withAuth({ ...body, format: 'json' })),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error === 'JSON_PARSE_FAILED' ? 'AI 回應不是有效的 JSON，請再試一次' : (data?.error || `HTTP ${res.status}`);
    throw new Error(msg);
  }
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  if (!questions.length) throw new Error('AI 沒有產生任何題目，請調整條件再試');
  return questions;
}

// Admin only: the school's AI settings.
export async function getAiSettings() {
  return postJson('/api/admin/ai-settings/get', await withAuth({}));
}

export async function saveAiSettings(settings) {
  return postJson('/api/admin/ai-settings/save', await withAuth(settings));
}

export async function testAiSettings() {
  return postJson('/api/admin/ai-settings/test', await withAuth({}));
}

// Platform admin: schools.
export async function createSchool(name) {
  return postJson('/api/platform/schools/create', await withAuth({ name }));
}

export async function renameSchool(schoolId, name) {
  return postJson('/api/platform/schools/rename', await withAuth({ schoolId, name }));
}

// School admin: share the question bank with other schools.
export async function saveSchoolSettings(settings) {
  return postJson('/api/school/settings/save', await withAuth(settings));
}
