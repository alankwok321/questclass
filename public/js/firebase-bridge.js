window.QuestClassFirebase = {
  enabled() {
    return !!window.QUESTCLASS_FIREBASE_CONFIG;
  },
  mode() {
    return this.enabled() ? 'Firebase ready' : 'Demo mode';
  },
  async init() {
    return { ok: this.enabled(), mode: this.mode() };
  }
};
