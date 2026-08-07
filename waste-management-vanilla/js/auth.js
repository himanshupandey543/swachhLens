/* =====================================================================
 * SwachLens — Auth module
 * ---------------------------------------------------------------------
 * Two interchangeable providers behind one API:
 *   • ClerkProvider   — real Clerk (SDK loaded from CDN) when a
 *                       publishable key is configured in config.js.
 *   • MockProvider    — built-in offline provider (seeded demo accounts).
 *
 * API surface: Auth.init(), Auth.login(email, pass), Auth.register(...),
 *              Auth.logout(), Auth.session(), Auth.require(role), Auth.users
 *
 * Roles: 'USER' | 'EMPLOYEE' | 'ADMIN'
 * ===================================================================== */
(function () {
  const SESSION_KEY = 'swachlens.session';
  const USERS_KEY = 'swachlens.users';

  const ROLE_META = {
    USER: { label: 'Citizen', icon: '👤', path: 'user.html', color: '#16a34a' },
    EMPLOYEE: { label: 'Employee', icon: '🚛', path: 'employee.html', color: '#8b5cf6' },
    ADMIN: { label: 'Admin', icon: '🛠️', path: 'admin.html', color: '#0ea5e9' },
  };

  /* ================= Mock provider ================= */
  const MockProvider = {
    seed() {
      const existing = JSON.parse(localStorage.getItem(USERS_KEY) || 'null');
      if (existing) return;
      const demo = [
        { email: 'user@test.com', password: '123456', name: 'Aarav Citizen', role: 'USER' },
        { email: 'employee@test.com', password: '123456', name: 'John Driver', role: 'EMPLOYEE' },
        { email: 'admin@test.com', password: '123456', name: 'Priya Admin', role: 'ADMIN' },
      ];
      localStorage.setItem(USERS_KEY, JSON.stringify(demo.map((u) => ({ ...u, id: 'usr_' + btoa(u.email).replace(/=/g, '').toLowerCase() }))));
    },
    _load() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; } },
    find(email) { return this._load().find((u) => u.email.toLowerCase() === email.toLowerCase()); },
    login(email, password) {
      this.seed();
      const u = this.find(email);
      if (!u || u.password !== password) throw new Error('Invalid email or password.');
      return u;
    },
    register({ email, password, name, role }) {
      this.seed();
      const list = this._load();
      if (list.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with this email already exists.');
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');
      const u = { id: 'usr_' + btoa(email).replace(/=/g, '').toLowerCase(), email, password, name: name || email.split('@')[0], role };
      list.push(u);
      localStorage.setItem(USERS_KEY, JSON.stringify(list));
      return u;
    },
  };

  /* ================= Clerk provider ================= */
  // Activated automatically when SW_CONFIG.CLERK_PUBLISHABLE_KEY is non-empty.
  // Maps the account role from Clerk publicMetadata.role, which we set at
  // sign-up time (signUp.update({ publicMetadata: { role } })).
  const ClerkProvider = {
    _clerk: null,
    _ready: null,
    async init() {
      if (this._ready) return this._ready;
      this._ready = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
        s.onload = async () => {
          try {
            const clerk = window.Clerk;
            await clerk.load({ publishableKey: SW_CONFIG.CLERK_PUBLISHABLE_KEY });
            this._clerk = clerk;
            resolve(clerk);
          } catch (err) { reject(err); }
        };
        s.onerror = () => reject(new Error('Could not load Clerk SDK. Check your internet connection.'));
        document.head.appendChild(s);
      });
      return this._ready;
    },
    async login(email, password) {
      const clerk = await this.init();
      const res = await clerk.client.signIn.create({ strategy: 'password', identifier: email, password });
      if (res.status === 'needs_second_factor') {
        await clerk.client.signIn.prepareSecondFactor();
        throw new Error('Two-factor authentication is enabled on this account. Complete verification in the Clerk popup.');
      }
      const user = clerk.user;
      if (!user) throw new Error('Sign-in could not be completed.');
      return {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress || email,
        name: user.fullName || user.primaryEmailAddress?.emailAddress.split('@')[0],
        role: user.publicMetadata?.role || user.unsafeMetadata?.role || inferRole(email),
      };
    },
    async register({ email, password, name, role }) {
      const clerk = await this.init();
      const si = clerk.client.signUp;
      await si.create({ emailAddress: email, password });
      await si.update({ firstName: (name || email).split(' ')[0] || 'Swach', lastName: (name || '').split(' ').slice(1).join(' ') || 'Member' });
      // Roles are attached as public metadata so sign-in can read them back.
      await si.update({ publicMetadata: { role } });
      if (si.status === 'missing_requirements') {
        await si.prepareEmailAddressVerification({ strategy: 'email_code' });
        throw new Error('We sent a verification code to ' + email + '. Please verify your email in the Clerk popup, then sign in.');
      }
      const user = si.createdUserId ? await clerk.user({ id: si.createdUserId }) : null;
      return {
        id: user ? user.id : 'clerk_' + Date.now(),
        email,
        name: name || email.split('@')[0],
        role,
      };
    },
    async logout() {
      const clerk = await this.init();
      await clerk.signOut();
    },
    _readyUser() {
      const clerk = this._clerk;
      if (!clerk || !clerk.user) return null;
      return {
        id: clerk.user.id,
        email: clerk.user.primaryEmailAddress?.emailAddress,
        name: clerk.user.fullName || clerk.user.primaryEmailAddress?.emailAddress.split('@')[0],
        role: clerk.user.publicMetadata?.role || clerk.user.unsafeMetadata?.role,
      };
    },
  };

  function inferRole(email) {
    const e = email.toLowerCase();
    if (e.includes('admin')) return 'ADMIN';
    if (e.includes('employee') || e.includes('crew')) return 'EMPLOYEE';
    return 'USER';
  }

  const provider = () => (SW_CONFIG && SW_CONFIG.CLERK_PUBLISHABLE_KEY ? ClerkProvider : MockProvider);

  /* ================= Session helpers ================= */
  const Auth = {
    ROLE_META,
    ROLES: Object.keys(ROLE_META),

    async init() {
      MockProvider.seed();
      if (SW_CONFIG && SW_CONFIG.CLERK_PUBLISHABLE_KEY) {
        SW_CONFIG.USE_CLERK = true;
        // Warm the Clerk provider in the background so login is fast later.
        ClerkProvider.init().catch(() => { /* offline → mock won't run; login will surface the error */ });
      }
    },

    /* Returns the logged-in user (from localStorage session) or null. */
    session() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
    },

    /* Creates an authToken + stores the session. */
    _establish(user) {
      const token = 'tok_' + btoa(user.email + ':' + user.role + ':' + Date.now()).replace(/=/g, '').slice(0, 24);
      const session = { ...user, authToken: token, issuedAt: Date.now() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    },

    /* role is the panel the user is logging in through. */
    async login(email, password, role) {
      const providerUser = await provider().login(email, password);
      const user = { ...providerUser };
      if (role && user.role !== role) {
        throw new Error('This account belongs to a ' + ROLE_META[user.role].label + '. Use the "' + ROLE_META[user.role].label + '" panel to sign in.');
      }
      return this._establish(user);
    },

    async register(data, role) {
      const user = await provider().register({ ...data, role });
      return this._establish(user);
    },

    async logout() {
      try { await provider().logout(); } catch { /* ignore */ }
      localStorage.removeItem(SESSION_KEY);
    },

    /* Guards: ensure a session exists, optionally of a specific role. Redirects otherwise. */
    require(role) {
      const s = this.session();
      if (!s) { nav('login.html'); return null; }
      if (role && s.role !== role) { nav(ROLE_META[s.role].path); return null; }
      return s;
    },

    switchRole() { localStorage.removeItem(SESSION_KEY); nav('login.html'); },
  };

  window.Auth = Auth;
  MockProvider.seed();
  Auth.init();
})();
