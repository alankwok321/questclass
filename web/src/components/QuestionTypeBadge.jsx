import React from 'react';
import {
  CheckCircle2,
  HelpCircle,
  AlignLeft,
  List as ListIcon,
  ToggleLeft,
  ArrowRightLeft,
  BookOpen,
  Circle,
} from 'lucide-react';

export function getTypeIcon(type) {
  switch (String(type || '').toUpperCase()) {
    case 'TRUE_FALSE':
      return <ToggleLeft className="w-4 h-4" />;
    case 'MULTIPLE_CHOICE':
      return <ListIcon className="w-4 h-4" />;
    case 'FILL_IN_BLANK':
      return <HelpCircle className="w-4 h-4" />;
    case 'MATCHING':
      return <ArrowRightLeft className="w-4 h-4" />;
    case 'SHORT_ANSWER':
      return <AlignLeft className="w-4 h-4" />;
    case 'LONG_ANSWER':
      return <BookOpen className="w-4 h-4" />;
    default:
      return <Circle className="w-4 h-4" />;
  }
}

export function formatTypeLabel(type) {
  const t = String(type || '').toUpperCase();
  const labels = {
    TRUE_FALSE: '是非題',
    MULTIPLE_CHOICE: '選擇題',
    FILL_IN_BLANK: '填空題',
    MATCHING: '配對題',
    SHORT_ANSWER: '簡答題',
    LONG_ANSWER: '申論題',
  };
  return labels[t] || t || '—';
}

export default function QuestionTypeBadge({ type }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        background: 'rgba(0,122,255,0.10)',
        color: '#0B5FFF',
        fontWeight: 900,
        fontSize: 12,
        border: '1px solid rgba(17,24,39,0.10)',
      }}
    >
      {getTypeIcon(type)}
      {formatTypeLabel(type)}
    </span>
  );
}

export { CheckCircle2 };
