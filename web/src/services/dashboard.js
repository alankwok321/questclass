import { firebaseEnabled, getTeacherDashboard } from './firebase.js';

export async function loadDashboardData() {
  if (!firebaseEnabled()) {
    return {
      ok: true,
      mode: 'demo',
      metrics: [
        { key: 'attendance', title: '今日出席率', value: '—', subtitle: 'Firebase 未設定', tone: 'blue' },
        { key: 'grading', title: '待批改作業', value: '—', subtitle: 'Firebase 未設定', tone: 'orange' },
        { key: 'alerts', title: '學習預警', value: '—', subtitle: 'Firebase 未設定', tone: 'red' },
        { key: 'avg', title: '班級平均', value: '—', subtitle: 'Firebase 未設定', tone: 'blue' }
      ],
      detail: { classrooms: [], classroom: null, students: [], submissions: [] }
    };
  }

  const res = await getTeacherDashboard(null);
  if (!res?.ok) return { ok: false, error: res?.error || 'dashboard load failed' };

  const metrics = res.metrics || [];
  const byLabel = (label) => metrics.find(m => m.label === label)?.value;

  const completion = byLabel('班級完成率') || '0%';
  const avgMastery = byLabel('平均掌握度') || '0%';
  const focusCount = byLabel('需關注學生') || '0 人';
  const submissionCount = byLabel('最近提交數') || '0 筆';

  return {
    ok: true,
    mode: 'live',
    metrics: [
      { key: 'completion', title: '班級完成率', value: completion, subtitle: res.classroom?.name || '—', tone: 'green' },
      { key: 'submissions', title: '最近提交', value: submissionCount, subtitle: 'submissions', tone: 'orange' },
      { key: 'focus', title: '需關注學生', value: focusCount, subtitle: 'mastery < 75%', tone: 'red' },
      { key: 'avg', title: '平均掌握度', value: avgMastery, subtitle: 'students', tone: 'blue' }
    ],
    detail: {
      classrooms: res.classrooms || [],
      classroom: res.classroom || null,
      students: res.students || [],
      submissions: res.submissions || []
    }
  };
}
