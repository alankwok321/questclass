window.QuestClassFirebase = {
  _app: null,
  _auth: null,
  _db: null,
  _sdk: null,
  _initResult: null,
  _configPromise: null,
  _authReadyPromise: null,

  enabled() {
    const cfg = window.QUESTCLASS_FIREBASE_CONFIG;
    return !!(cfg && cfg.apiKey && cfg.projectId && cfg.appId);
  },

  mode() {
    return this.enabled() ? 'Firebase ready' : 'Demo mode';
  },

  async ensureConfig() {
    if (this.enabled()) return window.QUESTCLASS_FIREBASE_CONFIG;
    if (this._configPromise) return this._configPromise;

    this._configPromise = fetch('/api/runtime-config')
      .then((response) => response.ok ? response.json() : { firebase: null })
      .then((payload) => {
        window.QUESTCLASS_FIREBASE_CONFIG = payload?.firebase || null;
        return window.QUESTCLASS_FIREBASE_CONFIG;
      })
      .catch(() => {
        window.QUESTCLASS_FIREBASE_CONFIG = window.QUESTCLASS_FIREBASE_CONFIG || null;
        return window.QUESTCLASS_FIREBASE_CONFIG;
      });

    return this._configPromise;
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
    await this.ensureConfig();
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

  _normalizeUser(user, profile) {
    if (!user) return null;
    const email = user.email || '';
    const normalizedProfileRole = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : '';
    const derivedRole = email.includes('teacher') ? 'teacher' : 'student';
    const role = normalizedProfileRole || derivedRole;
    const name = profile?.name || user.displayName || email.split('@')[0] || 'QuestClass User';
    return {
      uid: user.uid,
      email,
      name,
      role,
      photoURL: profile?.photoURL || user.photoURL || '',
      requestedRole: profile?.requestedRole || '',
      learnerStage: profile?.learnerStage || '',
      roleNote: profile?.roleNote || '',
      profileRole: normalizedProfileRole || '',
      derivedRole,
      profile: profile || null
    };
  },

  _profileDocFromUser(user, profile = null) {
    const normalized = this._normalizeUser(user, profile);
    return {
      name: normalized.name,
      email: normalized.email,
      role: profile?.role || normalized.role,
      requestedRole: profile?.requestedRole || '',
      learnerStage: profile?.learnerStage || '',
      roleNote: profile?.roleNote || '',
      photoURL: normalized.photoURL || '',
      lastLoginAt: new Date().toISOString()
    };
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

  async _ensureProfile(user, profile = null) {
    const ready = await this._ensure();
    if (!ready || !user) return profile;
    const { db, sdk } = ready;
    const nextProfile = this._profileDocFromUser(user, profile);

    try {
      await sdk.setDoc(sdk.doc(db, 'users', user.uid), {
        ...nextProfile,
        role: profile?.role || nextProfile.role,
        createdAt: profile?.createdAt || sdk.serverTimestamp(),
        updatedAt: sdk.serverTimestamp()
      }, { merge: true });
      return { ...(profile || {}), ...nextProfile };
    } catch {
      return profile;
    }
  },

  async init() {
    await this.ensureConfig();
    if (!this.enabled()) return { ok: false, mode: this.mode() };
    if (this._initResult) return this._initResult;

    const ready = await this._ensure();
    const { auth, sdk } = ready;

    this._initResult = await new Promise((resolve) => {
      const unsub = sdk.onAuthStateChanged(auth, async (user) => {
        unsub();
        if (!user) return resolve({ ok: true, mode: this.mode(), user: null });
        let profile = await this._loadProfile(user.uid);
        profile = await this._ensureProfile(user, profile);
        resolve({ ok: true, mode: this.mode(), user: this._normalizeUser(user, profile) });
      }, () => resolve({ ok: true, mode: this.mode(), user: null }));
    });

    return this._initResult;
  },

  async waitForAuthState() {
    const ready = await this._ensure();
    if (!ready) return null;
    if (this._authReadyPromise) return this._authReadyPromise;
    const { auth, sdk } = ready;
    this._authReadyPromise = new Promise((resolve) => {
      const unsub = sdk.onAuthStateChanged(auth, (user) => {
        unsub();
        resolve(user || null);
      }, () => resolve(null));
    });
    return this._authReadyPromise;
  },

  async signIn(email, password) {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing' };
    const { auth, sdk } = ready;
    try {
      const cred = await sdk.signInWithEmailAndPassword(auth, email, password);
      let profile = await this._loadProfile(cred.user.uid);
      profile = await this._ensureProfile(cred.user, profile);
      this._authReadyPromise = Promise.resolve(cred.user);
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
      let profile = await this._loadProfile(cred.user.uid);
      profile = await this._ensureProfile(cred.user, profile);
      this._authReadyPromise = Promise.resolve(cred.user);
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
    this._authReadyPromise = Promise.resolve(null);
    this._initResult = { ok: true, mode: this.mode(), user: null };
    return this._initResult;
  },

  async saveMyProfile(input = {}) {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing' };
    const authUser = await this.waitForAuthState();
    if (!authUser) return { ok: false, error: '請先登入' };
    const { db, sdk } = ready;
    const ref = sdk.doc(db, 'users', authUser.uid);
    const existing = await this._loadProfile(authUser.uid);
    const payload = {
      name: String(input.name || existing?.name || authUser.displayName || '').trim(),
      email: authUser.email || existing?.email || '',
      learnerStage: String(input.learnerStage || '').trim(),
      requestedRole: String(input.requestedRole || '').trim(),
      roleNote: String(input.roleNote || '').trim(),
      photoURL: authUser.photoURL || existing?.photoURL || '',
      updatedAt: sdk.serverTimestamp(),
      lastLoginAt: existing?.lastLoginAt || new Date().toISOString()
    };
    try {
      await sdk.setDoc(ref, {
        ...payload,
        role: existing?.role || this._normalizeUser(authUser, existing).role,
        createdAt: existing?.createdAt || sdk.serverTimestamp()
      }, { merge: true });
      const profile = await this._loadProfile(authUser.uid);
      this._initResult = { ok: true, mode: this.mode(), user: this._normalizeUser(authUser, profile) };
      return this._initResult;
    } catch (error) {
      return { ok: false, error: error?.message || 'Profile save failed' };
    }
  },

  async _requireAdmin() {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing' };
    const authUser = await this.waitForAuthState();
    if (!authUser) return { ok: false, error: '請先登入' };
    const me = await this._loadProfile(authUser.uid);
    if (me?.role !== 'admin') return { ok: false, error: '只有 admin 可使用這個功能' };
    return { ok: true, authUser, me, ready };
  },

  async listUsers(limit = 50) {
    const adminCheck = await this._requireAdmin();
    if (!adminCheck.ok) return { ok: false, error: adminCheck.error, users: [] };
    const { db, sdk } = adminCheck.ready;
    try {
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'users'), sdk.limit(limit)));
      return {
        ok: true,
        users: snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }))
      };
    } catch (error) {
      return { ok: false, error: error?.message || 'User list failed', users: [] };
    }
  },

  async adminUpdateUserAccount(uid, input = {}) {
    const adminCheck = await this._requireAdmin();
    if (!adminCheck.ok) return { ok: false, error: adminCheck.error };
    const { db, sdk } = adminCheck.ready;
    const nextRole = ['student', 'teacher', 'admin'].includes(String(input.role || '').trim()) ? String(input.role).trim() : null;
    const nextStatus = ['active', 'review', 'suspended'].includes(String(input.accountStatus || '').trim()) ? String(input.accountStatus).trim() : 'active';
    const payload = {
      updatedAt: sdk.serverTimestamp(),
      accountStatus: nextStatus,
      adminNote: String(input.adminNote || '').trim(),
      disabledReason: String(input.disabledReason || '').trim(),
      resolvedAt: input.resolved ? new Date().toISOString() : '',
      issueFlag: !!input.issueFlag
    };
    if (nextRole) payload.role = nextRole;
    try {
      await sdk.setDoc(sdk.doc(db, 'users', uid), payload, { merge: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || 'Account update failed' };
    }
  }
};
