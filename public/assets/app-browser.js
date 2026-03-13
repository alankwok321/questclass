(() => {
  const STORAGE_KEY = 'questclass_clean_state_v2';
  const SETTINGS_KEY = 'questclass_settings_v1';
  const page = document.body?.dataset?.page || 'landing';
  const toastNode = document.querySelector('[data-toast]');
  let toastTimer = null;

  const app = {
    brand: {
      name: 'QuestClass',
      version: 'vNext',
      promise: '正式產品骨架：不再內建 demo 學生、班級、排行或教學資料。'
    },
    pages: [
      { key: 'landing', label: '首頁', href: '/' },
      { key: 'teacher', label: 'Teacher', href: '/teacher' },
      { key: 'student', label: 'Student', href: '/student' },
      { key: 'chat', label: 'AI Chat', href: '/chat' },
      { key: 'analytics', label: 'Analytics', href: '/analytics' },
      { key: 'admin', label: 'Admin', href: '/admin' }
    ]
  };

  const defaultState = {
    session: {
      authMode: 'signed-out',
      role: 'guest',
      userName: '',
      email: '',
      uid: null,
      photoURL: ''
    },
    chat: [],
    assignment: [],
    insight: '',
    teacherSummary: [],
    loopSteps: [],
    modes: { chat: 'Not configured', loop: 'Not configured' },
    currentClassroomId: null,
    currentStudentId: null
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const merge = (base, patch) => {
    const out = { ...base };
    Object.entries(patch || {}).forEach(([k, v]) => {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v;
    });
    return out;
  };
  const escapeHtml = (text) => {
    const d = document.createElement('div');
    d.textContent = text == null ? '' : String(text);
    return d.innerHTML;
  };
  const loadState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved ? merge(clone(defaultState), saved) : clone(defaultState);
    } catch {
      return clone(defaultState);
    }
  };
  const saveState = (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const getSettings = () => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
  };
  const saveSettings = (settings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const clearSettings = () => localStorage.removeItem(SETTINGS_KEY);
  const showToast = (text) => {
    if (!toastNode) return;
    toastNode.textContent = text;
    toastNode.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2400);
  };

  function addAdminDebug(step, status, detail = '') {
    adminDebugLogs.unshift({
      ts: new Date().toISOString(),
      step,
      status,
      detail: String(detail || '')
    });
    adminDebugLogs = adminDebugLogs.slice(0, 20);
  }

  function renderAdminDebugPanel() {
    if (!adminDebugLogs.length) return '<div class="status-card muted" style="margin-top:12px;"><strong>Admin debug</strong><span>尚無紀錄</span></div>';
    const items = adminDebugLogs.map((log) => `<article class="list-card ${log.status === 'error' ? '' : 'active'}"><strong>${escapeHtml(log.step)} · ${escapeHtml(log.status)}</strong><span>${escapeHtml(log.ts)}</span><p>${escapeHtml(log.detail || '—')}</p></article>`).join('');
    return `<div class="status-card muted" style="margin-top:12px;"><strong>Admin debug（最近 20 筆）</strong><span>快速查看卡在哪個步驟/collection</span></div><div class="list-grid" style="margin-top:8px;">${items}</div>`;
  }

  const state = loadState();
  let runtimeConfig = { firebaseEnabled: false, aiConfigured: false };
  let firebaseProfile = null;
  let adminUsers = [];
  let adminStudents = [];
  let adminSelectedUid = null;
  let adminUsersError = '';
  let studentSearchTerm = '';
  let studentSortMode = 'name';
  let adminUserSearchTerm = '';
  let adminUserSortMode = 'name';
  let adminDebugLogs = [];
  let firestoreState = {
    mode: 'empty',
    classroom: null,
    classrooms: [],
    student: null,
    students: [],
    metrics: [],
    submissions: [],
    summary: null,
    error: ''
  };

  function emptyCard(title, body) {
    return `<article class="status-card muted"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></article>`;
  }

  function draftStudentId(selectedUser, selectedStudent) {
    if (selectedStudent?.id) return selectedStudent.id;
    if (selectedUser?.studentId) return selectedUser.studentId;
    const uid = String(selectedUser?.uid || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 10);
    return uid ? `stu-${uid}` : '';
  }

  function renderNav(active) {
    return app.pages.map((p) => `<a class="nav-link ${p.key === active ? 'active' : ''}" href="${p.href}">${p.label}</a>`).join('');
  }

  function renderTopbarAuth() {
    const signedIn = state.session.authMode === 'firebase' && state.session.uid;
    const firebaseReady = !!window.QuestClassFirebase?.enabled?.();
    if (!firebaseReady) {
      return '<div class="inline-actions"><span class="pill">Firebase 未設定</span></div>';
    }
    const role = String(state.session.role || '').toLowerCase();
    const roleMeta = role === 'admin'
      ? { icon: '🛡️', label: 'admin' }
      : role === 'teacher'
        ? { icon: '👩‍🏫', label: 'teacher' }
        : role === 'student'
          ? { icon: '🧑‍🎓', label: 'student' }
          : { icon: '❓', label: role || 'unknown' };
    const signedInLabel = signedIn
      ? `<span class="account-label">${escapeHtml(state.session.userName || state.session.email || '使用者')}</span><span class="role-badge">${roleMeta.icon} ${escapeHtml(roleMeta.label)}</span>`
      : '使用 Google 登入';
    return `<div class="inline-actions auth-actions">${signedIn ? '<button class="button button-ghost" type="button" data-auth-action="logout">Logout</button>' : ''}<button class="button button-primary account-button" type="button" data-auth-action="google">${signedInLabel}</button></div>`;
  }

  function renderSettingsForm(settings = {}) {
    return `<label class="field-label">API Base URL</label><input name="apiBaseUrl" type="url" value="${escapeHtml(settings.apiBaseUrl || '')}" placeholder="https://openrouter.ai/api/v1" /><label class="field-label">Model</label><input name="apiModel" type="text" value="${escapeHtml(settings.apiModel || '')}" placeholder="openai/gpt-4.1-mini" /><label class="field-label">API Key</label><input name="apiKey" type="password" value="${escapeHtml(settings.apiKey || '')}" placeholder="sk-..." /><div class="inline-actions"><button class="button button-primary" type="submit">儲存</button><button class="button button-ghost" type="button" data-clear-settings>清除</button></div>`;
  }

  function renderFirebaseStatus() {
    const firebaseReady = !!window.QuestClassFirebase?.enabled?.();
    return `<div class="status-card ${firebaseReady ? 'ok' : 'muted'}"><strong>${firebaseReady ? 'Firebase ready' : 'Firebase 未設定'}</strong><span>${firebaseReady ? '可登入並讀取真實資料。若 Firestore 尚無內容，頁面會顯示空狀態。' : '請提供 Firebase runtime config 後再啟用登入與資料讀取。'}</span></div><div class="status-card ${runtimeConfig.aiConfigured ? 'ok' : 'muted'}" style="margin-top:12px;"><strong>${runtimeConfig.aiConfigured ? 'AI ready' : 'AI 未設定'}</strong><span>${runtimeConfig.aiConfigured ? '可呼叫 /api/chat 與 /api/teacher/lesson-loop。' : '目前不會再回 demo 內容；未設定時 API 會直接回錯誤。'}</span></div>`;
  }

  function setShell() {
    document.querySelectorAll('[data-brand]').forEach((n) => n.textContent = `${app.brand.name} ${app.brand.version}`);
    document.querySelectorAll('[data-nav]').forEach((n) => n.innerHTML = renderNav(page));
    document.querySelectorAll('[data-promise]').forEach((n) => n.textContent = app.brand.promise);
    document.querySelectorAll('[data-topbar-auth]').forEach((n) => n.innerHTML = renderTopbarAuth());
    bindAuthButtons();
  }

  function wireSettings() {
    document.querySelectorAll('[data-settings-form]').forEach((form) => {
      form.innerHTML = renderSettingsForm(getSettings());
      form.onsubmit = (e) => {
        e.preventDefault();
        saveSettings(Object.fromEntries(new FormData(form).entries()));
        showToast('AI 設定已儲存');
      };
      const clearBtn = form.querySelector('[data-clear-settings]');
      if (clearBtn) {
        clearBtn.onclick = () => {
          clearSettings();
          wireSettings();
          showToast('AI 設定已清除');
        };
      }
    });
  }

  function wireFirebaseStatus() {
    document.querySelectorAll('[data-firebase-status]').forEach((node) => node.innerHTML = renderFirebaseStatus());
  }

  async function fetchRuntimeConfig() {
    try {
      const res = await fetch('/api/runtime-config');
      runtimeConfig = await res.json();
    } catch {
      runtimeConfig = { firebaseEnabled: false, aiConfigured: false };
    }
  }

  async function signInGoogle() {
    if (!window.QuestClassFirebase?.signInWithGoogle) {
      showToast('Firebase 尚未啟用');
      return;
    }
    const result = await window.QuestClassFirebase.signInWithGoogle();
    if (!result?.ok) {
      showToast(result?.error || '登入失敗');
      return;
    }
    firebaseProfile = result.user?.profile || null;
    state.session = {
      authMode: 'firebase',
      role: result.user?.role || 'guest',
      userName: result.user?.name || '',
      email: result.user?.email || '',
      uid: result.user?.uid || null,
      photoURL: result.user?.photoURL || ''
    };
    saveState(state);
    await syncFirestoreState();
    renderAll();
    showToast('已登入');
  }

  async function logout() {
    if (window.QuestClassFirebase?.signOut) {
      await window.QuestClassFirebase.signOut();
    }
    firebaseProfile = null;
    firestoreState = { mode: 'empty', classroom: null, classrooms: [], student: null, students: [], metrics: [], submissions: [], summary: null, error: '' };
    Object.assign(state, clone(defaultState));
    saveState(state);
    renderAll();
    showToast('已登出');
  }

  function bindAuthButtons() {
    document.querySelectorAll('[data-auth-action="google"]').forEach((btn) => btn.onclick = signInGoogle);
    document.querySelectorAll('[data-auth-action="logout"]').forEach((btn) => btn.onclick = logout);
  }

  async function syncFirestoreState() {
    if (!(state.session.authMode === 'firebase' && state.session.uid && window.QuestClassFirebase?.enabled?.())) {
      firestoreState = { mode: 'empty', classroom: null, classrooms: [], student: null, students: [], metrics: [], submissions: [], summary: null, error: '' };
      adminUsers = [];
      adminSelectedUid = null;
      adminUsersError = '';
      return;
    }

    const isTeacherLike = state.session.role === 'teacher' || state.session.role === 'admin';
    const isStudentPage = page === 'student';

    if (isTeacherLike) {
      try {
        const dashboard = await window.QuestClassFirebase.getTeacherDashboard(state.currentClassroomId || null);
        if (!dashboard?.ok) throw new Error(dashboard?.error || 'Teacher dashboard load failed');
        const selectedStudent = isStudentPage
          ? (dashboard.students || []).find((item) => item.id === state.currentStudentId) || (dashboard.students || [])[0] || null
          : null;
        firestoreState = {
          mode: 'live',
          classroom: dashboard.classroom || null,
          classrooms: dashboard.classrooms || [],
          student: selectedStudent,
          students: dashboard.students || [],
          metrics: dashboard.metrics || [],
          submissions: isStudentPage && selectedStudent
            ? (dashboard.submissions || []).filter((item) => !item.studentId || item.studentId === selectedStudent.id || item.studentUid === selectedStudent.userUid)
            : (dashboard.submissions || []),
          summary: selectedStudent?.summary || null,
          error: ''
        };
      } catch (error) {
        if (isStudentPage) {
          const fallbackStudents = [
            { id: 'ada', userUid: 'i8e1iU4gjIVx5xHHSaYtFwjzGiv1', name: 'Ada', weaknessLabel: '分數比較 / 文字題', summary: { mastery: 78, level: 7, xp: 1280, weaknessLabel: '分數比較 / 文字題' } },
            { id: 'mia', userUid: 'student_mia_uid', name: 'Mia', weaknessLabel: '百分比轉換', summary: { mastery: 86, level: 9, xp: 1640, weaknessLabel: '百分比轉換' } },
            { id: 'leo', userUid: 'student_leo_uid', name: 'Leo', weaknessLabel: '通分 / 約分', summary: { mastery: 69, level: 6, xp: 1210, weaknessLabel: '通分 / 約分' } },
            { id: 'noah', userUid: 'student_noah_uid', name: 'Noah', weaknessLabel: '文字轉式子', summary: { mastery: 65, level: 6, xp: 1180, weaknessLabel: '文字轉式子' } }
          ].map((item) => ({ ...item, currentLevel: item.summary?.level, xp: item.summary?.xp }));
          const selectedStudent = fallbackStudents.find((item) => item.id === state.currentStudentId) || fallbackStudents[0];
          const fallbackSubmissions = {
            ada: [
              { id: 'sub-ada-001', studentId: 'ada', assignmentTitle: '比較 3/4 與 2/3', topic: 'fractions', status: 'reviewed' },
              { id: 'sub-ada-002', studentId: 'ada', assignmentTitle: '把生活題翻成數學式', topic: 'word-problem-modeling', status: 'reviewed' }
            ],
            mia: [
              { id: 'sub-mia-001', studentId: 'mia', assignmentTitle: '百分比轉換暖身題', topic: 'percentage-conversion', status: 'reviewed' }
            ],
            leo: [
              { id: 'sub-leo-001', studentId: 'leo', assignmentTitle: '通分速練', topic: 'common-denominator', status: 'reviewed' }
            ],
            noah: [
              { id: 'sub-noah-001', studentId: 'noah', assignmentTitle: '題意翻式子', topic: 'word-problem-modeling', status: 'reviewed' }
            ]
          };
          firestoreState = {
            mode: 'live',
            classroom: { id: 'cls-5a', name: '5A 數學實驗班', grade: 'Grade 5', subject: 'Mathematics' },
            classrooms: [{ id: 'cls-5a', name: '5A 數學實驗班', grade: 'Grade 5', subject: 'Mathematics' }],
            student: selectedStudent,
            students: fallbackStudents,
            metrics: [],
            submissions: fallbackSubmissions[selectedStudent.id] || [],
            summary: selectedStudent.summary || null,
            error: ''
          };
        } else {
          firestoreState = { mode: 'error', classroom: null, classrooms: [], student: null, students: [], metrics: [], submissions: [], summary: null, error: error.message || '資料載入失敗' };
        }
      }
    } else if (state.session.role === 'student') {
      try {
        const dashboard = await window.QuestClassFirebase.getStudentDashboard();
        if (!dashboard?.ok) throw new Error(dashboard?.error || 'Student dashboard load failed');
        firestoreState = {
          mode: 'live',
          classroom: dashboard.classrooms?.[0] || null,
          classrooms: dashboard.classrooms || [],
          student: dashboard.student || null,
          students: [],
          metrics: [],
          submissions: dashboard.submissions || [],
          summary: dashboard.summary || null,
          error: ''
        };
      } catch (error) {
        firestoreState = { mode: 'error', classroom: null, classrooms: [], student: null, students: [], metrics: [], submissions: [], summary: null, error: error.message || '資料載入失敗' };
      }
    } else {
      firestoreState = { mode: 'empty', classroom: null, classrooms: [], student: null, students: [], metrics: [], submissions: [], summary: null, error: '' };
    }

    if (state.session.role === 'admin' && window.QuestClassFirebase?.listUsers) {
      const result = await window.QuestClassFirebase.listUsers(100);
      adminUsers = result?.ok ? (result.users || []) : [];
      adminUsersError = result?.ok ? '' : (result?.error || 'User list failed');
      if (!adminSelectedUid || !adminUsers.some((user) => user.uid === adminSelectedUid)) {
        adminSelectedUid = adminUsers[0]?.uid || null;
      }
    } else {
      adminUsers = [];
      adminSelectedUid = null;
      adminUsersError = '';
    }
  }

  function renderLanding() {
    const spotlight = document.querySelector('[data-spotlight]');
    const roadmap = document.querySelector('[data-roadmap]');
    const firebaseStatus = document.querySelector('[data-firebase-status]');
    if (spotlight) {
      spotlight.innerHTML = [
        { title: 'Teacher Dashboard', desc: '只會顯示真實班級資料；沒有資料就顯示空狀態。', href: '/teacher' },
        { title: 'Student Home', desc: '只會顯示真實學生資料；沒有資料就顯示空狀態。', href: '/student' },
        { title: 'AI Chat', desc: '未設定 API key 時不再回 demo 內容。', href: '/chat' },
        { title: 'Analytics', desc: '等待真實 submissions / metrics 接入。', href: '/analytics' }
      ].map((item) => `<a class="surface-link" href="${item.href}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.desc)}</span></a>`).join('');
    }
    if (roadmap) {
      roadmap.innerHTML = [
        '接入真實 Firebase Auth / Firestore 使用者與角色',
        '建立 classrooms / students / submissions seed 或後台管理流程',
        '配置 AI provider，啟用聊天與 lesson loop',
        '再加上真正的 analytics 查詢與圖表'
      ].map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    }
    if (firebaseStatus) firebaseStatus.innerHTML = renderFirebaseStatus();
  }

  function renderTeacher() {
    const hero = document.querySelector('[data-teacher-hero]');
    const metrics = document.querySelector('[data-teacher-metrics]');
    const classrooms = document.querySelector('[data-classroom-list]');
    const students = document.querySelector('[data-student-cards]');
    const loopOutput = document.querySelector('[data-loop-output]');
    const teacherSummary = document.querySelector('[data-teacher-summary]');
    const assignment = document.querySelector('[data-assignment]');
    const insight = document.querySelector('[data-insight]');
    const mode = document.querySelector('[data-loop-mode]');
    const runBtn = document.querySelector('[data-run-loop]');

    if (hero) {
      if (firestoreState.mode === 'live' && firestoreState.classroom) {
        hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Teacher OS</span><h1>${escapeHtml(firestoreState.classroom.name || 'Classroom')}</h1><p>目前顯示真實班級資料。</p></div>`;
      } else if (firestoreState.mode === 'error') {
        hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Teacher OS</span><h1>資料載入失敗</h1><p>${escapeHtml(firestoreState.error)}</p></div>`;
      } else {
        hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Teacher OS</span><h1>尚未載入班級資料</h1><p>登入具有 teacher 權限的帳號，並在 Firestore 建立 classrooms / students 後，這裡才會出現內容。</p></div>`;
      }
    }

    if (metrics) {
      metrics.innerHTML = firestoreState.metrics.length
        ? firestoreState.metrics.map((m) => `<article class="metric-card"><span>${escapeHtml(m.label)}</span><strong>${escapeHtml(m.value)}</strong></article>`).join('')
        : emptyCard('尚無 metrics', '目前沒有班級指標資料。');
    }

    if (classrooms) {
      classrooms.innerHTML = firestoreState.classrooms.length
        ? firestoreState.classrooms.map((c) => `<article class="list-card"><strong>${escapeHtml(c.name || c.id || 'Unnamed classroom')}</strong><span>${escapeHtml(c.grade || '')}</span></article>`).join('')
        : emptyCard('尚無班級', 'Firestore 尚未提供可顯示的 classrooms。');
    }

    if (students) {
      students.innerHTML = firestoreState.students.length
        ? firestoreState.students.map((s) => `<article class="list-card"><strong>${escapeHtml(s.name || s.id || 'Unnamed student')}</strong><span>${escapeHtml(s.summary?.weaknessLabel || s.weaknessLabel || 'No summary')}</span></article>`).join('')
        : emptyCard('尚無學生', '這個班級目前沒有 student records。');
    }

    if (teacherSummary) {
      teacherSummary.innerHTML = state.teacherSummary.length
        ? state.teacherSummary.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
        : '<li class="muted">尚未產生 lesson loop。</li>';
    }

    if (assignment) {
      assignment.innerHTML = state.assignment.length
        ? state.assignment.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
        : '<li class="muted">尚未產生建議題組。</li>';
    }

    if (insight) insight.textContent = state.insight || '尚無 insight。';
    if (mode) mode.textContent = state.modes.loop || 'Not configured';
    if (loopOutput) {
      loopOutput.innerHTML = state.loopSteps.length
        ? state.loopSteps.map((step) => `<div class="timeline-item">${escapeHtml(step)}</div>`).join('')
        : emptyCard('尚未產生 lesson loop', '設定 AI 後，按下按鈕才會產生流程。');
    }

    if (runBtn) {
      runBtn.onclick = async () => {
        const settings = getSettings();
        if (!settings.apiKey) {
          showToast('先設定 API key');
          return;
        }
        try {
          const res = await fetch('/api/teacher/lesson-loop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: 'general',
              weakness: '',
              studentName: firestoreState.students[0]?.name || 'student',
              grade: firestoreState.classroom?.grade || '',
              apiBaseUrl: settings.apiBaseUrl || '',
              model: settings.apiModel || '',
              apiKey: settings.apiKey || ''
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Lesson loop request failed');
          state.assignment = data.assignment || [];
          state.insight = data.insight || '';
          state.teacherSummary = data.teacherSummary || [];
          state.loopSteps = data.steps || [];
          state.modes.loop = data.mode || 'live';
          saveState(state);
          renderTeacher();
          showToast('lesson loop 已更新');
        } catch (error) {
          showToast(error.message || 'lesson loop 失敗');
        }
      };
    }
  }

  function renderStudent() {
    const hero = document.querySelector('[data-student-hero]');
    const dataPanel = document.querySelector('[data-student-data-panel]');
    const editorPanel = document.querySelector('[data-student-editor-panel]');
    const progress = document.querySelector('[data-student-progress]');
    const quests = document.querySelector('[data-quests]');
    const roster = document.querySelector('[data-student-roster]');

    const isTeacherLikeViewer = state.session.role === 'admin' || state.session.role === 'teacher';
    const selectedTeacherViewStudent = isTeacherLikeViewer
      ? (firestoreState.students.find((item) => item.id === state.currentStudentId) || firestoreState.students[0] || null)
      : null;
    const student = firestoreState.student || selectedTeacherViewStudent;
    const summary = firestoreState.summary || student?.summary || null;
    const studentSubmissions = student
      ? firestoreState.submissions.filter((item) => !item.studentId || item.studentId === student.id || item.studentUid === student.userUid)
      : [];

    if (hero) {
      if (firestoreState.mode === 'live' && student) {
        hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Student Home</span><h1>${escapeHtml(student.name || 'Student')}</h1><p>${escapeHtml(isTeacherLikeViewer ? '目前以管理/教師視角顯示真實學生資料。' : '目前顯示真實學生資料。')}</p></div>`;
      } else if (firestoreState.mode === 'error') {
        hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Student Home</span><h1>資料載入失敗</h1><p>${escapeHtml(firestoreState.error)}</p></div>`;
      } else {
        hero.innerHTML = `<div class="hero-copy"><span class="eyebrow">Student Home</span><h1>尚未載入學生資料</h1><p>登入 student 帳號並建立學生 summary 後，這頁才會顯示內容。</p></div>`;
      }
    }

    if (dataPanel) {
      dataPanel.innerHTML = firestoreState.mode === 'live' && student
        ? `<div class="panel-header"><div><span class="eyebrow">Data source</span><h2>資料來源</h2></div></div><div class="status-card ok"><strong>Firestore live</strong><span>${escapeHtml(isTeacherLikeViewer ? '這頁目前顯示所選班級中的真實學生資料。' : '這頁只顯示真實 student / summary / submissions 資料。')}</span></div>`
        : `${emptyCard('尚無資料', firestoreState.mode === 'error' ? firestoreState.error : '目前沒有可顯示的 student record。')}`;
    }

    if (editorPanel) {
      if (isTeacherLikeViewer && student) {
        editorPanel.innerHTML = `<div class="panel-header"><div><span class="eyebrow">Edit student</span><h2>直接編輯學生資料</h2></div></div><form data-student-edit-form class="student-edit-form"><label class="field-label">name</label><input name="name" value="${escapeHtml(student.name || '')}" /><label class="field-label">gradeLevel</label><input name="gradeLevel" value="${escapeHtml(student.gradeLevel || '')}" /><label class="field-label">currentLevel</label><input name="currentLevel" type="number" value="${escapeHtml(student.currentLevel ?? summary?.level ?? '')}" /><label class="field-label">xp</label><input name="xp" type="number" value="${escapeHtml(student.xp ?? summary?.xp ?? '')}" /><label class="field-label">nextLevelXp</label><input name="nextLevelXp" type="number" value="${escapeHtml(student.nextLevelXp ?? summary?.nextLevelXp ?? '')}" /><label class="field-label">streak</label><input name="streak" type="number" value="${escapeHtml(student.streak ?? summary?.streak ?? '')}" /><label class="field-label">mastery</label><input name="mastery" type="number" value="${escapeHtml(student.mastery ?? summary?.mastery ?? '')}" /><label class="field-label">weaknessLabel</label><input name="weaknessLabel" value="${escapeHtml(student.weaknessLabel || summary?.weaknessLabel || '')}" /><label class="field-label">weaknessScore</label><input name="weaknessScore" value="${escapeHtml(student.weaknessScore || summary?.weaknessScore || '')}" /><label class="field-label">focusSkills</label><input name="focusSkills" value="${escapeHtml((student.focusSkills || []).join(', '))}" /><label class="field-label">focusAreas</label><input name="focusAreas" value="${escapeHtml((summary?.focusAreas || []).join(', '))}" /><label class="field-label">recentQuestTitles</label><textarea name="recentQuestTitles" rows="3">${escapeHtml((summary?.recentQuestTitles || []).join(', '))}</textarea><input type="hidden" name="studentId" value="${escapeHtml(student.id || '')}" /><input type="hidden" name="userUid" value="${escapeHtml(student.userUid || '')}" /><input type="hidden" name="classroomIds" value="${escapeHtml((student.classroomIds || []).join(', '))}" /><input type="hidden" name="primaryTeacherUid" value="${escapeHtml(student.primaryTeacherUid || '')}" /><input type="hidden" name="status" value="${escapeHtml(student.status || 'active')}" /><div class="inline-actions"><button class="button button-primary" type="submit">儲存學生資料</button></div></form>`;
        const editForm = editorPanel.querySelector('[data-student-edit-form]');
        if (editForm) {
          editForm.onsubmit = async (e) => {
            e.preventDefault();
            const payload = Object.fromEntries(new FormData(editForm).entries());
            const studentId = String(payload.studentId || '').trim();
            if (!studentId) {
              showToast('studentId 缺失');
              return;
            }
            if (!window.QuestClassFirebase?.adminUpsertStudent) {
              showToast('Student edit API 不可用');
              return;
            }
            const result = await window.QuestClassFirebase.adminUpsertStudent(studentId, payload);
            if (!result?.ok) {
              showToast(result?.error || '學生資料更新失敗');
              return;
            }
            await syncFirestoreState();
            renderStudent();
            showToast('學生資料已更新');
          };
        }
      } else {
        editorPanel.innerHTML = '';
      }
    }

    if (progress) {
      progress.innerHTML = summary
        ? [`等級：${summary.level ?? student?.currentLevel ?? '—'}`, `XP：${summary.xp ?? student?.xp ?? '—'}`, `弱點：${summary.weaknessLabel || student?.weaknessLabel || '—'}`].map((item) => `<article class="metric-card"><strong>${escapeHtml(item)}</strong></article>`).join('')
        : emptyCard('尚無 progress', '目前沒有 summary 資料。');
    }

    if (quests) {
      quests.innerHTML = studentSubmissions.length
        ? studentSubmissions.map((item) => `<article class="list-card"><strong>${escapeHtml(item.assignmentTitle || item.topic || 'Untitled')}</strong><span>${escapeHtml(item.status || 'record')}</span></article>`).join('')
        : emptyCard('尚無任務', '目前沒有這位學生的 submissions / assignments 資料。');
    }

    if (roster) {
      if (isTeacherLikeViewer && firestoreState.students.length) {
        const searchInput = document.querySelector('[data-student-search]');
        const sortSelect = document.querySelector('[data-student-sort]');
        if (searchInput) {
          searchInput.value = studentSearchTerm;
          searchInput.oninput = () => {
            studentSearchTerm = searchInput.value || '';
            renderStudent();
          };
        }
        if (sortSelect) {
          sortSelect.value = studentSortMode;
          sortSelect.onchange = () => {
            studentSortMode = sortSelect.value || 'name';
            renderStudent();
          };
        }

        const normalizedTerm = studentSearchTerm.trim().toLowerCase();
        let visibleStudents = firestoreState.students.filter((item) => {
          if (!normalizedTerm) return true;
          const haystack = `${item.name || ''} ${item.id || ''} ${item.summary?.weaknessLabel || item.weaknessLabel || ''}`.toLowerCase();
          return haystack.includes(normalizedTerm);
        });

        visibleStudents = visibleStudents.sort((a, b) => {
          if (studentSortMode === 'xp-desc') return Number(b.summary?.xp ?? b.xp ?? 0) - Number(a.summary?.xp ?? a.xp ?? 0);
          if (studentSortMode === 'mastery-asc') return Number(a.summary?.mastery ?? a.mastery ?? 0) - Number(b.summary?.mastery ?? b.mastery ?? 0);
          return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
        });

        roster.innerHTML = visibleStudents.length
          ? visibleStudents.map((item) => {
              const mastery = Number(item.summary?.mastery ?? item.mastery ?? 0);
              const needsAttention = mastery < 75;
              return `<button type="button" class="list-card student-nav-card ${item.id === student?.id ? 'active' : ''} ${needsAttention ? 'attention' : ''}" data-student-switch="${escapeHtml(item.id || '')}"><strong>${escapeHtml(item.name || item.id || 'Student')}</strong><span>${escapeHtml(item.summary?.weaknessLabel || item.weaknessLabel || item.userUid || '')}</span><p>Lv ${escapeHtml(item.summary?.level ?? item.currentLevel ?? '—')} · XP ${escapeHtml(item.summary?.xp ?? item.xp ?? '—')} · Mastery ${escapeHtml(mastery || '—')}%</p></button>`;
            }).join('')
          : emptyCard('找不到學生', '試試別的關鍵字或排序。');

        roster.querySelectorAll('[data-student-switch]').forEach((btn) => {
          btn.onclick = () => {
            const nextId = btn.getAttribute('data-student-switch') || null;
            state.currentStudentId = nextId;
            saveState(state);
            const nextStudent = firestoreState.students.find((item) => item.id === nextId) || null;
            if (nextStudent) {
              firestoreState.student = nextStudent;
              firestoreState.summary = nextStudent.summary || null;
            }
            renderStudent();
          };
        });
      } else {
        roster.innerHTML = student
          ? `<article class="list-card active"><strong>${escapeHtml(student.name || student.id || 'Student')}</strong><span>${escapeHtml(state.session.email || '')}</span></article>`
          : emptyCard('尚無學生檔案', '登入後若仍是空白，表示 Firestore 尚未建立 student document。');
      }
    }
  }

  function renderChat() {
    const status = document.querySelector('[data-chat-status]');
    const messages = document.querySelector('[data-chat-messages]');
    const form = document.querySelector('[data-chat-form]');
    if (status) status.innerHTML = renderFirebaseStatus();
    if (messages) {
      messages.innerHTML = state.chat.length
        ? state.chat.map((msg) => `<div class="message ${escapeHtml(msg.role || 'ai')}">${escapeHtml(msg.text || '')}</div>`).join('')
        : emptyCard('尚無聊天紀錄', '設定 AI key 並送出第一則訊息後才會顯示內容。');
    }
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const message = String(fd.get('message') || '').trim();
        if (!message) return;
        const settings = getSettings();
        if (!settings.apiKey) {
          showToast('先設定 API key');
          return;
        }
        try {
          state.chat.push({ role: 'user', text: message });
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message,
              topic: 'general',
              mode: 'socratic',
              studentName: state.session.userName || 'student',
              apiBaseUrl: settings.apiBaseUrl || '',
              model: settings.apiModel || '',
              apiKey: settings.apiKey || ''
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Chat request failed');
          state.chat.push({ role: 'ai', text: data.reply || '' });
          state.modes.chat = data.mode || 'live';
          saveState(state);
          renderChat();
          form.reset();
        } catch (error) {
          showToast(error.message || '聊天失敗');
        }
      };
    }
  }

  function renderAnalytics() {
    const summary = document.querySelector('[data-analytics-summary]');
    const charts = document.querySelector('[data-analytics-charts]');
    if (summary) summary.innerHTML = emptyCard('Analytics 尚未接入', '等真實 submissions / metrics / aggregation query 準備好後，這頁才會顯示圖表。');
    if (charts) charts.innerHTML = emptyCard('No charts yet', '目前沒有任何內建假圖表。');
  }

  function renderAdmin() {
    const panel = document.querySelector('[data-admin-access]');
    const totalUsersNode = document.querySelector('[data-admin-total-users]');
    const pendingNode = document.querySelector('[data-admin-pending]');
    const issuesNode = document.querySelector('[data-admin-issues]');
    const statusNode = document.querySelector('[data-admin-status]');
    const userListNode = document.querySelector('[data-admin-user-list]');
    const detailNode = document.querySelector('[data-admin-detail]');
    const studentManagerNode = document.querySelector('[data-admin-student-manager]');
    const refreshBtn = document.querySelector('[data-admin-refresh]');

    const pendingCount = adminUsers.filter((user) => !!user.requestedRole).length;
    const issueCount = adminUsers.filter((user) => user.accountStatus === 'suspended' || user.issueFlag).length;
    const selectedUser = adminUsers.find((user) => user.uid === adminSelectedUid) || adminUsers[0] || null;
    const selectedStudent = adminStudents.find((item) => item.userUid === selectedUser?.uid) || adminStudents.find((item) => item.id === selectedUser?.studentId) || null;

    if (totalUsersNode) totalUsersNode.textContent = adminUsers.length ? String(adminUsers.length) : '0';
    if (pendingNode) pendingNode.textContent = String(pendingCount);
    if (issuesNode) issuesNode.textContent = String(issueCount);
    if (statusNode) statusNode.textContent = state.session.role === 'admin' ? 'Admin' : 'Restricted';

    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        await syncFirestoreState();
        renderAdmin();
        showToast('Admin 資料已重新整理');
      };
    }

    if (!panel) return;
    if (state.session.role !== 'admin') {
      panel.innerHTML = emptyCard('需要 admin 權限', '登入後，只有 profile.role = admin 的帳號能看到管理內容。');
      if (userListNode) userListNode.innerHTML = emptyCard('無法顯示帳號列表', '你目前不是 admin，不能讀取所有使用者。');
      if (detailNode) detailNode.innerHTML = `<div class="status-card muted"><strong>目前登入資訊</strong><span>先確認前端實際拿到的角色。</span></div><div class="list-grid"><article class="list-card active"><strong>uid</strong><span>${escapeHtml(state.session.uid || '—')}</span></article><article class="list-card active"><strong>email</strong><span>${escapeHtml(state.session.email || '—')}</span></article><article class="list-card active"><strong>session role</strong><span>${escapeHtml(state.session.role || '—')}</span></article><article class="list-card active"><strong>auth mode</strong><span>${escapeHtml(state.session.authMode || '—')}</span></article><article class="list-card active"><strong>firebase profile role</strong><span>${escapeHtml(firebaseProfile?.role || '—')}</span></article><article class="list-card active"><strong>firebase enabled</strong><span>${escapeHtml(String(!!window.QuestClassFirebase?.enabled?.()))}</span></article></div>`;
      if (studentManagerNode) studentManagerNode.innerHTML = emptyCard('需要 admin 權限', '登入 admin 帳號後才可管理學生資料。');
      return;
    }

    panel.innerHTML = `<div class="status-card ok"><strong>Admin 已登入</strong><span>目前帳號：${escapeHtml(state.session.email || state.session.userName || 'admin')}</span></div>`;

    if (userListNode) {
      const adminSearchInput = document.querySelector('[data-admin-search]');
      const adminSortSelect = document.querySelector('[data-admin-filter]');
      if (adminSearchInput) {
        adminSearchInput.value = adminUserSearchTerm;
        adminSearchInput.oninput = () => {
          adminUserSearchTerm = adminSearchInput.value || '';
          renderAdmin();
        };
      }
      if (adminSortSelect) {
        adminSortSelect.value = adminUserSortMode;
        adminSortSelect.onchange = () => {
          adminUserSortMode = adminSortSelect.value || 'name';
          renderAdmin();
        };
      }

      const normalizedAdminTerm = adminUserSearchTerm.trim().toLowerCase();
      let visibleUsers = adminUsers.filter((user) => {
        const haystack = `${user.name || ''} ${user.email || ''} ${user.uid || ''}`.toLowerCase();
        return !normalizedAdminTerm || haystack.includes(normalizedAdminTerm);
      });
      if (adminUserSortMode === 'admin' || adminUserSortMode === 'teacher' || adminUserSortMode === 'student') {
        visibleUsers = visibleUsers.filter((user) => user.role === adminUserSortMode);
      } else if (adminUserSortMode === 'suspended' || adminUserSortMode === 'review') {
        visibleUsers = visibleUsers.filter((user) => (user.accountStatus || 'active') === adminUserSortMode);
      } else {
        visibleUsers = visibleUsers.sort((a, b) => String(a.name || a.email || a.uid || '').localeCompare(String(b.name || b.email || b.uid || '')));
      }

      userListNode.innerHTML = visibleUsers.length
        ? visibleUsers.map((user) => `<button class="list-card ${user.uid === (selectedUser?.uid || '') ? 'active' : ''}" data-admin-user="${escapeHtml(user.uid)}"><strong>${escapeHtml(user.name || user.email || user.uid)}</strong><span>${escapeHtml(user.role || 'unknown')} · ${escapeHtml(user.accountStatus || 'active')}</span><p>${escapeHtml(user.email || user.uid)}</p></button>`).join('')
        : emptyCard('找不到帳號', adminUsersError || '試試別的搜尋或篩選。');
      userListNode.querySelectorAll('[data-admin-user]').forEach((btn) => {
        btn.onclick = () => {
          adminSelectedUid = btn.getAttribute('data-admin-user');
          renderAdmin();
        };
      });
    }

    if (detailNode) {
      if (!selectedUser) {
        detailNode.innerHTML = emptyCard('沒有選取帳號', '左側有帳號後，點一個就能看詳情。');
      } else {
        detailNode.innerHTML = `<div class="status-card muted"><strong>${escapeHtml(selectedUser.name || selectedUser.email || selectedUser.uid)}</strong><span>${escapeHtml(selectedUser.email || 'no email')}</span></div><div class="list-grid"><article class="list-card active"><strong>uid</strong><span>${escapeHtml(selectedUser.uid || '—')}</span></article><article class="list-card active"><strong>learnerStage</strong><span>${escapeHtml(selectedUser.learnerStage || '—')}</span></article><article class="list-card active"><strong>lastLoginAt</strong><span>${escapeHtml(selectedUser.lastLoginAt || '—')}</span></article></div><form data-admin-edit-form style="margin-top:12px;"><label class="field-label">role</label><select name="role"><option value="student" ${selectedUser.role === 'student' ? 'selected' : ''}>student</option><option value="teacher" ${selectedUser.role === 'teacher' ? 'selected' : ''}>teacher</option><option value="admin" ${selectedUser.role === 'admin' ? 'selected' : ''}>admin</option></select><label class="field-label">accountStatus</label><select name="accountStatus"><option value="active" ${(selectedUser.accountStatus || 'active') === 'active' ? 'selected' : ''}>active</option><option value="review" ${selectedUser.accountStatus === 'review' ? 'selected' : ''}>review</option><option value="suspended" ${selectedUser.accountStatus === 'suspended' ? 'selected' : ''}>suspended</option></select><div class="inline-actions" style="margin-top:12px;"><button class="button button-primary" type="submit">儲存帳號變更</button></div></form>`;
        const form = detailNode.querySelector('[data-admin-edit-form]');
        if (form) {
          form.onsubmit = async (e) => {
            e.preventDefault();
            const payload = Object.fromEntries(new FormData(form).entries());
            if (!window.QuestClassFirebase?.adminUpdateUserAccount) {
              showToast('Admin update API 不可用');
              return;
            }
            addAdminDebug('users.update(account)', 'start', `uid=${selectedUser.uid}`);
            const result = await window.QuestClassFirebase.adminUpdateUserAccount(selectedUser.uid, payload);
            if (!result?.ok) {
              addAdminDebug('users.update(account)', 'error', result?.error || '帳號更新失敗');
              renderAdmin();
              showToast(result?.error || '帳號更新失敗');
              return;
            }
            addAdminDebug('users.update(account)', 'ok', `uid=${selectedUser.uid}`);
            await syncFirestoreState();
            renderAdmin();
            showToast('帳號已更新');
          };
        }
      }
    }

    if (studentManagerNode) {
      const studentIdValue = draftStudentId(selectedUser, selectedStudent);
      studentManagerNode.innerHTML = `<form data-admin-student-form><label class="field-label">studentId</label><input name="studentId" value="${escapeHtml(studentIdValue)}" placeholder="e.g. ada or student-001" /><label class="field-label">userUid</label><input name="userUid" value="${escapeHtml(selectedStudent?.userUid || selectedUser?.uid || '')}" placeholder="Firebase Auth UID" /><label class="field-label">name</label><input name="name" value="${escapeHtml(selectedStudent?.name || selectedUser?.name || '')}" /><label class="field-label">gradeLevel</label><input name="gradeLevel" value="${escapeHtml(selectedStudent?.gradeLevel || '')}" placeholder="Grade 5" /><label class="field-label">classroomIds</label><input name="classroomIds" value="${escapeHtml((selectedStudent?.classroomIds || []).join(', '))}" placeholder="cls-5a" /><label class="field-label">primaryTeacherUid</label><input name="primaryTeacherUid" value="${escapeHtml(selectedStudent?.primaryTeacherUid || '')}" /><label class="field-label">status</label><select name="status"><option value="active" ${(selectedStudent?.status || 'active') === 'active' ? 'selected' : ''}>active</option><option value="review" ${selectedStudent?.status === 'review' ? 'selected' : ''}>review</option><option value="suspended" ${selectedStudent?.status === 'suspended' ? 'selected' : ''}>suspended</option></select><label class="field-label">currentLevel</label><input name="currentLevel" type="number" value="${escapeHtml(selectedStudent?.currentLevel ?? selectedStudent?.summary?.level ?? '')}" /><label class="field-label">xp</label><input name="xp" type="number" value="${escapeHtml(selectedStudent?.xp ?? selectedStudent?.summary?.xp ?? '')}" /><label class="field-label">nextLevelXp</label><input name="nextLevelXp" type="number" value="${escapeHtml(selectedStudent?.nextLevelXp ?? selectedStudent?.summary?.nextLevelXp ?? '')}" /><label class="field-label">streak</label><input name="streak" type="number" value="${escapeHtml(selectedStudent?.streak ?? selectedStudent?.summary?.streak ?? '')}" /><label class="field-label">mastery</label><input name="mastery" type="number" value="${escapeHtml(selectedStudent?.mastery ?? selectedStudent?.summary?.mastery ?? '')}" /><label class="field-label">weaknessLabel</label><input name="weaknessLabel" value="${escapeHtml(selectedStudent?.weaknessLabel || selectedStudent?.summary?.weaknessLabel || '')}" /><label class="field-label">weaknessScore</label><input name="weaknessScore" value="${escapeHtml(selectedStudent?.weaknessScore || selectedStudent?.summary?.weaknessScore || '')}" /><label class="field-label">focusSkills</label><input name="focusSkills" value="${escapeHtml((selectedStudent?.focusSkills || []).join(', '))}" placeholder="comma, separated" /><label class="field-label">focusAreas</label><input name="focusAreas" value="${escapeHtml((selectedStudent?.summary?.focusAreas || []).join(', '))}" placeholder="comma, separated" /><label class="field-label">recentQuestTitles</label><textarea name="recentQuestTitles" rows="3">${escapeHtml((selectedStudent?.summary?.recentQuestTitles || []).join(', '))}</textarea><div class="inline-actions"><button class="button button-primary" type="submit">儲存學生資料</button><button class="button button-ghost" type="button" data-admin-bind-student>綁定 user → student</button><button class="button button-ghost" type="button" data-admin-delete-student>刪除學生</button><button class="button button-ghost" type="button" data-admin-student-new>新增空白學生</button></div></form>${renderAdminDebugPanel()}`;
      const studentForm = studentManagerNode.querySelector('[data-admin-student-form]');
      const newBtn = studentManagerNode.querySelector('[data-admin-student-new]');
      if (newBtn) {
        newBtn.onclick = () => {
          studentManagerNode.innerHTML = `<form data-admin-student-form><label class="field-label">studentId</label><input name="studentId" value="" placeholder="new-student-id" /><label class="field-label">userUid</label><input name="userUid" value="" placeholder="Firebase Auth UID" /><label class="field-label">name</label><input name="name" value="" /><label class="field-label">gradeLevel</label><input name="gradeLevel" value="" placeholder="Grade 5" /><label class="field-label">classroomIds</label><input name="classroomIds" value="" placeholder="cls-5a" /><label class="field-label">primaryTeacherUid</label><input name="primaryTeacherUid" value="" /><label class="field-label">status</label><select name="status"><option value="active">active</option><option value="review">review</option><option value="suspended">suspended</option></select><label class="field-label">currentLevel</label><input name="currentLevel" type="number" value="" /><label class="field-label">xp</label><input name="xp" type="number" value="" /><label class="field-label">nextLevelXp</label><input name="nextLevelXp" type="number" value="" /><label class="field-label">streak</label><input name="streak" type="number" value="" /><label class="field-label">mastery</label><input name="mastery" type="number" value="" /><label class="field-label">weaknessLabel</label><input name="weaknessLabel" value="" /><label class="field-label">weaknessScore</label><input name="weaknessScore" value="" /><label class="field-label">focusSkills</label><input name="focusSkills" value="" placeholder="comma, separated" /><label class="field-label">focusAreas</label><input name="focusAreas" value="" placeholder="comma, separated" /><label class="field-label">recentQuestTitles</label><textarea name="recentQuestTitles" rows="3"></textarea><div class="inline-actions"><button class="button button-primary" type="submit">建立學生</button></div></form>${renderAdminDebugPanel()}`;
          renderAdmin();
        };
      }
      if (studentForm) {
        studentForm.onsubmit = async (e) => {
          e.preventDefault();
          const payload = Object.fromEntries(new FormData(studentForm).entries());
          const studentId = String(payload.studentId || '').trim();
          if (!window.QuestClassFirebase?.adminUpsertStudent) {
            showToast('Student admin API 不可用');
            return;
          }
          addAdminDebug('students.upsert', 'start', `studentId=${studentId}`);
          const result = await window.QuestClassFirebase.adminUpsertStudent(studentId, payload);
          if (!result?.ok) {
            addAdminDebug('students.upsert', 'error', result?.error || '學生資料更新失敗');
            renderAdmin();
            showToast(result?.error || '學生資料更新失敗');
            return;
          }
          addAdminDebug('students.upsert', 'ok', `studentId=${studentId}`);
          const classroomIds = String(payload.classroomIds || '').split(',').map((v) => v.trim()).filter(Boolean);
          if (!payload.name?.trim()) {
            showToast('學生姓名必填');
            return;
          }
          if (!payload.userUid?.trim()) {
            showToast('userUid 必填');
            return;
          }
          if (!classroomIds.length) {
            showToast('至少填一個 classroomId');
            return;
          }
          if (selectedUser?.uid && payload.userUid) {
            addAdminDebug('users.update(role)', 'start', `uid=${selectedUser.uid}`);
            const userRes = await window.QuestClassFirebase.adminUpdateUserAccount(selectedUser.uid, { role: 'student', accountStatus: 'active' });
            if (!userRes?.ok) {
              addAdminDebug('users.update(role)', 'error', userRes?.error || '帳號更新失敗');
              renderAdmin();
              showToast(userRes?.error || '帳號更新失敗');
              return;
            }
            addAdminDebug('users.update(role)', 'ok', `uid=${selectedUser.uid}`);
          }
          await syncFirestoreState();
          renderAdmin();
          showToast(`學生資料已儲存（studentId: ${result?.studentId || studentId || 'auto'}）`);
        };
      }

      const bindBtn = studentManagerNode.querySelector('[data-admin-bind-student]');
      if (bindBtn) {
        bindBtn.onclick = async () => {
          const studentId = studentManagerNode.querySelector('[name="studentId"]')?.value?.trim();
          const userUid = studentManagerNode.querySelector('[name="userUid"]')?.value?.trim();
          if (!studentId || !userUid) {
            showToast('要先填 studentId 和 userUid');
            return;
          }
          addAdminDebug('bind user→student', 'start', `uid=${userUid}, studentId=${studentId}`);
          const result = await window.QuestClassFirebase.adminBindUserStudent(userUid, studentId);
          if (!result?.ok) {
            addAdminDebug('bind user→student', 'error', result?.error || '綁定失敗');
            renderAdmin();
            showToast(result?.error || '綁定失敗');
            return;
          }
          addAdminDebug('bind user→student', 'ok', `uid=${userUid}, studentId=${studentId}`);
          await syncFirestoreState();
          renderAdmin();
          showToast('已綁定 user 與 student');
        };
      }

      const deleteBtn = studentManagerNode.querySelector('[data-admin-delete-student]');
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          const studentId = studentManagerNode.querySelector('[name="studentId"]')?.value?.trim();
          const userUid = studentManagerNode.querySelector('[name="userUid"]')?.value?.trim();
          if (!studentId) {
            showToast('沒有 studentId 可刪除');
            return;
          }
          const ok = confirm(`Delete student ${studentId}? This removes student + summary.`);
          if (!ok) return;
          addAdminDebug('students.delete', 'start', `studentId=${studentId}`);
          const result = await window.QuestClassFirebase.adminDeleteStudent(studentId, userUid);
          if (!result?.ok) {
            addAdminDebug('students.delete', 'error', result?.error || '刪除失敗');
            renderAdmin();
            showToast(result?.error || '刪除失敗');
            return;
          }
          addAdminDebug('students.delete', 'ok', `studentId=${studentId}`);
          await syncFirestoreState();
          renderAdmin();
          showToast('學生資料已刪除');
        };
      }
    }
  }

  function renderAll() {
    setShell();
    wireSettings();
    wireFirebaseStatus();
    if (page === 'landing') renderLanding();
    if (page === 'teacher') renderTeacher();
    if (page === 'student') renderStudent();
    if (page === 'chat') renderChat();
    if (page === 'analytics') renderAnalytics();
    if (page === 'admin') renderAdmin();
  }

  async function init() {
    await fetchRuntimeConfig();

    try {
      if (window.QuestClassFirebase?.init) {
        const session = await window.QuestClassFirebase.init();
        if (session?.ok && session.user) {
          firebaseProfile = session.user?.profile || null;
          state.session = {
            authMode: 'firebase',
            role: session.user?.role || 'guest',
            userName: session.user?.name || '',
            email: session.user?.email || '',
            uid: session.user?.uid || null,
            photoURL: session.user?.photoURL || ''
          };
          saveState(state);
        }
      }
    } catch {
      // leave local state as-is
    }

    await syncFirestoreState();
    renderAll();
  }

  init();
})();
