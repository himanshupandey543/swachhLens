/* =====================================================================
 * SwachLens — Live GIS & Citizen "On-the-way Hand-off" module
 * ---------------------------------------------------------------------
 * Dependency-free. Drives the #gis section on index.html.
 * Model: schematic Ward-4 map in an 840×520 viewBox, 2.5 m per px.
 * Uses window.toast() (defined in js/ui.js).
 * ===================================================================== */
(function () {
  'use strict';

  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Map model ---- */
  const M_PER_PX = 2.5;      // declared map scale (metres per pixel)
  const BUFFER_M = 200;      // hand-off buffer radius
  // Fallback map data (matches the seeded DB rows) — used instantly at load and
  // whenever the backend is unreachable. The map hydrates from GET /api/gis when
  // the API is up.
  const FALLBACK_ROUTE = [
    [60, 320], [180, 320], [180, 420], [320, 420], [320, 220],
    [460, 220], [460, 120], [620, 120], [620, 300], [760, 300]
  ];
  const FALLBACK_BINS = [
    { id: 'B-1042', x: 150, y: 308, fill: 32, type: 'Mixed' },
    { id: 'B-1043', x: 305, y: 410, fill: 64, type: 'Mixed' },
    { id: 'B-1044', x: 475, y: 228, fill: 88, type: 'High-rise' },
    { id: 'B-1045', x: 635, y: 128, fill: 45, type: 'Market' },
    { id: 'B-1046', x: 700, y: 292, fill: 72, type: 'Residential' },
    { id: 'B-1047', x: 410, y: 205, fill: 20, type: 'Park' }
  ];
  const FALLBACK_TRUCK = { id: 'TRK-8214', driver: 'Rajesh Kumar', plate: 'TN-07-KH 8214', ward: 'Ward 4', speedKmh: 24 };
  const CITIZEN = { x: 500, y: 238 };   // the "pinned" citizen location

  // Mutable runtime state — replaced by server data when the API responds.
  let ROUTE = FALLBACK_ROUTE;
  let BINS = FALLBACK_BINS;
  let TRUCK = FALLBACK_TRUCK;

  const T_LOOP_MS = 90000;    // one full route loop (accelerated demo)
  const STOP_T = 700 / 1280;  // cumulative px to the hand-off stop / route total

  const CAT_LABEL = { dry: 'Dry / Recyclable', wet: 'Wet / Organic', ewaste: 'E-Waste' };
  const PT_LABEL  = { gate: 'Outside my gate', corner: 'Street corner' };

  const state = {
    progress: REDUCE ? 0.42 : 0,
    handoff: { category: null, point: null, active: false, arrived: false, arrivedAt: 0 }
  };

  /* ---- Geometry helpers ---- */
  function segLen(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function totalLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += segLen(pts[i - 1], pts[i]); return s; }
  function pointAtT(pts, t) {
    const total = totalLen(pts);
    let d = Math.min(t, 1) * total;
    for (let i = 1; i < pts.length; i++) {
      const l = segLen(pts[i - 1], pts[i]);
      if (d <= l) {
        const k = l ? d / l : 0;
        return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k };
      }
      d -= l;
    }
    return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
  }
  function ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function distToRoute(px, py) {
    let m = Infinity;
    for (let i = 1; i < ROUTE.length; i++) {
      m = Math.min(m, ptSegDist(px, py, ROUTE[i - 1][0], ROUTE[i - 1][1], ROUTE[i][0], ROUTE[i][1]));
    }
    return m * M_PER_PX;
  }

  /* ---- DOM refs ---- */
  const mapEl = document.querySelector('[data-map]');
  if (!mapEl) return;                 // GIS section not on this page
  const binWrap = mapEl.querySelector('[data-bins]');
  const routeDone = mapEl.querySelector('[data-route-done]');
  const truckEl = mapEl.querySelector('[data-truck]');
  const truckLbl = truckEl.querySelector('[data-truck-label]');
  const citizenPin = mapEl.querySelector('[data-citizen-pin]');
  const etaEl = document.querySelector('[data-eta-count]');
  const ctaBtn = document.querySelector('[data-handoff-btn]');
  const modal = document.querySelector('[data-handoff-modal]');
  const catWrap = modal.querySelector('[data-cat-options]');
  const pointWrap = modal.querySelector('[data-point-options]');
  const bufferEl = modal.querySelector('[data-buffer]');
  const confirmBtn = modal.querySelector('[data-confirm-handoff]');
  const dispatchCard = document.querySelector('[data-dispatch-card]');
  const dCat = dispatchCard.querySelector('[data-dispatch-cat]');
  const dPoint = dispatchCard.querySelector('[data-dispatch-point]');
  const dEta = dispatchCard.querySelector('[data-dispatch-eta]');

  let _routeTotal = totalLen(ROUTE);

  /* ---- Truck info card (from the fleet row or fallback) ---- */
  function renderTruck(t) {
    t = t || TRUCK;
    truckLbl.innerHTML = '<b>' + escapeHtml(t.driver || 'Crew') + '</b><span>' +
      escapeHtml(t.plate || '') + ' · ' + escapeHtml(t.ward || '') + ' · ' + (t.speedKmh || 0) + ' km/h</span>';
  }

  /* ---- Render dustbin markers (color-coded status pins) ---- */
  const STATUS = { ok: 'Normal', watch: 'Filling up', alert: 'Overflow' };
  function renderBins() {
    binWrap.innerHTML = '';
    BINS.forEach(function (b, i) {
      const level = b.fill < 50 ? 'ok' : (b.fill <= 80 ? 'watch' : 'alert');
      const el = document.createElement('div');
      el.className = 'bin-marker s-' + level;
      el.style.left = (b.x / 840 * 100).toFixed(2) + '%';
      el.style.top = (b.y / 520 * 100).toFixed(2) + '%';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', 'Bin ' + b.id + ', ' + b.fill + '% full, ' + STATUS[level]);
      el.innerHTML =
        '<span class="pin"><b>' + b.fill + '%</b></span>' +
        '<div class="bin-pop">' +
          '<div class="bp-head"><b>Bin ' + b.id + '</b><span class="bp-status ' + level + '">' + STATUS[level] + '</span></div>' +
          '<div class="bp-bar"><i style="--f:' + b.fill + '%"></i></div>' +
          '<div class="bp-fill"><span>Fill level</span><b>' + b.fill + '%</b></div>' +
          '<div class="bp-meta">📍 ' + Math.round(distToRoute(b.x, b.y)) + 'm from the route · ' + b.type + '</div>' +
        '</div>';
      el.addEventListener('click', function () { togglePop(el); });
      el.addEventListener('mouseenter', function () { if (openPop && openPop !== el) { openPop.classList.remove('show'); openPop = null; } });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePop(el); }
      });
      if (!REDUCE) el.style.animationDelay = (i * 0.06) + 's';
      binWrap.appendChild(el);
    });
  }

  /* ---- Hydrate map data from the backend (non-blocking; keep fallbacks) ---- */
  function toPath(pts) {
    return pts.map(function (p) { return 'L ' + p[0] + ' ' + p[1]; }).join(' ').replace(/^L/, 'M');
  }
  /* Adopt a server-supplied route: update the geometry + both path strokes. */
  function applyServerRoute(route) {
    if (!Array.isArray(route) || route.length < 2) return;
    ROUTE = route.slice(0, 10);
    _routeTotal = totalLen(ROUTE);
    const d = toPath(ROUTE);
    routeDone.setAttribute('d', d);
    const todoEl = mapEl.querySelector('.gis-route-todo');
    if (todoEl) todoEl.setAttribute('d', d);
  }
  function hydrateFromServer() {
    if (typeof API === 'undefined' || !API.gis) return;
    API.gis.get()
      .then(function (data) {
        if (data && Array.isArray(data.bins) && data.bins.length) { BINS = data.bins; renderBins(); }
        if (data && Array.isArray(data.fleet) && data.fleet.length) {
          TRUCK = data.fleet[0];
          renderTruck(TRUCK);
          if (TRUCK.route) applyServerRoute(TRUCK.route);
        }
      })
      .catch(function () { /* offline — keep fallbacks */ });
  }

  renderTruck(TRUCK);
  renderBins();
  hydrateFromServer();

  let openPop = null;
  function togglePop(el) {
    const opening = !el.classList.contains('show');
    if (openPop && openPop !== el) openPop.classList.remove('show');
    el.classList.toggle('show', opening);
    openPop = opening ? el : null;
  }
  document.addEventListener('click', function (e) {
    if (openPop && !e.target.closest('.bin-marker')) { openPop.classList.remove('show'); openPop = null; }
  });

  /* ---- Truck animation + ETA ---- */
  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  let startAt = 0;

  function tick(now) {
    if (!startAt) startAt = now;
    state.progress = ((now - startAt) % T_LOOP_MS) / T_LOOP_MS;
    const t = state.progress;

    const p = pointAtT(ROUTE, t);
    truckEl.style.left = (p.x / 840 * 100).toFixed(2) + '%';
    truckEl.style.top = (p.y / 520 * 100).toFixed(2) + '%';
    routeDone.setAttribute('stroke-dasharray', (_routeTotal * t).toFixed(1) + ' ' + _routeTotal.toFixed(1));

    // Seconds until the truck reaches the hand-off stop (wraps each loop)
    const secToStop = ((((STOP_T - t) % 1) + 1) % 1) * (T_LOOP_MS / 1000);

    if (state.handoff.arrived) {
      etaEl.textContent = '00:00';
      dEta.textContent = '00:00';
      if (now - state.handoff.arrivedAt > 5000) {
        state.handoff.arrived = false;
        dispatchCard.classList.remove('is-arrived');
        dispatchCard.querySelector('.gd-tag').textContent = '🚨 High-priority dispatch';
      }
    } else {
      etaEl.textContent = fmt(secToStop);
      if (state.handoff.active) dEta.textContent = fmt(secToStop);
      if (state.handoff.active && secToStop <= 1) {
        state.handoff.arrived = true;
        state.handoff.arrivedAt = now;
        onArrived();
      }
    }

    requestAnimationFrame(tick);
  }

  function onArrived() {
    dispatchCard.classList.add('is-arrived');
    dispatchCard.querySelector('.gd-tag').textContent = '✅ Truck arrived — crew at pickup point';
    toast('Truck arrived — hand over your waste 🚛');
  }

  if (!REDUCE) {
    requestAnimationFrame(tick);
  } else {
    // Static fallback for reduced motion
    const p = pointAtT(ROUTE, 0.42);
    truckEl.style.left = (p.x / 840 * 100).toFixed(2) + '%';
    truckEl.style.top = (p.y / 520 * 100).toFixed(2) + '%';
    routeDone.setAttribute('stroke-dasharray', (_routeTotal * 0.42).toFixed(1) + ' ' + _routeTotal.toFixed(1));
    etaEl.textContent = fmt((STOP_T - 0.42) * (T_LOOP_MS / 1000));
  }

  /* ---- Hand-off modal ---- */
  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    updateBuffer();
    syncConfirm();
    const first = catWrap.querySelector('[data-cat]');
    if (first) first.focus();
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (ctaBtn) ctaBtn.focus();
  }
  ctaBtn.addEventListener('click', openModal);
  modal.querySelector('[data-modal-close]').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  /* 200 m buffer check — distance from the pinned citizen spot to the route */
  function updateBuffer() {
    const d = Math.round(distToRoute(CITIZEN.x, CITIZEN.y));
    const ok = d <= BUFFER_M;
    bufferEl.innerHTML = ok
      ? '📏 <b>Verified:</b> your pin is <b>' + d + ' m</b> from the truck’s route — within the 200 m buffer.'
      : '⚠️ Your pin is <b>' + d + ' m</b> from the route — outside the 200 m buffer. Move closer.';
    bufferEl.classList.toggle('ok', ok);
    bufferEl.classList.toggle('fail', !ok);
    return ok;
  }

  catWrap.querySelectorAll('[data-cat]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      catWrap.querySelectorAll('[data-cat]').forEach(function (b) { b.classList.remove('sel'); });
      btn.classList.add('sel');
      state.handoff.category = btn.dataset.cat;
      syncConfirm();
    });
  });
  pointWrap.querySelectorAll('[data-point]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      pointWrap.querySelectorAll('[data-point]').forEach(function (b) { b.classList.remove('sel'); });
      btn.classList.add('sel');
      state.handoff.point = btn.dataset.point;
      syncConfirm();
    });
  });

  function syncConfirm() { confirmBtn.disabled = !(state.handoff.category && state.handoff.point); }

  confirmBtn.addEventListener('click', function () {
    if (!updateBuffer()) return;
    if (!state.handoff.category || !state.handoff.point) return;

    state.handoff.active = true;
    state.handoff.arrived = false;

    dCat.textContent = CAT_LABEL[state.handoff.category];
    dPoint.textContent = PT_LABEL[state.handoff.point];
    dEta.textContent = fmt(((((STOP_T - state.progress) % 1) + 1) % 1) * (T_LOOP_MS / 1000));

    dispatchCard.hidden = false;
    dispatchCard.classList.remove('is-arrived');
    dispatchCard.querySelector('.gd-tag').textContent = '🚨 High-priority dispatch';
    citizenPin.classList.add('active');

    closeModal();
    toast('Hand-off requested — crew notified 🚛');
    dispatchCard.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'nearest' });
  });
})();
