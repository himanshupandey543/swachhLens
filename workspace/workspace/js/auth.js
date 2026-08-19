/* =====================================================================
 * SwachLens — Auth module (FastAPI + JWT)
 * ---------------------------------------------------------------------
 * Credentials are verified by the backend, which returns a signed JWT.
 * The JWT is kept in localStorage (swachlens.session) and attached to
 * every API request by js/api.js. Role checks still run on the server;
 * Auth.require() is just the client-side redirect guard.
 *
 * API surface (unchanged): Auth.init(), Auth.session(), Auth.login(),
 *   Auth.register(), Auth.logout(), Auth.require(role), Auth.switchRole(),
 *   Auth.ROLE_META, Auth.ROLES
 * ===================================================================== */
(function () {
  const SESSION_KEY = 'swachlens.session';

  const ROLE_META = {
    USER: { label: 'Citizen', icon: '👤', path: 'user.html', color: '#16a34a' },
    EMPLOYEE: { label: 'Employee', icon: '🚛', path: 'employee.html', color: '#8b5cf6' },
  };

  const Auth = {
    ROLE_META,
    ROLES: Object.keys(ROLE_META),

    /* Warm / validate any existing session against the backend (non-blocking).
     * A stale or revoked token is dropped so the dashboard guards redirect. */
    async init() {
      const s = this.session();
      if (!s || !s.authToken) return;
      try {
        const me = await API.auth.me();
        // Keep the freshest name/role from the server.
        if (me && s.email === me.email) {
          localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, ...me, authToken: s.authToken }));
        }
      } catch (err) {
        if (!err || !err.offline) localStorage.removeItem(SESSION_KEY);
      }
    },

    /* Returns the logged-in user (from the stored session) or null. */
    session() {
      try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
    },

    /* Stores the JWT session. */
    _establish(user, token) {
      const session = { ...user, authToken: token, issuedAt: Date.now() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    },

    /* role is the panel the user is logging in through. */
    async login(email, password, role) {
      const { user, token } = await API.auth.login(email, password);
      if (role && user.role !== role) {
        throw new Error('This account belongs to a ' + ROLE_META[user.role].label +
          '. Use the "' + ROLE_META[user.role].label + '" panel to sign in.');
      }
      return this._establish(user, token);
    },

    async register(data, role) {
      const { user, token } = await API.auth.register({ ...data, role });
      return this._establish(user, token);
    },

    async logout() {
      try { await API.auth.logout(); } catch { /* server may be offline */ }
      localStorage.removeItem(SESSION_KEY);
    },

    /* Guards: ensure a session exists, optionally of a specific role. Redirects otherwise. */
    require(role) {
      const s = this.session();
      if (!s) { nav('login.html'); return null; }
      if (role && s.role !== role) {
        const target = ROLE_META[s.role] && ROLE_META[s.role].path;
        nav(target || 'login.html');
        return null;
      }
      return s;
    },

    switchRole() { localStorage.removeItem(SESSION_KEY); nav('login.html'); },
  };

  window.Auth = Auth;
  Auth.init();
})();
