// End-to-end test: loads the REAL frontend modules (js/config.js, js/api.js,
// js/auth.js, js/state.js) in Node with a minimal DOM/localStorage shim and
// drives them against the running FastAPI backend. Exercises login → init →
// create → approve → collect → verify through the actual Store/Auth code.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // waste-management-vanilla
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- minimal shims ---------- */
function makeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    _m: m,
  };
}

global.localStorage = makeLocalStorage();
global.window = global; // modules attach via window.X
global.document = {
  addEventListener() {},
  visibilityState: 'visible',
  getElementById: () => null,
  querySelectorAll: () => [],
};
global.toast = (msg, isErr) => console.log('   [toast]', (isErr ? '⚠️ ' : '✅ ') + msg);
global.nav = () => { throw new Error('nav() should not be called in this test'); };

/* eval each module in order */
eval(read('js/config.js'));
eval(read('js/api.js'));
eval(read('js/auth.js'));
eval(read('js/state.js'));

async function main() {
  const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT FAILED: ' + msg); console.log('   ✓', msg); };

  // 1. login as citizen (via Auth → API → JWT)
  let session = await Auth.login('user@test.com', '123456', 'USER');
  assert(session.role === 'USER' && session.authToken, 'citizen login returns JWT session');

  // 2. load reports + stats through the Store
  await Store.init();
  const before = Store.statsForUser('user@test.com').total;

  // 3. create a report routed to East zone (lead emp_john)
  const created = await Store.create({
    wasteType: 'Hazardous', location: 'East gate market', desc: 'spilled chemicals', severity: 'High',
  });
  assert(created.id && created.status === 'PENDING', 'Store.create returns server report (PENDING)');
  assert(created.suggestedGroupId === 'grp_east', 'AI suggestion routed to East zone');
  const rid = created.id;

  const after = Store.statsForUser('user@test.com');
  assert(after.total === before + 1, 'statsForUser counts the new report');

  // citizen sees own report via Store.get
  assert(Store.get(rid).id === rid, 'Store.get finds the report');

  // 4. login as employee (lead of East) and approve dispatch
  await Auth.logout();
  session = await Auth.login('employee@test.com', '123456', 'EMPLOYEE');
  assert(session.role === 'EMPLOYEE', 'employee login works');
  const roster = Store.rosterForEmail('employee@test.com');
  assert(roster.id === 'emp_john', 'rosterForEmail maps to John Driver');

  await Store.init();
  const inPending = Store.pending().filter((r) => r.suggestedGroupId === roster.groupId);
  assert(inPending.some((r) => r.id === rid), 'lead dispatch queue contains the new report');

  const assigned = await Store.approveAssign(rid, { groupId: roster.groupId, memberId: created.suggestedMemberId });
  assert(assigned.status === 'IN_PROGRESS' && assigned.assignedTo === created.suggestedMemberId, 'approveAssign → IN_PROGRESS');

  // 5. login as the assigned crew member and collect
  const memberEmail = {
    emp_john: 'john.driver@test.com', emp_sarah: 'sarah.collector@test.com',
    emp_ravi: 'ravi.kumar@test.com', emp_mei: 'mei.chen@test.com', emp_ahmed: 'ahmed.ali@test.com',
  }[assigned.assignedTo];
  await Auth.logout();
  await Auth.login(memberEmail, '123456', 'EMPLOYEE');
  await Store.init();
  const collected = await Store.submitCollected(rid);
  assert(collected.status === 'VERIFY', 'submitCollected → VERIFY');

  // 6. back as the lead → verify → RESOLVED
  await Auth.logout();
  await Auth.login('employee@test.com', '123456', 'EMPLOYEE');
  await Store.init();
  const done = await Store.verifyPass(rid, roster.name);
  assert(done.status === 'RESOLVED' && done.verifiedBy === 'John Driver', 'verifyPass → RESOLVED');

  // 7. session persistence + role guard
  assert(Auth.session() && Auth.session().role === 'EMPLOYEE', 'session persisted');
  assert(Auth.require('EMPLOYEE') !== null, 'Auth.require passes for matching role');

  console.log('\nALL FRONTEND MODULE TESTS PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('\nTEST FAILED:', e.message); console.error(e.stack); process.exit(1); });
