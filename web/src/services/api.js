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
  // If firebase bridge is available, attach idToken so server can resolve per-user provider config.
  try {
    const getIdToken = window.QuestClassFirebase?.getIdToken;
    if (!getIdToken) return payload;
    const existing = payload?.idToken;
    if (existing) return payload;
    const idToken = await getIdToken();
    if (!idToken) return payload;

    // Default to actor uid (server will use actor.uid if studentUid omitted).
    // If caller provided studentUid explicitly, keep it.
    const uid = window.__qc_user?.uid || null;
    return {
      ...payload,
      idToken,
      studentUid: payload?.studentUid ?? uid ?? undefined,
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
