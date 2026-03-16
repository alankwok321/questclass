export async function getRuntimeConfig() {
  const res = await fetch('/api/runtime-config');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'runtime-config failed');
  return data;
}
