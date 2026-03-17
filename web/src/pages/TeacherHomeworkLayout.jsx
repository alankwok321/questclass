import React, { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import TabBar from '../components/TabBar.jsx';
import TeacherHomeworkList from './TeacherHomeworkList.jsx';

export default function TeacherHomeworkLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { to: '/teacher-homework/drafts', label: '草稿' },
    { to: '/teacher-homework/assigned', label: '已指派' },
    { to: '/teacher-homework/archived', label: '已封存' },
    { to: '/teacher-homework/new', label: '＋新增作業' },
  ];

  const status = useMemo(() => {
    const p = location.pathname || '';
    if (p.startsWith('/teacher-homework/drafts')) return 'draft';
    if (p.startsWith('/teacher-homework/archived')) return 'archived';
    // default
    return 'published';
  }, [location.pathname]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>作業</div>
            <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12, marginTop: 4 }}>
              Teams 風格：左側清單常駐，右側顯示詳情/編輯。
            </div>
          </div>
          <TabBar tabs={tabs} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <TeacherHomeworkList
            status={status}
            compact
            onSelect={(a) => navigate(`/teacher-homework/${a.id}`)}
            hideTitle
          />
        </div>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
