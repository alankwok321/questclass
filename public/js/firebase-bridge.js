window.QuestClassFirebase = {
  _app: null,
  _auth: null,
  _db: null,
  _sdk: null,
  _initResult: null,

  enabled() {
    const cfg = window.QUESTCLASS_FIREBASE_CONFIG;
    return !!(cfg && cfg.apiKey && cfg.projectId && cfg.appId);
  },

  mode() {
    return this.enabled() ? 'Firebase ready' : 'Demo mode';
  },

  async _loadSdk() {
    if (this._sdk) return this._sdk;
    const [appMod, authMod, firestoreMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js')
    ]);
    this._sdk = { ...appMod, ...authMod, ...firestoreMod };
    return this._sdk;
  },

  async _ensure() {
    if (!this.enabled()) return null;
    if (this._app && this._auth && this._db) {
      return { app: this._app, auth: this._auth, db: this._db, sdk: this._sdk };
    }

    const sdk = await this._loadSdk();
    const cfg = window.QUESTCLASS_FIREBASE_CONFIG;
    this._app = sdk.getApps().length ? sdk.getApp() : sdk.initializeApp(cfg);
    this._auth = sdk.getAuth(this._app);
    this._db = sdk.getFirestore(this._app);
    return { app: this._app, auth: this._auth, db: this._db, sdk };
  },

  async _loadProfile(uid) {
    const ready = await this._ensure();
    if (!ready) return null;
    const { db, sdk } = ready;
    try {
      const snap = await sdk.getDoc(sdk.doc(db, 'users', uid));
      if (!snap.exists()) return null;
      return snap.data() || null;
    } catch {
      return null;
    }
  },

  _normalizeUser(user, profile) {
    if (!user) return null;
    const email = user.email || '';
    const role = profile?.role || (email.includes('teacher') ? 'teacher' : 'student');
    const name = profile?.name || user.displayName || email.split('@')[0] || 'QuestClass User';
    return {
      uid: user.uid,
      email,
      name,
      role,
      profile: profile || null
    };
  },

  async init() {
    if (!this.enabled()) return { ok: false, mode: this.mode() };
    if (this._initResult) return this._initResult;

    const ready = await this._ensure();
    const { auth, sdk } = ready;

    this._initResult = await new Promise((resolve) => {
      const unsub = sdk.onAuthStateChanged(auth, async (user) => {
        unsub();
        if (!user) return resolve({ ok: true, mode: this.mode(), user: null });
        const profile = await this._loadProfile(user.uid);
        resolve({ ok: true, mode: this.mode(), user: this._normalizeUser(user, profile) });
      }, () => resolve({ ok: true, mode: this.mode(), user: null }));
    });

    return this._initResult;
  },

  async signIn(email, password) {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing' };
    const { auth, sdk } = ready;
    try {
      const cred = await sdk.signInWithEmailAndPassword(auth, email, password);
      const profile = await this._loadProfile(cred.user.uid);
      this._initResult = { ok: true, mode: this.mode(), user: this._normalizeUser(cred.user, profile) };
      return this._initResult;
    } catch (error) {
      return { ok: false, error: error?.message || 'Firebase sign-in failed' };
    }
  },

  async signInWithGoogle() {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing' };
    const { auth, sdk } = ready;
    try {
      const provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await sdk.signInWithPopup(auth, provider);
      const profile = await this._loadProfile(cred.user.uid);
      this._initResult = { ok: true, mode: this.mode(), user: this._normalizeUser(cred.user, profile) };
      return this._initResult;
    } catch (error) {
      return { ok: false, error: error?.message || 'Google sign-in failed' };
    }
  },

  async signOut() {
    const ready = await this._ensure();
    if (!ready) return { ok: true };
    const { auth, sdk } = ready;
    await sdk.signOut(auth);
    this._initResult = { ok: true, mode: this.mode(), user: null };
    return this._initResult;
  }
};
