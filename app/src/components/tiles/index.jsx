/* Info tiles — SYSTEM_DESIGN §11.2.
 *
 * Every tile here is a thin presentational view over ONE live payload: the
 * HUD engine's `drive` info plus telemetry. That is the whole point of the
 * design — adding a tile type is a new component and zero new plumbing.
 */
import React from 'react';
import { getEventType } from 'react-road-hazards';
import { LEVEL_META } from '@drivosafe/shared';

/* POI flag colours match the HUD's: petrol yellow, rest-stop green, mechanic red */
const POI_COLOR = {
  'petrol-pump': '#ffbe50',
  'rest-stop': '#46e6aa',
  mechanic: '#ff5c60',
};

const TONE_CLASS = {
  danger: 't-danger', warn: 't-warn', accent: 't-ok', neutral: 'dim',
  ok: 't-ok', watch: 't-watch', critical: 't-critical',
};
const ROLE_COLOR = {
  PRIMARY: '#46e6aa', FALLBACK: '#8fd6ff', OK: '#6b7a85',
  AVOID: '#ff5c60', EXCLUDED: '#3d4b57',
};

/* ---------- lane policy ---------- */
export function LanePolicyTile({ s }) {
  const d = s.driveInfo;
  const lanes = (d && d.laneInfo) || [];
  const policy = (d && d.policyText) || 'ACQUIRING';
  const reduce = s.advisory && s.advisory.reduceSpeed;
  return (
    <>
      <div className="tile-title">Lane policy</div>
      <div className="tile-body">
        <div
          className={'mono ' + (reduce ? 't-danger' : 't-ok')}
          style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}
        >
          {policy}
        </div>
        <div className="lanebars" style={{ marginTop: 8, height: 46 }}>
          {lanes.map((l) => (
            <div className="lanebar" key={l.lane}>
              <div
                className="fill"
                style={{
                  height: Math.max(4, l.score * 0.42) + 'px',
                  background: ROLE_COLOR[l.role] || '#6b7a85',
                }}
              />
              <div className="lbl" style={{ color: ROLE_COLOR[l.role] }}>
                L{l.lane + 1}
              </div>
            </div>
          ))}
        </div>
        <div className="tile-note">
          you: L{s.lane + 1}
          {s.advisory && s.advisory.primary != null
            ? ` · hold L${s.advisory.primary + 1}`
            : ''}
        </div>
      </div>
    </>
  );
}

/* ---------- speed & gear ---------- */
export function SpeedGearTile({ s }) {
  const slowTo = s.driveInfo && s.driveInfo.slowTo;
  const over = slowTo != null && s.speed > slowTo + 6;
  const g = s.gear;
  return (
    <>
      <div className="tile-title">Speed &amp; gear</div>
      <div className="tile-body">
        <div className={'tile-hero ' + (over ? 't-danger' : '')}>
          {s.speed}
          <span style={{ fontSize: 12, marginLeft: 4 }} className="dim">km/h</span>
        </div>
        <div className="tile-sub">
          {slowTo != null ? (
            <span className={over ? 't-danger' : 't-warn'}>SLOW TO {slowTo}</span>
          ) : (
            <span className="dim">cruise</span>
          )}
        </div>
        <div className="tile-note">
          {g.gear ? `gear ${g.gear} · ${s.rpm} rpm` : `${s.rpm} rpm · auto`}
          {g.advice ? (
            <span className="t-warn"> · SHIFT {g.advice}</span>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ---------- next hazard ---------- */
export function NextHazardTile({ s }) {
  const d = s.driveInfo;
  const ev = d && d.nextEvent;
  if (!ev) {
    return (
      <>
        <div className="tile-title">Next hazard</div>
        <div className="tile-body">
          <div className="tile-hero sm t-ok">ROAD CLEAR</div>
          <div className="tile-sub dim">nothing in the 200 m window</div>
        </div>
      </>
    );
  }
  const T = getEventType(ev.type);
  const dist = Math.round(d.distance);
  return (
    <>
      <div className="tile-title">Next hazard</div>
      <div className="tile-body">
        <div className={'mono ' + TONE_CLASS[T.tone]} style={{ fontSize: 13, fontWeight: 700 }}>
          {T.name}
        </div>
        <div className={'tile-hero ' + TONE_CLASS[T.tone]} style={{ marginTop: 3 }}>
          {dist <= 0 ? 'NOW' : dist}
          {dist > 0 ? <span style={{ fontSize: 12 }} className="dim"> m</span> : null}
        </div>
        <div className="tile-note">
          {ev.lane != null ? `lane ${ev.lane + 1} · ` : 'full width · '}
          {ev.confidence || 'med'} conf
        </div>
        <div className="tile-note dim">verified {ev.verifiedAt || 'unknown'}</div>
      </div>
    </>
  );
}

/* ---------- driver state (DMS) ---------- */
export function DrowsinessTile({ s, onBreak }) {
  const d = s.drowsiness;
  const meta = LEVEL_META[d.level] || LEVEL_META.D0;
  const oc = d.ocular;
  return (
    <>
      <div className="tile-title">
        Driver state
        <span className="chip" style={{ fontSize: 8, padding: '1px 5px' }}>
          {d.mode === 'full' ? 'CAM' : 'CTX'}
        </span>
      </div>
      <div className="tile-body">
        {d.calibrating ? (
          <>
            <div className="tile-hero sm dim">CALIBRATING</div>
            <div className="tile-sub dim">90 s open-eye baseline</div>
          </>
        ) : (
          <>
            <div className={'tile-hero sm ' + TONE_CLASS[meta.tone]}>
              {d.level} <span style={{ fontSize: 12 }}>{meta.label}</span>
            </div>
            <div className="tile-sub">
              KSS {d.kss} · conf {d.confidence}
            </div>
            <div className="tile-note">
              {oc
                ? `PERCLOS ${(oc.perclos * 100).toFixed(0)}% · long blinks ${oc.longBlinkRate.toFixed(1)}/min`
                : 'context-only — capped at D2'}
            </div>
            <div className="tile-note dim">
              on task {Math.floor(d.timeOnTaskMin)} min
            </div>
          </>
        )}
        {(d.level === 'D2' || d.level === 'D3' || d.level === 'D4') && onBreak ? (
          <button
            className="primary"
            style={{ marginTop: 7, fontSize: 11, padding: '5px 8px' }}
            onClick={onBreak}
          >
            LOG BREAK
          </button>
        ) : null}
      </div>
    </>
  );
}

/* ---------- trip score ---------- */
export function TripScoreTile({ s }) {
  const c = s.compliance;
  const tone = c.score >= 85 ? 't-ok' : c.score >= 70 ? 't-warn' : 't-danger';
  return (
    <>
      <div className="tile-title">Trip score</div>
      <div className="tile-body">
        <div className={'tile-hero ' + tone}>{c.score}</div>
        <div className="tile-sub">
          RQI {s.rqi.score} · {c.passed}/{c.counted} passed
        </div>
        <div className="tile-note">
          {c.excluded} exonerated · {c.demerits} demerits
        </div>
        <div className="tile-note dim">
          {c.behaviour.harshBrakes} harsh · {c.behaviour.overspeedPct}% overspeed
        </div>
      </div>
    </>
  );
}

/* ---------- upcoming queue ---------- */
export function UpcomingTile({ s, route }) {
  const list = route.upcoming(s.progress, 5);
  return (
    <>
      <div className="tile-title">Upcoming</div>
      <div className="tile-body scroll" style={{ justifyContent: 'flex-start' }}>
        {list.length === 0 ? (
          <div className="dim mono" style={{ fontSize: 11 }}>corridor clear</div>
        ) : (
          list.map((u) => (
            <div className="stat-line" key={u.event.id}>
              <span className={TONE_CLASS[u.tone]} style={{ fontSize: 10 }}>{u.name}</span>
              <span>{u.passing ? 'NOW' : u.distance + 'm'}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ---------- amenities ---------- */
export function AmenitiesTile({ s }) {
  const list = (s.driveInfo && s.driveInfo.amenities) || [];
  return (
    <>
      <div className="tile-title">Amenities ahead</div>
      <div className="tile-body scroll" style={{ justifyContent: 'flex-start' }}>
        {list.length === 0 ? (
          <div className="dim mono" style={{ fontSize: 11 }}>none in range</div>
        ) : (
          list.map((a, i) => (
            <div className="stat-line" key={i}>
              <span style={{ fontSize: 10 }}>{a.name}</span>
              <span>{Math.round(a.distance)}m {a.side === 'left' ? '←' : '→'}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ---------- traffic ---------- */
export function TrafficTile({ s }) {
  const list = (s.driveInfo && s.driveInfo.traffic) || [];
  return (
    <>
      <div className="tile-title">Traffic ahead</div>
      <div className="tile-body scroll" style={{ justifyContent: 'flex-start' }}>
        {list.length === 0 ? (
          <div className="dim mono" style={{ fontSize: 11 }}>clear</div>
        ) : (
          list.slice(0, 5).map((v, i) => (
            <div className="stat-line" key={i}>
              <span style={{ fontSize: 10 }} className={v.braking ? 't-danger' : ''}>
                {v.kind} L{v.lane + 1}{v.braking ? ' BRAKING' : ''}
              </span>
              <span>{Math.round(v.distance)}m</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ---------- compliance checks ---------- */
export function ComplianceChecksTile({ s }) {
  return (
    <>
      <div className="tile-title">Last checks</div>
      <div className="tile-body scroll" style={{ justifyContent: 'flex-start' }}>
        {s.results.length === 0 ? (
          <div className="dim mono" style={{ fontSize: 11 }}>no events passed yet</div>
        ) : (
          s.results.map((r) => (
            <div className="stat-line" key={r.id}>
              <span style={{ fontSize: 10 }}>{r.name}</span>
              <span className={r.excluded ? 'dim' : r.passed ? 't-ok' : 't-danger'}>
                {r.excluded ? 'EXCL' : r.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ---------- route map ---------- */
export function MapTile({ s, route }) {
  const W = 240, H = 120, PAD = 12;
  const p = route.path;
  if (!p) return <div className="tile-title">Map unavailable</div>;

  const minX = Math.min(...p.xs), maxX = Math.max(...p.xs);
  const minY = Math.min(...p.ys), maxY = Math.max(...p.ys);
  const sc = Math.min((W - 2 * PAD) / Math.max(maxX - minX, 1), (H - 2 * PAD) / Math.max(maxY - minY, 1));
  const tx = (x) => PAD + (x - minX) * sc;
  const ty = (y) => H - PAD - (y - minY) * sc;

  const at = (m) => {
    let seg = 0;
    while (seg < p.cum.length - 2 && p.cum[seg + 1] < m) seg++;
    const t = Math.min(1, Math.max(0, (m - p.cum[seg]) / (p.cum[seg + 1] - p.cum[seg] || 1)));
    return {
      x: tx(p.xs[seg] + t * (p.xs[seg + 1] - p.xs[seg])),
      y: ty(p.ys[seg] + t * (p.ys[seg + 1] - p.ys[seg])),
    };
  };

  const line = p.xs.map((x, i) => `${tx(x)},${ty(p.ys[i])}`).join(' ');
  const me = at(s.progress);

  return (
    <>
      <div className="tile-title">Route map</div>
      <div className="tile-body">
        <svg className="minimap" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <polyline points={line} fill="none" stroke="#33424f" strokeWidth="3" />
          {route.events.map((ev) => {
            const q = at(ev.at);
            const T = getEventType(ev.type);
            const col = T.tone === 'danger' ? '#ff5c60' : T.tone === 'warn' ? '#ffbe50' : '#46e6aa';
            return <circle key={ev.id} cx={q.x} cy={q.y} r="2.6" fill={col} opacity={ev.at < s.progress ? 0.3 : 1} />;
          })}
          {route.pois.map((poi, i) => {
            const q = at(poi.at);
            const col = POI_COLOR[poi.type] || '#8fd6ff';
            return <rect key={i} x={q.x - 2} y={q.y - 2} width="4" height="4" fill={col} opacity="0.85" />;
          })}
          <circle cx={me.x} cy={me.y} r="5" fill="#46e6aa" />
          <circle cx={me.x} cy={me.y} r="8" fill="none" stroke="#46e6aa" strokeWidth="1.5" opacity="0.5" />
        </svg>
        <div className="tile-note">
          {(s.progress / 1000).toFixed(2)} / {(route.length / 1000).toFixed(2)} km
        </div>
      </div>
    </>
  );
}

/* ---------- camera tiles ----------
 * Both cameras run for the whole shift and neither one analyses anything: the
 * models are not built. What these tiles show is the *evidence pipeline* —
 * that the rear camera is capturing the corridor with chainage attached, and
 * that the front camera has cut a clip when the DMS said something. A driver
 * seeing "recording" is also the honest disclosure that the cab is filmed.
 */
export function RoadScanTile({ s }) {
  const rec = s.recorders && s.recorders.rear;
  if (!rec) {
    return (
      <>
        <div className="tile-title">Road scan</div>
        <div className="tile-body"><div className="tile-sub dim">Rear camera starts with the shift.</div></div>
      </>
    );
  }
  return (
    <>
      <div className="tile-title">
        <span className={rec.recording ? 't-danger' : 'dim'}>●</span> Road scan · rear
      </div>
      <div className="tile-body">
        <div className="tile-hero sm">{rec.clipCount}</div>
        <div className="tile-sub">clips this shift · {(rec.queuedBytes / (1024 * 1024)).toFixed(0)} MB queued</div>
        <div className="bar" style={{ marginTop: 7 }}>
          <i style={{ width: Math.round((rec.segmentProgress || 0) * 100) + '%', background: '#ff6070' }} />
        </div>
        <div className="tile-note">segment {rec.camera.segmentSec}s · analysis pending</div>
      </div>
    </>
  );
}

export function DriverCamTile({ s }) {
  const rec = s.recorders && s.recorders.front;
  if (!rec) {
    return (
      <>
        <div className="tile-title">Driver camera</div>
        <div className="tile-body"><div className="tile-sub dim">Front camera starts with the shift.</div></div>
      </>
    );
  }
  const last = rec.clips[rec.clips.length - 1];
  return (
    <>
      <div className="tile-title">
        <span className={rec.recording ? 't-danger' : 'dim'}>●</span> Driver camera
      </div>
      <div className="tile-body">
        <div className="tile-hero sm">{rec.clipCount}</div>
        <div className="tile-sub">
          {rec.clipCount === 0 ? 'no fatigue events' : `last: ${last.reason}`}
        </div>
        <div className="tile-note">event clips only · never continuous</div>
      </div>
    </>
  );
}

export const TILE_COMPONENTS = {
  'lane-policy': LanePolicyTile,
  'speed-gear': SpeedGearTile,
  'next-hazard': NextHazardTile,
  drowsiness: DrowsinessTile,
  'trip-score': TripScoreTile,
  upcoming: UpcomingTile,
  amenities: AmenitiesTile,
  traffic: TrafficTile,
  'compliance-checks': ComplianceChecksTile,
  map: MapTile,
  'road-scan': RoadScanTile,
  'driver-cam': DriverCamTile,
};
