export const demoData = {
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
