/* Behavioural tests for the DMS fusion engine (SYSTEM_DESIGN §8).
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDrowsinessMonitor, createDriverSimulator, circadianFactor, LEVELS,
} from './drowsiness.js';

const BASE = 0.30;

/** Drive the monitor for `seconds` at a fixed ground-truth fatigue. */
function run(monitor, seconds, fatigue, ctx, t0 = 1_700_000_000_000) {
  const sim = createDriverSimulator(5);
  let state = null;
  for (let s = 0; s < seconds; s++) {
    for (let f = 0; f < 15; f++) {
      monitor.pushFrame(sim(t0 + s * 1000 + f * 66, fatigue, BASE));
    }
    monitor.pushContext(ctx);
    state = monitor.tick(t0 + s * 1000);
  }
  return state;
}

test('circadian risk peaks in the 02:00-06:00 trough', () => {
  assert.ok(circadianFactor(4) > 0.9, 'should peak around 04:00');
  assert.ok(circadianFactor(4) > circadianFactor(11), 'night worse than late morning');
  assert.ok(circadianFactor(15) > circadianFactor(11), 'post-lunch dip is present');
  assert.ok(circadianFactor(23) > circadianFactor(11), 'late night wraps into the trough');
});

test('calibration completes and produces a plausible baseline', () => {
  const dms = createDrowsinessMonitor({ hasCamera: true });
  assert.equal(dms.isCalibrating(), true);
  run(dms, 8, 0.1, { timeOnTaskMin: 0, localHour: 10 });
  assert.equal(dms.isCalibrating(), false);
});

test('an alert driver in daylight stays at D0/D1', () => {
  const dms = createDrowsinessMonitor({ hasCamera: true, earBaseline: BASE });
  const s = run(dms, 90, 0.05, {
    timeOnTaskMin: 20, localHour: 11, laneVariance: 0.1, speedVariance: 2, dutyHours24h: 2,
  });
  assert.ok(LEVELS.indexOf(s.level) <= 1, `expected D0/D1, got ${s.level} (kss ${s.kss})`);
});

test('a fatigued driver at 04:00 past four hours escalates to D3 or above', () => {
  const dms = createDrowsinessMonitor({ hasCamera: true, earBaseline: BASE });
  const s = run(dms, 120, 0.92, {
    timeOnTaskMin: 300, localHour: 4, laneVariance: 0.85, speedVariance: 11, dutyHours24h: 11,
  });
  assert.ok(LEVELS.indexOf(s.level) >= 3, `expected D3+, got ${s.level} (kss ${s.kss})`);
  assert.equal(s.mode, 'full');
});

test('context-only mode is capped at D2 even under extreme context risk', () => {
  const dms = createDrowsinessMonitor({ hasCamera: false });
  const s = run(dms, 60, 0.99, {
    timeOnTaskMin: 400, localHour: 4, laneVariance: 1.2, speedVariance: 15, dutyHours24h: 13,
  });
  assert.equal(s.mode, 'context-only');
  assert.ok(LEVELS.indexOf(s.level) <= 2, `context-only must cap at D2, got ${s.level}`);
});

test('de-escalation is slow: level holds after fatigue drops', () => {
  const dms = createDrowsinessMonitor({ hasCamera: true, earBaseline: BASE });
  const hi = { timeOnTaskMin: 300, localHour: 4, laneVariance: 0.85, speedVariance: 11, dutyHours24h: 11 };
  const t0 = 1_700_000_000_000;
  const raised = run(dms, 120, 0.92, hi, t0);
  assert.ok(LEVELS.indexOf(raised.level) >= 2);

  // 60 s of a fully alert driver is NOT enough to clear it (3 min required)
  const after = run(dms, 60, 0.0, {
    timeOnTaskMin: 5, localHour: 11, laneVariance: 0.05, speedVariance: 1, dutyHours24h: 1,
  }, t0 + 120_000);
  assert.equal(after.level, raised.level, 'level must not drop within 60 s');
});

test('a break resets time-on-task and clears the level', () => {
  const dms = createDrowsinessMonitor({ hasCamera: true, earBaseline: BASE });
  run(dms, 120, 0.92, {
    timeOnTaskMin: 300, localHour: 4, laneVariance: 0.85, speedVariance: 11, dutyHours24h: 11,
  });
  dms.takeBreak();
  const s = run(dms, 5, 0.1, { timeOnTaskMin: 0, localHour: 11, laneVariance: 0.05, speedVariance: 1, dutyHours24h: 1 });
  assert.ok(LEVELS.indexOf(s.level) <= 1, `after a break expected D0/D1, got ${s.level}`);
});

test('fatigue events carry scalars only — never imagery or landmarks', () => {
  const dms = createDrowsinessMonitor({ hasCamera: true, earBaseline: BASE });
  run(dms, 120, 0.92, {
    timeOnTaskMin: 300, localHour: 4, laneVariance: 0.85, speedVariance: 11, dutyHours24h: 11,
  });
  assert.ok(dms.events.length > 0, 'expected at least one emitted event');
  for (const ev of dms.events) {
    const keys = Object.keys(ev);
    assert.ok(!keys.some((k) => /frame|image|landmark|template|photo|clip/i.test(k)),
      'event must not carry imagery-derived fields');
    for (const v of Object.values(ev.features)) {
      assert.ok(v === null || typeof v === 'number', 'features must be scalars');
    }
    assert.ok(ev.weightsVersion, 'event must stamp the model version that produced it');
  }
});
