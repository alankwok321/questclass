const state = require('../state.js');
module.exports = {
  getAuth() {
    state.authUsers = state.authUsers || {};
    const notFound = () => { const e = new Error('There is no user record corresponding to the provided identifier.'); e.code = 'auth/user-not-found'; return e; };
    return {
      async verifyIdToken(token) {
        const t = state.tokens[token];
        if (!t) { const e = new Error('Decoding Firebase ID token failed'); e.code = 'auth/argument-error'; throw e; }
        if (t instanceof Error) throw t;
        return { ...t };
      },
      async getUserByEmail(email) {
        const u = Object.values(state.authUsers || {}).find((x) => x.email === String(email).toLowerCase());
        if (!u) throw notFound();
        return { ...u };
      },
      async createUser(props) {
        state.authUsers = state.authUsers || {};
        const uid = props.uid || `auth${Object.keys(state.authUsers).length + 1}`;
        state.authUsers[uid] = { uid, email: String(props.email || '').toLowerCase(), displayName: props.displayName };
        return { ...state.authUsers[uid] };
      },
      async deleteUser(uid) {
        if (!state.authUsers?.[uid]) throw notFound();
        delete state.authUsers[uid];
      },
    };
  },
};
