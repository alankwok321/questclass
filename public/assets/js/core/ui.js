import { demoData } from './data.js';

export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

export function qsa(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

let toastTimer = null;
export function showToast(text) {
  const node = qs('[data-toast]');
  if (!node) return;
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

export function renderNav(activePage) {
  return demoData.pages.map((page) => `
    <a class="nav-link ${page.key === activePage ? 'active' : ''}" href="${page.href}">${page.label}</a>
  `).join('');
}

export function renderSettingsForm(settings = {}) {
  return `
    <label class="field-label">API Base URL</label>
    <input name="apiBaseUrl" type="url" value="${escapeHtml(settings.apiBaseUrl || '')}" placeholder="https://openrouter.ai/api/v1" />
    <label class="field-label">Model</label>
    <input name="apiModel" type="text" value="${escapeHtml(settings.apiModel || '')}" placeholder="openai/gpt-4.1-mini" />
    <label class="field-label">API Key</label>
    <input name="apiKey" type="password" value="${escapeHtml(settings.apiKey || '')}" placeholder="sk-..." />
    <div class="inline-actions">
      <button class="button button-primary" type="submit">儲存</button>
      <button class="button button-ghost" type="button" data-clear-settings>清除</button>
    </div>
  `;
}

export function renderFirebaseStatus() {
  const enabled = !!window.QuestClassFirebase?.enabled?.();
  return `
    <div class="status-card ${enabled ? 'ok' : 'muted'}">
      <strong>${enabled ? 'Firebase ready' : 'Demo mode'}</strong>
      <span>${enabled ? '可接 Email/Password 與 Google OAuth' : '尚未填入 Firebase config，先用 demo data。'}</span>
    </div>
  `;
}
