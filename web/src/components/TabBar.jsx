import React from 'react';
import { NavLink } from 'react-router-dom';

export default function TabBar({ tabs = [] }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          style={({ isActive }) => ({
            textDecoration: 'none',
            padding: '8px 12px',
            borderRadius: 999,
            fontWeight: 900,
            fontSize: 12,
            border: '1px solid rgba(17,24,39,0.10)',
            background: isActive ? 'rgba(0,122,255,0.12)' : '#F2F2F7',
            color: isActive ? '#0B5FFF' : '#111827',
          })}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
