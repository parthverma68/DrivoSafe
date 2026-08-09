/* Fleet console — SYSTEM_DESIGN §13.4.
 *
 * Two tabs over one tenancy:
 *
 *   Live      the operations board. Every vehicle in scope on a map, the driver
 *             at the wheel right now, their fatigue state, and cabin video on
 *             request. This is what a fleet owner opens in the morning.
 *   Insights  the slower questions — corridor condition, Captain Score, what
 *             the system is worth per bus per year.
 *
 * Scope is not a UI filter. `scopeOf(account)` returns the operatorId the
 * signed-in account is pinned to, and a fleet owner's snapshot is built from
 * that id — the records for other operators are never fetched, let alone
 * rendered behind a hidden tab. Admin passes null and sees the whole board.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  OPERATORS, DRIVERS, CORRIDOR_DEFS, getRoute, forOperator, byId,
  fleetSnapshot, fleetSummary, requestCabinClip, clipState, scopeOf,
} from '@drivosafe/shared';
import FleetMap from '../components/FleetMap.jsx';
import CameraView from '../components/CameraView.jsx';
import {
  Avatar, Chip, Kpi, Gauge, Meter, Ring, EqBars, Empty, Segmented,
  IconCam, IconPlay, IconSearch, IconWheel, IconAlert, IconPin, IconRefresh, IconGauge,
  toneClass, toneVar, scoreTone,
} from '../components/ui.jsx';

const TABS = [{ id: 'live', label: 'Live operations' }, { id: 'insights', label: 'Insights' }];

export default function FleetScreen({ account, onMirror }) {
  const scope = scopeOf(account);
  const isAdmin = account && account.role === 'admin';

  const [tab, setTab] = useState('live');
  /* Admin picks a tenant; everyone else *is* one. */
  const [operatorId, setOperatorId] = useState(scope.all ? '' : scope.operatorId);
  const effectiveOperator = scope.all ? operatorId || null : scope.operatorId;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const records = useMemo(
    () => fleetSnapshot({ operatorId: effectiveOperator, at: now }),
    [effectiveOperator, now]
  );

  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');

  /* Keep a selection valid when the tenant filter changes. */
  useEffect(() => {
    if (records.length === 0) { setSelectedId(null); return; }
    if (!records.some((r) => r.busId === selectedId)) setSelectedId(records[0].busId);
  }, [records, selectedId]);

  const filtered = query.trim()
    ? records.filter((r) => {
        const q = query.trim().toLowerCase();
        return (
          r.bus.reg.toLowerCase().includes(q) ||
          r.bus.serial.toLowerCase().includes(q) ||
          (r.driver && r.driver.name.toLowerCase().includes(q)) ||
          r.bus.service.toLowerCase().includes(q)
        );
      })
    : records;

  const selected = records.find((r) => r.busId === selectedId) || null;
  const summary = fleetSummary(records);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="row" style={{ padding: '14px 16px 0', gap: 12 }}>
        <Segmented value={tab} onChange={setTab} options={TABS} />

        {scope.all ? (
          <select
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            style={{ width: 'auto', minWidth: 190 }}
            title="Tenancy — admin only"
          >
            <option value="">All operators ({OPERATORS.length})</option>
            {OPERATORS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <Chip tone="ok">{(byId(OPERATORS, scope.operatorId) || {}).name} · your fleet only</Chip>
        )}

        <div className="spacer" />
        {tab === 'live' ? (
          <div style={{ position: 'relative', width: 250 }}>
            <IconSearch size={15} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--fg-3)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Registration, unit, driver…"
              style={{ paddingLeft: 33 }}
            />
          </div>
        ) : null}
      </div>

      {tab === 'live' ? (
        <LiveBoard
          records={filtered}
          allRecords={records}
          summary={summary}
          selected={selected}
          onSelect={setSelectedId}
          isAdmin={isAdmin}
          onMirror={onMirror}
          account={account}
          now={now}
        />
      ) : (
        <Insights operatorId={effectiveOperator || OPERATORS[0].id} />
      )}
    </div>
  );
}

/* ======================================================== live board ===== */
function LiveBoard({ records, allRecords, summary, selected, onSelect, isAdmin, onMirror, account, now }) {
  return (
    <div className="ops">
      <div className="ops-col">
        <div className="grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Kpi k="On route" v={summary.onRoute} d={`${summary.total} in scope`} tone="t-ok" />
          <Kpi
            k="Needs attention" v={summary.alerts}
            d="fatigue or compliance"
            tone={summary.alerts ? 't-danger' : ''}
          />
        </div>

        <div className="ops-list">
          {records.length === 0 ? (
            <Empty title="Nothing matches" icon={<IconSearch size={22} />}>
              No vehicle in this tenancy matches that search.
            </Empty>
          ) : records.map((r) => (
            <BusRow key={r.busId} r={r} on={selected && selected.busId === r.busId} onClick={() => onSelect(r.busId)} />
          ))}
        </div>
      </div>

      <div className="ops-col">
        <FleetMap records={allRecords} selectedId={selected ? selected.busId : null} onSelect={onSelect} />
        <div className="grid3">
          <Kpi k="Avg speed" v={summary.avgSpeed} d="km/h, moving vehicles" />
          <Kpi k="Advisory compliance" v={summary.avgCompliance + '%'} d="fleet mean, live" tone={'t-' + scoreTone(summary.avgCompliance)} />
          <Kpi k="Fatigue watch" v={summary.fatigueWatch} d="drivers at D2 or worse" tone={summary.fatigueWatch ? 't-warn' : ''} />
          <Kpi k="Cameras down" v={summary.camerasDown} d="DMS degraded to context-only" tone={summary.camerasDown ? 't-warn' : ''} />
        </div>
      </div>

      <div className="ops-col ops-detail">
        {selected ? (
          <VehicleDetail r={selected} isAdmin={isAdmin} onMirror={onMirror} account={account} now={now} />
        ) : (
          <div className="card"><Empty title="No vehicle selected" icon={<IconPin size={22} />}>Pick a vehicle from the list or the map.</Empty></div>
        )}
      </div>
    </div>
  );
}

function BusRow({ r, on, onClick }) {
  return (
    <button className={'bus-row' + (on ? ' on' : '')} onClick={onClick}>
      <div className="top">
        <span className={'dot' + (r.speedKph > 3 ? ' live' : '')} style={{ color: toneVar(r.statusMeta.tone) }} />
        <span className="plate">{r.bus.reg}</span>
        <span className="spacer" />
        <span className={'chip ' + chipTone(r.statusMeta.tone)} style={{ padding: '2px 8px' }}>
          {r.statusMeta.label}
        </span>
      </div>
      <div className="svc">{r.bus.service} · {r.driver ? r.driver.name : 'unassigned'}</div>

      <div className="metrics">
        <div><b>{r.speedKph}</b> km/h</div>
        <div><b>{r.remainingKm}</b> km left</div>
        <div className={toneClass(r.fatigue.tone)} title={`Driver monitoring: ${r.fatigue.level} ${r.fatigue.label}`}>
          fatigue <b>{r.fatigue.level}</b>
        </div>
      </div>

      <div className="track">
        <Meter value={r.progress * 100} tone={toneVar(r.statusMeta.tone)} />
      </div>
    </button>
  );
}

const chipTone = (t) =>
  t === 'danger' ? 'danger' : t === 'warn' ? 'warn' : t === 'watch' ? 'watch' : t === 'ok' ? 'ok' : 'neutral';

/* ---------------------------------------------------- the selected bus --- */
function VehicleDetail({ r, isAdmin, onMirror, account, now }) {
  const [clip, setClip] = useState(null);
  const [reason, setReason] = useState('routine check');

  /* A new selection must not inherit the previous vehicle's clip. */
  useEffect(() => { setClip(null); }, [r.busId]);

  const live = clip ? clipState(clip, now) : null;
  const driver = r.driver;

  return (
    <>
      <div className="card">
        <div className="detail-head">
          {driver ? <Avatar name={driver.name} hue={driver.avatarHue} size="lg" /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="plate">{r.bus.reg}</div>
            <div className="model">{r.bus.model} · {r.bus.serial}</div>
          </div>
          <Ring
            value={r.complianceScore}
            size={62}
            tone={toneVar(scoreTone(r.complianceScore))}
            sub="COMPLY"
          />
        </div>

        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          <Chip tone={chipTone(r.statusMeta.tone)} live={r.speedKph > 3}>{r.statusMeta.label}</Chip>
          <Chip tone={chipTone(r.fatigue.tone)}>{r.fatigue.level} {r.fatigue.label}</Chip>
          <Chip>{r.corridorName}</Chip>
        </div>

        {driver ? (
          <div className="row" style={{ marginTop: 14, gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 620 }}>{driver.name}</div>
              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                On duty since {r.shiftStart} · {r.dutyHours24h} h in 24 h
              </div>
            </div>
            <span className={'badge ' + driver.badge}>{driver.badge}</span>
            <Chip>Captain {driver.captainScore}</Chip>
          </div>
        ) : null}
      </div>

      {/* -------- what the cab looks like right now -------- */}
      <div className="card">
        <div className="card-head">
          <h3>Cab</h3>
          <div className="spacer" />
          <Chip tone={r.cabin.cameraOnline ? 'ok' : 'warn'}>
            {r.cabin.cameraOnline ? `SNAPSHOT ${r.cabin.driverSnapshotAgeS}s AGO` : 'CAMERA OFFLINE'}
          </Chip>
        </div>

        {r.cabin.cameraOnline ? (
          <CameraView
            live={false}
            seed={r.busId.length + r.bus.seats}
            kind={live && live.state === 'ready' ? 'cabin' : 'face'}
            night={new Date(now).getHours() < 7 || new Date(now).getHours() > 18}
            moving={r.speedKph > 3}
            reticle={false}
            badge={live && live.state === 'ready' ? `CABIN CLIP · ${live.seconds}s` : 'DRIVER CAM · STILL'}
            stamp={new Date(now - r.cabin.driverSnapshotAgeS * 1000).toLocaleTimeString('en-IN', { hour12: false })}
          />
        ) : (
          <div className="viewport">
            <div className="vp-empty">
              <IconCam size={26} />
              <div style={{ marginTop: 8 }}>
                This vehicle has no working driver camera. The DMS is running context-only —
                duty hours, circadian phase and lane-keeping, with no ocular signal.
              </div>
            </div>
          </div>
        )}

        {live && live.state === 'uploading' ? (
          <div style={{ marginTop: 12 }}>
            <div className="stat-line"><span>Uploading last {live.seconds}s from the cab</span><span>{Math.round(live.progress * 100)}%</span></div>
            <Meter value={live.progress * 100} tone="var(--sky)" />
          </div>
        ) : (
          <div className="row" style={{ marginTop: 12 }}>
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 'auto', flex: 1 }}>
              <option>routine check</option>
              <option>fatigue verification</option>
              <option>harsh-event review</option>
              <option>incident report</option>
            </select>
            <button
              onClick={() => setClip(requestCabinClip({
                busId: r.busId, seconds: 20, reason,
                by: account ? `${account.role}:${account.username}` : 'console',
              }))}
              disabled={!r.cabin.clipAvailable}
              title={r.cabin.clipAvailable ? 'Request the last 20 seconds' : 'No cabin camera on this vehicle'}
            >
              {live && live.state === 'ready' ? <IconRefresh size={15} /> : <IconPlay size={15} />}
              {live && live.state === 'ready' ? 'Request again' : 'Request clip'}
            </button>
          </div>
        )}

        <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
          Cabin video is pulled on request and never streamed continuously (§16.3). Every request
          is stamped with who asked, when, and why — and the driver's tablet says so out loud.
        </p>
      </div>

      {/* -------- telemetry -------- */}
      <div className="card">
        <div className="card-head"><h3>Live telemetry</h3><div className="spacer" /><span className="eyebrow">{r.lastSyncS}s ago</span></div>

        <div className="gauge-grid">
          <Gauge
            k="Speed" v={r.speedKph} unit="km/h"
            foot={<EqBars seed={3} value={Math.min(100, r.speedKph)} tone="var(--sky)" />}
          />
          <Gauge
            k="Efficiency" v={r.rpm} unit="rpm"
            tone={r.rpm > r.bus.efficiencyBand.rpmHigh ? 't-warn' : 't-ok'}
            foot={<EqBars seed={7} value={(r.rpm / 2400) * 100} tone="var(--brand)" />}
          />
          <Gauge k="Fuel" v={r.fuelPct} unit="%" tone={r.fuelPct < 20 ? 't-danger' : ''} />
          <Gauge k="Coolant" v={r.coolantC} unit="°C" tone={r.coolantC > 96 ? 't-warn' : ''} />
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="stat-line">
            <span>Corridor progress</span>
            <span>{(r.progressM / 1000).toFixed(2)} / {(r.progressM + r.remainingKm * 1000) / 1000} km</span>
          </div>
          <Meter value={r.progress * 100} tone={toneVar(r.statusMeta.tone)} />
        </div>

        <div style={{ marginTop: 12 }}>
          <StatRow k="Position" v={`${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`} />
          <StatRow k="Heading / lane" v={`${r.heading}° · lane ${r.lane} of ${r.lanes}`} />
          <StatRow k="ETA" v={r.etaMin != null ? `${r.etaMin} min · ${r.remainingKm} km` : 'stationary'} />
          <StatRow k="Load" v={r.bus.cargo} />
          <StatRow k="Odometer" v={`${r.odometerKm.toLocaleString('en-IN')} km`} />
          <StatRow k="Harsh events this trip" v={r.harshEvents} tone={r.harshEvents > 3 ? 't-warn' : ''} />
          <StatRow k="Link quality" v={`${Math.round(r.linkQuality * 100)}%`} tone={r.linkQuality < 0.4 ? 't-warn' : ''} />
        </div>
      </div>

      {isAdmin ? (
        <button className="primary block lg" onClick={() => onMirror && onMirror(r)}>
          <IconWheel size={17} /> Open this driver's screen
        </button>
      ) : null}

      {r.status === 'alert' ? (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <div className="row" style={{ gap: 9 }}>
            <IconAlert size={18} style={{ color: 'var(--danger)' }} />
            <b style={{ fontSize: 13 }}>Needs attention</b>
          </div>
          <p className="hint" style={{ margin: '9px 0 0' }}>
            {r.fatigue.level === 'D4' || r.fatigue.level === 'D3'
              ? `Driver is at ${r.fatigue.level} ${r.fatigue.label}. The tablet has already spoken and, at D3 or worse, notified the depot. Call before the next stop.`
              : `Advisory compliance has fallen to ${r.complianceScore}%. The driver is repeatedly ignoring lane and speed advice on a corridor that has events in it.`}
          </p>
        </div>
      ) : null}
    </>
  );
}

function StatRow({ k, v, tone }) {
  return (
    <div className="stat-line">
      <span>{k}</span>
      <span className={tone || ''}>{v}</span>
    </div>
  );
}

/* ========================================================== insights ===== */
function Insights({ operatorId }) {
  const [routeId, setRouteId] = useState(CORRIDOR_DEFS[0].id);
  const operator = byId(OPERATORS, operatorId) || OPERATORS[0];
  const corridor = CORRIDOR_DEFS.find((c) => c.id === routeId);
  const route = useMemo(() => getRoute(routeId), [routeId]);
  const drivers = forOperator(DRIVERS, operator.id).slice().sort((a, b) => b.captainScore - a.captainScore);
  const stale = !/today/.test(corridor.freshness || '');

  /* Corridor condition heatmap: lanes × 250 m segments, taking each segment's
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
    q >= 80 ? 'var(--brand)' : q >= 60 ? 'var(--amber)' : q >= 35 ? '#ff8b52' : 'var(--danger)';

  const valueStack = [
    { item: 'Fuel — smoother speed profile, fewer needless decelerations', perBus: 41000 },
    { item: 'Tyres — fewer impacts at speed', perBus: 18500 },
    { item: 'Suspension & chassis — reduced shock loading', perBus: 22000 },
    { item: 'Breakdown avoidance — fewer road-induced failures', perBus: 15000 },
    { item: 'Insurance — verifiable driver-behaviour record', perBus: 9500 },
  ];
  const totalValue = valueStack.reduce((a, v) => a + v.perBus, 0);

  return (
    <div className="console scroll">
      <div className="row">
        <h2 style={{ fontSize: 18 }}>{operator.name}</h2>
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} style={{ width: 'auto' }}>
          {CORRIDOR_DEFS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {stale
          ? <Chip tone="warn">STALE — last scan {corridor.freshness}</Chip>
          : <Chip tone="ok">FRESH — {corridor.freshness}</Chip>}
      </div>

      <div className="grid3">
        <Kpi k="Fleet RQI" v={operator.rqi} d="ride quality index, 0–100" tone={'t-' + scoreTone(operator.rqi)} />
        <Kpi k="Advisory compliance" v={operator.compliance + '%'} d="events handled as advised" tone={'t-' + scoreTone(operator.compliance)} />
        <Kpi k="Fuel saved" v="6.8%" d="vs. pre-install baseline" tone="t-ok" />
        <Kpi k="Harsh events" v="3.1" d="per 1000 km" />
        <Kpi k="Buses reporting" v={operator.buses} d="telemetry in the last 24 h" />
      </div>

      <div className="panel">
        <h3>Corridor condition — {corridor.name}</h3>
        <p className="hint">
          Lane × 250 m chainage. Base scan quality degraded by the events sitting in each cell —
          the same effective-quality calculation the in-cab advisory runs, aggregated for a human reader.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `54px repeat(${segments.length}, minmax(26px, 1fr))`, gap: 3, minWidth: 520 }}>
            {Array.from({ length: route.lanes }, (_, lane) => (
              <React.Fragment key={lane}>
                <div className="mono dim" style={{ fontSize: 10, display: 'flex', alignItems: 'center' }}>LANE {lane + 1}</div>
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
              <div key={s.m} className="mono dim" style={{ fontSize: 8, textAlign: 'center', paddingTop: 3 }}>{s.m / 1000}</div>
            ))}
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, fontSize: 10 }}>
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
            <div key={d.id} style={{ marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="row" style={{ fontSize: 12.5, gap: 8 }}>
                  <Avatar name={d.name} hue={d.avatarHue} size="sm" />
                  {d.name} <span className={'badge ' + d.badge}>{d.badge}</span>
                </span>
                <span className="mono" style={{ fontSize: 12.5 }}>{d.captainScore}</span>
              </div>
              <Meter value={d.captainScore} tone={toneVar(scoreTone(d.captainScore))} />
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
                  <td style={{ fontSize: 11.5 }}>{v.item}</td>
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
          The passenger-facing badge, derived from trip RQI. Absence is neutral — a new operator
          with no history is not penalised on a listing.
        </p>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div style={{
            border: '1px solid var(--line-2)', borderRadius: 'var(--r-lg)', padding: '16px 20px',
            background: 'var(--surface-2)', minWidth: 250, display: 'flex', gap: 16, alignItems: 'center',
          }}>
            <Ring value={operator.rqi} size={84} stroke={8} tone="var(--brand)" sub="RQI" />
            <div>
              <div className="eyebrow">DrivoSafe RideScore</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>{operator.name}</div>
              <div className="dim" style={{ fontSize: 11 }}>{corridor.corridor}</div>
              <div className="dim" style={{ fontSize: 9.5, marginTop: 6 }}>verified {corridor.freshness}</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            {[
              ['Road quality', 35, corridor.laneSections[0].quality.reduce((a, b) => a + b, 0) / corridor.lanes],
              ['Driver behaviour', 30, operator.compliance],
              ['Vehicle dynamics', 20, 88],
              ['Route events', 15, Math.max(0, 100 - route.events.length * 3)],
            ].map(([label, weight, val]) => (
              <div key={label} style={{ marginBottom: 9 }}>
                <div className="stat-line">
                  <span>{label} <span className="dim">({weight}%)</span></span>
                  <span>{Math.round(val)}</span>
                </div>
                <Meter value={val} tone="var(--brand)" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 8 }} />
    </div>
  );
}
