import React, { useState } from 'react';
import { lessonLoop } from '../services/api.js';
import { useToast } from '../components/Toast.jsx';

export default function Teacher() {
  const toast = useToast();
  const [loop, setLoop] = useState({ steps: [], assignment: [], insight: '', teacherSummary: [] });
  const [loopLoading, setLoopLoading] = useState(false);
  const [loopErr, setLoopErr] = useState('');

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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>AI 教學流程（lesson-loop）</div>
          <button type="button" onClick={onRunLoop} disabled={loopLoading} style={btnPrimary}>
            {loopLoading ? '產生中...' : '產生 lesson loop'}
          </button>
        </div>

        {loopErr ? (<div style={{ marginTop: 10, color: '#D70015', fontWeight: 600 }}>{loopErr}</div>) : null}

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

const btnPrimary = {
  border: 0,
  background: '#0071E3',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 600,
  cursor: 'pointer',
};

const sectionTitle = { fontWeight: 700, fontSize: 12, color: '#6E6E73' };
