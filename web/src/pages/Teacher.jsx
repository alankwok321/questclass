import React, { useEffect, useState } from 'react';
import { lessonLoop, upsertAiConfig } from '../services/api.js';
import { loadSettings, saveSettings, clearSettings } from '../services/settings.js';
import { getIdToken } from '../services/firebase.js';
import { useToast } from '../components/Toast.jsx';

export default function Teacher() {
  const toast = useToast();
  const [settings, setSettings] = useState(() => ({
    apiBaseUrl: '',
    apiModel: '',
    apiKey: '',
    aiStudentUid: '',
    ...loadSettings(),
  }));

  const [loop, setLoop] = useState({ steps: [], assignment: [], insight: '', teacherSummary: [] });
  const [loopLoading, setLoopLoading] = useState(false);
  const [loopErr, setLoopErr] = useState('');

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const onRunLoop = async () => {
    setLoopErr('');
    setLoopLoading(true);
    try {
      const data = await lessonLoop({
        topic: 'general',
        weakness: '',
        studentName: 'student',
        grade: ''
      });
      setLoop({
        steps: data.steps || [],
        assignment: data.assignment || [],
        insight: data.insight || '',
        teacherSummary: data.teacherSummary || []
      });
      toast.show('Lesson loop 已產生');
    } catch (e) {
      setLoopErr(e.message || 'lesson-loop failed');
      toast.show('Lesson loop 失敗');
    } finally {
      setLoopLoading(false);
    }
  };

  const onSaveRemote = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) {
        toast.show('請先登入 Firebase');
        return;
      }
      await upsertAiConfig({
        idToken,
        studentUid: String(settings.aiStudentUid || '').trim(),
        apiKey: settings.apiKey || '',
        apiBaseUrl: settings.apiBaseUrl || '',
        model: settings.apiModel || ''
      });
      toast.show('已儲存到 Firebase');
    } catch (e) {
      toast.show(e.message || 'Save to Firebase failed');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>AI / Auth 設定</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ fontWeight: 800, fontSize: 12, color: '#6B7280' }}>API Base URL</label>
          <input value={settings.apiBaseUrl || ''} onChange={(e) => setSettings(s => ({ ...s, apiBaseUrl: e.target.value }))} placeholder="https://openrouter.ai/api/v1" style={inputStyle} />

          <label style={{ fontWeight: 800, fontSize: 12, color: '#6B7280' }}>Model</label>
          <input value={settings.apiModel || ''} onChange={(e) => setSettings(s => ({ ...s, apiModel: e.target.value }))} placeholder="openai/gpt-4.1-mini" style={inputStyle} />

          <label style={{ fontWeight: 800, fontSize: 12, color: '#6B7280' }}>API Key</label>
          <input type="password" value={settings.apiKey || ''} onChange={(e) => setSettings(s => ({ ...s, apiKey: e.target.value }))} placeholder="sk-..." style={inputStyle} />

          <label style={{ fontWeight: 800, fontSize: 12, color: '#6B7280' }}>Student UID（由 admin/teacher 代設可填）</label>
          <input value={settings.aiStudentUid || ''} onChange={(e) => setSettings(s => ({ ...s, aiStudentUid: e.target.value }))} placeholder="留空=自己" style={inputStyle} />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <button type="button" onClick={() => { clearSettings(); setSettings({ apiBaseUrl: '', apiModel: '', apiKey: '', aiStudentUid: '' }); toast.show('已清除'); }} style={btnGhost}>清除</button>
            <button type="button" onClick={onSaveRemote} style={btnGhost}>儲存到 Firebase（給學生）</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>AI 教學流程（lesson-loop）</div>
          <button type="button" onClick={onRunLoop} disabled={loopLoading} style={btnPrimary}>
            {loopLoading ? '產生中...' : '產生 lesson loop'}
          </button>
        </div>

        {loopErr ? (<div style={{ marginTop: 10, color: '#B91C1C', fontWeight: 800 }}>{loopErr}</div>) : null}

        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <div>
            <div style={sectionTitle}>Steps</div>
            <ol style={{ margin: '6px 0 0 18px', color: '#374151', fontWeight: 600, lineHeight: 1.6 }}>
              {(loop.steps || []).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          <div>
            <div style={sectionTitle}>Assignment</div>
            <ul style={{ margin: '6px 0 0 18px', color: '#374151', fontWeight: 600, lineHeight: 1.6 }}>
              {(loop.assignment || []).map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
          <div>
            <div style={sectionTitle}>Insight</div>
            <div style={{ marginTop: 6, color: '#374151', fontWeight: 600, lineHeight: 1.6 }}>{loop.insight || '—'}</div>
          </div>
          <div>
            <div style={sectionTitle}>Teacher Summary</div>
            <ol style={{ margin: '6px 0 0 18px', color: '#374151', fontWeight: 600, lineHeight: 1.6 }}>
              {(loop.teacherSummary || []).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  outline: 'none',
  fontWeight: 700,
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

const btnGhost = {
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  color: '#007AFF',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 900,
  cursor: 'pointer',
};

const sectionTitle = { fontWeight: 900, fontSize: 12, color: '#6B7280' };
