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
  document.getElementById('empBlurb').textContent = `You're ${roster.name} (${roster.specialty}) in ${MY_GROUP ? MY_GROUP.name : 'your group'}. Tasks the AI routes to your group appear here.${I_AM_LEAD ? ' As group lead you approve the AI dispatches, then verify your group’s completed work.' : ''}`;

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
      ? `<span class="status-badge st-resolved">Resolved</span>`
      : r.status === 'VERIFY'
      ? `<span class="status-badge st-verify">Verification</span>`
      : `<span class="status-badge st-progress">In Progress</span>`;

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
        <div class="rc-meta">👤 Reported by ${escapeHtml(r.reporterName)}</div>
        <div class="detail-row"><span class="d-lbl">Severity</span><span class="d-val"><b style="color:${sevColor[r.severity] || '#16a34a'};">${r.severity}</b> · ${timeAgo(r.createdAt)}</span></div>
        ${r.isBooking && r.scheduledAt ? `<div class="detail-row"><span class="d-lbl">Scheduled</span><span class="d-val">🗓️ ${new Date(r.scheduledAt).toLocaleString()}</span></div>` : ''}
        ${r.photo ? `<img src="${r.photo}" alt="Site photo" style="border-radius:12px;height:120px;width:100%;object-fit:cover;" />` : ''}
        <div class="tc-actions">
          ${isVerify
            ? `<span class="rc-tag" style="background:#ede9fe;color:#6d28d9;">Awaiting group-lead verification</span>`
            : `<button class="btn btn-primary btn-small" data-collect="${r.id}">✅ Mark as Collected</button>`}
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
      taskEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">📭</span><b>No tasks assigned yet</b>The AI will suggest a task for your group soon — your group lead approves it and it lands here.</div>`;
    } else if (!active.length && !verify.length) {
      taskEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🎉</span><b>All caught up!</b>No active or pending-verification tasks right now.</div>`;
    } else {
      taskEl.innerHTML = [...active, ...verify].map(taskCard).join('');
    }

    doneEl.innerHTML = done.length
      ? done.map((r, i) => taskCard(r, i)).join('')
      : `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🌱</span><b>Nothing completed yet</b>Cleared pickups will show up here once verified.</div>`;

    document.querySelectorAll('[data-collect]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.collect;
        btn.disabled = true;
        btn.innerHTML = '<span class="rp-spinner"></span> Updating…';
        setTimeout(() => {
          Store.submitCollected(id);
          toast('Collected — sent to your group lead for verification 🔍');
          renderTasks(); renderVerify();
        }, 500);
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
      el.innerHTML = `<div class="empty-state"><span class="e-ico">🤖</span><b>No dispatches waiting on you</b>New reports in your group land here — they're already out with a crew.</div>`;
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
          <div class="qr-title">${iconOf(r)} ${escapeHtml(r.wasteType)}${r.isBooking ? ' · 🗓️ Booking' : ''} · ${escapeHtml(r.location)}</div>
          <div class="qr-meta">
            <span>📨 by ${escapeHtml(r.reporterName)}</span>
            <span>⚡ ${r.severity}</span>
            <span>${timeAgo(r.createdAt)}</span>
          </div>
          <div class="qr-meta" style="margin-top:4px;">
            <span style="font-weight:800;color:var(--green-600);">🤖 AI suggests:</span>
            <span>${sugM ? sugM.icon + ' ' + sugM.name : 'any member'}</span>
            <span style="opacity:.72;">· ${escapeHtml(r.suggestionReason)}</span>
          </div>
        </div>
        <div class="qr-actions">
          <select id="ldm-${r.id}" aria-label="Pick crew member">${memberOpts}</select>
          <button class="btn btn-primary btn-small" data-lead-approve="${r.id}">📤 Approve &amp; Dispatch</button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-lead-approve]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.leadApprove;
        const memberId = document.getElementById('ldm-' + id).value;
        btn.disabled = true;
        btn.innerHTML = '<span class="rp-spinner"></span> Dispatching…';
        setTimeout(() => {
          Store.approveAssign(id, { groupId: roster.groupId, memberId });
          toast('Dispatched to ' + (Store.member(memberId)?.name || 'crew') + ' 🚛');
          renderDispatch(); renderTasks();
        }, 450);
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
      el.innerHTML = `<div class="empty-state"><span class="e-ico">🔍</span><b>Nothing to verify right now</b>When your crew marks a pickup collected, it lands here for you to sign off.</div>`;
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
            <span>👷 collected by ${m ? m.name : 'crew'}</span>
            <span>⚡ ${r.severity}</span>
            <span>${timeAgo(r.createdAt)}</span>
          </div>
          <div class="qr-meta" style="margin-top:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(r.desc)}</div>
        </div>
        <div class="qr-actions">
          <button class="btn btn-primary btn-small" data-lv-pass="${r.id}">✅ Confirm &amp; Resolve</button>
          <button class="btn btn-outline btn-small" data-lv-reject="${r.id}">↩️ Send back</button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-lv-pass]').forEach((btn) =>
      btn.addEventListener('click', () => {
        btn.disabled = true;
        Store.verifyPass(btn.dataset.lvPass, roster.name);
        toast('Verified — marked as Resolved 🎉');
        renderTasks(); renderVerify();
      })
    );
    el.querySelectorAll('[data-lv-reject]').forEach((btn) =>
      btn.addEventListener('click', () => {
        btn.disabled = true;
        Store.verifyReject(btn.dataset.lvReject, roster.name);
        toast('Sent back for rework ↩️');
        renderTasks(); renderVerify();
      })
    );
  }

  Store.onChange(() => { renderDispatch(); renderTasks(); renderVerify(); });
  renderDispatch();
  renderTasks();
  renderVerify();
})();