/* Corridor catalogue.
 *
 * In production these arrive as versioned corridor bundles from the Corridor
 * Service (SYSTEM_DESIGN §14.2) and are cached on device. Here they are seeded
 * locally so the app runs fully offline with no backend — which is exactly the
 * runtime posture the real device has anyway.
 */
import { createRoute } from 'react-road-hazards';

/* Synthesise a corridor centreline: a gentle S-curve east of the start point,
 * sampled every ~1/60th of its length. Real paths come from the mapper. */
function centreline(lat0, lng0, lengthM, bend) {
  const path = [];
  const degPerM = 1 / 111320;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    path.push({
      lat: lat0 + bend * Math.sin(t * Math.PI * 1.4) * degPerM * 1000,
      lng: lng0 + t * lengthM * degPerM / Math.cos(lat0 * Math.PI / 180),
    });
  }
  return path;
}

export const CORRIDOR_DEFS = [
  {
    id: 'nh52-indore-dewas',
    name: 'NH-52 Indore → Dewas',
    corridor: 'NH-52',
    version: 412,
    publishedAt: '2026-08-08T05:52:00Z',
    freshness: 'today 05:52',
    mappers: 3,
    status: 'live',
    length: 1700,
    lanes: 4,
    laneWidthM: 3.5,
    laneConfig: { overtaking: 'right', holdMeters: 120 },
    path: centreline(22.72, 75.85, 1700, 0.16),
    laneSections: [
      { from: 0, quality: [45, 74, 88, 81] },
      { from: 600, quality: [55, 86, 70, 84] },
      { from: 1100, quality: [52, 55, 58, 80] },
      { from: 1350, quality: [72, 90, 86, 83] },
    ],
    events: [
      { id: 'e1', type: 'pothole', at: 250, lane: 1, severity: 0.9, note: 'unmarked', confidence: 'high', verifiedAt: 'today 05:40' },
      { id: 'e2', type: 'speed-breaker', at: 380, slowTo: 30, note: 'unmarked', confidence: 'high', verifiedAt: 'today 05:40' },
      { id: 'e3', type: 'broken-road', at: 480, length: 60, lane: 0, confidence: 'high', verifiedAt: 'today 05:41' },
      { id: 'e4', type: 'rough-road', at: 640, length: 50, lane: 2, confidence: 'med', verifiedAt: 'yesterday' },
      { id: 'e5', type: 'accident', at: 800, lane: 1, severity: 1, note: 'vehicle cut in · external', confidence: 'med', verifiedAt: 'today 06:10' },
      { id: 'e6', type: 'diversion', at: 930, length: 80, confidence: 'high', verifiedAt: 'today 05:43' },
      { id: 'e7', type: 'school-area', at: 1090, length: 100, slowTo: 40, confidence: 'high', verifiedAt: 'today 05:44' },
      { id: 'e8', type: 'speed-limit', at: 1260, value: 30, length: 60, confidence: 'high', verifiedAt: 'today 05:44' },
      { id: 'e9', type: 'multiple-speed-breakers', at: 1470, length: 30, slowTo: 30, severity: 0.8, confidence: 'high', verifiedAt: 'today 05:45' },
    ],
    pois: [
      { type: 'petrol-pump', at: 550, side: 'right' },
      { type: 'rest-stop', at: 1000, side: 'left' },
      { type: 'mechanic', at: 1420, side: 'right' },
    ],
  },
  {
    id: 'sh27-bhopal-sehore',
    name: 'SH-27 Bhopal → Sehore',
    corridor: 'SH-27',
    version: 88,
    publishedAt: '2026-08-07T05:30:00Z',
    freshness: 'yesterday 05:30',
    mappers: 1,
    status: 'live',
    length: 1400,
    lanes: 2,
    laneWidthM: 3.5,
    laneConfig: { overtaking: null, holdMeters: 150 },
    path: centreline(23.25, 77.41, 1400, -0.22),
    laneSections: [
      { from: 0, quality: [68, 74] },
      { from: 500, quality: [52, 71] },
      { from: 980, quality: [61, 58] },
    ],
    events: [
      { id: 's1', type: 'undulation', at: 180, length: 40, severity: 0.5, confidence: 'med', verifiedAt: 'yesterday' },
      { id: 's2', type: 'pothole', at: 420, lane: 0, severity: 0.75, confidence: 'high', verifiedAt: 'yesterday' },
      { id: 's3', type: 'curve-road', at: 610, length: 70, slowTo: 40, confidence: 'high', verifiedAt: 'yesterday' },
      { id: 's4', type: 'crack-road', at: 860, length: 50, lane: 1, severity: 0.4, confidence: 'low', verifiedAt: '3 days ago' },
      { id: 's5', type: 'checkpost', at: 1120, slowTo: 20, confidence: 'manual', verifiedAt: 'manual entry' },
    ],
    pois: [
      { type: 'rest-stop', at: 700, side: 'right' },
      { type: 'petrol-pump', at: 1200, side: 'left' },
    ],
  },
];

const cache = new Map();

/** Materialise a corridor definition into the library's Route model. */
export function getRoute(id) {
  if (!cache.has(id)) {
    const def = CORRIDOR_DEFS.find((c) => c.id === id) || CORRIDOR_DEFS[0];
    cache.set(id, Object.assign(createRoute(def), { def }));
  }
  return cache.get(id);
}

/** Register a corridor authored in the Route Editor (session-scoped). */
export function registerCorridor(def) {
  const existing = CORRIDOR_DEFS.findIndex((c) => c.id === def.id);
  if (existing >= 0) CORRIDOR_DEFS[existing] = def;
  else CORRIDOR_DEFS.push(def);
  cache.delete(def.id);
  return getRoute(def.id);
}
