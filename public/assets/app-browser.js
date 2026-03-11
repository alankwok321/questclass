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
      { key: 'analytics', label: 'Analytics', href: '/analytics' }
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
  const rolePages = { teacher: ['teacher', 'analytics'], student: ['student', 'chat'], admin: ['teacher', 'analytics', 'student', 'chat'] };
  let firebaseProfile = null;
  let adminUsers = [];
  let toastTimer = null;

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
  const currentStudent = (state) => demoData.students.find((s) => s.id === state.currentStudentId) || demoData.students[0];
  const currentClassroom = (state) => demoData.classrooms.find((c) => c.id === state.currentClassroomId) || demoData.classrooms[0];
  const showToast = (text) => { const n = qs('[data-toast]'); if (!n) return; n.textContent = text; n.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), 2500); };
  const state = loadState();

  function renderNav(active) { return demoData.pages.map((p) => `<a class="nav-link ${p.key === active ? 'active' : ''}" href="${p.href}">${p.label}</a>`).join(''); }
  function renderSettingsForm(settings = {}) { return `<label class="field-label">API Base URL</label><input name="apiBaseUrl" type="url" value="${escapeHtml(settings.apiBaseUrl || '')}" placeholder="https://openrouter.ai/api/v1" /><label class="field-label">Model</label><input name="apiModel" type="text" value="${escapeHtml(settings.apiModel || '')}" placeholder="openai/gpt-4.1-mini" /><label class="field-label">API Key</label><input name="apiKey" type="password" value="${escapeHtml(settings.apiKey || '')}" placeholder="sk-..." /><div class="inline-actions"><button class="button button-primary" type="submit">儲存</button><button class="button button-ghost" type="button" data-clear-settings>清除</button></div>`; }
  function renderFirebaseStatus() { const enabled = !!window.QuestClassFirebase?.enabled?.(); return `<div class="status-card ${enabled ? 'ok' : 'muted'}"><strong>${enabled ? 'Firebase ready' : 'Demo mode'}</strong><span>${enabled ? 'Firebase config 已啟用，可接 Google OAuth。' : '尚未提供 Firebase config。'}</span></div>`; }
  function renderAuthPanel(session = {}, firebaseEnabled = false) { const signedIn = session.authMode === 'firebase' && session.uid; if (!firebaseEnabled) return ''; const avatar = session.photoURL ? `<img class="account-avatar" src="${escapeHtml(session.photoURL)}" alt="avatar" />` : '<span class="account-avatar account-avatar-fallback">G</span>'; const role = String(session.role || '').toLowerCase(); const roleMeta = role === 'admin' ? { icon: '🛡️', label: 'admin' } : role === 'teacher' ? { icon: '👩‍🏫', label: 'teacher' } : role === 'student' ? { icon: '🧑‍🎓', label: 'student' } : { icon: '❓', label: role || 'unknown' }; const badge = signedIn ? `<span class="role-badge">${roleMeta.icon} ${escapeHtml(roleMeta.label)}</span>` : ''; const debug = signedIn ? `<span class="auth-debug">${escapeHtml(session.email || '')} · ${escapeHtml(session.uid || '')}</span>` : ''; const label = signedIn ? `${avatar}<span>${escapeHtml(session.userName || session.email || 'Google 帳號')}</span>${badge}` : '使用 Google 登入'; return `<div class="inline-actions auth-actions">${signedIn ? '<button class="button button-ghost" type="button" data-auth-action="logout">Logout</button>' : ''}<button class="button button-primary account-button" type="button" data-auth-action="google">${label}</button>${debug}</div>`; }
  function renderProfilePanel(session = {}, profile = {}) { const effective = profile || {}; return `<div class="panel-header"><div><span class="eyebrow">Profile</span><h3>角色 / 個人檔案</h3></div></div><form class="profile-form" data-profile-form><label class="field-label">顯示名稱</label><input name="name" type="text" value="${escapeHtml(effective.name || session.userName || '')}" placeholder="例如：Alan Teacher" /><label class="field-label">目前角色（Firestore）</label><input type="text" value="${escapeHtml(effective.role || session.role || 'student')}" disabled /><label class="field-label">申請 / 期望角色</label><select name="requestedRole">${['', 'student', 'teacher', 'admin'].map((role) => `<option value="${role}" ${effective.requestedRole === role ? 'selected' : ''}>${role || '不變更'}</option>`).join('')}</select><label class="field-label">學習 / 任務階段</label><input name="learnerStage" type="text" value="${escapeHtml(effective.learnerStage || '')}" placeholder="例如：Grade 5 / teacher dashboard owner" /><label class="field-label">角色備註</label><textarea name="roleNote" rows="4">${escapeHtml(effective.roleNote || '')}</textarea><div class="inline-actions"><button class="button button-primary" type="submit">儲存 profile</button></div></form>`; }
  function renderAdminPanel(users = [], session = {}) { if (session.role !== 'admin') return '<div class="panel-header"><div><span class="eyebrow">Admin</span><h3>角色管理</h3></div></div><p class="muted">此區僅在 Firestore profile.role = admin 時顯示。</p>'; return `<div class="panel-header"><div><span class="eyebrow">Admin</span><h3>角色管理</h3></div></div><form class="admin-role-form" data-admin-role-form><label class="field-label">選擇使用者</label><select name="uid">${users.map((u) => `<option value="${escapeHtml(u.uid)}">${escapeHtml(u.name || u.email || u.uid)} · ${escapeHtml(u.role || 'student')}</option>`).join('')}</select><label class="field-label">新角色</label><select name="role">${['student', 'teacher', 'admin'].map((r) => `<option value="${r}">${r}</option>`).join('')}</select><div class="inline-actions"><button class="button button-primary" type="submit">更新角色</button></div></form>`; }
  async function sendChat(message, studentName) { const s = getSettings(); const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, topic: 'fractions', mode: 'socratic', studentName, apiBaseUrl: s.apiBaseUrl || '', model: s.apiModel || '', apiKey: s.apiKey || '' }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Chat request failed'); return data; }
  async function runLessonLoop(student, classroom) { const s = getSettings(); const res = await fetch('/api/teacher/lesson-loop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'fractions', weakness: student.weaknessLabel, studentName: student.name, grade: classroom.grade, apiBaseUrl: s.apiBaseUrl || '', model: s.apiModel || '', apiKey: s.apiKey || '' }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Lesson loop request failed'); return data; }

  function setShell() { qsa('[data-nav]').forEach((n) => n.innerHTML = renderNav(page)); qsa('[data-brand]').forEach((n) => n.textContent = `${demoData.brand.name} ${demoData.brand.version}`); qsa('[data-promise]').forEach((n) => n.textContent = demoData.brand.promise); qsa('[data-topbar-auth]').forEach((n) => n.innerHTML = renderAuthPanel(state.session, !!window.QuestClassFirebase?.enabled?.())); }
  function wireSettings() { qsa('[data-settings-form]').forEach((form) => { form.innerHTML = renderSettingsForm(getSettings()); form.onsubmit = (e) => { e.preventDefault(); saveSettings(Object.fromEntries(new FormData(form).entries())); showToast('AI 設定已儲存'); }; const clearBtn = qs('[data-clear-settings]', form); if (clearBtn) clearBtn.onclick = () => { clearSettings(); wireSettings(); showToast('AI 設定已清除'); }; }); }
  function wireFirebaseStatus() { qsa('[data-firebase-status]').forEach((node) => node.innerHTML = renderFirebaseStatus()); }
  function applyFirebaseUser(user) { state.session.authMode = 'firebase'; state.session.role = user.role || state.session.role; state.session.userName = user.name || state.session.userName; state.session.email = user.email || state.session.email; state.session.uid = user.uid || state.session.uid; state.session.photoURL = user.photoURL || state.session.photoURL || ''; saveState(state); }
  function clearFirebaseSession() { state.session.authMode = 'demo'; state.session.role = 'teacher'; state.session.userName = 'Alan Teacher'; state.session.email = 'teacher@questclass.app'; state.session.uid = null; state.session.photoURL = ''; saveState(state); }
  function enforcePageGuard() { if (state.session.authMode !== 'firebase' || !state.session.uid) return; const allowed = rolePages[state.session.role] || []; if (page !== 'landing' && !allowed.includes(page)) window.location.replace(state.session.role === 'teacher' ? '/teacher' : (state.session.role === 'admin' ? '/teacher' : '/student')); }
  async function refreshAdminUsers() { if (state.session.role !== 'admin' || !window.QuestClassFirebase?.listUsers) { adminUsers = []; return; } const result = await window.QuestClassFirebase.listUsers(); adminUsers = result?.ok ? (result.users || []) : []; }
  async function handleGoogleLogin() { try { if (!window.QuestClassFirebase?.signInWithGoogle) return showToast('Firebase 尚未啟用'); const result = await window.QuestClassFirebase.signInWithGoogle(); if (!result.ok) return showToast(result.error || 'Google 登入失敗'); applyFirebaseUser(result.user); firebaseProfile = result.user.profile || firebaseProfile; await refreshAdminUsers(); renderAll(); enforcePageGuard(); showToast('已登入 Google'); } catch (e) { showToast(e?.message || 'Google 登入失敗'); } }
  async function handleLogout() { try { if (window.QuestClassFirebase?.signOut) await window.QuestClassFirebase.signOut(); clearFirebaseSession(); firebaseProfile = null; adminUsers = []; renderAll(); showToast('已登出'); } catch (e) { showToast(e?.message || '登出失敗'); } }

  function renderLanding() { const roadmap = qs('[data-roadmap]'); const spotlight = qs('[data-spotlight]'); if (roadmap) roadmap.innerHTML = demoData.roadmap.map((i) => `<li>${escapeHtml(i)}</li>`).join(''); if (spotlight) spotlight.innerHTML = demoData.pages.filter((i) => i.key !== 'landing').map((i) => `<a class="surface-link" href="${i.href}"><strong>${i.label}</strong><span>進入 ${i.label} 頁面</span></a>`).join(''); }
  function renderTeacher() { const student = currentStudent(state); const classroom = currentClassroom(state); const hero = qs('[data-teacher-hero]'); if (hero) hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Teacher OS</span><h1>${escapeHtml(classroom.name)}</h1><p>目前焦點學生：${escapeHtml(student.name)} · 弱點：${escapeHtml(student.weaknessLabel)}</p></div><div class="hero-stats"><div><strong>${classroom.activeStudents}</strong><span>活躍學生</span></div><div><strong>${classroom.completionRate}%</strong><span>完成率</span></div></div>`; const metrics = qs('[data-teacher-metrics]'); if (metrics) metrics.innerHTML = demoData.teacherMetrics.map((m) => `<article class="metric-card"><span>${m.label}</span><strong>${m.value}</strong></article>`).join(''); const students = qs('[data-student-cards]'); if (students) { students.innerHTML = demoData.students.map((i) => `<button class="list-card ${i.id === state.currentStudentId ? 'active' : ''}" data-student-id="${i.id}"><strong>${i.name}</strong><span>${i.status}</span><p>${i.weaknessLabel}</p></button>`).join(''); qsa('[data-student-id]', students).forEach((b) => b.onclick = () => { state.currentStudentId = b.dataset.studentId; saveState(state); renderTeacher(); }); } const cls = qs('[data-classroom-list]'); if (cls) { cls.innerHTML = demoData.classrooms.map((i) => `<button class="list-card ${i.id === state.currentClassroomId ? 'active' : ''}" data-classroom-id="${i.id}"><strong>${i.name}</strong><span>${i.grade} · ${i.subject}</span></button>`).join(''); qsa('[data-classroom-id]', cls).forEach((b) => b.onclick = () => { state.currentClassroomId = b.dataset.classroomId; saveState(state); renderTeacher(); }); } const summary = qs('[data-teacher-summary]'); if (summary) summary.innerHTML = state.teacherSummary.map((i) => `<li>${escapeHtml(i)}</li>`).join(''); const assignment = qs('[data-assignment]'); if (assignment) assignment.innerHTML = state.assignment.map((i) => `<li>${escapeHtml(i)}</li>`).join(''); const insight = qs('[data-insight]'); if (insight) insight.textContent = state.insight; const mode = qs('[data-loop-mode]'); if (mode) mode.textContent = state.modes.loop; const output = qs('[data-loop-output]'); if (output) output.innerHTML = (state.loopSteps.length ? state.loopSteps : ['按下「產生 lesson loop」取得新一輪教學流程。']).map((i) => `<div class="timeline-item">${escapeHtml(i)}</div>`).join(''); const runBtn = qs('[data-run-loop]'); if (runBtn) runBtn.onclick = async () => { try { const data = await runLessonLoop(currentStudent(state), currentClassroom(state)); state.assignment = data.assignment || state.assignment; state.insight = data.insight || state.insight; state.teacherSummary = data.teacherSummary || state.teacherSummary; state.loopSteps = data.steps || []; state.modes.loop = data.mode === 'live' ? 'Live AI' : 'Demo mode'; saveState(state); renderTeacher(); showToast('教學流程已更新'); } catch (e) { showToast(e?.message || '教學流程更新失敗'); } }; }
  function renderStudent() { const student = currentStudent(state); const hero = qs('[data-student-hero]'); if (hero) hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Student Home</span><h1>${escapeHtml(student.name)}</h1><p>目前弱點：${escapeHtml(student.weaknessLabel)} · 連續學習 ${student.streak} 天</p></div><div class="hero-stats"><div><strong>Lv.${student.level}</strong><span>目前等級</span></div><div><strong>${student.mastery}%</strong><span>技能掌握</span></div></div>`; const progress = qs('[data-student-progress]'); if (progress) progress.innerHTML = `<article class="metric-card"><span>XP</span><strong>${student.xp}</strong></article><article class="metric-card"><span>下一級目標</span><strong>${student.nextLevelXp}</strong></article><article class="metric-card"><span>弱點分數</span><strong>${student.weaknessScore}</strong></article>`; const quests = qs('[data-quests]'); if (quests) quests.innerHTML = demoData.dailyQuests.map((q) => `<article class="list-card"><strong>${q.title}</strong><span>${q.meta}</span></article>`).join(''); const roster = qs('[data-student-roster]'); if (roster) { roster.innerHTML = demoData.students.map((i) => `<button class="list-card ${i.id === state.currentStudentId ? 'active' : ''}" data-roster-student="${i.id}"><strong>${i.name}</strong><span>Level ${i.level}</span></button>`).join(''); qsa('[data-roster-student]', roster).forEach((b) => b.onclick = () => { state.currentStudentId = b.dataset.rosterStudent; saveState(state); renderStudent(); }); } }
  function renderChatPage() { const messages = qs('[data-chat-messages]'); if (messages) messages.innerHTML = state.chat.map((m) => `<div class="chat-bubble ${m.role}">${escapeHtml(m.text)}</div>`).join(''); const status = qs('[data-chat-mode]'); if (status) status.textContent = state.modes.chat; const form = qs('[data-chat-form]'); if (form) form.onsubmit = async (e) => { e.preventDefault(); const input = qs('[name="message"]', form); const msg = input?.value.trim(); if (!msg) return; state.chat.push({ role: 'user', text: msg }); saveState(state); renderChatPage(); input.value = ''; try { const data = await sendChat(msg, currentStudent(state).name); state.chat.push({ role: 'ai', text: data.reply || '目前沒有回應。' }); state.modes.chat = data.mode === 'live' ? 'Live AI' : 'Demo mode'; saveState(state); renderChatPage(); } catch (e2) { state.chat.push({ role: 'ai', text: '目前連線失敗，我先用 demo 模式陪你拆題。先說說你最卡的那一步。' }); state.modes.chat = 'Demo fallback'; saveState(state); renderChatPage(); showToast(e2?.message || 'Chat 失敗'); } }; qsa('[data-seed-prompt]').forEach((b) => b.onclick = () => { const i = qs('[name="message"]'); if (i) i.value = b.dataset.seedPrompt || ''; }); }
  function renderAnalytics() { const units = qs('[data-units]'); if (units) units.innerHTML = demoData.units.map((u) => `<article class="list-card"><strong>${u.name}</strong><span>${u.tag}</span><p>${u.progress}</p></article>`).join(''); const bank = qs('[data-question-bank]'); if (bank) bank.innerHTML = demoData.questionBank.map((i) => `<article class="list-card"><strong>${i.type}</strong><p>${i.title}</p></article>`).join(''); const map = qs('[data-knowledge-map]'); if (map) map.innerHTML = demoData.knowledgeMap.map((i) => `<article class="map-card ${i.status}"><strong>${i.title}</strong><span>${i.meta}</span></article>`).join(''); const skills = qs('[data-skills]'); if (skills) skills.innerHTML = demoData.skills.map((i) => `<div class="skill-row"><span>${i.label}</span><div class="skill-bar"><div style="width:${i.score}%"></div></div><strong>${i.score}%</strong></div>`).join(''); const heatmap = qs('[data-heatmap]'); if (heatmap) heatmap.innerHTML = demoData.heatmap.map((i) => `<div class="heat-cell ${i.level}">${i.label}</div>`).join(''); const links = qs('[data-mistake-links]'); if (links) links.innerHTML = demoData.mistakeLinks.map((i) => `<article class="list-card"><strong>${i.title}</strong><p>${i.text}</p></article>`).join(''); }
  function wireAuthUi() { qsa('[data-auth-action="google"]').forEach((b) => b.onclick = handleGoogleLogin); qsa('[data-auth-action="logout"]').forEach((b) => b.onclick = handleLogout); }
  function wireProfileUi() { qsa('[data-profile-panel]').forEach((node) => { if (state.session.authMode !== 'firebase' || !state.session.uid) { node.innerHTML = '<div class="panel-header"><div><span class="eyebrow">Profile</span><h3>角色 / 個人檔案</h3></div></div><p class="muted">先登入，才能把 profile / requestedRole 寫入 Firestore。</p>'; return; } node.innerHTML = renderProfilePanel(state.session, firebaseProfile || {}); const form = qs('[data-profile-form]', node); if (!form) return; form.onsubmit = async (e) => { e.preventDefault(); const result = await window.QuestClassFirebase.saveMyProfile(Object.fromEntries(new FormData(form).entries())); if (!result.ok) return showToast(result.error || 'Profile 儲存失敗'); applyFirebaseUser(result.user); firebaseProfile = result.user.profile || firebaseProfile; await refreshAdminUsers(); renderAll(); showToast('Profile 已儲存'); }; }); qsa('[data-admin-panel]').forEach((node) => { node.innerHTML = renderAdminPanel(adminUsers, state.session); const form = qs('[data-admin-role-form]', node); if (!form) return; form.onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(form); const result = await window.QuestClassFirebase.adminUpdateUserRole(fd.get('uid'), fd.get('role')); if (!result.ok) return showToast(result.error || '角色更新失敗'); await refreshAdminUsers(); renderAll(); showToast('角色已更新'); }; }); }
  function renderAll() { setShell(); wireSettings(); wireFirebaseStatus(); renderLanding(); renderTeacher(); renderStudent(); renderChatPage(); renderAnalytics(); wireAuthUi(); wireProfileUi(); }
  async function initFirebaseSession() { if (!window.QuestClassFirebase?.init) return; try { const result = await window.QuestClassFirebase.init(); if (result?.user) { applyFirebaseUser(result.user); firebaseProfile = result.user.profile || firebaseProfile; await refreshAdminUsers(); } wireFirebaseStatus(); enforcePageGuard(); } catch (e) { console.error(e); wireFirebaseStatus(); } }
  async function boot() { renderAll(); await initFirebaseSession(); renderAll(); }
  window.addEventListener('error', (e) => { if (e?.message) showToast(e.message); });
  boot();
})();
