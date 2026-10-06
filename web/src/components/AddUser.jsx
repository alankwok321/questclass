import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { importRoster } from '../services/api.js';
import { useToast } from './Toast.jsx';

const input = { width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: '1px solid #D2D2D7', padding: '0 12px', fontSize: 15, fontFamily: 'inherit', background: '#fff' };
const label = { fontWeight: 600, fontSize: 13, color: '#6E6E73' };

// 新增使用者: add one person by their Google e-mail. Someone who has signed in before joins right
// away; anyone else joins automatically the first time they sign in with that e-mail.
export default function AddUser({ schoolId, schoolName, classes = [], onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', name: '', role: 'student', class: '', children: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await importRoster([{ ...f, email: f.email.trim(), name: f.name.trim() }], schoolId);
      if (r.skipped?.length) {
        setMsg({ bad: true, text: `未能加入：${r.skipped[0].reason}` });
      } else {
        setMsg({ bad: false, text: r.updated?.length
          ? `已把 ${f.email.trim()} 加入${schoolName ? `「${schoolName}」` : '學校'}。`
          : `已加入 ${f.email.trim()}（未登入過）。` });
        setF({ email: '', name: '', role: f.role, class: f.role === 'student' ? f.class : '', children: '' });
        onDone?.();
      }
    } catch (err) {
      toast?.show?.(err?.message || '新增失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={18} color="#0071E3" aria-hidden="true" /> 新增使用者</div>
        </div>
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => { setOpen((v) => !v); setMsg(null); }}>{open ? '收起' : '新增'}</button>
      </div>
      {open ? (
        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}><span style={label}>Google 電郵 *</span>
              <input type="email" required value={f.email} onChange={set('email')} style={input} placeholder="name@gmail.com" autoComplete="off" /></label>
            <label style={{ display: 'grid', gap: 6 }}><span style={label}>姓名</span>
              <input value={f.name} onChange={set('name')} style={input} maxLength={60} placeholder="例如 陳大文" /></label>
            <label style={{ display: 'grid', gap: 6 }}><span style={label}>身分</span>
              <select value={f.role} onChange={set('role')} style={input}>
                <option value="student">學生</option><option value="teacher">老師</option><option value="parent">家長</option><option value="admin">管理員</option>
              </select></label>
            {f.role === 'student' || f.role === 'teacher' ? (
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={label}>{f.role === 'student' ? '班別' : '可查看的班別（逗號分隔，留空 = 全部）'}</span>
                <input value={f.class} onChange={set('class')} style={input} list="qc-add-classes" placeholder={f.role === 'student' ? '例如 5A' : '例如 5A, 5B'} maxLength={200} />
                <datalist id="qc-add-classes">{classes.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            ) : null}
            {f.role === 'parent' ? (
              <label style={{ display: 'grid', gap: 6 }}><span style={label}>子女電郵（逗號分隔）</span>
                <input value={f.children} onChange={set('children')} style={input} placeholder="child@gmail.com" /></label>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="qcBtn qcBtnPrimary" disabled={busy || !f.email.trim()}>{busy ? '加入中…' : '加入'}</button>
            {msg ? <span style={{ fontSize: 14, color: msg.bad ? '#B8000F' : '#1E7B34' }}>{msg.text}</span> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
