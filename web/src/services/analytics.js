// Real class statistics, computed from homework, hand-ins and their marks (no sample data).
// Used by 儀表板 and 學習報告.

const fb = () => window.QuestClassFirebase;
const norm = (v) => String(v || '').trim().toLowerCase();
const time = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : null; };
const round = (n) => Math.round(n);

export const ATTENTION_PCT = 60; // average score below this → 需跟進

export async function loadClasses() {
  const r = await fb()?.listClassrooms?.();
  if (r && !r.ok) throw new Error(r.error || '載入班別失敗');
  return (r?.classrooms || []).map((c) => c.name);
}

export async function loadClassData(cls) {
  const [r, h, s] = await Promise.all([
    fb()?.listStudentsForClassroom?.(cls),
    fb()?.listHomeworkAssignments?.(300),
    fb()?.listClassSubmissions?.(cls),
  ]);
  if (r && !r.ok) throw new Error(r.error || '載入學生失敗');
  return {
    cls,
    students: r?.students || [],
    homework: h?.items || [],
    submissions: s?.submissions || [],
  };
}

// Which students a homework is for, within this class.
function assignedTo(hw, cls, roster) {
  const t = hw.targetType || 'all';
  if (t === 'all') return roster;
  if (t === 'class') return norm(hw.targetClass) === norm(cls) ? roster : [];
  if (t === 'students') {
    const set = new Set(Array.isArray(hw.targetStudentUids) ? hw.targetStudentUids : []);
    return roster.filter((s) => set.has(s.uid));
  }
  return roster;
}

const pctOf = (sub) => (sub && sub.score != null && Number(sub.maxScore) > 0 ? (Number(sub.score) / Number(sub.maxScore)) * 100 : null);

/**
 * @param data   result of loadClassData
 * @param opts   { since: ms timestamp (homework set on/after), now }
 */
export function analyzeClass(data, opts = {}) {
  const now = opts.now ?? Date.now();
  const since = opts.since ?? null;
  const roster = (data.students || []).map((s) => ({ uid: s.uid || s.id, name: s.name || '—', photoURL: s.photoURL || '' }));
  const rosterIds = new Set(roster.map((s) => s.uid));

  const homework = (data.homework || [])
    .filter((a) => a.status === 'published')
    .filter((a) => since == null || (time(a.createdAt) ?? time(a.dueAt) ?? now) >= since)
    .map((a) => ({ ...a, assigned: assignedTo(a, data.cls, roster) }))
    .filter((a) => a.assigned.length)
    .sort((a, b) => (time(a.dueAt) ?? time(a.createdAt) ?? 0) - (time(b.dueAt) ?? time(b.createdAt) ?? 0));
  const hwById = new Map(homework.map((a) => [a.id, a]));

  // Latest hand-in per (homework, student), only for this period's homework and this class's students.
  const subs = new Map();
  for (const s of data.submissions || []) {
    if (!hwById.has(s.assignmentId) || !rosterIds.has(s.studentUid)) continue;
    subs.set(`${s.assignmentId}|${s.studentUid}`, s);
  }
  const subOf = (aId, uid) => subs.get(`${aId}|${uid}`) || null;

  // Topic of each question, from the homework's (answer-free) question list.
  const topicOf = (hw, qId) => {
    const q = (hw.questions || []).find((x, i) => String(x.id ?? i) === String(qId));
    return String(q?.topic || '').trim() || '其他';
  };
  const addTopic = (map, topic, earned, points) => {
    const e = map[topic] || (map[topic] = { topic, earned: 0, points: 0, questions: 0 });
    e.earned += Number(earned) || 0;
    e.points += Number(points) || 0;
    e.questions += 1;
  };

  const classTopics = {};
  const students = roster.map((st) => {
    let assigned = 0; let done = 0; let missing = 0;
    const scores = []; const topics = {}; let last = null;
    const perHomework = [];
    for (const hw of homework) {
      if (!hw.assigned.some((x) => x.uid === st.uid)) continue;
      assigned += 1;
      const sub = subOf(hw.id, st.uid);
      const overdue = (time(hw.dueAt) ?? Infinity) < now;
      if (sub) {
        done += 1;
        const p = pctOf(sub);
        if (p != null) scores.push(p);
        const at = time(sub.submittedAt);
        if (at && (!last || at > last)) last = at;
        for (const r of Array.isArray(sub.results) ? sub.results : []) {
          if (r.pending) continue;
          const tp = topicOf(hw, r.questionId);
          addTopic(topics, tp, r.earned, r.points);
          addTopic(classTopics, tp, r.earned, r.points);
        }
      } else if (overdue) {
        missing += 1;
      }
      perHomework.push({ id: hw.id, title: hw.title || '作業', dueAt: hw.dueAt || null, handedIn: Boolean(sub), pct: pctOf(sub), overdue: !sub && overdue });
    }
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    // Trend: last up to 3 marked homework vs the ones before.
    let trend = null;
    if (scores.length >= 4) {
      const recent = scores.slice(-3); const before = scores.slice(0, -3);
      const d = recent.reduce((a, b) => a + b, 0) / recent.length - before.reduce((a, b) => a + b, 0) / before.length;
      trend = Math.abs(d) < 5 ? 0 : d > 0 ? 1 : -1;
    }
    const topicList = Object.values(topics).filter((t) => t.points > 0)
      .map((t) => ({ ...t, pct: round((t.earned / t.points) * 100) }))
      .sort((a, b) => a.pct - b.pct);
    const weakest = topicList.find((t) => t.questions >= 2 && t.pct < 70) || null;
    const reasons = [];
    if (avg != null && avg < ATTENTION_PCT) reasons.push(`平均 ${round(avg)}%`);
    if (missing) reasons.push(`欠交 ${missing} 份`);
    return {
      ...st, assigned, done, missing, avg: avg == null ? null : round(avg), marked: scores.length,
      trend, lastSubmittedAt: last, topics: topicList, weakest, perHomework,
      needsAttention: reasons.length > 0, reasons,
    };
  });

  const homeworkStats = homework.map((hw) => {
    const handed = hw.assigned.filter((s) => subOf(hw.id, s.uid));
    const marks = handed.map((s) => pctOf(subOf(hw.id, s.uid))).filter((p) => p != null);
    return {
      id: hw.id, title: hw.title || '作業', dueAt: hw.dueAt || null, createdAt: hw.createdAt || null,
      assigned: hw.assigned.length, handedIn: handed.length,
      avg: marks.length ? round(marks.reduce((a, b) => a + b, 0) / marks.length) : null,
      overdue: (time(hw.dueAt) ?? Infinity) < now,
    };
  });

  const totalAssigned = homeworkStats.reduce((t, h) => t + h.assigned, 0);
  const totalHanded = homeworkStats.reduce((t, h) => t + h.handedIn, 0);
  const allMarks = [];
  subs.forEach((s) => { const p = pctOf(s); if (p != null) allMarks.push(p); });
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const recentSubs = [...subs.values()]
    .filter((s) => (time(s.submittedAt) ?? 0) >= weekAgo)
    .sort((a, b) => (time(b.submittedAt) ?? 0) - (time(a.submittedAt) ?? 0));
  const byUid = new Map(students.map((s) => [s.uid, s]));

  return {
    cls: data.cls,
    students: students.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1)),
    homework: homeworkStats,
    topics: Object.values(classTopics).filter((t) => t.points > 0)
      .map((t) => ({ ...t, pct: round((t.earned / t.points) * 100) })).sort((a, b) => a.pct - b.pct),
    completion: totalAssigned ? round((totalHanded / totalAssigned) * 100) : null,
    avg: allMarks.length ? round(allMarks.reduce((a, b) => a + b, 0) / allMarks.length) : null,
    attention: students.filter((s) => s.needsAttention)
      .sort((a, b) => (b.missing - a.missing) || ((a.avg ?? 101) - (b.avg ?? 101))),
    recent: recentSubs.map((s) => ({ ...s, assignmentTitle: s.assignmentTitle || hwById.get(s.assignmentId)?.title || '作業', student: byUid.get(s.studentUid) || null, pct: pctOf(s) })),
    totals: { assigned: totalAssigned, handedIn: totalHanded, homework: homeworkStats.length, students: students.length },
  };
}
