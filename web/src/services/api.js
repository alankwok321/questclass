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

async function withAuth(payload = {}) {
  // Attach idToken so server can resolve per-user provider config (aiProviderConfigs/{uid}).
  // Also: if local settings has apiKey/baseUrl/model, attach them as a fallback.
  try {
    const settingsRaw = localStorage.getItem('questclass_settings_v1') || '{}';
    let settings = {};
    try { settings = JSON.parse(settingsRaw) || {}; } catch { settings = {}; }

    const getIdToken = window.QuestClassFirebase?.getIdToken;
    const idToken = payload?.idToken || (getIdToken ? await getIdToken() : null);

    // Default: use logged-in user (actor) config on server.
    // If caller explicitly sets uid, keep it (admin/teacher acting for that user).
    const uid = payload?.uid;

    const withLocalFallback = {
      ...payload,
      // Only attach these if caller didn't already set them.
      ...(payload?.apiKey ? {} : (settings.apiKey ? { apiKey: String(settings.apiKey).trim() } : {})),
      ...(payload?.apiBaseUrl ? {} : (settings.apiBaseUrl ? { apiBaseUrl: String(settings.apiBaseUrl).trim() } : {})),
      ...(payload?.model ? {} : (settings.apiModel ? { model: String(settings.apiModel).trim() } : {})),
    };

    if (!idToken) return withLocalFallback;

    return {
      ...withLocalFallback,
      idToken,
      ...(uid ? { uid } : {}),
    };
  } catch {
    return payload;
  }
}

export async function chat(payload) {
  const body = await withAuth(payload);
  return postJson('/api/chat', body);
}

export async function lessonLoop(payload) {
  const body = await withAuth(payload);
  return postJson('/api/teacher/lesson-loop', body);
}

// Ask the AI for questions as JSON. Surfaces the server's real error
// (not configured, not signed in, bad JSON) instead of "no questions".
export async function generateQuestions(body) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, format: 'json' }),
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

export async function getAiConfig(payload) {
  return postJson('/api/ai-config/get', payload);
}

export async function upsertAiConfig(payload) {
  return postJson('/api/ai-config/upsert', payload);
}
