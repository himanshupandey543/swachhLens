/* =====================================================================
 * SwachLens — login page (nested role experience)
 * ---------------------------------------------------------------------
 * A progressive role flow: role selector → role deep-dive panel → a
 * contextual Login/Register form that inherits the selected role's
 * identity. Preserves the existing Auth API (Auth.login / Auth.register),
 * demo accounts, error handling and session redirection.
 * ===================================================================== */
(function () {
  // Already signed in? Go straight to your dashboard.
  const existing = Auth.session();
  if (existing) {
    nav((Auth.ROLE_META[existing.role] || Auth.ROLE_META.USER).path);
    return;
  }

  const ROLE_LABEL = { USER: 'Citizen', EMPLOYEE: 'Employee' };
  const ROLE_KEY = { USER: 'citizen', EMPLOYEE: 'employee' };
  // Which auth page are we on? login.html → "login", register.html → "register".
  const PAGE_MODE = document.body.dataset.authMode || 'login';

  const selector = document.querySelector('[data-role-selector]');
  const roleBtns = selector ? Array.from(selector.querySelectorAll('[data-role]')) : [];
  const panels = document.querySelectorAll('[data-role-panel]');
  let currentRole = 'USER';

  /* ---------------- Role switching (nested dive) ---------------- */
  function selectRole(role) {
    currentRole = role;
    roleBtns.forEach((b) => {
      const on = b.dataset.role === role;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      const on = panel.dataset.rolePanel === role;
      if (on) {
        panel.hidden = false;
        panel.classList.remove('in'); // re-trigger panel-in animation
        void panel.offsetWidth;
        panel.classList.add('in');
      } else {
        panel.hidden = true;
      }
    });
    // Keep the hash in sync for deep-linking / back button.
    const want = '#' + ROLE_KEY[role];
    if (window.location.hash !== want && window.location.hash && window.location.hash !== '#choose') {
      try { history.replaceState(null, '', want); } catch { /* ignore */ }
    }
  }

  roleBtns.forEach((b) =>
    b.addEventListener('click', () => selectRole(b.dataset.role))
  );

  /* Keyboard support for the selector (arrow keys behave like tabs). */
  if (selector) {
    selector.addEventListener('keydown', (e) => {
      const idx = roleBtns.indexOf(document.activeElement);
      if (idx === -1 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      let next = idx;
      if (e.key === 'ArrowRight') next = (idx + 1) % roleBtns.length;
      if (e.key === 'ArrowLeft') next = (idx - 1 + roleBtns.length) % roleBtns.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = roleBtns.length - 1;
      roleBtns[next].focus();
      selectRole(roleBtns[next].dataset.role);
    });
  }

  /* ---------------- Per-panel auth forms ---------------- */
  panels.forEach((panel) => {
    const role = panel.dataset.rolePanel;
    const seg = panel.querySelector('[data-seg]');
    const form = panel.querySelector('[data-form]');
    const err = panel.querySelector('[data-err]');
    const submitBtn = panel.querySelector('[data-submit]');
    const submitLabel = panel.querySelector('[data-submit-label]');
    let mode = PAGE_MODE;

    function setErr(msg) {
      err.textContent = msg || '';
      err.classList.toggle('show', !!msg);
    }

    function setMode(m) {
      mode = m;
      if (seg) seg.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.mode === m;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      form.querySelectorAll('[data-name], [data-confirm-pass]').forEach((n) => (n.closest('.lv-field').style.display = m === 'register' ? '' : 'none'));
      const passInput = form.querySelector('[data-pass]');
      if (passInput) passInput.setAttribute('autocomplete', m === 'register' ? 'new-password' : 'current-password');
      const confirmInput = form.querySelector('[data-confirm-pass]');
      if (confirmInput) {
        confirmInput.value = '';
        confirmInput.setAttribute('aria-invalid', 'false');
        const ce = panel.querySelector('[data-confirm-err]');
        if (ce) ce.hidden = true;
      }
      submitLabel.textContent = m === 'register'
        ? t(role === 'USER' ? 'auth.regCit' : 'auth.regEmp')
        : t(role === 'USER' ? 'auth.logCit' : 'auth.logEmp');
      setErr('');
    }

    if (seg) seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    setMode(PAGE_MODE); // initialize this page's fields, autocomplete + submit label

    // Live password-confirmation check (frontend only — confirmPassword is never sent).
    const confirmInput = form.querySelector('[data-confirm-pass]');
    const confirmErr = panel.querySelector('[data-confirm-err]');
    function validateConfirm() {
      if (!confirmInput) return;
      const pass = form.querySelector('[data-pass]').value;
      const ok = confirmInput.value === pass;
      confirmInput.setAttribute('aria-invalid', String(!ok));
      confirmErr.hidden = !(mode === 'register' && confirmInput.value && !ok);
    }
    if (confirmInput) {
      confirmInput.addEventListener('input', validateConfirm);
      form.querySelector('[data-pass]').addEventListener('input', validateConfirm);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setErr('');
      const email = form.querySelector('[data-email]').value.trim();
      const password = form.querySelector('[data-pass]').value;
      const name = (form.querySelector('[data-name]')?.value || '').trim();

      if (!email || !password) { setErr(t('auth.errFill')); return; }
      if (mode === 'register' && password.length < 6) { setErr(t('auth.errPassLen')); return; }
      if (mode === 'register' && confirmInput && confirmInput.value !== password) {
        confirmInput.setAttribute('aria-invalid', 'true');
        confirmErr.hidden = false;
        confirmErr.textContent = t('auth.errMatch');
        confirmInput.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
      try {
        const session = mode === 'login'
          ? await Auth.login(email, password, role)
          : await Auth.register({ email, password, name }, role);
        toast(t('auth.welcomeBack', { name: session.name || session.email }));
        setTimeout(() => nav(Auth.ROLE_META[role].path), 350);
      } catch (error) {
        setErr(error.message || t('auth.errGeneric'));
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
    });

    // Demo chip → autofill + submit through the right panel.
    panel.querySelectorAll('[data-demo]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const email = chip.dataset.demo;
        form.querySelector('[data-email]').value = email;
        form.querySelector('[data-pass]').value = '123456';
        setMode('login');
        form.requestSubmit();
      });
    });
  });

  /* ---------------- Deep-link handling (from landing CTAs) ---------------- */
  const hashRole = {
    citizen: 'USER',
    employee: 'EMPLOYEE',
  };
  const fromHash = hashRole[(window.location.hash || '').replace('#', '').toLowerCase()];
  if (fromHash) selectRole(fromHash);
  else selectRole('USER');
})();
