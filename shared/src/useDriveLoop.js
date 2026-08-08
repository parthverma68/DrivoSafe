/* The drive loop — SYSTEM_DESIGN §5.2.
 *
 * Invariant 1: this loop never blocks on I/O. Everything here is synchronous
 * local computation over the preloaded route plus buffered sensor state.
 * Invariant 2: advisory is a pure function of (route, progress).
 *
 * Cadences:
 *   10 Hz  telemetry step, compliance update, arbiter tick
 *    1 Hz  DMS fusion tick
 *    5 Hz  publish to React state (the HUD renders at 60 fps off refs, so
 *          state updates are decoupled from frame rate)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createComplianceTracker, getEventType } from 'react-road-hazards';
import { createVehicleSimulator, simulateDetections, gearAdvice } from './telemetry.js';
import { createDrowsinessMonitor, createDriverSimulator } from './drowsiness.js';
import { createAlertArbiter, P } from './alerts.js';

const TICK_MS = 100;      // 10 Hz
const PUBLISH_MS = 200;   // 5 Hz

export function useDriveLoop({
  route, bus, driver, running, timeScale, fatigueDial, compliant, localHour,
  /* Output adapters, injected rather than imported. This hook is shared
   * verbatim between the web and React Native builds, so it must not know
   * which one it is running in: web passes SpeechSynthesis + WebAudio +
   * navigator.vibrate, native passes expo-speech + expo-av + expo-haptics. */
  platform,
}) {
  const io = platform || {};
  const [published, setPublished] = useState(() => emptyState());
  const [celebrate, setCelebrate] = useState(null);

  const refs = useRef(null);
  const cfg = useRef({});
  cfg.current = { running, timeScale, fatigueDial, compliant, localHour };

  /* Rebuild the whole runtime when the corridor or driver changes — a new
   * corridor is a new trip, and carrying compliance state across would be wrong. */
  const runtime = useMemo(() => {
    const arbiter = createAlertArbiter({
      speak: (t, p) => io.speak && io.speak(t, p),
      chime: (p) => io.chime && io.chime(p),
      haptic: (p) => io.haptic && io.haptic(p),
    });
    const dms = createDrowsinessMonitor({
      hasCamera: bus ? bus.dmsCamera !== false : true,
      earBaseline: driver ? driver.earBaseline : null,
      onLevel: (level, ev) => { pendingFatigue.current.push({ level, ev }); },
    });
    const tracker = createComplianceTracker(route, {
      onResult: (r) => { pendingResults.current.push(r); },
    });
    return {
      arbiter, dms, tracker,
      vehicle: createVehicleSimulator(route, { weave: 0, seed: 11 }),
      driverSim: createDriverSimulator(3),
      startedAt: Date.now(),
    };
  }, [route, bus, driver]);

  const pendingResults = useRef([]);
  const pendingFatigue = useRef([]);
  const driveInfoRef = useRef(null);
  const frameRef = useRef(0);

  if (!refs.current || refs.current.route !== route) {
    refs.current = {
      route,
      progress: 0,
      speed: 0,
      rpm: 800,
      lane: 1,
      laneFloat: 1,
      vertG: 0,
      laneVariance: 0,
      speedVariance: 0,
      tripMs: 0,
      breakAt: 0,
      /* The DMS runs on its own monotonic clock. Frames must be strictly
       * increasing in time or blink segmentation and the rolling window both
       * break — and a broken window reads as a false PERCLOS. */
      camClock: Date.now(),
      offRoute: false,
      results: [],
      fatigueEvents: [],
      lastEventSpoken: null,
      lastPolicy: null,
    };
  }

  /** The HUD reports its computed advisory back every frame; we buffer it in a
   *  ref so a 60 fps callback never causes a 60 fps React render. */
  const onDriveInfo = useCallback((d) => {
    driveInfoRef.current = d;
    frameRef.current++;
  }, []);

  useEffect(() => {
    let lastTick = performance.now();
    let dmsAccum = 0;

    const iv = setInterval(() => {
      const now = performance.now();
      const wall = Date.now();
      const realDt = Math.min(0.5, (now - lastTick) / 1000);
      lastTick = now;
      const c = cfg.current;
      if (!c.running) { runtime.arbiter.tick(wall); return; }

      const dt = realDt * (c.timeScale || 1);
      const S = refs.current;
      S.tripMs += dt * 1000;

      const info = driveInfoRef.current;
      const advisory = info && info.advisory ? info.advisory : null;
      const nextEvent = info && info.nextEvent
        ? { slowTo: info.slowTo, distance: info.distance, event: info.nextEvent }
        : null;

      /* --- vehicle / telemetry ------------------------------------------- */
      const weave = 0.15 + 1.5 * Math.max(0, (c.fatigueDial || 0) - 0.35);
      const t = runtime.vehicle.step(
        dt,
        advisory,
        nextEvent && nextEvent.slowTo != null
          ? { slowTo: nextEvent.slowTo, distance: nextEvent.distance }
          : null,
        c.compliant,
        weave
      );
      S.progress = t.progress;
      S.speed = t.speed;
      S.rpm = t.rpm;
      S.lane = t.lane;
      S.laneFloat = t.laneFloat;
      S.vertG = t.vertG;
      S.laneVariance = t.laneVariance + weave * 0.18;
      S.speedVariance = t.speedVariance;

      if (S.progress >= route.length) {
        S.progress = route.length;
        cfg.current.running = false;
      }

      /* --- compliance (§10) ---------------------------------------------- */
      // a live 'STOPPED VEH' detection at the accident site is what exonerates
      // that event — the forward camera's real job (§10.2)
      const dets = simulateDetections(S.progress, route.lanes, S.lane, frameRef.current);
      const externalIds = dets.some((d) => d.label === 'STOPPED VEH') ? ['e5'] : [];
      runtime.tracker.update({
        progress: S.progress,
        speed: S.speed,
        lane: S.lane,
        vertG: S.vertG,
        harshBrake: t.harshBrake,
        rash: t.rash,
        externalIds,
      });

      /* --- DMS at 1 Hz (§8) ---------------------------------------------- */
      // camera frames arrive at 15 fps on a monotonic clock advancing with
      // simulated time
      const fatigueTruth = Math.min(1, (c.fatigueDial || 0));
      const nFrames = Math.max(1, Math.round(15 * dt));
      const gapMs = (dt * 1000) / nFrames;
      const base = driver && driver.earBaseline ? driver.earBaseline : 0.3;
      for (let i = 0; i < nFrames; i++) {
        S.camClock += gapMs;
        runtime.dms.pushFrame(runtime.driverSim(S.camClock, fatigueTruth, base));
      }
      dmsAccum += dt;
      let dmsState = refs.current.dms;
      if (dmsAccum >= 1) {
        dmsAccum = 0;
        const timeOnTaskMin = (S.tripMs - S.breakAt) / 60000;
        runtime.dms.pushContext({
          timeOnTaskMin,
          localHour: c.localHour != null ? c.localHour : new Date().getHours(),
          laneVariance: S.laneVariance,
          speedVariance: S.speedVariance,
          dutyHours24h: 6.5 + timeOnTaskMin / 60,
        });
        dmsState = runtime.dms.tick(S.camClock);
        refs.current.dms = dmsState;
        runtime.arbiter.setSuppression({ drowsyLevel: dmsState.level });
      }

      /* --- alert posting -------------------------------------------------- */
      postAlerts(runtime.arbiter, S, info, dmsState, wall);
      runtime.arbiter.tick(wall);
    }, TICK_MS);

    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, route, driver]);

  /* --- publish to React at 5 Hz ---------------------------------------- */
  useEffect(() => {
    const iv = setInterval(() => {
      const S = refs.current;
      const info = driveInfoRef.current;

      while (pendingResults.current.length) {
        const r = pendingResults.current.shift();
        S.results.push(r);
        if (r.celebrate) setCelebrate({ id: r.id, text: r.name + ' HANDLED' });
      }
      while (pendingFatigue.current.length) {
        S.fatigueEvents.push(pendingFatigue.current.shift().ev);
      }

      const score = runtime.tracker.score();
      const dms = S.dms || emptyState().drowsiness;
      setPublished({
        progress: S.progress,
        speed: Math.round(S.speed),
        rpm: S.rpm,
        lane: S.lane,
        vertG: S.vertG,
        tripMin: S.tripMs / 60000,
        timeOnTaskMin: (S.tripMs - S.breakAt) / 60000,
        offRoute: S.offRoute,
        driveInfo: info,
        advisory: info ? info.advisory : null,
        detections: simulateDetections(S.progress, route.lanes, S.lane, frameRef.current),
        gear: gearAdvice(S.speed, S.rpm, bus, info ? info.slowTo : null),
        compliance: score,
        results: S.results.slice(-6).reverse(),
        drowsiness: dms,
        fatigueEvents: S.fatigueEvents.slice(-20).reverse(),
        alert: runtime.arbiter.current(),
        alertStats: runtime.arbiter.stats(),
        rqi: rqiFor(score, route, S),
      });
    }, PUBLISH_MS);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, route, bus]);

  const acknowledgeFatigue = useCallback(() => {
    runtime.dms.acknowledge(Date.now());
  }, [runtime]);

  const takeBreak = useCallback(() => {
    runtime.dms.takeBreak();
    refs.current.breakAt = refs.current.tripMs;
  }, [runtime]);

  const seek = useCallback((m) => {
    refs.current.progress = m;
    runtime.vehicle.set(m);
  }, [runtime]);

  return {
    state: published,
    celebrate,
    onDriveInfo,
    actions: { acknowledgeFatigue, takeBreak, seek },
  };
}

/* --- alert composition (§9) ---------------------------------------------- */
function postAlerts(arbiter, S, info, dms, now) {
  if (!info) return;

  const ev = info.nextEvent;
  const dist = info.distance;
  const T = ev ? getEventType(ev.type) : null;
  arbiter.setSuppression({ hazardActive: !!(ev && dist != null && dist < 100) });

  if (ev && dist != null) {
    // three utterances per event, no more: acquire, mid, imminent (§9.3 rule 3)
    const bucket = dist < 100 ? 'now' : dist < 350 ? 'mid' : dist < 800 ? 'acquire' : null;
    if (bucket) {
      const stamp = ev.id + ':' + bucket;
      if (S.lastEventSpoken !== stamp) {
        S.lastEventSpoken = stamp;
        const slow = info.slowTo != null ? `, slow to ${info.slowTo}` : '';
        arbiter.post({
          priority: bucket === 'now' ? P.IMMINENT : P.HAZARD,
          text: bucket === 'now'
            ? `${T.name} now${slow}`
            : `${T.name} in ${Math.round(dist / 10) * 10} metres${slow}`,
          dedupeKey: stamp,
          exemptDedupe: true,
          holdMs: 4000,
        });
      }
    }
  }

  if (info.policyText && info.policyText !== S.lastPolicy) {
    S.lastPolicy = info.policyText;
    arbiter.post({
      priority: P.LANE,
      text: info.policyText.replace(/·/g, ','),
      dedupeKey: 'policy:' + info.policyText,
      holdMs: 3500,
    });
  }

  if (dms) {
    if (dms.level === 'D4') {
      arbiter.post({
        priority: P.SAFETY,
        text: 'Micro-sleep detected. Pull over safely now.',
        dedupeKey: 'dms:D4',
        exemptDedupe: true,
        holdMs: 8000,
      });
    } else if (dms.level === 'D3') {
      arbiter.post({
        priority: P.DROWSY_HIGH,
        text: 'You are showing strong signs of fatigue. Take a break at the next rest stop.',
        dedupeKey: 'dms:D3',
        holdMs: 6000,
      });
    } else if (dms.level === 'D2') {
      arbiter.post({
        priority: P.DROWSY_LOW,
        text: 'Fatigue detected. Rest stop ahead.',
        dedupeKey: 'dms:D2',
        holdMs: 5000,
      });
    }
  }
}

function rqiFor(score, route, S) {
  const q = route.laneQualityAt(S.progress) || [75];
  const roadQuality = q.reduce((a, b) => a + b, 0) / q.length;
  const driverBehaviour = score.score;
  const vehicleDynamics = Math.max(0, 100 - S.vertG * 160);
  const routeEvents = Math.max(0, 100 - route.events.length * 3);
  return {
    score: Math.round(
      roadQuality * 0.35 + driverBehaviour * 0.30 + vehicleDynamics * 0.20 + routeEvents * 0.15
    ),
    roadQuality: Math.round(roadQuality),
    driverBehaviour: Math.round(driverBehaviour),
    vehicleDynamics: Math.round(vehicleDynamics),
    routeEvents: Math.round(routeEvents),
  };
}

function emptyState() {
  return {
    progress: 0, speed: 0, rpm: 800, lane: 1, vertG: 0,
    tripMin: 0, timeOnTaskMin: 0, offRoute: false,
    driveInfo: null, advisory: null, detections: [],
    gear: { gear: null, advice: null, reason: '' },
    compliance: { score: 100, counted: 0, excluded: 0, passed: 0, demerits: 0, behaviour: { harshBrakes: 0, rash: 0, overspeedPct: 0 } },
    results: [],
    drowsiness: { level: 'D0', kss: 1, mode: 'full', calibrating: true, confidence: 'low', ocular: null, context: null, elevated: 0, timeOnTaskMin: 0 },
    fatigueEvents: [],
    alert: null,
    alertStats: { queued: 0, dropped: 0, spokenLast5min: 0 },
    rqi: { score: 0, roadQuality: 0, driverBehaviour: 0, vehicleDynamics: 0, routeEvents: 0 },
  };
}
