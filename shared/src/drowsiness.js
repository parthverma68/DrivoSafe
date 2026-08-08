/* Driver Monitoring System — drowsiness fusion engine.
 * SYSTEM_DESIGN §8.  Pure JS: no React, no DOM, no camera API.
 *
 * The camera/inference stack (face detect -> 468-pt landmark mesh -> EAR/MAR/
 * head pose) lives behind the platform camera adapter and pushes per-frame
 * FEATURE SCALARS in here. No imagery ever reaches this module, which is the
 * point: the privacy boundary (§8.8) is the module boundary.
 *
 *   const dms = createDrowsinessMonitor({ hasCamera: true, onLevel });
 *   dms.calibrate(earSamples);                    // 90 s baseline, per driver
 *   dms.pushFrame({ ts, faceFound, ear, mar, pitch, yaw, roll });
 *   dms.pushContext({ timeOnTaskMin, localHour, laneVariance, ... });
 *   dms.tick(now) -> state                        // 1 Hz
 */

export const LEVELS = ['D0', 'D1', 'D2', 'D3', 'D4'];

export const LEVEL_META = {
  D0: { label: 'ALERT', kss: '1-3', tone: 'ok', priority: null, action: 'none' },
  D1: { label: 'EARLY SIGNS', kss: '4-5', tone: 'watch', priority: null, action: 'log only' },
  D2: { label: 'DROWSY', kss: '6', tone: 'warn', priority: 5, action: 'chime + rest stop' },
  D3: { label: 'IMPAIRED', kss: '7-8', tone: 'danger', priority: 2, action: 'voice + haptic + supervisor' },
  D4: { label: 'MICRO-SLEEP', kss: '9', tone: 'critical', priority: 0, action: 'alarm until acknowledged' },
};

/* Fusion weights. Shipped as remote config per fleet (§8.5) and stamped onto
 * every event so a historical event stays interpretable against the model that
 * produced it. Ocular and context groups are weighted separately so the
 * multi-signal rule below can reason about them independently. */
export const DEFAULT_WEIGHTS = {
  version: 'dms-w-1.0.0',
  ocular: {
    perclos: 3.2,        // the reference measure — dominates when available
    longBlinkRate: 1.5,  // micro-sleep precursor, rises before PERCLOS
    blinkP90: 1.0,
    yawnRate: 0.7,       // weak alone, useful in fusion
    nodEvents: 1.8,      // late-stage, high specificity
    poseTorpor: 0.8,     // FALLING head-pose entropy = fixation
  },
  context: {
    timeOnTask: 1.6,
    circadian: 1.4,
    laneVariance: 1.5,   // "weaving" — the classic behavioural signature
    speedVariance: 0.6,
    dutyLoad: 0.8,
  },
  bias: -3.4,
};

const WINDOW_MS = 60000;      // rolling ocular window
const ESCALATE_TICKS = 2;     // ~2 s to rise
const DEESCALATE_MS = 180000; // 3 min to fall (§8.5 asymmetry)
const CLOSURE_PERCLOS = 0.8;  // PERCLOS-80
const CLOSURE_BLINK = 0.5;
const LONG_BLINK_MS = 400;
const YAWN_MAR = 0.62;
const YAWN_SUSTAIN_MS = 1500;
const NOD_PITCH_DEG = 15;
const NOD_RETURN_MS = 2000;
const FACE_LOST_MS = 30000;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/* Circadian risk weight by local hour. Peaks in the 02:00-06:00 trough, with a
 * secondary post-lunch dip around 14:00-16:00. */
export function circadianFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  const night = Math.exp(-Math.pow(h - 4, 2) / 8);
  const wrap = Math.exp(-Math.pow(h - 28, 2) / 8);   // hours 23-24 wrapping to the trough
  const afternoon = 0.45 * Math.exp(-Math.pow(h - 15, 2) / 3);
  return clamp01(Math.max(night, wrap) + afternoon);
}

export function createDrowsinessMonitor(cfg) {
  cfg = cfg || {};
  const weights = Object.assign({}, DEFAULT_WEIGHTS, cfg.weights);
  const onLevel = cfg.onLevel || (() => {});
  const hasCamera = cfg.hasCamera !== false;

  let baseline = cfg.earBaseline || null;   // per-driver open-eye EAR (§8.3)
  let calSamples = [];
  let calibrating = hasCamera;

  const frames = [];            // rolling 60 s of feature scalars
  let ctx = {
    timeOnTaskMin: 0, localHour: 12, laneVariance: 0,
    speedVariance: 0, dutyHours24h: 0,
  };

  let level = 'D0';
  let raw = 'D0';               // pre-hysteresis candidate
  let pendingTicks = 0;
  let lowerSince = null;
  let lastFaceTs = null;
  let latched = false;          // D4 stays until acknowledged
  const events = [];

  /* ---- per-driver calibration (§8.3) ------------------------------------
   * EAR is strongly person-specific; absolute thresholds are a bug. The first
   * 90 s establishes this driver's open-eye baseline and every threshold below
   * is expressed relative to it. */
  function calibrate(earSamples) {
    calSamples = calSamples.concat(earSamples || []);
    if (calSamples.length >= 60) {
      const sorted = calSamples.slice().sort((a, b) => a - b);
      // 75th percentile ~= relaxed open eye, robust to blinks in the sample
      baseline = sorted[Math.floor(sorted.length * 0.75)];
      calibrating = false;
    }
    return { calibrating, baseline };
  }

  function pushFrame(f) {
    if (!hasCamera) return;
    if (calibrating) {
      if (f.faceFound && f.ear != null) calibrate([f.ear]);
      if (f.faceFound) lastFaceTs = f.ts;
      return;
    }
    if (f.faceFound) lastFaceTs = f.ts;
    const closure = baseline ? clamp01(1 - f.ear / baseline) : 0;
    frames.push({
      ts: f.ts, faceFound: !!f.faceFound, closure,
      mar: f.mar || 0, pitch: f.pitch || 0, yaw: f.yaw || 0,
      // vibration gating (§8.6): landmark stability degrades on rough road, so
      // the frame is down-weighted rather than trusted
      quality: f.vertG != null && f.vertG > 0.3 ? 0.4 : 1,
    });
    while (frames.length && f.ts - frames[0].ts > WINDOW_MS) frames.shift();
  }

  function pushContext(c) {
    ctx = Object.assign({}, ctx, c);
  }

  /* ---- ocular metrics over the rolling window (§8.3) --------------------- */
  function ocularMetrics(now) {
    const valid = frames.filter((f) => f.faceFound && f.quality > 0.5);
    if (valid.length < 15) return null;         // too few frames to infer
    const spanMin = Math.max(0.25, (now - valid[0].ts) / 60000);

    let closedN = 0;
    for (const f of valid) if (f.closure >= CLOSURE_PERCLOS) closedN++;
    const perclos = closedN / valid.length;

    // blink segmentation
    const blinks = [];
    let start = null;
    for (const f of valid) {
      if (f.closure >= CLOSURE_BLINK && start === null) start = f.ts;
      else if (f.closure < CLOSURE_BLINK && start !== null) {
        blinks.push(f.ts - start);
        start = null;
      }
    }
    const longBlinks = blinks.filter((d) => d > LONG_BLINK_MS).length;
    const sortedB = blinks.slice().sort((a, b) => a - b);
    const blinkP90 = sortedB.length ? sortedB[Math.floor(sortedB.length * 0.9)] : 0;

    // yawns: MAR high AND sustained — the sustain requirement is what rejects
    // speech and laughter (§8.6)
    let yawns = 0, yawnStart = null;
    for (const f of valid) {
      if (f.mar >= YAWN_MAR && yawnStart === null) yawnStart = f.ts;
      else if (f.mar < YAWN_MAR && yawnStart !== null) {
        if (f.ts - yawnStart >= YAWN_SUSTAIN_MS) yawns++;
        yawnStart = null;
      }
    }

    // nods: pitch drop with a return inside the window
    let nods = 0, nodStart = null;
    for (const f of valid) {
      if (f.pitch <= -NOD_PITCH_DEG && nodStart === null) nodStart = f.ts;
      else if (f.pitch > -NOD_PITCH_DEG && nodStart !== null) {
        if (f.ts - nodStart <= NOD_RETURN_MS) nods++;
        nodStart = null;
      }
    }

    // head-pose entropy: FALLING variance indicates fixation/torpor, so the
    // risk feature is the inverse
    const pitches = valid.map((f) => f.pitch);
    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const variance = pitches.reduce((a, b) => a + (b - mean) * (b - mean), 0) / pitches.length;
    const poseTorpor = clamp01(1 - variance / 6);

    return {
      perclos,
      longBlinkRate: longBlinks / spanMin,
      blinkP90,
      yawnRate: yawns / spanMin * 10,      // per 10 min
      nodEvents: nods,
      poseTorpor,
      sampleN: valid.length,
    };
  }

  /* ---- fusion (§8.5) ---------------------------------------------------- */
  function fuse(oc, now) {
    const cf = circadianFactor(ctx.localHour);
    const contextN = {
      // risk climbs sharply past 4 h continuous
      timeOnTask: clamp01((ctx.timeOnTaskMin - 120) / 180),
      circadian: cf,
      laneVariance: clamp01((ctx.laneVariance - 0.25) / 0.55),
      speedVariance: clamp01((ctx.speedVariance - 3) / 9),
      dutyLoad: clamp01((ctx.dutyHours24h - 6) / 6),
    };

    let z = weights.bias;
    let ocularZ = 0, contextZ = 0, elevated = 0;

    if (oc) {
      const ocularN = {
        perclos: clamp01((oc.perclos - 0.08) / 0.27),
        longBlinkRate: clamp01((oc.longBlinkRate - 1) / 7),
        blinkP90: clamp01((oc.blinkP90 - 250) / 400),
        yawnRate: clamp01(oc.yawnRate / 4),
        nodEvents: clamp01(oc.nodEvents / 3),
        poseTorpor: oc.poseTorpor,
      };
      for (const k in weights.ocular) {
        ocularZ += weights.ocular[k] * ocularN[k];
        if (ocularN[k] > 0.5) elevated++;
      }
      oc.normalised = ocularN;
    }
    for (const k in weights.context) {
      contextZ += weights.context[k] * contextN[k];
      if (contextN[k] > 0.5) elevated++;
    }

    // context-only mode carries no ocular evidence, so its context weight is
    // lifted to keep the score meaningful — but the level is capped at D2 below
    z += ocularZ + contextZ * (oc ? 1 : 1.6);

    const score = sigmoid(z);
    const kss = 1 + 8 * score;
    let candidate =
      kss >= 8.5 ? 'D4' : kss >= 7 ? 'D3' : kss >= 6 ? 'D2' : kss >= 4 ? 'D1' : 'D0';

    /* --- false-positive discipline (§8.6) -------------------------------- */
    // 1. never single-signal: nothing above D1 on one elevated metric
    if (elevated < 2 && LEVELS.indexOf(candidate) > 1) candidate = 'D1';
    // 2. D3+ requires ocular AND context agreement
    if (LEVELS.indexOf(candidate) >= 3) {
      const ocularAgrees = oc && ocularZ > 1.6;
      const contextAgrees = contextZ > 1.0;
      if (!(ocularAgrees && contextAgrees)) candidate = 'D2';
    }
    // 3. context-only mode caps at D2: behaviour alone does not justify an alarm
    if (!oc && LEVELS.indexOf(candidate) > 2) candidate = 'D2';

    return { candidate, score, kss, ocularZ, contextZ, contextN, elevated };
  }

  /* ---- 1 Hz tick -------------------------------------------------------- */
  function tick(now) {
    now = now == null ? Date.now() : now;
    const faceLost = hasCamera && lastFaceTs != null && now - lastFaceTs > FACE_LOST_MS;
    const cameraUsable = hasCamera && !calibrating && !faceLost;

    const oc = cameraUsable ? ocularMetrics(now) : null;
    const mode = oc ? 'full' : 'context-only';
    const f = fuse(oc, now);
    raw = f.candidate;

    /* Asymmetric hysteresis (§8.5): rise in ~2 s, fall over 3 min. Fatigue does
     * not resolve in ten seconds, and an alarm that oscillates gets ignored. */
    const cur = LEVELS.indexOf(level);
    const cand = LEVELS.indexOf(raw);
    if (cand > cur) {
      pendingTicks++;
      lowerSince = null;
      if (pendingTicks >= ESCALATE_TICKS) {
        level = raw;
        pendingTicks = 0;
        emit(now, f, oc, mode);
      }
    } else if (cand < cur) {
      pendingTicks = 0;
      if (latched && level === 'D4') {
        // D4 latches until explicitly acknowledged
      } else if (lowerSince === null) {
        lowerSince = now;
      } else if (now - lowerSince >= DEESCALATE_MS) {
        level = raw;
        lowerSince = null;
        emit(now, f, oc, mode);
      }
    } else {
      pendingTicks = 0;
      lowerSince = null;
    }

    if (level === 'D4') latched = true;

    return {
      level, raw, mode, calibrating, faceLost, baseline,
      kss: Math.round(f.kss * 10) / 10,
      score: f.score,
      latched,
      confidence: mode === 'full' ? (oc.sampleN >= 45 ? 'high' : 'med') : 'low',
      ocular: oc,
      context: f.contextN,
      elevated: f.elevated,
      timeOnTaskMin: ctx.timeOnTaskMin,
      weightsVersion: weights.version,
    };
  }

  /* FatigueEvent (§12.3) — scalars only, never imagery. */
  function emit(now, f, oc, mode) {
    const ev = {
      id: 'fe-' + now,
      timestamp: now,
      level,
      kss: Math.round(f.kss * 10) / 10,
      mode,
      features: {
        perclos: oc ? Math.round(oc.perclos * 1000) / 1000 : null,
        longBlinkRate: oc ? Math.round(oc.longBlinkRate * 10) / 10 : null,
        blinkP90: oc ? Math.round(oc.blinkP90) : null,
        yawnRate: oc ? Math.round(oc.yawnRate * 10) / 10 : null,
        nodEvents: oc ? oc.nodEvents : null,
        laneVariance: Math.round(ctx.laneVariance * 100) / 100,
        timeOnTaskMin: Math.round(ctx.timeOnTaskMin),
        circadianFactor: Math.round(circadianFactor(ctx.localHour) * 100) / 100,
      },
      weightsVersion: weights.version,
      acknowledgedAt: null,
    };
    events.push(ev);
    onLevel(level, ev);
  }

  function acknowledge(now) {
    latched = false;
    lowerSince = now == null ? Date.now() : now;
    const last = events[events.length - 1];
    if (last && !last.acknowledgedAt) last.acknowledgedAt = lowerSince;
  }

  /* A break resets time-on-task, which is the single strongest lever the
   * driver has over their own score. */
  function takeBreak() {
    ctx.timeOnTaskMin = 0;
    frames.length = 0;
    level = 'D0';
    latched = false;
    pendingTicks = 0;
    lowerSince = null;
  }

  return {
    calibrate, pushFrame, pushContext, tick, acknowledge, takeBreak,
    events, weights,
    isCalibrating: () => calibrating,
  };
}

/* ------------------------------------------------------------------------
 * Deterministic driver simulator.
 *
 * Stands in for the camera + landmark stack so the app is demonstrable without
 * hardware, and so the fusion engine can be exercised in tests. `fatigue` is a
 * 0..1 ground-truth dial; everything below is the observable consequence of it.
 * ---------------------------------------------------------------------- */
export function createDriverSimulator(seed) {
  let n = seed || 1;
  const rnd = () => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
  let blinkUntil = 0;
  let yawnUntil = 0;
  let nodUntil = 0;

  return function frameAt(ts, fatigue, earBaseline) {
    const base = earBaseline || 0.3;
    const f = clamp01(fatigue);

    // blink rate and duration both climb with fatigue
    const blinkChance = 0.012 + 0.05 * f;
    const blinkMs = 110 + 500 * f * f;
    if (ts > blinkUntil && rnd() < blinkChance) blinkUntil = ts + blinkMs;
    const blinking = ts < blinkUntil;

    if (ts > yawnUntil && rnd() < 0.0012 + 0.010 * f) yawnUntil = ts + 1800 + 1400 * rnd();
    const yawning = ts < yawnUntil;

    if (ts > nodUntil && f > 0.62 && rnd() < 0.006 * (f - 0.6) * 12) nodUntil = ts + 900;
    const nodding = ts < nodUntil;

    // droop: even between blinks the lid sits lower as fatigue advances
    const droop = 1 - 0.42 * f;
    const ear = blinking ? base * 0.12 : base * droop * (0.96 + 0.08 * rnd());
    const poseNoise = (1 - 0.7 * f) * 2.4;

    return {
      ts,
      faceFound: true,
      ear,
      mar: yawning ? 0.7 + 0.1 * rnd() : 0.16 + 0.05 * rnd(),
      pitch: (nodding ? -22 : 0) + (rnd() - 0.5) * poseNoise,
      yaw: (rnd() - 0.5) * poseNoise * 1.6,
      roll: (rnd() - 0.5) * poseNoise * 0.5,
    };
  };
}
