/* Behavioural tests for the pre-drive gate.
 *
 * The rules under test are the ones a driver would try to route around, and
 * the ones a fleet would be sued over: what counts as an attempt, when the
 * vehicle locks, and who can unlock it.
 *
 * The analyser is a separate BLE device, so the app never produces a reading —
 * it asks, waits, and records. These tests drive it the same way the hosts do:
 * `startAnalysis()`, then `onDeviceResult()` with what the device said.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBreathTest, createCheckinGate, verifyFace, makeCapture,
  ALCOHOL_POLICY, FACE_POLICY, CHECKIN_STEPS,
} from './checkin.js';

const P = ALCOHOL_POLICY;
const sample = (bac, extra = {}) => ({ bac, durationMs: 6200, valid: true, ...extra });

/** Drive a test from cold to `ready`. */
function paired(opts) {
  const bt = createBreathTest(opts);
  bt.pair(0);
  bt.tick(P.pairingMs);
  return bt;
}

test('the analyser must be paired before an analysis can start', () => {
  const bt = createBreathTest();
  assert.equal(bt.state().state, 'idle');
  bt.startAnalysis(0);
  assert.equal(bt.state().state, 'idle', 'starting from idle is ignored');

  bt.pair(0);
  assert.equal(bt.tick(P.pairingMs - 1).state, 'pairing');
  const ready = bt.tick(P.pairingMs);
  assert.equal(ready.state, 'ready');
  assert.ok(ready.device, 'the paired device is reported so the screen can name it');
});

test('the app cannot produce a reading on its own — it waits for the device', () => {
  const bt = paired();
  const s = bt.startAnalysis(0);
  assert.equal(s.state, 'analysing');
  assert.equal(s.attempts, 0, 'asking is not an attempt');
  assert.equal(s.result, null);

  /* Twenty seconds of waiting change nothing without the device. */
  assert.equal(bt.tick(20000).state, 'analysing');
  assert.equal(bt.state().attempts, 0);
});

test('a clear reading from the device passes', () => {
  const bt = paired();
  bt.startAnalysis(0);
  const s = bt.onDeviceResult(sample(0), 4200);

  assert.equal(s.state, 'pass');
  assert.equal(s.passed, true);
  assert.equal(s.attempts, 1);
  assert.equal(s.result.pass, true);
  assert.ok(s.result.bac <= P.limitBac);
});

test('a reading over the policy limit fails and is logged with the statutory flag', () => {
  const bt = paired();
  bt.startAnalysis(0);
  const s = bt.onDeviceResult(sample(0.058), 4200);

  assert.equal(s.state, 'fail');
  assert.equal(s.result.pass, false);
  assert.equal(s.result.overLegal, true, '0.058 is above the 0.03 statutory limit');
  assert.equal(s.attemptsLeft, P.maxAttempts - 1);
});

test('a sample the device rejects is a fault, not an attempt', () => {
  const bt = paired();
  bt.startAnalysis(0);
  const s = bt.onDeviceResult({ valid: false, reason: 'short-sample', durationMs: 1200 }, 3000);

  assert.equal(s.state, 'fault');
  assert.equal(s.attempts, 0, 'a bad blow must not burn an attempt');
  assert.equal(s.result.valid, false);

  /* And the driver can go straight round again. */
  assert.equal(bt.retry(3500).state, 'ready');
});

test('a device that never answers is a device fault, not a driver failure', () => {
  const bt = paired();
  bt.startAnalysis(0);
  assert.equal(bt.tick(P.analysisTimeoutMs - 1).state, 'analysing');

  const s = bt.tick(P.analysisTimeoutMs);
  assert.equal(s.state, 'fault');
  assert.equal(s.result.reason, 'device-timeout');
  assert.equal(s.attempts, 0);
});

test('a late reading after a timeout is ignored', () => {
  const bt = paired();
  bt.startAnalysis(0);
  bt.tick(P.analysisTimeoutMs);
  const s = bt.onDeviceResult(sample(0.09), P.analysisTimeoutMs + 500);
  assert.equal(s.attempts, 0, 'the session was already closed as a fault');
  assert.equal(s.state, 'fault');
});

test('three failed readings lock the vehicle, and a fourth is refused', () => {
  const bt = paired();

  for (let i = 1; i <= 2; i++) {
    bt.startAnalysis(0);
    const s = bt.onDeviceResult(sample(0.06), 4000);
    assert.equal(s.state, 'fail', `attempt ${i} fails but leaves a retry`);
    assert.equal(s.attemptsLeft, P.maxAttempts - i);
    bt.retry(0);
  }

  bt.startAnalysis(0);
  const s = bt.onDeviceResult(sample(0.06), 4000);
  assert.equal(s.state, 'locked');
  assert.equal(s.locked, true);
  assert.equal(s.attemptsLeft, 0);

  /* The driver cannot blow their way out of a lock. */
  assert.equal(bt.retry(0).state, 'locked');
  bt.startAnalysis(0);
  assert.equal(bt.onDeviceResult(sample(0), 0).attempts, 3, 'no further attempts are recorded');
});

test('rejected samples never accumulate toward the lock', () => {
  const bt = paired();
  for (let i = 0; i < 6; i++) {
    bt.startAnalysis(0);
    bt.onDeviceResult({ valid: false, durationMs: 900 }, 1000);
    bt.retry(1000);
  }
  assert.equal(bt.state().state, 'ready');
  assert.equal(bt.state().attempts, 0);
});

test('only an override clears a lock, and it is recorded', () => {
  const bt = paired();
  for (let i = 0; i < 3; i++) {
    bt.startAnalysis(0);
    bt.onDeviceResult(sample(0.07), 4000);
    bt.retry(0);
  }
  assert.equal(bt.state().state, 'locked');

  const s = bt.unlock('operator:sarthi');
  assert.equal(s.state, 'ready');
  assert.equal(s.attempts, 0);
  assert.ok(s.history.some((h) => h.override && h.by === 'operator:sarthi'));
});

test('a driver who fails once and then reads clear is let through', () => {
  const bt = paired();
  bt.startAnalysis(0);
  assert.equal(bt.onDeviceResult(sample(0.04), 4000).state, 'fail');
  bt.retry(0);
  bt.startAnalysis(0);
  const s = bt.onDeviceResult(sample(0), 8000);
  assert.equal(s.state, 'pass');
  assert.equal(s.history.length, 2, 'both readings stay in the record');
});

/* ------------------------------------------------------------- face ------ */

const ENROLLED = [
  { driverId: 'drv-1', template: 'fp:aaa' },
  { driverId: 'drv-2', template: 'fp:bbb' },
  { driverId: 'drv-3', template: 'fp:ccc' },
];

test('an enrolled driver is matched above the confidence floor', () => {
  const r = verifyFace(makeCapture({ template: 'fp:bbb', quality: 0.92 }), ENROLLED);
  assert.equal(r.status, 'matched');
  assert.equal(r.driverId, 'drv-2');
  assert.ok(r.confidence >= FACE_POLICY.matchThreshold);
});

test('a face nobody enrolled is not silently assigned to the nearest driver', () => {
  const r = verifyFace(makeCapture({ template: 'fp:zzz', quality: 0.92 }), ENROLLED);
  assert.equal(r.status, 'unknown-face');
  assert.equal(r.matched, false);
  assert.equal(r.driverId, undefined);
});

test('too few frames is a capture problem, not an identity verdict', () => {
  const r = verifyFace(makeCapture({ template: 'fp:aaa', frames: 1 }), ENROLLED);
  assert.equal(r.status, 'poor-capture');
  assert.equal(r.matched, false);
});

test('a dark frame is rejected rather than guessed at', () => {
  const r = verifyFace(makeCapture({ template: 'fp:aaa', quality: 0.2 }), ENROLLED);
  assert.equal(r.status, 'poor-capture');
});

test('verification against an empty roster cannot match', () => {
  const r = verifyFace(makeCapture({ template: 'fp:aaa' }), []);
  assert.equal(r.status, 'unknown-face');
});

/* ------------------------------------------------------------- gate ------ */

test('the gate advances only in order, and a pass leads to assignment, not to driving', () => {
  const g = createCheckinGate();
  assert.deepEqual(CHECKIN_STEPS, ['vehicle', 'identity', 'alcohol', 'assignment', 'cleared']);
  assert.equal(g.state().step, 'vehicle');

  g.confirmVehicle({ device: { serial: 'DS-TAB-8841' }, bus: { id: 'bus-1' } });
  assert.equal(g.state().step, 'identity');

  g.confirmDriver({ driverId: 'drv-1', confidence: 0.93, status: 'matched' });
  assert.equal(g.state().step, 'alcohol');

  g.applyBreath({ passed: false, locked: false });
  assert.equal(g.state().step, 'alcohol', 'a failed test does not advance the gate');

  g.applyBreath({ passed: true, locked: false });
  assert.equal(g.state().step, 'assignment', 'a clear reading buys the bus-and-route choice');
  assert.equal(g.state().cleared, false, 'and not the road');

  const s = g.confirmAssignment({ busId: 'bus-1', routeId: 'nh52-indore-dewas' });
  assert.equal(s.step, 'cleared');
  assert.equal(s.cleared, true);
  assert.deepEqual(s.assignment, { busId: 'bus-1', routeId: 'nh52-indore-dewas' });
});

test('a second breath snapshot cannot drag the gate back out of assignment', () => {
  const g = createCheckinGate();
  g.confirmVehicle({});
  g.confirmDriver({});
  g.applyBreath({ passed: true });
  assert.equal(g.state().step, 'assignment');
  g.applyBreath({ passed: true });
  assert.equal(g.state().step, 'assignment', 'the poll that produced it keeps firing');
});

test('a locked breath test surfaces on the gate', () => {
  const g = createCheckinGate();
  g.confirmVehicle({});
  g.confirmDriver({});
  const s = g.applyBreath({ passed: false, locked: true });
  assert.equal(s.locked, true);
  assert.equal(s.cleared, false);
});
