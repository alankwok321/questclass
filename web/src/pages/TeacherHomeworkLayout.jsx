import React from 'react';
import { Outlet } from 'react-router-dom';
import TabBar from '../components/TabBar.jsx';

export default function TeacherHomeworkLayout() {
  const tabs = [
    { to: '/teacher-homework/drafts', label: '草稿' },
    { to: '/teacher-homework/assigned', label: '已指派' },
    { to: '/teacher-homework/archived', label: '已封存' },
    { to: '/teacher-homework/new', label: '＋新增作業' },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>作業</div>
            <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12, marginTop: 4 }}>
              風格參考：Microsoft Teams「指派作業」— 清單 / 詳情 / 編輯分開。
            </div>
          </div>
          <TabBar tabs={tabs} />
        </div>
      </div>

      <Outlet />
    </div>
  );
}
