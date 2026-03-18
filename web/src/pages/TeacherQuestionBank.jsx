import React, { useEffect, useMemo, useState } from 'react';
import { listClassrooms, listQuestionBank, upsertQuestionBankItem } from '../services/firebase.js';
import { chat } from '../services/api.js';
import Modal from '../components/Modal.jsx';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';
import QuestionPreview from '../components/QuestionPreview.jsx';

const SUPPORTED_TYPES = [
  'TRUE_FALSE',
  'MULTIPLE_CHOICE',
  'FILL_IN_BLANK',
  'MATCHING',
  'SHORT_ANSWER',
  'LONG_ANSWER',
];

function typeLabel(t) {
  const m = {
    TRUE_FALSE: '是非題',
    MULTIPLE_CHOICE: '選擇題',
    FILL_IN_BLANK: '填空題',
    MATCHING: '配對題',
    SHORT_ANSWER: '簡答題',
    LONG_ANSWER: '申論題',
  };
  return m[String(t || '').toUpperCase()] || String(t || '—');
}

export default function TeacherQuestionBank() {
  const [classrooms, setClassrooms] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [classroomId, setClassroomId] = useState('');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('');
  const [targetLevel, setTargetLevel] = useState('');

  const [selectedId, setSelectedId] = useState(null);

  // AI generate (two-step modal)
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiStep, setAiStep] = useState(1); // 1=configure, 2=select
  const [aiCount, setAiCount] = useState(6);
  const [aiTopic, setAiTopic] = useState('');
  // HK level controls
  const [aiTargetLevel, setAiTargetLevel] = useState('S3'); // default = Form 3

  const [aiTypes, setAiTypes] = useState(SUPPORTED_TYPES);
  const [aiCandidates, setAiCandidates] = useState([]);
  const [aiSelected, setAiSelected] = useState({});
  const [aiSelectedIdx, setAiSelectedIdx] = useState(null);

  const selected = useMemo(() => (items || []).find((x) => x.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingClasses(true);
      try {
        const res = await listClassrooms();
        if (!mounted) return;
        if (res?.ok) {
          const cs = res.classrooms || [];
          setClassrooms(cs);
          if (!classroomId && cs[0]?.id) setClassroomId(cs[0].id);
        }
      } finally {
        if (mounted) setLoadingClasses(false);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    if (!classroomId) return;
    setLoading(true);
    try {
      const res = await listQuestionBank(classroomId, 200);
      if (!res?.ok) {
        alert(res?.error || '載入題庫失敗');
        return;
      }
      setItems(res.items || []);
      if (!selectedId && res.items?.[0]?.id) setSelectedId(res.items[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  const filtered = useMemo(() => {
    const qq = String(q || '').trim().toLowerCase();
    const tt = String(topic || '').trim().toLowerCase();
    const ty = String(type || '').trim().toUpperCase();
    const tl = String(targetLevel || '').trim().toUpperCase();

    return (items || []).filter((it) => {
      const text = String(it.question_text || it.prompt || '').toLowerCase();
      if (qq && !text.includes(qq)) return false;
      const tpc = String(it.topic || '').toLowerCase();
      if (tt && !tpc.includes(tt)) return false;
      const ity = String(it.type || '').toUpperCase();
      if (ty && ity !== ty) return false;
      const itl = String(it.target_level || '').trim().toUpperCase();
      if (tl && itl !== tl) return false;
      return true;
    });
  }, [items, q, topic, type, targetLevel]);

  const onAiGenerate = async () => {
    if (!classroomId) return alert('請先選擇班級');
    if (!aiTypes.length) return alert('請至少選一種題型');

    const count = Math.max(1, Math.min(30, Number(aiCount || 6)));

    setAiLoading(true);
    try {
      const idToken = await window.QuestClassFirebase?.getIdToken?.();
      if (!idToken) {
        alert('請先登入（無法取得 idToken）');
        return;
      }

      const allowedTypes = aiTypes.map((t) => String(t).toUpperCase()).filter((t) => SUPPORTED_TYPES.includes(t));
      if (!allowedTypes.length) {
        alert('你選的題型都不支援');
        return;
      }

      const system = `你是一個老師助教。請產出「題庫題目」JSON，輸出必須是純 JSON，不要 markdown。\n\n你只能使用以下題型（必須完全符合字串）：\n${allowedTypes.map((t) => `- ${t}`).join('\n')}\n\n重要：請依照香港學制（HK）調整難度、詞彙、題幹長度、情境與常見錯誤點。\n- target_level: ${aiTargetLevel}\n\n輸出規格：{\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"type\": \"${allowedTypes.join('|')}\",\n      \"topic\": \"主題\",\n      \"points\": 1,\n      \"question_text\": \"題目文字（可包含 [____]）\",\n      // TRUE_FALSE\n      \"correct_answer\": true|false,\n      // MULTIPLE_CHOICE\n      \"options\": [{\"id\":\"A\",\"text\":\"...\",\"is_correct\":false}, ...],\n      // FILL_IN_BLANK\n      \"blanks\": [{\"position\":1,\"accepted\":[\"Au\",\"au\"]}, ...],\n      // MATCHING\n      \"pairs\": [{\"prompt\":\"...\",\"match\":\"...\"}, ...],\n      // SHORT_ANSWER\n      \"ideal_answer\": \"...\",\n      \"max_word_count\": 20,\n      // LONG_ANSWER\n      \"grading_rubric\": \"...\",\n      \"max_word_count\": 500\n    }\n  ]\n}`;

      const user = `班級: ${classroomId}\n請產生 ${count} 題題庫題目。\nHK 年級/程度：${aiTargetLevel || '（未指定）'}\ntopic/主題偏好：${aiTopic ? aiTopic : '（不限）'}\n請確保題型只使用允許清單，且每題都符合其欄位規格。`;

      const res = await chat({
        idToken,
        topic: 'question-bank',
        mode: 'generate',
        studentName: 'teacher',
        message: user,
        system,
        format: 'json'
      });

      if (res?.error) {
        alert(`${res.error}${res.detail ? `: ${res.detail}` : ''}`);
        return;
      }

      const qs = res?.questions || [];
      if (!Array.isArray(qs) || !qs.length) {
        alert('AI 沒有回傳 questions');
        return;
      }

      const candidates = qs
        .map((raw) => {
          const t = String(raw?.type || '').toUpperCase();
          if (!SUPPORTED_TYPES.includes(t)) return null;
          if (!allowedTypes.includes(t)) return null;
          return {
            type: t,
            topic: String(raw.topic || aiTopic || ''),
            points: Number(raw.points || 1),
            target_level: aiTargetLevel,
            question_text: String(raw.question_text || ''),
            correct_answer: typeof raw.correct_answer === 'boolean' ? raw.correct_answer : undefined,
            options: Array.isArray(raw.options) ? raw.options : undefined,
            blanks: Array.isArray(raw.blanks) ? raw.blanks : undefined,
            pairs: Array.isArray(raw.pairs) ? raw.pairs : undefined,
            ideal_answer: raw.ideal_answer,
            grading_rubric: raw.grading_rubric,
            max_word_count: raw.max_word_count,
          };
        })
        .filter(Boolean);

      if (!candidates.length) {
        alert('AI 回傳的題目都不符合支援題型/格式');
        return;
      }

      setAiCandidates(candidates);
      const sel = {};
      candidates.forEach((_, idx) => { sel[idx] = true; });
      setAiSelected(sel);
      setAiSelectedIdx(0);
      setAiStep(2);
      setShowAiPanel(true);
    } catch (e) {
      alert(e?.message || 'AI 產生失敗');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>題庫</div>
            <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
              獨立題庫頁：搜尋、篩選、預覽（教師視角）。
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
            <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} style={{ ...selectStyle, minWidth: 220 }} disabled={loadingClasses}>
              <option value="">{loadingClasses ? '載入班級…' : '選擇班級'}</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
            <button type="button" style={btnGhost} onClick={refresh} disabled={loading || !classroomId}>
              {loading ? '更新中…' : '更新題庫'}
            </button>
          </div>
        </div>

        {/* Make AI CTA always visible: put it on its own row */}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={{ ...btnPrimary, padding: '12px 18px' }}
            onClick={() => {
              setShowAiPanel(true);
              setAiStep(1);
            }}
            disabled={!classroomId}
          >
            AI 產生題目…
          </button>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋題幹…" style={inputStyle} />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="topic filter" style={inputStyle} />
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            <option value="">全部題型</option>
            <option value="TRUE_FALSE">是非題</option>
            <option value="MULTIPLE_CHOICE">選擇題</option>
            <option value="FILL_IN_BLANK">填空題</option>
            <option value="MATCHING">配對題</option>
            <option value="SHORT_ANSWER">簡答題</option>
            <option value="LONG_ANSWER">申論題</option>
          </select>
          <select value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} style={selectStyle}>
            <option value="">全部年級</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="P4">P4</option>
            <option value="P5">P5</option>
            <option value="P6">P6</option>
            <option value="S1">S1</option>
            <option value="S2">S2</option>
            <option value="S3">S3</option>
            <option value="S4">S4</option>
            <option value="S5">S5</option>
            <option value="S6">S6</option>
          </select>
        </div>
      </div>

      <Modal
        open={showAiPanel}
        title={aiStep === 1 ? 'AI 產生題目：設定' : 'AI 產生題目：挑選加入題庫'}
        onClose={() => {
          setShowAiPanel(false);
          setAiStep(1);
        }}
        footer={
          aiStep === 1 ? (
            <>
              <button type="button" style={btnGhost} onClick={() => setShowAiPanel(false)}>取消</button>
              <button type="button" style={btnPrimary} onClick={onAiGenerate} disabled={aiLoading || !classroomId}>
                {aiLoading ? '產生中…' : '下一步：產生題目'}
              </button>
            </>
          ) : (
            <>
              <button type="button" style={btnGhost} onClick={() => setAiStep(1)}>返回設定</button>
              <button type="button" style={btnGhost} onClick={() => {
                const sel = {};
                aiCandidates.forEach((_, idx) => { sel[idx] = true; });
                setAiSelected(sel);
              }}>全選</button>
              <button type="button" style={btnGhost} onClick={() => setAiSelected({})}>全不選</button>
              <button type="button" style={btnPrimary} onClick={async () => {
                const chosen = aiCandidates.filter((_, idx) => aiSelected[idx]);
                if (!chosen.length) return alert('請至少選一題');

                const created = [];
                for (const payload of chosen) {
                  const up = await upsertQuestionBankItem({ classroomId, ...payload });
                  if (up?.ok) created.push(up.questionId);
                }
                await refresh();
                setShowAiPanel(false);
                setAiStep(1);
                setAiCandidates([]);
                setAiSelected({});
                alert(`已新增 ${created.length} 題到題庫`);
              }}>加入題庫</button>
            </>
          )
        }
      >
        {aiStep === 1 ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={labelStyle}>數量（1~30）</div>
                <input type="number" value={aiCount} onChange={(e) => setAiCount(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={labelStyle}>Topic（可留空）</div>
                <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} style={inputStyle} placeholder="例如：分數加減" />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={labelStyle}>HK 年級/程度（只用 target_level；預設：S3）</div>
                <select value={aiTargetLevel} onChange={(e) => setAiTargetLevel(e.target.value)} style={selectStyle}>
                  <option value="P1">P1（小一）</option>
                  <option value="P2">P2（小二）</option>
                  <option value="P3">P3（小三）</option>
                  <option value="P4">P4（小四）</option>
                  <option value="P5">P5（小五）</option>
                  <option value="P6">P6（小六）</option>
                  <option value="S1">S1（中一 / Form 1）</option>
                  <option value="S2">S2（中二 / Form 2）</option>
                  <option value="S3">S3（中三 / Form 3，預設）</option>
                  <option value="S4">S4（中四 / Form 4）</option>
                  <option value="S5">S5（中五 / Form 5）</option>
                  <option value="S6">S6（中六 / Form 6）</option>
                </select>
              </label>

              <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12, lineHeight: 1.6, paddingTop: 22 }}>
                產題只會傳 <strong>target_level</strong> 給 AI（例如 S3）。不再使用 target_forms。
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={labelStyle}>題型（可多選）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {SUPPORTED_TYPES.map((t) => {
                  const checked = aiTypes.includes(t);
                  return (
                    <label key={t} style={checkRow}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setAiTypes((arr) => checked ? arr.filter((x) => x !== t) : [...arr, t])}
                      />
                      {typeLabel(t)}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12, lineHeight: 1.6 }}>
              提示：下一步會先讓你預覽/勾選題目，確認後才會寫入題庫。
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
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAiSelectedIdx(idx)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 0,
                        borderLeft: active ? '4px solid #0B5FFF' : '4px solid transparent',
                        background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                        padding: 12,
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 6,
                        borderBottom: '1px solid rgba(17,24,39,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                          <input type="checkbox" checked={checked} onChange={() => setAiSelected((s) => ({ ...s, [idx]: !checked }))} />
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
                {aiSelectedIdx !== null ? (
                  <>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{aiCandidates[aiSelectedIdx]?.question_text || '（未選取）'}</div>
                    <div style={{ marginTop: 8, color: '#6B7280', fontWeight: 900, fontSize: 12 }}>topic: {aiCandidates[aiSelectedIdx]?.topic || '—'}</div>
                    <QuestionPreview q={aiCandidates[aiSelectedIdx]} />
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16, alignItems: 'start' }}>
        {/* List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid rgba(17,24,39,0.10)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>題目（{filtered.length}）</div>
            <div style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>{classroomId || '—'}</div>
          </div>
          <div style={{ maxHeight: 620, overflow: 'auto' }}>
            {filtered.map((it) => {
              const active = it.id === selectedId;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderLeft: active ? '4px solid #0B5FFF' : '4px solid transparent',
                    background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                    padding: 12,
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 6,
                    borderBottom: '1px solid rgba(17,24,39,0.06)',
                  }}
                >
                  <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.question_text || it.prompt || '（無題幹）'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <QuestionTypeBadge type={it.type} />
                    <span style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>{it.topic || '—'} · {it.points ?? '—'}分</span>
                  </div>
                </button>
              );
            })}
            {!filtered.length ? (
              <div style={{ padding: 14, color: '#6B7280', fontWeight: 700 }}>
                {loading ? '載入中…' : '沒有題目（或篩選後為空）'}
              </div>
            ) : null}
          </div>
        </div>

        {/* Preview */}
        <div className="card" style={{ minHeight: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>預覽（教師視角）</div>
              <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                {selected ? `id: ${selected.id}` : '從左側選擇題目'}
              </div>
            </div>
            {selected ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900 }}>{selected.points ?? '—'} 分</div>
                <div style={{ marginTop: 6 }}>
                  <QuestionTypeBadge type={selected.type} />
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{selected?.question_text || selected?.prompt || '（未選取）'}</div>
            <div style={{ marginTop: 8, color: '#6B7280', fontWeight: 900, fontSize: 12 }}>topic: {selected?.topic || '—'}</div>
            <QuestionPreview q={selected} />
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontWeight: 900, fontSize: 12, color: '#6B7280' };

const checkRow = { display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900, fontSize: 12, color: '#111827', padding: 10, borderRadius: 14, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB' };

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  outline: 'none',
  fontWeight: 800,
};

const selectStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  outline: 'none',
  fontWeight: 800,
};

const btnGhost = {
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  color: '#111827',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 900,
  cursor: 'pointer',
};

const btnPrimary = {
  border: 0,
  background: '#007AFF',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 900,
  cursor: 'pointer',
};
