/* =====================================================================
 * SwachLens — centralized mock state (localStorage-backed)
 * ---------------------------------------------------------------------
 * Every dashboard reads/writes this one store, so a report submitted in
 * the User view flows through AI dispatch, crew collection, group-lead
 * verification and back to the User's "My Reports".
 *
 * Flow:
 *   PENDING   (citizen reports OR books) → AI suggests a group + member
 *   ADMIN approves the suggestion → IN_PROGRESS (assigned to a crew member)
 *   CREW marks collected → VERIFICATION (awaiting the group lead)
 *   LEAD verifies → RESOLVED  (or sends back → IN_PROGRESS)
 *
 * All mutations re-emit through a tiny pub/sub + the browser `storage`
 * event, so open tabs stay live.
 * ===================================================================== */
(function () {
  const REPORTS_KEY = 'swachlens.reports.v2';
  const EMPLOYEES_KEY = 'swachlens.employees.v2';

  const STATUS = { PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', VERIFY: 'VERIFY', RESOLVED: 'RESOLVED' };
  const STATUS_LABEL = { PENDING: 'Pending', IN_PROGRESS: 'In Progress', VERIFY: 'Verification', RESOLVED: 'Resolved' };

  const WASTE_TYPES = [
    { key: 'Plastic', icon: '🧴', desc: 'Bottles, bags & packaging' },
    { key: 'Organic', icon: '🥗', desc: 'Food scraps & garden waste' },
    { key: 'E-Waste', icon: '🔌', desc: 'Electronics & batteries' },
    { key: 'Hazardous', icon: '☣️', desc: 'Chemicals, paint & medical waste' },
  ];

  /* ------------- Area groups (each has a lead = the group's admin) ------------- */
  const GROUPS = [
    { id: 'grp_north', name: 'North Zone',  zone: 'north', icon: '🏞️', leadId: 'emp_sarah' },
    { id: 'grp_east',  name: 'East Zone',   zone: 'east',  icon: '🏙️', leadId: 'emp_john' },
    { id: 'grp_west',  name: 'West Zone',   zone: 'west',  icon: '🌉', leadId: 'emp_ahmed' },
  ];

  /* Pre-filled crew roster — every member belongs to an area group. */
  const ROSTER = [
    { id: 'emp_john',  name: 'John Driver',  specialty: 'Driver',     icon: '🚛', color: '#16a34a', groupId: 'grp_east' },
    { id: 'emp_sarah', name: 'Sarah Collector', specialty: 'Collector', icon: '🧺', color: '#8b5cf6', groupId: 'grp_north' },
    { id: 'emp_ravi',  name: 'Ravi Kumar',   specialty: 'E-waste',    icon: '🔌', color: '#f59e0b', groupId: 'grp_north' },
    { id: 'emp_mei',   name: 'Mei Chen',     specialty: 'Hazmat',     icon: '☣️', color: '#ef4444', groupId: 'grp_east' },
    { id: 'emp_ahmed', name: 'Ahmed Ali',    specialty: 'Compost',    icon: '🌱', color: '#0ea5e9', groupId: 'grp_west' },
  ];

  /* Map employee accounts (email → roster id). */
  const EMPLOYEE_ACCOUNTS = {
    'employee@test.com': 'emp_john',
    'john.driver@test.com': 'emp_john',
    'sarah.collector@test.com': 'emp_sarah',
    'ravi.kumar@test.com': 'emp_ravi',
    'mei.chen@test.com': 'emp_mei',
    'ahmed.ali@test.com': 'emp_ahmed',
  };

  // Waste type → the crew specialty best suited to handle it.
  const SPECIALTY_FOR = { 'E-Waste': 'E-waste', Hazardous: 'Hazmat', Organic: 'Compost', Compost: 'Compost' };

  let listeners = [];

  const Store = {
    STATUS,
    STATUS_LABEL,
    WASTE_TYPES,
    GROUPS,
    ROSTER,
    EMPLOYEE_ACCOUNTS,

    /* ---------- low-level persistence ---------- */
    load() { try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]'); } catch { return []; } },
    save(list) {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
      listeners.forEach((fn) => fn(list));
    },
    onChange(fn) { listeners.push(fn); },

    /* Map a logged-in employee's email to a roster entry. */
    rosterForEmail(email) {
      const id = (email || '').toLowerCase();
      const rid = EMPLOYEE_ACCOUNTS[id] || ROSTER[0].id;
      return ROSTER.find((r) => r.id === rid) || ROSTER[0];
    },

    /* ---------- group / roster helpers ---------- */
    group(id) { return GROUPS.find((g) => g.id === id); },
    member(id) { return ROSTER.find((r) => r.id === id); },
    membersOf(groupId) { return ROSTER.filter((r) => r.groupId === groupId); },
    leadOf(groupId) { const g = this.group(groupId); return g ? this.member(g.leadId) : null; },
    isLead(empId) { return GROUPS.some((g) => g.leadId === empId); },

    /* ---------- helpers ---------- */
    get(id) { return this.load().find((r) => r.id === id); },
    byUser(email) { const e = (email || '').toLowerCase(); return this.load().filter((r) => r.reporter && r.reporter.toLowerCase() === e); },
    pending() { return this.load().filter((r) => r.status === STATUS.PENDING); },
    inProgress() { return this.load().filter((r) => r.status === STATUS.IN_PROGRESS); },
    verification() { return this.load().filter((r) => r.status === STATUS.VERIFY); },
    resolved() { return this.load().filter((r) => r.status === STATUS.RESOLVED); },
    forEmployee(empId) { return this.load().filter((r) => r.assignedTo === empId); },

    /* ------------- "AI" dispatch matcher -------------
     * Purely deterministic client-side logic to demo the AI step:
     * pick the area group + crew member best suited to a report. */
    suggest(report) {
      const loc = (report.location || '').toLowerCase();

      // 1) Area group hinted by the location's zone keyword.
      const zoneHint = GROUPS.map((g) => g.zone).find((z) => loc.includes(z));
      const byZone = zoneHint && GROUPS.find((g) => g.zone === zoneHint);

      // 2) Otherwise match an urgent/specialist waste type to the right specialty/member.
      const need = SPECIALTY_FOR[report.wasteType];
      const specGroup = need && GROUPS.find((g) => ROSTER.some((e) => e.groupId === g.id && e.specialty === need));

      // 3) Otherwise pick the least busy group (fewest active + verification tasks).
      let group = byZone || specGroup;
      if (!group) {
        group = GROUPS.slice()
          .sort((a, b) => this._groupLoad(a.id) - this._groupLoad(b.id))[0] || GROUPS[0];
      }

      // Crew member: prefer the matching specialty within the group, else the lead, else anyone.
      let member =
        (need && this.membersOf(group.id).find((e) => e.specialty === need)) ||
        this.leadOf(group.id) ||
        this.membersOf(group.id)[0] ||
        ROSTER[0];

      const reasons = [];
      if (group.zone) reasons.push(`📍 ${group.name} covers that area`);
      if (need) reasons.push(`🔧 best match for ${report.wasteType} waste`);
      if (!reasons.length) reasons.push(`⚖️ least-loaded zone`);

      return { group, member, reason: reasons.join(' · ') };
    },
    _groupLoad(groupId) {
      return this.load().filter((r) => r.assignedGroupId === groupId && r.status !== STATUS.RESOLVED).length;
    },

    /* ---------- mutations ---------- */
    create({ wasteType, location, desc, severity = 'Medium', photo = '', reporter, reporterName, isBooking = false, scheduledAt = null }) {
      const list = this.load();
      const id = 'WM-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      const stripped = { id, wasteType, location, desc, severity, photo, reporter, reporterName: reporterName || 'Citizen', isBooking, scheduledAt };

      // AI immediately suggests a group + member (admin still approves it).
      const s = this.suggest(stripped);
      const r = {
        ...stripped,
        status: STATUS.PENDING,
        assignedGroupId: null,
        assignedTo: null,
        suggestedGroupId: s.group.id,
        suggestedMemberId: s.member.id,
        suggestionReason: s.reason,
        verifiedBy: null,
        createdAt: Date.now(),
        resolvedAt: null,
        history: [{ at: Date.now(), to: STATUS.PENDING, by: reporterName || 'Citizen' }],
      };
      list.unshift(r);
      this.save(list);
      return r;
    },

    /* Admin approves the AI suggestion (or an override) → dispatch to a group + member. */
    approveAssign(id, { groupId, memberId } = {}) {
      const list = this.load();
      const r = list.find((x) => x.id === id);
      if (!r) return null;
      const g = this.group(groupId || r.suggestedGroupId);
      const m = this.member(memberId || r.suggestedMemberId);
      r.status = STATUS.IN_PROGRESS;
      r.assignedGroupId = g ? g.id : r.suggestedGroupId;
      r.assignedTo = m ? m.id : r.suggestedMemberId;
      r.history.push({ at: Date.now(), to: STATUS.IN_PROGRESS, by: 'Dispatch' });
      this.save(list);
      return r;
    },

    /* Crew member marks it collected → moves to group-lead verification (not resolved yet). */
    submitCollected(id) {
      const list = this.load();
      const r = list.find((x) => x.id === id);
      if (!r) return null;
      const m = this.member(r.assignedTo);
      r.status = STATUS.VERIFY;
      r.history.push({ at: Date.now(), to: STATUS.VERIFY, by: m ? m.name : 'Crew' });
      this.save(list);
      return r;
    },

    /* Group lead accepts the work → resolved. */
    verifyPass(id, byName) {
      const list = this.load();
      const r = list.find((x) => x.id === id);
      if (!r) return null;
      r.status = STATUS.RESOLVED;
      r.resolvedAt = Date.now();
      r.verifiedBy = byName || 'Group lead';
      r.history.push({ at: Date.now(), to: STATUS.RESOLVED, by: '✓ ' + (byName || 'Group lead') });
      this.save(list);
      return r;
    },

    /* Group lead rejects → back to the crew for rework. */
    verifyReject(id, byName) {
      const list = this.load();
      const r = list.find((x) => x.id === id);
      if (!r) return null;
      r.status = STATUS.IN_PROGRESS;
      r.history.push({ at: Date.now(), to: STATUS.IN_PROGRESS, by: '↩️ ' + (byName || 'Group lead') + ' — rework' });
      this.save(list);
      return r;
    },

    remove(id) {
      this.save(this.load().filter((r) => r.id !== id));
    },

    /* ---------- derived stats ---------- */
    statsForUser(email) {
      const mine = this.byUser(email);
      const resolved = mine.filter((r) => r.status === STATUS.RESOLVED).length;
      const active = mine.filter((r) => r.status !== STATUS.RESOLVED).length;
      const onTime = mine.length ? Math.round((resolved / mine.length) * 100) : 100;
      return { resolved, active, onTime, total: mine.length };
    },

    statsGlobal() {
      const all = this.load();
      const resolved = all.filter((r) => r.status === STATUS.RESOLVED).length;
      const active = all.filter((r) => r.status !== STATUS.RESOLVED).length;
      const onTime = all.length ? Math.round((resolved / all.length) * 100) : 100;
      return { pending: this.pending().length, inProgress: this.inProgress().length, verification: this.verification().length, resolved, active, onTime, total: all.length };
    },

    /* Shared status-step bar, used by the citizen detail view. */
    statusFlow() { return [STATUS.PENDING, STATUS.IN_PROGRESS, STATUS.VERIFY, STATUS.RESOLVED]; },
  };

  window.Store = Store;

  /* Live-sync: when another tab/page writes to the store, notify listeners. */
  window.addEventListener('storage', (e) => {
    if (e.key === REPORTS_KEY) {
      try { listeners.forEach((fn) => fn(JSON.parse(e.newValue || '[]'))); } catch { /* ignore */ }
    }
  });
})();