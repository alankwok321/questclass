import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Users } from 'lucide-react';
import { getMyChildrenOverview } from '../services/firebase.js';
import Avatar from '../components/Avatar.jsx';

const DAY = 24 * 60 * 60 * 1000;

function Tile({ title, value, unit, sub, dot, icon }) {
  return (
    <div className="qcCard" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#6E6E73' }}>
        {dot ? <span style={{ width: 8, height: 8, borderRadius: 999, background: dot }} /> : null}
        {icon}
        {title}
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}{unit ? <span style={{ fontSize: 17, fontWeight: 600 }}> {unit}</span> : null}
      </div>
      {sub ? <div style={{ fontSize: 13, color: '#6E6E73' }}>{sub}</div> : null}
    </div>
  );
}

function statusOf(hw, sub, now) {
  if (sub) {
    const reviewed = sub.status === 'reviewed' || sub.score != null;
    return { text: reviewed ? '已批改' : '已提交', bg: '#E3F5E8', fg: '#1E7B34', done: true };
  }
  if (!hw.dueAt) return { text: '未提交', bg: '#F2F2F5', fg: '#1D1D1F' };
  const diff = new Date(hw.dueAt) - now;
  if (diff < 0) return { text: '已過期', bg: '#FFE5E3', fg: '#B8000F', overdue: true };
  const days = Math.floor(diff / DAY);
  if (days < 2) return { text: days < 1 ? '今天截止' : '明天截止', bg: '#FFE5E3', fg: '#B8000F' };
  return { text: `還有 ${days} 天`, bg: '#F2F2F5', fg: '#1D1D1F' };
}

export default function ParentPage() {
  const [state, setState] = useState({ loading: true, err: '', children: [] });
  const [active, setActive] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await getMyChildrenOverview();
        if (!mounted) return;
        if (!res?.ok) setState({ loading: false, err: res?.error || '載入失敗', children: [] });
        else setState({ loading: false, err: '', children: res.children || [] });
      } catch (e) {
        if (mounted) setState({ loading: false, err: e?.message || '載入失敗', children: [] });
      }
    })();
    return () => { mounted = false; };
  }, []);

  const child = state.children[active] || null;
  const now = useMemo(() => new Date(), []);

  const view = useMemo(() => {
    if (!child) return null;
    const subsByHw = {};
    (child.submissions || []).forEach((s) => { if (s.assignmentId) subsByHw[s.assignmentId] = s; });
    const rows = (child.homework || []).map((hw) => {
      const sub = subsByHw[hw.id];
      return { hw, sub, status: statusOf(hw, sub, now) };
    });
    const pending = rows.filter((r) => !r.status.done && !r.status.overdue);
    const done = rows.filter((r) => r.status.done);
    const scored = (child.submissions || []).map((s) => Number(s.score)).filter((n) => Number.isFinite(n));
    const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
    const feedback = (child.submissions || []).filter((s) => s.feedback).slice(0, 4);
    const dueSoon = pending.filter((r) => r.hw.dueAt && new Date(r.hw.dueAt) - now < 2 * DAY).length;
    return { rows, pending, done, avg, scored, feedback, dueSoon };
  }, [child, now]);

  if (state.loading) return <div className="qcCard qcEmpty">載入中…</div>;
  if (state.err) return <div className="qcCard" style={{ color: '#D70015' }}>{state.err}</div>;

  if (!state.children.length) {
    return (
      <div className="qcCard" style={{ textAlign: 'center', padding: '56px 24px', color: '#6E6E73' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F2F2F5', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: '#86868B' }}>
          <Users size={26} aria-hidden="true" />
        </div>
        <div style={{ fontWeight: 600, fontSize: 17, color: '#1D1D1F', marginBottom: 4 }}>尚未連結子女</div>
        <div style={{ fontSize: 14 }}>請聯絡學校管理員，把你的帳戶連結到子女的帳戶。</div>
      </div>
    );
  }

  const p = child.studentProfile || {};

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ color: '#6E6E73', fontSize: 15 }}>只可查看，不可修改</div>
        {state.children.length > 1 ? (
          <div role="tablist" aria-label="選擇子女" style={{ display: 'inline-flex', padding: 2, borderRadius: 9, background: '#E3E3E8' }}>
            {state.children.map((c, i) => {
              const on = i === active;
              return (
                <button key={c.uid} type="button" role="tab" aria-selected={on} onClick={() => setActive(i)} style={{
                  height: 32, padding: '0 16px', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13, color: '#1D1D1F',
                  fontWeight: on ? 600 : 500, background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar photoURL={c.photoURL} name={c.name} size={20} tint="#248A3D" />{c.name || '子女'}</span></button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600 }}>
            <Avatar photoURL={child.photoURL} name={child.name} size={32} tint="#248A3D" />{child.name}
          </div>
        )}
      </div>

      <div className="qcGrid4">
        <Tile title="待完成" value={view.pending.length} unit="份" dot="#FF3B30" sub={view.dueSoon ? `${view.dueSoon} 份兩天內截止` : '沒有即將截止的作業'} />
        <Tile title="已完成" value={view.done.length} unit="份" />
        <Tile title="平均分" value={view.avg ?? '—'} sub={view.scored.length ? `${view.scored.length} 份已批改作業` : '暫未有成績'} />
        <Tile
          title="連續學習"
          icon={<Flame size={15} color="#FF9500" fill="#FF9500" aria-hidden="true" />}
          value={p.streak ?? '—'}
          unit={p.streak != null ? '天' : ''}
          sub={[p.currentLevel != null ? `Lv ${p.currentLevel}` : '', p.mastery != null ? `掌握度 ${p.mastery}%` : ''].filter(Boolean).join(' · ')}
        />
      </div>

      <div className="qcGrid2">
        <section className="qcCard" aria-labelledby="parent-hw" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 id="parent-hw" className="qcSectionTitle" style={{ marginBottom: 8 }}>作業</h2>
          {view.rows.length ? view.rows.map(({ hw, sub, status }, i) => {
            const score = sub?.score != null && Number.isFinite(Number(sub.score)) ? Number(sub.score) : null;
            const meta = sub?.submittedAt
              ? `提交：${new Date(sub.submittedAt).toLocaleDateString('zh-HK')}`
              : hw.dueAt ? `截止：${new Date(hw.dueAt).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '沒有截止時間';
            return (
              <div key={hw.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: i ? '1px solid #F0F0F3' : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hw.title || '（未命名作業）'}</div>
                  <div style={{ fontSize: 13, color: '#6E6E73' }}>{meta}</div>
                </div>
                <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: status.bg, color: status.fg, flexShrink: 0 }}>{status.text}</span>
                <div style={{ width: 44, textAlign: 'right', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{score ?? ''}</div>
              </div>
            );
          }) : <div className="qcEmpty">暫時沒有指派給 {child.name} 的作業。</div>}
        </section>

        <section className="qcCard" aria-labelledby="parent-fb" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 id="parent-fb" className="qcSectionTitle">老師回饋</h2>
          {view.feedback.length ? view.feedback.map((s) => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.assignmentTitle || '作業'}{s.score != null ? ` · ${s.score} 分` : ''}</div>
              <div style={{ background: '#F5F5F7', borderRadius: 12, padding: '10px 12px', fontSize: 14, lineHeight: 1.55 }}>{s.feedback}</div>
            </div>
          )) : <div className="qcEmpty">老師批改後，回饋會顯示在這裡。</div>}
          {p.weaknessLabel ? <div style={{ marginTop: 'auto', fontSize: 13, color: '#6E6E73' }}>正在加強：{p.weaknessLabel}</div> : null}
        </section>
      </div>
    </div>
  );
}
