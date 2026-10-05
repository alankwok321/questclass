'use strict';
// Parses every web/src .js/.jsx file with TypeScript's parser (React/Vite can't be installed here)
// and checks that every relative import points at a real file and a real export.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web', 'src');
const TS_CANDIDATES = [process.env.TYPESCRIPT_PATH, 'typescript', '/opt/node22/lib/node_modules/typescript'].filter(Boolean);
let ts = null;
for (const c of TS_CANDIDATES) { try { ts = require(c); break; } catch { /* try next */ } }

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const cache = new Map();
function parse(file) {
  if (!cache.has(file)) {
    const kind = file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS;
    cache.set(file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind));
  }
  return cache.get(file);
}

const EXTS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];
function resolve(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of EXTS) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const hasMod = (node, kind) => (ts.canHaveModifiers?.(node) ? ts.getModifiers(node) : node.modifiers)?.some((m) => m.kind === kind);
function bindingNames(name, out) {
  if (ts.isIdentifier(name)) out.add(name.text);
  else for (const el of name.elements || []) if (el.name) bindingNames(el.name, out);
}

function exportsOf(file, seen = new Set()) {
  const names = new Set();
  if (seen.has(file)) return names;
  seen.add(file);
  for (const st of parse(file).statements) {
    if (ts.isExportAssignment(st)) names.add('default');
    else if (ts.isExportDeclaration(st)) {
      if (st.exportClause && ts.isNamedExports(st.exportClause)) st.exportClause.elements.forEach((e) => names.add(e.name.text));
      else if (st.exportClause && ts.isNamespaceExport?.(st.exportClause)) names.add(st.exportClause.name.text);
      else if (st.moduleSpecifier) {
        const target = resolve(file, st.moduleSpecifier.text);
        if (target) exportsOf(target, seen).forEach((n) => n !== 'default' && names.add(n));
      }
    } else if (hasMod(st, ts.SyntaxKind.ExportKeyword)) {
      if (hasMod(st, ts.SyntaxKind.DefaultKeyword)) names.add('default');
      else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => bindingNames(d.name, names));
      else if (st.name) names.add(st.name.text);
    }
  }
  return names;
}

function importsOf(file) {
  const out = [];
  const sf = parse(file);
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const names = [];
      if (ts.isImportDeclaration(node) && node.importClause) {
        const c = node.importClause;
        if (c.name) names.push('default');
        if (c.namedBindings && ts.isNamedImports(c.namedBindings)) c.namedBindings.elements.forEach((e) => names.push((e.propertyName || e.name).text));
      }
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((e) => names.push((e.propertyName || e.name).text));
      }
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      out.push({ spec, names, line });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      out.push({ spec: node.arguments[0].text, names: [], line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const files = fs.existsSync(SRC) ? walk(SRC) : [];

test('found web/src source files', { skip: !ts && 'typescript not available' }, () => {
  assert.ok(files.length >= 20, `found ${files.length}`);
});

for (const file of files) {
  const rel = path.relative(ROOT, file);
  test(`parses: ${rel}`, { skip: !ts && 'typescript not available' }, () => {
    const diags = parse(file).parseDiagnostics || [];
    const msgs = diags.map((d) => {
      const { line, character } = parse(file).getLineAndCharacterOfPosition(d.start);
      return `${rel}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
    });
    assert.deepEqual(msgs, []);
  });

  test(`relative imports resolve: ${rel}`, { skip: !ts && 'typescript not available' }, () => {
    const problems = [];
    for (const imp of importsOf(file)) {
      if (!imp.spec.startsWith('./') && !imp.spec.startsWith('../')) continue;
      const target = resolve(file, imp.spec);
      if (!target) { problems.push(`${rel}:${imp.line} cannot find '${imp.spec}'`); continue; }
      if (!/\.(jsx?|mjs)$/.test(target) || !imp.names.length) continue;
      const exp = exportsOf(target);
      for (const n of imp.names) if (!exp.has(n)) problems.push(`${rel}:${imp.line} '${n}' is not exported by ${path.relative(ROOT, target)}`);
    }
    assert.deepEqual(problems, []);
  });
}

for (const rel of ['server.js', 'public/js/firebase-bridge.js', 'scripts/seed-firestore.js']) {
  const file = path.join(ROOT, rel);
  test(`parses: ${rel}`, { skip: (!ts && 'typescript not available') || (!fs.existsSync(file) && 'file missing') }, () => {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    assert.equal((sf.parseDiagnostics || []).length, 0);
  });
}

test('the import checker itself catches a missing export (self-check)', { skip: !ts && 'typescript not available' }, () => {
  const exp = exportsOf(path.join(SRC, 'permissions.js'));
  for (const n of ['canAccess', 'homePathFor', 'normalizeRole', 'isBlockedAccount', 'ROLES', 'PAGE_ACCESS']) assert.ok(exp.has(n), n);
  assert.ok(!exp.has('doesNotExist'));
});
