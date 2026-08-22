/* =====================================================================
 * SwachLens — centralized state (FastAPI + SQLite backed)
 * ---------------------------------------------------------------------
 * The backend is now the single source of truth. The Store keeps an
 * in-memory mirror of the reports list so the dashboards keep their
 * synchronous read helpers (byUser, pending, stats, ...). Mutations call
 * the REST API and update the cache from the server's response, then
 * re-emit through a tiny pub/sub so open tabs stay live (a light poller
 * replaces the old localStorage `storage` event).
 *
 * Flow (unchanged):
 *   PENDING → AI suggests group + member → lead approves → IN_PROGRESS
 *   → crew collects → VERIFY → lead verifies → RESOLVED (or rework)
 * ===================================================================== */
(function () {
  const STATUS = { PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', VERIFY: 'VERIFY', RESOLVED: 'RESOLVED', CANCELLED: 'CANCELLED' };
  const STATUS_LABEL = { PENDING: 'Pending', IN_PROGRESS: 'In Progress', VERIFY: 'Verification', RESOLVED: 'Resolved', CANCELLED: 'Cancelled' };

  const WASTE_TYPES = [
    { key: 'Plastic', icon: '🧴', desc: 'Bottles, bags & packaging' },
    { key: 'Organic', icon: '🥗', desc: 'Food scraps & garden waste' },
    { key: 'E-Waste', icon: '🔌', desc: 'Electronics & batteries' },
    { key: 'Hazardous', icon: '☣️', desc: 'Chemicals, paint & medical waste' },
  ];

  /* ------------- Area groups (each has a lead = the group's lead employee) ------------- */
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
  let _reports = [];   // in-memory mirror of the server's report list
  let _pollTimer = null;

  const Store = {
    STATUS,
    STATUS_LABEL,
    WASTE_TYPES,
    GROUPS,
    ROSTER,
    EMPLOYEE_ACCOUNTS,

    /* ---------- boot / live sync ---------- */
    async init() {
      try {
        await this.refresh();
      } catch (err) {
        if (window.toast) toast((err && err.message) || 'Could not load reports from the server.', true);
      }
      this._startPolling();
      return _reports;
    },

    async refresh() {
      const { reports } = await API.reports.list();
      if (JSON.stringify(reports) !== JSON.stringify(_reports)) {
        _reports = reports;
        this._notify();
      }
      return _reports;
    },

    _startPolling() {
      if (_pollTimer) return;
      const poll = () => this.refresh().catch(() => {});
      _pollTimer = setInterval(poll, 15000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') poll();
      });
    },

    /* ---------- low-level cache access ---------- */
    load() { return _reports; },
    onChange(fn) { listeners.push(fn); },
    _notify() { const list = _reports.slice(); listeners.forEach((fn) => fn(list)); },
    _replace(id, updated) { _reports = _reports.map((r) => (r.id === id ? updated : r)); },

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

    /* ---------- read helpers (synchronous, from the cache) ---------- */
    get(id) { return _reports.find((r) => r.id === id) || null; },
    byUser(email) { const e = (email || '').toLowerCase(); return _reports.filter((r) => r.reporter && r.reporter.toLowerCase() === e); },
    pending() { return _reports.filter((r) => r.status === STATUS.PENDING); },
    inProgress() { return _reports.filter((r) => r.status === STATUS.IN_PROGRESS); },
    verification() { return _reports.filter((r) => r.status === STATUS.VERIFY); },
    resolved() { return _reports.filter((r) => r.status === STATUS.RESOLVED); },
    forEmployee(empId) { return _reports.filter((r) => r.assignedTo === empId); },

    /* ------------- "AI" dispatch matcher (mirrors the backend) -------------
     * Kept client-side for reference; the server is authoritative and runs
     * the same logic when a report is created. */
    suggest(report) {
      const loc = (report.location || '').toLowerCase();
      const zoneHint = GROUPS.map((g) => g.zone).find((z) => loc.includes(z));
      const byZone = zoneHint && GROUPS.find((g) => g.zone === zoneHint);
      const need = SPECIALTY_FOR[report.wasteType];
      const specGroup = need && GROUPS.find((g) => ROSTER.some((e) => e.groupId === g.id && e.specialty === need));
      let group = byZone || specGroup;
      if (!group) {
        group = GROUPS.slice()
          .sort((a, b) => this._groupLoad(a.id) - this._groupLoad(b.id))[0] || GROUPS[0];
      }
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
      return _reports.filter((r) => r.assignedGroupId === groupId && r.status !== STATUS.RESOLVED).length;
    },

    /* ---------- mutations (server-authoritative) ---------- */
    async create({ wasteType, location, desc, severity = 'Medium', photo = '', isBooking = false, scheduledAt = null } = {}) {
      const { report } = await API.reports.create({ wasteType, location, desc, severity, photo, isBooking, scheduledAt });
      _reports = [report, ..._reports];
      this._notify();
      return report;
    },

    /* Group lead approves the AI suggestion (or an override) → dispatch to a group + member. */
    async approveAssign(id, { groupId, memberId } = {}) {
      const { report } = await API.reports.assign(id, { groupId, memberId });
      this._replace(id, report);
      this._notify();
      return report;
    },

    /* Crew member marks it collected → moves to group-lead verification (not resolved yet). */
    async submitCollected(id) {
      const { report } = await API.reports.collect(id);
      this._replace(id, report);
      this._notify();
      return report;
    },

    /* Group lead accepts the work → resolved. */
    async verifyPass(id, byName) {
      const { report } = await API.reports.verify(id, 'pass');
      this._replace(id, report);
      this._notify();
      return report;
    },

    /* Group lead rejects → back to the crew for rework. */
    async verifyReject(id, byName) {
      const { report } = await API.reports.verify(id, 'reject');
      this._replace(id, report);
      this._notify();
      return report;
    },

    /* Citizen soft-cancels their report (backend only allows pending/in-progress). */
    async cancel(id) {
      const { report } = await API.reports.cancel(id);
      this._replace(id, report);
      this._notify();
      return report;
    },

    /* Citizen permanently deletes their report. */
    async remove(id) {
      await API.reports.remove(id);
      _reports = _reports.filter((r) => r.id !== id);
      this._notify();
    },

    /* ---------- derived stats ---------- */
    statsForUser(email) {
      const mine = this.byUser(email);
      const resolved = mine.filter((r) => r.status === STATUS.RESOLVED).length;
      const active = mine.filter((r) => r.status !== STATUS.RESOLVED && r.status !== STATUS.CANCELLED).length;
      const countable = mine.filter((r) => r.status !== STATUS.CANCELLED);
      const onTime = countable.length ? Math.round((resolved / countable.length) * 100) : 100;
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
})();
