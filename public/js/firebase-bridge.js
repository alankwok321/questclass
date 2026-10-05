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
    // New accounts are students until an admin changes the role. (Guessing "teacher" from the
    // email address let anyone with "teacher" in their Gmail name get teacher pages.)
    const derivedRole = 'student';
    const role = normalizedProfileRole || derivedRole;
    const name = profile?.name || user.displayName || email.split('@')[0] || 'QuestClass User';
    return {
      uid: user.uid,
      email,
      name,
      role,
      photoURL: profile?.photoURL || user.photoURL || '',
      schoolId: String(profile?.schoolId || ''),
      platformAdmin: profile?.platformAdmin === true,
      class: String(profile?.class || ''),
      accountStatus: String(profile?.accountStatus || 'active').toLowerCase(),
      childUids: Array.isArray(profile?.childUids) ? profile.childUids : [],
      profileRole: normalizedProfileRole || '',
      derivedRole,
      profile: profile || null
    };
  },

  // A brand-new account: a student awaiting approval by their school's admin.
  _profileDocFromUser(user) {
    const normalized = this._normalizeUser(user, null);
    return {
      name: normalized.name,
      email: normalized.email,
      role: 'student',
      accountStatus: 'review',
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
      if (profile) {
        // Existing profile: the rules only let a user change these keys on their own doc.
        // (Re-sending createdAt/email/role here was rejected as "insufficient permissions".)
        const selfUpdate = {
          photoURL: nextProfile.photoURL,
          lastLoginAt: nextProfile.lastLoginAt,
          updatedAt: sdk.serverTimestamp()
        };
        await sdk.setDoc(sdk.doc(db, 'users', user.uid), selfUpdate, { merge: true });
        return { ...profile, photoURL: selfUpdate.photoURL, lastLoginAt: selfUpdate.lastLoginAt };
      }
      await sdk.setDoc(sdk.doc(db, 'users', user.uid), {
        ...nextProfile,
        createdAt: sdk.serverTimestamp(),
        updatedAt: sdk.serverTimestamp()
      });
      return { ...nextProfile };
    } catch {
      return profile;
    }
  },

  // Lets the server promote accounts listed in its ADMIN_EMAILS setting, then reloads the profile.
  async _syncServerRole(user, profile) {
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/auth/sync-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.changed) return (await this._loadProfile(user.uid)) || profile;
    } catch {
      // Server unreachable: keep the profile as it is.
    }
    return profile;
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
        profile = await this._syncServerRole(user, profile);
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
      profile = await this._syncServerRole(cred.user, profile);
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
      profile = await this._syncServerRole(cred.user, profile);
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

  // ── Schools ────────────────────────────────────────────────────────────────
  async listSchools() {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing', schools: [] };
    const { db, sdk } = ready;
    try {
      const snap = await sdk.getDocs(sdk.collection(db, 'schools'));
      const schools = snap.docs.map((d) => this._docData(d)).filter(Boolean)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
      return { ok: true, schools };
    } catch (error) {
      return { ok: false, error: error?.message || '載入學校失敗', schools: [] };
    }
  },

  async getSchool(schoolId) {
    const ready = await this._ensure();
    if (!ready || !schoolId) return null;
    const { db, sdk } = ready;
    try {
      return this._docData(await sdk.getDoc(sdk.doc(db, 'schools', String(schoolId))));
    } catch {
      return null;
    }
  },

  // A new account (still awaiting approval) chooses which school to join.
  async joinSchool(schoolId) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error };
    const { db, sdk } = check.ready;
    const id = String(schoolId || '').trim();
    if (!id) return { ok: false, error: '請選擇學校' };
    try {
      await sdk.setDoc(sdk.doc(db, 'users', check.authUser.uid), { schoolId: id, updatedAt: sdk.serverTimestamp() }, { merge: true });
      const profile = await this._loadProfile(check.authUser.uid);
      this._initResult = { ok: true, mode: this.mode(), user: this._normalizeUser(check.authUser, profile) };
      return this._initResult;
    } catch (error) {
      return { ok: false, error: /permission/i.test(String(error?.code || error?.message)) ? '你的帳戶已加入學校，請聯絡學校管理員轉校。' : (error?.message || '加入學校失敗') };
    }
  },

  async _requireAdmin() {
    const ready = await this._ensure();
    if (!ready) return { ok: false, error: 'Firebase config missing' };
    const authUser = await this.waitForAuthState();
    if (!authUser) return { ok: false, error: '請先登入' };
    const me = await this._loadProfile(authUser.uid);
    if (String(me?.role || '').trim().toLowerCase() !== 'admin') return { ok: false, error: '只有 admin 可使用這個功能' };
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

  // School admin: their school's users. Platform admin: everyone, or one school ('' = no school yet).
  async listUsers(limit = 500, opts = {}) {
    const adminCheck = await this._requireAdmin();
    if (!adminCheck.ok) return { ok: false, error: adminCheck.error, users: [] };
    const { db, sdk } = adminCheck.ready;
    const me = adminCheck.me || {};
    try {
      let q;
      if (me.platformAdmin === true) {
        q = 'schoolId' in opts
          ? sdk.query(sdk.collection(db, 'users'), sdk.where('schoolId', '==', String(opts.schoolId || '')), sdk.limit(limit))
          : sdk.query(sdk.collection(db, 'users'), sdk.limit(limit));
      } else {
        if (!me.schoolId) return { ok: false, error: '你的帳戶尚未加入學校', users: [] };
        q = sdk.query(sdk.collection(db, 'users'), sdk.where('schoolId', '==', me.schoolId), sdk.limit(limit));
      }
      const snap = await sdk.getDocs(q);
      let users = snap.docs.map((doc) => ({ uid: doc.id, ...this._plainValue(doc.data()) }));
      // Users created before schools existed have no schoolId field at all.
      if (me.platformAdmin === true && opts.schoolId === '') {
        const all = await sdk.getDocs(sdk.query(sdk.collection(db, 'users'), sdk.limit(limit)));
        users = all.docs.map((doc) => ({ uid: doc.id, ...this._plainValue(doc.data()) })).filter((u) => !u.schoolId);
      }
      return { ok: true, users };
    } catch (error) {
      return { ok: false, error: error?.message || 'User list failed', users: [] };
    }
  },

  async adminUpdateUserAccount(uid, input = {}) {
    const adminCheck = await this._requireAdmin();
    if (!adminCheck.ok) return { ok: false, error: adminCheck.error };
    const { db, sdk } = adminCheck.ready;
    const me = adminCheck.me || {};
    const nextRole = ['student', 'teacher', 'admin', 'parent'].includes(String(input.role || '').trim()) ? String(input.role).trim() : null;
    const nextStatus = ['active', 'review', 'suspended'].includes(String(input.accountStatus || '').trim()) ? String(input.accountStatus).trim() : 'active';
    const payload = {
      updatedAt: sdk.serverTimestamp(),
      accountStatus: nextStatus,
    };
    if (nextRole) payload.role = nextRole;
    if ('class' in input) payload.class = String(input.class || '').trim().slice(0, 40);
    if ('childUids' in input) {
      payload.childUids = Array.from(new Set((Array.isArray(input.childUids) ? input.childUids : [])
        .map((s) => String(s || '').trim()).filter(Boolean)));
    }
    // Moving someone to another school is for the platform admin only.
    if ('schoolId' in input && me.platformAdmin === true) {
      payload.schoolId = String(input.schoolId || '');
      // Taken out of every school: back to awaiting approval.
      if (!payload.schoolId) payload.accountStatus = 'review';
    }
    try {
      await sdk.setDoc(sdk.doc(db, 'users', uid), payload, { merge: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || 'Account update failed' };
    }
  },

  // Classes in my school: every 班別 that a student has.
  async listClassrooms() {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, classrooms: [] };
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: true, classrooms: me.class ? [{ id: me.class, name: me.class }] : [] };
    }
    const res = await this.listStudents(1000);
    if (!res.ok) return { ok: false, error: res.error, classrooms: [] };
    const names = [...new Set(res.students.map((s) => String(s.class || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
    return { ok: true, classrooms: names.map((n) => ({ id: n, name: n })) };
  },

  // ── Answer keys ────────────────────────────────────────────────────────────
  // homeworkAssignments is readable by students, so the questions stored there carry no answers.
  // The full questions (with answers) live in homeworkAnswerKeys/{assignmentId}, staff-only.
  _dropUndefined(v) {
    if (Array.isArray(v)) return v.map((x) => this._dropUndefined(x));
    if (v && typeof v === 'object' && !(typeof v.toDate === 'function')) {
      const out = {};
      Object.entries(v).forEach(([k, x]) => { if (x !== undefined) out[k] = this._dropUndefined(x); });
      return out;
    }
    return v;
  },

  _questionHasAnswers(q) {
    if (!q || typeof q !== 'object') return false;
    if (q.correct_answer != null || q.answer != null || q.answerKey != null) return true;
    if (String(q.ideal_answer || '').trim() || String(q.grading_rubric || '').trim()) return true;
    if (Array.isArray(q.correctChoiceIds) && q.correctChoiceIds.length) return true;
    if ((q.options || q.choices || []).some((o) => o && typeof o === 'object' && 'is_correct' in o)) return true;
    if ((q.blanks || []).some((b) => b && typeof b === 'object' && 'accepted' in b)) return true;
    if ((q.pairs || []).some((p) => p && typeof p === 'object' && 'match' in p)) return true;
    return false;
  },

  _hasAnswers(questions) {
    return Array.isArray(questions) && questions.some((q) => this._questionHasAnswers(q));
  },

  // What a student may see of a question: the prompt and choices, never which choice is right.
  _publicQuestion(q) {
    if (!q || typeof q !== 'object') return q;
    // eslint-disable-next-line no-unused-vars
    const { correct_answer, answer, answerKey, ideal_answer, grading_rubric, correctChoiceIds, ...rest } = q;
    const out = { ...rest };
    const choice = (o) => (o && typeof o === 'object'
      ? this._dropUndefined({ id: o.id, value: o.value, text: o.text })
      : o);
    if (Array.isArray(q.options)) out.options = q.options.map(choice);
    if (Array.isArray(q.choices)) out.choices = q.choices.map(choice);
    if (Array.isArray(q.blanks)) out.blanks = q.blanks.map((b) => this._dropUndefined({ position: b?.position }));
    if (Array.isArray(q.pairs)) {
      out.pairs = q.pairs.map((p) => this._dropUndefined({ prompt: p?.prompt }));
      // The right-hand column, shuffled, so the pairing isn't given away by order.
      const matches = q.pairs.map((p) => p?.match).filter((m) => m != null);
      for (let i = matches.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [matches[i], matches[j]] = [matches[j], matches[i]];
      }
      out.matchOptions = matches;
    }
    return this._dropUndefined(out);
  },

  _publicQuestions(questions) {
    return (Array.isArray(questions) ? questions : []).map((q) => this._publicQuestion(q));
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
    if (!me.schoolId) return { ok: false, error: '你的帳戶尚未加入學校' };

    const cleanId = String(payload.id || '').trim();
    const isUpdate = Boolean(cleanId);

    const docRef = isUpdate
      ? sdk.doc(db, 'homeworkAssignments', cleanId)
      : sdk.doc(sdk.collection(db, 'homeworkAssignments'));

    // Build target object (strip undefined so Firestore doesn't reject)
    const targetType = String(payload.targetType || 'all').trim();
    const targetClass = targetType === 'class' ? String(payload.targetClass || '').trim() : '';
    const targetStudentUids = targetType === 'students'
      ? (Array.isArray(payload.targetStudentUids) ? payload.targetStudentUids : [])
      : [];

    const assignment = {
      id: docRef.id,
      schoolId: me.schoolId,
      title: String(payload.title || '').trim(),
      description: String(payload.description || '').trim(),
      dueAt: String(payload.dueAt || '').trim(),
      status: String(payload.status || 'published').trim(),
      totalPoints: Number(payload.totalPoints || 0),
      // Students can read this document, so it only gets the answer-free version.
      questions: this._publicQuestions(payload.questions),
      targetType,
      targetClass,
      targetStudentUids,

      updatedAt: sdk.serverTimestamp(),
    };

    try {
      const existing = isUpdate ? this._docData(await sdk.getDoc(docRef)) : null;
      if (existing) {
        // Leave createdBy/createdAt untouched (re-sending them as strings broke the rules check).
        if (String(me.role || '').toLowerCase() !== 'admin' && existing.createdBy && existing.createdBy !== check.authUser.uid) {
          return { ok: false, error: '只有建立這份作業的老師或管理員可以修改。' };
        }
      } else {
        assignment.createdBy = check.authUser.uid;
        assignment.createdAt = sdk.serverTimestamp();
      }
      // Answer key first, so a homework is never saved without its answers.
      if (existing && existing.schoolId && existing.schoolId !== me.schoolId) {
        return { ok: false, error: '這份作業屬於其他學校。' };
      }
      await sdk.setDoc(sdk.doc(db, 'homeworkAnswerKeys', docRef.id), {
        assignmentId: docRef.id,
        schoolId: me.schoolId,
        questions: this._dropUndefined(Array.isArray(payload.questions) ? payload.questions : []),
        updatedBy: check.authUser.uid,
        updatedAt: sdk.serverTimestamp(),
      });
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

    if (!me.schoolId) return { ok: false, error: '你的帳戶尚未加入學校', items: [] };

    try {
      // Filter by school only and sort here, so no composite index is needed.
      const q = sdk.query(sdk.collection(db, 'homeworkAssignments'), sdk.where('schoolId', '==', me.schoolId), sdk.limit(500));
      const snap = await sdk.getDocs(q);
      const items = snap.docs.map((doc) => this._docData(doc)).filter(Boolean)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, limit);

      // Staff see the full questions (with answers) from the answer keys.
      const keys = {};
      try {
        const keySnap = await sdk.getDocs(sdk.query(sdk.collection(db, 'homeworkAnswerKeys'), sdk.where('schoolId', '==', me.schoolId), sdk.limit(1000)));
        keySnap.docs.forEach((d) => { const k = this._docData(d); if (k) keys[d.id] = k; });
      } catch {
        // Rules not deployed yet: fall back to whatever the homework doc holds.
      }

      const isAdmin = String(me.role || '').toLowerCase() === 'admin';
      let migrated = 0;
      for (const item of items) {
        if (keys[item.id] && Array.isArray(keys[item.id].questions)) {
          item.questions = keys[item.id].questions;
          continue;
        }
        // Older homework still has answers inside the student-readable doc: move them into an
        // answer key (only for homework this user may edit).
        if (this._hasAnswers(item.questions) && (isAdmin || item.createdBy === check.authUser.uid)) {
          try {
            await sdk.setDoc(sdk.doc(db, 'homeworkAnswerKeys', item.id), {
              assignmentId: item.id,
              schoolId: me.schoolId,
              questions: this._dropUndefined(item.questions),
              updatedBy: check.authUser.uid,
              updatedAt: sdk.serverTimestamp(),
            });
            await sdk.setDoc(sdk.doc(db, 'homeworkAssignments', item.id), {
              questions: this._publicQuestions(item.questions),
              updatedAt: sdk.serverTimestamp(),
            }, { merge: true });
            migrated += 1;
          } catch {
            // Leave it for a later attempt (e.g. rules not deployed yet).
          }
        }
      }
      return { ok: true, items, migrated };
    } catch (error) {
      return { ok: false, error: error?.message || 'Homework list failed', items: [] };
    }
  },

  async listMyHomework(limit = 50) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, items: [] };
    const me = check.me || {};
    if (!me.schoolId) return { ok: true, items: [] };
    try {
      const all = await this._publishedHomework(me.schoolId, limit);
      return { ok: true, items: this._homeworkFor(all, check.authUser.uid, me) };
    } catch (error) {
      return { ok: false, error: error?.message || 'My homework list failed', items: [] };
    }
  },

  async _publishedHomework(schoolId, limit = 50) {
    const { db, sdk } = await this._ensure();
    const q = sdk.query(sdk.collection(db, 'homeworkAssignments'),
      sdk.where('schoolId', '==', String(schoolId || '')), sdk.where('status', '==', 'published'), sdk.limit(limit));
    const snap = await sdk.getDocs(q);
    return snap.docs.map((doc) => this._docData(doc)).filter(Boolean);
  },

  // Homework a given student should see: everything for the whole school, their 班別's
  // homework (matched case-insensitively), and homework assigned to them by name.
  _homeworkFor(all, uid, userDoc) {
    const norm = (v) => String(v || '').trim().toLowerCase();
    const myClass = norm(userDoc?.class);
    return all.filter((a) => {
      const t = a.targetType || 'all';
      if (t === 'all') return true;
      if (t === 'class') return Boolean(a.targetClass) && Boolean(myClass) && norm(a.targetClass) === myClass;
      if (t === 'students') return Array.isArray(a.targetStudentUids) && a.targetStudentUids.includes(uid);
      return true; // unknown type → show
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  // Parent view: each linked child with their homework and submissions (read-only).
  async getMyChildrenOverview() {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, children: [] };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    const role = String(me.role || '').toLowerCase();
    if (!['parent', 'admin'].includes(role)) return { ok: false, error: '只有家長可以查看這一頁。', children: [] };

    const childUids = Array.isArray(me.childUids) ? me.childUids.filter(Boolean) : [];
    if (!childUids.length) return { ok: true, children: [] };

    try {
      let all = [];
      try {
        all = me.schoolId ? await this._publishedHomework(me.schoolId, 100) : [];
      } catch {
        all = []; // show the children's results even if homework can't be loaded
      }
      const children = [];
      for (const childUid of childUids) {
        let child = null;
        try {
          child = this._docData(await sdk.getDoc(sdk.doc(db, 'users', childUid)));
        } catch {
          child = null;
        }
        if (!child) continue;
        let submissions = [];
        try {
          const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'submissions'),
            sdk.where('schoolId', '==', String(me.schoolId || '')), sdk.where('studentUid', '==', childUid), sdk.limit(100)));
          submissions = snap.docs.map((d) => this._docData(d)).filter(Boolean)
            .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
        } catch {
          submissions = [];
        }
        children.push({
          uid: childUid,
          name: child.name || '',
          class: child.class || '',
          studentProfile: child.studentProfile || {},
          homework: this._homeworkFor(all, childUid, child),
          submissions,
        });
      }
      return { ok: true, children };
    } catch (error) {
      return { ok: false, error: error?.message || '載入子女資料失敗', children: [] };
    }
  },

  async listStudents(limit = 200) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, students: [] };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!['teacher', 'admin'].includes(String(me.role || '').toLowerCase())) {
      return { ok: false, error: 'Teacher/admin only', students: [] };
    }
    if (!me.schoolId) return { ok: false, error: '你的帳戶尚未加入學校', students: [] };
    try {
      const q = sdk.query(
        sdk.collection(db, 'users'),
        sdk.where('schoolId', '==', me.schoolId),
        sdk.where('role', '==', 'student'),
        sdk.limit(limit)
      );
      const snap = await sdk.getDocs(q);
      const students = snap.docs.map((doc) => this._docData(doc)).filter(Boolean)
        .sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''));
      return { ok: true, students };
    } catch (error) {
      return { ok: false, error: error?.message || 'List students failed', students: [] };
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
      const existing = this._docData(await sdk.getDoc(ref));
      if (!existing || existing.schoolId !== me.schoolId) return { ok: false, error: '找不到這份作業' };
      if (String(me.role || '').toLowerCase() !== 'admin' && existing.createdBy && existing.createdBy !== check.authUser.uid) {
        return { ok: false, error: '只有建立這份作業的老師或管理員可以更改狀態。' };
      }
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

      // soft delete (hard deletes are admin-only in the rules)
      deleted: Boolean(payload.deleted),

      // backward-compatible aliases
      prompt: question_text,
      choices: Array.isArray(payload.choices) ? payload.choices : [],
      correctChoiceIds: Array.isArray(payload.correctChoiceIds) ? payload.correctChoiceIds : [],

      updatedAt: sdk.serverTimestamp(),
    };

    try {
      if (!me.schoolId) return { ok: false, error: '你的帳戶尚未加入學校' };
      const existing = isUpdate ? this._docData(await sdk.getDoc(docRef)) : null;
      if (existing) {
        if (existing.schoolId !== me.schoolId) {
          return { ok: false, error: '這是其他學校共享的題目，只可以檢視和加入作業，不能修改。' };
        }
        if (String(me.role || '').toLowerCase() !== 'admin' && existing.createdBy && existing.createdBy !== check.authUser.uid) {
          return { ok: false, error: '只有建立這條題目的老師或管理員可以修改。' };
        }
      } else {
        // New questions follow the school's 共享題庫 setting.
        const school = await this.getSchool(me.schoolId);
        item.schoolId = me.schoolId;
        item.shared = school?.shareQuestionBank === true;
        item.createdBy = check.authUser.uid;
        item.createdAt = sdk.serverTimestamp();
      }
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
      // One read per question (a shared question from another school is allowed one by one).
      const docs = await Promise.all(uniq.map(async (id) => {
        try { return this._docData(await sdk.getDoc(sdk.doc(db, 'questionBank', id))); } catch { return null; }
      }));
      return { ok: true, items: docs.filter(Boolean) };
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

    if (!me.schoolId) return { ok: false, error: '你的帳戶尚未加入學校', items: [] };

    try {
      const col = sdk.collection(db, 'questionBank');
      const mine = await sdk.getDocs(sdk.query(col, sdk.where('schoolId', '==', me.schoolId), sdk.limit(limit)));
      const items = mine.docs.map((d) => this._docData(d)).filter((d) => d && !d.deleted);
      // Questions other schools chose to share: read-only here, tagged with the school's name.
      try {
        const shared = await sdk.getDocs(sdk.query(col, sdk.where('shared', '==', true), sdk.limit(limit)));
        const others = shared.docs.map((d) => this._docData(d)).filter((d) => d && !d.deleted && d.schoolId !== me.schoolId);
        if (others.length) {
          const { schools } = await this.listSchools();
          const names = Object.fromEntries((schools || []).map((x) => [x.id, x.name]));
          others.forEach((d) => { d.readOnly = true; d.sharedFromSchool = names[d.schoolId] || '其他學校'; });
          items.push(...others);
        }
      } catch {
        // Sharing is optional: ignore errors here.
      }
      items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
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
      let aSnap;
      try {
        aSnap = await sdk.getDoc(sdk.doc(db, 'homeworkAssignments', assignmentId));
      } catch (e) {
        // Students can only read published homework, so a draft or archived one is a permission error.
        if (/permission/i.test(String(e?.code || e?.message || ''))) return { ok: false, error: '這份作業目前不接受提交' };
        throw e;
      }
      const a = this._docData(aSnap);
      if (!a) return { ok: false, error: '找不到這份作業' };
      if (a.status !== 'published') return { ok: false, error: '這份作業目前不接受提交' };
      if (a.dueAt && !Number.isNaN(new Date(a.dueAt).getTime()) && new Date(a.dueAt) < new Date()) {
        return { ok: false, error: '已過截止時間，不能再提交' };
      }
      const me = check.me || {};
      const isStudent = String(me.role || 'student').toLowerCase() === 'student';
      if (isStudent && !this._homeworkFor([a], check.authUser.uid, me).length) {
        return { ok: false, error: '這份作業沒有指派給你' };
      }
      if (!me.schoolId || a.schoolId !== me.schoolId) return { ok: false, error: '這份作業不屬於你的學校' };
      // Recorded so the teacher dashboard can count hand-ins per class.
      const studentClass = String(me.class || '').trim();

      const answers = Array.isArray(payload.answers) ? payload.answers : [];
      const subId = `${assignmentId}_${check.authUser.uid}`;
      const docRef = sdk.doc(db, 'submissions', subId);
      const submission = {
        id: subId,
        schoolId: me.schoolId,
        assignmentId,
        studentUid: check.authUser.uid,
        assignmentTitle: a.title || '',
        topic: 'homework',
        status: 'submitted',
        ...(studentClass ? { class: studentClass } : {}),
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

  async listStudentsForClassroom(className) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, students: [] };
    const { db, sdk } = check.ready;
    const me = check.me || {};
    if (!me.schoolId) return { ok: false, error: '你的帳戶尚未加入學校', students: [] };
    const cls = String(className || '');
    try {
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'users'),
        sdk.where('schoolId', '==', me.schoolId), sdk.where('role', '==', 'student'), sdk.where('class', '==', cls), sdk.limit(200)));
      const students = snap.docs.map((doc) => {
        const u = this._docData(doc);
        return u ? { id: doc.id, uid: doc.id, name: u.name || '', class: u.class || '', studentProfile: u.studentProfile || {} } : null;
      }).filter(Boolean);
      return { ok: true, classroom: { id: cls, name: cls }, students };
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
      const classrooms = me.class ? [{ id: me.class, name: me.class }] : [];

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
        class: me.class || '',
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

  async listMySubmissions(limit = 100) {
    const check = await this._requireSignedIn();
    if (!check.ok) return { ok: false, error: check.error, submissions: [] };
    const { db, sdk } = check.ready;

    try {
      const q = sdk.query(
        sdk.collection(db, 'submissions'),
        sdk.where('studentUid', '==', check.authUser.uid),
        sdk.limit(limit)
      );
      const snap = await sdk.getDocs(q);
      const submissions = snap.docs.map((doc) => this._docData(doc)).filter(Boolean);
      return { ok: true, submissions };
    } catch (error) {
      return { ok: false, error: error?.message || 'List my submissions failed', submissions: [] };
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
        sdk.where('schoolId', '==', String(me.schoolId || '')),
        sdk.where('assignmentId', '==', aId),
        sdk.limit(limit)
      );
      const snap = await sdk.getDocs(q);
      const submissions = snap.docs.map((doc) => this._docData(doc)).filter(Boolean)
        .sort((a, b) => {
          const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          return tb - ta;
        });

      // Fetch student names in one batch (up to 10 per IN query)
      const uids = [...new Set(submissions.map(s => s.studentUid).filter(Boolean))];
      const nameMap = {};
      await Promise.all(uids.map(async (uid) => {
        try {
          const u = this._docData(await sdk.getDoc(sdk.doc(db, 'users', uid)));
          if (u) nameMap[uid] = u.name || u.email || uid;
        } catch { /* ignore */ }
      }));

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
    if (!['teacher', 'admin'].includes(String(check.me?.role || '').toLowerCase())) {
      return { ok: false, error: '教師儀表板只供老師和管理員使用。' };
    }
    const classroomsResult = await this.listClassrooms();
    if (!classroomsResult.ok) return { ok: false, error: classroomsResult.error || 'Classroom list failed' };
    const classrooms = classroomsResult.classrooms || [];
    const targetClassroomId = classroomId || classrooms[0]?.id;
    if (!targetClassroomId) return { ok: true, classrooms: [], classroom: null, students: [], submissions: [], metrics: [] };
    const studentResult = await this.listStudentsForClassroom(targetClassroomId);
    if (!studentResult.ok) return { ok: false, error: studentResult.error || 'Student list failed' };
    const { db, sdk } = check.ready;
    let submissions = [];
    try {
      const submissionsSnap = await sdk.getDocs(sdk.query(sdk.collection(db, 'submissions'),
        sdk.where('schoolId', '==', String(check.me?.schoolId || '')), sdk.where('class', '==', targetClassroomId), sdk.limit(200)));
      submissions = submissionsSnap.docs.map((doc) => this._docData(doc)).filter(Boolean);
    } catch {
      submissions = [];
    }
    const students = studentResult.students || [];
    const avgMastery = students.length ? Math.round(students.reduce((sum, item) => sum + Number(item.studentProfile?.mastery || 0), 0) / students.length) : 0;
    const focusCount = students.filter((item) => Number(item.studentProfile?.mastery || 0) < 75).length;
    // Share of the class who have handed in at least one piece of homework.
    const handedIn = new Set(submissions.map((x) => x.studentUid));
    const completionRate = students.length ? Math.round(100 * students.filter((x) => handedIn.has(x.uid)).length / students.length) : 0;
    submissions = submissions.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))).slice(0, 25);
    const metrics = [
      { label: '班級完成率', value: `${completionRate}%` },
      { label: '平均掌握度', value: `${avgMastery}%` },
      { label: '需關注學生', value: `${focusCount} 人` },
      { label: '最近提交數', value: `${submissions.length} 筆` }
    ];
    return { ok: true, classrooms, classroom: studentResult.classroom, students, submissions, metrics };
  }
};
