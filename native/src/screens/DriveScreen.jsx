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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { RoadHazardView, HIGH_QUALITY, ULTRA_QUALITY, EXTREME_QUALITY } from 'react-road-hazards';
import {
  CORRIDOR_DEFS, getRoute, ACTIVE_SHIFT, BUSES, DRIVERS, byId,
  DEFAULT_LAYOUT, profileFor, layoutForProfile, isCompact, validate, LEVEL_META, useDriveLoop,
  createShiftRecorders,
} from '@drivosafe/shared';
import { storage, driveIO } from '../platform/index.js';
import * as cam from '../platform/camera.js';
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

  /* The tablet is a landscape appliance, but the same binary runs on a phone —
   * a supervisor's handset, or a small in-cab unit. A phone gets the reduced
   * grid from §11.2 profiles (HUD + speed & gear, next hazard, trip score)
   * rather than nine unreadable tiles, and that grid is fixed, so a saved
   * tablet dashboard is neither loaded nor overwritten. */
  const { width, height } = useWindowDimensions();
  const profile = profileFor(width, height);
  const compact = isCompact(profile);

  const [savedLayout, setSavedLayout] = useState(() =>
    validate(storage.get('layout:' + shift.driverId, DEFAULT_LAYOUT))
  );
  const layout = compact ? layoutForProfile(profile) : savedLayout;
  const setLayout = (l) => {
    if (compact) return;
    setSavedLayout(l);
    storage.set('layout:' + shift.driverId, l);
  };

  const { state, celebrate, onDriveInfo, actions } = useDriveLoop({
    route, bus, driver, running, timeScale, fatigueDial, compliant, localHour,
    platform: driveIO,
  });

  /* ---- the two cameras ----------------------------------------------------
   * Both start with the shift and stop with it: the rear one captures the road
   * surface continuously with chainage attached, the front one cuts a clip when
   * the DMS worsens. Nothing is analysed on device — the models are not built
   * (see shared/src/recording.js). A mirror does not record: a console watching
   * this cab is not a second camera in it. */
  const recordersRef = useRef(null);
  if (!recordersRef.current) recordersRef.current = createShiftRecorders();
  const [recorders, setRecorders] = useState(() => recordersRef.current.state());

  useEffect(() => {
    if (mirror) return undefined;
    const rec = recordersRef.current;
    rec.start(Date.now());
    return () => rec.stop(Date.now());
  }, [mirror]);

  /* The 1 Hz sampler must read the *current* drive state, not the state that
   * existed when the interval was created — a clip labelled with the chainage
   * the bus had at shift start is worse than an unlabelled one, because it
   * looks correct. A ref is the cheap way to keep one interval and still see
   * fresh values. */
  const driveStateRef = useRef(null);
  driveStateRef.current = state;

  useEffect(() => {
    if (mirror) return undefined;
    const id = setInterval(() => {
      const s = driveStateRef.current;
      if (!s) return;
      recordersRef.current.tick(Date.now(), {
        chainageM: s.progress,
        lane: s.lane,
        speedKph: s.speed,
        dmsLevel: s.drowsiness.level,
        routeId,
        busId: shift.busId,
        driverId: shift.driverId,
      });
      setRecorders(recordersRef.current.state());
    }, 1000);
    return () => clearInterval(id);
  }, [mirror, routeId, shift.busId, shift.driverId]);

  const tileState = useMemo(() => ({ ...state, recorders }), [state, recorders]);

  /* §11.2 safety rule: the grid is read-only in motion. The edit affordance is
   * not merely disabled — while moving it is gone, and any open edit session is
   * force-committed the moment the bus rolls. */
  const stationary = state.speed < 1;
  useEffect(() => {
    if ((!stationary || compact) && editing) setEditing(false);
  }, [stationary, editing, compact]);

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
      {mirror ? null : <RearCamera active={recorders.rear.recording} />}

      <StatusBar
        recorders={mirror ? null : recorders}
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
        profile={profile}
        editing={editing}
        state={tileState}
        route={route}
        onBreak={actions.takeBreak}
        hud={hud}
      />

      {mirror ? null : (
        <SimStrip
          {...{
            routeId, setRouteId, running, setRunning, timeScale, setTimeScale,
            fatigueDial, setFatigueDial, compliant, setCompliant, quality, setQuality,
            localHour, setLocalHour, editing, setEditing, stationary, state, compact,
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

/* ---------- rear camera ----------
 * The road-facing capture surface. VisionCamera needs a mounted <Camera> to
 * record, and the driver must not have a second video window competing with the
 * HUD for attention — so it is mounted at the edge of the screen, one pixel
 * wide and transparent. The *disclosure* is not hidden: the status bar carries
 * a REC chip whenever this is live, and the road-scan tile shows the clip count.
 *
 * Segment boundaries come from shared/src/recording.js, so the tablet and the
 * browser build agree on clip length, buffering and eviction; this file only
 * starts and stops the hardware.
 */
function RearCamera({ active }) {
  const ref = useRef(null);
  const device = cam.useCameraDevice('back');
  const [permission, setPermission] = useState('unavailable');
  const recorderRef = useRef(null);

  useEffect(() => {
    let alive = true;
    if (!cam.available()) return undefined;
    cam.requestPermission().then((p) => { if (alive) setPermission(p); });
    return () => { alive = false; };
  }, []);

  const status = cam.cameraStatus(device, permission);

  useEffect(() => {
    if (!status.ok) return undefined;
    if (!recorderRef.current) recorderRef.current = cam.createVideoRecorder(ref, {});
    if (active) recorderRef.current.start();
    return () => { if (recorderRef.current) recorderRef.current.stop(); };
  }, [status.ok, active]);

  if (!status.ok || !cam.Camera) return null;
  /* Parked off-screen rather than collapsed to a pixel: Android needs a real
   * surface of a sane size to attach a capture session to, and a 1x1 preview is
   * a reliable way to get a camera that reports ready and records nothing. */
  return (
    <View
      style={{ position: 'absolute', left: -200, top: 0, width: 160, height: 120, opacity: 0 }}
      pointerEvents="none"
    >
      <cam.Camera ref={ref} device={device} isActive={active} video style={{ flex: 1 }} />
    </View>
  );
}

/* ---------- status bar ---------- */
function StatusBar({ corridor, route, state, bus, driver, stationary, recorders }) {
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
        {/* Both cameras are disclosed on the status bar, always. A cab that
            films the driver and does not say so is the version of this product
            nobody should ship. */}
        {recorders ? (
          <>
            <Chip tone="danger">REC ROAD {recorders.rear.clipCount}</Chip>
            <Chip tone="warn">DMS CLIPS {recorders.front.clipCount}</Chip>
          </>
        ) : null}
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

          {/* the compact grid is fixed, so there is nothing to edit */}
          {p.compact ? null : (
            <Btn onPress={() => p.setEditing(!p.editing)} disabled={!p.stationary}>
              {p.editing ? 'DONE' : 'EDIT LAYOUT'}
            </Btn>
          )}

          <Text style={{ fontFamily: MONO, fontSize: 9, color: C.fg3 }}>
            alerts 5min {p.state.alertStats.spokenLast5min}/30 · dropped {p.state.alertStats.dropped}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
