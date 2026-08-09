/* Behavioural tests for the pre-drive gate.
 *
 * The rules under test are the ones a driver would try to route around, and
 * the ones a fleet would be sued over: what counts as an attempt, when the
 * vehicle locks, and who can unlock it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBreathTest, createCheckinGate, verifyFace, makeCapture, failingCell,
  ALCOHOL_POLICY, FACE_POLICY,
} from './checkin.js';

const P = ALCOHOL_POLICY;

/* Drive a test from cold to `ready`. */
function armed(opts) {
  const bt = createBreathTest(opts);
  bt.warmup(0);
  bt.tick(P.warmupMs);
  return bt;
}

test('the cell must warm up before a blow is accepted', () => {
  const bt = createBreathTest();
  assert.equal(bt.state().state, 'idle');
  bt.startBlow(0);
  assert.equal(bt.state().state, 'idle', 'blowing from idle is ignored');

  bt.warmup(0);
  assert.equal(bt.tick(P.warmupMs - 1).state, 'warmup');
  assert.equal(bt.tick(P.warmupMs).state, 'ready');
});

test('a blow shorter than the minimum is not an attempt', () => {
  const bt = armed();
  bt.startBlow(0);
  const s = bt.endBlow(P.minBlowMs - 500);

  assert.equal(s.attempts, 0, 'a short blow must not burn an attempt');
  assert.equal(s.state, 'ready', 'and must leave the driver able to blow again');
  assert.equal(s.result.valid, false);
  assert.equal(s.result.reason, 'short-blow');
});

test('a clean blow of the required length passes', () => {
  const bt = armed();
  bt.startBlow(0);
  const s = bt.endBlow(P.minBlowMs + 400);

  assert.equal(s.state, 'pass');
  assert.equal(s.passed, true);
  assert.equal(s.attempts, 1);
  assert.equal(s.result.pass, true);
  assert.ok(s.result.bac <= P.limitBac);
});

test('a blow past the ceiling is truncated, not rejected', () => {
  const bt = armed();
  bt.startBlow(0);
  const s = bt.endBlow(P.maxBlowMs + 5000);

  assert.equal(s.result.valid, true);
  assert.equal(s.result.durationMs, P.maxBlowMs, 'the saturated tail is discarded');
});

test('tick auto-ends a blow held past the ceiling', () => {
  const bt = armed();
  bt.startBlow(0);
  const s = bt.tick(P.maxBlowMs + 1);
  assert.equal(s.state, 'pass');
  assert.equal(s.result.durationMs, P.maxBlowMs);
});

test('three failures lock the vehicle, and a fourth blow is refused', () => {
  const bt = armed({ readCell: failingCell(9) });

  for (let i = 1; i <= 2; i++) {
    bt.startBlow(0);
    const s = bt.endBlow(P.minBlowMs);
    assert.equal(s.state, 'fail', `attempt ${i} fails but leaves a retry`);
    assert.equal(s.attemptsLeft, P.maxAttempts - i);
    bt.retry(0);
    bt.tick(P.warmupMs);
  }

  bt.startBlow(0);
  const s = bt.endBlow(P.minBlowMs);
  assert.equal(s.state, 'locked');
  assert.equal(s.locked, true);
  assert.equal(s.attemptsLeft, 0);

  /* The driver cannot blow their way out of a lock. */
  assert.equal(bt.retry(0).state, 'locked');
  bt.startBlow(0);
  assert.equal(bt.endBlow(P.minBlowMs).attempts, 3, 'no further attempts are recorded');
});

test('short blows do not count toward the lock', () => {
  const bt = armed({ readCell: failingCell(9) });
  for (let i = 0; i < 6; i++) {
    bt.startBlow(0);
    bt.endBlow(1000);
  }
  assert.equal(bt.state().state, 'ready');
  assert.equal(bt.state().attempts, 0);
});

test('only a supervisor override clears a lock, and it is recorded', () => {
  const bt = armed({ readCell: failingCell(3) });
  for (let i = 0; i < 3; i++) {
    bt.startBlow(0);
    bt.endBlow(P.minBlowMs);
    bt.retry(0);
    bt.tick(P.warmupMs);
  }
  assert.equal(bt.state().state, 'locked');

  const s = bt.unlock('depot-supervisor:anita');
  assert.equal(s.state, 'ready');
  assert.equal(s.attempts, 0);
  assert.ok(s.history.some((h) => h.override && h.by === 'depot-supervisor:anita'));
});

test('a failing driver who then blows clean is let through', () => {
  const bt = armed({ readCell: failingCell(1) });
  bt.startBlow(0);
  assert.equal(bt.endBlow(P.minBlowMs).state, 'fail');
  bt.retry(0);
  bt.tick(P.warmupMs);
  bt.startBlow(0);
  const s = bt.endBlow(P.minBlowMs);
  assert.equal(s.state, 'pass');
  assert.equal(s.history.length, 2, 'both readings stay in the record');
});

test('blow progress reports against the minimum duration', () => {
  const bt = armed();
  bt.startBlow(0);
  assert.equal(bt.blowProgress(0), 0);
  assert.equal(bt.blowProgress(P.minBlowMs / 2), 0.5);
  assert.equal(bt.blowProgress(P.minBlowMs * 2), 1, 'progress is clamped');
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

test('the gate advances only in order and clears on a passed breath test', () => {
  const g = createCheckinGate();
  assert.equal(g.state().step, 'vehicle');

  g.confirmVehicle({ device: { serial: 'DS-TAB-8841' }, bus: { id: 'bus-1' } });
  assert.equal(g.state().step, 'identity');

  g.confirmDriver({ driverId: 'drv-1', confidence: 0.93, status: 'matched' });
  assert.equal(g.state().step, 'alcohol');

  g.applyBreath({ passed: false, locked: false });
  assert.equal(g.state().step, 'alcohol', 'a failed test does not clear the gate');

  g.applyBreath({ passed: true, locked: false });
  assert.equal(g.state().step, 'cleared');
  assert.equal(g.state().cleared, true);
});

test('a locked breath test surfaces on the gate', () => {
  const g = createCheckinGate();
  g.confirmVehicle({});
  g.confirmDriver({});
  const s = g.applyBreath({ passed: false, locked: true });
  assert.equal(s.locked, true);
  assert.equal(s.cleared, false);
});
