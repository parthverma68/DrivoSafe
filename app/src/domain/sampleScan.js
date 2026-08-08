/* A synthetic mapper scan, in the exact GeoJSON shape the hero system uploads
 * to Scan Ingest (SYSTEM_DESIGN §11.3, §14.1).
 *
 * Detections deliberately include: repeat observations of the same physical
 * defect across passes (so fusion has something to collapse and confidence has
 * something to be earned from), and a GPS glitch 200 m off-corridor (so the
 * rejection path is visible in the editor).
 */
import { buildPath } from 'react-road-hazards';

export function makeSampleScan() {
  const coords = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    coords.push([
      75.85 + t * 0.01585,
      22.72 + 0.0016 * Math.sin(t * Math.PI * 1.4),
    ]);
  }
  const bp = buildPath(coords.map((c) => ({ lat: c[1], lng: c[0] })));

  /* place a point at chainage `m`, `lateral` metres right of the centreline */
  const pt = (m, lateral) => {
    let seg = 0;
    while (seg < bp.cum.length - 2 && bp.cum[seg + 1] < m) seg++;
    const t = (m - bp.cum[seg]) / (bp.cum[seg + 1] - bp.cum[seg] || 1);
    const a = { lat: coords[seg][1], lng: coords[seg][0] };
    const b = { lat: coords[seg + 1][1], lng: coords[seg + 1][0] };
    let dx = (b.lng - a.lng) * bp.kx;
    let dy = (b.lat - a.lat) * bp.ky;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    return [
      a.lng + t * (b.lng - a.lng) + (dy * lateral) / bp.kx,
      a.lat + t * (b.lat - a.lat) + (-dx * lateral) / bp.ky,
    ];
  };

  const F = (m, lateral, props) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: pt(m, lateral) },
    properties: props,
  });

  const route = {
    type: 'Feature',
    properties: { name: 'NH-52 corridor scan', mapper: 'bus-3', pass: 3 },
    geometry: { type: 'LineString', coordinates: coords },
  };

  const detections = {
    type: 'FeatureCollection',
    features: [
      // pothole @ ~250 m, lane 1 — seen on three passes => confidence HIGH
      F(248, -1.6, { type: 'pothole', depth_mm: 95, timestamp: '2026-08-06T05:41:00Z' }),
      F(251, -1.9, { type: 'pothole', depth_mm: 102, timestamp: '2026-08-07T05:40:00Z' }),
      F(250, -1.7, { type: 'pothole', depth_mm: 110, timestamp: '2026-08-08T05:40:00Z' }),

      // speed breaker @ 380 m, full width — two passes => MED
      F(380, 0, { type: 'speed-breaker', severity: 0.8, timestamp: '2026-08-07T05:40:00Z', note: 'unmarked' }),
      F(381, 1.2, { type: 'speed-breaker', severity: 0.85, timestamp: '2026-08-08T05:40:00Z', note: 'unmarked' }),

      // a string of broken-road points spanning > 12 m => one EXTENDED event
      F(470, -5.0, { type: 'broken-road', severity: 0.7, timestamp: '2026-08-08T05:41:00Z' }),
      F(486, -5.2, { type: 'broken-road', severity: 0.75, timestamp: '2026-08-08T05:41:00Z' }),
      F(502, -4.9, { type: 'broken-road', severity: 0.8, timestamp: '2026-08-08T05:41:00Z' }),
      F(520, -5.1, { type: 'broken-road', severity: 0.72, timestamp: '2026-08-08T05:41:00Z' }),

      // rough patch, single observation => LOW confidence
      F(645, 3.4, { type: 'rough-road', severity: 0.5, timestamp: '2026-08-07T05:42:00Z' }),

      F(930, 0, { type: 'diversion', severity: 0.6, timestamp: '2026-08-08T05:43:00Z' }),
      F(1090, 0, { type: 'school-area', severity: 0.4, timestamp: '2026-08-08T05:44:00Z' }),
      F(1470, 0, { type: 'multiple-speed-breakers', severity: 0.8, timestamp: '2026-08-08T05:45:00Z' }),

      // GPS glitch: 200 m off the corridor. Must be REJECTED, not mapped.
      { type: 'Feature', geometry: { type: 'Point', coordinates: [75.858, 22.7385] },
        properties: { type: 'pothole', severity: 0.9, timestamp: '2026-08-08T05:46:00Z', note: 'gps glitch' } },
    ],
  };

  return { route, detections };
}
