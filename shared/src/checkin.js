/* Pre-drive check-in — vehicle, driver identity, breath alcohol, assignment.
 *
 * The gate between "app is open" and "the bus can move". Four stages, in this
 * order, because each one narrows the question the next one asks:
 *
 *   1. VEHICLE     the tablet is bolted to one bus; its serial resolves the
 *                  vehicle before any human is involved.
 *   2. IDENTITY    a front-camera frame is matched against the templates
 *                  enrolled for that bus's operator. Unknown face → register,
 *                  don't refuse.
 *   3. ALCOHOL     a reading from the cabin breathalyser — a separate BLE
 *                  device, not something the screen can fake. Three failures
 *                  and the vehicle stays immobilised until an operator or an
 *                  administrator clears it; the driver cannot.
 *   4. ASSIGNMENT  which bus and which corridor this shift is running. Last,
 *                  because there is no point choosing a route for a driver who
 *                  is not going to be allowed to drive.
 *
 * All of it is pure: no timers, no camera, no BLE. The hosts feed it wall-clock
 * milliseconds and device payloads, and both platforms get identical behaviour
 * — including the failure counting, which is the part that must not differ
 * between the tablet and the console replaying it.
 */

/* --------------------------------------------------------------- policy ---
 * Indian law allows 0.03 %BAC for private drivers. A public-service vehicle
 * carrying passengers is a zero-tolerance seat, so fleet policy is the tighter
 * number and the legal one is recorded alongside it for the incident report.
 */
export const ALCOHOL_POLICY = {
  limitBac: 0.01,          // %BAC — fleet zero-tolerance threshold
  legalBac: 0.03,          // %BAC — statutory limit, for the report only
  minBlowMs: 5000,         // the analyser rejects a shorter sample itself
  maxAttempts: 3,
  pairingMs: 2000,         // BLE connect + cell warm-up, reported by the device
  analysisTimeoutMs: 45000, // no reading in this long → the device, not the driver
};

export const FACE_POLICY = {
  matchThreshold: 0.82,    // accept
  reviewThreshold: 0.62,   // between the two: matched, but flagged for review
  minFrames: 3,
};

export const CHECKIN_STEPS = ['vehicle', 'identity', 'alcohol', 'assignment', 'cleared'];

/* --------------------------------------------------- breath test machine ---
 * The analyser is a **separate device** — a BLE mouthpiece unit in the cab, not
 * a control on this screen. That distinction is the whole design: a button the
 * driver holds is a button the driver can hold with the mouthpiece in someone
 * else's mouth, or in no one's. The app can only do three things: ask the
 * device to take a sample, wait, and record what comes back.
 *
 * So the screen has no gesture that produces a reading. It shows "start
 * analysis", the driver blows into the unit, and the app sits in `analysing`
 * until the device reports — or until it doesn't, which is a device fault and
 * is not counted against the driver.
 *
 * States: idle → pairing → ready → analysing → pass | fail | fault → locked
 *
 * `now` is injected on every call rather than read from Date, so a test can
 * drive a 45-second timeout in microseconds and a replay can re-run a real
 * session exactly.
 */
export function createBreathTest(options = {}) {
  const policy = { ...ALCOHOL_POLICY, ...options.policy };

  let state = 'idle';
  let attempts = 0;
  let lastResult = null;
  let history = [];
  let phaseStart = 0;
  let device = options.device || null;   // { id, name, battery } once paired

  const snapshot = () => ({
    state,
    attempts,
    attemptsLeft: Math.max(0, policy.maxAttempts - attempts),
    maxAttempts: policy.maxAttempts,
    locked: state === 'locked',
    passed: state === 'pass',
    analysing: state === 'analysing',
    device,
    result: lastResult,
    history: history.slice(),
    policy,
    elapsedMs: 0,
  });

  return {
    get policy() { return policy; },
    state: snapshot,

    /** Connect to the mouthpiece unit and let its cell come up to temperature. */
    pair(now, found) {
      if (state === 'locked' || state === 'pass') return snapshot();
      phaseStart = now;
      device = found || device || { id: 'ble-analyser', name: 'DrivoSafe AL-2', battery: 0.86 };
      state = 'pairing';
      return snapshot();
    },

    /**
     * Poll. Advances pairing → ready, and fails an analysis the device never
     * answered. A timeout is a *device* fault: it says nothing about the
     * driver, so it costs them no attempt.
     */
    tick(now) {
      if (state === 'pairing' && now - phaseStart >= policy.pairingMs) state = 'ready';
      if (state === 'analysing' && now - phaseStart >= policy.analysisTimeoutMs) {
        state = 'fault';
        lastResult = {
          valid: false,
          reason: 'device-timeout',
          message: 'The analyser did not report a reading. Check that it is switched on and paired.',
        };
      }
      const s = snapshot();
      s.elapsedMs = state === 'analysing' || state === 'pairing' ? now - phaseStart : 0;
      return s;
    },

    /** Ask the device for a sample. The driver now blows into the unit. */
    startAnalysis(now) {
      if (state !== 'ready') return snapshot();
      phaseStart = now;
      state = 'analysing';
      lastResult = null;
      return snapshot();
    },

    /** How long the app has been waiting on the device, 0–1 of the timeout. */
    waitProgress(now) {
      if (state !== 'analysing') return 0;
      return Math.min(1, (now - phaseStart) / policy.analysisTimeoutMs);
    },

    /**
     * A reading arrived from the analyser.
     *
     * `sample` is the device's own payload: `{ bac, durationMs, valid }`. The
     * device decides whether the blow was a usable sample — it is the thing
     * with the flow sensor. An unusable sample is not an attempt, for the same
     * reason a timeout is not: it is not evidence about the driver.
     */
    onDeviceResult(sample, now) {
      if (state !== 'analysing') return snapshot();

      const usable = sample && sample.valid !== false &&
        typeof sample.bac === 'number' &&
        (sample.durationMs == null || sample.durationMs >= policy.minBlowMs);

      if (!usable) {
        state = 'fault';
        lastResult = {
          valid: false,
          reason: (sample && sample.reason) || 'short-sample',
          durationMs: sample ? sample.durationMs : null,
          message: (sample && sample.message) ||
            'The analyser could not read that breath. Blow steadily until it beeps.',
        };
        return snapshot();
      }

      const bac = sample.bac;
      const pass = bac <= policy.limitBac;
      attempts += 1;

      lastResult = {
        valid: true,
        pass,
        bac,
        durationMs: sample.durationMs || null,
        overLegal: bac > policy.legalBac,
        at: now,
        attempt: attempts,
        deviceId: device ? device.id : null,
        message: pass
          ? 'Clear. Drive safe.'
          : bac > policy.legalBac
            ? 'Over the statutory limit. This reading has been logged.'
            : 'Above fleet policy. You may not take the wheel.',
      };
      history = history.concat(lastResult);

      if (pass) state = 'pass';
      else state = attempts >= policy.maxAttempts ? 'locked' : 'fail';

      return snapshot();
    },

    /** Back to `ready` after a failed reading or a device fault. */
    retry(now) {
      if (state !== 'fail' && state !== 'fault') return snapshot();
      phaseStart = now;
      state = 'ready';
      lastResult = null;
      return snapshot();
    },

    /** Operator or administrator override — the only way out of `locked`. */
    unlock(by) {
      if (state !== 'locked') return snapshot();
      state = 'ready';
      attempts = 0;
      history = history.concat({ valid: true, override: true, by, at: Date.now() });
      return snapshot();
    },

    reset() {
      state = 'idle';
      attempts = 0;
      lastResult = null;
      history = [];
      return snapshot();
    },
  };
}

/**
 * A stand-in for the BLE mouthpiece unit.
 *
 * The real adapter subscribes to the device's notify characteristic and calls
 * `onResult` with the same payload; the machine above cannot tell the two
 * apart. `readings` is consumed one per sample, so a demo can queue "two over,
 * then clear" and watch the lockout counter behave.
 */
export function createSimulatedAnalyser(options = {}) {
  const readings = (options.readings || [0]).slice();
  const delayMs = options.delayMs == null ? 4200 : options.delayMs;
  let i = 0;
  let timer = null;

  return {
    device: { id: 'sim-analyser', name: 'DrivoSafe AL-2 (sim)', battery: 0.86 },
    /** Host calls this when the machine enters `analysing`. */
    sample(onResult) {
      const next = readings[Math.min(i, readings.length - 1)];
      i += 1;
      const payload = typeof next === 'number'
        ? { bac: next, durationMs: 6200, valid: true }
        : next;
      timer = setTimeout(() => onResult(payload), delayMs);
      return () => { if (timer) clearTimeout(timer); timer = null; };
    },
    cancel() { if (timer) { clearTimeout(timer); timer = null; } },
  };
}

/* ------------------------------------------------------ face verification ---
 * The matcher compares one capture against the templates enrolled for the
 * candidate drivers. Real implementation is a cosine distance over 128-float
 * embeddings on-device (§8.2, §16.4); the shape of the answer is what the
 * screens are written against, so the swap is local.
 */
export function verifyFace(capture, candidates = [], options = {}) {
  const policy = { ...FACE_POLICY, ...options.policy };

  if (!capture || capture.frames < policy.minFrames) {
    return {
      status: 'poor-capture',
      matched: false,
      confidence: 0,
      message: 'Hold still and look at the camera — not enough usable frames.',
    };
  }
  if (capture.quality != null && capture.quality < 0.45) {
    return {
      status: 'poor-capture',
      matched: false,
      confidence: capture.quality,
      message: 'Too dark, or the lens is obstructed. Wipe the camera and try again.',
    };
  }

  const scored = candidates
    .map((c) => ({ ...c, confidence: scoreTemplate(capture, c) }))
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best || best.confidence < policy.reviewThreshold) {
    return {
      status: 'unknown-face',
      matched: false,
      confidence: best ? best.confidence : 0,
      ranked: scored,
      message: 'No enrolled driver matches this face. Register to take this vehicle out.',
    };
  }
  if (best.confidence < policy.matchThreshold) {
    return {
      status: 'review',
      matched: true,
      driverId: best.driverId,
      confidence: best.confidence,
      ranked: scored,
      message: 'Matched, but below the confidence floor — the depot has been asked to confirm.',
    };
  }
  return {
    status: 'matched',
    matched: true,
    driverId: best.driverId,
    confidence: best.confidence,
    ranked: scored,
    message: 'Identity confirmed.',
  };
}

/* Deterministic pseudo-similarity. A capture carries the template it was taken
 * from (the simulator's ground truth); matching templates score high, others
 * score low with a stable jitter so the ranking looks like a real matcher's. */
function scoreTemplate(capture, candidate) {
  const same = capture.template && candidate.template && capture.template === candidate.template;
  const jitter = (hash(String(capture.template) + candidate.driverId) % 900) / 10000; // 0–0.09
  const q = capture.quality == null ? 0.9 : capture.quality;
  if (same) return round3(Math.min(0.99, 0.80 + q * 0.18 - jitter * 0.4));
  return round3(Math.max(0.02, 0.18 + jitter * 2));
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/* ------------------------------------------------------- capture helper ---
 * What a host hands to `verifyFace` after running the front camera. The web
 * build fills this from a <video> frame, the tablet from the NIR pipeline; a
 * device with no camera passes `template: null` and lands in the DMS's
 * context-only degraded mode, which the gate treats as an unknown face.
 */
export function makeCapture({ template = null, quality = 0.9, frames = 8, at = Date.now() } = {}) {
  return { template, quality, frames, at };
}

/* --------------------------------------------------------- gate machine ---
 * Wraps the three stages into one object the screens can drive without
 * duplicating the ordering rules on each platform.
 */
export function createCheckinGate(initial = {}) {
  let step = initial.step || 'vehicle';
  let vehicle = initial.vehicle || null;   // { device, bus }
  let driver = initial.driver || null;     // { driverId, confidence, status }
  let alcohol = initial.alcohol || null;   // last breath snapshot
  let assignment = initial.assignment || null; // { busId, routeId }

  const snapshot = () => ({
    step,
    vehicle,
    driver,
    alcohol,
    assignment,
    index: CHECKIN_STEPS.indexOf(step),
    cleared: step === 'cleared',
    locked: !!(alcohol && alcohol.locked),
  });

  return {
    state: snapshot,
    confirmVehicle(v) {
      vehicle = v;
      if (step === 'vehicle') step = 'identity';
      return snapshot();
    },
    confirmDriver(d) {
      driver = d;
      if (step === 'identity') step = 'alcohol';
      return snapshot();
    },
    applyBreath(s) {
      alcohol = s;
      if (s && s.passed && step === 'alcohol') step = 'assignment';
      return snapshot();
    },
    confirmAssignment(a) {
      assignment = a;
      if (step === 'assignment') step = 'cleared';
      return snapshot();
    },
    back() {
      const i = CHECKIN_STEPS.indexOf(step);
      if (i > 0) step = CHECKIN_STEPS[i - 1];
      return snapshot();
    },
    reset() {
      step = 'vehicle';
      vehicle = null;
      driver = null;
      alcohol = null;
      assignment = null;
      return snapshot();
    },
  };
}
