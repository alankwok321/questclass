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

export async function chat(payload) {
  return postJson('/api/chat', payload);
}

export async function lessonLoop(payload) {
  return postJson('/api/teacher/lesson-loop', payload);
}

export async function upsertAiConfig(payload) {
  return postJson('/api/ai-config/upsert', payload);
}
