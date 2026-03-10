const STORAGE_KEY = 'questclass_state_v2';
const SETTINGS_KEY = 'questclass_settings_v1';

const defaultState = {
  classroom: {
    name: '5A 數學實驗班',
    grade: 'Grade 5',
    activeStudents: 28,
    completionRate: 84,
  },
  students: [
    { id: 'ada', name: 'Ada', level: 7, xp: 1280, nextLevelXp: 1800, streak: 12, weaknessLabel: '分數比較 / 文字題', weaknessScore: '分數 2/5', mastery: 78, status: '需要追蹤' },
    { id: 'mia', name: 'Mia', level: 9, xp: 1640, nextLevelXp: 2200, streak: 17, weaknessLabel: '百分比轉換', weaknessScore: '百分比 3/5', mastery: 86, status: '穩定' },
    { id: 'leo', name: 'Leo', level: 6, xp: 1210, nextLevelXp: 1700, streak: 8, weaknessLabel: '通分 / 約分', weaknessScore: '通分 2/5', mastery: 69, status: '需加強' },
    { id: 'noah', name: 'Noah', level: 6, xp: 1180, nextLevelXp: 1700, streak: 6, weaknessLabel: '文字轉式子', weaknessScore: '文字題 2/5', mastery: 65, status: '需加強' }
  ],
  currentStudentId: 'ada',
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
    { title: '錯題群：分數比較 + 文字題理解', text: '學生常在看到「剩下幾分之幾」這種語句時，沒有先把情境翻成分數關係，導致後面比較大小時方向錯掉。' },
    { title: '關聯建議：先補「通分」再回到應用題', text: '目前不是純計算不會，而是概念切換慢。先用圖像與同分母練習，會比直接刷題有效。' }
  ],
  teacherStats: [
    { label: '班級完成率', value: '84%' },
    { label: '平均答對率', value: '78%' },
    { label: '需關注學生', value: '4 人' },
    { label: '今日已出題組', value: '12 組' }
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
  assignment: ['比較 3/4 與 2/3', '把生活題翻成數學式', '用圖像解釋通分'],
  loopInsight: '建議先補語意轉換，再回到應用題。',
  teacherSummary: ['本輪建議以 12 分鐘微任務進行', '先用圖像，再進文字題', '下一輪可追蹤提示後正確率'],
  modes: { chat: 'Demo mode', loop: 'Demo mode' }
};

let state = loadState();
let toastTimer = null;

function structured(obj) { return JSON.parse(JSON.stringify(obj)); }
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? mergeDeep(structured(defaultState), saved) : structured(defaultState);
  } catch { return structured(defaultState); }
}
function mergeDeep(target, source) {
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) target[key] = mergeDeep(target[key] || {}, source[key]);
    else target[key] = source[key];
  }
  return target;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function getSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
function saveSettings() {
  const settings = { apiBaseUrl: apiBaseUrl.value.trim(), apiModel: apiModel.value.trim(), apiKey: apiKey.value.trim() };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); showToast('AI 設定已儲存');
}
function clearSettings() { localStorage.removeItem(SETTINGS_KEY); apiBaseUrl.value=''; apiModel.value=''; apiKey.value=''; showToast('AI 設定已清除'); }
function hydrateSettingsUI() { const s=getSettings(); apiBaseUrl.value=s.apiBaseUrl||''; apiModel.value=s.apiModel||''; apiKey.value=s.apiKey||''; }
function currentStudent() { return state.students.find(s => s.id === state.currentStudentId) || state.students[0]; }
function getApiPayload() { const s = getSettings(); return { apiBaseUrl: s.apiBaseUrl, model: s.apiModel, apiKey: s.apiKey }; }

function initApp() {
  hydrateSettingsUI();
  renderAll();
  runLearningLoop(true);
}

function renderAll() {
  renderSidebar(); renderStudentList(); renderChat(); renderPipeline(); renderKnowledgeMap(); renderSkillTree(); renderHeatmap(); renderMistakeLinks(); renderTeacherStats(); renderAssignments(); renderUnits(); renderQuestionBank(); updateModeBadges(); updateHero();
}

function updateHero() {
  const student = currentStudent();
  studentName.textContent = `${student.name} 同學`;
  heroWeaknessScore.textContent = student.weaknessScore;
  heroWeaknessLabel.textContent = student.weaknessLabel;
  heroActiveStudents.textContent = state.classroom.activeStudents;
  heroCompletionRate.textContent = `${state.classroom.completionRate}%`;
}

function renderSidebar() {
  const student = currentStudent();
  studentLevel.textContent = student.level;
  studentXp.textContent = student.xp;
  streakValue.textContent = student.streak;
  xpBar.style.width = `${Math.round((student.xp / student.nextLevelXp) * 100)}%`;

  dailyQuestList.innerHTML = state.dailyQuests.map((q, i) => `
    <div class="quest-item"><strong>${q.done ? '✅' : '🗒️'} ${q.title}</strong><div class="quest-meta">${q.meta}</div><button class="btn btn-small btn-secondary" style="margin-top:10px;" onclick="completeQuest(${i})">${q.done ? '已完成' : '標記完成'}</button></div>`).join('');
  badgeGrid.innerHTML = state.badges.map((b) => `<div class="badge-item"><strong>${b.icon} ${b.name}</strong><span>${b.meta}</span></div>`).join('');
  leaderboard.innerHTML = [...state.students].sort((a,b)=>b.xp-a.xp).map((p,i)=>`<div class="leader-item"><strong>#${i+1} ${p.name}</strong><span>${p.xp} XP</span></div>`).join('');
}

function renderStudentList() {
  studentList.innerHTML = state.students.map(s => `
    <button class="stack-card ${s.id===state.currentStudentId?'active':''}" onclick="switchStudent('${s.id}')">
      <strong>${s.name}</strong>
      <span>Level ${s.level} · ${s.status}</span>
    </button>`).join('');
}

function switchStudent(id) {
  state.currentStudentId = id;
  const student = currentStudent();
  state.chat = [
    { role: 'ai', text: `嗨，${student.name}。今天先從你最需要補的「${student.weaknessLabel}」開始。你想先做題還是先聊概念？` }
  ];
  state.loopInsight = `${student.name} 目前最需要補的是 ${student.weaknessLabel}。`;
  renderAll(); saveState(); showToast(`已切換到 ${student.name}`);
}

function renderChat() { chatMessages.innerHTML = state.chat.map(m=>`<div class="message ${m.role}">${escapeHtml(m.text)}</div>`).join(''); chatMessages.scrollTop = chatMessages.scrollHeight; }
function renderPipeline(activeIndex=-1) { pipeline.innerHTML = state.pipeline.map((step,i)=>`<div class="pipeline-step ${i===activeIndex?'active':''}"><strong>${step.label}</strong><span>${step.desc}</span></div>`).join(''); }
function renderKnowledgeMap() { knowledgeMap.innerHTML = state.knowledgeMap.map(node=>`<div class="map-node ${node.status}"><strong>${node.title}</strong><span>${node.meta}</span></div>`).join(''); }
function renderSkillTree() { skillTree.innerHTML = state.skills.map(skill=>`<div class="skill-row"><div class="skill-label">${skill.label}</div><div class="skill-bar"><div class="skill-bar-fill" style="width:${skill.score}%"></div></div><div class="skill-score">${skill.score}%</div></div>`).join(''); }
function renderHeatmap() { heatmap.innerHTML = state.heatmap.map(item=>`<div class="heat-cell heat-${item.level}">${item.label}</div>`).join(''); }
function renderMistakeLinks() { mistakeLinks.innerHTML = state.mistakeLinks.map(item=>`<div class="mistake-card"><strong>${item.title}</strong><p>${item.text}</p></div>`).join(''); }
function renderTeacherStats() { teacherStats.innerHTML = state.teacherStats.map(s=>`<div class="teacher-stat"><span>${s.label}</span><strong>${s.value}</strong></div>`).join(''); teacherStudentCards.innerHTML = state.students.map(s=>`<div class="student-card"><strong>${s.name}</strong><span>${s.status}</span><p>弱點：${s.weaknessLabel}</p><div class="mini-progress"><div style="width:${s.mastery}%"></div></div></div>`).join(''); }
function renderAssignments() { assignmentList.innerHTML = state.assignment.map(a=>`<li>${escapeHtml(a)}</li>`).join(''); loopInsight.textContent = state.loopInsight||''; }
function renderUnits() { unitCards.innerHTML = state.units.map(u=>`<div class="unit-card"><strong>${u.name}</strong><span>${u.tag}</span><p>${u.progress}</p></div>`).join(''); }
function renderQuestionBank() { questionBank.innerHTML = state.questionBank.map(q=>`<div class="question-card"><strong>${q.type}</strong><p>${q.title}</p></div>`).join(''); }
function updateModeBadges() { chatModeBadge.textContent = state.modes.chat; loopModeBadge.textContent = state.modes.loop; }
function seedPrompt(text) { chatInput.value = text; }

async function sendChatMessage() {
  const text = chatInput.value.trim(); if (!text) return;
  const student = currentStudent();
  state.chat.push({ role:'user', text }); renderChat(); chatInput.value='';
  try {
    const res = await fetch('/api/chat',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message:text, topic:'fractions', mode:'socratic', studentName:student.name, ...getApiPayload() })});
    const data = await res.json(); if (!res.ok) throw new Error(data.error||'Chat request failed');
    state.chat.push({ role:'ai', text:data.reply||'目前沒有回應。' }); state.modes.chat = data.mode === 'live' ? 'Live AI' : 'Demo mode'; updateModeBadges(); renderChat(); saveState();
  } catch {
    state.chat.push({ role:'ai', text:'目前連線失敗，我先用 demo 模式繼續：先說說你最卡的那一步是什麼？' }); state.modes.chat='Demo fallback'; updateModeBadges(); renderChat(); showToast('AI 聊天連線失敗，已切回 demo');
  }
}

function completeQuest(index) {
  if (!state.dailyQuests[index] || state.dailyQuests[index].done) return;
  state.dailyQuests[index].done = true;
  const student = currentStudent();
  student.xp += 90; renderSidebar(); updateHero(); saveState(); showToast('任務完成，XP +90');
}
function simulateStudyWin() { const openQuest = state.dailyQuests.findIndex(q=>!q.done); if (openQuest>=0) completeQuest(openQuest); else { currentStudent().xp += 40; renderSidebar(); updateHero(); saveState(); showToast('小進步也算進度，XP +40'); } }

async function runLearningLoop(silent=false) {
  const output = loopOutput; output.innerHTML=''; renderPipeline();
  const student = currentStudent();
  try {
    const res = await fetch('/api/teacher/lesson-loop',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ topic:'fractions', weakness:student.weaknessLabel, studentName:student.name, grade:state.classroom.grade, ...getApiPayload() })});
    const data = await res.json(); if (!res.ok) throw new Error(data.error||'Loop request failed');
    const lines = data.steps || []; state.assignment = data.assignment || state.assignment; state.loopInsight = data.insight || state.loopInsight; state.teacherSummary = data.teacherSummary || state.teacherSummary; state.modes.loop = data.mode === 'live' ? 'Live AI' : 'Demo mode';
    state.questionBank = (data.assignment||state.assignment).map((title, i)=>({ type: i===0?'診斷題':i===1?'練習題':'變體題', title }));
    updateModeBadges(); renderAssignments(); renderQuestionBank();
    lines.forEach((line,index)=>setTimeout(()=>{ renderPipeline(index); const div=document.createElement('div'); div.className='loop-line'; div.textContent=line; output.appendChild(div); }, index*320));
    saveState(); setTimeout(()=>{ if(!silent) showToast('教學流程已跑完一輪'); }, lines.length*320+50);
  } catch {
    state.modes.loop='Demo fallback'; updateModeBadges();
    const fallback = ['1. 系統根據弱點熱區挑出本輪主題。','2. 自動生成由淺入深題目與情境題。','3. 學生作答後即時批改並標出錯誤模式。','4. 分析真正卡點並整理回教師視圖。','5. 再出變體題並安排 AI 提示式引導。'];
    fallback.forEach((line,index)=>setTimeout(()=>{ renderPipeline(index); const div=document.createElement('div'); div.className='loop-line'; div.textContent=line; output.appendChild(div); }, index*320));
    if(!silent) showToast('AI 流程連線失敗，已切回 demo');
  }
}

function scrollToApp() { document.getElementById('productApp').scrollIntoView({ behavior:'smooth' }); }
function showToast(text) { toast.textContent=text; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),2200); }
function escapeHtml(text) { const div=document.createElement('div'); div.textContent=text; return div.innerHTML; }
