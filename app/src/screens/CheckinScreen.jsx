/* Pre-drive check-in — the gate between the app opening and the bus moving.
 *
 * Three steps, in order, driven entirely by @drivosafe/shared/checkin.js. This
 * file owns pixels and timers; it owns none of the rules. That split is what
 * lets the tablet and this build behave identically on the part that matters —
 * how many attempts a driver gets before the vehicle locks.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BUSES, DRIVERS, OPERATORS, ENROLMENTS, CORRIDOR_DEFS, byId, forOperator,
  deviceBySerial, DEVICES, createBreathTest, createSimulatedAnalyser, createCheckinGate,
  verifyFace, makeCapture, enrolmentFor, makeShift, createLockout, lockedOutAttendance,
  openAttendance,
} from '@drivosafe/shared';
import CameraView, { useCamera } from '../components/CameraView.jsx';
import {
  Wordmark, Avatar, Chip, Meter, IconCheck, IconAlert, IconLock, IconFace, IconWind,
  IconChip, IconSun, IconMoon, IconSignOut, IconRefresh, IconArrow, IconBack, IconBus,
  IconBluetooth,
} from '../components/ui.jsx';

const STEPS = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'identity', label: 'Identity' },
  { id: 'alcohol', label: 'Breath test' },
  { id: 'assignment', label: 'Bus & route' },
];

export default function CheckinScreen(props) {
  const {
    account, install, onBind, onRebind, onCleared, onSignOut, onLockout,
    theme, onToggleTheme,
  } = props;

  const gateRef = useRef(null);
  if (!gateRef.current) {
    gateRef.current = createCheckinGate({ step: install ? 'vehicle' : 'vehicle' });
  }
  const [gate, setGate] = useState(() => gateRef.current.state());
  const push = (s) => setGate({ ...s });

  const bus = install ? byId(BUSES, install.busId) : null;
  const operator = bus ? byId(OPERATORS, bus.operatorId) : null;

  return (
    <div className="stage">
      <div className="stage-bar">
        <Wordmark sub={install ? install.serial : 'unit not bound'} />
        <div className="spacer" />
        {account ? (
          <Chip>
            <Avatar name={account.name} hue={account.avatarHue} size="sm" />
            <span style={{ marginLeft: 4 }}>{account.name}</span>
          </Chip>
        ) : null}
        <button className="icon ghost" onClick={onToggleTheme} title="Day / night">
          {theme === 'day' ? <IconMoon /> : <IconSun />}
        </button>
        <button className="ghost" onClick={onSignOut}><IconSignOut size={15} /> Sign out</button>
      </div>

      <div className="stage-body">
        <div className="checkin fade-in">
          <Stepper current={gate.step} />

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
              driver={resolveDriver(gate.driver, account)}
              bus={bus}
              onResult={(s) => push(gateRef.current.applyBreath(s))}
              onLocked={(breath) => {
                /* The lock leaves the cab. The operator and an administrator are
                 * the only people who can clear it, so they are the ones told —
                 * and the driver still gets an attendance row, because being
                 * turned away is attendance data too. */
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
              }}
              onBack={() => push(gateRef.current.back())}
            />
          ) : null}

          {gate.step === 'assignment' || gate.step === 'cleared' ? (
            <AssignmentStep
              account={account}
              bus={bus}
              driver={resolveDriver(gate.driver, account)}
              onBack={() => push(gateRef.current.back())}
              onConfirm={({ busId, routeId }) => {
                const s = gateRef.current.confirmAssignment({ busId, routeId });
                push(s);
                const driverId = (gate.driver && gate.driver.driverId) || account.driverId;
                const chosen = byId(BUSES, busId);
                onCleared({
                  shift: makeShift({ driverId, busId, routeId }),
                  driver: gate.driver,
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
        </div>
      </div>
    </div>
  );
}

function resolveDriver(gateDriver, account) {
  const id = (gateDriver && gateDriver.driverId) || (account && account.driverId);
  return byId(DRIVERS, id) || { id, name: account ? account.name : 'Driver', avatarHue: 160 };
}

/* ------------------------------------------------------------ stepper ---- */
function Stepper({ current }) {
  const i = STEPS.findIndex((s) => s.id === current);
  const idx = current === 'cleared' ? STEPS.length : i;
  return (
    <div className="stepper">
      {STEPS.map((s, n) => (
        <React.Fragment key={s.id}>
          <div className={'step' + (n === idx ? ' on' : n < idx ? ' done' : '')}>
            <div className="num">{n < idx ? <IconCheck size={14} /> : n + 1}</div>
            <div className="lbl">{s.label}</div>
          </div>
          {n < STEPS.length - 1 ? <div className="rule" /> : null}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ====================================================== 1 · the vehicle === */
function VehicleStep({ install, bus, operator, onBind, onRebind, onConfirm }) {
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
      <div className="gate-card">
        <div className="gate-head">
          <span className="eyebrow">Step 1 · one-time install</span>
          <h2>Which vehicle is this unit in?</h2>
          <p>
            A tablet is bolted into one bus and bound to it once. From then on the vehicle
            is known before anyone signs in — the driver only has to prove they are the driver.
            Enter the serial printed on the case, or pick a unit below.
          </p>
        </div>

        <div className="gate-body">
          {error ? <div className="formerr"><IconAlert size={15} />{error}</div> : null}

          <form
            className="row"
            onSubmit={(e) => { e.preventDefault(); bind(serial); }}
            style={{ alignItems: 'flex-end', gap: 12 }}
          >
            <div className="field" style={{ flex: 1, minWidth: 240, marginBottom: 0 }}>
              <label htmlFor="serial">Unit serial</label>
              <input
                id="serial" value={serial} autoFocus placeholder="DS-TAB-0000"
                className="mono"
                onChange={(e) => { setSerial(e.target.value); setError(null); }}
              />
            </div>
            <button className="primary" type="submit" disabled={!serial.trim()}>
              <IconChip size={16} /> Bind unit
            </button>
          </form>

          <div className="eyebrow" style={{ margin: '22px 0 10px' }}>Units on this depot's inventory</div>
          <div className="row">
            {DEVICES.map((d) => {
              const b = byId(BUSES, d.busId);
              return (
                <button key={d.serial} className="demo-pill" onClick={() => bind(d.serial)}>
                  <span className="mono">{d.serial}</span>
                  <span className="dim"> · {b ? b.reg : '—'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const device = deviceBySerial(install.serial);
  return (
    <div className="gate-card">
      <div className="gate-head">
        <span className="eyebrow">Step 1 · vehicle recognised</span>
        <h2>{bus.reg}</h2>
        <p>
          This unit was bound to this vehicle on{' '}
          {new Date(install.boundAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
          Confirm it is the bus you are sitting in.
        </p>
      </div>

      <div className="gate-body">
        <div className="vehicle-card">
          <div className="vehicle-plate">{bus.reg}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{bus.model}</div>
            <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>
              {operator ? operator.name : '—'} · {bus.service}
            </div>
            <div className="row" style={{ marginTop: 10, gap: 6 }}>
              <Chip tone="ok"><IconChip size={12} /> {install.serial}</Chip>
              <Chip>{bus.kit}</Chip>
              <Chip tone={bus.dmsCamera ? 'ok' : 'warn'}>DMS {bus.dmsCamera ? 'CAM' : 'CTX ONLY'}</Chip>
              {device ? <Chip>fw {device.firmware}</Chip> : null}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow">Corridor</div>
            <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>{bus.routeId}</div>
          </div>
        </div>

        <div className="grid3" style={{ marginTop: 14 }}>
          <Fact k="Seats" v={bus.seats} />
          <Fact k="Transmission" v={bus.transmission} />
          <Fact k="Load" v={bus.cargo} />
        </div>
      </div>

      <div className="gate-foot">
        <button className="ghost" onClick={onRebind}>Not this vehicle — rebind unit</button>
        <div className="spacer" />
        <button className="primary" onClick={() => onConfirm({ device, bus })}>
          Confirm vehicle <IconArrow size={15} />
        </button>
      </div>
    </div>
  );
}

function Fact({ k, v }) {
  return (
    <div className="gauge">
      <div className="k">{k}</div>
      <div className="v" style={{ fontSize: 15 }}>{v}</div>
    </div>
  );
}

/* ===================================================== 2 · the driver ==== */
function IdentityStep({ account, bus, operator, onConfirm, onBack }) {
  const [phase, setPhase] = useState('idle');       // idle | scanning | done
  const [result, setResult] = useState(null);
  const [simUnknown, setSimUnknown] = useState(false);
  const { videoRef, status, live } = useCamera(true);

  /* Only drivers enrolled with this bus's operator are candidates: a Sarthi
   * face must not resolve against a Malwa driver, even if they look alike. */
  const candidates = useMemo(() => {
    const ids = new Set(forOperator(DRIVERS, bus ? bus.operatorId : null).map((d) => d.id));
    return ENROLMENTS.filter((e) => ids.has(e.driverId));
  }, [bus]);

  const capture = () => {
    setPhase('scanning');
    setResult(null);
    const mine = enrolmentFor(account.driverId);
    const template = simUnknown || !mine ? 'fp:unenrolled-' + Date.now() : mine.template;
    /* The scan is not instant on real hardware either — it takes a burst of
     * frames before the matcher will commit. */
    setTimeout(() => {
      setResult(verifyFace(makeCapture({ template, quality: live ? 0.93 : 0.88, frames: 9 }), candidates));
      setPhase('done');
    }, 1700);
  };

  const matched = result && result.matched;
  const driver = matched ? byId(DRIVERS, result.driverId) : null;

  return (
    <div className="gate-card">
      <div className="gate-head">
        <span className="eyebrow">Step 2 · driver identity</span>
        <h2>Who is taking {bus ? bus.reg : 'this vehicle'} out?</h2>
        <p>
          Look at the front camera. The frame is matched on-device against the faces enrolled
          for {operator ? operator.name : 'this operator'} — the image never leaves the cab, and
          what is compared is a 128-float embedding, not a photograph.
        </p>
      </div>

      <div className="gate-body">
        <div className="grid2">
          <CameraView
            live={live}
            videoRef={videoRef}
            kind="face"
            night
            badge={live ? 'FRONT CAM · LIVE' : status === 'denied' ? 'CAM BLOCKED · SIMULATED' : 'NO CAM · SIMULATED'}
            state={phase === 'scanning' ? 'scanning' : matched ? 'matched' : result ? 'failed' : null}
            stamp={new Date().toLocaleTimeString('en-IN', { hour12: false })}
          />

          <div>
            {phase === 'idle' ? (
              <>
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>Ready when you are</h3>
                <p className="hint">
                  Face the camera straight on, remove sunglasses, and stay still for two seconds.
                  If you are new to this vehicle you will be asked to register instead of being
                  turned away.
                </p>
                <button className="primary lg block" onClick={capture}>
                  <IconFace size={17} /> Capture &amp; verify
                </button>
                <label className="row" style={{ marginTop: 16, fontSize: 12, color: 'var(--fg-3)' }}>
                  <input
                    type="checkbox" checked={simUnknown} style={{ width: 16 }}
                    onChange={(e) => setSimUnknown(e.target.checked)}
                  />
                  <span>Simulate an unrecognised driver</span>
                </label>
              </>
            ) : null}

            {phase === 'scanning' ? (
              <div className="col" style={{ gap: 14 }}>
                <h3 style={{ fontSize: 15 }}>Matching…</h3>
                <p className="hint">Collecting frames · landmark mesh · embedding · nearest template</p>
                <Meter value={70} tone="var(--sky)" />
              </div>
            ) : null}

            {phase === 'done' && matched ? (
              <div className="fade-in">
                <Chip tone={result.status === 'review' ? 'warn' : 'ok'}>
                  <IconCheck size={13} /> {result.status === 'review' ? 'MATCHED · FLAGGED' : 'IDENTITY CONFIRMED'}
                </Chip>
                <div className="row" style={{ margin: '16px 0', gap: 14 }}>
                  <Avatar name={driver.name} hue={driver.avatarHue} size="lg" />
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 650 }}>{driver.name}</div>
                    <div className="dim mono" style={{ fontSize: 11.5, marginTop: 3 }}>{driver.licenceNo}</div>
                    <div className="row" style={{ marginTop: 8, gap: 6 }}>
                      <span className={'badge ' + driver.badge}>{driver.badge}</span>
                      <Chip>Captain {driver.captainScore}</Chip>
                    </div>
                  </div>
                </div>
                <div className="stat-line"><span>Match confidence</span><span>{(result.confidence * 100).toFixed(1)}%</span></div>
                <Meter value={result.confidence * 100} tone={result.status === 'review' ? 'var(--amber)' : 'var(--brand)'} />
                <p className="hint" style={{ marginTop: 12 }}>{result.message}</p>
              </div>
            ) : null}

            {phase === 'done' && !matched ? (
              <RegisterDriver
                account={account}
                operator={operator}
                result={result}
                onRetry={() => { setPhase('idle'); setResult(null); }}
                onRegister={(d) => onConfirm(d)}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="gate-foot">
        <button className="ghost" onClick={onBack}><IconBack size={15} /> Vehicle</button>
        <div className="spacer" />
        {phase === 'done' && matched ? (
          <>
            <button className="ghost" onClick={() => { setPhase('idle'); setResult(null); }}>
              <IconRefresh size={15} /> Not me
            </button>
            <button
              className="primary"
              onClick={() => onConfirm({ driverId: result.driverId, confidence: result.confidence, status: result.status })}
            >
              Continue to breath test <IconArrow size={15} />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* An unrecognised face is a registration, not a refusal — a relief driver at
 * 04:00 with a legitimate licence must be able to take the bus out. What they
 * cannot do is skip the record: the enrolment is provisional and the depot is
 * told before the vehicle moves. */
function RegisterDriver({ account, operator, result, onRegister, onRetry }) {
  const [name, setName] = useState(account ? account.name : '');
  const [licence, setLicence] = useState('');
  const [phone, setPhone] = useState(account ? account.phone || '' : '');

  const valid = name.trim().length > 2 && licence.trim().length >= 6;

  return (
    <div className="fade-in">
      <Chip tone="warn"><IconAlert size={13} /> NO ENROLLED MATCH</Chip>
      <p className="hint" style={{ marginTop: 12 }}>
        {result.message} Best candidate scored {(result.confidence * 100).toFixed(0)}%, below the
        floor. Register against {operator ? operator.name : 'this operator'} to continue — the
        enrolment is provisional until the depot confirms it.
      </p>

      <div className="field">
        <label>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Driving licence number</label>
        <input value={licence} className="mono" placeholder="MP09-2024-0000" onChange={(e) => setLicence(e.target.value)} />
      </div>
      <div className="field">
        <label>Mobile</label>
        <input value={phone} className="mono" onChange={(e) => setPhone(e.target.value)} />
      </div>

      <div className="row">
        <button className="ghost" onClick={onRetry}><IconRefresh size={15} /> Try the scan again</button>
        <button
          className="primary"
          disabled={!valid}
          onClick={() => onRegister({
            driverId: account.driverId,
            status: 'provisional',
            confidence: result.confidence,
            registered: { name, licence, phone, at: Date.now(), operatorId: operator ? operator.id : null },
          })}
        >
          Register &amp; continue
        </button>
      </div>
    </div>
  );
}

/* ================================================== 3 · the breath test ==
 * The analyser is a separate BLE device in the cab. Nothing on this screen can
 * produce a reading — the app asks the unit for a sample, shows the driver that
 * it is waiting, and records whatever comes back. There is deliberately no
 * gesture here that maps to "blow", because a gesture is exactly what somebody
 * would perform with the mouthpiece in another person's mouth.
 */
function AlcoholStep({ driver, bus, onResult, onLocked, onBack }) {
  const testRef = useRef(null);
  const analyserRef = useRef(null);
  const cancelRef = useRef(null);
  const [simDrunk, setSimDrunk] = useState(false);

  if (!testRef.current) testRef.current = createBreathTest();

  const [st, setSt] = useState(() => testRef.current.state());
  const [now, setNow] = useState(Date.now());

  /* The simulated unit stands in for the BLE adapter. Swapping it for the real
   * one is a change of two lines here and none in @drivosafe/shared. */
  useEffect(() => {
    analyserRef.current = createSimulatedAnalyser({
      readings: simDrunk ? [0.062, 0.058, 0.055] : [0],
      delayMs: 4200,
    });
    setSt({ ...testRef.current.pair(Date.now(), analyserRef.current.device) });
  }, [simDrunk]);

  /* 200 ms poll: brings the cell up to temperature and gives up on a device
   * that never answers. */
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setSt({ ...testRef.current.tick(t) });
    }, 200);
    return () => {
      clearInterval(id);
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  useEffect(() => { onResult(st); /* eslint-disable-next-line */ }, [st.state, st.attempts]);

  /* A lockout leaves the cab: the operator and an administrator are told, and
   * only they can clear it. Raised once, on the transition. */
  const raised = useRef(false);
  useEffect(() => {
    if (st.locked && !raised.current) {
      raised.current = true;
      onLocked(st);
    }
  }, [st.locked, st, onLocked]);

  const startAnalysis = () => {
    const t = Date.now();
    setSt({ ...testRef.current.startAnalysis(t) });
    cancelRef.current = analyserRef.current.sample((sample) => {
      setSt({ ...testRef.current.onDeviceResult(sample, Date.now()) });
    });
  };

  if (st.locked) return <Lockout bus={bus} driver={driver} state={st} />;

  if (st.passed) {
    return (
      <div className="gate-card">
        <div className="gate-head">
          <span className="eyebrow">Step 3 · cleared</span>
          <h2 className="t-ok">Clear to drive</h2>
          <p>
            {st.result.bac === 0 ? 'No alcohol detected' : `${st.result.bac.toFixed(3)} %BAC`} ·
            reported by {st.device ? st.device.name : 'the analyser'} · logged against this shift.
          </p>
        </div>
        <div className="gate-body">
          <div className="row" style={{ gap: 16 }}>
            <div style={{
              width: 86, height: 86, borderRadius: '50%', display: 'grid', placeItems: 'center',
              background: 'var(--brand-soft)', color: 'var(--brand)', flex: 'none',
            }}>
              <IconCheck size={40} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 650 }}>{driver.name}</div>
              <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                {bus ? `${bus.reg} · ${bus.service}` : 'vehicle'}
              </div>
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                <Chip tone="ok"><IconCheck size={12} /> IDENTITY</Chip>
                <Chip tone="ok"><IconCheck size={12} /> BREATH</Chip>
                <Chip tone="ok"><IconCheck size={12} /> VEHICLE</Chip>
              </div>
            </div>
          </div>
        </div>
        <div className="gate-foot">
          <span className="dim" style={{ fontSize: 11.5 }}>Next: choose the bus and route for this shift.</span>
        </div>
      </div>
    );
  }

  const P = st.policy;
  const analysing = st.state === 'analysing';
  const failed = st.state === 'fail';
  const fault = st.state === 'fault';

  return (
    <div className="gate-card">
      <div className="gate-head">
        <span className="eyebrow">Step 3 · breath alcohol</span>
        <h2>{analysing ? 'Blow into the analyser' : 'Breath test'}</h2>
        <p>
          {analysing
            ? 'Steady breath into the mouthpiece until the unit beeps. The reading comes from the analyser, not from this screen.'
            : `The cabin analyser takes the reading. Fleet policy is ${P.limitBac.toFixed(2)} %BAC — stricter than the ${P.legalBac.toFixed(2)} % statutory limit, because this seat carries passengers.`}
        </p>
      </div>

      <div className="gate-body">
        <div className="blow-wrap">
          <AnalyserDial state={st.state} progress={testRef.current.waitProgress(now)} result={st.result} />

          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <Chip tone={st.state === 'pairing' ? 'warn' : fault ? 'danger' : 'ok'}>
              <IconBluetooth size={12} />
              {st.device ? st.device.name : 'ANALYSER'} ·{' '}
              {st.state === 'pairing' ? 'PAIRING' : fault ? 'NO READING' : 'CONNECTED'}
            </Chip>
            {st.device && st.device.battery != null ? (
              <Chip>BATTERY {Math.round(st.device.battery * 100)}%</Chip>
            ) : null}
          </div>

          {failed ? (
            <div className="formerr" style={{ marginBottom: 0 }}>
              <IconAlert size={16} />
              <span>
                <b>{st.result.bac.toFixed(3)} %BAC — above the {P.limitBac.toFixed(2)} limit.</b>{' '}
                {st.result.message} {st.attemptsLeft} attempt{st.attemptsLeft === 1 ? '' : 's'} left before
                the vehicle locks.
              </span>
            </div>
          ) : null}

          {fault ? (
            <div className="chip warn" style={{ maxWidth: 420, whiteSpace: 'normal', lineHeight: 1.5, padding: '8px 12px' }}>
              {st.result.message} This does not count as an attempt.
            </div>
          ) : null}

          <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
            <div className="attempt-dots" title={`${st.attempts} of ${P.maxAttempts} attempts used`}>
              {Array.from({ length: P.maxAttempts }, (_, i) => (
                <i key={i} className={i < st.attempts ? 'used' : ''} />
              ))}
            </div>
            <span className="eyebrow">{st.attemptsLeft} of {P.maxAttempts} remaining</span>
          </div>

          {st.state === 'pairing' ? (
            <button className="lg" disabled>Connecting to the analyser…</button>
          ) : analysing ? (
            <button className="lg" disabled style={{ minWidth: 260 }}>
              <IconWind size={18} /> Waiting for the analyser…
            </button>
          ) : failed || fault ? (
            <button className="primary lg" onClick={() => setSt({ ...testRef.current.retry(Date.now()) })}>
              <IconRefresh size={17} /> Test again
            </button>
          ) : (
            <button className="primary lg" onClick={startAnalysis} style={{ minWidth: 260 }}>
              <IconWind size={18} /> Start analysis
            </button>
          )}
        </div>
      </div>

      <div className="gate-foot">
        <button className="ghost" onClick={onBack} disabled={analysing}><IconBack size={15} /> Identity</button>
        <div className="spacer" />
        <label className="row" style={{ fontSize: 11.5, color: 'var(--fg-3)', gap: 7 }} title="Stands in for the BLE analyser's readings">
          <input type="checkbox" checked={simDrunk} style={{ width: 16 }} onChange={(e) => setSimDrunk(e.target.checked)} disabled={analysing} />
          <span>Device sim · alcohol present</span>
        </label>
      </div>
    </div>
  );
}

/* The dial is a *waiting* indicator, not a measurement: there is nothing to
 * measure until the device speaks. While analysing it breathes rather than
 * filling, so it never implies the app knows how the sample is going. */
function AnalyserDial({ state, progress, result }) {
  const size = 232;
  const r = 104;
  const c = 2 * Math.PI * r;
  const analysing = state === 'analysing';
  const tone = state === 'fail' ? 'var(--danger)' : state === 'fault' ? 'var(--amber)'
    : analysing ? 'var(--sky)' : 'var(--brand)';

  return (
    <div className={'blow-ring' + (state === 'ready' ? ' armed' : '') + (analysing ? ' analysing' : '')}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={analysing ? `${c * 0.22} ${c}` : c}
          strokeDashoffset={analysing ? 0 : c * (state === 'idle' || state === 'pairing' ? 1 : 0)}
          className={analysing ? 'spin' : ''}
          style={{ transition: analysing ? 'none' : 'stroke-dashoffset 0.4s var(--ease)' }}
        />
      </svg>
      <div className="core">
        {analysing ? (
          <>
            <div className="wave" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="cap">blow now</div>
          </>
        ) : state === 'fail' ? (
          <>
            <div className="big mono t-danger">{result.bac.toFixed(3)}</div>
            <div className="cap">%BAC · fail</div>
          </>
        ) : state === 'fault' ? (
          <>
            <div className="big mono t-warn">—</div>
            <div className="cap">no reading</div>
          </>
        ) : state === 'pairing' ? (
          <>
            <div className="big mono dim">···</div>
            <div className="cap">pairing</div>
          </>
        ) : (
          <>
            <div className="big mono">0.000</div>
            <div className="cap">ready</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================ 4 · bus and route ====== */
function AssignmentStep({ account, bus, driver, onConfirm, onBack }) {
  /* A driver may only be assigned a vehicle inside their own operator. The
   * bound unit's bus is the default because it is nearly always the right
   * answer — but a relief driver moved to another vehicle in the yard has to be
   * able to say so, and a route is a choice every shift. */
  const fleet = useMemo(
    () => forOperator(BUSES, bus ? bus.operatorId : account.operatorId),
    [bus, account]
  );
  const [busId, setBusId] = useState(bus ? bus.id : (fleet[0] || {}).id);
  const chosenBus = byId(BUSES, busId) || fleet[0];
  const [routeId, setRouteId] = useState(
    (chosenBus && chosenBus.routeId) || CORRIDOR_DEFS[0].id
  );
  const corridor = CORRIDOR_DEFS.find((c) => c.id === routeId) || CORRIDOR_DEFS[0];
  const stale = !/today/.test(corridor.freshness || '');

  const pickBus = (id) => {
    setBusId(id);
    const b = byId(BUSES, id);
    if (b && b.routeId) setRouteId(b.routeId);
  };

  return (
    <div className="gate-card">
      <div className="gate-head">
        <span className="eyebrow">Step 4 · assignment</span>
        <h2>Which bus, and which route?</h2>
        <p>
          You are cleared to drive. Confirm the vehicle you are taking out and the corridor you
          are running — the corridor decides which road model is loaded before you move.
        </p>
      </div>

      <div className="gate-body">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Vehicle</div>
        <div className="pick-grid">
          {fleet.map((b) => (
            <button
              key={b.id}
              className={'pick' + (b.id === busId ? ' on' : '')}
              onClick={() => pickBus(b.id)}
            >
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{b.reg}</span>
                {b.id === (bus && bus.id) ? <Chip tone="ok">THIS UNIT</Chip> : null}
              </div>
              <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>{b.model}</div>
              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>{b.service} · {b.seats} seats</div>
              <div className="row" style={{ marginTop: 8, gap: 5 }}>
                <Chip tone={b.dmsCamera ? 'ok' : 'warn'}>{b.dmsCamera ? 'DMS CAM' : 'CTX ONLY'}</Chip>
                <Chip>{b.transmission}</Chip>
              </div>
            </button>
          ))}
        </div>

        <div className="eyebrow" style={{ margin: '22px 0 10px' }}>Corridor</div>
        <div className="pick-grid">
          {CORRIDOR_DEFS.map((c) => {
            const old = !/today/.test(c.freshness || '');
            return (
              <button
                key={c.id}
                className={'pick' + (c.id === routeId ? ' on' : '')}
                onClick={() => setRouteId(c.id)}
              >
                <div style={{ fontWeight: 640, fontSize: 13 }}>{c.name}</div>
                <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
                  {c.lanes} lanes · {(c.length / 1000).toFixed(1)} km · {c.events.length} events
                </div>
                <div className="row" style={{ marginTop: 8, gap: 5 }}>
                  <Chip tone={old ? 'warn' : 'ok'}>{old ? 'STALE' : 'FRESH'} · {c.freshness}</Chip>
                  <Chip>v{c.version}</Chip>
                </div>
              </button>
            );
          })}
        </div>

        {stale ? (
          <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
            This corridor was last scanned {corridor.freshness}. The advisory will run, and every
            event it announces will carry its age — an old scan is worth having, as long as nobody
            is told it is fresh.
          </p>
        ) : null}
      </div>

      <div className="gate-foot">
        <button className="ghost" onClick={onBack}><IconBack size={15} /> Breath test</button>
        <div className="spacer" />
        <span className="dim" style={{ fontSize: 11.5 }}>
          {driver.name} · {chosenBus ? chosenBus.reg : '—'}
        </span>
        <button
          className="primary lg"
          disabled={!chosenBus}
          onClick={() => onConfirm({ busId: chosenBus.id, routeId })}
        >
          Start shift <IconArrow size={16} />
        </button>
      </div>
    </div>
  );
}


function Lockout({ bus, driver, state }) {
  const code = 'LK-' + String(bus ? bus.id : 'bus').toUpperCase().replace(/[^A-Z0-9]/g, '') + '-' +
    new Date().toISOString().slice(5, 10).replace('-', '');
  const worst = state.history.filter((h) => h.valid && !h.override).reduce((a, h) => Math.max(a, h.bac || 0), 0);

  return (
    <div className="gate-card fade-in">
      <div className="gate-body" style={{ paddingTop: 26 }}>
        <div className="lockout">
          <div style={{
            width: 78, height: 78, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--danger)', color: '#fff', margin: '0 auto 18px',
          }}>
            <IconLock size={38} />
          </div>
          <h2>VEHICLE LOCKED</h2>
          <p style={{ maxWidth: 520, margin: '12px auto 0', color: 'var(--fg-2)', fontSize: 13.5, lineHeight: 1.65 }}>
            Three failed breath tests. The immobiliser stays engaged and this vehicle cannot be
            started. Your depot supervisor and {bus ? bus.reg : 'the fleet'}'s operator have been
            notified with the readings and the time.
          </p>
          <div className="code">{code}</div>
          <p className="dim" style={{ fontSize: 11, marginTop: 12 }}>
            Quote this code to the supervisor. Only a supervisor override clears it — retrying will not.
          </p>
        </div>

        <div className="grid3" style={{ marginTop: 16 }}>
          <Fact k="Driver" v={driver.name} />
          <Fact k="Highest reading" v={worst.toFixed(3) + ' %BAC'} />
          <Fact k="Attempts" v={`${state.attempts} / ${state.policy.maxAttempts}`} />
        </div>

        <table style={{ marginTop: 14 }}>
          <thead>
            <tr><th>#</th><th>Reading</th><th>Sample</th><th className="num">Verdict</th></tr>
          </thead>
          <tbody>
            {state.history.filter((h) => !h.override).map((h, i) => (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td className="mono t-danger">{h.bac.toFixed(3)} %BAC</td>
                <td className="mono dim">{(h.durationMs / 1000).toFixed(1)} s</td>
                <td className="num t-danger">{h.overLegal ? 'OVER STATUTORY' : 'OVER POLICY'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gate-foot">
        <IconBus size={16} />
        <span className="dim" style={{ fontSize: 11.5 }}>
          {bus ? `${bus.reg} · ${bus.model}` : 'vehicle'} — immobilised
        </span>
      </div>
    </div>
  );
}
