const state = require('../state.js');
const SERVER_TS = { __fake: 'serverTimestamp' };
const DELETE = { __fake: 'delete' };
const isDelete = (v) => v && typeof v === 'object' && v.__fake === 'delete';
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
function docRef(col, id) {
  return {
    id,
    async get() {
      const d = state.data[col]?.[id];
      return { id, exists: d !== undefined, data: () => clone(d) };
    },
    async set(payload, opts = {}) {
      state.writes.push({ path: `${col}/${id}`, data: clone(payload), opts: clone(opts) });
      state.data[col] = state.data[col] || {};
      const next = opts.merge ? { ...(state.data[col][id] || {}), ...clone(payload) } : clone(payload);
      for (const k of Object.keys(next)) if (isDelete(next[k])) delete next[k]; // FieldValue.delete() (top-level fields)
      state.data[col][id] = next;
    },
  };
}
const db = {
  collection(col) {
    return {
      doc: (id) => docRef(col, id),
      async get() {
        const docs = Object.keys(state.data[col] || {}).map((id) => ({ id, data: () => clone(state.data[col][id]) }));
        return { docs, size: docs.length };
      },
    };
  },
};
module.exports = {
  getFirestore: () => db,
  FieldValue: { serverTimestamp: () => SERVER_TS, delete: () => DELETE },
  SERVER_TS,
  DELETE,
};
