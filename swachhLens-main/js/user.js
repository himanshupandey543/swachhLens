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
  let selectedFile = null;
  let aiResult = null; // { type, severity, conf }
  let aiRejected = false;      // true when the AI found no dump / the photo is invalid
  let selectedLoc = null;      // { lat, lng } from the map / GPS
  let map = null, marker = null; // Leaflet map + pin
  const DROP = document.getElementById('photoDrop');
  const AI_SCAN = document.getElementById('aiScan');
  const AI_TYPE = document.getElementById('aiType');
  const AI_SEV = document.getElementById('aiSev');
  const AI_CONF = document.getElementById('aiConf');

  window.openUpload = function () { document.getElementById('rPhotoUpload').click(); };

  /* Apply a File to the photo drop — shared by upload and camera capture. */
  function applyPhoto(file) {
    const img = document.getElementById('photoPreview');
    img.src = URL.createObjectURL(file);
    img.hidden = false;
    DROP.classList.add('has-photo');
    photoAttached = true;
    selectedFile = file;
    document.getElementById('errPhoto').classList.remove('show');
    runAiAnalysis(file);
  }

  window.previewPhoto = function (e) {
    const file = e.target.files[0];
    if (file) applyPhoto(file);
  };

  /* ---------- In-browser camera capture (getUserMedia) ---------- */
  let camStream = null;
  let camBlob = null;
  let camFacing = 'environment';
  let camFlashOn = false;

  async function startCamera(facingMode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera is not supported in this browser.');
    }
    camFacing = facingMode || camFacing;
    stopCamera(); // release any previous stream before requesting a new one
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const video = document.getElementById('camVideo');
    video.srcObject = camStream;
    await video.play().catch(() => {});
    refreshFlashState();
  }

  function stopCamera() {
    if (camStream) {
      camStream.getTracks().forEach((t) => t.stop());
      camStream = null;
    }
    const video = document.getElementById('camVideo');
    if (video) video.srcObject = null;
    camFlashOn = false;
    const flashBtn = document.getElementById('camFlash');
    if (flashBtn) {
      flashBtn.disabled = true;
      flashBtn.classList.remove('is-on');
      flashBtn.textContent = '🔦 Flash';
    }
  }

  /* Enable/disable the flash button based on the current track's capabilities. */
  function refreshFlashState() {
    const flashBtn = document.getElementById('camFlash');
    if (!flashBtn) return;
    const track = camStream ? camStream.getVideoTracks()[0] : null;
    let supported = false;
    try { supported = !!(track && track.getCapabilities && track.getCapabilities().torch === true); } catch { /* ignore */ }
    flashBtn.disabled = !supported;
    flashBtn.textContent = camFlashOn ? '🔦 Flash On' : '🔦 Flash';
    flashBtn.classList.toggle('is-on', camFlashOn && supported);
  }

  async function toggleFlash() {
    const track = camStream ? camStream.getVideoTracks()[0] : null;
    let supported = false;
    try { supported = !!(track && track.getCapabilities && track.getCapabilities().torch === true); } catch { /* ignore */ }
    if (!supported) { toast('Flash is not supported on this camera.', true); return; }
    camFlashOn = !camFlashOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: camFlashOn }] });
      refreshFlashState();
    } catch {
      camFlashOn = !camFlashOn; // revert
      toast('Could not toggle the flash.', true);
      refreshFlashState();
    }
  }

  function setCamState(state) {
    document.getElementById('camLive').hidden = state !== 'live';
    document.getElementById('camCaptured').hidden = state !== 'captured';
    document.getElementById('camTitle').textContent = state === 'live' ? 'Take a Photo' : 'Photo captured';
  }

  function captureFrame() {
    const video = document.getElementById('camVideo');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not capture the image'))), 'image/jpeg', 0.85);
    });
  }

  window.openCamera = async function () {
    // If in-browser capture is unavailable, fall back to the native file input —
    // its capture="environment" attribute opens the camera directly on mobile.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      document.getElementById('rPhotoCamera').click();
      return;
    }
    try {
      await startCamera();
      setCamState('live');
      openSheet('camSheet');
    } catch (err) {
      toast(err.message || 'Camera unavailable — use Upload instead.', true);
      document.getElementById('rPhotoCamera').click();
    }
  };

  document.getElementById('camCapture').addEventListener('click', async () => {
    try {
      const blob = await captureFrame();
      document.getElementById('camShot').src = URL.createObjectURL(blob);
      camBlob = blob;
      stopCamera(); // free the camera while reviewing
      setCamState('captured');
    } catch (err) {
      toast(err.message || 'Could not capture the photo.', true);
    }
  });

  document.getElementById('camRetake').addEventListener('click', async () => {
    try {
      await startCamera();
      setCamState('live');
    } catch (err) {
      toast('Could not restart the camera.', true);
      closeSheet('camSheet');
    }
  });

  document.getElementById('camUse').addEventListener('click', () => {
    if (!camBlob) { toast('No photo captured yet.', true); return; }
    const file = new File([camBlob], 'camera-' + Date.now() + '.jpg', { type: camBlob.type || 'image/jpeg' });
    camBlob = null;
    closeSheet('camSheet');
    applyPhoto(file);
  });

  document.getElementById('camFlip').addEventListener('click', async () => {
    const next = camFacing === 'environment' ? 'user' : 'environment';
    try {
      await startCamera(next);
      setCamState('live');
    } catch (err) {
      toast('Could not switch camera.', true);
    }
  });

  document.getElementById('camFlash').addEventListener('click', toggleFlash);

  // Always stop the camera stream when the sheet is closed (✕ or Esc).
  const camSheetEl = document.getElementById('camSheet');
  camSheetEl.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close-sheet]');
    if (closer && closer.dataset.closeSheet === 'camSheet') stopCamera();
  });
  // Escape also closes the sheet via ui.js — stop the stream regardless.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stopCamera();
  });

  /* Local deterministic estimate — offline fallback if the vision API is down. */
  function classifyLocally(file) {
    const seed = (file.name + file.size).split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 100000, 7);
    const type = Store.WASTE_TYPES[seed % Store.WASTE_TYPES.length];
    const sevKey = seed % 4 === 0 ? 'High' : seed % 5 === 0 ? 'Low' : 'Medium';
    return { valid: true, type: type.key, severity: sevKey, conf: (60 + (seed % 25)) + '%', engine: 'local',
             reason: null, summary: `Estimated ${type.key.toLowerCase()} waste — nearby pile.` };
  }

  const AI_LABELS = { yolo: '🧠 YOLO — verified', demo: '✨ AI Verified', local: '⚡ Local estimate' };

  function renderAiVerdict(res) {
    const sum = document.getElementById('aiSum');
    const errEl = document.getElementById('aiErr');
    if (sum) sum.hidden = true;
    if (errEl) errEl.hidden = true;
    AI_SCAN.classList.remove('invalid');
    if (!res.valid) {
      aiResult = null;
      aiRejected = true;
      AI_TYPE.textContent = '—';
      AI_SEV.textContent = '—';
      AI_CONF.textContent = '—';
      AI_SCAN.querySelector('.ai-scan__badge').textContent = '🚫 No waste detected';
      AI_SCAN.classList.add('invalid');
      if (errEl) { errEl.textContent = res.reason || 'Please attach a photo of the dump.'; errEl.hidden = false; }
      AI_SCAN.classList.remove('analyzing');
      return;
    }
    aiResult = { type: res.type, severity: res.severity, conf: res.conf };
    aiRejected = false;
    const wt = Store.WASTE_TYPES.find((w) => w.key === res.type);
    AI_TYPE.textContent = wt ? wt.icon + ' ' + wt.key + ' — ' + wt.desc : res.type;
    AI_SEV.textContent = res.severity === 'High' ? 'High severity — Overflow' : res.severity + ' severity';
    AI_CONF.textContent = res.conf;
    AI_SCAN.querySelector('.ai-scan__badge').textContent = AI_LABELS[res.engine] || '✨ AI Verified';
    AI_SCAN.classList.remove('analyzing');
    if (sum && res.summary) { sum.textContent = res.summary; sum.hidden = false; }
  }

  async function runAiAnalysis(file) {
    AI_SCAN.hidden = false;
    AI_SCAN.classList.add('analyzing');
    AI_SCAN.querySelector('.ai-scan__badge').textContent = '⏳ AI Scanning…';
    AI_TYPE.textContent = AI_SEV.textContent = AI_CONF.textContent = '—';
    let res;
    try {
      const photo = await fileToDataURL(file);
      const server = await Promise.race([
        API.vision.analyze(photo),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
      res = {
        valid: server.valid !== false,
        type: server.wasteType,
        severity: server.severity,
        conf: (server.confidence != null ? server.confidence : 0) + '%',
        engine: server.engine === 'yolo' ? 'yolo' : 'demo',
        reason: server.reason || null,
        summary: server.summary || null,
      };
    } catch (err) {
      res = classifyLocally(file);
      if (window.toast) toast('AI service offline — using local estimate.', true);
    }
    renderAiVerdict(res);
  }
  /* ---------- Location map (Leaflet + OpenStreetMap) ---------- */
  function initLocationMap() {
    const el = document.getElementById('locMap');
    if (!el || typeof L === 'undefined') return;
    map = L.map('locMap', { scrollWheelZoom: false }).setView([28.6139, 77.2090], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('click', (e) => placeMarker(e.latlng));
  }

  function placeMarker(latlng) {
    if (!map) return;
    const ll = { lat: +latlng.lat.toFixed(6), lng: +latlng.lng.toFixed(6) };
    if (marker) marker.setLatLng(ll);
    else {
      marker = L.marker(ll, { draggable: true }).addTo(map);
      marker.on('dragend', (e) => placeMarker(e.target.getLatLng()));
    }
    selectedLoc = ll;
    const input = document.getElementById('rLoc');
    if (input) input.value = `📍 ${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}`;
    const err = document.getElementById('errLoc');
    if (err) err.classList.remove('show');
  }

  window.toggleMap = function () {
    const el = document.getElementById('locMap');
    const hint = document.getElementById('locHint');
    if (!el) return;
    if (typeof L === 'undefined') { toast('Map tiles unavailable offline — use 📍 Detect or type the location.', true); return; }
    if (!map) initLocationMap();
    const open = el.hidden;
    el.hidden = !open;
    if (hint) hint.hidden = !open;
    if (open && map) setTimeout(() => map.invalidateSize(), 60);
  };

  window.useMyLoc = function () {
    const loc = document.getElementById('rLoc');
    if (!navigator.geolocation) { toast('Geolocation not supported', true); return; }
    loc.value = 'Detecting…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (typeof L !== 'undefined') {
          if (!map) initLocationMap();
          if (map) { map.setView([ll.lat, ll.lng], 15); placeMarker({ lat: ll.lat, lng: ll.lng }); return; }
        }
        loc.value = `Lat ${ll.lat.toFixed(4)}, Lon ${ll.lng.toFixed(4)}`;
        selectedLoc = ll;
        const err = document.getElementById('errLoc');
        if (err) err.classList.remove('show');
      },
      () => { loc.value = ''; toast('Could not detect location — please type it', true); },
      { timeout: 8000 }
    );
  };
  document.getElementById('rDesc').addEventListener('input', (e) => {
    document.getElementById('charCount').textContent = `${e.target.value.length} / 400`;
  });
  // If the user types an address manually, drop the map/GPS coords so a stale
  // pin isn't submitted alongside a hand-written description.
  document.getElementById('rLoc').addEventListener('input', (e) => {
    if (selectedLoc && e.target.value.trim() !== `📍 ${selectedLoc.lat.toFixed(4)}, ${selectedLoc.lng.toFixed(4)}`) {
      selectedLoc = null;
    }
  });

  /* Convert a File to a base64 data URL so the photo persists in the database. */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  /* ---------- Submit report ---------- */
  document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let ok = true;
    const markErr = (id, cond) => { const el = document.getElementById(id); if (cond) { el.classList.add('show'); ok = false; } else el.classList.remove('show'); };
    markErr('errPhoto', !photoAttached);
    markErr('errLoc', !document.getElementById('rLoc').value.trim());
    markErr('errDesc', !document.getElementById('rDesc').value.trim());
    if (!ok) { toast('Please fix the highlighted fields', true); return; }
    if (aiRejected) { toast('The AI did not detect any waste — please attach a photo of the dump.', true); return; }

    // Convert the attached photo to a data URL so it's stored with the report.
    let photo = '';
    if (selectedFile) {
      try {
        photo = await fileToDataURL(selectedFile);
        if (photo.length > 2500000) { toast('Photo is too large (max ~2.5MB) — please pick a smaller one.', true); return; }
      } catch { toast('Could not read the photo — please try again.', true); return; }
    }

    try {
      const r = await Store.create({
        wasteType: (aiResult && aiResult.type) || 'Plastic',
        location: document.getElementById('rLoc').value.trim(),
        desc: document.getElementById('rDesc').value.trim(),
        severity: (aiResult && aiResult.severity) || 'Medium',
        photo,
        lat: selectedLoc ? selectedLoc.lat : null,
        lng: selectedLoc ? selectedLoc.lng : null,
      });

      e.target.reset();
      photoAttached = false;
      selectedFile = null;
      aiResult = null;
      aiRejected = false;
      selectedLoc = null;
      if (map && marker) { map.removeLayer(marker); marker = null; }
      const preview = document.getElementById('photoPreview');
      preview.hidden = true;
      preview.src = '';
      DROP.classList.remove('has-photo');
      document.getElementById('photoText').textContent = 'Point your camera at the waste — the AI will classify it and suggest a crew.';
      AI_SCAN.hidden = true;
      AI_SCAN.classList.remove('analyzing', 'invalid');
      const aiSum = document.getElementById('aiSum');
      const aiErr = document.getElementById('aiErr');
      const locMapEl = document.getElementById('locMap');
      const locHintEl = document.getElementById('locHint');
      if (aiSum) aiSum.hidden = true;
      if (aiErr) aiErr.hidden = true;
      if (locMapEl) locMapEl.hidden = true;
      if (locHintEl) locHintEl.hidden = true;
      document.getElementById('charCount').textContent = '0 / 400';

      toast(`Report submitted! ID: ${r.id}`);
      closeSheet('reportSheet');
      setTimeout(() => { filter = 'All'; syncPills(); renderReports(); document.getElementById('myReports').scrollIntoView({ behavior: 'smooth' }); }, 350);
    } catch (err) {
      toast((err && err.message) || 'Could not submit the report.', true);
    }
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

  const PROGRESS = { Pending: 18, 'In Progress': 60, Verification: 85, Resolved: 100, Cancelled: 0 };
  const BAR_COLOR = { Pending: '#f59e0b', 'In Progress': '#3b82f6', Verification: '#8b5cf6', Resolved: '#22c55e', Cancelled: '#9ca3af' };

  /* Only the first 3 reports are shown by default; the rest sit behind "See more". */
  const PREVIEW_COUNT = 3;
  let showAll = false;

  function reportCardHTML(r, i) {
    const st = Store.STATUS_LABEL[r.status];
    const icon = (Store.WASTE_TYPES.find((w) => w.key === r.wasteType) || {}).icon || '🗑️';
    const canCancel = r.status === Store.STATUS.PENDING || r.status === Store.STATUS.IN_PROGRESS;
    return `
    <article class="report-card reveal in" style="animation-delay:${Math.min(i * 60, 360)}ms" data-id="${r.id}">
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
        <div class="rc-actions">
          ${canCancel ? `<button class="rc-btn rc-btn--cancel" type="button" data-cancel="${r.id}">✕ Cancel</button>` : ''}
          <button class="rc-btn rc-btn--delete" type="button" data-delete="${r.id}">🗑️ Delete</button>
        </div>
      </div>
    </article>`;
  }

  function renderSeeMore(total) {
    const wrap = document.getElementById('reportsMore');
    const btn = document.getElementById('seeMoreBtn');
    if (!wrap || !btn) return;
    const remaining = total - PREVIEW_COUNT;
    wrap.hidden = showAll || remaining <= 0;
    btn.textContent = showAll ? '⬆️ Show less' : `See more (${remaining} more) ➜`;
  }

  function renderReports() {
    const mine = Store.byUser(MY_EMAIL).filter((r) => filter === 'All' || Store.STATUS_LABEL[r.status] === filter);
    const grid = document.getElementById('reportsGrid');
    if (!mine.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🌱</span><b>No reports here yet</b>Tap “Report a Waste Issue” to file your first one — we'll take it from there.</div>`;
      renderSeeMore(0);
      return;
    }
    const visible = showAll ? mine : mine.slice(0, PREVIEW_COUNT);
    grid.innerHTML = visible.map((r, i) => reportCardHTML(r, i)).join('');
    renderSeeMore(mine.length);
  }

  function handleCancelReport(id) {
    const r = Store.get(id);
    if (!r) return;
    if (!window.confirm('Cancel this report? It will be marked as Cancelled.')) return;
    Store.cancel(id)
      .then(() => toast('Report cancelled.'))
      .catch((err) => toast((err && err.message) || 'Could not cancel the report.', true));
  }

  function handleDeleteReport(id) {
    const r = Store.get(id);
    if (!r) return;
    if (!window.confirm('Delete this report permanently? This cannot be undone.')) return;
    Store.remove(id)
      .then(() => toast('Report deleted.'))
      .catch((err) => toast((err && err.message) || 'Could not delete the report.', true));
  }

  document.getElementById('reportsGrid').addEventListener('click', (e) => {
    const cancelBtn = e.target.closest('[data-cancel]');
    if (cancelBtn) { e.stopPropagation(); handleCancelReport(cancelBtn.dataset.cancel); return; }
    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) { e.stopPropagation(); handleDeleteReport(delBtn.dataset.delete); return; }
    const card = e.target.closest('.report-card[data-id]');
    if (card) window.userViewReport(card.dataset.id);
  });

  const seeMoreBtn = document.getElementById('seeMoreBtn');
  if (seeMoreBtn) {
    seeMoreBtn.addEventListener('click', () => {
      showAll = !showAll;
      syncPills();
      renderReports();
    });
  }

  window.userViewReport = function (id) {
    const r = Store.get(id);
    if (!r) return;
    const st = Store.STATUS_LABEL[r.status];
    const canCancel = r.status === Store.STATUS.PENDING || r.status === Store.STATUS.IN_PROGRESS;
    const icon = (Store.WASTE_TYPES.find((w) => w.key === r.wasteType) || {}).icon || '🗑️';

    document.getElementById('dTitle').textContent = `${icon} ${r.wasteType}${r.isBooking ? ' · 🗓️ Booking' : ''}`;

    const detailNote = (rs, sb) => `
      <div class="detail-row"><span class="d-lbl">Status</span><span class="d-val"><span class="status-badge st-${sb}">${rs}</span></span></div>`;

    if (st === 'Cancelled') {
      const body = `
        <div class="m-meta" style="color:var(--muted);font-size:13.5px;margin-bottom:16px;">${r.id} · ⚡ ${r.severity} · submitted ${timeAgo(r.createdAt)}</div>
        ${r.photo ? `<img src="${r.photo}" alt="Report photo" style="border-radius:14px;width:100%;max-height:240px;object-fit:cover;margin-bottom:16px;" />` : ''}
        <div class="detail-row"><span class="d-lbl">Type</span><span class="d-val">${r.isBooking ? '🗓️ Booked pickup' : '🚨 Instant report'}</span></div>
        <div class="detail-row"><span class="d-lbl">Location</span><span class="d-val">📍 ${escapeHtml(r.location)}</span></div>
        ${r.isBooking && r.scheduledAt ? `<div class="detail-row"><span class="d-lbl">Scheduled</span><span class="d-val">🗓️ ${new Date(r.scheduledAt).toLocaleString()}</span></div>` : ''}
        <div class="detail-row"><span class="d-lbl">Category</span><span class="d-val">${icon} ${escapeHtml(r.wasteType)}</span></div>
        <div class="detail-row"><span class="d-lbl">Notes</span><span class="d-val">${escapeHtml(r.desc)}</span></div>
        <div class="detail-row"><span class="d-lbl">Status</span><span class="d-val"><span class="status-badge st-cancelled">Cancelled</span></span></div>
        <div class="cancelled-note">🚫 This report was cancelled by you and is no longer being actioned. You can delete it permanently if you wish.</div>
        <div class="d-actions"><button class="btn btn-danger" type="button" id="dDeleteRow">🗑️ Delete Report</button></div>`;
      document.getElementById('detailBody').innerHTML = body;
      document.getElementById('dDeleteRow').addEventListener('click', () => { closeSheet('detailSheet'); handleDeleteReport(r.id); });
      openSheet('detailSheet');
      return;
    }

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

    document.getElementById('detailBody').innerHTML = `
      <div class="m-meta" style="color:var(--muted);font-size:13.5px;margin-bottom:16px;">${r.id} · ⚡ ${r.severity} · submitted ${timeAgo(r.createdAt)}</div>
      ${r.photo ? `<img src="${r.photo}" alt="Report photo" style="border-radius:14px;width:100%;max-height:240px;object-fit:cover;margin-bottom:16px;" />` : ''}
      <div class="detail-row"><span class="d-lbl">Type</span><span class="d-val">${r.isBooking ? '🗓️ Booked pickup' : '🚨 Instant report'}</span></div>
      <div class="detail-row"><span class="d-lbl">Location</span><span class="d-val">📍 ${escapeHtml(r.location)}</span></div>
      ${r.isBooking && r.scheduledAt ? `<div class="detail-row"><span class="d-lbl">Scheduled</span><span class="d-val">🗓️ ${new Date(r.scheduledAt).toLocaleString()}</span></div>` : ''}
      <div class="detail-row"><span class="d-lbl">Category</span><span class="d-val">${icon} ${escapeHtml(r.wasteType)}</span></div>
      <div class="detail-row"><span class="d-lbl">Notes</span><span class="d-val">${escapeHtml(r.desc)}</span></div>
      ${detailNote(st, st === 'In Progress' ? 'progress' : st.toLowerCase())}
      <h4 style="margin:20px 0 4px;">Progress</h4>
      <div class="tl">${tl}</div>
      <div class="d-actions">
        ${canCancel ? `<button class="btn btn-outline" type="button" id="dCancelRow">✕ Cancel Report</button>` : ''}
        <button class="btn btn-danger" type="button" id="dDeleteRow">🗑️ Delete Report</button>
      </div>`;
    const dCancel = document.getElementById('dCancelRow');
    if (dCancel) dCancel.addEventListener('click', () => { closeSheet('detailSheet'); handleCancelReport(r.id); });
    document.getElementById('dDeleteRow').addEventListener('click', () => { closeSheet('detailSheet'); handleDeleteReport(r.id); });
    openSheet('detailSheet');
  };

  /* ---------- Tips ---------- */
  const TIPS = [
    { icon: '🧴', cat: 'Plastic', t: 'Rinse before you recycle', d: 'A quick rinse clears food residue so bottles and packaging actually get recycled instead of rejected at the plant.' },
    { icon: '🥫', cat: 'Organic', t: 'Keep wet & dry separate', d: 'Food scraps contaminate an entire batch of recyclables. Segregate at the source — your bin and the crew will thank you.' },
    { icon: '🌱', cat: 'Organic', t: 'Compost your scraps', d: 'Turn kitchen waste into garden soil. It cuts the landfill load and feeds your plants for free.' },
    { icon: '🚰', cat: 'Home', t: 'Keep a scrap pot by the sink', d: 'A small countertop pot diverts daily scraps straight to compost — lighter bin, less smell.' },
    { icon: '🔋', cat: 'E-Waste', t: 'E-waste never goes in the bin', d: 'Batteries and electronics leak harmful toxins. Take them to a dedicated e-waste drop instead of the regular bin.' },
    { icon: '💊', cat: 'Hazardous', t: 'Safely dispose of medicines', d: 'Never flush pills or toss them loose. Hand expired medication to a pharmacy for safe destruction.' },
    { icon: '📦', cat: 'Plastic', t: 'Flatten before binning', d: 'Flatten bottles, boxes and cartons so bins hold more, lids close, and collections stay efficient.' },
    { icon: '♻️', cat: 'Home', t: 'Reuse before recycling', d: 'Jars, bags and boxes can serve again a couple of times before they ever reach the recycler.' },
    { icon: '🗞️', cat: 'Paper', t: 'Recycle clean paper & cardboard', d: 'Keep paper dry and free of food stains so it can be pulped into fresh sheets instead of going to landfill.' },
    { icon: '🥫', cat: 'Metal', t: 'Rinse cans before the bin', d: 'Clean tin and aluminium cans recycle almost forever — a quick rinse stops smells and contamination.' },
    { icon: '🍾', cat: 'Plastic', t: 'Remove caps where you can', d: 'Separating caps from bottles helps plastic sort correctly and lifts the recycling recovery rate.' },
    { icon: '🔢', cat: 'Plastic', t: 'Check the resin number', d: 'Look for the triangle symbol (1–7) — knowing which plastics your area recycles avoids wish-cycling.' },
    { icon: '🏗️', cat: 'Hazardous', t: 'Never burn or bury waste', d: 'Open burning and burying release harmful toxins. Route hazardous waste to a collection point instead.' },
    { icon: '🍶', cat: 'Home', t: 'Ditch single-use bottles', d: 'Carry a refillable bottle and tote bag — small daily swaps that cut plastic waste dramatically over a year.' },
    { icon: '🛒', cat: 'Home', t: 'Buy in bulk, avoid shrink-wrap', d: 'Fewer, larger packs mean less packaging per item — lighter bins and fewer trips to the curb.' },
  ];

  /* Rotate a highlighted tip daily so the section always feels fresh. */
  function featuredTip() {
    const day = new Date().getDay();
    return TIPS[day % TIPS.length];
  }

  function renderTips() {
    const f = featuredTip();
    document.getElementById('tipFeatured').innerHTML = `
      <span class="t-ico">${f.icon}</span>
      <div>
        <span class="tf-label">💡 Tip of the day</span>
        <b>${f.t}</b>
        <p>${f.d}</p>
      </div>`;
    document.getElementById('tipsGrid').innerHTML = TIPS.map((t) => `
      <article class="tip-card reveal">
        <div class="tip-head">
          <span class="t-ico">${t.icon}</span>
          <span class="tip-cat">${t.cat}</span>
        </div>
        <b>${t.t}</b>
        <p>${t.d}</p>
      </article>`).join('');
  }

  /* ---------- Community Leaderboard ---------- */
  const LEADERS_FALLBACK = [
    { rank: 1, name: 'Vedant Pratap', initials: 'VP', points: 2450, reports: 38, streak: 12 },
    { rank: 2, name: 'Ankit Kumar', initials: 'AK', points: 2190, reports: 35, streak: 9 },
    { rank: 3, name: 'Riya Singh', initials: 'RS', points: 1985, reports: 31, streak: 14 },
    { rank: 4, name: 'Ayush Singh', initials: 'AS', points: 1820, reports: 29, streak: 8 },
    { rank: 5, name: 'Shivam Kumar', initials: 'SK', points: 1640, reports: 26, streak: 11 },
    { rank: 6, name: 'Neha Sharma', initials: 'NS', points: 1495, reports: 23, streak: 6 },
  ];

  function leaderRowHTML(l, isYou) {
    const streakStr = l.streak != null ? `${l.streak}-day streak` : `${l.resolved || 0} resolved`;
    return `
      <li class="lb-row">
        <span class="lb-no">#${l.rank == null ? '–' : l.rank}</span>
        <span class="lb-avatar sm">${escapeHtml(l.initials || '?')}</span>
        <div class="lb-name"><b>${escapeHtml(l.name)}</b><small>${l.reports || 0} reports · ${streakStr}</small></div>
        <span class="lb-pts">${(l.points || 0).toLocaleString()}</span>${isYou ? '<span class="lb-you">You</span>' : ''}
      </li>`;
  }

  function renderLeaderboard(leaders, me) {
    const podium = document.getElementById('leadersPodium');
    const list = document.getElementById('leadersList');
    if (!podium || !list) return;
    const safe = (leaders && leaders.length ? leaders : LEADERS_FALLBACK);
    const myRank = (me && me.rank != null) ? me.rank : null;
    const top3 = safe.slice(0, 3);
    const ordered = [top3[1], top3[0], top3[2]].filter(Boolean); // desktop reads 2 · 1 · 3
    podium.innerHTML = ordered.map((l) => `
      <div class="lb-podium-card lb-p${l.rank}">
        <span class="lb-rank">${l.rank === 1 ? '👑 ' : ''}#${l.rank}${l.rank === myRank ? ' <span class="lb-you">You</span>' : ''}</span>
        <span class="lb-avatar">${escapeHtml(l.initials || '?')}</span>
        <div class="lb-id"><b>${escapeHtml(l.name)}</b><span class="lb-sub">${(l.points || 0).toLocaleString()} pts · ${l.reports || 0} reports</span></div>
      </div>`).join('') ||
      '<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🏆</span><b>No leaders yet</b>Be the first to report and top the board!</div>';
    const below = safe.slice(3);
    const shownRanks = new Set(safe.map((l) => l.rank));
    const meHidden = myRank != null && !shownRanks.has(myRank);
    const listHTML = below.map((l) => leaderRowHTML(l, l.rank === myRank)).join('');
    const extra = meHidden ? leaderRowHTML(me, true) : '';
    list.innerHTML = (listHTML + extra) || '<div class="lb-context">No leaders yet.</div>';
  }

  async function loadLeaderboard() {
    let leaders = LEADERS_FALLBACK, me = null;
    try {
      const data = await API.community.leaderboard();
      if (data && data.leaders) { leaders = data.leaders; me = data.me || null; }
    } catch (err) { /* offline — keep fallback */ }
    renderLeaderboard(leaders, me);
  }

  /* ---------- Live sync ---------- */
  Store.onChange(() => { renderStats(); syncPills(); renderReports(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadLeaderboard();
  });

  (async () => {
    await Store.init(); // load reports from the backend first
    renderHeader();
    renderStats();
    syncPills();
    renderReports();
    renderTips();
    await loadLeaderboard();
  })();
})();
