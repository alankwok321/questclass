const state = require('../state.js');
module.exports = {
  initializeApp(opts) { state.initCalls.push(opts); const app = { opts }; state.apps.push(app); return app; },
  cert(sa) { return { cert: sa }; },
  getApps() { return state.apps; },
};
