/* Vehicle telemetry: gear advisory + a simulator for OBD/IMU/camera.
 * SYSTEM_DESIGN §6.4, §11.1.
 *
 * On a real bus, `createVehicleSimulator` is replaced by the OBD-II and chassis
 * IMU adapters; the Telemetry shape it emits is the contract either way.
 */

/* ---- gear advisory (§6.4) ------------------------------------------------
 * Advises against the bus model's efficiency band. Suppressed entirely on
 * automatics — half a mixed fleet would otherwise learn to ignore the tile. */
export function gearAdvice(speedKmh, rpm, bus, slowTo) {
  if (!bus || bus.transmission === 'automatic') return { gear: null, advice: null, reason: 'automatic' };
  const band = bus.efficiencyBand || { rpmLow: 1200, rpmHigh: 1800 };
  const gear = estimateGear(speedKmh);
  let advice = null;
  if (slowTo != null && speedKmh > slowTo + 10) advice = 'DOWN';
  else if (rpm > band.rpmHigh) advice = 'UP';
  else if (rpm < band.rpmLow && speedKmh > 15) advice = 'DOWN';
  return {
    gear,
    advice,
    reason: advice === 'UP' ? 'engine above efficient band'
      : advice === 'DOWN' && slowTo != null ? 'slow-to zone ahead'
      : advice === 'DOWN' ? 'engine lugging below band'
      : 'in band',
    band,
  };
}

function estimateGear(kmh) {
  if (kmh < 8) return 1;
  if (kmh < 18) return 2;
  if (kmh < 30) return 3;
  if (kmh < 45) return 4;
  if (kmh < 62) return 5;
  return 6;
}

/* ---- vehicle simulator ---------------------------------------------------
 * Drives the bus along the corridor with a driver who mostly complies: slows
 * for advised zones, drifts toward the PRIMARY lane, occasionally brakes hard,
 * and takes an impact when crossing a hazard they failed to avoid.
 */
export function createVehicleSimulator(route, opts) {
  opts = opts || {};
  let progress = opts.startAt || 0;
  let speed = 52;
  let rpm = 1400;
  let lane = opts.startLane != null ? opts.startLane : 1;
  let laneFloat = lane;
  let n = opts.seed || 7;
  const rnd = () => { n = (n * 1664525 + 1013904223) % 4294967296; return n / 4294967296; };

  const recentLateral = [];
  const recentSpeed = [];

  function step(dtSec, advisory, nextEvent, compliant, weave) {
    // target speed: corridor cruise, reduced for an advised slow-to zone
    let target = opts.cruise || 58;
    if (nextEvent && nextEvent.slowTo != null) {
      const d = nextEvent.distance;
      if (d < 180) target = compliant ? nextEvent.slowTo : Math.max(nextEvent.slowTo, target - 8);
    }
    const dv = target - speed;
    speed += Math.max(-9 * dtSec, Math.min(6 * dtSec, dv * 0.9 * dtSec));
    speed = Math.max(0, speed + (rnd() - 0.5) * 0.9);

    const harshBrake = dv < -14 && rnd() < 0.06;
    if (harshBrake) speed = Math.max(0, speed - 6);
    const rash = rnd() < 0.004;

    progress += (speed / 3.6) * dtSec;

    // lane: drift toward the recommended lane when complying
    if (advisory && advisory.primary != null) {
      const want = compliant ? advisory.primary : lane;
      laneFloat += (want - laneFloat) * Math.min(1, dtSec * 0.5);
      // fatigued/weaving drivers wander laterally — this is what feeds the
      // DMS lane-variance context feature
      laneFloat += (rnd() - 0.5) * (weave != null ? weave : opts.weave || 0) * dtSec;
      lane = Math.max(0, Math.min(route.lanes - 1, Math.round(laneFloat)));
    }

    // vertical impact: only if we are actually in the hazard's lane
    let vertG = 0.04 + rnd() * 0.05;
    const here = route.eventsBetween(progress - 3, progress + 3);
    for (const ev of here) {
      const inLane = ev.lane == null || ev.lane === lane;
      if (!inLane) continue;
      const sev = ev.severity != null ? ev.severity : 0.6;
      const speedFactor = Math.pow(speed / 40, 2);   // impact ~ speed^2
      vertG = Math.max(vertG, 0.18 * sev * speedFactor + rnd() * 0.06);
    }

    rpm = Math.round(700 + (speed / (estimateGear(speed) * 11)) * 900 + (rnd() - 0.5) * 60);

    recentLateral.push(laneFloat - Math.round(laneFloat));
    if (recentLateral.length > 180) recentLateral.shift();
    recentSpeed.push(speed);
    if (recentSpeed.length > 180) recentSpeed.shift();

    return {
      progress, speed, rpm, lane, laneFloat, vertG, harshBrake, rash,
      laneVariance: stdev(recentLateral),
      speedVariance: stdev(recentSpeed),
    };
  }

  return {
    step,
    set: (p) => { progress = p; },
    get: () => ({ progress, speed, lane }),
  };
}

function stdev(a) {
  if (a.length < 4) return 0;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
}

/* ---- forward camera detections (§11.1) -----------------------------------
 * What the on-device YOLO-nano-class model would report. In production replace
 * with the model's output stream, smoothed ~0.25 lerp/frame before rendering.
 */
export function simulateDetections(m, laneCount, driverLane, frame) {
  const dets = [{
    id: 'cam-veh',
    type: 'vehicle',
    lane: (driverLane + 1) % laneCount,
    distance: 42 + 14 * Math.sin(m * 0.012),
    confidence: 0.88 + 0.06 * Math.sin(frame * 0.05),
  }];
  if (m > 1040 && m < 1200) {
    const halfW = (laneCount * 3.5) / 2;
    const walk = ((frame * 0.06) % (2 * halfW + 4)) - halfW - 2;
    dets.push({ id: 'cam-ped', type: 'pedestrian', lateral: walk, distance: 26, confidence: 0.78 });
  }
  // the stopped vehicle at the accident site: this detection is what verifies
  // the exoneration of e5 (§10.2)
  if (m > 730 && m < 806) {
    dets.push({
      id: 'cam-obs', type: 'obstacle', lane: 1,
      distance: Math.max(6, 800 - m), confidence: 0.83, label: 'STOPPED VEH',
    });
  }
  if (m > 400 && m < 470) {
    dets.push({
      id: 'cam-ani', type: 'animal', lane: 0,
      distance: 30 + 10 * Math.sin(frame * 0.08), confidence: 0.64,
    });
  }
  return dets;
}
