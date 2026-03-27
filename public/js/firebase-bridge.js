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

  _plainValue(value) {
    if (value == null) return value;
    if (typeof value?.toDate === 'function') return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map((item) => this._plainValue(item));
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, this._plainValue(entry)]));
    }
    return value;
  },

  _docData(docSnap) {
    if (!docSnap?.exists()) return null;
    return { id: docSnap.id, ...this._plainValue(docSnap.data() || {}) };
  },

  async _loadProfile(uid) {
    const ready = await this._ensure();
    if (!ready) return null;
    const { db, sdk } = ready;
    try {
      const snap = await sdk.getDoc(sdk.doc(db, 'users', uid));
      return this._docData(snap);
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

  async getIdToken(forceRefresh = false) {
    const ready = await this._ensure();
    if (!ready) return null;
    const authUser = await this.waitForAuthState();
    if (!authUser) return null;
    try {
      return await authUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
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

  async _requireSignedIn() {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing' };
    const authUser = await this.waitForAuthState();
    if (!authUser) return { ok: false, error: '請先登入' };
    const me = await this._loadProfile(authUser.uid);
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
        users: snap.docs.map((doc) => ({ uid: doc.id, ...this._plainValue(doc.data()) }))
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
      adminNote: String(input.adminNote || '').trim()
    };

    if ('classroomIds' in input) {
      const raw = Array.isArray(input.classroomIds) ? input.classroomIds.join(',') : String(input.classroomIds || '');
      const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
      payload.classroomIds = ids;
    }
    if (nextRole) payload.role = nextRole;
    try {
      await sdk.setDoc(sdk.doc(db, 'users', uid), payload, { merge: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || 'Account update failed' };
    }
  },

  // Deprecated (we now use users/{uid} only)
  async listAllStudents() {
    return { ok: false, error: 'Deprecated: use users collection', students: [] };
  },

  _generateStudentId(input = {}) {
    const clean = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const fromUid = clean(input.userUid || '').slice(0, 12);
    const fromName = clean(input.name || '').slice(0, 12);
    const stamp = Date.now().toString(36).slice(-6);
    const base = fromName || fromUid || 'student';
    return `stu-${base}-${stamp}`;
  },

  // Deprecated (we now use users/{uid} only)
  async adminUpsertStudent() {
    return { ok: false, error: 'Deprecated: use users collection' };
  },

  // Deprecated (we now use users/{uid} only)
  async adminDeleteStudent() {
    return { ok: false, error: 'Deprecated: use users collection' };
  },

  // Deprecated (we now use users/{uid} only)
  async adminBindUserStudent() {
    return { ok: false, error: 'Deprecated: use users collection' };
  },

  async listClassrooms() {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, classrooms: [] };
    const { db, sdk } = check.ready;
    const me = check.me || {};

    // Teacher/student dropdown should be driven by users/{uid}.classroomIds (source of truth).
    // Admin can see all classrooms if the collection exists; otherwise fall back to user.classroomIds.
    try {
      if (String(me.role || '').toLowerCase() === 'admin') {
        const snap = await sdk.getDocs(sdk.collection(db, 'classrooms'));
        const classrooms = snap.docs.map((doc) => this._docData(doc)).filter(Boolean);
        if (classrooms.length) return { ok: true, classrooms };

        // Fallback when classrooms collection is empty / not used.
        const ids = Array.isArray(me.classroomIds) ? me.classroomIds : [];
        return { ok: true, classrooms: ids.map((id) => ({ id: String(id), name: String(id) })) };
      }

      const ids = Array.isArray(me.classroomIds) ? me.classroomIds : [];
      if (!ids.length) return { ok: true, classrooms: [] };
      // Return simple objects; editor/list pages only need id/name.
      return { ok: true, classrooms: ids.map((id) => ({ id: String(id), name: String(id) })) };
    } catch (error) {
      return { ok: false, error: error?.message || 'Classroom list failed', classrooms: [] };
    }
  },

  async createHomeworkAssignment(payload = {}) {
    // NOTE: Back-compat: this method now supports BOTH create and update.
    // - If payload.id is provided, we upsert that document.
    // - Otherwise, we create a new document with an auto id.

    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: false, error: 'Teacher/admin only' };
    }

    const cleanId = String(payload.id || '').trim();
    const isUpdate = Boolean(cleanId);

    const docRef = isUpdate
      ? sdk.doc(db, 'homeworkAssignments', cleanId)
      : sdk.doc(sdk.collection(db, 'homeworkAssignments'));

    const assignment = {
      id: docRef.id,
      title: String(payload.title || '').trim(),
      description: String(payload.description || '').trim(),
      dueAt: String(payload.dueAt || '').trim(),
      status: String(payload.status || 'published').trim(),
      totalPoints: Number(payload.totalPoints || 0),
      questions: Array.isArray(payload.questions) ? payload.questions : [],

      // On update, preserve createdBy/createdAt if they already exist.
      createdBy: isUpdate ? (payload.createdBy || check.authUser.uid) : check.authUser.uid,
      createdAt: isUpdate ? (payload.createdAt || sdk.serverTimestamp()) : sdk.serverTimestamp(),
      updatedAt: sdk.serverTimestamp(),
    };

    try {
      await sdk.setDoc(docRef, assignment, { merge: true });
      return { ok: true, assignmentId: docRef.id, updated: isUpdate };
    } catch (error) {
      return { ok: false, error: error?.message || (isUpdate ? 'Update homework failed' : 'Create homework failed') };
    }
  },

  async listHomeworkAssignments(limit = 50) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, items: [] };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: false, error: 'Teacher/admin only', items: [] };
    }

    try {
      const col = sdk.collection(db, 'homeworkAssignments');
      const q = sdk.query(col, sdk.orderBy('createdAt', 'desc'), sdk.limit(limit));
      const snap = await sdk.getDocs(q);
      const items = snap.docs.map((doc) => this._docData(doc)).filter(Boolean);
      return { ok: true, items };
    } catch (error) {
      return { ok: false, error: error?.message || 'Homework list failed', items: [] };
    }
  },

  async listMyHomework(limit = 50) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, items: [] };
    const { db, sdk } = check.ready;

    try {
      const col = sdk.collection(db, 'homeworkAssignments');
      const q = sdk.query(
        col,
        sdk.where('status', '==', 'published'),
        sdk.orderBy('createdAt', 'desc'),
        sdk.limit(limit)
      );
      const snap = await sdk.getDocs(q);
      const items = snap.docs.map((doc) => this._docData(doc)).filter(Boolean);
      return { ok: true, items };
    } catch (error) {
      return { ok: false, error: error?.message || 'My homework list failed', items: [] };
    }
  },

  async updateHomeworkAssignmentStatus(payload = {}) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: false, error: 'Teacher/admin only' };
    }

    const assignmentId = String(payload.assignmentId || '').trim();
    if (!assignmentId) return { ok: false, error: 'assignmentId required' };

    const status = String(payload.status || '').trim();
    if (!['draft', 'published', 'archived'].includes(status)) {
      return { ok: false, error: 'invalid status' };
    }

    try {
      const ref = sdk.doc(db, 'homeworkAssignments', assignmentId);
      // We keep this minimal to avoid accidentally overwriting other fields.
      await sdk.setDoc(ref, { status, updatedAt: sdk.serverTimestamp() }, { merge: true });
      return { ok: true, assignmentId, status };
    } catch (error) {
      return { ok: false, error: error?.message || 'Update status failed' };
    }
  },

  async upsertQuestionBankItem(payload = {}) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: false, error: 'Teacher/admin only' };
    }

    const cleanId = String(payload.id || '').trim();
    const isUpdate = Boolean(cleanId);

    const docRef = isUpdate
      ? sdk.doc(db, 'questionBank', cleanId)
      : sdk.doc(sdk.collection(db, 'questionBank'));

    // UI-aligned schema (mockDatabase-like). We also keep backward-compatible aliases.
    const type = String(payload.type || 'MULTIPLE_CHOICE').trim();
    const question_text = String(payload.question_text || payload.prompt || '').trim();

    const item = {
      id: docRef.id,
      type,
      topic: String(payload.topic || '').trim(),
      points: Number(payload.points || 1),
      timeLimitSec: Number(payload.timeLimitSec || 30),
      media: payload.media && typeof payload.media === 'object' ? payload.media : {},
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      difficulty: Number(payload.difficulty || 1),

      // targeting
      target_level: String(payload.target_level || '').trim(),

      // content
      question_text,
      options: Array.isArray(payload.options) ? payload.options : (Array.isArray(payload.choices) ? payload.choices : []),
      correct_answer: (typeof payload.correct_answer === 'boolean') ? payload.correct_answer : null,
      blanks: Array.isArray(payload.blanks) ? payload.blanks : [],
      pairs: Array.isArray(payload.pairs) ? payload.pairs : [],
      ideal_answer: String(payload.ideal_answer || '').trim(),
      grading_rubric: String(payload.grading_rubric || '').trim(),
      max_word_count: Number(payload.max_word_count || 0),

      // backward-compatible aliases
      prompt: question_text,
      choices: Array.isArray(payload.choices) ? payload.choices : [],
      correctChoiceIds: Array.isArray(payload.correctChoiceIds) ? payload.correctChoiceIds : [],

      createdBy: isUpdate ? (payload.createdBy || check.authUser.uid) : check.authUser.uid,
      createdAt: isUpdate ? (payload.createdAt || sdk.serverTimestamp()) : sdk.serverTimestamp(),
      updatedAt: sdk.serverTimestamp(),
    };

    try {
      await sdk.setDoc(docRef, item, { merge: true });
      return { ok: true, questionId: docRef.id, updated: isUpdate };
    } catch (error) {
      return { ok: false, error: error?.message || (isUpdate ? 'Update question failed' : 'Create question failed') };
    }
  },

  async getQuestionBankItemsByIds(ids = []) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, items: [] };
    const { db, sdk } = check.ready;
    const uniq = Array.from(new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (!uniq.length) return { ok: true, items: [] };

    try {
      const out = [];
      // Firestore IN limit is 10.
      for (let i = 0; i < uniq.length; i += 10) {
        const slice = uniq.slice(i, i + 10);
        const q = sdk.query(
          sdk.collection(db, 'questionBank'),
          sdk.where('id', 'in', slice)
        );
        const snap = await sdk.getDocs(q);
        snap.docs.forEach((d) => {
          const obj = this._docData(d);
          if (obj) out.push(obj);
        });
      }
      return { ok: true, items: out };
    } catch (error) {
      return { ok: false, error: error?.message || 'Get questions failed', items: [] };
    }
  },

  async listQuestionBank(limit = 200) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, items: [] };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: false, error: 'Teacher/admin only', items: [] };
    }

    try {
      const q = sdk.query(
        sdk.collection(db, 'questionBank'),
        sdk.orderBy('updatedAt', 'desc'),
        sdk.limit(limit)
      );
      const snap = await sdk.getDocs(q);
      const items = snap.docs.map((d) => this._docData(d)).filter(Boolean);
      return { ok: true, items };
    } catch (error) {
      return { ok: false, error: error?.message || 'List question bank failed', items: [] };
    }
  },

  async submitHomework(payload = {}) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error };
    const { db, sdk } = check.ready;

    const assignmentId = String(payload.assignmentId || '').trim();
    if (!assignmentId) return { ok: false, error: 'assignmentId required' };

    try {
      const aSnap = await sdk.getDoc(sdk.doc(db, 'homeworkAssignments', assignmentId));
      const a = this._docData(aSnap);
      if (!a) return { ok: false, error: 'assignment not found' };

      const answers = Array.isArray(payload.answers) ? payload.answers : [];
      const subId = `${assignmentId}_${check.authUser.uid}`;
      const docRef = sdk.doc(db, 'submissions', subId);
      const submission = {
        id: subId,
        assignmentId,
        studentUid: check.authUser.uid,
        assignmentTitle: a.title || '',
        topic: 'homework',
        status: 'submitted',
        answers,
        submittedAt: sdk.serverTimestamp(),
        updatedAt: sdk.serverTimestamp(),
      };

      await sdk.setDoc(docRef, submission, { merge: true });
      return { ok: true, submissionId: subId };
    } catch (error) {
      return { ok: false, error: error?.message || 'Submit failed' };
    }
  },

  async listStudentsForClassroom(classroomId) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, students: [] };
    const { db, sdk } = check.ready;
    try {
      const classroomSnap = await sdk.getDoc(sdk.doc(db, 'classrooms', classroomId));
      const classroom = this._docData(classroomSnap);
      if (!classroom) return { ok: false, error: 'Classroom not found', students: [] };

      // New: single source of truth = users/{uid} with classroomIds + studentProfile
      const snap = await sdk.getDocs(
        sdk.query(
          sdk.collection(db, 'users'),
          sdk.where('role', '==', 'student'),
          sdk.where('classroomIds', 'array-contains', classroomId),
          sdk.limit(100)
        )
      );

      const students = snap.docs.map((doc) => {
        const u = this._docData(doc);
        if (!u) return null;
        const profile = u.studentProfile || {};
        return {
          id: u.uid || doc.id,
          uid: u.uid || doc.id,
          name: u.name || '',
          classroomIds: u.classroomIds || [],
          studentProfile: profile,
        };
      }).filter(Boolean);

      return { ok: true, classroom, students };
    } catch (error) {
      return { ok: false, error: error?.message || 'Student list failed', students: [] };
    }
  },

  async getStudentDashboard() {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error };
    const { db, sdk } = check.ready;
    try {
      const me = check.me || {};
      const classroomIds = Array.isArray(me.classroomIds) ? me.classroomIds : [];

      const classrooms = classroomIds.length
        ? (await Promise.all(classroomIds.map(async (classroomId) => {
            try {
              const roomSnap = await sdk.getDoc(sdk.doc(db, 'classrooms', classroomId));
              return this._docData(roomSnap);
            } catch {
              return null;
            }
          }))).filter(Boolean)
        : [];

      let submissions = [];
      try {
        const submissionsSnap = await sdk.getDocs(
          sdk.query(
            sdk.collection(db, 'submissions'),
            sdk.where('studentUid', '==', check.authUser.uid),
            sdk.limit(12)
          )
        );
        submissions = submissionsSnap.docs.map((doc) => this._docData(doc)).filter(Boolean);
      } catch {
        submissions = [];
      }

      const student = {
        uid: me.uid || check.authUser.uid,
        name: me.name || '',
        classroomIds,
        studentProfile: me.studentProfile || {},
      };

      return {
        ok: true,
        student,
        summary: me.studentProfile || null,
        classrooms,
        submissions
      };
    } catch (error) {
      return { ok: false, error: error?.message || 'Student dashboard failed' };
    }
  },

  async listSubmissionsForAssignment(assignmentId, limit = 200) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, submissions: [] };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: false, error: 'Teacher/admin only', submissions: [] };
    }

    const aId = String(assignmentId || '').trim();
    if (!aId) return { ok: false, error: 'assignmentId required', submissions: [] };

    try {
      const q = sdk.query(
        sdk.collection(db, 'submissions'),
        sdk.where('assignmentId', '==', aId),
        sdk.orderBy('submittedAt', 'desc'),
        sdk.limit(limit)
      );
      const snap = await sdk.getDocs(q);
      const submissions = snap.docs.map((doc) => this._docData(doc)).filter(Boolean);

      // Fetch student names in one batch (up to 10 per IN query)
      const uids = [...new Set(submissions.map(s => s.studentUid).filter(Boolean))];
      const nameMap = {};
      for (let i = 0; i < uids.length; i += 10) {
        const slice = uids.slice(i, i + 10);
        try {
          const uSnap = await sdk.getDocs(
            sdk.query(sdk.collection(db, 'users'), sdk.where(sdk.documentId(), 'in', slice))
          );
          uSnap.docs.forEach(d => {
            const u = this._docData(d);
            if (u) nameMap[d.id] = u.name || u.email || d.id;
          });
        } catch { /* ignore */ }
      }

      const enriched = submissions.map(s => ({
        ...s,
        studentName: nameMap[s.studentUid] || s.studentUid || '未知學生',
      }));

      return { ok: true, submissions: enriched };
    } catch (error) {
      return { ok: false, error: error?.message || 'List submissions failed', submissions: [] };
    }
  },

  async getTeacherDashboard(classroomId = null) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error };
    const classroomsResult = await this.listClassrooms();
    if (!classroomsResult.ok) return { ok: false, error: classroomsResult.error || 'Classroom list failed' };
    const classrooms = classroomsResult.classrooms || [];
    const targetClassroomId = classroomId || classrooms[0]?.id;
    if (!targetClassroomId) return { ok: true, classrooms: [], classroom: null, students: [], submissions: [], metrics: [] };
    const studentResult = await this.listStudentsForClassroom(targetClassroomId);
    if (!studentResult.ok) return { ok: false, error: studentResult.error || 'Student list failed' };
    const { db, sdk } = check.ready;
    const submissionsSnap = await sdk.getDocs(sdk.query(sdk.collection(db, 'submissions'), sdk.where('classroomId', '==', targetClassroomId), sdk.limit(25)));
    const submissions = submissionsSnap.docs.map((doc) => this._docData(doc)).filter(Boolean);
    const students = studentResult.students || [];
    const avgMastery = students.length ? Math.round(students.reduce((sum, item) => sum + Number(item.studentProfile?.mastery || 0), 0) / students.length) : 0;
    const focusCount = students.filter((item) => Number(item.studentProfile?.mastery || 0) < 75).length;
    const completionRate = Number(studentResult.classroom?.completionRate || 0);
    const metrics = [
      { label: '班級完成率', value: `${completionRate}%` },
      { label: '平均掌握度', value: `${avgMastery}%` },
      { label: '需關注學生', value: `${focusCount} 人` },
      { label: '最近提交數', value: `${submissions.length} 筆` }
    ];
    return { ok: true, classrooms, classroom: studentResult.classroom, students, submissions, metrics };
  }
};
