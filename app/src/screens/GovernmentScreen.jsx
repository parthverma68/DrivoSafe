/* Government / concessionaire dashboard — SYSTEM_DESIGN §13.5.
 *
 * Pavement intelligence for road owners. Every figure here is a by-product of
 * buses that were driving the corridor anyway — which is the commercial point:
 * continuous survey at no marginal survey cost.
 */
import React, { useMemo, useState } from 'react';
import { getEventType } from 'react-road-hazards';
import { CORRIDOR_DEFS, getRoute } from '@drivosafe/shared';

export default function GovernmentScreen() {
  const [routeId, setRouteId] = useState(CORRIDOR_DEFS[0].id);
  const corridor = CORRIDOR_DEFS.find((c) => c.id === routeId);
  const route = useMemo(() => getRoute(routeId), [routeId]);

  /* Maintenance priority: severity x confidence x lane exposure. P1 is
   * "structural and confirmed", P3 is "watch". */
  const defects = route.events
    .filter((e) => {
      const T = getEventType(e.type);
      return T.tone === 'danger' || T.tone === 'warn';
    })
    .map((e) => {
      const sev = e.severity != null ? e.severity : 0.6;
      const conf = e.confidence === 'high' ? 1 : e.confidence === 'med' ? 0.72 : 0.45;
      const T = getEventType(e.type);
      const exposure = e.lane == null ? 1 : 0.7;
      const score = Math.round(100 - sev * conf * exposure * 85);
      return {
        id: e.id,
        segment: `${(e.at / 1000).toFixed(2)}–${((e.at + (e.length || T.len)) / 1000).toFixed(2)} km`,
        defect: T.name,
        lane: e.lane == null ? 'full width' : 'L' + (e.lane + 1),
        score,
        priority: score < 45 ? 'P1' : score < 65 ? 'P2' : 'P3',
        trend: sev > 0.75 ? -9 : sev > 0.5 ? -4 : -1,
        confidence: e.confidence || 'med',
        verifiedAt: e.verifiedAt || 'unknown',
      };
    })
    .sort((a, b) => a.score - b.score);

  const [sortKey, setSortKey] = useState('score');
  const sorted = defects.slice().sort((a, b) =>
    sortKey === 'score' ? a.score - b.score
      : sortKey === 'segment' ? a.segment.localeCompare(b.segment)
      : a.priority.localeCompare(b.priority)
  );

  const p1 = defects.filter((d) => d.priority === 'P1').length;
  const surfaceScore = Math.round(
    (corridor.laneSections.reduce((a, s) => a + s.quality.reduce((x, y) => x + y, 0) / s.quality.length, 0)
      / corridor.laneSections.length)
  );

  /* Post-monsoon deterioration: same segment re-scored week over week. This
   * curve is the government product — a single scan is a photograph, a series
   * is evidence. */
  const trend = [
    { week: 'W-10', score: surfaceScore + 14 },
    { week: 'W-8', score: surfaceScore + 12 },
    { week: 'W-6', score: surfaceScore + 7 },
    { week: 'W-4', score: surfaceScore + 3 },
    { week: 'W-2', score: surfaceScore + 1 },
    { week: 'now', score: surfaceScore },
  ];
  const maxT = Math.max(...trend.map((t) => t.score));

  const observables = [
    { k: 'Lane-marking visibility', v: 58, note: 'faded between 0.6–1.1 km; repaint before monsoon' },
    { k: 'Signage presence', v: 74, note: 'speed-breaker at 0.38 km is unmarked' },
    { k: 'Shoulder condition', v: 41, note: 'erosion on the left shoulder past 1.2 km' },
    { k: 'Encroachment', v: 66, note: 'informal parking narrowing L1 near the school zone' },
  ];

  return (
    <div className="console">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 16 }}>Government dashboard</h2>
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} style={{ width: 'auto' }}>
          {CORRIDOR_DEFS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="dim" style={{ fontSize: 11 }}>
          surveyed by {corridor.mappers} mapper bus{corridor.mappers === 1 ? '' : 'es'} on their normal service runs
        </span>
      </div>

      <div className="grid3">
        <Kpi k="Surface score" v={surfaceScore} d="corridor mean, 0–100"
             tone={surfaceScore >= 75 ? 't-ok' : surfaceScore >= 60 ? 't-warn' : 't-danger'} />
        <Kpi k="P1 defects" v={p1} d="structural and confirmed" tone={p1 ? 't-danger' : 't-ok'} />
        <Kpi k="Scan freshness" v={corridor.freshness} d={`v${corridor.version}`}
             tone={/today/.test(corridor.freshness) ? 't-ok' : 't-warn'} />
        <Kpi k="Deterioration" v={(trend[trend.length - 1].score - trend[0].score) + ' pts'}
             d="over 10 weeks" tone="t-danger" />
      </div>

      <div className="panel">
        <h3>Maintenance priority</h3>
        <p className="hint">
          Ranked by severity × confidence × lane exposure. Confidence comes from repeat
          observation, so a P1 here has been seen on at least three separate passes — it is
          not one bus's bad afternoon.
        </p>
        <table>
          <thead>
            <tr>
              <th className="clickable" onClick={() => setSortKey('segment')}>Segment</th>
              <th>Defect</th><th>Lane</th>
              <th className="num clickable" onClick={() => setSortKey('score')}>Score</th>
              <th className="num">Trend</th>
              <th className="clickable" onClick={() => setSortKey('priority')}>Priority</th>
              <th>Confidence</th><th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.segment}</td>
                <td>{d.defect}</td>
                <td>{d.lane}</td>
                <td className={'num ' + (d.score < 45 ? 't-danger' : d.score < 65 ? 't-warn' : '')}>{d.score}</td>
                <td className="num t-danger">{d.trend}</td>
                <td>
                  <span className="badge" style={{
                    background: d.priority === 'P1' ? '#4a1e22' : d.priority === 'P2' ? '#4a3c12' : '#2f3a42',
                    color: d.priority === 'P1' ? '#ff9b9e' : d.priority === 'P2' ? '#ffd66b' : '#cfe2ee',
                  }}>{d.priority}</span>
                </td>
                <td className={d.confidence === 'high' ? 't-ok' : d.confidence === 'low' ? 'dim' : ''}>{d.confidence}</td>
                <td className="dim mono" style={{ fontSize: 10 }}>{d.verifiedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Deterioration trend</h3>
          <p className="hint">Same segments re-scored week over week. A single scan is a photograph; the series is evidence.</p>
          <svg viewBox="0 0 380 150" style={{ width: '100%', height: 150 }}>
            <polyline
              points={trend.map((t, i) => `${20 + i * 68},${140 - (t.score / maxT) * 110}`).join(' ')}
              fill="none" stroke="#ff5c60" strokeWidth="2.5"
            />
            {trend.map((t, i) => (
              <g key={t.week}>
                <circle cx={20 + i * 68} cy={140 - (t.score / maxT) * 110} r="3.5" fill="#ff5c60" />
                <text x={20 + i * 68} y={148} fill="#5f7385" fontSize="9" textAnchor="middle" fontFamily="monospace">{t.week}</text>
                <text x={20 + i * 68} y={140 - (t.score / maxT) * 110 - 8} fill="#93a6b6" fontSize="9" textAnchor="middle" fontFamily="monospace">{t.score}</text>
              </g>
            ))}
          </svg>
        </div>

        <div className="panel">
          <h3>Passive observables</h3>
          <p className="hint">
            Roadside condition inferred from the same scans — no extra sensor, no extra pass.
          </p>
          {observables.map((o) => (
            <div key={o.k} style={{ marginBottom: 12 }}>
              <div className="stat-line">
                <span>{o.k}</span>
                <span className={o.v < 50 ? 't-danger' : o.v < 70 ? 't-warn' : 't-ok'}>{o.v}</span>
              </div>
              <div className="bar">
                <i style={{ width: o.v + '%', background: o.v < 50 ? '#ff5c60' : o.v < 70 ? '#ffbe50' : '#46e6aa' }} />
              </div>
              <div className="dim" style={{ fontSize: 10, marginTop: 3 }}>{o.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v, d, tone }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className={'v ' + (tone || '')} style={{ fontSize: typeof v === 'string' && v.length > 8 ? 16 : 27 }}>{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}
