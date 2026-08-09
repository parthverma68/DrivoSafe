/* Pre-drive check-in — the gate between the app opening and the bus moving.
 *
 * Three steps, in order, driven entirely by @drivosafe/shared/checkin.js. This
 * file owns pixels and timers; it owns none of the rules. That split is what
 * lets the tablet and this build behave identically on the part that matters —
 * how many attempts a driver gets before the vehicle locks.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BUSES, DRIVERS, OPERATORS, ENROLMENTS, byId, forOperator, deviceBySerial, DEVICES,
  createBreathTest, createCheckinGate, verifyFace, makeCapture, ALCOHOL_POLICY,
  enrolmentFor, makeShift,
} from '@drivosafe/shared';
import CameraView, { useCamera } from '../components/CameraView.jsx';
import {
  Wordmark, Avatar, Chip, Meter, IconCheck, IconAlert, IconLock, IconFace, IconWind,
  IconChip, IconSun, IconMoon, IconSignOut, IconRefresh, IconArrow, IconBack, IconBus,
} from '../components/ui.jsx';

const STEPS = [
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'identity', label: 'Identity' },
  { id: 'alcohol', label: 'Breath test' },
];

export default function CheckinScreen(props) {
  const { account, install, onBind, onRebind, onCleared, onSignOut, theme, onToggleTheme } = props;

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

          {gate.step === 'alcohol' || gate.step === 'cleared' ? (
            <AlcoholStep
              driver={resolveDriver(gate.driver, account)}
              bus={bus}
              onResult={(s) => push(gateRef.current.applyBreath(s))}
              onCleared={() => onCleared({
                shift: makeShift({
                  driverId: (gate.driver && gate.driver.driverId) || account.driverId,
                  busId: bus ? bus.id : 'bus-1',
                  routeId: bus ? bus.routeId : undefined,
                }),
                driver: gate.driver,
              })}
              onBack={() => push(gateRef.current.back())}
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

/* ================================================== 3 · the breath test == */
function AlcoholStep({ driver, bus, onResult, onCleared, onBack }) {
  const testRef = useRef(null);
  const [simDrunk, setSimDrunk] = useState(false);

  /* The cell is rebuilt when the simulated reading changes — a real unit has
   * one cell for its life, but this is the only way to demonstrate the lockout
   * path without anyone drinking. */
  if (!testRef.current) testRef.current = createBreathTest({ readCell: () => 0 });

  const [st, setSt] = useState(() => testRef.current.state());
  const [blowMs, setBlowMs] = useState(0);
  const [now, setNow] = useState(Date.now());

  const rebuild = (drunk) => {
    testRef.current = createBreathTest({ readCell: () => (drunk ? 0.062 : 0) });
    setSt(testRef.current.warmup(Date.now()));
  };

  useEffect(() => { rebuild(simDrunk); /* eslint-disable-next-line */ }, [simDrunk]);

  /* 100 ms poll: warms the cell, advances the blow ring and auto-ends a blow
   * held past the ceiling. The machine itself keeps no timer. */
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const s = testRef.current.tick(t);
      setSt({ ...s });
      setBlowMs(testRef.current.blowMs(t));
    }, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { onResult(st); /* eslint-disable-next-line */ }, [st.state, st.attempts]);

  const start = () => { if (st.state === 'ready') setSt({ ...testRef.current.startBlow(Date.now()) }); };
  const end = () => { if (st.state === 'blowing') setSt({ ...testRef.current.endBlow(Date.now()) }); };

  /* Releasing outside the button must still end the blow. */
  useEffect(() => {
    const up = () => end();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  if (st.locked) return <Lockout bus={bus} driver={driver} state={st} />;

  if (st.passed) {
    return (
      <div className="gate-card">
        <div className="gate-head">
          <span className="eyebrow">Step 3 · cleared</span>
          <h2 className="t-ok">Clear to drive</h2>
          <p>
            {st.result && st.result.bac === 0 ? 'No alcohol detected' : `${st.result.bac.toFixed(3)} %BAC`} ·
            sample held {(st.result.durationMs / 1000).toFixed(1)} s · logged against this shift.
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
          <span className="dim" style={{ fontSize: 11.5 }}>Immobiliser released. Drive safe.</span>
          <div className="spacer" />
          <button className="primary lg" onClick={onCleared}>Start shift <IconArrow size={16} /></button>
        </div>
      </div>
    );
  }

  const P = st.policy;
  const blowing = st.state === 'blowing';
  const progress = blowing ? Math.min(1, blowMs / P.minBlowMs) : 0;
  const failed = st.state === 'fail';
  const short = st.result && st.result.valid === false;

  return (
    <div className="gate-card">
      <div className="gate-head">
        <span className="eyebrow">Step 3 · breath alcohol</span>
        <h2>Blow into the mouthpiece</h2>
        <p>
          Steady breath, {P.minBlowMs / 1000}–{P.maxBlowMs / 1000} seconds, until the ring closes.
          Fleet policy is {P.limitBac.toFixed(2)} %BAC — stricter than the {P.legalBac.toFixed(2)} %
          statutory limit, because this seat carries passengers.
        </p>
      </div>

      <div className="gate-body">
        <div className="blow-wrap">
          <BlowRing
            state={st.state}
            progress={progress}
            seconds={blowMs / 1000}
            result={st.result}
          />

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

          {short ? (
            <div className="chip warn">{st.result.message}</div>
          ) : null}

          <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
            <div className="attempt-dots" title={`${st.attempts} of ${P.maxAttempts} attempts used`}>
              {Array.from({ length: P.maxAttempts }, (_, i) => (
                <i key={i} className={i < st.attempts ? 'used' : ''} />
              ))}
            </div>
            <span className="eyebrow">{st.attemptsLeft} of {P.maxAttempts} remaining</span>
          </div>

          {st.state === 'warmup' ? (
            <button className="lg" disabled>Sensor warming up…</button>
          ) : failed ? (
            <button className="primary lg" onClick={() => setSt({ ...testRef.current.retry(Date.now()) })}>
              <IconRefresh size={17} /> Test again
            </button>
          ) : (
            <button
              className={'primary lg' + (blowing ? ' danger' : '')}
              onPointerDown={start}
              disabled={st.state !== 'ready' && !blowing}
              style={{ minWidth: 260 }}
            >
              <IconWind size={18} /> {blowing ? 'Keep blowing…' : 'Hold to blow'}
            </button>
          )}
        </div>
      </div>

      <div className="gate-foot">
        <button className="ghost" onClick={onBack}><IconBack size={15} /> Identity</button>
        <div className="spacer" />
        <label className="row" style={{ fontSize: 11.5, color: 'var(--fg-3)', gap: 7 }} title="Stands in for the BLE breathalyser cell">
          <input type="checkbox" checked={simDrunk} style={{ width: 16 }} onChange={(e) => setSimDrunk(e.target.checked)} />
          <span>Sensor sim · alcohol present</span>
        </label>
      </div>
    </div>
  );
}

function BlowRing({ state, progress, seconds, result }) {
  /* Drawn in a fixed 232-unit space and scaled by the viewBox, so the ring
   * follows whatever size the stylesheet gives it — a phone shrinks it rather
   * than having a fixed-size SVG spill out of its own container. */
  const size = 232;
  const r = 104;
  const c = 2 * Math.PI * r;
  const blowing = state === 'blowing';
  const tone = state === 'fail' ? 'var(--danger)' : blowing ? 'var(--sky)' : 'var(--brand)';

  return (
    <div className={'blow-ring' + (state === 'ready' ? ' armed' : '')}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - (state === 'fail' || state === 'pass' ? 1 : progress))}
          style={{ transition: 'stroke-dashoffset 0.12s linear' }}
        />
      </svg>
      <div className="core">
        {blowing ? (
          <>
            <div className="big mono">{seconds.toFixed(1)}</div>
            <div className="cap">seconds</div>
          </>
        ) : state === 'fail' ? (
          <>
            <div className="big mono t-danger">{result.bac.toFixed(3)}</div>
            <div className="cap">%BAC · fail</div>
          </>
        ) : state === 'warmup' ? (
          <>
            <div className="big mono dim">···</div>
            <div className="cap">warming</div>
          </>
        ) : (
          <>
            <div className="big mono">0.0</div>
            <div className="cap">ready</div>
          </>
        )}
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
