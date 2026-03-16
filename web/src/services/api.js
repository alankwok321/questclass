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

export async function upsertAiConfig(payload) {
  return postJson('/api/ai-config/upsert', payload);
}
