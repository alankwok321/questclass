import { demoData } from './data.js';

const STORAGE_KEY = 'questclass_clean_state_v1';
const SETTINGS_KEY = 'questclass_settings_v1';

const defaultState = {
  session: {
    role: 'teacher',
    authMode: 'demo',
    userName: 'Alan Teacher',
    email: 'teacher@questclass.app'
  },
  currentClassroomId: demoData.classrooms[0].id,
  currentStudentId: demoData.students[0].id,
  chat: demoData.defaultChat,
  assignment: ['比較 3/4 與 2/3', '把生活題翻成數學式', '用圖像解釋通分'],
  insight: 'Ada 適合先補語意轉換，再回到應用題。',
  teacherSummary: ['本輪建議以 12 分鐘微任務進行', '先用圖像，再進文字題', '下一輪追蹤提示後正確率'],
  loopSteps: [],
  modes: { chat: 'Demo mode', loop: 'Demo mode' }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, patch) {
  const output = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = merge(base[key] || {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? merge(clone(defaultState), saved) : clone(defaultState);
  } catch {
    return clone(defaultState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY);
}

export function currentStudent(state) {
  return demoData.students.find((student) => student.id === state.currentStudentId) || demoData.students[0];
}

export function currentClassroom(state) {
  return demoData.classrooms.find((classroom) => classroom.id === state.currentClassroomId) || demoData.classrooms[0];
}
