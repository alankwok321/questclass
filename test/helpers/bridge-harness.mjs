// Loads public/js/firebase-bridge.js into a fresh fake `window` with an in-memory Firestore SDK.
import fs from 'node:fs';

const SOURCE = fs.readFileSync(new URL('../../public/js/firebase-bridge.js', import.meta.url), 'utf8');
export const TS = { __fake: 'serverTimestamp' };
const DOC_ID = { __fake: 'documentId' };

export function makeBridge(store = {}, { uid = null, email } = {}) {
  const writes = [];
  const queries = [];
  let autoId = 0;
  const auth = { uid, email };
  const clone = (v) => (v === undefined ? v : structuredClone(v));
  const snap = (col, id) => {
    const d = store[col]?.[id];
    return { id, exists: () => d !== undefined && d !== null, data: () => clone(d) };
  };
  const match = (col, id, c) => {
    const val = c.field === DOC_ID ? id : store[col][id]?.[c.field];
    switch (c.op) {
      case '==': return val === c.value;
      case 'in': return c.value.includes(val);
      case 'array-contains': return Array.isArray(val) && val.includes(c.value);
      default: throw new Error('fake sdk: unsupported op ' + c.op);
    }
  };
  const sdk = {
    collection: (db, col) => ({ kind: 'col', col }),
    doc: (a, col, id) => {
      if (a && a.kind === 'col' && col === undefined) return { kind: 'doc', col: a.col, id: `auto${++autoId}` };
      return { kind: 'doc', col, id };
    },
    getDoc: async (ref) => snap(ref.col, ref.id),
    query: (c, ...cons) => ({ kind: 'query', col: c.col, cons }),
    where: (field, op, value) => ({ type: 'where', field, op, value }),
    orderBy: (field, dir) => ({ type: 'orderBy', field, dir }),
    limit: (n) => ({ type: 'limit', n }),
    documentId: () => DOC_ID,
    getDocs: async (q) => {
      queries.push(q);
      const cons = q.cons || [];
      let ids = Object.keys(store[q.col] || {}).filter((id) => store[q.col][id] != null);
      for (const c of cons) if (c.type === 'where') ids = ids.filter((id) => match(q.col, id, c));
      const lim = cons.find((c) => c.type === 'limit');
      if (lim) ids = ids.slice(0, lim.n);
      return { docs: ids.map((id) => snap(q.col, id)), size: ids.length };
    },
    setDoc: async (ref, data, opts) => {
      writes.push({ path: `${ref.col}/${ref.id}`, data: clone(data), opts: clone(opts) });
    },
    deleteDoc: async (ref) => {
      writes.push({ path: `${ref.col}/${ref.id}`, deleted: true });
    },
    serverTimestamp: () => TS,
  };
  const window = {};
  new Function('window', SOURCE)(window);
  const fb = window.QuestClassFirebase;
  fb._ensure = async () => ({ db: {}, sdk });
  fb.waitForAuthState = async () => (auth.uid ? { uid: auth.uid, email: auth.email ?? `${auth.uid}@school.hk` } : null);
  return { fb, window, writes, queries, store, auth, setUser(u) { auth.uid = u; auth.email = undefined; } };
}
