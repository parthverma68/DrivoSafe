/* Admin console — SYSTEM_DESIGN §13.3.
 * Onboarding · fleet summaries · driver profiles · fatigue review.
 */
import React, { useState } from 'react';
import { OPERATORS, BUSES, DRIVERS, PARTNERS, byId, forOperator, CORRIDOR_DEFS, LEVEL_META } from '@drivosafe/shared';

const TABS = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'summaries', label: 'Fleet summaries' },
  { id: 'drivers', label: 'Driver profiles' },
  { id: 'fatigue', label: 'Fatigue review' },
];

export default function AdminScreen() {
  const [tab, setTab] = useState('onboarding');
  const [operators, setOperators] = useState(OPERATORS);
  const [buses, setBuses] = useState(BUSES);
  const [partners, setPartners] = useState(PARTNERS);
  const [toast, setToast] = useState(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  return (
    <div className="console">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 16 }}>Admin console</h2>
        <span className="dim" style={{ fontSize: 11 }}>platform tenancy, onboarding and driver records</span>
      </div>

      <div className="subnav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'onboarding' && (
        <Onboarding
          operators={operators}
          onOperator={(o) => { setOperators(operators.concat([o])); flash(`Operator "${o.name}" onboarded`); }}
          onBus={(b) => {
            setBuses(buses.concat([b]));
            setOperators(operators.map((o) => (o.id === b.operatorId ? { ...o, buses: o.buses + 1 } : o)));
            flash(`Bus ${b.reg} onboarded — operator fleet count updated`);
          }}
          onPartner={(p) => { setPartners(partners.concat([p])); flash(`Partner "${p.name}" onboarded`); }}
        />
      )}
      {tab === 'summaries' && <Summaries operators={operators} buses={buses} partners={partners} />}
      {tab === 'drivers' && <DriverProfiles operators={operators} />}
      {tab === 'fatigue' && <FatigueReview />}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

/* ---------------- onboarding ---------------- */
function Onboarding({ operators, onOperator, onBus, onPartner }) {
  const [op, setOp] = useState({ name: '', type: 'Passenger', corridor: 'NH-52', contact: '' });
  const [bus, setBus] = useState({
    reg: '', operatorId: operators[0] ? operators[0].id : '', model: '',
    kit: 'Assistant+OBD', transmission: 'manual', dmsCamera: true,
  });
  const [lp, setLp] = useState({ name: '', mode: 'Line-haul', fleet: 10, corridors: 1, sla: 95 });

  const opValid = op.name.trim() && op.contact.trim();
  const busValid = bus.reg.trim() && bus.operatorId && bus.model.trim();
  const lpValid = lp.name.trim();

  return (
    <div className="grid2">
      <div className="panel">
        <h3>Onboard operator</h3>
        <p className="hint">Creates a tenant. Every downstream record — buses, drivers, trips, scores — is scoped to it and invisible to other tenants.</p>
        <div className="field"><label>Name</label>
          <input value={op.name} onChange={(e) => setOp({ ...op, name: e.target.value })} placeholder="Sarthi Travels" /></div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Type</label>
            <select value={op.type} onChange={(e) => setOp({ ...op, type: e.target.value })}>
              {['Passenger', 'Logistics', 'Mixed'].map((t) => <option key={t}>{t}</option>)}
            </select></div>
          <div className="field" style={{ flex: 1 }}><label>Corridor</label>
            <select value={op.corridor} onChange={(e) => setOp({ ...op, corridor: e.target.value })}>
              {[...new Set(CORRIDOR_DEFS.map((c) => c.corridor))].map((c) => <option key={c}>{c}</option>)}
            </select></div>
        </div>
        <div className="field"><label>Contact</label>
          <input value={op.contact} onChange={(e) => setOp({ ...op, contact: e.target.value })} placeholder="ops@example.com" /></div>
        <button className="primary" disabled={!opValid} onClick={() => {
          onOperator({ id: 'op-' + Date.now().toString(36), buses: 0, rqi: 0, compliance: 0, ...op });
          setOp({ name: '', type: 'Passenger', corridor: 'NH-52', contact: '' });
        }}>ONBOARD OPERATOR</button>
      </div>

      <div className="panel">
        <h3>Onboard bus</h3>
        <p className="hint">
          The kit tier decides what the app can do. <strong>App-only</strong> has no OBD, so speed
          compliance and gear advisory are unavailable. <strong>No DMS camera</strong> caps
          drowsiness detection at D2, context-only.
        </p>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Registration</label>
            <input value={bus.reg} onChange={(e) => setBus({ ...bus, reg: e.target.value })} placeholder="MP09 FA 4412" /></div>
          <div className="field" style={{ flex: 1 }}><label>Model</label>
            <input value={bus.model} onChange={(e) => setBus({ ...bus, model: e.target.value })} placeholder="Tata Starbus" /></div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Operator</label>
            <select value={bus.operatorId} onChange={(e) => setBus({ ...bus, operatorId: e.target.value })}>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <div className="field" style={{ flex: 1 }}><label>Kit tier</label>
            <select value={bus.kit} onChange={(e) => setBus({ ...bus, kit: e.target.value })}>
              {['Assistant+OBD', 'Assistant app-only', 'Mapper (LiDAR)'].map((k) => <option key={k}>{k}</option>)}
            </select></div>
        </div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Transmission</label>
            <select value={bus.transmission} onChange={(e) => setBus({ ...bus, transmission: e.target.value })}>
              <option value="manual">manual</option><option value="automatic">automatic</option>
            </select></div>
          <div className="field" style={{ flex: 1 }}><label>Driver camera (DMS)</label>
            <select value={bus.dmsCamera ? 'yes' : 'no'} onChange={(e) => setBus({ ...bus, dmsCamera: e.target.value === 'yes' })}>
              <option value="yes">NIR camera fitted</option><option value="no">none — context-only</option>
            </select></div>
        </div>
        <button className="primary" disabled={!busValid} onClick={() => {
          onBus({
            id: 'bus-' + Date.now().toString(36),
            efficiencyBand: { rpmLow: 1200, rpmHigh: 1800 },
            ...bus,
          });
          setBus({ ...bus, reg: '', model: '' });
        }}>ONBOARD BUS</button>
      </div>

      <div className="panel">
        <h3>Onboard logistics partner</h3>
        <p className="hint">Freight tenants consume the same corridor model with an SLA-oriented roll-up instead of RideScore.</p>
        <div className="field"><label>Name</label>
          <input value={lp.name} onChange={(e) => setLp({ ...lp, name: e.target.value })} placeholder="Vindhya Freight" /></div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Mode</label>
            <select value={lp.mode} onChange={(e) => setLp({ ...lp, mode: e.target.value })}>
              {['Line-haul', 'Container', 'Last-mile', 'Cold-chain'].map((m) => <option key={m}>{m}</option>)}
            </select></div>
          <div className="field" style={{ flex: 1 }}><label>Fleet</label>
            <input type="number" value={lp.fleet} onChange={(e) => setLp({ ...lp, fleet: +e.target.value })} /></div>
          <div className="field" style={{ flex: 1 }}><label>SLA %</label>
            <input type="number" value={lp.sla} onChange={(e) => setLp({ ...lp, sla: +e.target.value })} /></div>
        </div>
        <button className="primary" disabled={!lpValid} onClick={() => {
          onPartner({ id: 'lp-' + Date.now().toString(36), ...lp });
          setLp({ ...lp, name: '' });
        }}>ONBOARD PARTNER</button>
      </div>

      <div className="panel">
        <h3>Route onboarding</h3>
        <p className="hint">
          Corridors are authored in the Route Editor, not here. A route stays
          <strong> pending first scan</strong> until a mapper has driven it — the app never
          shows advisory for a corridor it has not seen.
        </p>
        <table>
          <thead><tr><th>Corridor</th><th className="num">Lanes</th><th className="num">Length</th><th>Freshness</th><th>Status</th></tr></thead>
          <tbody>
            {CORRIDOR_DEFS.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="num">{c.lanes}</td>
                <td className="num">{(c.length / 1000).toFixed(2)} km</td>
                <td className={/today/.test(c.freshness) ? 't-ok' : 't-warn'}>{c.freshness}</td>
                <td><span className="badge">{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- summaries ---------------- */
function Summaries({ operators, buses, partners }) {
  return (
    <div className="grid2">
      <div className="panel">
        <h3>Operators</h3>
        <p className="hint">Compliance below 75% is flagged as a renewal risk — a fleet not acting on advisory will not renew.</p>
        <table>
          <thead><tr><th>Operator</th><th>Type</th><th className="num">Buses</th><th className="num">RQI</th><th className="num">Compliance</th></tr></thead>
          <tbody>
            {operators.map((o) => (
              <tr key={o.id}>
                <td>{o.name}<div className="dim" style={{ fontSize: 10 }}>{o.corridor}</div></td>
                <td>{o.type}</td>
                <td className="num">{o.buses}</td>
                <td className="num">{o.rqi || '—'}</td>
                <td className={'num ' + (o.compliance && o.compliance < 75 ? 't-danger' : 't-ok')}>
                  {o.compliance ? o.compliance + '%' : '—'}
                  {o.compliance && o.compliance < 75 ? ' ⚠' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Logistics partners</h3>
        <table>
          <thead><tr><th>Partner</th><th>Mode</th><th className="num">Fleet</th><th className="num">Corridors</th><th className="num">SLA</th></tr></thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.mode}</td>
                <td className="num">{p.fleet}</td><td className="num">{p.corridors}</td>
                <td className={'num ' + (p.sla < 90 ? 't-warn' : 't-ok')}>{p.sla}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ gridColumn: '1 / -1' }}>
        <h3>Buses &amp; kit coverage</h3>
        <p className="hint">Kit tier determines available capability per bus; the app degrades rather than failing when a sensor is absent.</p>
        <table>
          <thead><tr><th>Reg</th><th>Operator</th><th>Model</th><th>Kit</th><th>Transmission</th><th>DMS</th></tr></thead>
          <tbody>
            {buses.map((b) => {
              const o = byId(operators, b.operatorId);
              return (
                <tr key={b.id}>
                  <td className="mono">{b.reg}</td>
                  <td>{o ? o.name : '—'}</td>
                  <td>{b.model}</td>
                  <td><span className="badge">{b.kit}</span></td>
                  <td className={b.transmission === 'automatic' ? 'dim' : ''}>
                    {b.transmission}{b.transmission === 'automatic' ? ' (no gear advice)' : ''}
                  </td>
                  <td className={b.dmsCamera ? 't-ok' : 't-warn'}>
                    {b.dmsCamera ? 'camera' : 'context-only'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- driver profiles ---------------- */
function DriverProfiles({ operators }) {
  const [opFilter, setOpFilter] = useState('');
  const list = forOperator(DRIVERS, opFilter);

  return (
    <>
      <div className="row">
        <div className="field" style={{ minWidth: 240, marginBottom: 0 }}>
          <label>Filter by operator</label>
          <select value={opFilter} onChange={(e) => setOpFilter(e.target.value)}>
            <option value="">All operators</option>
            {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <span className="dim" style={{ fontSize: 11, alignSelf: 'flex-end', paddingBottom: 8 }}>
          Captain Score is operator-only — never public, never passenger-visible, never
          shared across tenants.
        </span>
      </div>

      <div className="grid3">
        {list.map((d) => (
          <div className="panel" key={d.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{d.name}</strong>
              <span className={'badge ' + d.badge}>{d.badge}</span>
            </div>
            <div className="dim mono" style={{ fontSize: 10, margin: '4px 0 10px' }}>{d.licenceNo}</div>
            <div className={'v mono ' + (d.captainScore >= 85 ? 't-ok' : d.captainScore >= 70 ? 't-warn' : 't-danger')}
              style={{ fontSize: 30, fontWeight: 700 }}>
              {d.captainScore}
            </div>
            <div className="dim" style={{ fontSize: 10, marginBottom: 10 }}>Captain Score</div>
            <div className="stat-line"><span>Trips</span><span>{d.trips}</span></div>
            <div className="stat-line"><span>Harsh events</span><span className={d.harshEvents > 20 ? 't-danger' : ''}>{d.harshEvents}</span></div>
            <div className="stat-line"><span>Comfort</span><span>{d.comfort}%</span></div>
            <div className="stat-line"><span>Adherence</span><span>{d.adherence}%</span></div>
            <div className="bar" style={{ marginTop: 8 }}>
              <i style={{ width: d.adherence + '%', background: d.adherence >= 85 ? '#46e6aa' : '#ffbe50' }} />
            </div>
            {d.badge === 'Watch' ? (
              <div className="t-danger" style={{ fontSize: 10, marginTop: 8 }}>
                ⚠ Watch tier — schedule a coaching review
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- fatigue review ---------------- */
const DEMO_FATIGUE = [
  { id: 'fe-1', driverId: 'drv-3', level: 'D3', kss: 7.4, at: 'NH-52 @ 8.4 km', time: '03:12', mode: 'full', perclos: 0.34, timeOnTask: 268, ack: true },
  { id: 'fe-2', driverId: 'drv-3', level: 'D2', kss: 6.1, at: 'NH-52 @ 21.0 km', time: '04:40', mode: 'full', perclos: 0.21, timeOnTask: 356, ack: true },
  { id: 'fe-3', driverId: 'drv-5', level: 'D2', kss: 6.0, at: 'SH-27 @ 4.1 km', time: '15:05', mode: 'context-only', perclos: null, timeOnTask: 214, ack: false },
  { id: 'fe-4', driverId: 'drv-2', level: 'D4', kss: 8.8, at: 'NH-52 @ 33.7 km', time: '04:58', mode: 'full', perclos: 0.48, timeOnTask: 402, ack: true },
];

function FatigueReview() {
  return (
    <>
      <div className="panel">
        <h3>Fatigue events</h3>
        <p className="hint">
          Derived scalars only — no imagery is ever recorded or uploaded. Fatigue events are
          firewalled from the Captain Score by design: a system that punishes a driver for
          being tired is a system that gets a sticker put over the camera. These route to
          rest and rostering, not to performance.
        </p>
        <table>
          <thead>
            <tr>
              <th>Driver</th><th>Level</th><th className="num">KSS</th><th>Location</th>
              <th className="num">Local time</th><th>Mode</th><th className="num">PERCLOS</th>
              <th className="num">On task</th><th>Ack</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_FATIGUE.map((f) => {
              const d = byId(DRIVERS, f.driverId);
              const meta = LEVEL_META[f.level];
              const cls = meta.tone === 'critical' ? 't-critical' : meta.tone === 'danger' ? 't-danger' : 't-warn';
              return (
                <tr key={f.id}>
                  <td>{d ? d.name : f.driverId}</td>
                  <td className={cls}><strong>{f.level}</strong> {meta.label}</td>
                  <td className="num">{f.kss}</td>
                  <td>{f.at}</td>
                  <td className="num">{f.time}</td>
                  <td className={f.mode === 'full' ? '' : 'dim'}>{f.mode}</td>
                  <td className="num">{f.perclos == null ? '—' : (f.perclos * 100).toFixed(0) + '%'}</td>
                  <td className="num">{Math.floor(f.timeOnTask / 60)}h {f.timeOnTask % 60}m</td>
                  <td className={f.ack ? 't-ok' : 't-danger'}>{f.ack ? 'yes' : 'PENDING'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid3">
        <div className="kpi"><div className="k">Events this week</div><div className="v">{DEMO_FATIGUE.length}</div><div className="d">across 3 drivers</div></div>
        <div className="kpi"><div className="k">D3+ events</div><div className="v t-danger">2</div><div className="d">supervisor escalation fired</div></div>
        <div className="kpi"><div className="k">Peak window</div><div className="v">03–05</div><div className="d">the circadian trough, as expected</div></div>
        <div className="kpi"><div className="k">Context-only share</div><div className="v t-warn">25%</div><div className="d">buses without a DMS camera</div></div>
      </div>

      <div className="panel">
        <h3>Rostering recommendation</h3>
        <p className="hint" style={{ margin: 0 }}>
          Three of four events fall in the 03:00–05:00 circadian trough at over 4 hours
          continuous driving. The lever here is the roster, not the driver: shorten the
          overnight leg or insert a mandatory break at the 3.5-hour mark. Sunil Patil
          (drv-3) has two events in one week and should not be assigned the overnight
          NH-52 leg until reviewed.
        </p>
      </div>
    </>
  );
}
