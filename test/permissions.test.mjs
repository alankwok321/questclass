import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canAccess, homePathFor, normalizeRole, isBlockedAccount, ROLES } from '../web/src/permissions.js';

const STAFF_PAGES = ['/dashboard', '/classroom', '/assignments', '/progress', '/reports', '/parents', '/teacher-homework',
  '/teacher-homework-legacy', '/teacher-homework-old', '/teacher-homework-old/x', '/teacher-homework-old/a/b', '/teacher-homework/123',
  '/teacher-question-bank', '/teacher-question-bank/new', '/teacher', '/teacher/sub'];
const ALL_PAGES = [...STAFF_PAGES, '/analytics', '/chat', '/student-homework', '/student-homework/abc', '/parent', '/parent/child', '/admin', '/admin/users'];

const expected = {
  admin: new Set(ALL_PAGES),
  teacher: new Set([...STAFF_PAGES, '/chat']),
  student: new Set(['/student-homework', '/student-homework/abc', '/chat']),
  parent: new Set(['/parent', '/parent/child']),
};

for (const role of Object.keys(expected)) {
  for (const page of ALL_PAGES) {
    const allowed = expected[role].has(page);
    test(`${role} ${allowed ? 'can' : 'cannot'} open ${page}`, () => {
      assert.equal(canAccess(role, page), allowed);
    });
  }
}

test('roles are case-insensitive and trimmed', () => {
  assert.equal(canAccess('Teacher', '/dashboard'), true);
  assert.equal(canAccess(' ADMIN ', '/admin'), true);
  assert.equal(canAccess('STUDENT', '/student-homework'), true);
  assert.equal(canAccess('Parent', '/parent'), true);
  assert.equal(canAccess('Student', '/dashboard'), false);
  assert.equal(normalizeRole('  TeAcHeR '), 'teacher');
});

test('unknown / empty roles are denied everywhere', () => {
  for (const role of ['', null, undefined, 'guest', 'superuser', 'teachers']) {
    for (const page of [...ALL_PAGES, '/']) assert.equal(canAccess(role, page), false, `${role} ${page}`);
  }
  assert.equal(normalizeRole('guest'), '');
});

test('unknown pages are denied for every role (incl. admin)', () => {
  for (const role of ROLES) {
    for (const page of ['/', '/nope', '/parentx', '/chatroom', '/administrator', '/studenthomework', '/dashboards']) {
      assert.equal(canAccess(role, page), false, `${role} ${page}`);
    }
  }
});

test('trailing slashes are ignored', () => {
  assert.equal(canAccess('teacher', '/dashboard/'), true);
  assert.equal(canAccess('parent', '/parent///'), true);
  assert.equal(canAccess('student', '/dashboard/'), false);
});

test('/parents (staff) and /parent (parent) are not confused', () => {
  assert.equal(canAccess('parent', '/parents'), false);
  assert.equal(canAccess('teacher', '/parent'), false);
});

test('homePathFor each role', () => {
  assert.equal(homePathFor('admin'), '/dashboard');
  assert.equal(homePathFor('teacher'), '/dashboard');
  assert.equal(homePathFor('Teacher'), '/dashboard');
  assert.equal(homePathFor('student'), '/student-homework');
  assert.equal(homePathFor('PARENT'), '/parent');
  assert.equal(homePathFor('guest'), '/');
  assert.equal(homePathFor(undefined), '/');
});

test('every role\'s home page is a page that role may open', () => {
  for (const role of ROLES) assert.equal(canAccess(role, homePathFor(role)), true, role);
});

test('isBlockedAccount', () => {
  assert.equal(isBlockedAccount({ accountStatus: 'Suspended' }), 'suspended');
  assert.equal(isBlockedAccount({ profile: { accountStatus: 'review' } }), 'review');
  assert.equal(isBlockedAccount({ accountStatus: 'active' }), '');
  assert.equal(isBlockedAccount(null), '');
});

test('every route in App.jsx has an access rule (admin can open it)', () => {
  const src = fs.readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');
  const routes = [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*').map((p) => p.replace(/\/\*$/, '/x'));
  assert.ok(routes.length >= 15);
  for (const r of routes) assert.equal(canAccess('admin', r), true, r);
});

test('every sidebar link in App.jsx points at a page with an access rule', () => {
  const src = fs.readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');
  const navBlock = src.slice(src.indexOf('const NAV_GROUPS'), src.indexOf('];', src.indexOf('const NAV_GROUPS')));
  const paths = [...navBlock.matchAll(/(?:to|path):\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(paths.length >= 10, `found ${paths.length}`);
  for (const p of paths) assert.equal(canAccess('admin', p), true, p);
});
