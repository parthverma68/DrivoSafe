/* Live fleet feed — what the operator and admin consoles watch.
 *
 * In production this is the Telemetry Service's fan-out: every tablet posts a
 * 1 Hz heartbeat (position, speed, compliance, DMS level, camera health) and
 * the console subscribes to its tenant's slice (SYSTEM_DESIGN §14.3). Here the
 * same records are synthesised on the client so the consoles are fully alive
 * with no backend — and the shape is the one the socket will deliver, so the
 * screens do not change when it does.
 *
 * Everything is a pure function of (busId, epoch seconds). Two consoles opened
 * side by side show the same bus in the same place; a reload does not teleport
 * anything; and a test can assert on any instant it likes.
 */
import { BUSES, DRIVERS, OPERATORS, byId, assignmentFor } from './fleet.js';
import { CORRIDOR_DEFS } from './corridors.js';
import { LEVEL_META } from './drowsiness.js';

/* Deterministic 32-bit hash → the per-bus phase offset. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* Stable pseudo-noise in [0,1) for a (key, bucket) pair. */
const noise = (key, bucket) => (hash(`${key}:${Math.floor(bucket)}`) % 10000) / 10000;

/* Smooth 0–1 wave from a hashed phase — used for speed, load, temperature and
 * everything else that should drift rather than jump between polls. */
function wave(key, t, periodS) {
  const phase = (hash(key) % 1000) / 1000;
  return 0.5 + 0.5 * Math.sin(2 * Math.PI * (t / periodS + phase));
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round = (v, p = 0) => { const m = Math.pow(10, p); return Math.round(v * m) / m; };

/** Interpolate a lat/lng and a heading at fraction `f` along a corridor path. */
export function pointAlong(path, f) {
  if (!path || path.length === 0) return { lat: 0, lng: 0, heading: 0 };
  if (path.length === 1) return { ...path[0], heading: 0 };
  const x = clamp(f, 0, 1) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(x));
  const t = x - i;
  const a = path[i];
  const b = path[i + 1];
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  const heading = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
  return { lat, lng, heading: (heading + 360) % 360 };
}

const STATUS_META = {
  'on-route': { label: 'On route', tone: 'ok' },
  idling: { label: 'Idling', tone: 'watch' },
  depot: { label: 'At depot', tone: 'neutral' },
  alert: { label: 'Needs attention', tone: 'danger' },
  offline: { label: 'Offline', tone: 'neutral' },
};

export { STATUS_META };

/* Buses that are deliberately not moving, so the console has something other
 * than a row of identical green pills. Keyed by bus so it stays stable. */
const PARKED = { 'bus-3': 'depot', 'bus-8': 'idling' };

/**
 * One bus's live record at time `at` (ms epoch).
 *
 * `tempo` compresses the clock so a demo shows a corridor being covered in a
 * minute rather than an hour. Real telemetry runs at tempo 1.
 */
export function busTelemetry(busId, at = Date.now(), tempo = 30) {
  const bus = byId(BUSES, busId);
  if (!bus) return null;

  const t = (at / 1000) * tempo;
  const corridor = CORRIDOR_DEFS.find((c) => c.id === bus.routeId) || CORRIDOR_DEFS[0];
  const assign = assignmentFor(busId);
  const driver = assign ? byId(DRIVERS, assign.driverId) : null;
  const operator = byId(OPERATORS, bus.operatorId);

  const parked = PARKED[busId];
  const lapS = 900 + (hash(busId) % 300);                  // per-bus lap length
  const f = parked ? (hash(busId) % 700) / 1000 : ((t / lapS) + (hash(busId) % 1000) / 1000) % 1;

  const pos = pointAlong(corridor.path, f);
  const progressM = Math.round(f * corridor.length);
  const remainingM = corridor.length - progressM;

  /* Speed: a drifting cruise, dropped to zero when parked and pulled down in
   * the last 8 % of the corridor as the vehicle runs into its terminus. */
  const cruise = 38 + wave(busId + ':spd', t, 120) * 32;
  const arriving = f > 0.92 ? (1 - f) / 0.08 : 1;
  const speedKph = parked === 'depot' ? 0 : parked === 'idling' ? round(wave(busId, t, 60) * 4, 1) : round(cruise * arriving, 1);

  /* Compliance and fatigue drift around the driver's own baseline, so a Watch
   * driver reads worse than a Gold one without any special-casing. */
  const base = driver ? driver.adherence : 84;
  const complianceScore = Math.round(clamp(base + (wave(busId + ':cmp', t, 240) - 0.5) * 14, 40, 100));

  const dutyH = assign ? assign.dutyHours24h : 4;
  const hour = new Date(at).getHours();
  const circadian = hour >= 1 && hour <= 6 ? 0.85 : hour >= 13 && hour <= 16 ? 0.4 : 0.15;
  const fatigueScore = clamp(
    (dutyH / 11) * 0.5 + circadian * 0.3 + wave(busId + ':ftg', t, 600) * 0.3 - (driver ? driver.captainScore : 80) / 500,
    0, 1
  );
  const level = fatigueScore > 0.82 ? 'D4' : fatigueScore > 0.66 ? 'D3' : fatigueScore > 0.48 ? 'D2' : fatigueScore > 0.3 ? 'D1' : 'D0';
  const meta = LEVEL_META[level];

  const harshEvents = Math.floor(noise(busId + ':harsh', t / 300) * (driver ? driver.harshEvents / 3 : 3));

  let status = parked || 'on-route';
  if (!parked && (level === 'D3' || level === 'D4' || complianceScore < 60)) status = 'alert';

  const cameraOnline = bus.dmsCamera && noise(busId + ':cam', t / 3600) > 0.06;
  const clipAgeS = Math.floor(noise(busId + ':clip', t / 60) * 40);

  return {
    busId,
    bus,
    operatorId: bus.operatorId,
    operator,
    driverId: driver ? driver.id : null,
    driver,
    shiftStart: assign ? assign.startedAt : null,
    dutyHours24h: dutyH,

    status,
    statusMeta: STATUS_META[status],

    corridorId: corridor.id,
    corridorName: corridor.name,
    progress: f,
    progressM,
    remainingKm: round(remainingM / 1000, 1),
    lat: round(pos.lat, 5),
    lng: round(pos.lng, 5),
    heading: Math.round(pos.heading),

    speedKph,
    lane: 1 + Math.floor(noise(busId + ':lane', t / 45) * corridor.lanes),
    lanes: corridor.lanes,
    etaMin: speedKph > 3 ? Math.round((remainingM / 1000) / speedKph * 60) : null,

    complianceScore,
    fatigue: { score: round(fatigueScore, 2), level, label: meta.label, tone: meta.tone, kss: meta.kss },
    harshEvents,

    fuelPct: Math.round(clamp(92 - f * 34 + wave(busId + ':fuel', t, 3000) * 6, 8, 100)),
    coolantC: Math.round(74 + wave(busId + ':temp', t, 420) * 18),
    rpm: parked ? 0 : Math.round(900 + wave(busId + ':rpm', t, 40) * 1100),
    /* Lifetime distance: a stable per-vehicle base plus the distance covered
     * on this corridor. Deriving it from the clock instead would make the
     * reading climb into the billions within a session. */
    odometerKm: 148000 + (hash(busId) % 90000) + Math.round(progressM / 1000),

    cabin: {
      cameraOnline,
      clipAvailable: cameraOnline && bus.cabinCamera,
      lastFrameAgeS: clipAgeS,
      driverSnapshotAgeS: cameraOnline ? Math.floor(noise(busId + ':snap', t / 30) * 25) : null,
    },

    linkQuality: round(clamp(0.55 + wave(busId + ':link', t, 200) * 0.45, 0, 1), 2),
    lastSyncS: Math.floor(noise(busId + ':sync', t / 20) * 12),
    at,
  };
}

/** The whole live board, optionally narrowed to one operator's tenancy. */
export function fleetSnapshot({ operatorId = null, at = Date.now(), tempo = 30 } = {}) {
  return BUSES
    .filter((b) => !operatorId || b.operatorId === operatorId)
    .map((b) => busTelemetry(b.id, at, tempo))
    .filter(Boolean);
}

/** Board-level roll-up for the KPI strip. */
export function fleetSummary(records) {
  const n = records.length || 1;
  const moving = records.filter((r) => r.speedKph > 3);
  return {
    total: records.length,
    onRoute: records.filter((r) => r.status === 'on-route').length,
    alerts: records.filter((r) => r.status === 'alert').length,
    idle: records.filter((r) => r.status === 'idling' || r.status === 'depot').length,
    avgSpeed: Math.round(moving.reduce((a, r) => a + r.speedKph, 0) / (moving.length || 1)),
    avgCompliance: Math.round(records.reduce((a, r) => a + r.complianceScore, 0) / n),
    fatigueWatch: records.filter((r) => r.fatigue.level === 'D2' || r.fatigue.level === 'D3' || r.fatigue.level === 'D4').length,
    camerasDown: records.filter((r) => !r.cabin.cameraOnline).length,
    distanceCoveredKm: Math.round(records.reduce((a, r) => a + r.progressM, 0) / 1000),
  };
}

/* --------------------------------------------------------- cabin video ---
 * A clip is not streamed on demand — it is *requested*, and the tablet uploads
 * the last N seconds when it next has bandwidth (§16.3: the cabin camera is
 * never a live window an operator can leave open). This models that latency,
 * and every request is an audited record with a stated reason.
 */
export function requestCabinClip({ busId, seconds = 20, reason = 'routine check', by }) {
  const uploadMs = 2200 + (hash(busId) % 1800);
  return {
    id: `clip-${busId}-${Date.now().toString(36)}`,
    busId,
    seconds,
    reason,
    requestedBy: by || 'console',
    requestedAt: Date.now(),
    readyAt: Date.now() + uploadMs,
    uploadMs,
    state: 'uploading',
  };
}

export function clipState(clip, now = Date.now()) {
  if (!clip) return null;
  if (now >= clip.readyAt) return { ...clip, state: 'ready', progress: 1 };
  return { ...clip, state: 'uploading', progress: clamp((now - clip.requestedAt) / clip.uploadMs, 0, 1) };
}
