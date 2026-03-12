(() => {
  const demoData = {
    brand: {
      name: 'QuestClass',
      version: 'v3',
      promise: '把 AI 教學、班級管理與學習分析拆成真正可維護的多頁產品骨架。'
    },
    pages: [
      { key: 'landing', label: '首頁', href: '/' },
      { key: 'teacher', label: 'Teacher', href: '/teacher' },
      { key: 'student', label: 'Student', href: '/student' },
      { key: 'chat', label: 'AI Chat', href: '/chat' },
      { key: 'analytics', label: 'Analytics', href: '/analytics' },
      { key: 'admin', label: 'Admin', href: '/admin' }
    ],
    classrooms: [
      { id: 'cls-5a', name: '5A 數學實驗班', grade: 'Grade 5', subject: 'Mathematics', activeStudents: 28, completionRate: 84 },
      { id: 'cls-5b', name: '5B 數學強化班', grade: 'Grade 5', subject: 'Mathematics', activeStudents: 25, completionRate: 79 },
      { id: 'cls-6a', name: '6A 邏輯思維班', grade: 'Grade 6', subject: 'Mathematics', activeStudents: 22, completionRate: 88 }
    ],
    students: [
      { id: 'ada', name: 'Ada', level: 7, xp: 1280, nextLevelXp: 1800, streak: 12, weaknessLabel: '分數比較 / 文字題', weaknessScore: '分數 2/5', mastery: 78, status: '需要追蹤' },
      { id: 'mia', name: 'Mia', level: 9, xp: 1640, nextLevelXp: 2200, streak: 17, weaknessLabel: '百分比轉換', weaknessScore: '百分比 3/5', mastery: 86, status: '穩定' },
      { id: 'leo', name: 'Leo', level: 6, xp: 1210, nextLevelXp: 1700, streak: 8, weaknessLabel: '通分 / 約分', weaknessScore: '通分 2/5', mastery: 69, status: '需加強' },
      { id: 'noah', name: 'Noah', level: 6, xp: 1180, nextLevelXp: 1700, streak: 6, weaknessLabel: '文字轉式子', weaknessScore: '文字題 2/5', mastery: 65, status: '需加強' }
    ],
    teacherMetrics: [
      { label: '班級完成率', value: '84%' },
      { label: '平均答對率', value: '78%' },
      { label: '需關注學生', value: '4 人' },
      { label: '今日已出題組', value: '12 組' }
    ],
    dailyQuests: [
      { title: '完成 3 題分數比較', meta: '+80 XP · 未完成' },
      { title: '和 AI 老師對話 5 分鐘', meta: '+50 XP · 未完成' },
      { title: '修正昨天的 2 題錯題', meta: '+100 XP · 已解鎖' }
    ],
    roadmap: [
      'Firebase Auth / Firestore 可直接掛上 role 與 users collection',
      'Google OAuth 已保留 bridge 接口',
      'Express API 維持 /api/chat 與 /api/teacher/lesson-loop',
      'Vercel 仍以 server.js 作為單一入口'
    ],
    units: [
      { name: '分數概念', progress: '完成 82%', tag: '核心單元' },
      { name: '通分與約分', progress: '完成 61%', tag: '補強中' },
      { name: '應用題建模', progress: '完成 44%', tag: '高風險' }
    ],
    questionBank: [
      { type: '診斷題', title: '比較 3/4 與 2/3，並解釋原因' },
      { type: '情境題', title: '把披薩情境翻成分數大小比較' },
      { type: '變體題', title: '比較 5/8 與 7/10，先用圖像思考' }
    ],
    knowledgeMap: [
      { title: '分數基礎', status: 'done', meta: '已掌握' },
      { title: '分數比較', status: 'focus', meta: '目前主線' },
      { title: '通分', status: 'focus', meta: '需要練習' },
      { title: '分數加減', status: 'locked', meta: '尚未解鎖' },
      { title: '文字應用題', status: 'focus', meta: '錯誤率偏高' },
      { title: '百分比轉換', status: 'locked', meta: '下一章' }
    ],
    skills: [
      { label: '概念理解', score: 78 },
      { label: '步驟完整', score: 61 },
      { label: '文字轉式子', score: 42 },
      { label: '計算穩定度', score: 73 }
    ],
    heatmap: [
      { label: '分數大小', level: 'high' },
      { label: '通分', level: 'mid' },
      { label: '約分', level: 'low' },
      { label: '文字題', level: 'high' },
      { label: '百分比', level: 'mid' }
    ],
    mistakeLinks: [
      { title: '錯題群：分數比較 + 文字題理解', text: '學生常在語意轉換時卡住，不是單純計算失誤。' },
      { title: '關聯建議：先補通分，再回到應用題', text: '先用圖像和同分母例子，再讓學生自己說出比較依據。' }
    ],
    defaultChat: [
      { role: 'ai', text: '嗨，今天先不要急著拿答案。先告訴我，你最卡的是觀念、步驟，還是文字理解？' }
    ]
  };

  const STORAGE_KEY = 'questclass_clean_state_v1';
  const SETTINGS_KEY = 'questclass_settings_v1';
  const page = document.body?.dataset?.page || 'landing';
  const rolePages = { teacher: ['teacher', 'analytics'], student: ['student', 'chat'], admin: ['teacher', 'analytics', 'student', 'chat', 'admin'] };
  let firebaseProfile = null;
  let adminUsers = [];
  let adminSelectedUid = null;
  let adminFilters = { query: '', status: 'all' };
  let toastTimer = null;
  let firestoreDebug = { error: '', step: '', detail: '' };
  let firestoreData = { mode: 'demo', classrooms: [], classroom: null, students: [], student: null, summary: null, submissions: [], metrics: [] };

  const qs = (s, p = document) => p.querySelector(s);
  const qsa = (s, p = document) => Array.from(p.querySelectorAll(s));
  const escapeHtml = (text) => { const d = document.createElement('div'); d.textContent = text == null ? '' : String(text); return d.innerHTML; };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const merge = (base, patch) => { const out = { ...base }; Object.entries(patch || {}).forEach(([k, v]) => { out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v; }); return out; };
  const defaultState = {
    session: { role: 'teacher', authMode: 'demo', userName: 'Alan Teacher', email: 'teacher@questclass.app', uid: null, photoURL: '' },
    currentClassroomId: demoData.classrooms[0].id,
    currentStudentId: demoData.students[0].id,
    chat: demoData.defaultChat,
    assignment: ['比較 3/4 與 2/3', '把生活題翻成數學式', '用圖像解釋通分'],
    insight: 'Ada 適合先補語意轉換，再回到應用題。',
    teacherSummary: ['本輪建議以 12 分鐘微任務進行', '先用圖像，再進文字題', '下一輪追蹤提示後正確率'],
    loopSteps: [],
    modes: { chat: 'Demo mode', loop: 'Demo mode' }
  };
  const loadState = () => { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); return saved ? merge(clone(defaultState), saved) : clone(defaultState); } catch { return clone(defaultState); } };
  const saveState = (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const getSettings = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } };
  const saveSettings = (settings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const clearSettings = () => localStorage.removeItem(SETTINGS_KEY);
  const showToast = (text) => { const n = qs('[data-toast]'); if (!n) return; n.textContent = text; n.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), 2500); };
  const state = loadState();

  const currentTeacherClassroom = () => firestoreData.classroom || demoData.classrooms.find((c) => c.id === state.currentClassroomId) || demoData.classrooms[0];
  const currentTeacherStudent = () => firestoreData.students.find((s) => s.id === state.currentStudentId) || demoData.students.find((s) => s.id === state.currentStudentId) || firestoreData.students[0] || demoData.students[0];
  const currentStudentView = () => firestoreData.student || demoData.students.find((s) => s.id === state.currentStudentId) || demoData.students[0];

  function renderNav(active) {
    const role = state.session.role;
    const signedIn = state.session.authMode === 'firebase' && state.session.uid;
    const visiblePages = demoData.pages.filter((p) => {
      if (p.key === 'landing') return true;
      if (p.key === 'admin') return role === 'admin';
      if (p.key === 'teacher' || p.key === 'analytics') return signedIn && (role === 'teacher' || role === 'admin');
      if (p.key === 'student' || p.key === 'chat') return signedIn && (role === 'student' || role === 'admin');
      return true;
    });
    return visiblePages.map((p) => `<a class="nav-link ${p.key === active ? 'active' : ''}" href="${p.href}">${p.label}</a>`).join('');
  }
  function renderSettingsForm(settings = {}) { return `<label class="field-label">API Base URL</label><input name="apiBaseUrl" type="url" value="${escapeHtml(settings.apiBaseUrl || '')}" placeholder="https://openrouter.ai/api/v1" /><label class="field-label">Model</label><input name="apiModel" type="text" value="${escapeHtml(settings.apiModel || '')}" placeholder="openai/gpt-4.1-mini" /><label class="field-label">API Key</label><input name="apiKey" type="password" value="${escapeHtml(settings.apiKey || '')}" placeholder="sk-..." /><div class="inline-actions"><button class="button button-primary" type="submit">儲存</button><button class="button button-ghost" type="button" data-clear-settings>清除</button></div>`; }
  function renderFirebaseStatus() { const enabled = !!window.QuestClassFirebase?.enabled?.(); return `<div class="status-card ${enabled ? 'ok' : 'muted'}"><strong>${enabled ? 'Firebase ready' : 'Demo mode'}</strong><span>${enabled ? 'Firebase config 已啟用，可接 Google OAuth。' : '尚未提供 Firebase config。'}</span></div>`; }
  function renderAuthPanel(session = {}, firebaseEnabled = false) { const signedIn = session.authMode === 'firebase' && session.uid; if (!firebaseEnabled) return ''; const avatar = session.photoURL ? `<img class="account-avatar" src="${escapeHtml(session.photoURL)}" alt="avatar" />` : '<span class="account-avatar account-avatar-fallback">G</span>'; const role = String(session.role || '').toLowerCase(); const roleMeta = role === 'admin' ? { icon: '🛡️', label: 'admin' } : role === 'teacher' ? { icon: '👩‍🏫', label: 'teacher' } : role === 'student' ? { icon: '🧑‍🎓', label: 'student' } : { icon: '❓', label: role || 'unknown' }; const badge = signedIn ? `<span class="role-badge">${roleMeta.icon} ${escapeHtml(roleMeta.label)}</span>` : ''; const label = signedIn ? `${avatar}<span>${escapeHtml(session.userName || session.email || 'Google 帳號')}</span>${badge}` : '使用 Google 登入'; return `<div class="inline-actions auth-actions">${signedIn ? '<button class="button button-ghost" type="button" data-auth-action="logout">Logout</button>' : ''}<button class="button button-primary account-button" type="button" data-auth-action="google">${label}</button></div>`; }
  function renderProfilePanel(session = {}, profile = {}) { const effective = profile || {}; return `<div class="panel-header"><div><span class="eyebrow">Profile</span><h3>角色 / 個人檔案</h3></div></div><form class="profile-form" data-profile-form><label class="field-label">顯示名稱</label><input name="name" type="text" value="${escapeHtml(effective.name || session.userName || '')}" placeholder="例如：Alan Teacher" /><label class="field-label">目前角色（Firestore）</label><input type="text" value="${escapeHtml(effective.role || session.role || 'student')}" disabled /><label class="field-label">申請 / 期望角色</label><select name="requestedRole">${['', 'student', 'teacher', 'admin'].map((role) => `<option value="${role}" ${effective.requestedRole === role ? 'selected' : ''}>${role || '不變更'}</option>`).join('')}</select><label class="field-label">學習 / 任務階段</label><input name="learnerStage" type="text" value="${escapeHtml(effective.learnerStage || '')}" placeholder="例如：Grade 5 / teacher dashboard owner" /><label class="field-label">角色備註</label><textarea name="roleNote" rows="4">${escapeHtml(effective.roleNote || '')}</textarea><div class="inline-actions"><button class="button button-primary" type="submit">儲存 profile</button></div></form>`; }
  function renderAdminPanel(users = [], session = {}) { if (session.role !== 'admin') return '<div class="panel-header"><div><span class="eyebrow">Admin</span><h3>角色管理</h3></div></div><p class="muted">此區僅在 Firestore profile.role = admin 時顯示。</p>'; return `<div class="panel-header"><div><span class="eyebrow">Admin</span><h3>角色管理</h3></div></div><form class="admin-role-form" data-admin-role-form><label class="field-label">選擇使用者</label><select name="uid">${users.map((u) => `<option value="${escapeHtml(u.uid)}">${escapeHtml(u.name || u.email || u.uid)} · ${escapeHtml(u.role || 'student')}</option>`).join('')}</select><label class="field-label">新角色</label><select name="role">${['student', 'teacher', 'admin'].map((r) => `<option value="${r}">${r}</option>`).join('')}</select><div class="inline-actions"><button class="button button-primary" type="submit">更新角色</button></div></form>`; }
  async function sendChat(message, studentName) { const s = getSettings(); const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, topic: 'fractions', mode: 'socratic', studentName, apiBaseUrl: s.apiBaseUrl || '', model: s.apiModel || '', apiKey: s.apiKey || '' }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Chat request failed'); return data; }
  async function runLessonLoop(student, classroom) { const s = getSettings(); const res = await fetch('/api/teacher/lesson-loop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'fractions', weakness: student.weaknessLabel, studentName: student.name, grade: classroom.grade, apiBaseUrl: s.apiBaseUrl || '', model: s.apiModel || '', apiKey: s.apiKey || '' }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Lesson loop request failed'); return data; }
  const metricValue = (label, fallback) => firestoreData.metrics.find((item) => item.label === label)?.value || fallback;
  const studentMastery = (student) => Number(student?.summary?.mastery || student?.mastery || 0);
  const studentWeakness = (student) => student?.summary?.weaknessLabel || student?.weaknessLabel || '待補資料';
  const studentWeaknessScore = (student) => student?.summary?.weaknessScore || student?.weaknessScore || '—';
  const studentLevel = (student) => student?.summary?.level || student?.level || 1;
  const studentXp = (student) => student?.summary?.xp || student?.xp || 0;
  const studentNextXp = (student) => student?.summary?.nextLevelXp || student?.nextLevelXp || 0;
  const studentStreak = (student) => student?.summary?.streak || student?.streak || 0;
  const studentStatus = (student) => studentMastery(student) >= 85 ? '穩定' : studentMastery(student) >= 75 ? '追蹤中' : '需加強';

  const studentDataSourceMeta = () => {
    if (firestoreData.mode === 'firestore') {
      const liveStudent = firestoreData.student || {};
      const liveClassroom = firestoreData.classroom || firestoreData.classrooms?.[0] || {};
      return {
        tone: 'live',
        badge: '🟢 Firestore live',
        title: '目前顯示的是 Firestore 即時資料',
        description: state.session.authMode === 'firebase'
          ? '此頁面正在讀取你帳號對應的學生 / 課堂 / submissions 資料，不是前端 demo 假資料。'
          : '此頁面正在讀取 Firestore 資料。',
        detailRows: [
          liveStudent.id ? `studentId：${liveStudent.id}` : 'studentId：已連接',
          liveClassroom.id ? `classroomId：${liveClassroom.id}` : 'classroom：已連接',
          `submissions：${firestoreData.submissions.length} 筆`,
          '來源：Firestore dashboard + summary'
        ],
        highlight: firestoreData.submissions.length
          ? `最近已同步 ${firestoreData.submissions.length} 筆作業 / 提交資料。`
          : '目前已連到 Firestore，但尚未讀到 submission 紀錄。'
      };
    }
    if (firestoreData.mode === 'error') {
      return {
        tone: 'fallback',
        badge: '🟠 Demo fallback',
        title: 'Firestore 載入失敗，已退回 demo 資料',
        description: '畫面仍可操作，但目前顯示的是內建示範資料，方便繼續驗 UI / flow。',
        detailRows: [
          '原因：Firestore request failed',
          '來源：local demo dataset',
          '用途：避免整頁空白',
          '建議：檢查登入狀態 / rules / data seed'
        ],
        highlight: '這不是 live student record；重新整理或重新登入後可再試一次。'
      };
    }
    return {
      tone: 'fallback',
      badge: '⚪ Demo mode',
      title: '目前顯示的是 demo fallback 資料',
      description: '尚未連到可用的 Firestore 學生資料，所以畫面使用預設示範內容。',
      detailRows: [
        `authMode：${state.session.authMode || 'demo'}`,
        '來源：local demo dataset',
        '用途：先展示學生體驗與版面',
        '切換方式：登入有資料的 Firebase 帳號'
      ],
      highlight: '這一頁目前不是即時資料；連到 Firestore 後，數值與任務會改成真實紀錄。'
    };
  };
  const formatSubmissionMeta = (item = {}) => {
    const parts = [];
    if (item.status) parts.push(item.status);
    if (item.score != null && item.score !== '') parts.push(`${item.score} 分`);
    if (item.updatedAt || item.submittedAt || item.createdAt) parts.push('Firestore');
    return parts.join(' · ') || 'Firestore record';
  };
  function renderStudentDataPanel(student, summaryData = {}) {
    const meta = studentDataSourceMeta();
    const panel = qs('[data-student-data-panel]');
    if (!panel) return;
    const classroom = firestoreData.classroom || firestoreData.classrooms?.[0] || null;
    const snapshot = firestoreData.mode === 'firestore'
      ? [
          { label: 'Student record', value: student?.id || '已連接' },
          { label: 'Classroom', value: classroom?.name || classroom?.id || '已連接' },
          { label: 'Mastery', value: `${summaryData.mastery || studentMastery(student)}%` },
          { label: 'Weakness', value: summaryData.weaknessLabel || studentWeakness(student) },
          { label: 'Role', value: state.session.role || 'unknown' },
          { label: 'Email', value: state.session.email || '—' }
        ]
      : [
          { label: 'Demo student', value: student?.name || 'Ada' },
          { label: 'Mode', value: meta.badge.replace(/^.+?\s/, '') },
          { label: 'Mastery', value: `${summaryData.mastery || studentMastery(student)}%` },
          { label: 'Weakness', value: summaryData.weaknessLabel || studentWeakness(student) },
          { label: 'Role', value: state.session.role || 'unknown' },
          { label: 'Email', value: state.session.email || '—' },
          { label: 'Debug step', value: firestoreDebug.step || '—' },
          { label: 'Debug error', value: firestoreDebug.error || 'none' }
        ];
    panel.innerHTML = `<div class="panel-header"><div><span class="eyebrow">Data source</span><h2>資料來源狀態</h2></div><span class="data-source-badge ${meta.tone}">${escapeHtml(meta.badge)}</span></div><div class="student-data-layout"><article class="status-card ${meta.tone === 'live' ? 'ok' : ''}"><strong>${escapeHtml(meta.title)}</strong><span>${escapeHtml(meta.description)}</span><p class="data-source-highlight">${escapeHtml(meta.highlight)}</p><div class="student-data-points">${meta.detailRows.map((row) => `<span class="pill">${escapeHtml(row)}</span>`).join('')}</div></article><div class="student-snapshot-grid">${snapshot.map((item) => `<article class="metric-card student-snapshot-card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(String(item.value || '—'))}</strong></article>`).join('')}</div></div>`;
  }

  function setShell() { qsa('[data-nav]').forEach((n) => n.innerHTML = renderNav(page)); qsa('[data-brand]').forEach((n) => n.textContent = `${demoData.brand.name} ${demoData.brand.version}`); qsa('[data-promise]').forEach((n) => n.textContent = demoData.brand.promise); qsa('[data-topbar-auth]').forEach((n) => n.innerHTML = renderAuthPanel(state.session, !!window.QuestClassFirebase?.enabled?.())); }
  function wireSettings() { qsa('[data-settings-form]').forEach((form) => { form.innerHTML = renderSettingsForm(getSettings()); form.onsubmit = (e) => { e.preventDefault(); saveSettings(Object.fromEntries(new FormData(form).entries())); showToast('AI 設定已儲存'); }; const clearBtn = qs('[data-clear-settings]', form); if (clearBtn) clearBtn.onclick = () => { clearSettings(); wireSettings(); showToast('AI 設定已清除'); }; }); }
  function wireFirebaseStatus() { qsa('[data-firebase-status]').forEach((node) => node.innerHTML = renderFirebaseStatus()); }
  function applyFirebaseUser(user) { state.session.authMode = 'firebase'; state.session.role = user.role || state.session.role; state.session.userName = user.name || state.session.userName; state.session.email = user.email || state.session.email; state.session.uid = user.uid || state.session.uid; state.session.photoURL = user.photoURL || state.session.photoURL || ''; state.session.profileRole = user.profileRole || ''; state.session.derivedRole = user.derivedRole || ''; saveState(state); }
  function clearFirebaseSession() { state.session.authMode = 'demo'; state.session.role = 'teacher'; state.session.userName = 'Alan Teacher'; state.session.email = 'teacher@questclass.app'; state.session.uid = null; state.session.photoURL = ''; state.session.profileRole = ''; state.session.derivedRole = ''; firestoreData = { mode: 'demo', classrooms: [], classroom: null, students: [], student: null, summary: null, submissions: [], metrics: [] }; saveState(state); }
  function enforcePageGuard() { if (state.session.authMode !== 'firebase' || !state.session.uid) { if (page === 'admin') window.location.replace('/'); return; } const allowed = rolePages[state.session.role] || []; if (page !== 'landing' && !allowed.includes(page)) window.location.replace(state.session.role === 'teacher' ? '/teacher' : (state.session.role === 'admin' ? '/admin' : '/student')); }
  async function refreshAdminUsers() { if (state.session.role !== 'admin' || !window.QuestClassFirebase?.listUsers) { adminUsers = []; adminSelectedUid = null; return; } const result = await window.QuestClassFirebase.listUsers(); adminUsers = result?.ok ? (result.users || []) : []; if (!adminUsers.length) adminSelectedUid = null; else if (!adminSelectedUid || !adminUsers.some((u) => u.uid === adminSelectedUid)) adminSelectedUid = adminUsers[0].uid; }
  async function syncFirestoreData() {
    if (state.session.authMode !== 'firebase' || !state.session.uid || !window.QuestClassFirebase?.enabled?.()) {
      firestoreDebug = { error: '', step: 'not-signed-in-or-firebase-disabled', detail: '' };
      firestoreData = { mode: 'demo', classrooms: [], classroom: null, students: [], student: null, summary: null, submissions: [], metrics: [] };
      return;
    }
    try {
      firestoreDebug = { error: '', step: state.session.role === 'teacher' || state.session.role === 'admin' ? 'load-teacher-dashboard' : 'load-student-dashboard', detail: `role=${state.session.role || ''} uid=${state.session.uid || ''}` };
      if (state.session.role === 'teacher' || state.session.role === 'admin') {
        const dashboard = await window.QuestClassFirebase.getTeacherDashboard(state.currentClassroomId || null);
        if (!dashboard?.ok) throw new Error(dashboard?.error || 'Teacher dashboard load failed');
        firestoreData = { mode: 'firestore', classrooms: dashboard.classrooms || [], classroom: dashboard.classroom || null, students: dashboard.students || [], student: null, summary: null, submissions: dashboard.submissions || [], metrics: dashboard.metrics || [] };
        if (firestoreData.classroom?.id) state.currentClassroomId = firestoreData.classroom.id;
        if (firestoreData.students.length && !firestoreData.students.some((student) => student.id === state.currentStudentId)) state.currentStudentId = firestoreData.students[0].id;
      } else {
        const dashboard = await window.QuestClassFirebase.getStudentDashboard();
        if (!dashboard?.ok) throw new Error(dashboard?.error || 'Student dashboard load failed');
        firestoreData = { mode: 'firestore', classrooms: dashboard.classrooms || [], classroom: dashboard.classrooms?.[0] || null, students: [], student: dashboard.student || null, summary: dashboard.summary || null, submissions: dashboard.submissions || [], metrics: [] };
        if (firestoreData.student?.id) state.currentStudentId = firestoreData.student.id;
      }
      firestoreDebug = { error: '', step: 'loaded', detail: `mode=${firestoreData.mode} role=${state.session.role || ''} uid=${state.session.uid || ''}` };
      saveState(state);
    } catch (error) {
      console.error(error);
      firestoreDebug = { error: error?.message || 'Firestore 資料載入失敗', step: 'sync-failed', detail: `role=${state.session.role || ''} uid=${state.session.uid || ''}` };
      firestoreData = { mode: 'error', classrooms: [], classroom: null, students: [], student: null, summary: null, submissions: [], metrics: [] };
      showToast(error?.message || 'Firestore 資料載入失敗');
    }
  }
  async function handleGoogleLogin() { try { if (!window.QuestClassFirebase?.signInWithGoogle) return showToast('Firebase 尚未啟用'); const result = await window.QuestClassFirebase.signInWithGoogle(); if (!result.ok) return showToast(result.error || 'Google 登入失敗'); applyFirebaseUser(result.user); firebaseProfile = result.user.profile || firebaseProfile; await refreshAdminUsers(); await syncFirestoreData(); renderAll(); enforcePageGuard(); showToast('已登入 Google'); } catch (e) { showToast(e?.message || 'Google 登入失敗'); } }
  async function handleLogout() { try { if (window.QuestClassFirebase?.signOut) await window.QuestClassFirebase.signOut(); clearFirebaseSession(); firebaseProfile = null; adminUsers = []; adminSelectedUid = null; renderAll(); if (page === 'admin') window.location.replace('/'); showToast('已登出'); } catch (e) { showToast(e?.message || '登出失敗'); } }

  function renderLanding() { const roadmap = qs('[data-roadmap]'); const spotlight = qs('[data-spotlight]'); if (roadmap) roadmap.innerHTML = demoData.roadmap.map((i) => `<li>${escapeHtml(i)}</li>`).join(''); if (spotlight) spotlight.innerHTML = demoData.pages.filter((i) => i.key !== 'landing' && (i.key !== 'admin' || state.session.role === 'admin')).map((i) => `<a class="surface-link" href="${i.href}"><strong>${i.label}</strong><span>進入 ${i.label} 頁面</span></a>`).join(''); }
  function renderTeacher() {
    const student = currentTeacherStudent();
    const classroom = currentTeacherClassroom();
    const hero = qs('[data-teacher-hero]');
    if (hero) hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Teacher OS</span><h1>${escapeHtml(classroom?.name || '尚未連接班級')}</h1><p>目前焦點學生：${escapeHtml(student?.name || '—')} · 弱點：${escapeHtml(studentWeakness(student))}</p></div><div class="hero-stats"><div><strong>${escapeHtml(String(classroom?.activeStudents || classroom?.studentIds?.length || 0))}</strong><span>活躍學生</span></div><div><strong>${escapeHtml(String(classroom?.completionRate || metricValue('班級完成率', '0%')))}</strong><span>完成率</span></div></div>`;
    const metrics = qs('[data-teacher-metrics]');
    if (metrics) metrics.innerHTML = (firestoreData.mode === 'firestore' ? firestoreData.metrics : demoData.teacherMetrics).map((m) => `<article class="metric-card"><span>${m.label}</span><strong>${m.value}</strong></article>`).join('');
    const students = qs('[data-student-cards]');
    if (students) {
      const source = firestoreData.mode === 'firestore' ? firestoreData.students : demoData.students;
      students.innerHTML = source.length ? source.map((i) => `<button class="list-card ${i.id === state.currentStudentId ? 'active' : ''}" data-student-id="${i.id}"><strong>${escapeHtml(i.name)}</strong><span>${escapeHtml(studentStatus(i))}</span><p>${escapeHtml(studentWeakness(i))}</p></button>`).join('') : '<p class="muted">這個班級目前還沒有學生資料。</p>';
      qsa('[data-student-id]', students).forEach((b) => b.onclick = () => { state.currentStudentId = b.dataset.studentId; saveState(state); renderTeacher(); });
    }
    const cls = qs('[data-classroom-list]');
    if (cls) {
      const source = firestoreData.mode === 'firestore' ? firestoreData.classrooms : demoData.classrooms;
      cls.innerHTML = source.length ? source.map((i) => `<button class="list-card ${i.id === state.currentClassroomId ? 'active' : ''}" data-classroom-id="${i.id}"><strong>${escapeHtml(i.name)}</strong><span>${escapeHtml(i.grade || '')} · ${escapeHtml(i.subject || '')}</span></button>`).join('') : '<p class="muted">目前沒有可顯示的班級。</p>';
      qsa('[data-classroom-id]', cls).forEach((b) => b.onclick = async () => { state.currentClassroomId = b.dataset.classroomId; saveState(state); await syncFirestoreData(); renderTeacher(); });
    }
    const summary = qs('[data-teacher-summary]'); if (summary) summary.innerHTML = state.teacherSummary.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
    const assignment = qs('[data-assignment]'); if (assignment) assignment.innerHTML = state.assignment.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
    const insight = qs('[data-insight]'); if (insight) insight.textContent = state.insight;
    const mode = qs('[data-loop-mode]'); if (mode) mode.textContent = state.modes.loop + (firestoreData.mode === 'firestore' ? ' · Firestore data' : '');
    const output = qs('[data-loop-output]');
    if (output) {
      const recentSubmissions = firestoreData.mode === 'firestore' ? firestoreData.submissions.filter((item) => item.studentId === student?.id).slice(0, 3).map((item) => `最近提交：${item.assignmentTitle || item.topic || '未命名作業'} · ${item.score ?? '—'} 分`) : [];
      const items = state.loopSteps.length ? state.loopSteps : (recentSubmissions.length ? recentSubmissions : ['按下「產生 lesson loop」取得新一輪教學流程。']);
      output.innerHTML = items.map((i) => `<div class="timeline-item">${escapeHtml(i)}</div>`).join('');
    }
    const runBtn = qs('[data-run-loop]'); if (runBtn) runBtn.onclick = async () => { try { const data = await runLessonLoop({ name: student?.name || 'Ada', weaknessLabel: studentWeakness(student) }, { grade: classroom?.grade || 'Grade 5' }); state.assignment = data.assignment || state.assignment; state.insight = data.insight || state.insight; state.teacherSummary = data.teacherSummary || state.teacherSummary; state.loopSteps = data.steps || []; state.modes.loop = data.mode === 'live' ? 'Live AI' : 'Demo mode'; saveState(state); renderTeacher(); showToast('教學流程已更新'); } catch (e) { showToast(e?.message || '教學流程更新失敗'); } };
  }
  function renderStudent() {
    const student = currentStudentView();
    const summaryData = firestoreData.summary || student?.summary || {};
    const liveMode = firestoreData.mode === 'firestore';
    const hero = qs('[data-student-hero]');
    if (hero) hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Student Home</span><h1>${escapeHtml(student?.name || '尚未建立學生檔案')}</h1><p>目前弱點：${escapeHtml(summaryData.weaknessLabel || studentWeakness(student))} · 連續學習 ${escapeHtml(String(summaryData.streak || studentStreak(student)))} 天</p><div class="hero-badge-row"><span class="data-source-badge ${liveMode ? 'live' : 'fallback'}">${liveMode ? '🟢 Firestore live data' : (firestoreData.mode === 'error' ? '🟠 Demo fallback' : '⚪ Demo data')}</span><span class="hero-data-note">${escapeHtml(liveMode ? '這些數值會跟著 Firestore dashboard / summary 更新。' : '目前是示範資料，方便先驗學生頁體驗。')}</span></div></div><div class="hero-stats"><div><strong>Lv.${escapeHtml(String(summaryData.level || studentLevel(student)))}</strong><span>目前等級</span></div><div><strong>${escapeHtml(String(summaryData.mastery || studentMastery(student)))}%</strong><span>技能掌握</span></div></div>`;
    renderStudentDataPanel(student, summaryData);
    const progress = qs('[data-student-progress]');
    if (progress) progress.innerHTML = `<article class="metric-card ${liveMode ? 'live-metric-card' : ''}"><span>XP ${liveMode ? '· Firestore' : ''}</span><strong>${escapeHtml(String(summaryData.xp || studentXp(student)))}</strong></article><article class="metric-card ${liveMode ? 'live-metric-card' : ''}"><span>下一級目標</span><strong>${escapeHtml(String(summaryData.nextLevelXp || studentNextXp(student)))}${liveMode ? '<small>來自 summary</small>' : ''}</strong></article><article class="metric-card ${liveMode ? 'live-metric-card' : ''}"><span>弱點分數</span><strong>${escapeHtml(summaryData.weaknessScore || studentWeaknessScore(student))}</strong></article>`;
    const quests = qs('[data-quests]');
    if (quests) {
      const source = liveMode && firestoreData.submissions.length
        ? firestoreData.submissions.slice(0, 3).map((item) => ({ title: item.assignmentTitle || item.topic || '未命名任務', meta: formatSubmissionMeta(item), detail: item.studentId ? `studentId: ${item.studentId}` : 'Firestore submission' }))
        : demoData.dailyQuests.map((item) => ({ ...item, detail: 'demo quest' }));
      quests.innerHTML = source.map((q) => `<article class="list-card ${liveMode ? 'data-driven-card' : ''}"><strong>${escapeHtml(q.title)}</strong><span>${escapeHtml(q.meta)}</span>${q.detail ? `<p>${escapeHtml(q.detail)}</p>` : ''}</article>`).join('');
    }
    const roster = qs('[data-student-roster]');
    if (roster) {
      const source = liveMode && firestoreData.classrooms.length
        ? firestoreData.classrooms.map((room) => ({ id: room.id, name: room.name, label: `${room.grade || ''} · ${room.subject || ''}`, detail: room.id ? `classroomId: ${room.id}` : 'Firestore classroom' }))
        : demoData.students.map((i) => ({ id: i.id, name: i.name, label: `Level ${i.level}`, detail: 'demo student switcher' }));
      roster.innerHTML = source.map((i) => `<article class="list-card ${i.id === state.currentClassroomId || i.id === state.currentStudentId ? 'active' : ''} ${liveMode ? 'data-driven-card' : ''}"><strong>${escapeHtml(i.name)}</strong><span>${escapeHtml(i.label)}</span><p>${escapeHtml(i.detail || '')}</p></article>`).join('');
    }
  }
  function renderChatPage() { const messages = qs('[data-chat-messages]'); if (messages) messages.innerHTML = state.chat.map((m) => `<div class="chat-bubble ${m.role}">${escapeHtml(m.text)}</div>`).join(''); const status = qs('[data-chat-mode]'); if (status) status.textContent = state.modes.chat; const form = qs('[data-chat-form]'); if (form) form.onsubmit = async (e) => { e.preventDefault(); const input = qs('[name="message"]', form); const msg = input?.value.trim(); if (!msg) return; state.chat.push({ role: 'user', text: msg }); saveState(state); renderChatPage(); input.value = ''; try { const data = await sendChat(msg, currentStudentView()?.name || currentTeacherStudent()?.name || 'Ada'); state.chat.push({ role: 'ai', text: data.reply || '目前沒有回應。' }); state.modes.chat = data.mode === 'live' ? 'Live AI' : 'Demo mode'; saveState(state); renderChatPage(); } catch (e2) { state.chat.push({ role: 'ai', text: '目前連線失敗，我先用 demo 模式陪你拆題。先說說你最卡的那一步。' }); state.modes.chat = 'Demo fallback'; saveState(state); renderChatPage(); showToast(e2?.message || 'Chat 失敗'); } }; qsa('[data-seed-prompt]').forEach((b) => b.onclick = () => { const i = qs('[name="message"]'); if (i) i.value = b.dataset.seedPrompt || ''; }); }
  function renderAnalytics() { const units = qs('[data-units]'); if (units) units.innerHTML = demoData.units.map((u) => `<article class="list-card"><strong>${u.name}</strong><span>${u.tag}</span><p>${u.progress}</p></article>`).join(''); const bank = qs('[data-question-bank]'); if (bank) bank.innerHTML = demoData.questionBank.map((i) => `<article class="list-card"><strong>${i.type}</strong><p>${i.title}</p></article>`).join(''); const map = qs('[data-knowledge-map]'); if (map) map.innerHTML = demoData.knowledgeMap.map((i) => `<article class="map-card ${i.status}"><strong>${i.title}</strong><span>${i.meta}</span></article>`).join(''); const skills = qs('[data-skills]'); if (skills) skills.innerHTML = demoData.skills.map((i) => `<div class="skill-row"><span>${i.label}</span><div class="skill-bar"><div style="width:${i.score}%"></div></div><strong>${i.score}%</strong></div>`).join(''); const heatmap = qs('[data-heatmap]'); if (heatmap) heatmap.innerHTML = demoData.heatmap.map((i) => `<div class="heat-cell ${i.level}">${i.label}</div>`).join(''); const links = qs('[data-mistake-links]'); if (links) links.innerHTML = demoData.mistakeLinks.map((i) => `<article class="list-card"><strong>${i.title}</strong><p>${i.text}</p></article>`).join(''); }
  function adminDisplayStatus(user = {}) { return String(user.accountStatus || 'active').toLowerCase(); }
  function adminHasIssue(user = {}) { return !!(adminDisplayStatus(user) !== 'active' || String(user.adminNote || '').trim()); }
  function adminMatches(user = {}) { const query = adminFilters.query.trim().toLowerCase(); const role = String(user.role || '').toLowerCase(); const status = adminDisplayStatus(user); const pending = !!String(user.requestedRole || '').trim(); const haystack = [user.name, user.email, user.uid, user.requestedRole].filter(Boolean).join(' ').toLowerCase(); const queryOk = !query || haystack.includes(query); const filterOk = adminFilters.status === 'all' || (adminFilters.status === 'issue' && adminHasIssue(user)) || (adminFilters.status === 'pending' && pending) || (adminFilters.status === 'suspended' && status === 'suspended') || adminFilters.status === role; return queryOk && filterOk; }
  function renderAdminAccess() { const node = qs('[data-admin-access]'); const statusNode = qs('[data-admin-status]'); if (statusNode) statusNode.textContent = state.session.role === 'admin' ? 'Admin' : (state.session.authMode === 'firebase' ? 'Access denied' : 'Login required'); if (!node) return; if (state.session.authMode !== 'firebase' || !state.session.uid) { node.innerHTML = '<div class="panel-header"><div><span class="eyebrow">Access</span><h2>需要登入</h2></div></div><p class="muted">這個頁面只給 admin 使用。請先用 Google 登入，再由現有 admin 指派角色。</p>'; return; } if (state.session.role !== 'admin') { node.innerHTML = '<div class="panel-header"><div><span class="eyebrow">Access</span><h2>拒絕存取</h2></div></div><p class="muted">你目前不是 admin。若需要管理帳號，請在個人 profile 提出 requestedRole，或聯絡現有 admin 處理。</p>'; return; } node.innerHTML = '<div class="panel-header"><div><span class="eyebrow">Admin ready</span><h2>你可以管理帳號</h2></div></div><p class="muted">可查看帳號清單、調整角色與帳號狀態，並留下 admin note。</p>'; }
  function renderAdminPage() {
    const listNode = qs('[data-admin-user-list]');
    const detailNode = qs('[data-admin-detail]');
    renderAdminAccess();
    const totalNode = qs('[data-admin-total-users]'); if (totalNode) totalNode.textContent = String(adminUsers.length);
    const pendingNode = qs('[data-admin-pending]'); if (pendingNode) pendingNode.textContent = String(adminUsers.filter((u) => String(u.requestedRole || '').trim()).length);
    const issuesNode = qs('[data-admin-issues]'); if (issuesNode) issuesNode.textContent = String(adminUsers.filter((u) => adminHasIssue(u)).length);
    const refreshBtn = qs('[data-admin-refresh]');
    if (refreshBtn) refreshBtn.onclick = async () => { await refreshAdminUsers(); renderAll(); showToast('帳號列表已重新整理'); };
    const search = qs('[data-admin-search]');
    if (search) { search.value = adminFilters.query; search.oninput = () => { adminFilters.query = search.value || ''; renderAdminPage(); }; }
    const filter = qs('[data-admin-filter]');
    if (filter) { filter.value = adminFilters.status; filter.onchange = () => { adminFilters.status = filter.value || 'all'; renderAdminPage(); }; }
    if (!listNode || !detailNode) return;
    if (state.session.role !== 'admin') { listNode.innerHTML = ''; detailNode.innerHTML = '<p class="muted">沒有 admin 權限，無法查看帳號資料。</p>'; return; }
    const users = adminUsers.filter(adminMatches);
    listNode.innerHTML = users.length ? users.map((user) => {
      const status = adminDisplayStatus(user);
      const requested = String(user.requestedRole || '').trim();
      return `<button class="list-card admin-user-card ${user.uid === adminSelectedUid ? 'active' : ''}" data-admin-user="${escapeHtml(user.uid)}"><div class="admin-user-head"><strong>${escapeHtml(user.name || user.email || 'Unnamed user')}</strong><span class="pill">${escapeHtml(user.role || 'student')}</span></div><span>${escapeHtml(user.email || user.uid)}</span><p>status: ${escapeHtml(status)}${requested ? ` · request: ${escapeHtml(requested)}` : ''}</p></button>`;
    }).join('') : '<p class="muted">目前沒有符合篩選條件的帳號。</p>';
    qsa('[data-admin-user]', listNode).forEach((btn) => btn.onclick = () => { adminSelectedUid = btn.dataset.adminUser; renderAdminPage(); });
    const selected = adminUsers.find((u) => u.uid === adminSelectedUid) || users[0];
    if (!selected) { detailNode.innerHTML = '<p class="muted">目前沒有帳號資料。</p>'; return; }
    adminSelectedUid = selected.uid;
    const selectedStatus = adminDisplayStatus(selected);
    detailNode.innerHTML = `<div class="admin-detail-meta"><div class="status-card ${adminHasIssue(selected) ? '' : 'ok'}"><strong>${escapeHtml(selected.name || selected.email || selected.uid)}</strong><span>uid: ${escapeHtml(selected.uid)}</span></div><div class="compact-grid"><span class="pill">目前角色：${escapeHtml(selected.role || 'student')}</span><span class="pill">帳號狀態：${escapeHtml(selectedStatus)}</span>${selected.requestedRole ? `<span class="pill">角色申請：${escapeHtml(selected.requestedRole)}</span>` : ''}</div><div class="admin-notes"><p><strong>Email：</strong>${escapeHtml(selected.email || '—')}</p><p><strong>Admin note：</strong>${escapeHtml(selected.adminNote || '—')}</p></div></div><form class="profile-form" data-admin-account-form><label class="field-label">角色</label><select name="role">${['student', 'teacher', 'admin'].map((role) => `<option value="${role}" ${selected.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select><label class="field-label">帳號狀態</label><select name="accountStatus">${['active', 'review', 'suspended'].map((status) => `<option value="${status}" ${selectedStatus === status ? 'selected' : ''}>${status}</option>`).join('')}</select><label class="field-label">Admin note</label><textarea name="adminNote" rows="4">${escapeHtml(selected.adminNote || '')}</textarea><div class="inline-actions"><button class="button button-primary" type="submit">儲存帳號設定</button></div></form>`;
    const form = qs('[data-admin-account-form]', detailNode);
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const result = await window.QuestClassFirebase.adminUpdateUserAccount(selected.uid, {
        role: fd.get('role'),
        accountStatus: fd.get('accountStatus'),
        adminNote: fd.get('adminNote')
      });
      if (!result.ok) return showToast(result.error || '帳號更新失敗');
      await refreshAdminUsers();
      renderAll();
      showToast('帳號設定已更新');
    };
  }
  function wireAuthUi() { qsa('[data-auth-action="google"]').forEach((b) => b.onclick = handleGoogleLogin); qsa('[data-auth-action="logout"]').forEach((b) => b.onclick = handleLogout); }
  function wireProfileUi() { qsa('[data-profile-panel]').forEach((node) => { if (state.session.authMode !== 'firebase' || !state.session.uid) { node.innerHTML = '<div class="panel-header"><div><span class="eyebrow">Profile</span><h3>角色 / 個人檔案</h3></div></div><p class="muted">先登入，才能把 profile / requestedRole 寫入 Firestore。</p>'; return; } node.innerHTML = renderProfilePanel(state.session, firebaseProfile || {}); const form = qs('[data-profile-form]', node); if (!form) return; form.onsubmit = async (e) => { e.preventDefault(); const result = await window.QuestClassFirebase.saveMyProfile(Object.fromEntries(new FormData(form).entries())); if (!result.ok) return showToast(result.error || 'Profile 儲存失敗'); applyFirebaseUser(result.user); firebaseProfile = result.user.profile || firebaseProfile; await refreshAdminUsers(); renderAll(); showToast('Profile 已儲存'); }; }); qsa('[data-admin-panel]').forEach((node) => { node.innerHTML = renderAdminPanel(adminUsers, state.session); const form = qs('[data-admin-role-form]', node); if (!form) return; form.onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(form); const result = await window.QuestClassFirebase.adminUpdateUserAccount(fd.get('uid'), { role: fd.get('role') }); if (!result.ok) return showToast(result.error || '角色更新失敗'); await refreshAdminUsers(); renderAll(); showToast('角色已更新'); }; }); }
  function renderAll() { setShell(); wireSettings(); wireFirebaseStatus(); renderLanding(); renderTeacher(); renderStudent(); renderChatPage(); renderAnalytics(); renderAdminPage(); wireAuthUi(); wireProfileUi(); }
  async function initFirebaseSession() { if (!window.QuestClassFirebase?.init) return; try { const result = await window.QuestClassFirebase.init(); if (result?.user) { applyFirebaseUser(result.user); firebaseProfile = result.user.profile || firebaseProfile; await refreshAdminUsers(); await syncFirestoreData(); } wireFirebaseStatus(); enforcePageGuard(); } catch (e) { console.error(e); wireFirebaseStatus(); } }
  async function boot() { renderAll(); await initFirebaseSession(); renderAll(); }
  window.addEventListener('error', (e) => { if (e?.message) showToast(e.message); });
  boot();
})();
