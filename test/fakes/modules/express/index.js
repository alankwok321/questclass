// Minimal stand-in for Express used by the test suite (the npm registry is not reachable here).
// It records route handlers so tests can call them directly with fake req/res objects.
function express() {
  const app = {
    routes: {},
    middleware: [],
    listening: false,
    use(...args) { app.middleware.push(args); return app; },
    get(p, h) { app.routes['GET ' + p] = h; return app; },
    post(p, h) { app.routes['POST ' + p] = h; return app; },
    listen() { app.listening = true; return { close() {} }; },
  };
  express.lastApp = app;
  return app;
}
express.json = (opts) => Object.assign(function jsonParser() {}, { kind: 'json', opts });
express.static = (dir, opts) => Object.assign(function serveStatic() {}, { kind: 'static', dir, opts });
module.exports = express;
