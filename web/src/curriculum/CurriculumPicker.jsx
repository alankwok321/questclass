import React from 'react';
import { SUBJECTS, questionSubject, questionUnit, subjectInfo, subjectsFor, unitInfo, unitLabel, unitsFor } from './hk.js';

const groupBy = (units) => {
  const out = [];
  for (const u of units) {
    let g = out.find((x) => x.name === u.group);
    if (!g) { g = { name: u.group, units: [] }; out.push(g); }
    g.units.push(u);
  }
  return out;
};

/**
 * Subject + curriculum unit selects.
 * mode 'edit': choices are a value or "未分類".  mode 'filter': adds "全部" (no filter) and "未分類" (= '__none').
 */
export function CurriculumSelects({ subject = '', unit = '', level = '', onChange, mode = 'edit', style, selectStyle }) {
  const filter = mode === 'filter';
  // Keep the current subject in the list even when the level doesn't usually have it.
  const subjects = subjectsFor(level);
  const subjList = subject && subject !== '__none' && !subjects.some((s) => s.key === subject) ? [...subjects, subjectInfo(subject)].filter(Boolean) : subjects;
  const units = subject && subject !== '__none' ? unitsFor(subject, level) : [];
  const unitList = unit && unit !== '__none' && unitInfo(unit) && !units.some((u) => u.key === unit) ? [...units, unitInfo(unit)] : units;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, ...style }}>
      <select value={subject} style={selectStyle} aria-label="科目"
        onChange={(e) => onChange({ subject: e.target.value, unit: '' })}>
        <option value="">{filter ? '全部科目' : '科目：未分類'}</option>
        {filter && <option value="__none">未分類科目</option>}
        {subjList.map((s) => <option key={s.key} value={s.key}>{s.zh} {s.en}</option>)}
      </select>
      {(unitList.length > 0 || (filter && subject && subject !== '__none')) && (
        <select value={unit} style={selectStyle} aria-label="課題"
          onChange={(e) => onChange({ subject, unit: e.target.value })}>
          <option value="">{filter ? '全部課題' : '課題：未分類'}</option>
          {filter && <option value="__none">未分類課題</option>}
          {groupBy(unitList).map((g) => (
            <optgroup key={g.name} label={g.name}>
              {g.units.map((u) => <option key={u.key} value={u.key}>{unitLabel(u)}　{u.en}</option>)}
            </optgroup>
          ))}
        </select>
      )}
    </div>
  );
}

/** Small chips: 數學 · 25. 畢氏定理 (nothing when the question isn't tagged). */
export function CurriculumChips({ q, style }) {
  const s = subjectInfo(questionSubject(q));
  const u = unitInfo(questionUnit(q));
  if (!s && !u) return null;
  const chip = { padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' };
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', ...style }}>
      {s && <span style={{ ...chip, background: '#EEF5FF', color: '#0058B0' }}>{s.zh}</span>}
      {u && <span title={u.en} style={{ ...chip, background: '#F2EEFF', color: '#5E3BB7' }}>{unitLabel(u)}</span>}
    </span>
  );
}

/** Does a question pass the subject / unit filters? ('' = any, '__none' = untagged) */
export function matchesCurriculum(q, subject, unit) {
  const qs = questionSubject(q); const qu = questionUnit(q);
  if (subject === '__none' && qs) return false;
  if (subject && subject !== '__none' && qs !== subject) return false;
  if (unit === '__none' && qu) return false;
  if (unit && unit !== '__none' && qu !== unit) return false;
  return true;
}

export { SUBJECTS };
