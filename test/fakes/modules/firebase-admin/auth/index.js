const state = require('../state.js');
module.exports = {
  getAuth() {
    return {
      async verifyIdToken(token) {
        const t = state.tokens[token];
        if (!t) { const e = new Error('Decoding Firebase ID token failed'); e.code = 'auth/argument-error'; throw e; }
        if (t instanceof Error) throw t;
        return { ...t };
      },
    };
  },
};
