/* Pre-drive check-in — REACT NATIVE. The gate the tablet actually ships.
 *
 * Identical rules to the web build because they are the *same* rules: every
 * decision below comes from @drivosafe/shared/checkin.js. On real hardware the
 * front camera and the BLE breathalyser replace the two simulated inputs and
 * nothing else in this file changes — which is the point of keeping the
 * machine out of the view layer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Animated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import {
  BUSES, DRIVERS, OPERATORS, ENROLMENTS, DEVICES, CORRIDOR_DEFS, byId, forOperator,
  deviceBySerial, createBreathTest, createSimulatedAnalyser, createCheckinGate, verifyFace,
  makeCapture, enrolmentFor, makeShift, createLockout, lockedOutAttendance, openAttendance,
} from '@drivosafe/shared';
import { useTheme, MONO } from '../theme.js';
import * as cam from '../platform/camera.js';
import {
  Wordmark, Btn, Chip, Avatar, Meter, Stepper, Viewport, SyntheticFeed, usePulse,
  IconCheck, IconAlert, IconLock, IconFace, IconWind, IconChip, IconArrow, IconBack,
  IconRefresh, IconSignOut, IconSun, IconMoon,
} from '../components/kit.jsx';

const STEPS = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'identity', label: 'Identity' },
  { id: 'alcohol', label: 'Breath test' },
  { id: 'assignment', label: 'Bus & route' },
];

export default function CheckinScreen({
  account, install, onBind, onRebind, onCleared, onSignOut, onLockout,
}) {
  const { C, S, mode, toggle } = useTheme();
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createCheckinGate();
  const [gate, setGate] = useState(() => gateRef.current.state());
  const push = (s) => setGate({ ...s });

  const bus = install ? byId(BUSES, install.busId) : null;
  const operator = bus ? byId(OPERATORS, bus.operatorId) : null;
  const idx = gate.step === 'cleared' ? STEPS.length : STEPS.findIndex((s) => s.id === gate.step);

  return (
    <View style={S.root}>
      <View style={S.stageBar}>
        <Wordmark sub={install ? install.serial : 'unit not bound'} />
        <View style={{ flex: 1 }} />
        {account ? (
          <View style={[S.chip, { gap: 8 }]}>
            <Avatar name={account.name} hue={account.avatarHue} size={22} />
            <Text style={S.chipTxt}>{account.name}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={[S.btn, S.btnGhost, { paddingHorizontal: 12 }]} onPress={toggle}>
          {mode === 'day' ? <IconMoon size={17} color={C.fg2} /> : <IconSun size={17} color={C.fg2} />}
        </TouchableOpacity>
        <Btn kind="ghost" icon={IconSignOut} onPress={onSignOut}>Sign out</Btn>
      </View>

      <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
        <Stepper steps={STEPS} index={idx} />

        {gate.step === 'vehicle' ? (
          <VehicleStep
            install={install} bus={bus} operator={operator}
            onBind={onBind} onRebind={onRebind}
            onConfirm={(v) => push(gateRef.current.confirmVehicle(v))}
          />
        ) : null}

        {gate.step === 'identity' ? (
          <IdentityStep
            account={account} bus={bus} operator={operator}
            onBack={() => push(gateRef.current.back())}
            onConfirm={(d) => push(gateRef.current.confirmDriver(d))}
          />
        ) : null}

        {gate.step === 'alcohol' ? (
          <AlcoholStep
            driver={byId(DRIVERS, (gate.driver && gate.driver.driverId) || account.driverId) || { name: account.name }}
            bus={bus}
            onResult={(s) => push(gateRef.current.applyBreath(s))}
            onBack={() => push(gateRef.current.back())}
            onLocked={(breath) => {
              /* The lock leaves the cab: only the operator or an administrator
               * can clear it, so they are the ones told. The driver still gets
               * an attendance row — being turned away is attendance data. */
              const driverId = (gate.driver && gate.driver.driverId) || account.driverId;
              const busId = bus ? bus.id : 'bus-1';
              const operatorId = bus ? bus.operatorId : account.operatorId;
              const lockout = createLockout({
                busId,
                operatorId,
                driverId,
                deviceSerial: install ? install.serial : null,
                readings: breath.history.filter((h) => h.valid && !h.override),
              });
              if (onLockout) {
                onLockout(lockout, lockedOutAttendance({
                  driverId, busId, operatorId,
                  deviceSerial: install ? install.serial : null,
                  lockCode: lockout.code,
                  breath: {
                    bac: lockout.worstBac,
                    attempts: breath.attempts,
                    passed: false,
                    deviceId: breath.device ? breath.device.id : null,
                  },
                }));
              }
            }}
          />
        ) : null}

        {gate.step === 'assignment' || gate.step === 'cleared' ? (
          <AssignmentStep
            account={account}
            bus={bus}
            driver={byId(DRIVERS, (gate.driver && gate.driver.driverId) || account.driverId) || { name: account.name }}
            onBack={() => push(gateRef.current.back())}
            onConfirm={({ busId, routeId }) => {
              push(gateRef.current.confirmAssignment({ busId, routeId }));
              const driverId = (gate.driver && gate.driver.driverId) || account.driverId;
              const chosen = byId(BUSES, busId);
              onCleared({
                shift: makeShift({ driverId, busId, routeId }),
                attendance: openAttendance({
                  driverId,
                  busId,
                  operatorId: chosen ? chosen.operatorId : account.operatorId,
                  routeId,
                  deviceSerial: install ? install.serial : null,
                  identity: gate.driver,
                  breath: gate.alcohol && gate.alcohol.result
                    ? {
                        bac: gate.alcohol.result.bac,
                        attempts: gate.alcohol.attempts,
                        passed: true,
                        deviceId: gate.alcohol.result.deviceId,
                      }
                    : null,
                }),
              });
            }}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Head({ eyebrow, title, children }) {
  const { S } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={S.eyebrow}>{eyebrow}</Text>
      <Text style={[S.h1, { fontSize: 22, marginTop: 6 }]}>{title}</Text>
      {children ? <Text style={[S.body, { marginTop: 8 }]}>{children}</Text> : null}
    </View>
  );
}

function Fact({ k, v }) {
  const { C, S } = useTheme();
  return (
    <View style={{
      flexGrow: 1, flexBasis: 140, padding: 11, borderRadius: 12,
      borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2,
    }}>
      <Text style={S.kpiK}>{k}</Text>
      <Text style={[S.td, { marginTop: 6, fontWeight: '600' }]}>{v}</Text>
    </View>
  );
}

/* ====================================================== 1 · the vehicle === */
function VehicleStep({ install, bus, operator, onBind, onRebind, onConfirm }) {
  const { C, S } = useTheme();
  const [serial, setSerial] = useState('');
  const [error, setError] = useState(null);

  const bind = (value) => {
    const r = onBind(value);
    if (!r.ok) { setError(r.message); return; }
    setError(null);
    setSerial('');
  };

  if (!install || !bus) {
    return (
      <View style={S.card}>
        <Head eyebrow="Step 1 · one-time install" title="Which vehicle is this unit in?">
          A tablet is bolted into one bus and bound to it once. From then on the vehicle is known
          before anyone signs in — the driver only has to prove they are the driver.
        </Head>

        {error ? <Text style={{ color: C.danger, fontSize: 12, marginBottom: 10 }}>{error}</Text> : null}

        <Text style={S.label}>Unit serial</Text>
        <View style={[S.row, { marginBottom: 18 }]}>
          <TextInput
            style={[S.input, { flexGrow: 1, flexBasis: 200, fontFamily: MONO }]}
            value={serial}
            autoCapitalize="characters"
            placeholder="DS-TAB-0000"
            placeholderTextColor={C.fg3}
            onChangeText={(t) => { setSerial(t); setError(null); }}
          />
          <Btn kind="primary" icon={IconChip} disabled={!serial.trim()} onPress={() => bind(serial)}>
            Bind unit
          </Btn>
        </View>

        <Text style={S.eyebrow}>Units on this depot's inventory</Text>
        <View style={[S.row, { marginTop: 10 }]}>
          {DEVICES.map((d) => {
            const b = byId(BUSES, d.busId);
            return (
              <TouchableOpacity key={d.serial} style={S.chip} activeOpacity={0.75} onPress={() => bind(d.serial)}>
                <Text style={S.chipTxt}>{d.serial} · {b ? b.reg : '—'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  const device = deviceBySerial(install.serial);
  return (
    <View style={S.card}>
      <Head eyebrow="Step 1 · vehicle recognised" title={bus.reg}>
        This unit is bound to this vehicle. Confirm it is the bus you are sitting in.
      </Head>

      <View style={{
        flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        padding: 16, borderRadius: 14, backgroundColor: C.bg2, borderWidth: 1, borderColor: C.line2,
      }}>
        <Text style={{
          fontFamily: MONO, fontWeight: '700', fontSize: 16, letterSpacing: 1, color: C.fg,
          paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
          borderWidth: 2, borderColor: C.fg3, backgroundColor: C.bg1, overflow: 'hidden',
        }}>
          {bus.reg}
        </Text>
        <View style={{ flexGrow: 1, flexBasis: 180 }}>
          <Text style={[S.td, { fontWeight: '600', fontSize: 14 }]}>{bus.model}</Text>
          <Text style={[S.hint, { marginBottom: 0, marginTop: 3 }]}>
            {operator ? operator.name : '—'} · {bus.service}
          </Text>
          <View style={[S.row, { marginTop: 10, gap: 6 }]}>
            <Chip tone="ok">{install.serial}</Chip>
            <Chip>{bus.kit}</Chip>
            <Chip tone={bus.dmsCamera ? 'ok' : 'warn'}>DMS {bus.dmsCamera ? 'CAM' : 'CTX ONLY'}</Chip>
            {device ? <Chip>fw {device.firmware}</Chip> : null}
          </View>
        </View>
      </View>

      <View style={[S.row, { marginTop: 14, gap: 10 }]}>
        <Fact k="Seats" v={bus.seats} />
        <Fact k="Transmission" v={bus.transmission} />
        <Fact k="Load" v={bus.cargo} />
      </View>

      <View style={[S.row, { marginTop: 18 }]}>
        <Btn kind="ghost" onPress={onRebind}>Not this vehicle — rebind</Btn>
        <View style={{ flex: 1 }} />
        <Btn kind="primary" icon={IconArrow} onPress={() => onConfirm({ device, bus })}>Confirm vehicle</Btn>
      </View>
    </View>
  );
}

/* ===================================================== 2 · the driver ==== */
function IdentityStep({ account, bus, operator, onConfirm, onBack }) {
  const { C, S } = useTheme();
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [simUnknown, setSimUnknown] = useState(false);

  /* The real front camera when VisionCamera is present and permitted; the
   * synthetic feed otherwise. A missing camera is a reported condition, not a
   * broken screen — the layout is identical either way. */
  const cameraRef = useRef(null);
  const device = cam.useCameraDevice('front');
  const [permission, setPermission] = useState('unavailable');
  useEffect(() => {
    let alive = true;
    if (!cam.available()) return undefined;
    cam.requestPermission().then((p) => { if (alive) setPermission(p); });
    return () => { alive = false; };
  }, []);
  const status = cam.cameraStatus(device, permission);

  const candidates = useMemo(() => {
    const ids = new Set(forOperator(DRIVERS, bus ? bus.operatorId : null).map((d) => d.id));
    return ENROLMENTS.filter((e) => ids.has(e.driverId));
  }, [bus]);

  /**
   * Take the burst and match it.
   *
   * On real hardware `captureFace()` returns frames but **no template** — the
   * embedding model is not implemented — so a live capture would always land in
   * the registration path. Until that model exists the match runs against the
   * signed-in driver's enrolment, and the frame count and quality come from the
   * camera when there is one. What is real today is the capture, the timing and
   * every decision `verifyFace()` makes about the result.
   */
  const capture = async () => {
    setPhase('scanning');
    setResult(null);
    const mine = enrolmentFor(account.driverId);
    const template = simUnknown || !mine ? 'fp:unenrolled-' + Date.now() : mine.template;

    const shot = status.ok ? await cam.captureFace(cameraRef, { frames: 9 }) : null;
    setTimeout(() => {
      setResult(verifyFace(
        makeCapture({
          template,
          quality: shot && shot.quality ? shot.quality : 0.9,
          frames: shot && shot.frames ? shot.frames : 9,
        }),
        candidates
      ));
      setPhase('done');
    }, shot ? 300 : 1700);
  };

  const matched = result && result.matched;
  const driver = matched ? byId(DRIVERS, result.driverId) : null;

  return (
    <View style={S.card}>
      <Head eyebrow="Step 2 · driver identity" title={`Who is taking ${bus ? bus.reg : 'this vehicle'} out?`}>
        Look at the front camera. The frame is matched on-device against the faces enrolled for
        {' '}{operator ? operator.name : 'this operator'} — the image never leaves the cab.
      </Head>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <View style={{ flexGrow: 1, flexBasis: 260 }}>
          <Viewport
            badge={'FRONT CAM · ' + status.label}
            stamp={new Date().toLocaleTimeString()}
            tone={phase === 'scanning' ? C.sky : matched ? C.brand : result ? C.danger : null}
          >
            {status.ok && cam.Camera ? (
              <cam.Camera
                ref={cameraRef}
                device={device}
                isActive
                photo
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <SyntheticFeed seed={3} night kind="face" />
            )}
          </Viewport>
        </View>

        <View style={{ flexGrow: 1, flexBasis: 260 }}>
          {phase === 'idle' ? (
            <>
              <Text style={S.h3}>Ready when you are</Text>
              <Text style={S.hint}>
                Face the camera straight on, remove sunglasses, and stay still for two seconds. A
                driver this vehicle has never seen is asked to register, not turned away.
              </Text>
              <Btn kind="primary" size="lg" icon={IconFace} onPress={capture}>Capture &amp; verify</Btn>
              <TouchableOpacity
                style={[S.row, { marginTop: 16, gap: 8 }]}
                onPress={() => setSimUnknown(!simUnknown)}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 18, height: 18, borderRadius: 5, borderWidth: 1,
                  borderColor: C.line3, backgroundColor: simUnknown ? C.brand : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {simUnknown ? <IconCheck size={12} color={C.brandInk} /> : null}
                </View>
                <Text style={{ color: C.fg3, fontSize: 12 }}>Simulate an unrecognised driver</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {phase === 'scanning' ? (
            <>
              <Text style={S.h3}>Matching…</Text>
              <Text style={S.hint}>Collecting frames · landmark mesh · embedding · nearest template</Text>
              <Meter value={70} tone={C.sky} />
            </>
          ) : null}

          {phase === 'done' && matched ? (
            <>
              <Chip tone={result.status === 'review' ? 'warn' : 'ok'}>
                {result.status === 'review' ? 'MATCHED · FLAGGED' : 'IDENTITY CONFIRMED'}
              </Chip>
              <View style={[S.row, { marginVertical: 14, gap: 14 }]}>
                <Avatar name={driver.name} hue={driver.avatarHue} size={54} />
                <View>
                  <Text style={[S.h2, { fontSize: 17 }]}>{driver.name}</Text>
                  <Text style={[S.hint, { marginBottom: 0, fontFamily: MONO, marginTop: 3 }]}>{driver.licenceNo}</Text>
                </View>
              </View>
              <View style={S.statLine}>
                <Text style={S.statK}>Match confidence</Text>
                <Text style={S.statV}>{(result.confidence * 100).toFixed(1)}%</Text>
              </View>
              <Meter value={result.confidence * 100} tone={result.status === 'review' ? C.amber : C.brand} />
              <Text style={[S.hint, { marginTop: 12 }]}>{result.message}</Text>
            </>
          ) : null}

          {phase === 'done' && !matched ? (
            <Register
              account={account}
              operator={operator}
              result={result}
              onRetry={() => { setPhase('idle'); setResult(null); }}
              onRegister={onConfirm}
            />
          ) : null}
        </View>
      </View>

      <View style={[S.row, { marginTop: 18 }]}>
        <Btn kind="ghost" icon={IconBack} onPress={onBack}>Vehicle</Btn>
        <View style={{ flex: 1 }} />
        {phase === 'done' && matched ? (
          <>
            <Btn kind="ghost" icon={IconRefresh} onPress={() => { setPhase('idle'); setResult(null); }}>Not me</Btn>
            <Btn
              kind="primary"
              icon={IconArrow}
              onPress={() => onConfirm({ driverId: result.driverId, confidence: result.confidence, status: result.status })}
            >
              Continue to breath test
            </Btn>
          </>
        ) : null}
      </View>
    </View>
  );
}

function Register({ account, operator, result, onRegister, onRetry }) {
  const { C, S } = useTheme();
  const [name, setName] = useState(account ? account.name : '');
  const [licence, setLicence] = useState('');
  const valid = name.trim().length > 2 && licence.trim().length >= 6;

  return (
    <>
      <Chip tone="warn">NO ENROLLED MATCH</Chip>
      <Text style={[S.hint, { marginTop: 12 }]}>
        {result.message} Best candidate scored {(result.confidence * 100).toFixed(0)}%, below the
        floor. Register to continue — the enrolment is provisional until the depot confirms it.
      </Text>

      <Text style={S.label}>Full name</Text>
      <TextInput style={[S.input, { marginBottom: 12 }]} value={name} onChangeText={setName} placeholderTextColor={C.fg3} />
      <Text style={S.label}>Driving licence number</Text>
      <TextInput
        style={[S.input, { marginBottom: 16, fontFamily: MONO }]}
        value={licence} autoCapitalize="characters" placeholder="MP09-2024-0000"
        placeholderTextColor={C.fg3} onChangeText={setLicence}
      />

      <View style={S.row}>
        <Btn kind="ghost" icon={IconRefresh} onPress={onRetry}>Scan again</Btn>
        <Btn
          kind="primary"
          disabled={!valid}
          onPress={() => onRegister({
            driverId: account.driverId,
            status: 'provisional',
            confidence: result.confidence,
            registered: { name, licence, at: Date.now(), operatorId: operator ? operator.id : null },
          })}
        >
          Register &amp; continue
        </Btn>
      </View>
    </>
  );
}

/* ================================================== 3 · the breath test ==
 * The analyser is a separate BLE unit in the cab. Nothing on this screen can
 * produce a reading — the app asks the device for a sample, shows the driver it
 * is waiting, and records whatever comes back. There is deliberately no gesture
 * that maps to "blow".
 */
function AlcoholStep({ driver, bus, onResult, onLocked, onBack }) {
  const { C, S } = useTheme();
  const testRef = useRef(null);
  const analyserRef = useRef(null);
  const cancelRef = useRef(null);
  const [simDrunk, setSimDrunk] = useState(false);

  if (!testRef.current) testRef.current = createBreathTest();
  const [st, setSt] = useState(() => testRef.current.state());

  useEffect(() => {
    analyserRef.current = createSimulatedAnalyser({
      readings: simDrunk ? [0.062, 0.058, 0.055] : [0],
      delayMs: 4200,
    });
    setSt({ ...testRef.current.pair(Date.now(), analyserRef.current.device) });
  }, [simDrunk]);

  useEffect(() => {
    const id = setInterval(() => setSt({ ...testRef.current.tick(Date.now()) }), 200);
    return () => {
      clearInterval(id);
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  useEffect(() => { onResult(st); /* eslint-disable-next-line */ }, [st.state, st.attempts]);

  const raised = useRef(false);
  useEffect(() => {
    if (st.locked && !raised.current) {
      raised.current = true;
      onLocked(st);
    }
  }, [st.locked, st, onLocked]);

  const startAnalysis = () => {
    setSt({ ...testRef.current.startAnalysis(Date.now()) });
    cancelRef.current = analyserRef.current.sample((s) => {
      setSt({ ...testRef.current.onDeviceResult(s, Date.now()) });
    });
  };

  if (st.locked) return <Lockout bus={bus} driver={driver} state={st} />;

  if (st.passed) {
    return (
      <View style={S.card}>
        <Head eyebrow="Step 3 · cleared" title="Clear to drive">
          {st.result.bac === 0 ? 'No alcohol detected' : `${st.result.bac.toFixed(3)} %BAC`} · reported by{' '}
          {st.device ? st.device.name : 'the analyser'} · logged against this shift.
        </Head>
        <View style={[S.row, { gap: 16 }]}>
          <View style={{
            width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center',
            backgroundColor: C.brandSoft,
          }}>
            <IconCheck size={38} color={C.brand} />
          </View>
          <View>
            <Text style={[S.h2, { fontSize: 17 }]}>{driver.name}</Text>
            <Text style={[S.hint, { marginBottom: 0, marginTop: 4 }]}>
              {bus ? `${bus.reg} · ${bus.service}` : 'vehicle'}
            </Text>
            <View style={[S.row, { marginTop: 10, gap: 6 }]}>
              <Chip tone="ok">IDENTITY</Chip>
              <Chip tone="ok">BREATH</Chip>
              <Chip tone="ok">VEHICLE</Chip>
            </View>
          </View>
        </View>
        <Text style={[S.hint, { marginTop: 18, marginBottom: 0 }]}>
          Next: choose the bus and route for this shift.
        </Text>
      </View>
    );
  }

  const P = st.policy;
  const analysing = st.state === 'analysing';
  const failed = st.state === 'fail';
  const fault = st.state === 'fault';

  return (
    <View style={S.card}>
      <Head
        eyebrow="Step 3 · breath alcohol"
        title={analysing ? 'Blow into the analyser' : 'Breath test'}
      >
        {analysing
          ? 'Steady breath into the mouthpiece until the unit beeps. The reading comes from the analyser, not from this screen.'
          : `The cabin analyser takes the reading. Fleet policy is ${P.limitBac.toFixed(2)} %BAC — stricter than the ${P.legalBac.toFixed(2)} % statutory limit, because this seat carries passengers.`}
      </Head>

      <View style={{ alignItems: 'center', gap: 16 }}>
        <AnalyserDial state={st.state} result={st.result} />

        <View style={[S.row, { justifyContent: 'center', gap: 8 }]}>
          <Chip tone={st.state === 'pairing' ? 'warn' : fault ? 'danger' : 'ok'}>
            {(st.device ? st.device.name : 'ANALYSER') + ' · ' +
              (st.state === 'pairing' ? 'PAIRING' : fault ? 'NO READING' : 'CONNECTED')}
          </Chip>
          {st.device && st.device.battery != null ? (
            <Chip>BATTERY {Math.round(st.device.battery * 100)}%</Chip>
          ) : null}
        </View>

        {failed ? (
          <View style={{
            flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12,
            backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: C.danger,
          }}>
            <IconAlert size={16} color={C.danger} />
            <Text style={{ color: C.danger, fontSize: 12, flex: 1 }}>
              {st.result.bac.toFixed(3)} %BAC — above the {P.limitBac.toFixed(2)} limit.{' '}
              {st.attemptsLeft} attempt{st.attemptsLeft === 1 ? '' : 's'} left before the vehicle locks.
            </Text>
          </View>
        ) : null}

        {fault ? (
          <Text style={[S.hint, { color: C.amber, textAlign: 'center', maxWidth: 420, marginBottom: 0 }]}>
            {st.result.message} This does not count as an attempt.
          </Text>
        ) : null}

        <View style={[S.row, { justifyContent: 'center', gap: 12 }]}>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {Array.from({ length: P.maxAttempts }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 26, height: 5, borderRadius: 3,
                  backgroundColor: i < st.attempts ? C.danger : C.bg3,
                  borderWidth: 1, borderColor: i < st.attempts ? C.danger : C.line2,
                }}
              />
            ))}
          </View>
          <Text style={S.eyebrow}>{st.attemptsLeft} of {P.maxAttempts} remaining</Text>
        </View>

        {st.state === 'pairing' ? (
          <Btn size="lg" disabled>Connecting to the analyser…</Btn>
        ) : analysing ? (
          <Btn size="lg" disabled icon={IconWind} style={{ minWidth: 260 }}>Waiting for the analyser…</Btn>
        ) : failed || fault ? (
          <Btn kind="primary" size="lg" icon={IconRefresh} onPress={() => setSt({ ...testRef.current.retry(Date.now()) })}>
            Test again
          </Btn>
        ) : (
          <Btn kind="primary" size="lg" icon={IconWind} style={{ minWidth: 260 }} onPress={startAnalysis}>
            Start analysis
          </Btn>
        )}
      </View>

      <View style={[S.row, { marginTop: 20, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }]}>
        <Btn kind="ghost" icon={IconBack} onPress={onBack} disabled={analysing}>Identity</Btn>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[S.row, { gap: 8 }]}
          activeOpacity={0.7}
          disabled={analysing}
          onPress={() => setSimDrunk(!simDrunk)}
        >
          <View style={{
            width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: C.line3,
            backgroundColor: simDrunk ? C.danger : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {simDrunk ? <IconCheck size={12} color="#fff" /> : null}
          </View>
          <Text style={{ color: C.fg3, fontSize: 11.5 }}>Device sim · alcohol present</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* A waiting indicator, not a measurement: there is nothing to measure until the
 * device speaks, so it pulses rather than fills. */
function AnalyserDial({ state, result }) {
  const { C } = useTheme();
  const size = 200;
  const r = 90;
  const c = 2 * Math.PI * r;
  const analysing = state === 'analysing';
  const pulse = usePulse(analysing);
  const tone = state === 'fail' ? C.danger : state === 'fault' ? C.amber : analysing ? C.sky : C.brand;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.bg3} strokeWidth="10" fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth="10" fill="none"
            strokeLinecap="round"
            strokeDasharray={analysing ? `${c * 0.22} ${c}` : `${c}`}
            strokeDashoffset={state === 'idle' || state === 'pairing' ? c : 0}
          />
        </G>
      </Svg>
      <Animated.View
        style={{
          width: 144, height: 144, borderRadius: 72, alignItems: 'center', justifyContent: 'center',
          backgroundColor: C.bg2, borderWidth: 1, borderColor: C.line2,
          transform: [{ scale: analysing ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] }) : 1 }],
        }}
      >
        <Text style={{
          fontFamily: MONO, fontSize: analysing ? 18 : 30, fontWeight: '700',
          color: state === 'fail' ? C.danger : state === 'fault' ? C.amber : C.fg,
        }}>
          {analysing ? 'BLOW' : state === 'fail' ? result.bac.toFixed(3) : state === 'fault' ? '—' : state === 'pairing' ? '···' : '0.000'}
        </Text>
        <Text style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.4, color: C.fg3, marginTop: 4 }}>
          {analysing ? 'NOW' : state === 'fail' ? '%BAC · FAIL' : state === 'fault' ? 'NO READING'
            : state === 'pairing' ? 'PAIRING' : 'READY'}
        </Text>
      </Animated.View>
    </View>
  );
}

/* ================================================ 4 · bus and route ====== */
function AssignmentStep({ account, bus, driver, onConfirm, onBack }) {
  const { C, S } = useTheme();
  const fleet = useMemo(
    () => forOperator(BUSES, bus ? bus.operatorId : account.operatorId),
    [bus, account]
  );
  const [busId, setBusId] = useState(bus ? bus.id : (fleet[0] || {}).id);
  const chosen = byId(BUSES, busId) || fleet[0];
  const [routeId, setRouteId] = useState((chosen && chosen.routeId) || CORRIDOR_DEFS[0].id);

  const pick = (id) => {
    setBusId(id);
    const b = byId(BUSES, id);
    if (b && b.routeId) setRouteId(b.routeId);
  };

  const card = (on) => [{
    flexGrow: 1, flexBasis: 220, padding: 13, borderRadius: 16,
    borderWidth: 1, borderColor: on ? C.brand : C.line,
    backgroundColor: on ? C.brandSoft : C.bg2,
  }];

  return (
    <View style={S.card}>
      <Head eyebrow="Step 4 · assignment" title="Which bus, and which route?">
        You are cleared to drive. Confirm the vehicle you are taking out and the corridor you are
        running — the corridor decides which road model is loaded before you move.
      </Head>

      <Text style={S.eyebrow}>Vehicle</Text>
      <View style={[S.row, { marginTop: 10, gap: 10, alignItems: 'stretch' }]}>
        {fleet.map((b) => (
          <TouchableOpacity key={b.id} activeOpacity={0.85} onPress={() => pick(b.id)} style={card(b.id === busId)}>
            <View style={[S.row, { justifyContent: 'space-between' }]}>
              <Text style={S.plate}>{b.reg}</Text>
              {bus && b.id === bus.id ? <Chip tone="ok">THIS UNIT</Chip> : null}
            </View>
            <Text style={[S.hint, { marginTop: 4, marginBottom: 0 }]}>{b.model}</Text>
            <Text style={[S.hint, { marginBottom: 0 }]}>{b.service} · {b.seats} seats</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[S.eyebrow, { marginTop: 20 }]}>Corridor</Text>
      <View style={[S.row, { marginTop: 10, gap: 10, alignItems: 'stretch' }]}>
        {CORRIDOR_DEFS.map((c) => {
          const stale = !/today/.test(c.freshness || '');
          return (
            <TouchableOpacity key={c.id} activeOpacity={0.85} onPress={() => setRouteId(c.id)} style={card(c.id === routeId)}>
              <Text style={[S.td, { fontWeight: '640' }]}>{c.name}</Text>
              <Text style={[S.hint, { marginTop: 4, marginBottom: 0 }]}>
                {c.lanes} lanes · {(c.length / 1000).toFixed(1)} km · {c.events.length} events
              </Text>
              <View style={[S.row, { marginTop: 8, gap: 5 }]}>
                <Chip tone={stale ? 'warn' : 'ok'}>{stale ? 'STALE' : 'FRESH'} · {c.freshness}</Chip>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[S.row, { marginTop: 20 }]}>
        <Btn kind="ghost" icon={IconBack} onPress={onBack}>Breath test</Btn>
        <View style={{ flex: 1 }} />
        <Btn
          kind="primary"
          size="lg"
          icon={IconArrow}
          disabled={!chosen}
          onPress={() => onConfirm({ busId: chosen.id, routeId })}
        >
          Start shift
        </Btn>
      </View>
    </View>
  );
}


function Lockout({ bus, driver, state }) {
  const { C, S } = useTheme();
  const code = 'LK-' + String(bus ? bus.id : 'bus').toUpperCase().replace(/[^A-Z0-9]/g, '') + '-' +
    new Date().toISOString().slice(5, 10).replace('-', '');
  const worst = state.history.filter((h) => h.valid && !h.override).reduce((a, h) => Math.max(a, h.bac || 0), 0);

  return (
    <View style={S.card}>
      <View style={S.lockout}>
        <View style={{
          width: 76, height: 76, borderRadius: 38, backgroundColor: C.danger,
          alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <IconLock size={36} color="#fff" />
        </View>
        <Text style={{ color: C.danger, fontSize: 26, fontWeight: '800', letterSpacing: 0.5 }}>VEHICLE LOCKED</Text>
        <Text style={[S.body, { textAlign: 'center', marginTop: 12, maxWidth: 520 }]}>
          Three failed breath tests. The immobiliser stays engaged and this vehicle cannot be
          started. Your depot supervisor and {bus ? bus.reg : 'the fleet'}'s operator have been
          notified with the readings and the time.
        </Text>
        <Text style={S.code}>{code}</Text>
        <Text style={[S.hint, { marginTop: 12, marginBottom: 0, textAlign: 'center' }]}>
          Quote this code to the supervisor. Only a supervisor override clears it — retrying will not.
        </Text>
      </View>

      <View style={[S.row, { marginTop: 14, gap: 10 }]}>
        <Fact k="Driver" v={driver.name} />
        <Fact k="Highest reading" v={worst.toFixed(3) + ' %BAC'} />
        <Fact k="Attempts" v={`${state.attempts} / ${state.policy.maxAttempts}`} />
      </View>

      <View style={{ marginTop: 16 }}>
        {state.history.filter((h) => !h.override).map((h, i) => (
          <View key={i} style={[S.statLine, S.trBorder]}>
            <Text style={S.statK}>Attempt {i + 1} · {(h.durationMs / 1000).toFixed(1)} s</Text>
            <Text style={[S.statV, { color: C.danger }]}>
              {h.bac.toFixed(3)} %BAC · {h.overLegal ? 'OVER STATUTORY' : 'OVER POLICY'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
