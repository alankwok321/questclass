import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { importRoster } from '../services/api.js';
import { ROLE_LABEL, TEMPLATE, parseRosterRows } from '../services/roster.js';
import { useToast } from './Toast.jsx';

// Excel 匯入: rows for existing accounts update them; everyone else gets an account straight away
// (待審核 until they first sign in with that Google e-mail, which activates it).
export default function RosterImport({ schoolId, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const download = () => {
    const ws = XLSX.utils.aoa_to_sheet(TEMPLATE);
    ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 28 }];
    const help = XLSX.utils.aoa_to_sheet([
      ['欄位', '說明'],
      ['電郵', '必填。對方登入 QuestClass 用的 Google 帳戶電郵。'],
      ['姓名', '選填。會顯示在 QuestClass 的名字。'],
      ['身分', '學生、老師、家長或管理員（留空 = 學生）。'],
      ['班別', '學生：所屬班別（例如 5A）。老師：可以查看的班別，用逗號分隔（例如 5A, 5B）；留空 = 全部班別。'],
      ['子女電郵', '家長：子女的電郵，用逗號分隔（子女需已登入過 QuestClass 才會連結）。'],
    ]);
    help['!cols'] = [{ wch: 10 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '名單');
    XLSX.utils.book_append_sheet(wb, help, '說明');
    XLSX.writeFile(wb, 'QuestClass_名單範本.xlsx');
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseRosterRows(XLSX.utils.sheet_to_json(ws, { defval: '' }));
        if (!parsed.length) throw new Error('找不到資料。第一行要是標題（電郵、姓名、身分、班別）。');
        setRows(parsed);
      } catch (err) {
        setRows(null);
        toast?.show?.(`無法讀取檔案：${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const good = (rows || []).filter((r) => !r.error);
  const doImport = async () => {
    setBusy(true);
    try {
      const r = await importRoster(good.map(({ email, name, role, class: cls, children }) => ({ email, name, role, class: cls, children })), schoolId);
      setResult(r);
      setRows(null);
      onDone?.();
    } catch (e) {
      toast?.show?.(e?.message || '匯入失敗');
    } finally {
      setBusy(false);
    }
  };

  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 12, color: '#6E6E73', fontWeight: 600, borderBottom: '1px solid #E8E8ED', whiteSpace: 'nowrap' };
  const td = { padding: '6px 8px', fontSize: 13, borderBottom: '1px solid #F0F0F3', verticalAlign: 'top' };

  return (
    <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><FileSpreadsheet size={18} color="#1E7B34" aria-hidden="true" /> Excel 匯入</div>
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => setOpen((v) => !v)}>{open ? '收起' : '開始'}</button>
      </div>

      {open ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={download}><Download size={14} aria-hidden="true" /> 下載 Excel 範本</button>
            <label className="qcBtn qcBtnPrimary qcBtnSmall" style={{ cursor: 'pointer' }}>
              <Upload size={14} aria-hidden="true" /> 選擇 Excel／CSV 檔案
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
            </label>
            {fileName ? <span style={{ fontSize: 13, color: '#6E6E73', alignSelf: 'center' }}>{fileName}</span> : null}
          </div>

          {rows ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 14 }}>
                共 {rows.length} 行：<b>{good.length}</b> 行可以匯入{rows.length - good.length ? <span style={{ color: '#B8000F' }}>，{rows.length - good.length} 行有問題會略過</span> : null}
              </div>
              <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #E8E8ED', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>行</th><th style={th}>電郵</th><th style={th}>姓名</th><th style={th}>身分</th><th style={th}>班別</th><th style={th}>狀態</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line} style={{ background: r.error ? '#FFF5F5' : 'transparent' }}>
                        <td style={{ ...td, color: '#86868B' }}>{r.line}</td>
                        <td style={td}>{r.email}</td>
                        <td style={td}>{r.name}</td>
                        <td style={td}>{ROLE_LABEL[r.role] || r.role}</td>
                        <td style={td}>{r.role === 'parent' ? (r.children ? `子女：${r.children}` : '') : r.class || (r.role === 'teacher' ? '全部' : '')}</td>
                        <td style={{ ...td, color: r.error ? '#B8000F' : '#1E7B34', fontWeight: 600 }}>{r.error || '✓'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="qcBtn qcBtnPrimary" onClick={doImport} disabled={busy || !good.length}>{busy ? '匯入中…' : `匯入 ${good.length} 人`}</button>
                <button type="button" className="qcBtn qcBtnSecondary" onClick={() => { setRows(null); setFileName(''); }} disabled={busy}>取消</button>
              </div>
            </div>
          ) : null}

          {result ? (
            <div style={{ display: 'grid', gap: 6, fontSize: 14, background: '#F5F9F6', borderRadius: 12, padding: 12 }}>
              <div><b>完成：</b>已加入 {(result.updated?.length || 0) + (result.created?.length || 0)} 人{result.created?.length ? `（其中 ${result.created.length} 人狀態為待審核，第一次登入後自動啟用）` : ''}。</div>
              {result.skipped?.length ? (
                <div style={{ color: '#B8000F' }}>略過 {result.skipped.length} 行：{result.skipped.map((s) => `${s.email || `第 ${s.line} 行`}（${s.reason}）`).join('、')}</div>
              ) : null}
            </div>
          ) : null}

        </>
      ) : null}
    </div>
  );
}
