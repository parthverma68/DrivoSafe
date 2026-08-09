/* Drive screen — REACT NATIVE. SYSTEM_DESIGN §13.1. The product.
 *
 * This is the tablet surface: kiosk-locked, landscape, no navigation. The HUD
 * comes from the same `RoadHazardView` import as the web build — Metro reads
 * the package's `react-native` entry and resolves the Skia renderer instead of
 * the <canvas> one, so the engine, advisory and hysteresis are identical.
 *
 * The sensor-sim strip stands in for the GNSS / OBD / IMU / driver-camera bus.
 * On a real unit it is absent and the same state arrives from src/platform.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { RoadHazardView, HIGH_QUALITY, ULTRA_QUALITY, EXTREME_QUALITY } from 'react-road-hazards';
import {
  CORRIDOR_DEFS, getRoute, ACTIVE_SHIFT, BUSES, DRIVERS, byId,
  DEFAULT_LAYOUT, validate, LEVEL_META, useDriveLoop,
} from '@drivosafe/shared';
import { storage, driveIO } from '../platform/index.js';
import { C, S, MONO, TONE_COLOR, alertStyle } from '../theme.js';
import { Chip, Btn, Slider, Cycler } from '../components/ui.jsx';
import TileGrid from '../components/TileGrid.jsx';

/* Native defaults one notch below web: the Skia renderer draws the same
 * segments but a tablet SoC has less headroom than a laptop, and §6.3 forbids
 * dropping below HIGH while moving. */
const QUALITY = { HIGH: HIGH_QUALITY, ULTRA: ULTRA_QUALITY, EXTREME: EXTREME_QUALITY };

/**
 * `shift` binds the screen to the driver, bus and corridor the check-in gate
 * just cleared. `mirror` is an admin watching a live cab from a console: the
 * sensor strip goes away and the drive state is seeded from that vehicle's
 * telemetry record instead of from local controls.
 */
export default function DriveScreen({ shift = ACTIVE_SHIFT, mirror = false, record = null }) {
  const [routeId, setRouteId] = useState(shift.routeId);
  const [running, setRunning] = useState(true);
  const [timeScale, setTimeScale] = useState(6);
  const [fatigueDial, setFatigueDial] = useState(0.15);
  const [compliant, setCompliant] = useState(true);
  const [editing, setEditing] = useState(false);
  const [quality, setQuality] = useState('HIGH');
  const [localHour, setLocalHour] = useState(new Date().getHours());

  /* In mirror mode the local dials are not the driver's reality — the fleet
   * record is. Feed it in; the controls that would fight it are not rendered. */
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

  const dms = state.drowsiness;
  const critical = dms.level === 'D4';

  /* The grid measures the anchor cell and hands its pixel size back, because
   * the Skia canvas needs explicit dimensions. */
  const hud = (w, h) => (
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
       * stays a driving view and the tiles consume the same payload (§11.2). */
      show={{ policy: false, queue: false, rqi: false, laneLabels: false, score: true }}
      onDriveInfo={onDriveInfo}
      width={w}
      height={h}
    />
  );

  return (
    <View style={{ flex: 1, padding: 8, gap: 8 }}>
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

      {mirror ? null : (
        <SimStrip
          {...{
            routeId, setRouteId, running, setRunning, timeScale, setTimeScale,
            fatigueDial, setFatigueDial, compliant, setCompliant, quality, setQuality,
            localHour, setLocalHour, editing, setEditing, stationary, state,
          }}
        />
      )}

      {critical ? (
        <View
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
            backgroundColor: 'rgba(150,8,38,0.95)',
            alignItems: 'center', justifyContent: 'center', padding: 30, zIndex: 200,
          }}
        >
          <Text style={{ fontFamily: MONO, fontSize: 40, color: '#fff', letterSpacing: 1.5, fontWeight: '700' }}>
            MICRO-SLEEP DETECTED
          </Text>
          <Text style={{ fontSize: 17, color: '#fff', textAlign: 'center', maxWidth: 620, marginTop: 16, lineHeight: 24 }}>
            Pull over at the next safe location. Your depot supervisor has been notified.
            This alert stays until you acknowledge it.
          </Text>
          <Text style={{ fontFamily: MONO, fontSize: 13, color: '#ffd9e1', marginTop: 14 }}>
            KSS {dms.kss} · PERCLOS {dms.ocular ? (dms.ocular.perclos * 100).toFixed(0) + '%' : 'n/a'} · on task{' '}
            {Math.floor(dms.timeOnTaskMin)} min
          </Text>
          {/* A P0 belongs to the driver. A console watching a mirror can see it
              fire but cannot dismiss it from a desk — only the person in the
              seat can acknowledge (§9.3). */}
          {mirror ? (
            <Text style={{ fontFamily: MONO, fontSize: 12, color: '#ffd9e1', marginTop: 22, letterSpacing: 1 }}>
              READ-ONLY MIRROR · ONLY THE DRIVER CAN ACKNOWLEDGE
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 22 }}>
              <Btn
                onPress={actions.acknowledgeFatigue}
                style={{ backgroundColor: '#fff', borderColor: '#fff', paddingHorizontal: 28, paddingVertical: 13 }}
              >
                <Text style={{ color: '#7a0420', fontWeight: '800', fontSize: 16 }}>ACKNOWLEDGE</Text>
              </Btn>
              <Btn
                onPress={() => { actions.acknowledgeFatigue(); actions.takeBreak(); }}
                style={{ backgroundColor: 'transparent', borderColor: '#fff', paddingHorizontal: 28, paddingVertical: 13 }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>LOG BREAK NOW</Text>
              </Btn>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- status bar ---------- */
function StatusBar({ corridor, route, state, bus, driver, stationary }) {
  const dms = state.drowsiness;
  const meta = LEVEL_META[dms.level] || LEVEL_META.D0;
  const stale = corridor && !/today/.test(corridor.freshness || '');
  const levelTone =
    meta.tone === 'critical' ? 'critical' : meta.tone === 'danger' ? 'danger' :
    meta.tone === 'warn' ? 'warn' : 'ok';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Chip tone="ok">{route.name}</Chip>
        <Chip tone={stale ? 'warn' : undefined}>
          v{corridor ? corridor.version : '?'} · {corridor ? corridor.freshness : 'unknown'}
        </Chip>
        <Chip>{route.lanes} LANE</Chip>
        <Chip>{driver ? driver.name : 'no driver'}</Chip>
        <Chip>{bus ? bus.reg : 'no bus'}</Chip>
        <Chip tone="ok">GNSS</Chip>
        <Chip tone={bus && bus.kit !== 'Assistant app-only' ? 'ok' : 'warn'}>
          OBD {bus && bus.kit !== 'Assistant app-only' ? 'OK' : 'ABSENT'}
        </Chip>
        <Chip tone={dms.mode === 'full' ? 'ok' : 'warn'}>
          DMS {dms.mode === 'full' ? 'CAM' : 'CTX'}
        </Chip>
        <Chip tone={levelTone}>{dms.level} {meta.label}</Chip>
        <Chip>{stationary ? 'STATIONARY' : 'IN MOTION'}</Chip>
        <Chip>SYNC QUEUED</Chip>
      </View>
    </ScrollView>
  );
}

/* ---------- alert banner ---------- */
function AlertBar({ alert }) {
  if (!alert) {
    return (
      <View style={S.alertbar}>
        <Text style={S.alertPrio}>QUIET</Text>
        <Text style={{ fontSize: 12, color: C.fg3, flexShrink: 1 }}>
          no alert — the arbiter stays silent unless it has something worth saying
        </Text>
      </View>
    );
  }
  return (
    <View style={[S.alertbar, alertStyle(alert.priority)]}>
      <Text style={S.alertPrio}>P{alert.priority}</Text>
      <Text style={S.alertTxt} numberOfLines={1}>{alert.text}</Text>
    </View>
  );
}

/* ---------- simulator strip (not shipped to the cab) ---------- */
function SimStrip(p) {
  return (
    <View style={[S.panel, { marginBottom: 0, paddingVertical: 8, borderStyle: 'dashed', borderColor: C.line2 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[S.tileTitle, { marginBottom: 0 }]}>SENSOR SIM</Text>

          <Cycler
            options={CORRIDOR_DEFS.map((c) => ({ value: c.id, label: c.name }))}
            value={p.routeId}
            onChange={p.setRouteId}
            width={190}
          />

          <Btn onPress={() => p.setRunning(!p.running)}>{p.running ? 'PAUSE' : 'DRIVE'}</Btn>

          <View>
            <Text style={[S.chipTxt, { fontSize: 9 }]}>×{p.timeScale}</Text>
            <Slider value={p.timeScale} min={1} max={20} step={1} onChange={p.setTimeScale} width={90} />
          </View>

          <View>
            <Text style={[S.chipTxt, { fontSize: 9 }]}>FATIGUE {(p.fatigueDial * 100).toFixed(0)}%</Text>
            <Slider value={p.fatigueDial} min={0} max={1} step={0.01} onChange={p.setFatigueDial} width={110} />
          </View>

          <View>
            <Text style={[S.chipTxt, { fontSize: 9 }]}>
              {String(p.localHour).padStart(2, '0')}:00
            </Text>
            <Slider value={p.localHour} min={0} max={23} step={1} onChange={p.setLocalHour} width={90} />
          </View>

          <Btn onPress={() => p.setCompliant(!p.compliant)}>
            {p.compliant ? 'COMPLIANT' : 'IGNORING ADVICE'}
          </Btn>

          <Cycler options={Object.keys(QUALITY)} value={p.quality} onChange={p.setQuality} />

          <Btn onPress={() => p.setEditing(!p.editing)} disabled={!p.stationary}>
            {p.editing ? 'DONE' : 'EDIT LAYOUT'}
          </Btn>

          <Text style={{ fontFamily: MONO, fontSize: 9, color: C.fg3 }}>
            alerts 5min {p.state.alertStats.spokenLast5min}/30 · dropped {p.state.alertStats.dropped}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
