import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, ArrowUp, RotateCcw } from 'lucide-react';
import { chat } from '../services/api.js';
import { normalizeRole } from '../permissions.js';

const SUGGESTIONS = {
  student: ['解釋一下怎樣通分', '給我一條分數練習題', '我這樣想對嗎？'],
  teacher: ['設計 3 條小五分數練習題', '寫一段家長通知：功課遲交', '給這份作業寫 3 句評語範例'],
  admin: ['設計 3 條小五分數練習題', '寫一段家長通知：功課遲交', '怎樣向老師介紹這個平台？'],
};

const GREETING = {
  student: '你好！我是 AI 助教。遇到不明白的題目，我會一步步引導你想。',
  teacher: '你好！我可以幫你出題、寫評語、準備家長通知或教學點子。',
  admin: '你好！我可以幫你出題、寫通知，或解答平台上的問題。',
};

// Renders **bold**, headings and simple lists without injecting HTML.
function inline(text, keyBase) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyBase}-${i}`}>{part}</React.Fragment>
  );
}

function FormattedText({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let list = null;
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /^\s*\d/.test(line);
      if (!list || list.ordered !== ordered) { list = { ordered, items: [] }; blocks.push(list); }
      list.items.push(bullet[1]);
      return;
    }
    list = null;
    if (!line.trim()) { blocks.push({ gap: true }); return; }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push({ text: heading ? heading[1] : line, heading: Boolean(heading), key: i });
  });
  return (
    <>
      {blocks.map((b, i) => {
        if (b.gap) return <div key={i} style={{ height: 6 }} />;
        if (b.items) {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag key={i} className="qaList">
              {b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}
            </Tag>
          );
        }
        return <p key={i} className={b.heading ? 'qaHeading' : 'qaPara'}>{inline(b.text, i)}</p>;
      })}
    </>
  );
}

export default function AssistantBubble({ user, pageTitle }) {
  const role = normalizeRole(user?.role) || 'student';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]); // { role: 'user' | 'assistant' | 'error', text }
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const bubbleRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, loading, open]);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => bubbleRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Other pages can open the assistant (e.g. the old /chat link).
  useEffect(() => {
    const onOpen = () => { window.__qc_openAssistant = false; setOpen(true); };
    if (window.__qc_openAssistant) onOpen();
    window.addEventListener('qc:open-assistant', onOpen);
    return () => window.removeEventListener('qc:open-assistant', onOpen);
  }, []);

  const send = async (textArg) => {
    const text = String(textArg ?? draft).trim();
    if (!text || loading) return;
    setDraft('');
    const history = items
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.text }));
    setItems((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const data = await chat({
        message: text,
        assistant: true,
        history,
        page: pageTitle || '',
        studentName: user?.name || '',
      });
      setItems((prev) => [...prev, { role: 'assistant', text: data.reply || '（沒有回應）' }]);
    } catch (e) {
      setItems((prev) => [...prev, { role: 'error', text: e.message || '未能連接 AI 助教' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {open ? (
        <section className="qaPanel" role="dialog" aria-label="AI 助教" aria-modal="false">
          <header className="qaHeader">
            <div className="qaAvatar" aria-hidden="true"><Sparkles size={18} strokeWidth={2} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="qaTitle">AI 助教</div>
              <div className="qaSub">{role === 'student' ? '一步步引導你思考' : '出題、評語、通知、教學點子'}</div>
            </div>
            {items.length ? (
              <button type="button" className="qaIconBtn" onClick={() => setItems([])} aria-label="開始新對話" title="開始新對話">
                <RotateCcw size={17} />
              </button>
            ) : null}
            <button type="button" className="qaIconBtn" onClick={close} aria-label="關閉 AI 助教">
              <X size={18} />
            </button>
          </header>

          <div className="qaBody" ref={listRef} aria-live="polite">
            <div className="qaMsg qaMsgBot"><FormattedText text={GREETING[role] || GREETING.student} /></div>
            {!items.length ? (
              <div className="qaChips">
                {(SUGGESTIONS[role] || SUGGESTIONS.student).map((s) => (
                  <button key={s} type="button" className="qaChip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            ) : null}
            {items.map((m, i) => (
              <div key={i} className={`qaMsg ${m.role === 'user' ? 'qaMsgUser' : m.role === 'error' ? 'qaMsgError' : 'qaMsgBot'}`}>
                {m.role === 'assistant' ? <FormattedText text={m.text} /> : m.text}
              </div>
            ))}
            {loading ? (
              <div className="qaMsg qaMsgBot qaTyping" aria-label="AI 助教正在回覆">
                <span /><span /><span />
              </div>
            ) : null}
          </div>

          <form className="qaComposer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="輸入訊息…"
              aria-label="輸入訊息"
              maxLength={4000}
            />
            <button type="submit" className="qaSend" disabled={!draft.trim() || loading} aria-label="送出">
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          </form>
        </section>
      ) : null}

      <button
        ref={bubbleRef}
        type="button"
        className={`qaBubble ${open ? 'qaBubbleOpen' : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? '關閉 AI 助教' : '打開 AI 助教'}
        aria-expanded={open}
      >
        {open ? <X size={24} strokeWidth={2.2} /> : <Sparkles size={24} strokeWidth={2} />}
      </button>
    </>
  );
}
