/* Attendance, lockouts and the clip queue.
 *
 * These three exist because of each other: the gate produces an attendance
 * row, a failed gate produces a lockout somebody else has to clear, and a
 * running shift produces the footage a model will eventually be trained on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openAttendance, closeAttendance, lockedOutAttendance, attendanceSummary,
  attendanceForOperator, attendanceForDriver, byNewest, seedAttendance, LATE_GRACE_MIN,
} from './attendance.js';
import {
  createLockout, resetLockout, openLockouts, lockoutsForScope, lockoutNotice, RESET_ROLES,
} from './lockouts.js';
import { createClipRecorder, createShiftRecorders, CAMERAS, ANALYSIS_STATE } from './recording.js';

/* -------------------------------------------------------- attendance ----- */

const T0 = Date.UTC(2026, 7, 9, 4, 30);

test('a record opens on check-in and carries the evidence that produced it', () => {
  const r = openAttendance({
    driverId: 'drv-1', busId: 'bus-1', operatorId: 'op-1', routeId: 'nh52-indore-dewas',
    at: T0,
    identity: { status: 'matched', confidence: 0.94, driverId: 'drv-1' },
    breath: { bac: 0, attempts: 1, passed: true },
  });

  assert.equal(r.status, 'on-duty');
  assert.equal(r.shiftEnd, null);
  assert.equal(r.identity.confidence, 0.94);
  assert.equal(r.breath.passed, true, 'the reading that let them drive stays on the row');
});

test('closing a record stamps the duration and is idempotent', () => {
  const open = openAttendance({ driverId: 'drv-1', busId: 'bus-1', operatorId: 'op-1', at: T0 });
  const done = closeAttendance(open, T0 + 8.5 * 3600000);

  assert.equal(done.status, 'completed');
  assert.equal(done.durationMin, 510);
  assert.equal(closeAttendance(done, T0 + 20 * 3600000).durationMin, 510, 'a second close is a no-op');
});

test('lateness is measured against the roster, with a grace window', () => {
  const onTime = openAttendance({
    driverId: 'drv-1', busId: 'bus-1', operatorId: 'op-1',
    at: T0 + (LATE_GRACE_MIN - 1) * 60000, rosteredStart: T0,
  });
  assert.equal(onTime.late, false);

  const late = openAttendance({
    driverId: 'drv-1', busId: 'bus-1', operatorId: 'op-1',
    at: T0 + 25 * 60000, rosteredStart: T0,
  });
  assert.equal(late.late, true);
  assert.equal(late.lateByMin, 25);
});

test('a driver turned away is still on the sheet', () => {
  const r = lockedOutAttendance({
    driverId: 'drv-5', busId: 'bus-7', operatorId: 'op-2', at: T0,
    breath: { bac: 0.058, attempts: 3, passed: false },
    lockCode: 'LK-BUS7-0809',
  });
  assert.equal(r.status, 'locked-out');
  assert.equal(r.shiftStart, null, 'no shift began');
  assert.equal(r.lockCode, 'LK-BUS7-0809');
  assert.equal(r.breath.attempts, 3);
});

test('the summary separates shifts from lockouts when scoring punctuality', () => {
  const rows = [
    closeAttendance(openAttendance({ driverId: 'a', busId: 'b1', operatorId: 'op-1', at: T0, rosteredStart: T0 }), T0 + 3600000),
    openAttendance({ driverId: 'b', busId: 'b2', operatorId: 'op-1', at: T0 + 40 * 60000, rosteredStart: T0 }),
    lockedOutAttendance({ driverId: 'c', busId: 'b3', operatorId: 'op-1', at: T0 }),
  ];
  const s = attendanceSummary(rows);

  assert.equal(s.total, 3);
  assert.equal(s.lockedOut, 1);
  assert.equal(s.late, 1);
  assert.equal(s.punctuality, 50, 'two shifts, one late — the lockout is not a shift');
  assert.equal(s.drivers, 3);
  assert.equal(s.hours, 1);
});

test('attendance is tenant-scoped, and a driver sees only their own', () => {
  const rows = seedAttendance(T0);
  const op1 = attendanceForOperator(rows, 'op-1');
  assert.ok(op1.length > 0);
  assert.ok(op1.every((r) => r.operatorId === 'op-1'));
  assert.equal(attendanceForOperator(rows, null).length, rows.length, 'admin passes null');

  const mine = attendanceForDriver(rows, 'drv-2');
  assert.ok(mine.every((r) => r.driverId === 'drv-2'));
});

test('the seeded fortnight contains the two cases a reviewer must be able to see', () => {
  const rows = seedAttendance(T0);
  assert.ok(rows.some((r) => r.status === 'locked-out'), 'a lockout');
  const days = new Set(rows.filter((r) => r.driverId === 'drv-3').map((r) => r.date));
  assert.ok(days.size < 13, 'and an absence');

  const sorted = byNewest(rows);
  assert.ok(sorted[0].checkinAt >= sorted[sorted.length - 1].checkinAt);
});

/* ---------------------------------------------------------- lockouts ----- */

const READINGS = [
  { bac: 0.061, at: T0, valid: true, overLegal: true },
  { bac: 0.058, at: T0 + 60000, valid: true, overLegal: true },
  { bac: 0.055, at: T0 + 120000, valid: true, overLegal: true },
];
const lock = () => createLockout({
  busId: 'bus-7', operatorId: 'op-2', driverId: 'drv-5', readings: READINGS, at: T0,
});

const OPERATOR = { id: 'acc-op-2', role: 'operator', operatorId: 'op-2', name: 'Devendra Malwa' };
const OTHER_OPERATOR = { id: 'acc-op-1', role: 'operator', operatorId: 'op-1', name: 'Anita Rao' };
const ADMIN = { id: 'acc-adm-1', role: 'admin', operatorId: null, name: 'Parth Verma' };
const DRIVER = { id: 'acc-drv-3', role: 'driver', operatorId: 'op-2', driverId: 'drv-5', name: 'Gopal Verma' };

test('a lockout carries every reading, not a summary of them', () => {
  const l = lock();
  assert.equal(l.status, 'open');
  assert.equal(l.attempts, 3);
  assert.equal(l.worstBac, 0.061);
  assert.equal(l.overLegal, true);
  assert.equal(l.readings.length, 3);
  assert.ok(l.code.startsWith('LK-'));
});

test('the lockout is addressed to the operator and an administrator', () => {
  const l = lock();
  assert.deepEqual(l.notify.map((n) => n.role).sort(), ['admin', 'operator']);
  assert.ok(l.notify.every((n) => n.state === 'pending'), 'nothing is sent yet — see docs/NOTIFICATIONS.md');
});

test('the vehicle operator can reset their own fleet', () => {
  const r = resetLockout(lock(), OPERATOR, { note: 'Driver stood down, relief called.' });
  assert.equal(r.ok, true);
  assert.equal(r.lockout.status, 'reset');
  assert.equal(r.lockout.resetBy.role, 'operator');
  assert.equal(r.lockout.resetNote, 'Driver stood down, relief called.');
  assert.ok(r.lockout.notify.every((n) => n.state === 'resolved'));
});

test('an administrator can reset any fleet', () => {
  assert.equal(resetLockout(lock(), ADMIN).ok, true);
});

test('another operator cannot reach into this fleet', () => {
  const r = resetLockout(lock(), OTHER_OPERATOR);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'wrong-tenant');
});

test('the driver it was raised against cannot clear it', () => {
  const r = resetLockout(lock(), DRIVER);
  assert.equal(r.ok, false);
  assert.ok(r.reason === 'forbidden' || r.reason === 'self-reset');
  assert.equal(RESET_ROLES.indexOf('driver'), -1, 'and the role is not in the allow-list at all');
});

test('a lockout cannot be cleared twice', () => {
  const first = resetLockout(lock(), ADMIN);
  const second = resetLockout(first.lockout, ADMIN);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'not-open');
});

test('scoping: an operator sees their locks, a driver sees theirs, admin sees all', () => {
  const all = [lock(), createLockout({ busId: 'bus-1', operatorId: 'op-1', driverId: 'drv-2', readings: READINGS, at: T0 })];
  assert.equal(lockoutsForScope(all, ADMIN).length, 2);
  assert.equal(lockoutsForScope(all, OPERATOR).length, 1);
  assert.equal(lockoutsForScope(all, DRIVER).length, 1);
  assert.equal(lockoutsForScope(all, { role: 'gov' }).length, 0, 'the road authority never sees a driver');
  assert.equal(openLockouts(all).length, 2);
});

test('the notice names the vehicle, the reading and how to clear it', () => {
  const n = lockoutNotice(lock(), { bus: { reg: 'MP04 KD 7719' }, driver: { name: 'Gopal Verma' } });
  assert.ok(n.subject.includes('MP04 KD 7719'));
  assert.ok(n.lines.join(' ').includes('0.061'));
  assert.ok(n.lines.join(' ').includes('LK-'));
});

/* --------------------------------------------------------- recording ----- */

test('the rear camera cuts a segment per interval, with the chainage on it', () => {
  const rec = createClipRecorder('rear');
  const seg = CAMERAS.rear.segmentSec * 1000;
  rec.start(0);

  assert.equal(rec.tick(seg - 1, { chainageM: 400 }).clipCount, 0);
  const s = rec.tick(seg, { chainageM: 500, lat: 22.72, lng: 75.85, lane: 2, speedKph: 54, routeId: 'nh52-indore-dewas' });

  assert.equal(s.clipCount, 1);
  const clip = s.clips[0];
  assert.equal(clip.kind, 'segment');
  assert.equal(clip.context.chainageM, 500, 'a road clip with no chainage is not training data');
  assert.equal(clip.analysis, ANALYSIS_STATE, 'nothing is analysed on device yet');
  assert.equal(clip.upload, 'queued');
  assert.ok(clip.bytes > 0);
});

test('a camera that is not running records nothing', () => {
  const rec = createClipRecorder('rear');
  rec.tick(60000, { chainageM: 100 });
  rec.mark(60000, { reason: 'test' });
  assert.equal(rec.state().clipCount, 0);
});

test('the driver camera only cuts on an event, and the clip starts before it', () => {
  const rec = createClipRecorder('front');
  rec.start(0);
  assert.equal(rec.tick(120000).clipCount, 0, 'no continuous capture of a person');

  const s = rec.mark(120000, { reason: 'dms-D3', context: { dmsLevel: 'D3' } });
  assert.equal(s.clipCount, 1);
  const clip = s.clips[0];
  assert.equal(clip.kind, 'event');
  assert.equal(clip.reason, 'dms-D3');
  assert.equal(clip.from, 120000 - CAMERAS.front.preRollSec * 1000,
    'the interesting seconds are the ones before the alarm fired');
  assert.ok(clip.to > 120000);
});

test('the clip buffer is bounded — old segments fall off rather than filling the disk', () => {
  const rec = createClipRecorder('rear', { maxClips: 3 });
  rec.start(0);
  const seg = CAMERAS.rear.segmentSec * 1000;
  for (let i = 1; i <= 6; i++) rec.tick(seg * i, { chainageM: i * 100 });

  const s = rec.state();
  assert.equal(s.clipCount, 3);
  assert.equal(s.dropped, 3);
  assert.equal(s.clips[s.clips.length - 1].context.chainageM, 600, 'the newest survives');
});

test('both cameras start with the shift and the front one follows the DMS', () => {
  const r = createShiftRecorders();
  r.start(0);
  assert.equal(r.state().recording, true);

  r.tick(1000, { dmsLevel: 'D1' });
  assert.equal(r.front.state().clipCount, 0, 'D1 is logged, not filmed');

  r.tick(2000, { dmsLevel: 'D3', chainageM: 900 });
  assert.equal(r.front.state().clipCount, 1, 'a rise into D3 is worth the evidence');

  r.tick(3000, { dmsLevel: 'D3' });
  assert.equal(r.front.state().clipCount, 1, 'staying at D3 does not re-cut');

  r.tick(4000, { dmsLevel: 'D4' });
  assert.equal(r.front.state().clipCount, 2, 'but getting worse does');

  r.stop(5000);
  assert.equal(r.state().recording, false);
  assert.ok(r.state().pendingAnalysis >= 2, 'everything is queued for a model that does not exist yet');
});

test('uploading marks clips without deleting them', () => {
  const rec = createClipRecorder('rear');
  rec.start(0);
  rec.tick(CAMERAS.rear.segmentSec * 1000, { chainageM: 100 });
  const id = rec.state().clips[0].id;

  const s = rec.markUploaded([id]);
  assert.equal(s.clips[0].upload, 'sent');
  assert.equal(s.clipCount, 1);
});
