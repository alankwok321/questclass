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
  const out = idToken ? { ...payload, idToken } : { ...payload };
  // The platform admin's chosen school (ignored by the server for everyone else).
  if (out.schoolId === undefined) {
    const active = window.QuestClassFirebase?.getActiveSchool?.();
    if (active) out.schoolId = active;
  }
  return out;
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

// Admin only: a school's AI settings. School admins always get their own school;
// the platform admin passes the school they picked.
export async function getAiSettings(schoolId) {
  return postJson('/api/admin/ai-settings/get', await withAuth(schoolId ? { schoolId } : {}));
}

export async function saveAiSettings(settings) {
  return postJson('/api/admin/ai-settings/save', await withAuth(settings));
}

export async function testAiSettings(schoolId) {
  return postJson('/api/admin/ai-settings/test', await withAuth(schoolId ? { schoolId } : {}));
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

// Admin: models offered by an AI provider (defaults to the school's saved provider).
// apiKey: a key the admin has typed but not saved yet (used only to list that provider's models).
export async function listAiModels({ schoolId, apiBaseUrl, apiKey, mode } = {}) {
  return postJson('/api/admin/ai-settings/models', await withAuth({
    ...(schoolId ? { schoolId } : {}),
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(mode ? { mode } : {}),
  }));
}

// Codex via "Sign in with ChatGPT" (device code): start, check, sign out.
export async function chatgptLoginStart(schoolId) {
  return postJson('/api/admin/ai-settings/chatgpt/start', await withAuth(schoolId ? { schoolId } : {}));
}

export async function chatgptLoginPoll(schoolId) {
  return postJson('/api/admin/ai-settings/chatgpt/poll', await withAuth(schoolId ? { schoolId } : {}));
}

export async function chatgptLogout(schoolId) {
  return postJson('/api/admin/ai-settings/chatgpt/disconnect', await withAuth(schoolId ? { schoolId } : {}));
}

// Teacher: suggest a homework title and student instructions from the chosen questions.
export async function suggestHomeworkDetails(questions) {
  const lines = (questions || []).slice(0, 30).map((q, i) => {
    const text = String(q.question_text || q.prompt || '').replace(/\s+/g, ' ').slice(0, 160);
    return `${i + 1}. [${q.type || ''}${q.topic ? ` · ${q.topic}` : ''}${q.target_level ? ` · ${q.target_level}` : ''}] ${text}`;
  });
  const data = await postJson('/api/chat', await withAuth({
    format: 'json',
    topic: 'teacher-homework',
    studentName: 'teacher',
    message: `作業題目（共 ${questions.length} 題）：\n${lines.join('\n')}`,
    system: '你是香港學校老師的助教。根據作業題目，用繁體中文（香港用語）寫：\n'
      + '1. title：簡短作業標題（最多 20 字，說明科目或課題，例如「分數加減練習」）\n'
      + '2. description：給學生的說明（2 至 3 句，最多 120 字）：要做甚麼、共幾題、提醒（例如寫出步驟、檢查答案）。不要透露答案。\n'
      + '只輸出 JSON：{"title":"…","description":"…"}',
  }));
  return {
    title: String(data?.title || '').trim().slice(0, 60),
    description: String(data?.description || '').trim().slice(0, 400),
  };
}
