import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listQuestionBank, upsertQuestionBankItem } from '../services/firebase.js';
import { chat } from '../services/api.js';
import Modal from '../components/Modal.jsx';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';

const SUPPORTED_TYPES = ['TRUE_FALSE','MULTIPLE_CHOICE','FILL_IN_BLANK','MATCHING','SHORT_ANSWER','LONG_ANSWER'];

function typeLabel(t) {
  const m = { TRUE_FALSE:'是非題', MULTIPLE_CHOICE:'選擇題', FILL_IN_BLANK:'填空題', MATCHING:'配對題', SHORT_ANSWER:'簡答題', LONG_ANSWER:'申論題' };
  return m[String(t||'').toUpperCase()] || String(t||'—');
}

// Parse [____] blanks from question text
function parseBlanks(text, existing = []) {
  const matches = [...String(text||'').matchAll(/\[____\]/g)];
  return matches.map((_, i) => existing[i] || { position: i + 1, accepted: [''] });
}

// Inline-editable field: click to activate input/textarea
function InlineField({ value, onSave, multiline = false, style = {} }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  const base = { ...inputStyle, background: '#fff', cursor: editing ? 'text' : 'text' };
  if (multiline) base.minHeight = 90;

  if (!editing) return (
    <div style={{ ...base, ...style }} onClick={() => { setDraft(value); setEditing(true); }}>
      {value || <span style={{ color: '#9CA3AF' }}>（點此輸入）</span>}
    </div>
  );

  const props = {
    ref, value: draft, style: { ...base, ...style }, autoFocus: true,
    onChange: e => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: e => {
      if (e.key === 'Escape') { setEditing(false); setDraft(value); }
      if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
      if (e.key === 'Enter' && multiline && !e.shiftKey) { e.preventDefault(); commit(); }
    },
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

// Edit form for a single question (used in right panel and in add modal)
function QuestionEditForm({ item, onChange, saving, onSave, onDelete }) {
  const ty = String(item.type || '').toUpperCase();

  function field(label, content) {
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={labelStyle}>{label}</div>
        {content}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Type + delete row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <QuestionTypeBadge type={item.type} />
          <select
            value={item.type}
            onChange={e => onChange({ ...item, type: e.target.value })}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            aria-label="question type"
          >
            {SUPPORTED_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </div>
        {onDelete && (
          <button type="button" style={btnGhost} disabled={saving} onClick={onDelete}>刪除</button>
        )}
      </div>

      {/* Question text */}
      {field('題目文字',
        <InlineField
          multiline
          value={item.question_text || ''}
          onSave={v => {
            const next = { ...item, question_text: v };
            if (ty === 'FILL_IN_BLANK') next.blanks = parseBlanks(v, item.blanks);
            onChange(next);
            onSave && onSave({ ...next });
          }}
        />
      )}

      {/* Topic / Grade / Points */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
        {field('主題',
          <InlineField
            value={item.topic || ''}
            onSave={v => { const n = { ...item, topic: v }; onChange(n); onSave && onSave(n); }}
          />
        )}
        {field('年級',
          <select value={item.target_level || ''} style={selectStyle}
            onChange={e => { const n = { ...item, target_level: e.target.value }; onChange(n); onSave && onSave(n); }}>
            <option value="">—</option>
            {['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4','S5','S6'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {field('分數',
          <input type="number" value={item.points ?? 1} style={{ ...inputStyle, width: 90 }}
            onChange={e => { const n = { ...item, points: Number(e.target.value) }; onChange(n); }}
            onBlur={e => onSave && onSave({ ...item, points: Number(e.target.value) })}
          />
        )}
      </div>

      {/* TRUE_FALSE */}
      {ty === 'TRUE_FALSE' && field('正確答案',
        <div style={{ display: 'flex', gap: 10 }}>
          {[true, false].map(v => (
            <button key={String(v)} type="button"
              style={item.correct_answer === v ? btnPrimary : btnGhost}
              onClick={() => { const n = { ...item, correct_answer: v }; onChange(n); onSave && onSave(n); }}>
              {v ? 'True' : 'False'}
            </button>
          ))}
        </div>
      )}

      {/* MULTIPLE_CHOICE */}
      {ty === 'MULTIPLE_CHOICE' && field('選項',
        <div style={{ display: 'grid', gap: 8 }}>
          {(item.options || []).map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" style={opt.is_correct ? btnPrimary : btnGhost}
                onClick={() => {
                  const opts = [...(item.options||[])];
                  opts[i] = { ...opts[i], is_correct: !opts[i].is_correct };
                  const n = { ...item, options: opts }; onChange(n); onSave && onSave(n);
                }}>✔</button>
              <div style={{ fontWeight: 900, width: 22 }}>{opt.id || String.fromCharCode(65 + i)}</div>
              <InlineField value={opt.text || ''} style={{ flex: 1 }}
                onSave={v => {
                  const opts = [...(item.options||[])];
                  opts[i] = { ...opts[i], text: v };
                  const n = { ...item, options: opts }; onChange(n); onSave && onSave(n);
                }} />
              <button type="button" style={btnGhost}
                onClick={() => {
                  const opts = (item.options||[]).filter((_, j) => j !== i);
                  const n = { ...item, options: opts }; onChange(n); onSave && onSave(n);
                }}>刪除</button>
            </div>
          ))}
          <button type="button" style={btnGhost}
            onClick={() => {
              const opts = [...(item.options||[])];
              opts.push({ id: String.fromCharCode(65 + opts.length), text: '', is_correct: false });
              const n = { ...item, options: opts }; onChange(n); onSave && onSave(n);
            }}>＋新增選項</button>
        </div>
      )}

      {/* FILL_IN_BLANK */}
      {ty === 'FILL_IN_BLANK' && field('填空答案',
        <div style={{ display: 'grid', gap: 8 }}>
          {(item.blanks || []).map((blank, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 900, width: 60 }}>空格 {blank.position || i + 1}</div>
              <InlineField
                value={(Array.isArray(blank.accepted) && blank.accepted[0]) || ''}
                style={{ flex: 1 }}
                onSave={v => {
                  const blanks = [...(item.blanks||[])];
                  blanks[i] = { ...blanks[i], accepted: [v] };
                  const n = { ...item, blanks }; onChange(n); onSave && onSave(n);
                }} />
            </div>
          ))}
        </div>
      )}

      {/* MATCHING */}
      {ty === 'MATCHING' && field('配對',
        <div style={{ display: 'grid', gap: 8 }}>
          {(item.pairs || []).map((pair, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
              <InlineField value={pair.prompt || ''}
                onSave={v => {
                  const pairs = [...(item.pairs||[])];
                  pairs[i] = { ...pairs[i], prompt: v };
                  const n = { ...item, pairs }; onChange(n); onSave && onSave(n);
                }} />
              <InlineField value={pair.match || ''}
                onSave={v => {
                  const pairs = [...(item.pairs||[])];
                  pairs[i] = { ...pairs[i], match: v };
                  const n = { ...item, pairs }; onChange(n); onSave && onSave(n);
                }} />
              <button type="button" style={btnGhost}
                onClick={() => {
                  const pairs = (item.pairs||[]).filter((_, j) => j !== i);
                  const n = { ...item, pairs }; onChange(n); onSave && onSave(n);
                }}>刪除</button>
            </div>
          ))}
          <button type="button" style={btnGhost}
            onClick={() => {
              const pairs = [...(item.pairs||[]), { prompt: '', match: '' }];
              const n = { ...item, pairs }; onChange(n); onSave && onSave(n);
            }}>＋新增配對</button>
        </div>
      )}

      {/* SHORT_ANSWER */}
      {ty === 'SHORT_ANSWER' && field('理想答案',
        <InlineField value={item.ideal_answer || ''}
          onSave={v => { const n = { ...item, ideal_answer: v }; onChange(n); onSave && onSave(n); }} />
      )}

      {/* LONG_ANSWER */}
      {ty === 'LONG_ANSWER' && field('評分標準',
        <InlineField multiline value={item.grading_rubric || ''}
          onSave={v => { const n = { ...item, grading_rubric: v }; onChange(n); onSave && onSave(n); }} />
      )}
    </div>
  );
}

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

export default function TeacherQuestionBank() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [targetLevel, setTargetLevel] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [editItem, setEditItem] = useState(null); // right-panel edit state
  const [saving, setSaving] = useState(false);

  // Add-new modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const [addSaving, setAddSaving] = useState(false);

  // AI generate
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiStep, setAiStep] = useState(1);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCount, setAiCount] = useState(6);
  const [aiTopic, setAiTopic] = useState('');
  const [aiTargetLevel, setAiTargetLevel] = useState('S3');
  const [aiTypes, setAiTypes] = useState(SUPPORTED_TYPES);
  const [aiCandidates, setAiCandidates] = useState([]);
  const [aiSelected, setAiSelected] = useState({});
  const [aiSelectedIdx, setAiSelectedIdx] = useState(null);

  // Load questions
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listQuestionBank('', 200);
      if (!res?.ok) { alert(res?.error || '載入題庫失敗'); return; }
      const list = res.items || [];
      setItems(list);
      if (list[0]?.id && !selectedId) setSelectedId(list[0].id);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line

  const selected = useMemo(() => items.find(x => x.id === selectedId) || null, [items, selectedId]);

  // Sync editItem when selection changes
  useEffect(() => { setEditItem(selected ? { ...selected } : null); }, [selectedId, items]);

  const filtered = useMemo(() => {
    const sq = q.trim().toLowerCase();
    const sy = type.trim().toUpperCase();
    const sl = targetLevel.trim().toUpperCase();
    return items.filter(it => {
      const text = String(it.question_text || it.prompt || '').toLowerCase();
      if (sq && !text.includes(sq)) return false;
      if (sy && String(it.type || '').toUpperCase() !== sy) return false;
      if (sl && String(it.target_level || '').toUpperCase() !== sl) return false;
      return true;
    });
  }, [items, q, type, targetLevel]);

  async function saveItem(payload) {
    if (!payload) return;
    setSaving(true);
    try {
      const res = await upsertQuestionBankItem({ ...stripUndef(payload) });
      if (res?.ok) {
        setItems(prev => {
          const idx = prev.findIndex(x => x.id === payload.id);
          if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...payload }; return next; }
          return prev;
        });
      } else {
        alert(res?.error || '儲存失敗');
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id) {
    if (!window.confirm('確定刪除這題？')) return;
    setSaving(true);
    try {
      // Use upsert with deleted flag if available, otherwise just remove locally
      setItems(prev => prev.filter(x => x.id !== id));
      setSelectedId(null);
    } finally {
      setSaving(false);
    }
  }

  async function addNew() {
    if (!newItem.question_text?.trim()) return alert('請填入題目文字');
    setAddSaving(true);
    try {
      const res = await upsertQuestionBankItem({ ...stripUndef(newItem) });
      if (res?.ok) {
        await refresh();
        setShowAddModal(false);
        setNewItem(EMPTY_ITEM);
        if (res.questionId) setSelectedId(res.questionId);
      } else {
        alert(res?.error || '新增失敗');
      }
    } finally {
      setAddSaving(false);
    }
  }

  // AI generate
  async function onAiGenerate() {
    if (!aiTypes.length) return alert('請至少選一種題型');
    const count = Math.max(1, Math.min(30, Number(aiCount || 6)));
    setAiLoading(true);
    try {
      const idToken = await window.QuestClassFirebase?.getIdToken?.();
      if (!idToken) { alert('請先登入'); return; }
      const allowedTypes = aiTypes.map(t => String(t).toUpperCase()).filter(t => SUPPORTED_TYPES.includes(t));
      const system = `你是一個老師助教。請產出「題庫題目」JSON，輸出必須是純 JSON，不要 markdown。\n\n你只能使用以下題型：\n${allowedTypes.map(t => `- ${t}`).join('\n')}\n\n重要：請依照香港學制（HK）調整難度。\n- target_level: ${aiTargetLevel}\n\n輸出規格：{"questions":[{"type":"...","topic":"...","points":1,"question_text":"...","correct_answer":true,"options":[{"id":"A","text":"...","is_correct":false}],"blanks":[{"position":1,"accepted":["..."]}],"pairs":[{"prompt":"...","match":"..."}],"ideal_answer":"...","grading_rubric":"...","max_word_count":500}]}`;
      const user = `請產生 ${count} 題。\nHK 年級：${aiTargetLevel}\ntopic：${aiTopic || '（不限）'}`;
      const res = await chat({ idToken, topic: 'question-bank', mode: 'generate', studentName: 'teacher', message: user, system, format: 'json' });
      if (res?.error) { alert(`${res.error}${res.detail ? `: ${res.detail}` : ''}`); return; }
      const qs = res?.questions || [];
      if (!qs.length) { alert('AI 沒有回傳 questions'); return; }
      const candidates = qs.map(raw => {
        const t = String(raw?.type || '').toUpperCase();
        if (!allowedTypes.includes(t)) return null;
        return {
          type: t, topic: String(raw.topic || aiTopic || ''), points: Number(raw.points || 1),
          target_level: aiTargetLevel, question_text: String(raw.question_text || ''),
          correct_answer: typeof raw.correct_answer === 'boolean' ? raw.correct_answer : undefined,
          options: Array.isArray(raw.options) ? raw.options : undefined,
          blanks: Array.isArray(raw.blanks) ? raw.blanks : undefined,
          pairs: Array.isArray(raw.pairs) ? raw.pairs : undefined,
          ideal_answer: raw.ideal_answer, grading_rubric: raw.grading_rubric, max_word_count: raw.max_word_count,
        };
      }).filter(Boolean);
      if (!candidates.length) { alert('AI 回傳的題目都不符合支援題型'); return; }
      setAiCandidates(candidates);
      const sel = {}; candidates.forEach((_, i) => { sel[i] = true; }); setAiSelected(sel);
      setAiSelectedIdx(0); setAiStep(2);
    } catch (e) { alert(e?.message || 'AI 產生失敗'); }
    finally { setAiLoading(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Top filter card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={btnGhost}
              onClick={() => { setNewItem(EMPTY_ITEM); setShowAddModal(true); }}>
              新增題目
            </button>
            <button type="button" style={{ ...btnPrimary, padding: '10px 16px' }}
              onClick={() => { setShowAiPanel(true); setAiStep(1); }}>
              AI 產生題目
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋題幹…" style={inputStyle} />
          <select value={type} onChange={e => setType(e.target.value)} style={selectStyle}>
            <option value="">全部題型</option>
            {SUPPORTED_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <select value={targetLevel} onChange={e => setTargetLevel(e.target.value)} style={selectStyle}>
            <option value="">全部年級</option>
            {['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4','S5','S6'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* AI Generate Modal */}
      <Modal
        open={showAiPanel}
        title={aiStep === 1 ? 'AI 產生題目：設定' : 'AI 產生題目：挑選加入題庫'}
        onClose={() => { setShowAiPanel(false); setAiStep(1); }}
        footer={aiStep === 1 ? (
          <>
            <button type="button" style={btnGhost} onClick={() => setShowAiPanel(false)}>取消</button>
            <button type="button" style={btnPrimary} onClick={onAiGenerate} disabled={aiLoading}>
              {aiLoading ? '產生中…' : '下一步：產生題目'}
            </button>
          </>
        ) : (
          <>
            <button type="button" style={btnGhost} onClick={() => setAiStep(1)}>返回設定</button>
            <button type="button" style={btnGhost} onClick={() => { const s = {}; aiCandidates.forEach((_, i) => { s[i] = true; }); setAiSelected(s); }}>全選</button>
            <button type="button" style={btnGhost} onClick={() => setAiSelected({})}>全不選</button>
            <button type="button" style={btnPrimary} onClick={async () => {
              const chosen = aiCandidates.filter((_, i) => aiSelected[i]);
              if (!chosen.length) return alert('請至少選一題');
              const created = [], errors = [];
              for (const payload of chosen) {
                const res = await upsertQuestionBankItem({ ...stripUndef(payload) });
                if (res?.ok) created.push(res.questionId); else errors.push(res?.error || 'error');
              }
              await refresh();
              setShowAiPanel(false); setAiStep(1); setAiCandidates([]); setAiSelected({});
              if (errors.length) alert(`已新增 ${created.length} 題（失敗 ${errors.length}）`);
              else alert(`已新增 ${created.length} 題到題庫`);
            }}>加入題庫</button>
          </>
        )}
      >
        {aiStep === 1 ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={labelStyle}>數量（1~30）</div>
                <input type="number" value={aiCount} onChange={e => setAiCount(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={labelStyle}>主題（可留空）</div>
                <input value={aiTopic} onChange={e => setAiTopic(e.target.value)} style={inputStyle} placeholder="例如：分數加減" />
              </label>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={labelStyle}>HK 年級（預設：S3）</div>
              <select value={aiTargetLevel} onChange={e => setAiTargetLevel(e.target.value)} style={selectStyle}>
                {[['P1','小一'],['P2','小二'],['P3','小三'],['P4','小四'],['P5','小五'],['P6','小六'],
                  ['S1','中一'],['S2','中二'],['S3','中三'],['S4','中四'],['S5','中五'],['S6','中六']].map(([v,l]) => (
                  <option key={v} value={v}>{v}（{l}）</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={labelStyle}>題型（可多選）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {SUPPORTED_TYPES.map(t => (
                  <label key={t} style={checkRow}>
                    <input type="checkbox" checked={aiTypes.includes(t)}
                      onChange={() => setAiTypes(arr => arr.includes(t) ? arr.filter(x => x !== t) : [...arr, t])} />
                    {typeLabel(t)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 14, alignItems: 'start' }}>
            <div style={{ border: '1px solid rgba(17,24,39,0.10)', borderRadius: 18, overflow: 'hidden', background: '#F9FAFB' }}>
              <div style={{ padding: 12, borderBottom: '1px solid rgba(17,24,39,0.10)', fontWeight: 900 }}>
                產生結果（{aiCandidates.length}）
              </div>
              <div style={{ maxHeight: 520, overflow: 'auto' }}>
                {aiCandidates.map((it, idx) => {
                  const active = aiSelectedIdx === idx;
                  const checked = Boolean(aiSelected[idx]);
                  return (
                    <button key={idx} type="button" onClick={() => setAiSelectedIdx(idx)} style={{
                      width: '100%', textAlign: 'left', border: 0,
                      borderLeft: active ? '4px solid #0B5FFF' : '4px solid transparent',
                      background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                      padding: 12, cursor: 'pointer', display: 'grid', gap: 6,
                      borderBottom: '1px solid rgba(17,24,39,0.06)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => setAiSelected(s => ({ ...s, [idx]: !checked }))} />
                          <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {it.question_text || '（無題幹）'}
                          </div>
                        </div>
                        <div style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>{it.points ?? '—'}分</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                        <QuestionTypeBadge type={it.type} />
                        <span style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>{it.topic || '—'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ border: '1px solid rgba(17,24,39,0.10)', borderRadius: 18, background: 'white', padding: 14 }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>預覽（教師視角）</div>
              <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                {aiSelectedIdx !== null ? `#${aiSelectedIdx + 1}` : '從左側選擇題目'}
              </div>
              <div style={{ marginTop: 12 }}>
                {aiSelectedIdx !== null && (
                  <>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{aiCandidates[aiSelectedIdx]?.question_text}</div>
                    <div style={{ marginTop: 8, color: '#6B7280', fontWeight: 900, fontSize: 12 }}>topic: {aiCandidates[aiSelectedIdx]?.topic || '—'}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* New Question Modal */}
      <Modal open={showAddModal} title="新增題目"
        onClose={() => { setShowAddModal(false); setNewItem(EMPTY_ITEM); }}
        footer={<>
          <button type="button" style={btnGhost} onClick={() => { setShowAddModal(false); setNewItem(EMPTY_ITEM); }}>取消</button>
          <button type="button" style={btnPrimary} disabled={addSaving} onClick={addNew}>
            {addSaving ? '儲存中…' : '儲存'}
          </button>
        </>}
      >
        <QuestionEditForm item={newItem} onChange={setNewItem} saving={addSaving} />
      </Modal>

      {/* Two-column list + editor */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16, alignItems: 'start' }}>

        {/* List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid rgba(17,24,39,0.10)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>題目（{filtered.length}）</div>
            <div style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>{filtered.length} 題</div>
          </div>
          <div style={{ maxHeight: 620, overflow: 'auto' }}>
            {loading ? (
              <div style={{ padding: 14, color: '#6B7280', fontWeight: 700 }}>載入中…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 14, color: '#6B7280', fontWeight: 700 }}>沒有題目（或篩選後為空）</div>
            ) : filtered.map(it => {
              const active = it.id === selectedId;
              return (
                <button key={it.id} type="button" onClick={() => setSelectedId(it.id)} style={{
                  width: '100%', textAlign: 'left', border: 0,
                  borderLeft: active ? '4px solid #0B5FFF' : '4px solid transparent',
                  background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                  padding: 12, cursor: 'pointer', display: 'grid', gap: 6,
                  borderBottom: '1px solid rgba(17,24,39,0.06)',
                }}>
                  <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.question_text || it.prompt || '（無題幹）'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <QuestionTypeBadge type={it.type} />
                    <span style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>
                      {it.topic || '—'} · {it.points ?? '—'}分
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel: inline editor */}
        <div className="card" style={{ minHeight: 300 }}>
          {editItem ? (
            <QuestionEditForm
              item={editItem}
              onChange={setEditItem}
              saving={saving}
              onSave={saveItem}
              onDelete={() => deleteItem(editItem.id)}
            />
          ) : (
            <div style={{ color: '#6B7280', fontWeight: 700, marginTop: 12 }}>請從左側選擇題目</div>
          )}
        </div>
      </div>
    </div>
  );
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

const labelStyle = { fontWeight: 900, fontSize: 12, color: '#6B7280' };

const checkRow = { display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900, fontSize: 12, color: '#111827', padding: 10, borderRadius: 14, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB' };

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,0.10)', background: '#F2F2F7', outline: 'none', fontWeight: 800 };

const selectStyle = { width: '100%', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,0.10)', background: '#F2F2F7', outline: 'none', fontWeight: 800 };

const btnGhost = { border: '1px solid rgba(17,24,39,0.10)', background: '#F2F2F7', color: '#111827', padding: '10px 14px', borderRadius: 999, fontWeight: 900, cursor: 'pointer' };

const btnPrimary = { border: 0, background: '#007AFF', color: 'white', padding: '10px 14px', borderRadius: 999, fontWeight: 900, cursor: 'pointer' };
