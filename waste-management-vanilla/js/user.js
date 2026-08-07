/* =====================================================================
 * SwachLens — User (Citizen) dashboard
 * Stats banner · Report modal · My Reports tracker · Recycling tips
 * ===================================================================== */
(function () {
  const me = Auth.require('USER');
  if (!me) return;
  const MY_EMAIL = me.email;
  let filter = 'All';

  /* ---------- Header ---------- */
  function renderHeader() {
    const name = me.name || me.email.split('@')[0];
    document.getElementById('uName').textContent = name;
    document.getElementById('greetName').textContent = name.split(' ')[0];
    document.getElementById('uAvatar').textContent = name.trim()[0].toUpperCase();
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    const s = Store.statsForUser(MY_EMAIL);
    countUp(document.getElementById('statResolved'), s.resolved);
    countUp(document.getElementById('statActive'), s.active);
    countUp(document.getElementById('statOnTime'), s.onTime, { decimals: 0 });
    document.getElementById('statOnTime').textContent = s.onTime + '%';
  }

  /* ---------- Waste type picker ---------- */
  let selectedWaste = '';
  const wastePick = document.getElementById('wastePick');
  wastePick.innerHTML = Store.WASTE_TYPES.map((w, i) => `
    <div class="wpick" data-waste="${w.key}" style="animation-delay:${i * 60}ms">
      <span class="w-ico">${w.icon}</span>${w.key}<small style="display:block;color:var(--muted);font-size:10.5px;font-weight:600;">${w.desc}</small>
    </div>`).join('');
  wastePick.querySelectorAll('.wpick').forEach((el) =>
    el.addEventListener('click', () => {
      wastePick.querySelectorAll('.wpick').forEach((w) => w.classList.remove('sel'));
      el.classList.add('sel');
      selectedWaste = el.dataset.waste;
      document.getElementById('errWaste').classList.remove('show');
    })
  );

  /* ---------- Severity ---------- */
  let selectedSev = 'Medium';
  const sevEls = document.querySelectorAll('#severity .sev');
  sevEls.forEach((s) =>
    s.addEventListener('click', () => {
      sevEls.forEach((x) => x.classList.remove('sel'));
      s.classList.add('sel');
      selectedSev = s.dataset.sev;
    })
  );

  /* ---------- Photo ---------- */
  window.previewPhoto = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const drop = document.getElementById('photoDrop');
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    drop.innerHTML = '';
    drop.appendChild(img);
    drop.appendChild(document.getElementById('rPhoto'));
    drop.classList.add('has-photo');
  };
  window.useMyLoc = function () {
    const loc = document.getElementById('rLoc');
    if (!navigator.geolocation) { toast('Geolocation not supported', true); return; }
    loc.value = 'Detecting…';
    navigator.geolocation.getCurrentPosition(
      (pos) => (loc.value = `Lat ${pos.coords.latitude.toFixed(4)}, Lon ${pos.coords.longitude.toFixed(4)}`),
      () => { loc.value = ''; toast('Could not detect location — please type it', true); },
      { timeout: 8000 }
    );
  };
  document.getElementById('rDesc').addEventListener('input', (e) => {
    document.getElementById('charCount').textContent = `${e.target.value.length} / 400`;
  });

  /* ---------- Report now vs Book a pickup ---------- */
  let bookingMode = 'report';
  const bToggle = document.getElementById('bookingToggle');
  const bFields = document.getElementById('bookingFields');
  function resetBooking() {
    bookingMode = 'report';
    if (bToggle) bToggle.querySelectorAll('[data-bmode]').forEach((x) => x.classList.toggle('active', x.dataset.bmode === 'report'));
    if (bFields) bFields.style.display = 'none';
    const bd = document.getElementById('bDate'), bt = document.getElementById('bTime');
    if (bd) bd.value = '';
    if (bt) bt.value = '';
    const eb = document.getElementById('errBooking');
    if (eb) eb.classList.remove('show');
    const st = document.getElementById('sheetTitle');
    if (st) st.textContent = 'Report a Waste Issue';
  }
  if (bToggle) {
    bToggle.querySelectorAll('[data-bmode]').forEach((b) =>
      b.addEventListener('click', () => {
        bookingMode = b.dataset.bmode;
        bToggle.querySelectorAll('[data-bmode]').forEach((x) => x.classList.toggle('active', x === b));
        if (bFields) bFields.style.display = bookingMode === 'book' ? '' : 'none';
        const st = document.getElementById('sheetTitle');
        if (st) st.textContent = bookingMode === 'book' ? 'Book a Pickup' : 'Report a Waste Issue';
        const eb = document.getElementById('errBooking');
        if (eb) eb.classList.remove('show');
      })
    );
  }

  /* ---------- Submit report ---------- */
  document.getElementById('reportForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    const markErr = (id, cond) => { const el = document.getElementById(id); if (cond) { el.classList.add('show'); ok = false; } else el.classList.remove('show'); };
    markErr('errWaste', !selectedWaste);
    markErr('errLoc', !document.getElementById('rLoc').value.trim());
    markErr('errDesc', !document.getElementById('rDesc').value.trim());
    let scheduledAt = null;
    if (bookingMode === 'book') {
      const bd = document.getElementById('bDate').value;
      const bt = document.getElementById('bTime').value;
      markErr('errBooking', !bd || !bt);
      if (bd && bt) scheduledAt = new Date(bd + 'T' + bt).getTime();
    }
    if (!ok) { toast('Please fix the highlighted fields', true); return; }

    const r = Store.create({
      wasteType: selectedWaste,
      location: document.getElementById('rLoc').value.trim(),
      desc: document.getElementById('rDesc').value.trim(),
      severity: selectedSev,
      photo: document.getElementById('photoDrop').querySelector('img')?.src || '',
      reporter: MY_EMAIL,
      reporterName: me.name || 'Citizen',
      isBooking: bookingMode === 'book',
      scheduledAt,
    });

    e.target.reset();
    selectedWaste = ''; selectedSev = 'Medium';
    wastePick.querySelectorAll('.wpick').forEach((w) => w.classList.remove('sel'));
    sevEls.forEach((x) => x.classList.remove('sel'));
    sevEls[1].classList.add('sel');
    const drop = document.getElementById('photoDrop');
    const fileInput = document.getElementById('rPhoto');
    drop.innerHTML = '<span id="photoText">📷 Tap to attach a photo (optional)</span>';
    drop.appendChild(fileInput);
    drop.classList.remove('has-photo');
    document.getElementById('charCount').textContent = '0 / 400';

    toast(r.isBooking ? `Pickup booked! ID: ${r.id} 🗓️` : `Report submitted! ID: ${r.id}`);
    resetBooking();
    closeSheet('reportSheet');
    setTimeout(() => { filter = 'All'; syncPills(); renderReports(); document.getElementById('myReports').scrollIntoView({ behavior: 'smooth' }); }, 350);
  });

  /* ---------- My Reports ---------- */
  function syncPills() {
    const mine = Store.byUser(MY_EMAIL);
    const counts = { All: mine.length };
    Store.STATUS_LABEL && Object.values(Store.STATUS_LABEL).forEach((l) => (counts[l] = 0));
    mine.forEach((r) => (counts[Store.STATUS_LABEL[r.status]]++));

    document.getElementById('pills').innerHTML = ['All', 'Pending', 'In Progress', 'Verification', 'Resolved']
      .map((k) => `<button class="pill ${filter === k ? 'active' : ''}" data-f="${k}">${k} <span class="cnt">${counts[k] || 0}</span></button>`)
      .join('');
    document.querySelectorAll('#pills .pill').forEach((p) =>
      p.addEventListener('click', () => { filter = p.dataset.f; syncPills(); renderReports(); })
    );
  }

  const PROGRESS = { Pending: 18, 'In Progress': 60, Verification: 85, Resolved: 100 };
  const BAR_COLOR = { Pending: '#f59e0b', 'In Progress': '#3b82f6', Verification: '#8b5cf6', Resolved: '#22c55e' };

  function renderReports() {
    const mine = Store.byUser(MY_EMAIL).filter((r) => filter === 'All' || Store.STATUS_LABEL[r.status] === filter);
    const grid = document.getElementById('reportsGrid');
    if (!mine.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🌱</span><b>No reports here yet</b>Tap “Report a Waste Issue” to file your first one — we'll take it from there.</div>`;
      return;
    }
    grid.innerHTML = mine.map((r, i) => {
      const st = Store.STATUS_LABEL[r.status];
      const icon = (Store.WASTE_TYPES.find((w) => w.key === r.wasteType) || {}).icon || '🗑️';
      return `
      <article class="report-card reveal in" style="animation-delay:${Math.min(i * 60, 360)}ms" onclick="window.userViewReport('${r.id}')">
        ${r.photo ? `<img class="rc-photo" src="${r.photo}" alt="Report photo" />` : ''}
        <div class="rc-body">
          <div class="rc-top">
            <h4>${icon} ${escapeHtml(r.wasteType)}</h4>
            ${r.isBooking ? '<span class="rc-tag" style="flex:0 0 auto;">🗓️ Booking</span>' : ''}
            <span class="status-badge st-${st === 'In Progress' ? 'progress' : st.toLowerCase()}">${st}</span>
          </div>
          <div class="rc-meta">📍 ${escapeHtml(r.location)}</div>
          <div class="rc-meta" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">🗒️ ${escapeHtml(r.desc)}</div>
          <div class="rc-progress"><i style="width:${PROGRESS[st]}%;background:${BAR_COLOR[st]};"></i></div>
          <div class="rc-foot">
            <span class="rc-tag">⚡ ${r.severity} severity</span>
            <span class="rc-tag" style="font-variant-numeric:tabular-nums;">${r.id}</span>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  window.userViewReport = function (id) {
    const r = Store.get(id);
    if (!r) return;
    const st = Store.STATUS_LABEL[r.status];
    const steps = ['Pending', 'In Progress', 'Verification', 'Resolved'];
    const idx = steps.indexOf(st);
    const noteFor = (i) => {
      if (i < idx) return 'Completed';
      if (i > idx) return 'Not started yet';
      return st === 'Pending'
        ? (r.isBooking ? 'Booking confirmed — awaiting dispatch' : 'Waiting for dispatch')
        : st === 'In Progress'
        ? (r.isBooking ? 'Scheduled — crew assigned' : 'Crew on the way')
        : st === 'Verification' ? 'Group lead is verifying the work'
        : 'Done 🎉';
    };
    const tl = steps.map((s, i) => {
      const cls = i < idx ? 'done' : i === idx ? 'cur' : '';
      return `<div class="tl-step ${cls}"><span class="dot"></span><div><b>${s}</b><small>${noteFor(i)}</small></div></div>`;
    }).join('');
    const icon = (Store.WASTE_TYPES.find((w) => w.key === r.wasteType) || {}).icon || '🗑️';

    document.getElementById('dTitle').textContent = `${icon} ${r.wasteType}${r.isBooking ? ' · 🗓️ Booking' : ''}`;
    document.getElementById('detailBody').innerHTML = `
      <div class="m-meta" style="color:var(--muted);font-size:13.5px;margin-bottom:16px;">${r.id} · ⚡ ${r.severity} · submitted ${timeAgo(r.createdAt)}</div>
      ${r.photo ? `<img src="${r.photo}" alt="Report photo" style="border-radius:14px;width:100%;max-height:240px;object-fit:cover;margin-bottom:16px;" />` : ''}
      <div class="detail-row"><span class="d-lbl">Type</span><span class="d-val">${r.isBooking ? '🗓️ Booked pickup' : '🚨 Instant report'}</span></div>
      <div class="detail-row"><span class="d-lbl">Location</span><span class="d-val">📍 ${escapeHtml(r.location)}</span></div>
      ${r.isBooking && r.scheduledAt ? `<div class="detail-row"><span class="d-lbl">Scheduled</span><span class="d-val">🗓️ ${new Date(r.scheduledAt).toLocaleString()}</span></div>` : ''}
      <div class="detail-row"><span class="d-lbl">Category</span><span class="d-val">${icon} ${escapeHtml(r.wasteType)}</span></div>
      <div class="detail-row"><span class="d-lbl">Notes</span><span class="d-val">${escapeHtml(r.desc)}</span></div>
      <div class="detail-row"><span class="d-lbl">Status</span><span class="d-val"><span class="status-badge st-${st === 'In Progress' ? 'progress' : st.toLowerCase()}">${st}</span></span></div>
      <h4 style="margin:20px 0 4px;">Progress</h4>
      <div class="tl">${tl}</div>`;
    openSheet('detailSheet');
  };

  /* ---------- Tips ---------- */
  const TIPS = [
    { icon: '🧴', t: 'Rinse before recycling', d: 'Clean containers are far more likely to be recycled. A quick rinse is enough.' },
    { icon: '🥫', t: 'Separate wet & dry', d: 'Keep organic waste out of recyclables — it contaminates the whole batch.' },
    { icon: '🔋', t: 'E-waste has its own bin', d: 'Batteries and electronics must never go in regular garbage.' },
    { icon: '🌱', t: 'Compost food scraps', d: 'Composting kitchen waste cuts landfill load and feeds your garden.' },
  ];
  function renderTips() {
    document.getElementById('tipsGrid').innerHTML = TIPS.map((t) => `
      <div class="tip-card reveal"><span class="t-ico">${t.icon}</span><b>${t.t}</b><p>${t.d}</p></div>`).join('');
  }

  /* ---------- Live sync ---------- */
  Store.onChange(() => { renderStats(); syncPills(); renderReports(); });

  renderHeader();
  renderStats();
  syncPills();
  renderReports();
  renderTips();
})();
