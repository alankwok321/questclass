// Reading the Excel roster in the browser (web/src/services/roster.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const src = fs.readFileSync(new URL('../web/src/services/roster.js', import.meta.url), 'utf8');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qc-ro-')), 'roster.mjs');
fs.writeFileSync(tmp, src);
const { parseRosterRows } = await import(tmp);

test('Chinese or English headers, roles in either language, problems flagged', () => {
  const rows = parseRosterRows([
    { '電郵': ' A@X.HK ', '姓名': '陳大文', '身分': '學生', '班別': '5A' },
    { Email: 'b@x.hk', Name: 'Lee', Role: 'Teacher', 'Class (可教班別)': '5A, 5B' },
    { '電郵': 'nope', '身分': '學生' },
    { '電郵': 'c@x.hk', '身分': '校長' },
    { '電郵': 'a@x.hk', '身分': '學生' },
    { '電郵': '', '姓名': '' },
    { '電郵': 'd@x.hk' },
  ]);
  assert.deepEqual(rows.map((r) => [r.line, r.email, r.role, r.class, r.error]), [
    [2, 'a@x.hk', 'student', '5A', ''],
    [3, 'b@x.hk', 'teacher', '5A, 5B', ''],
    [4, 'nope', 'student', '', '電郵格式不正確'],
    [5, 'c@x.hk', '校長', '', '身分必須是 學生／老師／家長／管理員'],
    [6, 'a@x.hk', 'student', '', '重複的電郵'],
    [8, 'd@x.hk', 'student', '', ''],
  ]);
});
