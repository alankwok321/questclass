import { demoData } from './core/data.js';
import { loadState, saveState, getSettings, saveSettings as persistSettings, clearSettings as dropSettings, currentStudent, currentClassroom } from './core/state.js';
import { sendChat, runLessonLoop } from './core/api.js';
import { qs, qsa, escapeHtml, renderNav, renderSettingsForm, renderFirebaseStatus, showToast } from './core/ui.js';

const state = loadState();
const page = document.body.dataset.page || 'landing';

function setShell() {
  qsa('[data-nav]').forEach((node) => {
    node.innerHTML = renderNav(page);
  });
  qsa('[data-brand]').forEach((node) => {
    node.textContent = `${demoData.brand.name} ${demoData.brand.version}`;
  });
  qsa('[data-promise]').forEach((node) => {
    node.textContent = demoData.brand.promise;
  });
}

function wireSettings() {
  qsa('[data-settings-form]').forEach((form) => {
    form.innerHTML = renderSettingsForm(getSettings());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      persistSettings(Object.fromEntries(formData.entries()));
      showToast('AI 設定已儲存');
    });

    qs('[data-clear-settings]', form)?.addEventListener('click', () => {
      dropSettings();
      form.innerHTML = renderSettingsForm({});
      wireSettings();
      showToast('AI 設定已清除');
    });
  });
}

function wireFirebaseStatus() {
  qsa('[data-firebase-status]').forEach((node) => {
    node.innerHTML = renderFirebaseStatus();
  });
}

function renderLanding() {
  const roadmap = qs('[data-roadmap]');
  const spotlight = qs('[data-spotlight]');
  if (roadmap) {
    roadmap.innerHTML = demoData.roadmap.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }
  if (spotlight) {
    spotlight.innerHTML = demoData.pages
      .filter((item) => item.key !== 'landing')
      .map((item) => `<a class="surface-link" href="${item.href}"><strong>${item.label}</strong><span>進入 ${item.label} 頁面</span></a>`)
      .join('');
  }
}

function renderTeacher() {
  const student = currentStudent(state);
  const classroom = currentClassroom(state);

  const metrics = qs('[data-teacher-metrics]');
  const students = qs('[data-student-cards]');
  const classroomList = qs('[data-classroom-list]');
  const summary = qs('[data-teacher-summary]');
  const assignment = qs('[data-assignment]');
  const insight = qs('[data-insight]');
  const hero = qs('[data-teacher-hero]');

  if (hero) {
    hero.innerHTML = `
      <div class="hero-copy">
        <span class="eyebrow">Teacher OS</span>
        <h1>${escapeHtml(classroom.name)}</h1>
        <p>目前焦點學生：${escapeHtml(student.name)} · 弱點：${escapeHtml(student.weaknessLabel)}</p>
      </div>
      <div class="hero-stats">
        <div><strong>${classroom.activeStudents}</strong><span>活躍學生</span></div>
        <div><strong>${classroom.completionRate}%</strong><span>完成率</span></div>
      </div>
    `;
  }

  if (metrics) {
    metrics.innerHTML = demoData.teacherMetrics.map((metric) => `
      <article class="metric-card">
        <span>${metric.label}</span>
        <strong>${metric.value}</strong>
      </article>
    `).join('');
  }

  if (students) {
    students.innerHTML = demoData.students.map((item) => `
      <button class="list-card ${item.id === state.currentStudentId ? 'active' : ''}" data-student-id="${item.id}">
        <strong>${item.name}</strong>
        <span>${item.status}</span>
        <p>${item.weaknessLabel}</p>
      </button>
    `).join('');

    qsa('[data-student-id]', students).forEach((button) => {
      button.addEventListener('click', () => {
        state.currentStudentId = button.dataset.studentId;
        saveState(state);
        renderTeacher();
      });
    });
  }

  if (classroomList) {
    classroomList.innerHTML = demoData.classrooms.map((item) => `
      <button class="list-card ${item.id === state.currentClassroomId ? 'active' : ''}" data-classroom-id="${item.id}">
        <strong>${item.name}</strong>
        <span>${item.grade} · ${item.subject}</span>
      </button>
    `).join('');

    qsa('[data-classroom-id]', classroomList).forEach((button) => {
      button.addEventListener('click', () => {
        state.currentClassroomId = button.dataset.classroomId;
        saveState(state);
        renderTeacher();
      });
    });
  }

  if (summary) {
    summary.innerHTML = state.teacherSummary.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }
  if (assignment) {
    assignment.innerHTML = state.assignment.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  }
  if (insight) {
    insight.textContent = state.insight;
  }

  qs('[data-run-loop]')?.addEventListener('click', async () => {
    const output = qs('[data-loop-output]');
    if (output) output.innerHTML = '<p class="muted">產生中…</p>';
    try {
      const data = await runLessonLoop(currentStudent(state), currentClassroom(state));
      state.assignment = data.assignment || state.assignment;
      state.insight = data.insight || state.insight;
      state.teacherSummary = data.teacherSummary || state.teacherSummary;
      state.loopSteps = data.steps || [];
      state.modes.loop = data.mode === 'live' ? 'Live AI' : 'Demo mode';
      saveState(state);
      if (output) {
        output.innerHTML = state.loopSteps.map((item) => `<div class="timeline-item">${escapeHtml(item)}</div>`).join('');
      }
      renderTeacher();
      showToast('教學流程已更新');
    } catch (error) {
      if (output) output.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
      showToast('教學流程更新失敗');
    }
  }, { once: true });

  const output = qs('[data-loop-output]');
  if (output) {
    output.innerHTML = (state.loopSteps.length ? state.loopSteps : ['按下「產生 lesson loop」取得新一輪教學流程。'])
      .map((item) => `<div class="timeline-item">${escapeHtml(item)}</div>`)
      .join('');
  }

  const mode = qs('[data-loop-mode]');
  if (mode) mode.textContent = state.modes.loop;
}

function renderStudent() {
  const student = currentStudent(state);
  const hero = qs('[data-student-hero]');
  const progress = qs('[data-student-progress]');
  const quests = qs('[data-quests]');
  const roster = qs('[data-student-roster]');

  if (hero) {
    hero.innerHTML = `
      <div class="hero-copy">
        <span class="eyebrow">Student Home</span>
        <h1>${escapeHtml(student.name)}</h1>
        <p>目前弱點：${escapeHtml(student.weaknessLabel)} · 連續學習 ${student.streak} 天</p>
      </div>
      <div class="hero-stats">
        <div><strong>Lv.${student.level}</strong><span>目前等級</span></div>
        <div><strong>${student.mastery}%</strong><span>技能掌握</span></div>
      </div>
    `;
  }

  if (progress) {
    progress.innerHTML = `
      <article class="metric-card"><span>XP</span><strong>${student.xp}</strong></article>
      <article class="metric-card"><span>下一級目標</span><strong>${student.nextLevelXp}</strong></article>
      <article class="metric-card"><span>弱點分數</span><strong>${student.weaknessScore}</strong></article>
    `;
  }

  if (quests) {
    quests.innerHTML = demoData.dailyQuests.map((quest) => `
      <article class="list-card">
        <strong>${quest.title}</strong>
        <span>${quest.meta}</span>
      </article>
    `).join('');
  }

  if (roster) {
    roster.innerHTML = demoData.students.map((item) => `
      <button class="list-card ${item.id === state.currentStudentId ? 'active' : ''}" data-roster-student="${item.id}">
        <strong>${item.name}</strong>
        <span>Level ${item.level}</span>
      </button>
    `).join('');

    qsa('[data-roster-student]', roster).forEach((button) => {
      button.addEventListener('click', () => {
        state.currentStudentId = button.dataset.rosterStudent;
        saveState(state);
        renderStudent();
      });
    });
  }
}

function renderChatPage() {
  const messages = qs('[data-chat-messages]');
  const status = qs('[data-chat-mode]');
  const student = currentStudent(state);

  if (messages) {
    messages.innerHTML = state.chat.map((message) => `
      <div class="chat-bubble ${message.role}">${escapeHtml(message.text)}</div>
    `).join('');
  }
  if (status) status.textContent = state.modes.chat;

  qs('[data-chat-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = qs('[name="message"]');
    const message = input?.value.trim();
    if (!message) return;

    state.chat.push({ role: 'user', text: message });
    saveState(state);
    renderChatPage();
    input.value = '';

    try {
      const data = await sendChat(message, student.name);
      state.chat.push({ role: 'ai', text: data.reply || '目前沒有回應。' });
      state.modes.chat = data.mode === 'live' ? 'Live AI' : 'Demo mode';
      saveState(state);
      renderChatPage();
    } catch (error) {
      state.chat.push({ role: 'ai', text: '目前連線失敗，我先用 demo 模式陪你拆題。先說說你最卡的那一步。' });
      state.modes.chat = 'Demo fallback';
      saveState(state);
      renderChatPage();
      showToast(error.message);
    }
  }, { once: true });

  qsa('[data-seed-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = qs('[name="message"]');
      if (input) input.value = button.dataset.seedPrompt || '';
    });
  });
}

function renderAnalytics() {
  const units = qs('[data-units]');
  const bank = qs('[data-question-bank]');
  const map = qs('[data-knowledge-map]');
  const skills = qs('[data-skills]');
  const heatmap = qs('[data-heatmap]');
  const links = qs('[data-mistake-links]');

  if (units) units.innerHTML = demoData.units.map((unit) => `<article class="list-card"><strong>${unit.name}</strong><span>${unit.tag}</span><p>${unit.progress}</p></article>`).join('');
  if (bank) bank.innerHTML = demoData.questionBank.map((item) => `<article class="list-card"><strong>${item.type}</strong><p>${item.title}</p></article>`).join('');
  if (map) map.innerHTML = demoData.knowledgeMap.map((item) => `<article class="map-card ${item.status}"><strong>${item.title}</strong><span>${item.meta}</span></article>`).join('');
  if (skills) skills.innerHTML = demoData.skills.map((item) => `<div class="skill-row"><span>${item.label}</span><div class="skill-bar"><div style="width:${item.score}%"></div></div><strong>${item.score}%</strong></div>`).join('');
  if (heatmap) heatmap.innerHTML = demoData.heatmap.map((item) => `<div class="heat-cell ${item.level}">${item.label}</div>`).join('');
  if (links) links.innerHTML = demoData.mistakeLinks.map((item) => `<article class="list-card"><strong>${item.title}</strong><p>${item.text}</p></article>`).join('');
}

async function initFirebaseSession() {
  if (!window.QuestClassFirebase?.init) return;
  try {
    const result = await window.QuestClassFirebase.init();
    if (result?.user) {
      state.session.authMode = 'firebase';
      state.session.role = result.user.role || state.session.role;
      state.session.userName = result.user.name || state.session.userName;
      state.session.email = result.user.email || state.session.email;
      saveState(state);
    }
    wireFirebaseStatus();
  } catch {
    wireFirebaseStatus();
  }
}

async function boot() {
  setShell();
  wireSettings();
  wireFirebaseStatus();
  renderLanding();
  renderTeacher();
  renderStudent();
  renderChatPage();
  renderAnalytics();
  await initFirebaseSession();
}

boot();
