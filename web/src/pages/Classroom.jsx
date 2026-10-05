import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, Plus, Search, UserMinus, UserPlus, Users } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';

// 班級管理: classes of the school (a teacher limited to some classes sees only those),
// each with its students and homework progress. Admins can move students between classes.
const fb = () => window.QuestClassFirebase;
const sortClasses = (list) => [...list].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
const norm = (v) => String(v || '').trim().toLowerCase();

export default function ClassroomPage({ user }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [classes, setClasses] = useState([]);
  const [extraClasses, setExtraClasses] = useState([]); // new, still empty classes
  const [allStudents, setAllStudents] = useState([]); // admins: every student of the school
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('students');

  const [roster, setRoster] = useState([]);
  const [homework, setHomework] = useState([]);
  const [subs, setSubs] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newClass, setNewClass] = useState('');
  const [busy, setBusy] = useState('');

  const loadClasses = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const [c, s] = await Promise.all([fb()?.listClassrooms?.(), isAdmin ? fb()?.listStudents?.(1000) : null]);
      if (c && !c.ok) throw new Error(c.error || '載入班別失敗');
      const names = (c?.classrooms || []).map((x) => x.name);
      setClasses(names);
      if (s?.ok) setAllStudents(s.students || []);
      setSelected((cur) => cur || names[0] || '');
    } catch (e) {
      setErr(e.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const loadDetail = useCallback(async (cls) => {
    if (!cls) { setRoster([]); setHomework([]); setSubs([]); return; }
    setDetailLoading(true);
    try {
      const [r, h, sub] = await Promise.all([
        fb()?.listStudentsForClassroom?.(cls),
        fb()?.listHomeworkAssignments?.(200),
        fb()?.listClassSubmissions?.(cls),
      ]);
      setRoster(r?.ok ? (r.students || []) : []);
      setHomework((h?.items || []).filter((a) => a.status !== 'archived'
        && ((a.targetType === 'class' && norm(a.targetClass) === norm(cls)) || (a.targetType || 'all') === 'all')));
      setSubs(sub?.ok ? (sub.submissions || []) : []);
      if (r && !r.ok) toast.show(r.error || '載入學生失敗');
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadDetail(selected); }, [selected, loadDetail]);

  const allClasses = useMemo(() => sortClasses([...new Set([...classes, ...extraClasses])]), [classes, extraClasses]);
  const countOf = (c) => (isAdmin ? allStudents.filter((s) => norm(s.class) === norm(c)).length : (c === selected ? roster.length : null));

  // Per student: average % over their marked hand-ins in this class.
  const statsByStudent = useMemo(() => {
    const m = {};
    for (const s of subs) {
      if (s.score == null || !s.maxScore) continue;
      const e = (m[s.studentUid] = m[s.studentUid] || { pct: 0, n: 0 });
      e.pct += (Number(s.score) / Number(s.maxScore)) * 100;
      e.n += 1;
    }
    return m;
  }, [subs]);

  const homeworkStats = useMemo(() => homework.map((a) => {
    const forIt = subs.filter((s) => s.assignmentId === a.id);
    const marked = forIt.filter((s) => s.score != null && s.maxScore);
    const avg = marked.length ? Math.round(marked.reduce((t, s) => t + (Number(s.score) / Number(s.maxScore)) * 100, 0) / marked.length) : null;
    return { ...a, handedIn: new Set(forIt.map((s) => s.studentUid)).size, avg };
  }), [homework, subs]);

  const classAvg = useMemo(() => {
    const vals = Object.values(statsByStudent).map((e) => e.pct / e.n);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [statsByStudent]);
  const completion = useMemo(() => {
    if (!roster.length || !homework.length) return null;
    const handed = homeworkStats.reduce((t, a) => t + Math.min(a.handedIn, roster.length), 0);
    return Math.round((handed / (roster.length * homework.length)) * 100);
  }, [roster, homework, homeworkStats]);

  const moveStudents = async (uids, cls) => {
    setBusy('move');
    try {
      for (const uid of uids) {
        const r = await fb()?.adminSetStudentClass?.(uid, cls);
        if (!r?.ok) throw new Error(r?.error || '更新失敗');
      }
      toast.show(cls ? `已把 ${uids.length} 位學生加入 ${cls}` : '已移出班別');
      await loadClasses();
      await loadDetail(selected);
    } catch (e) {
      toast.show(e.message || '更新失敗');
    } finally {
      setBusy('');
    }
  };

  const onRemove = async (s) => {
    if (!await confirm(`把 ${s.name || '這位學生'} 移出 ${selected}？`, { confirmText: '移出', danger: true })) return;
    moveStudents([s.uid], '');
  };

  const onCreateClass = (e) => {
    e.preventDefault();
    const c = newClass.trim().slice(0, 40);
    if (!c) return;
    if (!allClasses.some((x) => norm(x) === norm(c))) setExtraClasses((l) => [...l, c]);
    setSelected(allClasses.find((x) => norm(x) === norm(c)) || c);
    setNewClass('');
    setAdding(true);
  };

  if (loading) return <div className="qcCard qcEmpty">載入中…</div>;
  if (err) return <div className="qcCard" style={{ color: '#D70015', fontWeight: 600 }}>{err}</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }} className="qcClassLayout">
      {/* Class list */}
      <div className="qcCard" style={{ padding: 12, display: 'grid', gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#6E6E73', padding: '4px 6px' }}>班別</div>
        {allClasses.length === 0 ? <div style={{ fontSize: 13, color: '#86868B', padding: 6 }}>{isAdmin ? '尚未有班別，請在下面新增。' : '你未被分配任何班別。'}</div> : null}
        {allClasses.map((c) => {
          const on = c === selected;
          const n = countOf(c);
          return (
            <button key={c} type="button" onClick={() => { setSelected(c); setAdding(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: 0, borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              background: on ? '#0071E3' : 'transparent', color: on ? '#fff' : '#1D1D1F',
            }}>
              <Users size={16} aria-hidden="true" style={{ opacity: 0.8 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{c}</span>
              {n != null ? <span style={{ fontSize: 12, opacity: 0.8 }}>{n} 人</span> : null}
            </button>
          );
        })}
        {isAdmin ? (
          <form onSubmit={onCreateClass} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="新增班別，例如 5B" maxLength={40}
              aria-label="新增班別" style={{ ...inputStyle, padding: '8px 10px', fontSize: 13 }} />
            <button type="submit" className="qcBtn qcBtnSecondary qcBtnSmall" aria-label="新增班別" disabled={!newClass.trim()}><Plus size={14} /></button>
          </form>
        ) : null}
      </div>

      {/* Class detail */}
      {!selected ? (
        <div className="qcCard qcEmpty">選擇左邊的班別</div>
      ) : (
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <div className="qcCard" style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <h2 className="qcSectionTitle" style={{ fontSize: 26 }}>{selected}</h2>
              {isAdmin ? (
                <button type="button" className="qcBtn qcBtnPrimary qcBtnSmall" onClick={() => setAdding((v) => !v)}>
                  <UserPlus size={14} aria-hidden="true" />{adding ? '完成' : '加入學生'}
                </button>
              ) : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              <Stat label="學生" value={detailLoading ? '…' : roster.length} />
              <Stat label="作業" value={detailLoading ? '…' : homework.length} />
              <Stat label="完成率" value={completion == null ? '—' : `${completion}%`} />
              <Stat label="平均分" value={classAvg == null ? '—' : `${classAvg}%`} tone={classAvg != null && classAvg < 50 ? 'bad' : undefined} />
            </div>
          </div>

          {adding && isAdmin ? (
            <AddStudents
              cls={selected}
              students={allStudents.filter((s) => norm(s.class) !== norm(selected))}
              busy={busy === 'move'}
              onAdd={(uids) => moveStudents(uids, selected)}
            />
          ) : null}

          <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
            <div role="tablist" aria-label="班級內容" style={{ display: 'inline-flex', padding: 2, borderRadius: 9, background: '#E3E3E8', justifySelf: 'start' }}>
              {[['students', `學生 ${roster.length}`], ['homework', `作業 ${homework.length}`]].map(([k, text]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{
                  height: 32, padding: '0 16px', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13,
                  fontWeight: tab === k ? 600 : 500, background: tab === k ? '#FFFFFF' : 'transparent', boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                }}>{text}</button>
              ))}
            </div>

            {detailLoading ? <div className="qcEmpty">載入中…</div> : tab === 'students' ? (
              roster.length === 0 ? (
                <div className="qcEmpty">{isAdmin ? '這個班別還沒有學生，按「加入學生」把學生加進來。' : '這個班別還沒有學生。'}</div>
              ) : (
                <div style={{ display: 'grid' }}>
                  {roster.map((s) => {
                    const p = s.studentProfile || {};
                    const st = statsByStudent[s.uid];
                    const avg = st ? Math.round(st.pct / st.n) : null;
                    return (
                      <div key={s.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderTop: '1px solid #F0F0F3', flexWrap: 'wrap' }}>
                        <Avatar photoURL={s.photoURL} name={s.name} size={36} />
                        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || '—'}</div>
                          <div style={{ fontSize: 12, color: '#6E6E73' }}>
                            {p.currentLevel ?? p.level ? `Lv ${p.currentLevel ?? p.level}` : 'Lv —'}
                            {p.mastery != null ? ` · 掌握度 ${p.mastery}%` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6E6E73', minWidth: 54 }}>
                          <Flame size={14} color="#FF9500" aria-hidden="true" />{p.streak ?? 0} 天
                        </div>
                        <div style={{ minWidth: 72, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 17, color: avg != null && avg < 50 ? '#D70015' : '#1D1D1F' }}>{avg == null ? '—' : `${avg}%`}</div>
                          <div style={{ fontSize: 11, color: '#86868B' }}>{st ? `${st.n} 份作業` : '未有成績'}</div>
                        </div>
                        {isAdmin ? (
                          <button type="button" className="qcLink" aria-label={`把 ${s.name} 移出班別`} title="移出班別" onClick={() => onRemove(s)} disabled={!!busy}
                            style={{ color: '#D70015', padding: 6 }}><UserMinus size={16} /></button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              homeworkStats.length === 0 ? <div className="qcEmpty">還沒有給這個班別的作業。</div> : (
                <div style={{ display: 'grid' }}>
                  {homeworkStats.map((a) => {
                    const pct = roster.length ? Math.round((Math.min(a.handedIn, roster.length) / roster.length) * 100) : 0;
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px', borderTop: '1px solid #F0F0F3', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || '（未命名作業）'}</div>
                          <div style={{ fontSize: 12, color: '#6E6E73' }}>
                            {a.targetType === 'class' ? '本班' : '全校'}
                            {a.status === 'draft' ? ' · 草稿' : ''}
                            {a.dueAt ? ` · 截止 ${new Date(a.dueAt).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                          </div>
                        </div>
                        <div style={{ width: 140 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6E6E73', marginBottom: 4 }}>
                            <span>已交</span><span>{Math.min(a.handedIn, roster.length)} / {roster.length}</span>
                          </div>
                          <div className="qcProgress"><span style={{ width: `${pct}%` }} /></div>
                        </div>
                        <div style={{ minWidth: 64, textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: 17 }}>{a.avg == null ? '—' : `${a.avg}%`}</div>
                          <div style={{ fontSize: 11, color: '#86868B' }}>平均分</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, background: '#F5F5F7' }}>
      <div style={{ fontSize: 12, color: '#6E6E73', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: tone === 'bad' ? '#D70015' : '#1D1D1F', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// Admin: pick students (from no class or other classes) to add to this class.
function AddStudents({ cls, students, busy, onAdd }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const list = students
    .filter((s) => { const t = q.trim().toLowerCase(); return !t || String(s.name || '').toLowerCase().includes(t) || String(s.email || '').toLowerCase().includes(t); })
    .sort((a, b) => (a.class ? 1 : 0) - (b.class ? 1 : 0) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="qcCard" style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700 }}>加入學生到 {cls}</div>
      <div style={{ position: 'relative' }}>
        <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#86868B' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋學生姓名或電郵" aria-label="搜尋學生" style={{ ...inputStyle, paddingLeft: 36 }} />
      </div>
      <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #E8E8ED', borderRadius: 12 }}>
        {list.length === 0 ? <div style={{ padding: 12, fontSize: 13, color: '#86868B' }}>沒有其他學生</div> : list.map((s) => {
          const id = s.uid || s.id;
          const on = picked.includes(id);
          return (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F0F0F3', cursor: 'pointer', background: on ? 'rgba(0,113,227,0.06)' : 'transparent' }}>
              <input type="checkbox" checked={on} onChange={() => toggle(id)} />
              <Avatar photoURL={s.photoURL} name={s.name} size={26} />
              <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || s.email}</span>
              <span style={{ fontSize: 12, color: s.class ? '#B25000' : '#86868B' }}>{s.class ? `目前在 ${s.class}` : '未分班'}</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="qcBtn qcBtnPrimary" disabled={!picked.length || busy} onClick={() => { onAdd(picked); setPicked([]); }}>
          {busy ? '加入中…' : `加入 ${picked.length || ''} 位學生`}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #D2D2D7', background: '#FFFFFF', outline: 'none', fontSize: 14, fontWeight: 500,
};
