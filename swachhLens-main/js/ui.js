/* =====================================================================
 * SwachLens — shared UI helpers (theme, toast, reveal, counters, modal)
 * ===================================================================== */

/* ---------- Theme ---------- */
window.toggleTheme = function () {
  const html = document.documentElement;
  const dark = html.dataset.theme === 'dark';
  html.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('swachlensTheme', html.dataset.theme);
  syncThemeBtn(dark);
};
function syncThemeBtn(dark) {
  document.querySelectorAll('[data-theme-btn]').forEach((b) => (b.textContent = dark ? '🌙' : '☀️'));
}
(function initTheme() {
  const saved = localStorage.getItem('swachlensTheme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.dataset.theme = 'dark';
  syncThemeBtn(dark);
})();
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-theme-btn]');
  if (btn) toggleTheme();
});

/* ---------- Toast ---------- */
let toastTimer;
window.toast = function (msg, isError) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = (isError ? '⚠️ ' : '✅ ') + msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
};

/* ---------- Scroll reveal ---------- */
(function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  const obs = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          obs.unobserve(e.target);
        }
      }),
    { threshold: 0.12 }
  );
  els.forEach((el) => obs.observe(el));
})();

/* ---------- Animated counters ---------- */
window.countUp = function (el, target, opts = {}) {
  if (el.dataset.counted) return;
  el.dataset.counted = '1';
  const dur = opts.duration || 1400;
  const decimals = opts.decimals || 0;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
};

/* ---------- Generic modal (floating panel) ---------- */
window.openSheet = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('report-open');
};
window.closeSheet = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('report-open');
};
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close-sheet]');
  if (closer) closeSheet(closer.dataset.closeSheet);
  const opener = e.target.closest('[data-open-sheet]');
  if (opener) openSheet(opener.dataset.openSheet);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.sheet.open').forEach((s) => closeSheet(s.id));
  }
});

/* ---------- Relative time ---------- */
window.timeAgo = function (ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  const d = Math.floor(h / 24);
  return d + ' day' + (d > 1 ? 's' : '') + ' ago';
};

/* Central navigation helper (testable, and easy to swap for hash routing later). */
if (!window.nav) window.nav = function (path) { window.location.href = path; };

window.escapeHtml = function (str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
};
