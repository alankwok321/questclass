import { demoData } from './data.js';

export function qs(selector, parent = document) {
  return parent.querySelector(selector);
}

export function qsa(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
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
      <span>${enabled ? 'Firebase config 由 server / env 注入，可接 Email/Password 與 Google OAuth。' : '尚未提供 FIREBASE_* env，先用 demo data。'}</span>
    </div>
  `;
}

export function renderAuthPanel(session = {}, firebaseEnabled = false) {
  const signedIn = session.authMode === 'firebase' && session.uid;
  const roleBadge = session.role ? `<span class="pill">角色：${escapeHtml(session.role)}</span>` : '';
  return `
    <div class="auth-shell">
      <div>
        <span class="eyebrow">Auth</span>
        <h3>${signedIn ? `已登入：${escapeHtml(session.userName || session.email || 'QuestClass User')}` : '登入 QuestClass'}</h3>
        <p class="muted">${firebaseEnabled ? '支援 Google OAuth。若未開 Email/Password，可先用 Google 登入。' : '目前是 demo 模式；部署時加上 FIREBASE_* env 即可啟用。'} ${roleBadge}</p>
      </div>
      <div class="inline-actions auth-actions">
        ${firebaseEnabled ? `
          ${signedIn ? '<button class="button button-ghost" type="button" data-auth-action="logout">Logout</button>' : ''}
          <button class="button button-primary" type="button" data-auth-action="google">${signedIn ? '切換 Google 帳號' : '使用 Google 登入'}</button>
        ` : ''}
      </div>
      ${firebaseEnabled && !signedIn ? `
        <form class="auth-form" data-auth-form>
          <input name="email" type="email" placeholder="teacher@questclass.app" />
          <input name="password" type="password" placeholder="Password" />
          <button class="button button-ghost" type="submit">Email 登入</button>
        </form>
      ` : ''}
    </div>
  `;
}

export function renderProfilePanel(session = {}, profile = {}) {
  const effective = profile || {};
  return `
    <div class="panel-header">
      <div>
        <span class="eyebrow">Profile</span>
        <h3>角色 / 個人檔案</h3>
      </div>
    </div>
    <form class="profile-form" data-profile-form>
      <label class="field-label">顯示名稱</label>
      <input name="name" type="text" value="${escapeHtml(effective.name || session.userName || '')}" placeholder="例如：Alan Teacher" />
      <label class="field-label">目前角色（Firestore）</label>
      <input type="text" value="${escapeHtml(effective.role || session.role || 'student')}" disabled />
      <label class="field-label">申請 / 期望角色</label>
      <select name="requestedRole">
        ${['', 'student', 'teacher', 'admin'].map((role) => `<option value="${role}" ${effective.requestedRole === role ? 'selected' : ''}>${role || '不變更'}</option>`).join('')}
      </select>
      <label class="field-label">學習 / 任務階段</label>
      <input name="learnerStage" type="text" value="${escapeHtml(effective.learnerStage || '')}" placeholder="例如：Grade 5 / teacher dashboard owner" />
      <label class="field-label">角色備註</label>
      <textarea name="roleNote" rows="4" placeholder="例如：我是老師，想開 teacher 權限管理班級。">${escapeHtml(effective.roleNote || '')}</textarea>
      <div class="inline-actions">
        <button class="button button-primary" type="submit">儲存 profile</button>
      </div>
    </form>
    <p class="muted">一般使用者可更新自己的 profile 與 requestedRole；實際 role 建議由 admin 在 Firestore / 管理流程核准。</p>
  `;
}

export function renderAdminPanel(users = [], session = {}) {
  if (session.role !== 'admin') return '';
  return `
    <div class="panel-header">
      <div>
        <span class="eyebrow">Admin</span>
        <h3>角色管理</h3>
      </div>
    </div>
    <form class="admin-role-form" data-admin-role-form>
      <label class="field-label">選擇使用者</label>
      <select name="uid">
        ${users.map((user) => `<option value="${escapeHtml(user.uid)}">${escapeHtml(user.name || user.email || user.uid)} · ${escapeHtml(user.role || 'student')}</option>`).join('')}
      </select>
      <label class="field-label">新角色</label>
      <select name="role">
        ${['student', 'teacher', 'admin'].map((role) => `<option value="${role}">${role}</option>`).join('')}
      </select>
      <div class="inline-actions">
        <button class="button button-primary" type="submit">更新角色</button>
      </div>
    </form>
    <div class="list-grid compact-grid">
      ${users.map((user) => `
        <article class="list-card">
          <strong>${escapeHtml(user.name || user.email || user.uid)}</strong>
          <span>${escapeHtml(user.email || user.uid)}</span>
          <p>role: ${escapeHtml(user.role || 'student')} · requested: ${escapeHtml(user.requestedRole || '—')}</p>
        </article>
      `).join('')}
    </div>
  `;
}
