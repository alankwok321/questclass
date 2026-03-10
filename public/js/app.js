const STORAGE_KEY = 'questclass_state_v1';
const SETTINGS_KEY = 'questclass_settings_v1';

const defaultState = {
  student: { level: 7, xp: 1280, nextLevelXp: 1800, streak: 12 },
  dailyQuests: [
    { title: '完成 3 題分數比較', meta: '+80 XP · 未完成', done: false },
    { title: '和 AI 老師對話 5 分鐘', meta: '+50 XP · 未完成', done: false },
    { title: '修正昨天的 2 題錯題', meta: '+100 XP · 已解鎖', done: false }
  ],
  badges: [
    { icon: '⚡', name: '三日連擊', meta: '連續學習 3 天' },
    { icon: '🧠', name: '概念突破', meta: '首次通過弱點單元' },
    { icon: '🎯', name: '準確射手', meta: '單次正確率 90%+' },
    { icon: '🔥', name: '今日挑戰者', meta: '完成每日挑戰' }
  ],
  leaderboard: [
    { name: 'Mia', xp: 1640 },
    { name: 'Ada', xp: 1280 },
    { name: 'Leo', xp: 1210 },
    { name: 'Noah', xp: 1180 }
  ],
  chat: [
    { role: 'ai', text: '嗨，Ada。今天我們不要急著拿答案，先把你卡住的概念拆小。你想先攻克哪一題？' },
    { role: 'user', text: '我不懂為什麼 3/4 比 2/3 大。' },
    { role: 'ai', text: '好，先別算交叉乘。你可以把它們都想成同樣大小的披薩切片嗎？如果一個披薩切成 4 片拿 3 片，另一個切成 3 片拿 2 片，哪個看起來比較接近整個披薩？' }
  ],
  pipeline: [
    { key: 'assign', label: '出題', desc: '根據弱點出題' },
    { key: 'answer', label: '作答', desc: '學生完成練習' },
    { key: 'grade', label: '批改', desc: '立即評分與標註' },
    { key: 'analyze', label: '分析', desc: '找出真正卡點' },
    { key: 'regenerate', label: '再出題', desc: '給下一輪變體' }
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
    {
      title: '錯題群：分數比較 + 文字題理解',
      text: '學生常在看到「剩下幾分之幾」這種語句時，沒有先把情境翻成分數關係，導致後面比較大小時方向錯掉。'
    },
    {
      title: '關聯建議：先補「通分」再回到應用題',
      text: '目前不是純計算不會，而是概念切換慢。先用圖像與同分母練習，會比直接刷題有效。'
    }
  ],
  teacherStats: [
    { label: '班級完成率', value: '84%' },
    { label: '平均答對率', value: '78%' },
    { label: '需關注學生', value: '4 人' },
    { label: '今日已出題組', value: '12 組' }
  ],
  assignment: ['比較 3/4 與 2/3', '把生活題翻成數學式', '用圖像解釋通分'],
  loopInsight: '建議先補語意轉換，再回到應用題。',
  modes: { chat: 'Demo mode', loop: 'Demo mode' }
};

let state = loadState();
let toastTimer = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? mergeDeep(structuredClone(defaultState), saved) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeDeep(target, source) {
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings() {
  const settings = {
    apiBaseUrl: document.getElementById('apiBaseUrl').value.trim(),
    apiModel: document.getElementById('apiModel').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  showToast('AI 設定已儲存');
}

function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  document.getElementById('apiBaseUrl').value = '';
  document.getElementById('apiModel').value = '';
  document.getElementById('apiKey').value = '';
  showToast('AI 設定已清除');
}

function hydrateSettingsUI() {
  const s = getSettings();
  document.getElementById('apiBaseUrl').value = s.apiBaseUrl || '';
  document.getElementById('apiModel').value = s.apiModel || '';
  document.getElementById('apiKey').value = s.apiKey || '';
}

function initApp() {
  hydrateSettingsUI();
  renderSidebar();
  renderChat();
  renderPipeline();
  renderKnowledgeMap();
  renderSkillTree();
  renderHeatmap();
  renderMistakeLinks();
  renderTeacherStats();
  renderAssignments();
  updateModeBadges();
  runLearningLoop(true);
}

function renderSidebar() {
  document.getElementById('studentLevel').textContent = state.student.level;
  document.getElementById('studentXp').textContent = state.student.xp;
  document.getElementById('streakValue').textContent = state.student.streak;
  document.getElementById('xpBar').style.width = `${Math.round((state.student.xp / state.student.nextLevelXp) * 100)}%`;

  document.getElementById('dailyQuestList').innerHTML = state.dailyQuests.map((q, i) => `
    <div class="quest-item">
      <strong>${q.done ? '✅' : '🗒️'} ${q.title}</strong>
      <div class="quest-meta">${q.meta}</div>
      <button class="btn btn-small btn-secondary" style="margin-top:10px;" onclick="completeQuest(${i})">${q.done ? '已完成' : '標記完成'}</button>
    </div>
  `).join('');

  document.getElementById('badgeGrid').innerHTML = state.badges.map((b) => `
    <div class="badge-item">
      <strong>${b.icon} ${b.name}</strong>
      <span>${b.meta}</span>
    </div>
  `).join('');

  const sorted = [...state.leaderboard].sort((a, b) => b.xp - a.xp);
  document.getElementById('leaderboard').innerHTML = sorted.map((p, i) => `
    <div class="leader-item">
      <strong>#${i + 1} ${p.name}</strong>
      <span>${p.xp} XP</span>
    </div>
  `).join('');
}

function renderChat() {
  const el = document.getElementById('chatMessages');
  el.innerHTML = state.chat.map((m) => `
    <div class="message ${m.role}">${escapeHtml(m.text)}</div>
  `).join('');
  el.scrollTop = el.scrollHeight;
}

function renderPipeline(activeIndex = -1) {
  document.getElementById('pipeline').innerHTML = state.pipeline.map((step, i) => `
    <div class="pipeline-step ${i === activeIndex ? 'active' : ''}">
      <strong>${step.label}</strong>
      <span>${step.desc}</span>
    </div>
  `).join('');
}

function renderKnowledgeMap() {
  document.getElementById('knowledgeMap').innerHTML = state.knowledgeMap.map((node) => `
    <div class="map-node ${node.status}">
      <strong>${node.title}</strong>
      <span>${node.meta}</span>
    </div>
  `).join('');
}

function renderSkillTree() {
  document.getElementById('skillTree').innerHTML = state.skills.map((skill) => `
    <div class="skill-row">
      <div class="skill-label">${skill.label}</div>
      <div class="skill-bar"><div class="skill-bar-fill" style="width:${skill.score}%"></div></div>
      <div class="skill-score">${skill.score}%</div>
    </div>
  `).join('');
}

function renderHeatmap() {
  document.getElementById('heatmap').innerHTML = state.heatmap.map((item) => `
    <div class="heat-cell heat-${item.level}">${item.label}</div>
  `).join('');
}

function renderMistakeLinks() {
  document.getElementById('mistakeLinks').innerHTML = state.mistakeLinks.map((item) => `
    <div class="mistake-card">
      <strong>${item.title}</strong>
      <p>${item.text}</p>
    </div>
  `).join('');
}

function renderTeacherStats() {
  document.getElementById('teacherStats').innerHTML = state.teacherStats.map((s) => `
    <div class="teacher-stat">
      <span>${s.label}</span>
      <strong>${s.value}</strong>
    </div>
  `).join('');
}

function renderAssignments() {
  document.getElementById('assignmentList').innerHTML = state.assignment.map((a) => `<li>${escapeHtml(a)}</li>`).join('');
  document.getElementById('loopInsight').textContent = state.loopInsight || '';
}

function updateModeBadges() {
  document.getElementById('chatModeBadge').textContent = state.modes.chat;
  document.getElementById('loopModeBadge').textContent = state.modes.loop;
}

function getApiPayload() {
  const s = getSettings();
  return {
    apiBaseUrl: s.apiBaseUrl,
    model: s.apiModel,
    apiKey: s.apiKey,
  };
}

function seedPrompt(text) {
  document.getElementById('chatInput').value = text;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  state.chat.push({ role: 'user', text });
  renderChat();
  input.value = '';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        topic: 'fractions',
        mode: 'socratic',
        ...getApiPayload(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chat request failed');

    state.chat.push({ role: 'ai', text: data.reply || '目前沒有回應。' });
    state.modes.chat = data.mode === 'live' ? 'Live AI' : 'Demo mode';
    updateModeBadges();
    renderChat();
    saveState();
  } catch (error) {
    state.chat.push({ role: 'ai', text: '目前連線失敗，我先用 demo 模式繼續：先說說你最卡的那一步是什麼？' });
    state.modes.chat = 'Demo fallback';
    updateModeBadges();
    renderChat();
    showToast('AI 聊天連線失敗，已切回 demo');
  }
}

function completeQuest(index) {
  if (!state.dailyQuests[index] || state.dailyQuests[index].done) return;
  state.dailyQuests[index].done = true;
  state.student.xp += 90;
  const ada = state.leaderboard.find((x) => x.name === 'Ada');
  if (ada) ada.xp = state.student.xp;
  renderSidebar();
  saveState();
  showToast('任務完成，XP +90');
}

function simulateStudyWin() {
  const openQuest = state.dailyQuests.findIndex((q) => !q.done);
  if (openQuest >= 0) completeQuest(openQuest);
  else {
    state.student.xp += 40;
    renderSidebar();
    saveState();
    showToast('小進步也算進度，XP +40');
  }
}

async function runLearningLoop(silent = false) {
  const output = document.getElementById('loopOutput');
  output.innerHTML = '';
  renderPipeline();

  try {
    const res = await fetch('/api/teacher/lesson-loop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'fractions',
        weakness: '文字題理解與分數比較',
        ...getApiPayload(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Loop request failed');

    const lines = data.steps || [];
    state.assignment = data.assignment || state.assignment;
    state.loopInsight = data.insight || state.loopInsight;
    state.modes.loop = data.mode === 'live' ? 'Live AI' : 'Demo mode';
    updateModeBadges();
    renderAssignments();

    lines.forEach((line, index) => {
      setTimeout(() => {
        renderPipeline(index);
        const div = document.createElement('div');
        div.className = 'loop-line';
        div.textContent = line;
        output.appendChild(div);
      }, index * 320);
    });

    saveState();
    setTimeout(() => {
      if (!silent) showToast('教學流程已跑完一輪');
    }, lines.length * 320 + 50);
  } catch (error) {
    state.modes.loop = 'Demo fallback';
    updateModeBadges();
    const fallback = [
      '1. 系統根據弱點熱區挑出「分數比較」與「文字題理解」作為今日主題。',
      '2. 自動生成 5 題由淺入深的題目，並插入 1 題生活化情境題。',
      '3. 學生作答後，系統即時標記：概念對，但轉式子慢。',
      '4. 分析判斷真正卡點在「把語句翻成數學關係」，不是純計算。',
      '5. 系統再出 3 題變體題，並安排 AI 老師用提問引導，不直接給答案。'
    ];
    fallback.forEach((line, index) => {
      setTimeout(() => {
        renderPipeline(index);
        const div = document.createElement('div');
        div.className = 'loop-line';
        div.textContent = line;
        output.appendChild(div);
      }, index * 320);
    });
    if (!silent) showToast('AI 流程連線失敗，已切回 demo');
  }
}

function showToast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
