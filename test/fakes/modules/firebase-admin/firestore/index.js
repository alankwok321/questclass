const state = require('../state.js');
const SERVER_TS = { __fake: 'serverTimestamp' };
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
      state.data[col][id] = opts.merge ? { ...(state.data[col][id] || {}), ...clone(payload) } : clone(payload);
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
  FieldValue: { serverTimestamp: () => SERVER_TS },
  SERVER_TS,
};
