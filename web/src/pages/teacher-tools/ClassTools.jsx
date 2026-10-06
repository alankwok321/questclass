import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, RotateCcw, Shuffle } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { ClassPicker, Segmented, useClassAnalysis } from '../../components/ClassStats.jsx';
import { useCopy } from './ui.jsx';

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

function fullscreen(el) {
  try { (el?.requestFullscreen || el?.webkitRequestFullscreen)?.call(el); } catch { /* not supported */ }
}

// ── 隨機抽學生 ─────────────────────────────────────────────────────────────────
export function RandomPicker() {
  const { classes, cls, setCls, analysis: a, loading } = useClassAnalysis();
  const students = a?.students || [];
  const [left, setLeft] = useState(null); // uids not picked yet this round
  const [shown, setShown] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState([]);
  const box = useRef(null);
  const timer = useRef(null);

  useEffect(() => { setLeft(null); setShown(null); setHistory([]); }, [cls]);
  useEffect(() => () => clearInterval(timer.current), []);

  const pick = () => {
    if (!students.length || rolling) return;
    const pool = (left && left.length ? left : students.map((s) => s.uid));
    const winner = pool[Math.floor(Math.random() * pool.length)];
    setRolling(true);
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      setShown(students[Math.floor(Math.random() * students.length)]);
      if (n >= 14) {
        clearInterval(timer.current);
        const w = students.find((s) => s.uid === winner);
        setShown(w);
        setLeft(pool.filter((u) => u !== winner));
        setHistory((h) => [w, ...h].slice(0, 40));
        setRolling(false);
      }
    }, 70);
  };

  if (!loading && !classes.length) return <div className="qcCard qcEmpty">還沒有班別。</div>;
  const remaining = left == null ? students.length : left.length;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <ClassPicker classes={classes} value={cls} onChange={setCls} />
        <span style={{ fontSize: 13, color: '#6E6E73' }}>每位學生抽中一次後才會再輪到（這一輪還有 {remaining} 人）</span>
        <span style={{ flexGrow: 1 }} />
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => { setLeft(null); setHistory([]); setShown(null); }}><RotateCcw size={14} aria-hidden="true" /> 重新開始</button>
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => fullscreen(box.current)}><Maximize2 size={14} aria-hidden="true" /> 全螢幕</button>
      </div>
      <div ref={box} className="qcCard" style={{ display: 'grid', placeItems: 'center', gap: 18, minHeight: 300, background: '#fff' }}>
        {shown ? (
          <div style={{ display: 'grid', placeItems: 'center', gap: 12 }} aria-live="polite">
            <Avatar photoURL={shown.photoURL} name={shown.name} size={96} />
            <div style={{ fontSize: 'clamp(40px, 8vw, 88px)', fontWeight: 800, letterSpacing: '-0.02em', color: rolling ? '#86868B' : '#1D1D1F' }}>{shown.name}</div>
          </div>
        ) : <div style={{ fontSize: 18, color: '#86868B' }}>{loading ? '載入中…' : students.length ? '按下面的按鈕抽一位學生' : '這個班別還沒有學生'}</div>}
        <button type="button" className="qcBtn qcBtnPrimary" onClick={pick} disabled={rolling || !students.length} style={{ height: 48, padding: '0 28px', fontSize: 17 }}>
          <Shuffle size={18} aria-hidden="true" /> {rolling ? '抽選中…' : '抽一位'}
        </button>
      </div>
      {history.length ? (
        <div className="qcCard" style={{ fontSize: 14, color: '#3A3A3C' }}><b>已抽：</b>{history.map((s) => s.name).join('、')}</div>
      ) : null}
    </div>
  );
}

// ── 分組 ───────────────────────────────────────────────────────────────────────
export function makeGroups(students, { by = 'size', n = 4, mode = 'random' } = {}) {
  const list = students.length;
  if (!list) return [];
  const count = by === 'size' ? Math.max(1, Math.ceil(list / Math.max(1, n))) : Math.max(1, Math.min(list, n));
  const sorted = [...students].sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1));
  const groups = Array.from({ length: count }, () => []);
  if (mode === 'mixed') {
    // Snake order: strongest and weakest spread across every group.
    sorted.forEach((s, i) => {
      const round = Math.floor(i / count);
      const pos = i % count;
      groups[round % 2 === 0 ? pos : count - 1 - pos].push(s);
    });
  } else if (mode === 'similar') {
    const size = Math.ceil(list / count);
    sorted.forEach((s, i) => groups[Math.min(count - 1, Math.floor(i / size))].push(s));
  } else {
    shuffle(students).forEach((s, i) => groups[i % count].push(s));
  }
  return groups.filter((g) => g.length);
}

export function GroupMaker() {
  const { classes, cls, setCls, analysis: a, loading } = useClassAnalysis();
  const students = a?.students || [];
  const [by, setBy] = useState('size');
  const [n, setN] = useState(4);
  const [mode, setMode] = useState('random');
  const [absent, setAbsent] = useState([]);
  const [groups, setGroups] = useState([]);
  const copy = useCopy();

  useEffect(() => { setGroups([]); setAbsent([]); }, [cls]);
  const present = students.filter((s) => !absent.includes(s.uid));
  const make = () => setGroups(makeGroups(present, { by, n: Number(n) || 1, mode }));
  const text = groups.map((g, i) => `第 ${i + 1} 組：${g.map((s) => s.name).join('、')}`).join('\n');
  const marked = students.some((s) => s.avg != null);

  if (!loading && !classes.length) return <div className="qcCard qcEmpty">還沒有班別。</div>;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <ClassPicker classes={classes} value={cls} onChange={setCls} />
          <Segmented label="分組方式" value={by} onChange={setBy} options={[['size', '每組人數'], ['count', '組數']]} />
          <input type="number" min={1} max={40} value={n} onChange={(e) => setN(e.target.value)} aria-label={by === 'size' ? '每組人數' : '組數'}
            style={{ width: 70, height: 34, borderRadius: 9, border: '1px solid #D2D2D7', padding: '0 8px', fontSize: 15 }} />
          <Segmented label="分組原則" value={mode} onChange={setMode} options={[['random', '隨機'], ['mixed', '能力混合'], ['similar', '能力相近']]} />
        </div>
        {mode !== 'random' && !marked ? <div style={{ fontSize: 12, color: '#B25000' }}>還沒有已批改的作業，按能力分組會等同隨機。</div> : null}
        {students.length ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3C', marginBottom: 6 }}>今天缺席（按一下剔除）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {students.map((s) => {
                const off = absent.includes(s.uid);
                return (
                  <button key={s.uid} type="button" aria-pressed={off} onClick={() => setAbsent((x) => (off ? x.filter((u) => u !== s.uid) : [...x, s.uid]))}
                    style={{ border: '1px solid #D2D2D7', borderRadius: 999, padding: '4px 10px', fontSize: 13, cursor: 'pointer', background: off ? '#F2F2F5' : '#fff', color: off ? '#86868B' : '#1D1D1F', textDecoration: off ? 'line-through' : 'none' }}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="qcBtn qcBtnPrimary" onClick={make} disabled={!present.length}><Shuffle size={15} aria-hidden="true" /> {groups.length ? '重新分組' : `分組（${present.length} 人）`}</button>
          {groups.length ? <button type="button" className="qcBtn qcBtnSecondary" onClick={() => copy(text)}>複製名單</button> : null}
        </div>
      </div>
      {groups.length ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {groups.map((g, i) => (
            <div key={i} className="qcCard" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
              <div style={{ fontWeight: 700 }}>第 {i + 1} 組 <span style={{ color: '#6E6E73', fontWeight: 500, fontSize: 13 }}>· {g.length} 人</span></div>
              {g.map((s) => (
                <div key={s.uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar photoURL={s.photoURL} name={s.name} size={26} />
                  <span style={{ fontSize: 14 }}>{s.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── 課堂計時器 ─────────────────────────────────────────────────────────────────
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* no audio */ }
}

export function ClassTimer() {
  const [total, setTotal] = useState(300);
  const [left, setLeft] = useState(300);
  const [running, setRunning] = useState(false);
  const [custom, setCustom] = useState('');
  const box = useRef(null);
  const end = useRef(0);

  useEffect(() => {
    if (!running) return undefined;
    end.current = Date.now() + left * 1000;
    const id = setInterval(() => {
      const s = Math.max(0, Math.round((end.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { setRunning(false); beep(); }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const setTo = (sec) => { setRunning(false); setTotal(sec); setLeft(sec); };
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const pct = total ? left / total : 0;
  const color = left === 0 ? '#B8000F' : pct < 0.2 ? '#B25000' : '#1D1D1F';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {[1, 2, 3, 5, 10, 15, 20].map((m) => (
          <button key={m} type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => setTo(m * 60)}>{m} 分鐘</button>
        ))}
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="自訂分鐘" inputMode="decimal" aria-label="自訂分鐘"
          onKeyDown={(e) => { if (e.key === 'Enter' && Number(custom) > 0) setTo(Math.round(Number(custom) * 60)); }}
          style={{ width: 100, height: 32, borderRadius: 9, border: '1px solid #D2D2D7', padding: '0 8px', fontSize: 14 }} />
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => Number(custom) > 0 && setTo(Math.round(Number(custom) * 60))}>設定</button>
        <span style={{ flexGrow: 1 }} />
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => fullscreen(box.current)}><Maximize2 size={14} aria-hidden="true" /> 全螢幕</button>
      </div>
      <div ref={box} className="qcCard" style={{ display: 'grid', placeItems: 'center', gap: 20, minHeight: 320, background: '#fff' }}>
        <div aria-live="off" style={{ fontSize: 'clamp(72px, 18vw, 200px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', color, lineHeight: 1 }}>{mm}:{ss}</div>
        <div style={{ width: 'min(520px, 90%)', height: 8, borderRadius: 999, background: '#E8E8ED' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 999, background: color === '#1D1D1F' ? '#0071E3' : color, transition: 'width .25s linear' }} />
        </div>
        {left === 0 ? <div style={{ fontSize: 22, fontWeight: 700, color: '#B8000F' }}>時間到！</div> : null}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="qcBtn qcBtnPrimary" style={{ height: 46, padding: '0 24px', fontSize: 16 }} onClick={() => (left === 0 ? (setLeft(total), setRunning(true)) : setRunning((r) => !r))}>
            {running ? <><Pause size={17} aria-hidden="true" /> 暫停</> : <><Play size={17} aria-hidden="true" /> 開始</>}
          </button>
          <button type="button" className="qcBtn qcBtnSecondary" style={{ height: 46, padding: '0 20px' }} onClick={() => setTo(total)}><RotateCcw size={16} aria-hidden="true" /> 重設</button>
        </div>
      </div>
    </div>
  );
}
