import React from 'react';
import { NavLink } from 'react-router-dom';

// Apple-style segmented control built from router links.
export default function TabBar({ tabs = [] }) {
  return (
    <div
      role="tablist"
      style={{ display: 'inline-flex', flexWrap: 'wrap', padding: 2, borderRadius: 9, background: '#E3E3E8' }}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          role="tab"
          style={({ isActive }) => ({
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            height: 32,
            padding: '0 14px',
            borderRadius: 7,
            fontWeight: isActive ? 600 : 500,
            fontSize: 13,
            background: isActive ? '#FFFFFF' : 'transparent',
            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            color: '#1D1D1F',
          })}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
