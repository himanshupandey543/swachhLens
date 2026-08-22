/* =====================================================================
 * SwachLens — thin REST client for the FastAPI backend.
 * ---------------------------------------------------------------------
 * Loaded before auth.js / state.js. Every request automatically attaches
 * the session JWT (Authorization: Bearer <token>). On a 401 the session
 * is cleared and the user is sent back to the login page.
 * ===================================================================== */
(function () {
  const BASE = (window.SW_CONFIG && window.SW_CONFIG.API_URL) || 'http://localhost:8000/api';
  const SESSION_KEY = 'swachlens.session';

  function getToken() {
    try { return (JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || {}).authToken || null; }
    catch { return null; }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  async function request(method, path, body) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const e = new Error(t('api.reachFail') + ' ' + BASE + '?');
      e.offline = true;
      throw e;
    }

    if (res.status === 401) {
      // Only treat 401 as "session expired" when a token was actually sent.
      // On the login page (no token) a 401 means wrong credentials — let the
      // normal error path below extract the backend's message.
      if (getToken()) {
        clearSession();
        const onAuthPage = /login\.html|register\.html/.test(window.location.pathname);
        if (!onAuthPage) window.location.href = 'login.html';
        throw new Error(t('api.sessionExpired'));
      }
    }

    if (!res.ok) {
      let msg = 'Request failed (' + res.status + ')';
      try {
        const data = await res.json();
        if (data && data.detail) {
          msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        }
      } catch { /* keep default message */ }
      throw new Error(msg);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  window.API = {
    base: BASE,
    getToken,
    clearSession,

    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    del: (path) => request('DELETE', path),

    auth: {
      login: (email, password) => request('POST', '/auth/login', { email, password }),
      register: (data) => request('POST', '/auth/register', data),
      logout: () => request('POST', '/auth/logout'),
      me: () => request('GET', '/auth/me'),
    },

    reports: {
      list: (query) => request('GET', '/reports' + (query ? '?' + new URLSearchParams(query) : '')),
      create: (data) => request('POST', '/reports', data),
      assign: (id, data) => request('PATCH', '/reports/' + encodeURIComponent(id) + '/assign', data),
      collect: (id) => request('PATCH', '/reports/' + encodeURIComponent(id) + '/collect'),
      cancel: (id) => request('PATCH', '/reports/' + encodeURIComponent(id) + '/cancel'),
      verify: (id, action) => request('PATCH', '/reports/' + encodeURIComponent(id) + '/verify', { action }),
      remove: (id) => request('DELETE', '/reports/' + encodeURIComponent(id)),
      stats: () => request('GET', '/reports/stats'),
    },

    vision: {
      analyze: (photo) => request('POST', '/analyze', { photo }),
    },

    gis: {
      get: () => request('GET', '/gis'),
      updateBin: (id, body) => request('PATCH', '/gis/bins/' + encodeURIComponent(id), body),
    },

    community: {
      leaderboard: () => request('GET', '/community/leaderboard'),
      initiatives: () => request('GET', '/community/initiatives'),
      joinInitiative: (id) => request('POST', '/community/initiatives/' + encodeURIComponent(id) + '/join'),
      leaveInitiative: (id) => request('POST', '/community/initiatives/' + encodeURIComponent(id) + '/leave'),
    },
  };
})();
