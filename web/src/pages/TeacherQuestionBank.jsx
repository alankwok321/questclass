import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listQuestionBank, upsertQuestionBankItem } from '../services/firebase.js';
import { getIdToken } from '../services/firebase.js';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';

const SUPPORTED_TYPES = ['TRUE_FALSE','MULTIPLE_CHOICE','FILL_IN_BLANK','MATCHING','SHORT_ANSWER','LONG_ANSWER'];
const GRADES = ['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4','S5','S6'];

function typeLabel(t) {
  const m = { TRUE_FALSE:'是非題', MULTIPLE_CHOICE:'選擇題', FILL_IN_BLANK:'填空題', MATCHING:'配對題', SHORT_ANSWER:'簡答題', LONG_ANSWER:'申論題' };
  return m[String(t||'').toUpperCase()] || String(t||'—');
}

function parseBlanks(text, existing = []) {
  const matches = [...String(text||'').matchAll(/\[____\]/g)];
  return matches.map((_, i) => existing[i] || { position: i + 1, accepted: [''] });
}

function stripUndef(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndef);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndef(v)])
    );
  }
  return obj;
}

// ── Styles (matching TeacherHomeworkPage) ─────────────────────────────────────
const btnPrimary = {
  border: 0, background: '#007AFF', color: '#fff',
  padding: '10px 18px', borderRadius: 999, fontWeight: 900, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnGhost = {
  border: '1px solid rgba(17,24,39,0.10)', background: '#F2F2F7', color: '#111827',
  padding: '10px 18px', borderRadius: 999, fontWeight: 900, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnDanger = {
  border: '1px solid rgba(255,59,48,0.20)', background: 'rgba(255,59,48,0.06)', color: '#FF3B30',
  padding: '10px 18px', borderRadius: 999, fontWeight: 900, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const inputStyle = {
  width: '100%', padding: '10px 14px',
  border: '1px solid rgba(17,24,39,0.10)', borderRadius: 14,
  fontSize: 14, fontWeight: 700, outline: 'none',
  background: '#F2F2F7', fontFamily: 'inherit', color: '#111827',
  boxSizing: 'border-box',
};
const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 13, fontWeight: 800, color: '#6B7280',
};

const EMPTY_ITEM = {
  type: 'MULTIPLE_CHOICE', topic: '', points: 1, target_level: '',
  question_text: '', correct_answer: null,
  options: [
    { id: 'A', text: '', is_correct: false },
    { id: 'B', text: '', is_correct: false },
    { id: 'C', text: '', is_correct: false },
    { id: 'D', text: '', is_correct: false },
  ],
  blanks: [], pairs: [], ideal_answer: '', grading_rubric: '', max_word_count: 0,
};

// ── Question Edit Form ─────────────────────────────────────────────────────────
function QuestionEditForm({ item, onChange }) {
  const ty = String(item.type || '').toUpperCase();

  function field(label, content) {
    return (
      <label style={labelStyle}>
        {label}
        {content}
      </label>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Type + Grade + Points row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        {field('題型',
          <select value={item.type} style={inputStyle}
            onChange={e => {
              const next = { ...item, type: e.target.value };
              if (e.target.value === 'FILL_IN_BLANK') next.blanks = parseBlanks(item.question_text, item.blanks);
              onChange(next);
            }}>
            {SUPPORTED_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        )}
        {field('年級',
          <select value={item.target_level || ''} style={inputStyle}
            onChange={e => onChange({ ...item, target_level: e.target.value })}>
            <option value="">—</option>
            {GRADES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {field('分數',
          <input type="number" value={item.points ?? 1} style={inputStyle}
            onChange={e => onChange({ ...item, points: Number(e.target.value) })} />
        )}
      </div>

      {field('主題',
        <input value={item.topic || ''} style={inputStyle} placeholder="例如：分數、光合作用…"
          onChange={e => onChange({ ...item, topic: e.target.value })} />
      )}

      {field('題目文字',
        <textarea
          value={item.question_text || ''}
          style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
          placeholder="輸入題目內容…"
          onChange={e => {
            const next = { ...item, question_text: e.target.value };
            if (ty === 'FILL_IN_BLANK') next.blanks = parseBlanks(e.target.value, item.blanks);
            onChange(next);
          }}
        />
      )}

      {/* TRUE_FALSE */}
      {ty === 'TRUE_FALSE' && (
        <label style={labelStyle}>
          正確答案
          <div style={{ display: 'flex', gap: 10 }}>
            {[true, false].map(v => (
              <button key={String(v)} type="button"
                style={item.correct_answer === v ? btnPrimary : btnGhost}
                onClick={() => onChange({ ...item, correct_answer: v })}>
                {v ? '正確 (True)' : '錯誤 (False)'}
              </button>
            ))}
          </div>
        </label>
      )}

      {/* MULTIPLE_CHOICE */}
      {ty === 'MULTIPLE_CHOICE' && (
        <label style={labelStyle}>
          選項（點擊 ✔ 標記正確答案）
          <div style={{ display: 'grid', gap: 8 }}>
            {(item.options || []).map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                <button type="button"
                  style={{ ...( opt.is_correct ? btnPrimary : btnGhost ), padding: '8px 12px', flexShrink: 0 }}
                  onClick={() => {
                    const opts = [...(item.options||[])];
                    opts[i] = { ...opts[i], is_correct: !opts[i].is_correct };
                    onChange({ ...item, options: opts });
                  }}>✔</button>
                <div style={{ fontWeight: 900, width: 20, flexShrink: 0, color: '#6B7280' }}>
                  {opt.id || String.fromCharCode(65 + i)}
                </div>
                <input value={opt.text || ''} style={{ ...inputStyle, flex: 1 }}
                  placeholder={`選項 ${opt.id || String.fromCharCode(65 + i)}`}
                  onChange={e => {
                    const opts = [...(item.options||[])];
                    opts[i] = { ...opts[i], text: e.target.value };
                    onChange({ ...item, options: opts });
                  }} />
                <button type="button" style={{ ...btnGhost, padding: '8px 12px', color: '#FF3B30', flexShrink: 0 }}
                  onClick={() => onChange({ ...item, options: (item.options||[]).filter((_, j) => j !== i) })}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" style={btnGhost}
              onClick={() => {
                const opts = [...(item.options||[])];
                opts.push({ id: String.fromCharCode(65 + opts.length), text: '', is_correct: false });
                onChange({ ...item, options: opts });
              }}>＋ 新增選項</button>
          </div>
        </label>
      )}

      {/* FILL_IN_BLANK */}
      {ty === 'FILL_IN_BLANK' && (item.blanks||[]).length > 0 && (
        <label style={labelStyle}>
          填空答案（在題目文字中用 [____] 標記空格）
          <div style={{ display: 'grid', gap: 8 }}>
            {(item.blanks || []).map((blank, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontWeight: 900, color: '#6B7280', width: 60, flexShrink: 0 }}>
                  空格 {blank.position || i + 1}
                </span>
                <input
                  value={(Array.isArray(blank.accepted) && blank.accepted[0]) || ''}
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="接受的答案"
                  onChange={e => {
                    const blanks = [...(item.blanks||[])];
                    blanks[i] = { ...blanks[i], accepted: [e.target.value] };
                    onChange({ ...item, blanks });
                  }} />
              </div>
            ))}
          </div>
        </label>
      )}

      {/* MATCHING */}
      {ty === 'MATCHING' && (
        <label style={labelStyle}>
          配對（左欄提示 → 右欄答案）
          <div style={{ display: 'grid', gap: 8 }}>
            {(item.pairs || []).map((pair, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 8 }}>
                <input value={pair.prompt || ''} style={inputStyle} placeholder="提示"
                  onChange={e => {
                    const pairs = [...(item.pairs||[])];
                    pairs[i] = { ...pairs[i], prompt: e.target.value };
                    onChange({ ...item, pairs });
                  }} />
                <input value={pair.match || ''} style={inputStyle} placeholder="配對答案"
                  onChange={e => {
                    const pairs = [...(item.pairs||[])];
                    pairs[i] = { ...pairs[i], match: e.target.value };
                    onChange({ ...item, pairs });
                  }} />
                <button type="button" style={{ ...btnGhost, padding: '8px 12px', color: '#FF3B30' }}
                  onClick={() => onChange({ ...item, pairs: (item.pairs||[]).filter((_, j) => j !== i) })}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" style={btnGhost}
              onClick={() => onChange({ ...item, pairs: [...(item.pairs||[]), { prompt: '', match: '' }] })}>
              ＋ 新增配對
            </button>
          </div>
        </label>
      )}

      {/* SHORT_ANSWER */}
      {ty === 'SHORT_ANSWER' && field('理想答案',
        <input value={item.ideal_answer || ''} style={inputStyle} placeholder="參考答案"
          onChange={e => onChange({ ...item, ideal_answer: e.target.value })} />
      )}

      {/* LONG_ANSWER */}
      {ty === 'LONG_ANSWER' && field('評分標準',
        <textarea value={item.grading_rubric || ''} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          placeholder="描述評分標準…"
          onChange={e => onChange({ ...item, grading_rubric: e.target.value })} />
      )}
    </div>
  );
}

// ── AI Generate Modal (unified: settings → review/edit → save) ────────────────
const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, backdropFilter: 'blur(4px)',
};

function AiModal({ onClose, onSave }) {
  // Step 1 – settings
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [level, setLevel] = useState('S1');
  const [types, setTypes] = useState({
    MULTIPLE_CHOICE: true, TRUE_FALSE: true, SHORT_ANSWER: true,
    FILL_IN_BLANK: false, MATCHING: false, LONG_ANSWER: false,
  });

  // Step 2 – review & edit
  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [checked, setChecked] = useState({});
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const selectedTypes = Object.entries(types).filter(([, v]) => v).map(([k]) => k);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  async function generate() {
    if (!selectedTypes.length) return alert('請至少選擇一種題型');
    setGenerating(true);
    try {
      const token = await getIdToken();
      if (!token) { alert('請先登入才能使用 AI 功能'); return; }
      const typesStr = selectedTypes.join('、');
      const system = [
        '你是老師助教。請產出「題庫題目」JSON，輸出必須是純 JSON，不要 markdown。',
        `只能使用以下題型：${typesStr}`,
        `依照香港學制（HK）調整難度，target_level: ${level}`,
        '輸出格式示例：{"questions":[',
        '{"type":"MULTIPLE_CHOICE","question_text":"題目","topic":"主題","target_level":"S1","points":1,"options":[{"id":"A","text":"A選項","is_correct":true},{"id":"B","text":"B選項","is_correct":false}]},',
        '{"type":"TRUE_FALSE","question_text":"陳述句","correct_answer":true,"points":1},',
        '{"type":"SHORT_ANSWER","question_text":"問題","ideal_answer":"答案","points":2},',
        '{"type":"FILL_IN_BLANK","question_text":"句子[____]填空","blanks":[{"position":1,"accepted":["答案"]}],"points":1},',
        '{"type":"MATCHING","question_text":"配對","pairs":[{"prompt":"A","match":"1"}],"points":2},',
        '{"type":"LONG_ANSWER","question_text":"申論題","grading_rubric":"評分標準","points":4}',
        `]}\n請產出 ${count} 題，混合使用以下題型：${typesStr}。`,
      ].join('\n');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: token, topic: 'teacher-question-bank', mode: 'generate',
          format: 'json', studentName: 'teacher',
          message: `主題：${topic || '（不限）'}\n年級：${level}\n題數：${count}\n題型：${typesStr}`,
          system,
        }),
      });
      const data = await res.json();
      const text = data.content || data.message || JSON.stringify(data);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI 回應中找不到 JSON 格式');
      const parsed = JSON.parse(match[0]);
      const qs = (parsed.questions || []).map(q => stripUndef({ ...q }));
      if (!qs.length) throw new Error('未產生任何題目');
      setCandidates(qs);
      setChecked(Object.fromEntries(qs.map((_, i) => [i, true])));
      setActiveIdx(0);
      setStep(2);
    } catch (e) {
      alert('AI 產生失敗：' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveSelected() {
    const chosen = candidates.map((q, i) => ({ q, i })).filter(({ i }) => checked[i]);
    if (!chosen.length) return alert('請至少選一題');
    setSaving(true);
    let ok = 0;
    const errors = [];
    for (const { q } of chosen) {
      const res = await upsertQuestionBankItem({ ...stripUndef(q) });
      if (res?.ok) ok++;
      else errors.push(res?.error || '未知錯誤');
    }
    setSaving(false);
    if (errors.length) {
      alert(`已新增 ${ok} 題，失敗 ${errors.length} 題。\n原因：${[...new Set(errors)].join('、')}`);
    }
    if (ok > 0) {
      onSave();
      onClose();
    }
  }

  return (
    <div style={OVERLAY}>
      <div style={{
        background: '#F9FAFB', borderRadius: 28,
        width: step === 1 ? 500 : 980, maxWidth: '96vw', maxHeight: '92vh',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        border: '1px solid rgba(17,24,39,0.08)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 22px', background: '#fff',
          borderBottom: '1px solid rgba(17,24,39,0.08)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#111827' }}>✨ AI 產生題目</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginTop: 2 }}>
              {step === 1 ? '設定題目條件' : `已產生 ${candidates.length} 題，可編輯後加入題庫`}
            </div>
          </div>
          <button onClick={onClose} style={{ ...btnGhost, padding: '6px 12px', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {step === 1 ? (
          /* ── Step 1: Settings ── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'grid', gap: 18 }}>
              <label style={labelStyle}>
                主題 / 科目
                <input style={inputStyle} value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="例如：分數、二次大戰、光合作用…" />
              </label>

              <label style={labelStyle}>
                年級程度
                <select style={inputStyle} value={level} onChange={e => setLevel(e.target.value)}>
                  {GRADES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>

              <label style={labelStyle}>
                題目數量：<strong style={{ color: '#111827', fontWeight: 900 }}>{count} 題</strong>
                <input type="range" min="1" max="15" value={count}
                  onChange={e => setCount(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 6, accentColor: '#7C3AED' }} />
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>
                  題型（可多選）
                  {selectedTypes.length === 0 && (
                    <span style={{ color: '#FF3B30', marginLeft: 8 }}>請至少選一種</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SUPPORTED_TYPES.map(t => (
                    <button key={t} type="button"
                      style={types[t]
                        ? { ...btnPrimary, background: '#7C3AED', padding: '8px 16px' }
                        : { ...btnGhost, padding: '8px 16px' }}
                      onClick={() => setTypes(prev => ({ ...prev, [t]: !prev[t] }))}>
                      {typeLabel(t)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Step 2: Review & Edit ── */
          <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '340px 1fr' }}>

            {/* Left: question list */}
            <div style={{
              borderRight: '1px solid rgba(17,24,39,0.08)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid rgba(17,24,39,0.08)',
                background: '#fff', fontSize: 13, fontWeight: 900, color: '#111827',
              }}>
                已選 <span style={{ color: '#7C3AED' }}>{checkedCount}</span> / {candidates.length} 題
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {candidates.map((q, i) => {
                  const isActive = activeIdx === i;
                  return (
                    <button key={i} type="button" onClick={() => setActiveIdx(i)} style={{
                      width: '100%', textAlign: 'left', border: 0,
                      borderLeft: isActive ? '4px solid #7C3AED' : '4px solid transparent',
                      background: isActive ? 'rgba(124,58,237,0.06)' : 'transparent',
                      padding: '10px 14px', cursor: 'pointer',
                      borderBottom: '1px solid rgba(17,24,39,0.06)', display: 'grid', gap: 5,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <input type="checkbox" checked={!!checked[i]} onChange={() => {}}
                          onClick={e => { e.stopPropagation(); setChecked(c => ({ ...c, [i]: !c[i] })); }}
                          style={{ accentColor: '#7C3AED', flexShrink: 0, width: 15, height: 15 }} />
                        <div style={{
                          fontWeight: 900, fontSize: 13, color: '#111827',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        }}>
                          {q.question_text || '（無題幹）'}
                        </div>
                      </div>
                      <div style={{ paddingLeft: 23, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <QuestionTypeBadge type={q.type} />
                        {q.topic && <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 700 }}>{q.topic}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: edit form */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', background: '#fff' }}>
              {candidates[activeIdx] ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#9CA3AF', marginBottom: 16 }}>
                    題目 {activeIdx + 1} / {candidates.length} — 點擊左側列表切換
                  </div>
                  <QuestionEditForm
                    item={candidates[activeIdx]}
                    onChange={updated =>
                      setCandidates(prev => prev.map((q, i) => i === activeIdx ? updated : q))
                    }
                  />
                </>
              ) : (
                <div style={{ color: '#9CA3AF', fontWeight: 700, padding: '40px 0', textAlign: 'center' }}>
                  從左側選擇題目以編輯
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '14px 22px', background: '#fff',
          borderTop: '1px solid rgba(17,24,39,0.08)',
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          {step === 2 && (
            <button onClick={() => setStep(1)} style={{ ...btnGhost, marginRight: 'auto' }}
              disabled={saving}>← 重新設定</button>
          )}
          <button onClick={onClose} style={btnGhost} disabled={generating || saving}>取消</button>
          {step === 1 ? (
            <button
              onClick={generate}
              style={{ ...btnPrimary, background: '#7C3AED' }}
              disabled={generating || selectedTypes.length === 0}>
              {generating ? '產生中…' : '產生題目 →'}
            </button>
          ) : (
            <button
              onClick={saveSelected}
              style={{ ...btnPrimary, background: '#7C3AED' }}
              disabled={saving || checkedCount === 0}>
              {saving ? '儲存中…' : `加入題庫（${checkedCount}）`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeacherQuestionBank() {
  const [view, setView] = useState('list'); // 'list' | 'edit'

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterLevel, setFilterLevel] = useState('');

  // Edit state
  const [editItem, setEditItem] = useState(null);
  const [isNew, setIsNew] = useState(false);

  // AI
  const [aiOpen, setAiOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listQuestionBank(200);
      setItems(Array.isArray(res?.items) ? res.items : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    const sq = q.trim().toLowerCase();
    const sy = filterType.toUpperCase();
    const sl = filterLevel.toUpperCase();
    return items.filter(it => {
      if (sq && !(it.question_text || '').toLowerCase().includes(sq) && !(it.topic || '').toLowerCase().includes(sq)) return false;
      if (sy && String(it.type || '').toUpperCase() !== sy) return false;
      if (sl && String(it.target_level || '').toUpperCase() !== sl) return false;
      return true;
    });
  }, [items, q, filterType, filterLevel]);

  function openNew() {
    setEditItem({ ...EMPTY_ITEM });
    setIsNew(true);
    setView('edit');
  }

  function openEdit(item) {
    setEditItem({ ...item });
    setIsNew(false);
    setView('edit');
  }

  async function saveEdit() {
    if (!editItem.question_text?.trim()) return alert('請填入題目文字');
    setSaving(true);
    try {
      const { _cid, ...rest } = editItem;
      const res = await upsertQuestionBankItem({ ...stripUndef(rest) });
      if (!res?.ok) { alert(res?.error || '儲存失敗'); return; }
      await refresh();
      setView('list');
    } catch (e) {
      alert('儲存失敗：' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEdit() {
    if (!window.confirm('確認刪除此題目？')) return;
    setSaving(true);
    try {
      const { _cid, ...rest } = editItem;
      const res = await upsertQuestionBankItem({ ...stripUndef(rest), deleted: true });
      if (!res?.ok) { alert(res?.error || '刪除失敗'); return; }
      await refresh();
      setView('list');
    } finally {
      setSaving(false);
    }
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr)' }}>

        {/* Header */}
        <div className="qcCard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '18px 24px' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#111827' }}>題庫</div>
            <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 12, marginTop: 2 }}>管理班級的題目庫</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={openNew} style={btnGhost}>＋ 新增題目</button>
            <button onClick={() => setAiOpen(true)} style={{ ...btnPrimary, background: '#7C3AED' }}>
              ✨ AI 產生題目
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="qcCard" style={{ padding: '16px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋題幹或主題…" style={inputStyle} />
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
              <option value="">全部題型</option>
              {SUPPORTED_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} style={inputStyle}>
              <option value="">全部年級</option>
              {GRADES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* Question list */}
        <div className="qcCard" style={{ padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: '#111827' }}>
              題目
              <span style={{ marginLeft: 8, color: '#6B7280', fontWeight: 700, fontSize: 13 }}>
                {filtered.length} 題
              </span>
            </div>
            <button onClick={() => refresh()} disabled={loading} style={{ ...btnGhost, padding: '6px 14px', fontSize: 12 }}>
              {loading ? '載入中…' : '重新整理'}
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontWeight: 700 }}>載入中…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 0', color: '#9CA3AF' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                {items.length === 0 ? '題庫暫無題目' : '找不到符合條件的題目'}
              </div>
              {items.length === 0 && (
                <button onClick={openNew} style={{ ...btnPrimary, marginTop: 16 }}>新增題目</button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              {filtered.map(it => (
                <div key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 18,
                  border: '1px solid rgba(17,24,39,0.12)', background: '#F9FAFB',
                  minWidth: 0, width: '100%', boxSizing: 'border-box',
                  overflow: 'hidden',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6, color: '#111827',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.question_text || '（未填寫題目）'}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <QuestionTypeBadge type={it.type} />
                      {it.topic && <span>· {it.topic}</span>}
                      {it.target_level && <span>· {it.target_level}</span>}
                      <span>· {it.points ?? 1} 分</span>
                    </div>
                  </div>
                  <button onClick={() => openEdit(it)} style={btnGhost}>編輯</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Modal */}
        {aiOpen && (
          <AiModal
            onClose={() => setAiOpen(false)}
            onSave={refresh}
          />
        )}
      </div>
    );
  }

  // ── EDIT VIEW ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div>
        <button onClick={() => setView('list')} style={btnGhost}>← 返回題庫</button>
      </div>

      <div className="qcCard" style={{ padding: '24px 28px' }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4, color: '#111827' }}>
          {isNew ? '新增題目' : '編輯題目'}
        </div>
        <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 13, marginBottom: 24 }}>
          填寫題目內容後儲存到題庫
        </div>

        {editItem && (
          <QuestionEditForm item={editItem} onChange={setEditItem} />
        )}

        <div style={{
          marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(17,24,39,0.08)',
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap',
        }}>
          {!isNew && (
            <button onClick={deleteEdit} style={{ ...btnDanger, marginRight: 'auto' }} disabled={saving}>
              刪除題目
            </button>
          )}
          <button onClick={() => setView('list')} style={btnGhost} disabled={saving}>取消</button>
          <button onClick={saveEdit} style={btnPrimary} disabled={saving}>
            {saving ? '儲存中…' : '儲存題目'}
          </button>
        </div>
      </div>
    </div>
  );
}
