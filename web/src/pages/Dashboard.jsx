import React from 'react';

function StatCard({ title, value, subtitle, tone }) {
  const tones = {
    green: { bg: 'rgba(52,199,89,0.10)', fg: '#34C759' },
    orange: { bg: 'rgba(255,149,0,0.10)', fg: '#FF9500' },
    red: { bg: 'rgba(255,59,48,0.10)', fg: '#FF3B30' },
    blue: { bg: 'rgba(0,122,255,0.10)', fg: '#007AFF' },
  };
  const t = tones[tone] || tones.blue;

  return (
    <div className="qcCard qcCardSoft" style={{ height: 160, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: 42, height: 42, borderRadius: 999, display: 'grid', placeItems: 'center', background: t.bg, color: t.fg, fontWeight: 900 }}>
          ↗
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#6B7280', marginBottom: 6 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#111827', letterSpacing: '-0.02em' }}>{value}</div>
          {subtitle ? <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF' }}>{subtitle}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="qcGrid4">
        <StatCard title="今日出席率" value="96%" subtitle="27/28 人已到" tone="green" />
        <StatCard title="待批改作業" value="12" subtitle="3 份即將逾期" tone="orange" />
        <StatCard title="學習預警" value="2" subtitle="名學生需關注" tone="red" />
        <StatCard title="班級平均" value="86.5" subtitle="數學小測驗" tone="blue" />
      </div>

      <div className="qcCard" style={{ padding: 24, borderRadius: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>主要功能</div>
          <div style={{ color: '#007AFF', fontWeight: 900, fontSize: 13 }}>查看全部</div>
        </div>
        <div style={{ color: '#6B7280', fontWeight: 700, lineHeight: 1.7 }}>
          這是新的 iPadOS 風格儀表板版面。接下來我會把舊版的真實資料讀取（Firestore classrooms/students/submissions）逐步接進來。
        </div>
      </div>
    </div>
  );
}
