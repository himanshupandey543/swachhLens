/* =====================================================================
 * SwachLens — Admin dashboard
 * AI dispatch (approve/override suggestions) · Verification queue (confirm/resolve)
 * ===================================================================== */
(function () {
  const me = Auth.require('ADMIN');
  if (!me) return;

  /* ---------- Header ---------- */
  document.getElementById('aName').textContent = me.name || 'Admin';
  document.getElementById('aAvatar').textContent = (me.name || 'A').trim()[0].toUpperCase();

  function renderStats() {
    const s = Store.statsGlobal();
    countUp(document.getElementById('statPending'), s.pending);
    countUp(document.getElementById('statProgress'), s.inProgress);
    countUp(document.getElementById('statVerify'), s.verification);
  }

  const iconOf = (r) => (Store.WASTE_TYPES.find((w) => w.key === r.wasteType) || {}).icon || '🗑️';
  const memberOf = (id) => Store.member(id);

  function memberOpts(groupId, selectedId) {
    return Store.membersOf(groupId).map((e) =>
      `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${e.icon} ${e.name}${Store.isLead(e.id) ? ' · (lead)' : ''}</option>`
    ).join('');
  }

  /* Keep the crew-member dropdown in sync when the group changes. */
  function syncMembers(r) {
    const mem = document.getElementById('mem-' + r.id);
    if (!mem) return;
    const gid = document.getElementById('grp-' + r.id).value;
    const current = mem.value;
    const inGroup = Store.membersOf(gid).some((e) => e.id === current);
    mem.innerHTML = memberOpts(gid, null);
    if (!inGroup) mem.value = Store.leadOf(gid)?.id || Store.membersOf(gid)[0]?.id || '';
  }

  /* ---------- AI suggestions queue ---------- */
  function renderQueue() {
    const pending = Store.pending();
    const el = document.getElementById('queueList');
    if (!pending.length) {
      el.innerHTML = `<div class="empty-state"><span class="e-ico">🎉</span><b>No suggestions to approve</b>Citizens haven't filed anything new — the AI queue is clear.</div>`;
      return;
    }
    el.innerHTML = pending.map((r, i) => {
      const sugM = memberOf(r.suggestedMemberId);
      const g = Store.group(r.suggestedGroupId);
      const grpOpts = Store.GROUPS.map((x) => `<option value="${x.id}" ${x.id === r.suggestedGroupId ? 'selected' : ''}>${x.icon} ${x.name}</option>`).join('');
      return `
      <div class="queue-row reveal in" id="qr-${r.id}" style="animation-delay:${Math.min(i * 60, 360)}ms">
        <div class="qr-ico" style="background:var(--green-50);">${iconOf(r)}</div>
        <div class="qr-main">
          <div class="qr-title">${escapeHtml(r.wasteType)}${r.isBooking ? ' · 🗓️ Booking' : ''} · ${escapeHtml(r.location)}</div>
          <div class="qr-meta">
            <span>📨 by ${escapeHtml(r.reporterName)}</span>
            <span>⚡ ${r.severity}</span>
            <span>${timeAgo(r.createdAt)}</span>
            ${r.isBooking && r.scheduledAt ? `<span>🗓️ for ${new Date(r.scheduledAt).toLocaleDateString()}</span>` : ''}
            ${r.photo ? '<span>📷 photo</span>' : ''}
          </div>
          <div class="qr-meta" style="margin-top:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(r.desc)}</div>
          <div class="qr-meta" style="margin-top:4px;">
            <span style="font-weight:800;color:var(--green-600);">🤖 AI suggests:</span>
            <span>${g ? g.icon + ' ' + g.name : '—'} → ${sugM ? sugM.icon + ' ' + sugM.name : '—'}</span>
            <span style="opacity:.72;">· ${escapeHtml(r.suggestionReason)}</span>
          </div>
        </div>
        <div class="qr-actions">
          <select id="grp-${r.id}" aria-label="Pick group">${grpOpts}</select>
          <select id="mem-${r.id}" aria-label="Pick member">${memberOpts(r.suggestedGroupId, r.suggestedMemberId)}</select>
          <button class="btn btn-primary btn-small assign-btn" data-approve="${r.id}">📤 Approve &amp; Dispatch</button>
        </div>
      </div>`;
    }).join('');

    pending.forEach((r) => {
      const g = document.getElementById('grp-' + r.id);
      if (g) g.addEventListener('change', () => syncMembers(r));
    });

    el.querySelectorAll('[data-approve]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.approve;
        const groupId = document.getElementById('grp-' + id).value;
        const memberId = document.getElementById('mem-' + id).value;
        btn.disabled = true;
        btn.innerHTML = '<span class="rp-spinner"></span> Dispatching…';
        btn.classList.add('loading');
        setTimeout(() => {
          Store.approveAssign(id, { groupId, memberId });
          toast(`Assigned ${rType(id)} to ${memberOf(memberId)?.name || 'crew'}`);
          renderStats(); renderQueue(); renderProgress();
        }, 450);
      })
    );
  }

  function rType(id) { const r = Store.get(id); return r ? r.wasteType + ' · ' + r.location : 'task'; }

  /* ---------- In-progress tasks ---------- */
  function renderProgress() {
    const list = Store.inProgress();
    const el = document.getElementById('progressGrid');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="e-ico">🚛</span><b>No crews out right now</b>Approve an AI suggestion above to send a group out.</div>`;
      return;
    }
    el.innerHTML = list.map((r, i) => {
      const g = Store.group(r.assignedGroupId);
      const m = memberOf(r.assignedTo);
      return `
      <article class="report-card reveal in" style="animation-delay:${Math.min(i * 60, 360)}ms">
        <div class="rc-body">
          <div class="rc-top">
            <h4>${iconOf(r)} ${escapeHtml(r.wasteType)}</h4>
            <span class="status-badge st-progress">In Progress</span>
          </div>
          <div class="rc-meta">📍 ${escapeHtml(r.location)}</div>
          <div class="rc-meta">⚡ ${r.severity} · ${timeAgo(r.createdAt)}</div>
          <div class="rc-meta" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">🗒️ ${escapeHtml(r.desc)}</div>
          <div class="rc-progress"><i style="width:60%;background:#3b82f6;"></i></div>
          <div class="rc-foot">
            <span class="rc-tag">${g ? g.icon + ' ' + g.name : '—'}</span>
            <span class="rc-tag">${m ? m.icon + ' ' + m.name : 'Unassigned'}</span>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  /* ---------- Verification queue ---------- */
  function renderVerify() {
    const list = Store.verification();
    const el = document.getElementById('verifyList');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state"><span class="e-ico">🔍</span><b>Nothing to verify</b>Tasks a crew marks collected will land here for the group lead to check.</div>`;
      return;
    }
    el.innerHTML = list.map((r, i) => {
      const g = Store.group(r.assignedGroupId);
      const m = memberOf(r.assignedTo);
      const lead = g ? Store.leadOf(g.id) : null;
      return `
      <div class="queue-row reveal in" style="animation-delay:${Math.min(i * 60, 360)}ms">
        <div class="qr-ico" style="background:#ede9fe;">🔍</div>
        <div class="qr-main">
          <div class="qr-title">${iconOf(r)} ${escapeHtml(r.wasteType)}${r.isBooking ? ' · 🗓️ Booking' : ''} · ${escapeHtml(r.location)}</div>
          <div class="qr-meta">
            <span>👷 collected by ${m ? m.name : 'crew'}</span>
            <span>📍 ${g ? g.name : '—'}</span>
            <span>🏅 lead to verify: ${lead ? lead.name : '—'}</span>
            <span>${timeAgo(r.createdAt)}</span>
          </div>
          <div class="qr-meta" style="margin-top:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(r.desc)}</div>
        </div>
        <div class="qr-actions">
          <button class="btn btn-primary btn-small" data-verify-pass="${r.id}">✅ Confirm &amp; Resolve</button>
          <button class="btn btn-outline btn-small" data-verify-reject="${r.id}">↩️ Send back</button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-verify-pass]').forEach((btn) =>
      btn.addEventListener('click', () => {
        btn.disabled = true;
        Store.verifyPass(btn.dataset.verifyPass, me.name || 'Admin');
        toast('Work verified — marked as Resolved 🎉');
        renderStats(); renderVerify(); renderProgress();
      })
    );
    el.querySelectorAll('[data-verify-reject]').forEach((btn) =>
      btn.addEventListener('click', () => {
        btn.disabled = true;
        Store.verifyReject(btn.dataset.verifyReject, me.name || 'Admin');
        toast('Sent back to the crew for rework ↩️');
        renderStats(); renderVerify(); renderProgress();
      })
    );
  }

  Store.onChange(() => { renderStats(); renderQueue(); renderProgress(); renderVerify(); });

  renderStats();
  renderQueue();
  renderProgress();
  renderVerify();
})();