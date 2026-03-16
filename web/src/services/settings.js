const KEY = 'questclass_settings_v1';

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function saveSettings(next) {
  localStorage.setItem(KEY, JSON.stringify(next || {}));
}

export function clearSettings() {
  localStorage.removeItem(KEY);
}
