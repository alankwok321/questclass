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

    // If caller provided studentUid explicitly, keep it.
    // Otherwise, allow admin/teacher to target a student via local setting (aiStudentUid).
    // If still empty, omit studentUid and let server default to actor.uid.
    const uid = window.__qc_user?.uid || null;
    let settingsUid;
    try {
      const s = JSON.parse(localStorage.getItem('questclass_settings_v1') || '{}');
      settingsUid = (s.aiStudentUid || '').trim() || null;
    } catch {
      settingsUid = null;
    }

    const studentUid = payload?.studentUid ?? settingsUid ?? undefined;

    return {
      ...payload,
      idToken,
      ...(studentUid ? { studentUid } : {}),
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
