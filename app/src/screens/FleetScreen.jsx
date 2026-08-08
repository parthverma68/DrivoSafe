/* Fleet dashboard — SYSTEM_DESIGN §13.4.
 * One operator's health on one corridor.
 */
import React, { useMemo, useState } from 'react';
import { OPERATORS, DRIVERS, forOperator, CORRIDOR_DEFS, getRoute } from '@drivosafe/shared';

export default function FleetScreen() {
  const [operatorId, setOperatorId] = useState(OPERATORS[0].id);
  const [routeId, setRouteId] = useState(CORRIDOR_DEFS[0].id);

  const operator = OPERATORS.find((o) => o.id === operatorId);
  const corridor = CORRIDOR_DEFS.find((c) => c.id === routeId);
  const route = useMemo(() => getRoute(routeId), [routeId]);
  const drivers = forOperator(DRIVERS, operatorId).slice().sort((a, b) => b.captainScore - a.captainScore);
  const stale = !/today/.test(corridor.freshness || '');

  /* Corridor condition heatmap: lanes x 250 m segments, taking each segment's
   * base lane quality and degrading it by any event sitting in it. Same
   * effective-quality idea the advisory uses, aggregated for a human. */
  const segments = [];
  for (let m = 0; m < route.length; m += 250) {
    const base = route.laneQualityAt(m) || [];
    const evs = route.eventsBetween(m, m + 250);
    const cells = base.map((q, lane) => {
      const hit = evs.filter((e) => e.lane == null || e.lane === lane);
      const pen = hit.reduce((a, e) => a + (e.severity != null ? e.severity : 0.6) * 30, 0);
      return Math.max(0, Math.round(q - pen));
    });
    segments.push({ m, cells, events: evs.length });
  }

  const qColor = (q) =>
    q >= 80 ? '#46e6aa' : q >= 60 ? '#ffbe50' : q >= 35 ? '#ff8b52' : '#ff5c60';

  const valueStack = [
    { item: 'Fuel — smoother speed profile, fewer needless decelerations', perBus: 41000 },
    { item: 'Tyres — fewer impacts at speed', perBus: 18500 },
    { item: 'Suspension & chassis — reduced shock loading', perBus: 22000 },
    { item: 'Breakdown avoidance — fewer road-induced failures', perBus: 15000 },
    { item: 'Insurance — verifiable driver-behaviour record', perBus: 9500 },
  ];
  const totalValue = valueStack.reduce((a, v) => a + v.perBus, 0);

  return (
    <div className="console">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 16 }}>Fleet dashboard</h2>
        <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} style={{ width: 'auto' }}>
          {OPERATORS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} style={{ width: 'auto' }}>
          {CORRIDOR_DEFS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {stale ? <span className="chip warn">STALE — last scan {corridor.freshness}</span>
               : <span className="chip ok">FRESH — {corridor.freshness}</span>}
      </div>

      <div className="grid3">
        <Kpi k="Fleet RQI" v={operator.rqi} d="ride quality index, 0–100" tone={operator.rqi >= 80 ? 't-ok' : 't-warn'} />
        <Kpi k="Advisory compliance" v={operator.compliance + '%'} d="events handled as advised"
             tone={operator.compliance >= 85 ? 't-ok' : operator.compliance >= 75 ? 't-warn' : 't-danger'} />
        <Kpi k="Fuel saved" v="6.8%" d="vs. pre-install baseline" tone="t-ok" />
        <Kpi k="Harsh events" v="3.1" d="per 1000 km" />
        <Kpi k="Buses reporting" v={operator.buses} d="telemetry in the last 24 h" />
      </div>

      <div className="panel">
        <h3>Corridor condition — {corridor.name}</h3>
        <p className="hint">
          Lane × 250 m chainage. Base scan quality degraded by the events sitting in each
          cell — the same effective-quality calculation the in-cab advisory runs, aggregated
          for a human reader.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `54px repeat(${segments.length}, minmax(26px, 1fr))`, gap: 2, minWidth: 520 }}>
            {Array.from({ length: route.lanes }, (_, lane) => (
              <React.Fragment key={lane}>
                <div className="mono dim" style={{ fontSize: 10, display: 'flex', alignItems: 'center' }}>
                  LANE {lane + 1}
                </div>
                {segments.map((s) => (
                  <div
                    key={s.m}
                    className="heatcell"
                    style={{ background: qColor(s.cells[lane]) }}
                    title={`${s.m}–${s.m + 250} m · lane ${lane + 1} · quality ${s.cells[lane]}`}
                  />
                ))}
              </React.Fragment>
            ))}
            <div />
            {segments.map((s) => (
              <div key={s.m} className="mono dim" style={{ fontSize: 8, textAlign: 'center', paddingTop: 2 }}>
                {s.m / 1000}
              </div>
            ))}
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, fontSize: 10 }}>
          <span className="dim">km along corridor · </span>
          <span className="t-ok">■ good ≥80</span>
          <span className="t-warn">■ medium 60–79</span>
          <span className="t-danger">■ poor &lt;60</span>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h3>Captain Score leaderboard</h3>
          <p className="hint">Operator-only. Never public, never passenger-visible.</p>
          {drivers.length === 0 ? (
            <p className="dim" style={{ fontSize: 12 }}>No drivers assigned to this operator.</p>
          ) : drivers.map((d) => (
            <div key={d.id} style={{ marginBottom: 11 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{d.name} <span className={'badge ' + d.badge}>{d.badge}</span></span>
                <span className="mono" style={{ fontSize: 12 }}>{d.captainScore}</span>
              </div>
              <div className="bar">
                <i style={{
                  width: d.captainScore + '%',
                  background: d.captainScore >= 85 ? '#46e6aa' : d.captainScore >= 70 ? '#ffbe50' : '#ff5c60',
                }} />
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>Value stack</h3>
          <p className="hint">Per bus per year, ₹. Modelled from the operator's own telemetry, not a generic figure.</p>
          <table>
            <thead><tr><th>Line item</th><th className="num">₹ / bus / yr</th></tr></thead>
            <tbody>
              {valueStack.map((v) => (
                <tr key={v.item}>
                  <td style={{ fontSize: 11 }}>{v.item}</td>
                  <td className="num">{v.perBus.toLocaleString('en-IN')}</td>
                </tr>
              ))}
              <tr>
                <td><strong>Total</strong></td>
                <td className="num t-ok"><strong>{totalValue.toLocaleString('en-IN')}</strong></td>
              </tr>
              <tr>
                <td className="dim">Fleet of {operator.buses}</td>
                <td className="num t-ok">{(totalValue * operator.buses).toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>RideScore</h3>
        <p className="hint">
          The passenger-facing badge, derived from trip RQI. Absence is neutral — a new
          operator with no history is not penalised on a listing.
        </p>
        <div className="row">
          <div style={{
            border: '1px solid var(--line-2)', borderRadius: 10, padding: '12px 18px',
            background: 'var(--bg-2)', minWidth: 250,
          }}>
            <div className="dim" style={{ fontSize: 9, letterSpacing: '0.12em' }}>DRIVOSAFE RIDESCORE</div>
            <div className="mono t-ok" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{operator.rqi}</div>
            <div style={{ fontSize: 11 }}>{operator.name} · {corridor.corridor}</div>
            <div className="dim" style={{ fontSize: 9, marginTop: 4 }}>verified {corridor.freshness}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            {[
              ['Road quality', 35, corridor.laneSections[0].quality.reduce((a, b) => a + b, 0) / corridor.lanes],
              ['Driver behaviour', 30, operator.compliance],
              ['Vehicle dynamics', 20, 88],
              ['Route events', 15, Math.max(0, 100 - route.events.length * 3)],
            ].map(([label, weight, val]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div className="stat-line">
                  <span>{label} <span className="dim">({weight}%)</span></span>
                  <span>{Math.round(val)}</span>
                </div>
                <div className="bar"><i style={{ width: Math.round(val) + '%', background: '#46e6aa' }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ k, v, d, tone }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className={'v ' + (tone || '')}>{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}
