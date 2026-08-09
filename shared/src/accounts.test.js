/* Identity, tenancy and device binding.
 *
 * These are the rules that decide what a signed-in person can see at all, so
 * they are asserted rather than assumed — a role that quietly gains a surface
 * is a data-protection incident, not a UI bug.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES, ACCOUNTS, DEVICES, authenticate, accountByUsername, deviceBySerial,
  normaliseSerial, canAccess, scopeOf, surfacesFor, publicAccount,
} from './accounts.js';

test('every account carries a role that exists', () => {
  const ids = new Set(ROLES.map((r) => r.id));
  for (const a of ACCOUNTS) assert.ok(ids.has(a.role), `${a.username} has role ${a.role}`);
});

test('correct credentials return an account with no secret on it', () => {
  const r = authenticate({ username: 'admin', secret: 'admin' });
  assert.equal(r.ok, true);
  assert.equal(r.account.role, 'admin');
  assert.equal('secret' in r.account, false, 'the secret must not leave the auth call');
});

test('usernames are matched case- and whitespace-insensitively', () => {
  assert.equal(authenticate({ username: '  Admin ', secret: 'admin' }).ok, true);
});

test('a wrong passcode fails without disclosing whether the user exists', () => {
  const bad = authenticate({ username: 'admin', secret: 'nope' });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'bad-secret');
});

test('signing in under the wrong role is refused and says which role it is', () => {
  const r = authenticate({ username: 'admin', secret: 'admin', role: 'driver' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'wrong-role');
  assert.equal(r.actualRole, 'admin');
});

test('an unknown username fails', () => {
  assert.equal(authenticate({ username: 'nobody', secret: 'x' }).reason, 'unknown-user');
});

test('publicAccount always strips the secret', () => {
  const a = publicAccount(accountByUsername('ramesh'));
  assert.equal('secret' in a, false);
  assert.equal(a.driverId, 'drv-1');
});

/* ---------------------------------------------------------- device bind -- */

test('device serials resolve regardless of how the fitter typed them', () => {
  const expected = DEVICES[0];
  for (const typed of ['DS-TAB-8841', 'ds tab 8841', 'dstab8841', ' DS-TAB-8841 ']) {
    assert.equal(deviceBySerial(typed).busId, expected.busId, `"${typed}" should resolve`);
  }
  assert.equal(deviceBySerial('DS-TAB-0000'), null);
  assert.equal(normaliseSerial('ds-tab-8841'), 'DSTAB8841');
});

test('every device binds to exactly one bus, and no bus has two units', () => {
  const buses = DEVICES.map((d) => d.busId);
  assert.equal(new Set(buses).size, buses.length, 'a bus with two tablets would double-report');
  const serials = DEVICES.map((d) => normaliseSerial(d.serial));
  assert.equal(new Set(serials).size, serials.length);
});

/* -------------------------------------------------------------- scope ---- */

test('a driver can reach the drive screen and nothing else', () => {
  assert.equal(canAccess('driver', 'drive'), true);
  for (const s of ['fleet', 'admin', 'editor', 'gov']) {
    assert.equal(canAccess('driver', s), false, `driver must not reach ${s}`);
  }
});

test('a fleet owner sees only the fleet surface', () => {
  assert.deepEqual(surfacesFor('operator').map((s) => s.id), ['fleet']);
});

test('a government official is confined to the road-authority surface', () => {
  assert.deepEqual(surfacesFor('gov').map((s) => s.id), ['gov']);
  assert.equal(canAccess('gov', 'fleet'), false);
});

test('admin reaches every surface', () => {
  for (const s of ['fleet', 'admin', 'editor', 'gov', 'drive']) {
    assert.equal(canAccess('admin', s), true);
  }
});

test('tenancy: an operator is pinned to its own operatorId, admin is not', () => {
  const op = scopeOf(publicAccount(accountByUsername('sarthi')));
  assert.equal(op.operatorId, 'op-1');
  assert.equal(op.all, false);

  const admin = scopeOf(publicAccount(accountByUsername('admin')));
  assert.equal(admin.all, true);
  assert.equal(admin.operatorId, null);
});

test('a signed-out caller has no scope at all', () => {
  const s = scopeOf(null);
  assert.equal(s.all, false);
  assert.equal(s.operatorId, null);
});
