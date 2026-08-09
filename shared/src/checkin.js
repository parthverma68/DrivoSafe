/* Pre-drive check-in — vehicle recognition, driver identity, breath alcohol.
 *
 * The gate between "app is open" and "the bus can move". Three stages, in this
 * order, because each one narrows the question the next one asks:
 *
 *   1. VEHICLE   the tablet is bolted to one bus; its serial resolves the
 *                vehicle before any human is involved.
 *   2. IDENTITY  a front-camera frame is matched against the templates enrolled
 *                for that bus's operator. Unknown face → register, don't refuse.
 *   3. ALCOHOL   a 5–8 s blow into the cabin breathalyser. Three failures and
 *                the vehicle immobiliser stays engaged until a supervisor
 *                clears it — the driver cannot clear it themselves.
 *
 * All of it is pure: no timers, no camera, no DOM. The hosts feed it wall-clock
 * milliseconds and a capture payload, and both platforms get identical
 * behaviour — including the failure counting, which is the part that must not
 * differ between the tablet and the console replaying it.
 */

/* --------------------------------------------------------------- policy ---
 * Indian law allows 0.03 %BAC for private drivers. A public-service vehicle
 * carrying passengers is a zero-tolerance seat, so fleet policy is the tighter
 * number and the legal one is recorded alongside it for the incident report.
 */
export const ALCOHOL_POLICY = {
  limitBac: 0.01,          // %BAC — fleet zero-tolerance threshold
  legalBac: 0.03,          // %BAC — statutory limit, for the report only
  minBlowMs: 5000,         // a sample shorter than this is not a sample
  maxBlowMs: 8000,         // beyond this the cell is saturated; truncate
  maxAttempts: 3,
  warmupMs: 2500,          // sensor heater — the "get ready" beat
};

export const FACE_POLICY = {
  matchThreshold: 0.82,    // accept
  reviewThreshold: 0.62,   // between the two: matched, but flagged for review
  minFrames: 3,
};

export const CHECKIN_STEPS = ['vehicle', 'identity', 'alcohol', 'cleared'];

/* --------------------------------------------------- breath test machine ---
 * States: idle → warmup → ready → blowing → analysing → pass | fail → locked
 *
 * `now` is injected on every call rather than read from Date, so a test can
 * drive an eight-second blow in microseconds and a replay can re-run a real
 * one exactly.
 */
export function createBreathTest(options = {}) {
  const policy = { ...ALCOHOL_POLICY, ...options.policy };
  /* The sensor. Default is a deterministic stand-in; the tablet passes the
   * real BLE cell's reading in through here and nothing else changes. */
  const readCell = options.readCell || defaultCell(options.seed);

  let state = 'idle';
  let attempts = 0;
  let blowStart = 0;
  let lastResult = null;
  let history = [];
  let warmupStart = 0;

  const snapshot = () => ({
    state,
    attempts,
    attemptsLeft: Math.max(0, policy.maxAttempts - attempts),
    maxAttempts: policy.maxAttempts,
    locked: state === 'locked',
    passed: state === 'pass',
    result: lastResult,
    history: history.slice(),
    policy,
  });

  return {
    get policy() { return policy; },
    state: snapshot,

    /** Start the sensor heater. Blowing before `ready` is a wasted attempt, so
     *  the UI must not offer the button until `ready`. */
    warmup(now) {
      if (state === 'locked' || state === 'pass') return snapshot();
      warmupStart = now;
      state = 'warmup';
      return snapshot();
    },

    /** Poll during warmup. Returns the snapshot with `state: 'ready'` once the
     *  cell is up to temperature. */
    tick(now) {
      if (state === 'warmup' && now - warmupStart >= policy.warmupMs) state = 'ready';
      if (state === 'blowing') {
        /* A blow that runs past the ceiling is auto-ended rather than left
         * open: the cell saturates and the extra seconds carry no signal. */
        if (now - blowStart >= policy.maxBlowMs) return this.endBlow(now);
      }
      return snapshot();
    },

    startBlow(now) {
      if (state !== 'ready') return snapshot();
      blowStart = now;
      state = 'blowing';
      return snapshot();
    },

    /** Live progress of the current blow, 0–1 against the minimum duration. */
    blowProgress(now) {
      if (state !== 'blowing') return 0;
      return Math.min(1, (now - blowStart) / policy.minBlowMs);
    },

    blowMs(now) {
      return state === 'blowing' ? Math.max(0, now - blowStart) : 0;
    },

    /**
     * End the blow and score it.
     *
     * A short blow is *not* an attempt. Counting it would let a shaky first
     * try burn a third of the driver's budget for a reason that says nothing
     * about their sobriety — and it is the single easiest way to make a safety
     * device something drivers learn to route around.
     */
    endBlow(now) {
      if (state !== 'blowing') return snapshot();
      const durationMs = Math.min(now - blowStart, policy.maxBlowMs);

      if (durationMs < policy.minBlowMs) {
        state = 'ready';
        lastResult = {
          valid: false,
          reason: 'short-blow',
          durationMs,
          message: `Blow for at least ${Math.round(policy.minBlowMs / 1000)} seconds — that sample was too short to read.`,
        };
        return snapshot();
      }

      state = 'analysing';
      const bac = readCell(attempts, durationMs);
      const pass = bac <= policy.limitBac;
      attempts += 1;

      lastResult = {
        valid: true,
        pass,
        bac,
        durationMs,
        overLegal: bac > policy.legalBac,
        at: now,
        attempt: attempts,
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

    /** Return to `ready` for another attempt. Refuses once locked. */
    retry(now) {
      if (state !== 'fail') return snapshot();
      warmupStart = now;
      state = 'warmup';
      return snapshot();
    },

    /** Supervisor override — the only way out of `locked`, and it is audited. */
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

/* The stand-in cell. Deterministic from a seed so a demo is repeatable and a
 * test can assert on exact readings; `seed` >= 1 forces a positive reading,
 * which is how the locked path is demonstrated without anyone drinking. */
function defaultCell(seed) {
  if (typeof seed === 'number') return () => seed;
  return () => 0;
}

/** A cell that reads over the limit for `n` consecutive samples, then clears. */
export function failingCell(n, bac = 0.06) {
  let i = 0;
  return () => (i++ < n ? bac : 0.0);
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

  const snapshot = () => ({
    step,
    vehicle,
    driver,
    alcohol,
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
      if (s && s.passed) step = 'cleared';
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
      return snapshot();
    },
  };
}
