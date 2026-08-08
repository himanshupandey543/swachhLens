/* =====================================================================
 * SwachLens — landing page (index.html)
 * ---------------------------------------------------------------------
 * Premium civic-tech landing. Wires navigation, scroll reveals,
 * staggered children, split-line headline reveal, marquee, animated
 * counters, AI panel bar fills, parallax floats and the mobile menu.
 * Uses Store for the live demo stats and Auth for the session-aware CTA.
 * ===================================================================== */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Navigation ---------------- */
  const topnav = document.getElementById('topnav');
  const onScroll = () => topnav.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const burger = document.querySelector('[data-menu-btn]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const toggleMenu = (open) => {
    if (!mobileMenu) return;
    const isOpen = typeof open === 'boolean' ? open : !mobileMenu.classList.contains('is-open');
    mobileMenu.classList.toggle('is-open', isOpen);
    if (burger) {
      burger.classList.toggle('is-open', isOpen);
      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
    document.body.classList.toggle('landing-menu-open', isOpen);
  };
  if (burger) burger.addEventListener('click', () => toggleMenu());
  mobileMenu && mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggleMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });
  // Close when tapping outside the open drawer (page stays scrollable behind it — no body lock)
  document.addEventListener('click', (e) => {
    if (mobileMenu && mobileMenu.classList.contains('is-open') && !mobileMenu.contains(e.target) && !(burger && burger.contains(e.target))) toggleMenu(false);
  });

  /* ---------------- Split-line headline reveal ---------------- */
  // Wrap each word in a clipping span while preserving <br> line breaks and
  // any nested accent elements (e.g. .lv-em), so the reveal survives markup.
  function splitWords(el) {
    if (reduceMotion) { el.classList.add('in'); return; }
    const doc = el.ownerDocument;
    function wrapTextNode(textNode) {
      const parent = textNode.parentNode;
      const words = textNode.nodeValue.split(/(\s+)/);
      words.forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { parent.insertBefore(doc.createTextNode(' '), textNode); return; }
        const wrap = doc.createElement('span');
        wrap.className = 'lv-words';
        const inner = doc.createElement('span');
        inner.textContent = part;
        inner.setAttribute('aria-hidden', 'true');
        wrap.appendChild(inner);
        parent.insertBefore(wrap, textNode);
      });
      parent.removeChild(textNode);
    }
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) { wrapTextNode(node); return; }
      if (node.nodeType === Node.ELEMENT_NODE) Array.from(node.childNodes).forEach(walk);
    }
    Array.from(el.childNodes).forEach(walk);
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    el.classList.add('in');
  }
  document.querySelectorAll('[data-words]').forEach(splitWords);

  /* ---------------- IntersectionObserver-driven reveals ---------------- */
  function observeReveals() {
    const els = document.querySelectorAll('.lv-reveal, .lv-stagger, .lv-imgwrap, .lv-ai__bar');
    if (!('IntersectionObserver' in window) || reduceMotion) {
      els.forEach((el) => el.classList.add('in'));
      // counters still animate even with reduced motion (numbers are content)
      document.querySelectorAll('[data-count]').forEach(runCounter);
      document.querySelectorAll('.bar-fill').forEach((f) => (f.style.transform = 'scaleX(1)'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.classList.add('in');
          el.querySelectorAll && el.querySelectorAll('.bar-fill').forEach((f) => (f.style.transform = 'scaleX(1)'));
          el.querySelectorAll && el.querySelectorAll('[data-count]').forEach(runCounter);
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => obs.observe(el));

    // Standalone counters (not nested inside a revealed parent) — e.g. the AI score.
    document.querySelectorAll('[data-count]').forEach((el) => {
      if (!el.closest('.lv-reveal, .lv-stagger, .lv-imgwrap')) obs.observe(el);
    });
  }

  /* ---------------- Animated counters ---------------- */
  function runCounter(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const target = (el.dataset.count !== undefined && parseFloat(el.dataset.count))
      || parseFloat(el.textContent.replace(/[^\d.]/g, '')) || 0;
    const dur = 1400;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- AI panel: number + bars ---------------- */
  // The panel is observed as one .lv-reveal; count + fills run on reveal.
  // (Handled above via runCounter on [data-count] + bar-fill scale.)

  /* ---------------- Parallax floats (subtle, desktop only) ---------------- */
  if (!reduceMotion && window.matchMedia('(hover:hover)').matches) {
    const floats = document.querySelectorAll('.lv-hero .lv-float');
    if (floats.length) {
      let raf = null;
      window.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const y = window.scrollY;
          floats.forEach((el, i) => {
            const r = el.getBoundingClientRect();
            if (r.top < window.innerHeight && r.bottom > 0) {
              const depth = 0.015 + i * 0.008; // each float drifts at its own depth
              el.style.setProperty('--pf', `${(y * depth).toFixed(1)}px`);
            }
          });
          raf = null;
        });
      }, { passive: true });
    }
  }

  /* ---------------- Session-aware CTA ---------------- */
  const s = Auth.session();
  if (s) {
    const cta = document.querySelector('.lv-nav__cta a.lv-btn--primary');
    if (cta) {
      cta.textContent = 'Open dashboard →';
      cta.href = (Auth.ROLE_META[s.role] || Auth.ROLE_META.USER).path;
    }
  }

  observeReveals();
})();
