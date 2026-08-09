/* Drive screen — SYSTEM_DESIGN §13.1. The product.
 *
 * On the bus this is the whole app: kiosk-locked, landscape, no navigation.
 * The simulator strip at the bottom stands in for the sensor bus (GNSS, OBD,
 * IMU, driver camera) so the surface is demonstrable without hardware; on a
 * real unit it is absent and the same state arrives from platform adapters.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RoadHazardView, ULTRA_QUALITY, HIGH_QUALITY, EXTREME_QUALITY } from 'react-road-hazards';
import { CORRIDOR_DEFS, getRoute, ACTIVE_SHIFT, BUSES, DRIVERS, byId, DEFAULT_LAYOUT, validate, LEVEL_META, useDriveLoop } from '@drivosafe/shared';
import { storage, driveIO } from '../platform/index.js';
import TileGrid from '../components/TileGrid.jsx';

const QUALITY = { HIGH: HIGH_QUALITY, ULTRA: ULTRA_QUALITY, EXTREME: EXTREME_QUALITY };

/**
 * `shift` binds the screen to a driver, bus and corridor — normally the one the
 * check-in gate just produced.
 *
 * `mirror` is an admin watching someone else's cab. The screen is identical
 * because that is the entire point of a mirror: no sensor strip, no layout
 * editing, and the drive state is seeded from that vehicle's live telemetry
 * record rather than from local controls.
 */
export default function DriveScreen({ shift = ACTIVE_SHIFT, mirror = false, record = null }) {
  const [routeId, setRouteId] = useState(shift.routeId);
  const [running, setRunning] = useState(true);
  const [timeScale, setTimeScale] = useState(6);
  const [fatigueDial, setFatigueDial] = useState(0.15);
  const [compliant, setCompliant] = useState(true);
  const [editing, setEditing] = useState(false);
  const [quality, setQuality] = useState('ULTRA');
  const [localHour, setLocalHour] = useState(new Date().getHours());

  /* In mirror mode the local dials are not the driver's reality — the fleet
   * record is. Feed it in and stop offering the controls. */
  useEffect(() => {
    if (!mirror || !record) return;
    setRouteId(record.corridorId);
    setFatigueDial(record.fatigue.score);
    setCompliant(record.complianceScore >= 75);
    setRunning(record.speedKph > 3);
  }, [mirror, record]);

  const route = useMemo(() => getRoute(routeId), [routeId]);
  const corridor = CORRIDOR_DEFS.find((c) => c.id === routeId);
  const bus = byId(BUSES, shift.busId);
  const driver = byId(DRIVERS, shift.driverId);

  const [layout, setLayoutState] = useState(() =>
    validate(storage.get('layout:' + shift.driverId, DEFAULT_LAYOUT))
  );
  const setLayout = (l) => {
    setLayoutState(l);
    storage.set('layout:' + shift.driverId, l);
  };

  const { state, celebrate, onDriveInfo, actions } = useDriveLoop({
    route, bus, driver, running, timeScale, fatigueDial, compliant, localHour,
    platform: driveIO,
  });

  /* §11.2 safety rule: the grid is read-only in motion. The edit affordance is
   * not merely disabled — while moving it is gone, and any open edit session is
   * force-committed the moment the bus rolls. */
  const stationary = state.speed < 1;
  useEffect(() => {
    if (!stationary && editing) setEditing(false);
  }, [stationary, editing]);

  const hudRef = useRef(null);
  const [hudSize, setHudSize] = useState({ w: 640, h: 400 });
  useEffect(() => {
    if (!hudRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setHudSize({ w: Math.max(240, Math.floor(r.width)), h: Math.max(160, Math.floor(r.height)) });
    });
    ro.observe(hudRef.current);
    return () => ro.disconnect();
  }, []);

  const dms = state.drowsiness;
  const critical = dms.level === 'D4';

  const hud = (
    <div ref={hudRef} style={{ width: '100%', height: '100%' }}>
      <RoadHazardView
        mode="drive"
        route={route}
        progress={state.progress}
        lanes={route.lanes}
        laneConfig={route.laneConfig}
        driverLane={state.lane}
        detections={state.detections}
        pois={route.pois}
        viewDistance={200}
        showUpcoming={0}
        quality={QUALITY[quality]}
        environment={{ buildings: true, railings: true, traffic: 'light' }}
        compliance={{ score: state.compliance.score }}
        celebrate={celebrate}
        /* Overlays that have their own tile are suppressed in-canvas: the HUD
         * stays a driving view, and the tiles consume the same payload (§11.2). */
        show={{ policy: false, queue: false, rqi: false, laneLabels: false, score: true }}
        onDriveInfo={onDriveInfo}
        width={hudSize.w}
        height={hudSize.h}
        style={{ borderRadius: 10 }}
      />
    </div>
  );

  return (
    <div className="drive">
      <StatusBar
        corridor={corridor}
        route={route}
        state={state}
        bus={bus}
        driver={driver}
        stationary={stationary}
      />

      <AlertBar alert={state.alert} />

      <TileGrid
        layout={layout}
        setLayout={setLayout}
        editing={editing}
        state={state}
        route={route}
        onBreak={actions.takeBreak}
        hud={hud}
      />

      {mirror ? null : <SimStrip
        corridorId={routeId}
        setCorridorId={setRouteId}
        running={running}
        setRunning={setRunning}
        timeScale={timeScale}
        setTimeScale={setTimeScale}
        fatigueDial={fatigueDial}
        setFatigueDial={setFatigueDial}
        compliant={compliant}
        setCompliant={setCompliant}
        quality={quality}
        setQuality={setQuality}
        localHour={localHour}
        setLocalHour={setLocalHour}
        editing={editing}
        setEditing={setEditing}
        stationary={stationary}
        state={state}
      />}

      {critical ? (
        <div className="p0-overlay">
          <h1>MICRO-SLEEP DETECTED</h1>
          <p>
            Pull over at the next safe location. Your depot supervisor has been notified.
            This alert stays until you acknowledge it.
          </p>
          <div className="mono" style={{ fontSize: 13, opacity: 0.85 }}>
            KSS {dms.kss} · PERCLOS{' '}
            {dms.ocular ? (dms.ocular.perclos * 100).toFixed(0) + '%' : 'n/a'} · on task{' '}
            {Math.floor(dms.timeOnTaskMin)} min
          </div>
          {/* A P0 belongs to the driver. An admin watching a mirror can see it
              fire but cannot dismiss it from a desk — only the person in the
              seat can acknowledge (§9.3). */}
          {mirror ? (
            <div className="chip critical">READ-ONLY MIRROR · ONLY THE DRIVER CAN ACKNOWLEDGE</div>
          ) : (
            <div className="row" style={{ justifyContent: 'center' }}>
              <button onClick={actions.acknowledgeFatigue}>ACKNOWLEDGE</button>
              <button
                onClick={() => { actions.acknowledgeFatigue(); actions.takeBreak(); }}
                style={{ background: 'transparent', color: '#fff', borderColor: '#fff' }}
              >
                LOG BREAK NOW
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- status bar ---------- */
function StatusBar({ corridor, route, state, bus, driver, stationary }) {
  const dms = state.drowsiness;
  const meta = LEVEL_META[dms.level] || LEVEL_META.D0;
  const stale = corridor && !/today/.test(corridor.freshness || '');
  return (
    <div className="statusbar">
      <span className="chip ok">{route.name}</span>
      <span className={'chip' + (stale ? ' warn' : '')}>
        v{corridor ? corridor.version : '?'} · {corridor ? corridor.freshness : 'unknown'}
      </span>
      <span className="chip">{route.lanes} LANE</span>
      <span className="chip">{driver ? driver.name : 'no driver'}</span>
      <span className="chip">{bus ? bus.reg : 'no bus'}</span>
      <span className="spacer" />
      <span className="chip ok">GNSS</span>
      <span className={'chip ' + (bus && bus.kit !== 'Assistant app-only' ? 'ok' : 'warn')}>
        OBD {bus && bus.kit !== 'Assistant app-only' ? 'OK' : 'ABSENT'}
      </span>
      <span className={'chip ' + (dms.mode === 'full' ? 'ok' : 'warn')}>
        DMS {dms.mode === 'full' ? 'CAM' : 'CTX'}
      </span>
      <span
        className={
          'chip ' +
          (meta.tone === 'critical' ? 'critical' : meta.tone === 'danger' ? 'danger' : meta.tone === 'warn' ? 'warn' : 'ok')
        }
      >
        {dms.level} {meta.label}
      </span>
      <span className="chip">{stationary ? 'STATIONARY' : 'IN MOTION'}</span>
      <span className="chip">SYNC QUEUED</span>
    </div>
  );
}

/* ---------- alert banner ---------- */
function AlertBar({ alert }) {
  if (!alert) {
    return (
      <div className="alertbar">
        <span className="prio">QUIET</span>
        <span className="dim" style={{ fontWeight: 400, fontSize: 12 }}>
          no alert — the arbiter stays silent unless it has something worth saying
        </span>
      </div>
    );
  }
  return (
    <div className={'alertbar p' + alert.priority}>
      <span className="prio">P{alert.priority}</span>
      <span>{alert.text}</span>
    </div>
  );
}

/* ---------- simulator strip (not shipped to the cab) ---------- */
function SimStrip(props) {
  const {
    corridorId, setCorridorId, running, setRunning, timeScale, setTimeScale,
    fatigueDial, setFatigueDial, compliant, setCompliant, quality, setQuality,
    localHour, setLocalHour, editing, setEditing, stationary, state,
  } = props;

  return (
    <div className="tray" style={{ borderStyle: 'dashed' }}>
      <span className="mono dim" style={{ fontSize: 9, letterSpacing: '0.11em' }}>
        SENSOR SIM
      </span>

      <select
        value={corridorId}
        onChange={(e) => setCorridorId(e.target.value)}
        style={{ width: 'auto' }}
      >
        {CORRIDOR_DEFS.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <button onClick={() => setRunning(!running)}>{running ? 'PAUSE' : 'DRIVE'}</button>

      <label className="mono" style={{ fontSize: 10 }}>
        ×{timeScale}
        <input
          type="range" min="1" max="20" step="1" value={timeScale}
          onChange={(e) => setTimeScale(+e.target.value)}
          style={{ width: 80, marginLeft: 6 }}
        />
      </label>

      <label className="mono" style={{ fontSize: 10 }} title="Ground-truth fatigue driving the simulated driver's eyes, mouth and head">
        FATIGUE {(fatigueDial * 100).toFixed(0)}%
        <input
          type="range" min="0" max="1" step="0.01" value={fatigueDial}
          onChange={(e) => setFatigueDial(+e.target.value)}
          style={{ width: 110, marginLeft: 6 }}
        />
      </label>

      <label className="mono" style={{ fontSize: 10 }} title="Local hour — drives the circadian risk factor, which peaks 02:00–06:00">
        {String(localHour).padStart(2, '0')}:00
        <input
          type="range" min="0" max="23" step="1" value={localHour}
          onChange={(e) => setLocalHour(+e.target.value)}
          style={{ width: 90, marginLeft: 6 }}
        />
      </label>

      <button onClick={() => setCompliant(!compliant)} title="Whether the simulated driver follows the advisory">
        {compliant ? 'COMPLIANT' : 'IGNORING ADVICE'}
      </button>

      <select value={quality} onChange={(e) => setQuality(e.target.value)} style={{ width: 'auto' }}>
        {Object.keys(QUALITY).map((q) => <option key={q}>{q}</option>)}
      </select>

      <button
        onClick={() => setEditing(!editing)}
        disabled={!stationary}
        title={stationary ? 'Rearrange tiles' : 'Layout editing is disabled in motion (§11.2)'}
      >
        {editing ? 'DONE' : 'EDIT LAYOUT'}
      </button>

      <span className="spacer" />
      <span className="mono dim" style={{ fontSize: 9 }}>
        alerts 5min {state.alertStats.spokenLast5min}/30 · dropped {state.alertStats.dropped}
      </span>
    </div>
  );
}
