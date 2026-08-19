/* =====================================================================
 * SwachLens — Employee dashboard
 * Group-assigned task list · Mark collected → verification · (Lead) verify panel
 * ===================================================================== */
(function () {
  const me = Auth.require('EMPLOYEE');
  if (!me) return;

  // Map the logged-in account to a roster entry (e.g. employee@test.com → John Driver).
  const roster = Store.rosterForEmail(me.email);
  const MY_ID = roster.id;
  const MY_GROUP = Store.group(roster.groupId);
  const I_AM_LEAD = Store.isLead(MY_ID);

  /* ---------- Header ---------- */
  document.getElementById('eName').textContent = roster.name;
  document.getElementById('eRole').textContent = `🚛 ${roster.specialty} · ${roster.name}`;
  document.getElementById('greetName').textContent = roster.name.split(' ')[0];
  document.getElementById('eAvatar').textContent = roster.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('empBlurb').textContent = `${roster.name} (${roster.specialty}) · ${MY_GROUP ? MY_GROUP.name : t('emp.yourGroup')}. ${t('emp.blurb')}${I_AM_LEAD ? ' ' + t('emp.blurbLead') : ''}`;

  /* Group leads see their dispatch + verification queues. */
  const leadSection = document.getElementById('leadVerification');
  if (I_AM_LEAD && leadSection) leadSection.style.display = '';
  else if (leadSection) leadSection.style.display = 'none';

  const dispatchSection = document.getElementById('leadDispatch');
  if (I_AM_LEAD && dispatchSection) dispatchSection.style.display = '';
  else if (dispatchSection) dispatchSection.style.display = 'none';

  const iconOf = (r) => (Store.WASTE_TYPES.find((w) => w.key === r.wasteType) || {}).icon || '🗑️';
  const sevColor = { Low: '#16a34a', Medium: '#f59e0b', High: '#ef4444' };
  const badgeFor = (r) =>
    r.status === 'RESOLVED'
      ? `<span class="status-badge st-resolved">${t('st.resolved')}</span>`
      : r.status === 'VERIFY'
      ? `<span class="status-badge st-verify">${t('st.verification')}</span>`
      : `<span class="status-badge st-progress">${t('st.inProgress')}</span>`;

  function taskCard(r, i) {
    const isVerify = r.status === 'VERIFY';
    return `
    <article class="report-card task-card reveal in" style="animation-delay:${Math.min(i * 70, 420)}ms">
      <div class="rc-body">
        <div class="rc-top">
          <h4>${iconOf(r)} ${escapeHtml(r.wasteType)}${r.isBooking ? ' · 🗓️' : ''}</h4>
          ${badgeFor(r)}
        </div>
        <div class="rc-meta">📍 ${escapeHtml(r.location)}</div>
        <div class="rc-meta">🗒️ ${escapeHtml(r.desc)}</div>
        <div class="rc-meta">${t('emp.reportedBy', { name: escapeHtml(r.reporterName) })}</div>
        <div class="detail-row"><span class="d-lbl">${t('app.severityLbl')}</span><span class="d-val"><b style="color:${sevColor[r.severity] || '#16a34a'};">${r.severity}</b> · ${timeAgo(r.createdAt)}</span></div>
        ${r.isBooking && r.scheduledAt ? `<div class="detail-row"><span class="d-lbl">${t('app.scheduled')}</span><span class="d-val">🗓️ ${new Date(r.scheduledAt).toLocaleString()}</span></div>` : ''}
        ${r.photo ? `<img src="${r.photo}" alt="Site photo" style="border-radius:12px;height:120px;width:100%;object-fit:cover;" />` : ''}
        <div class="tc-actions">
          ${isVerify
            ? `<span class="rc-tag" style="background:#ede9fe;color:#6d28d9;">${t('app.verifyTag')}</span>`
            : `<button class="btn btn-primary btn-small" data-collect="${r.id}">${t('app.collect')}</button>`}
          <span class="rc-tag" style="align-self:center;">${r.id}</span>
        </div>
      </div>
    </article>`;
  }

  function renderTasks() {
    const mine = Store.forEmployee(MY_ID);
    const active = mine.filter((r) => r.status === 'IN_PROGRESS');
    const verify = mine.filter((r) => r.status === 'VERIFY');
    const done = mine.filter((r) => r.status === 'RESOLVED');
    const taskEl = document.getElementById('taskGrid');
    const doneEl = document.getElementById('doneGrid');

    if (!mine.length) {
      taskEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">📭</span><b>${t('app.noTasks')}</b>${t('app.noTasksSub')}</div>`;
    } else if (!active.length && !verify.length) {
      taskEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🎉</span><b>${t('app.allCaughtUp')}</b>${t('app.allCaughtUpSub')}</div>`;
    } else {
      taskEl.innerHTML = [...active, ...verify].map(taskCard).join('');
    }

    doneEl.innerHTML = done.length
      ? done.map((r, i) => taskCard(r, i)).join('')
      : `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🌱</span><b>${t('app.nothingDone')}</b>${t('app.nothingDoneSub')}</div>`;

    document.querySelectorAll('[data-collect]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const id = btn.dataset.collect;
        btn.disabled = true;
        btn.innerHTML = '<span class="rp-spinner"></span> ' + t('app.updating');
        try {
          await Store.submitCollected(id);
          toast(t('emp.collectedToast'));
          renderTasks(); renderVerify();
        } catch (err) {
          toast((err && err.message) || 'Update failed — please try again.', true);
          btn.disabled = false;
          btn.innerHTML = t('app.collect');
        }
      })
    );
  }

  /* ---------- AI dispatch approval (only for the lead) ---------- */
  function renderDispatch() {
    const el = document.getElementById('leadDispatchGrid');
    if (!el) return;
    if (!I_AM_LEAD) return;
    const list = Store.pending().filter((r) => r.suggestedGroupId === roster.groupId);
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><span class="e-ico">🤖</span><b>${t('app.noDispatch')}</b>${t('app.noDispatchSub')}</div>`;
      return;
    }
    el.innerHTML = list.map((r, i) => {
      const sugM = Store.member(r.suggestedMemberId);
      const memberOpts = Store.membersOf(roster.groupId).map((e) =>
        `<option value="${e.id}" ${e.id === r.suggestedMemberId ? 'selected' : ''}>${e.icon} ${e.name}</option>`
      ).join('');
      return `
      <div class="queue-row reveal in" style="animation-delay:${Math.min(i * 60, 360)}ms">
        <div class="qr-ico" style="background:#eef3ff;">🤖</div>
        <div class="qr-main">
          <div class="qr-title">${iconOf(r)} ${escapeHtml(r.wasteType)}${r.isBooking ? ' · 🗓️ ' + t('app.bookingShort') : ''} · ${escapeHtml(r.location)}</div>
          <div class="qr-meta">
            <span>${t('emp.by', { name: escapeHtml(r.reporterName) })}</span>
            <span>⚡ ${r.severity}</span>
            <span>${timeAgo(r.createdAt)}</span>
          </div>
          <div class="qr-meta" style="margin-top:4px;">
            <span style="font-weight:800;color:var(--green-600);">🤖 ${t('emp.aiSuggests')}</span>
            <span>${sugM ? sugM.icon + ' ' + sugM.name : t('emp.anyMember')}</span>
            <span style="opacity:.72;">· ${escapeHtml(r.suggestionReason)}</span>
          </div>
        </div>
        <div class="qr-actions">
          <select id="ldm-${r.id}" aria-label="${t('emp.pickMember')}">${memberOpts}</select>
          <button class="btn btn-primary btn-small" data-lead-approve="${r.id}">${t('emp.approveDispatch')}</button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-lead-approve]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const id = btn.dataset.leadApprove;
        const memberId = document.getElementById('ldm-' + id).value;
        btn.disabled = true;
        btn.innerHTML = '<span class="rp-spinner"></span> ' + t('app.dispatching');
        try {
          await Store.approveAssign(id, { groupId: roster.groupId, memberId });
          toast(t('emp.dispatched', { name: Store.member(memberId)?.name || t('emp.crew') }));
          renderDispatch(); renderTasks();
        } catch (err) {
          toast((err && err.message) || 'Dispatch failed — please try again.', true);
          btn.disabled = false;
          btn.innerHTML = t('emp.approveDispatch');
        }
      })
    );
  }

  /* ---------- Group verification (only for the lead) ---------- */
  function renderVerify() {
    const el = document.getElementById('leadVerifyGrid');
    if (!el) return;
    if (!I_AM_LEAD) return;
    const list = Store.verification().filter((r) => r.assignedGroupId === roster.groupId);
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><span class="e-ico">🔍</span><b>${t('app.nothingVerify')}</b>${t('app.nothingVerifySub')}</div>`;
      return;
    }
    el.innerHTML = list.map((r, i) => {
      const m = Store.member(r.assignedTo);
      return `
      <div class="queue-row reveal in" style="animation-delay:${Math.min(i * 60, 360)}ms">
        <div class="qr-ico" style="background:#ede9fe;">🔍</div>
        <div class="qr-main">
          <div class="qr-title">${iconOf(r)} ${escapeHtml(r.wasteType)}${r.isBooking ? ' · 🗓️ Booking' : ''} · ${escapeHtml(r.location)}</div>
          <div class="qr-meta">
            <span>${t('emp.collectedBy', { name: m ? m.name : t('emp.crew') })}</span>
            <span>⚡ ${r.severity}</span>
            <span>${timeAgo(r.createdAt)}</span>
          </div>
          <div class="qr-meta" style="margin-top:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(r.desc)}</div>
        </div>
        <div class="qr-actions">
          <button class="btn btn-primary btn-small" data-lv-pass="${r.id}">${t('emp.confirmResolve')}</button>
          <button class="btn btn-outline btn-small" data-lv-reject="${r.id}">${t('emp.sendBack')}</button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-lv-pass]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await Store.verifyPass(btn.dataset.lvPass, roster.name);
          toast(t('emp.verifiedToast'));
          renderTasks(); renderVerify();
        } catch (err) {
          toast((err && err.message) || 'Verification failed — please try again.', true);
          btn.disabled = false;
        }
      })
    );
    el.querySelectorAll('[data-lv-reject]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await Store.verifyReject(btn.dataset.lvReject, roster.name);
          toast(t('emp.sentBackToast'));
          renderTasks(); renderVerify();
        } catch (err) {
          toast((err && err.message) || 'Could not send back — please try again.', true);
          btn.disabled = false;
        }
      })
    );
  }

  Store.onChange(() => { renderDispatch(); renderTasks(); renderVerify(); });

  (async () => {
    await Store.init(); // load reports from the backend first
    renderDispatch();
    renderTasks();
    renderVerify();
  })();
})();