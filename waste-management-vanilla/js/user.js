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

  /* ---------- Photo — AI vision (required) ---------- */
  let photoAttached = false;
  let aiResult = null; // { type, severity, conf }
  const DROP = document.getElementById('photoDrop');
  const AI_SCAN = document.getElementById('aiScan');
  const AI_TYPE = document.getElementById('aiType');
  const AI_SEV = document.getElementById('aiSev');
  const AI_CONF = document.getElementById('aiConf');

  window.openCamera = function () { document.getElementById('rPhotoCamera').click(); };
  window.openUpload = function () { document.getElementById('rPhotoUpload').click(); };

  window.previewPhoto = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const img = document.getElementById('photoPreview');
    img.src = URL.createObjectURL(file);
    img.hidden = false;
    DROP.classList.add('has-photo');
    photoAttached = true;
    document.getElementById('errPhoto').classList.remove('show');
    runAiAnalysis(file);
  };

  function runAiAnalysis(file) {
    AI_SCAN.hidden = false;
    AI_SCAN.classList.add('analyzing');
    AI_SCAN.querySelector('.ai-scan__badge').textContent = '⏳ AI Scanning…';
    AI_TYPE.textContent = AI_SEV.textContent = AI_CONF.textContent = '—';
    // Deterministic demo classification from the image's name + size (no backend)
    const seed = (file.name + file.size).split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100000, 7);
    setTimeout(() => {
      const type = Store.WASTE_TYPES[seed % Store.WASTE_TYPES.length];
      const sevKey = seed % 4 === 0 ? 'High' : seed % 5 === 0 ? 'Low' : 'Medium';
      const sevLabel = sevKey === 'High' ? 'High severity — Overflow' : sevKey + ' severity';
      const conf = (88 + (seed % 10)) + '%';
      aiResult = { type: type.key, severity: sevKey, conf };
      AI_TYPE.textContent = type.icon + ' ' + type.key + ' — ' + type.desc;
      AI_SEV.textContent = sevLabel;
      AI_CONF.textContent = conf;
      AI_SCAN.querySelector('.ai-scan__badge').textContent = '✨ AI Verified';
      AI_SCAN.classList.remove('analyzing');
    }, 1100);
  }
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

  /* ---------- Submit report ---------- */
  document.getElementById('reportForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    const markErr = (id, cond) => { const el = document.getElementById(id); if (cond) { el.classList.add('show'); ok = false; } else el.classList.remove('show'); };
    markErr('errPhoto', !photoAttached);
    markErr('errLoc', !document.getElementById('rLoc').value.trim());
    markErr('errDesc', !document.getElementById('rDesc').value.trim());
    if (!ok) { toast('Please fix the highlighted fields', true); return; }

    const r = Store.create({
      wasteType: (aiResult && aiResult.type) || 'Plastic',
      location: document.getElementById('rLoc').value.trim(),
      desc: document.getElementById('rDesc').value.trim(),
      severity: (aiResult && aiResult.severity) || 'Medium',
      photo: document.getElementById('photoPreview').src || '',
      reporter: MY_EMAIL,
      reporterName: me.name || 'Citizen',
    });

    e.target.reset();
    photoAttached = false;
    aiResult = null;
    const preview = document.getElementById('photoPreview');
    preview.hidden = true;
    preview.src = '';
    DROP.classList.remove('has-photo');
    document.getElementById('photoText').textContent = 'Point your camera at the waste — the AI will classify it and suggest a crew.';
    AI_SCAN.hidden = true;
    AI_SCAN.classList.remove('analyzing');
    document.getElementById('charCount').textContent = '0 / 400';

    toast(`Report submitted! ID: ${r.id}`);
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

  /* ---------- Community Leaderboard ---------- */
  const LEADERS = [
    { rank: 1, name: 'Vedant Pratap', initials: 'VP', points: 2450, reports: 38, streak: 12 },
    { rank: 2, name: 'Ankit Kumar', initials: 'AK', points: 2190, reports: 35, streak: 9 },
    { rank: 3, name: 'Riya Singh', initials: 'RS', points: 1985, reports: 31, streak: 14 },
    { rank: 4, name: 'Ayush Singh', initials: 'AS', points: 1820, reports: 29, streak: 8 },
    { rank: 5, name: 'Shivam Kumar', initials: 'SK', points: 1640, reports: 26, streak: 11 },
    { rank: 6, name: 'Neha Sharma', initials: 'NS', points: 1495, reports: 23, streak: 6 },
  ];
  function renderLeaderboard() {
    const podium = document.getElementById('leadersPodium');
    const list = document.getElementById('leadersList');
    if (!podium || !list) return;
    const top3 = LEADERS.slice(0, 3);
    const ordered = [top3[1], top3[0], top3[2]]; // desktop reads 2 · 1 · 3
    podium.innerHTML = ordered.map((l) => `
      <div class="lb-podium-card lb-p${l.rank}">
        <span class="lb-rank">${l.rank === 1 ? '👑 ' : ''}#${l.rank}</span>
        <span class="lb-avatar">${l.initials}</span>
        <div class="lb-id"><b>${l.name}</b><span class="lb-sub">${l.points.toLocaleString()} pts · ${l.reports} reports</span></div>
      </div>`).join('');
    list.innerHTML = LEADERS.slice(3).map((l) => `
      <li class="lb-row">
        <span class="lb-no">#${l.rank}</span>
        <span class="lb-avatar sm">${l.initials}</span>
        <div class="lb-name"><b>${l.name}</b><small>${l.reports} reports · ${l.streak}-day streak</small></div>
        <span class="lb-pts">${l.points.toLocaleString()}</span>
      </li>`).join('');
  }

  /* ---------- Live sync ---------- */
  Store.onChange(() => { renderStats(); syncPills(); renderReports(); });

  renderHeader();
  renderStats();
  syncPills();
  renderReports();
  renderTips();
  renderLeaderboard();
})();
