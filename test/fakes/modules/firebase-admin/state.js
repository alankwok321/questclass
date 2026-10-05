// Shared in-memory state for the fake firebase-admin subpath modules.
const state = {
  apps: [],
  initCalls: [],
  // token string -> decoded token, or an Error to throw
  tokens: {},
  // collection -> { docId -> data }
  data: {},
  writes: [],
  reset() {
    state.apps = [];
    state.initCalls = [];
    state.tokens = {};
    state.data = {};
    state.writes = [];
  },
};
module.exports = state;
