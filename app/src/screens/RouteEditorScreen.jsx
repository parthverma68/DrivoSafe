/* Route Editor — SYSTEM_DESIGN §13.2.
 *
 * Corridor authoring: geometry, then events, then verification. The HUD preview
 * is the critical control — an event edited in a table is an abstraction, an
 * event seen in the driver's own HUD at the driver's approach speed is a
 * verification. Nothing publishes without it.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  RoadHazardView, buildRouteEvents, createRoute, buildPath, matchToPath,
  EVENT_TYPES, ULTRA_QUALITY,
} from 'react-road-hazards';
import { makeSampleScan, CORRIDOR_DEFS, registerCorridor } from '@drivosafe/shared';

const MAPW = 900, MAPH = 300, PAD = 30;
const TONE_HEX = { danger: '#ff5c60', warn: '#ffbe50', accent: '#46e6aa', neutral: '#6b7a85' };
const evColor = (t) => TONE_HEX[(EVENT_TYPES[t] || {}).tone || 'accent'];

export default function RouteEditorScreen() {
  const sample = useRef(makeSampleScan()).current;

  const [name, setName] = useState('NH-52 Indore → Dewas (rev)');
  const [lanes, setLanes] = useState(4);
  const [overtaking, setOvertaking] = useState('right');
  const [mappers, setMappers] = useState(3);
  const [routeText, setRouteText] = useState(() => JSON.stringify(sample.route));
  const [detText, setDetText] = useState(() => JSON.stringify(sample.detections));

  const [result, setResult] = useState(null);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(0);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  /* --- run the §11.3 pipeline ------------------------------------------- */
  const runMapping = () => {
    setError(null);
    let routeGJ, detGJ;
    try {
      routeGJ = JSON.parse(routeText);
      detGJ = JSON.parse(detText);
    } catch (e) {
      setError('Invalid JSON: ' + e.message);
      return;
    }
    try {
      const out = buildRouteEvents(routeGJ, detGJ, {
        lanes,
        laneWidthM: 3.5,
        laneConfig: { overtaking },
      });
      setResult(out);
      setEvents(out.events);
      setSelected(null);
      setPreview(0);
      flash(`Mapped ${out.stats.mapped} of ${out.stats.detections} detections → ${out.stats.events} events`);
    } catch (e) {
      setError('Mapping failed: ' + e.message);
    }
  };

  /* live route for the HUD preview, rebuilt as events are edited */
  const previewRoute = useMemo(() => {
    if (!result) return null;
    return createRoute({
      name,
      path: result.routeDef.path,
      lanes,
      laneWidthM: 3.5,
      laneConfig: { overtaking },
      events,
      pois: [],
    });
  }, [result, events, lanes, overtaking, name]);

  /* --- map projection ---------------------------------------------------- */
  const map = useMemo(() => {
    if (!result) return null;
    const bp = buildPath(result.routeDef.path);
    /* Bounds fit the corridor, which is the content that must stay legible. A
     * GPS glitch can be hundreds of metres out and would squash the corridor to
     * a sliver, so rejected markers are pinned to the viewport edge instead
     * (see `clamp` below) — visible, but never at the corridor's expense. */
    const minX = Math.min(...bp.xs), maxX = Math.max(...bp.xs);
    const minY = Math.min(...bp.ys), maxY = Math.max(...bp.ys);
    const sc = Math.min((MAPW - 2 * PAD) / Math.max(maxX - minX, 1), (MAPH - 2 * PAD) / Math.max(maxY - minY, 1));
    const tx = (x) => PAD + (x - minX) * sc;
    const ty = (y) => MAPH - PAD - (y - minY) * sc;   // north up
    const clampX = (x) => Math.max(8, Math.min(MAPW - 8, x));
    const clampY = (y) => Math.max(8, Math.min(MAPH - 8, y));
    const at = (m) => {
      let seg = 0;
      while (seg < bp.cum.length - 2 && bp.cum[seg + 1] < m) seg++;
      const t = Math.min(1, Math.max(0, (m - bp.cum[seg]) / (bp.cum[seg + 1] - bp.cum[seg] || 1)));
      return {
        x: tx(bp.xs[seg] + t * (bp.xs[seg + 1] - bp.xs[seg])),
        y: ty(bp.ys[seg] + t * (bp.ys[seg + 1] - bp.ys[seg])),
      };
    };
    return { bp, sc, minX, minY, tx, ty, clampX, clampY, at };
  }, [result]);

  /* click the corridor to add a manual event at that chainage */
  const addManual = (e) => {
    if (!map) return;
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * MAPW;
    const sy = ((e.clientY - r.top) / r.height) * MAPH;
    const lx = (sx - PAD) / map.sc + map.minX;
    const ly = (MAPH - PAD - sy) / map.sc + map.minY;
    const lng = map.bp.lng0 + lx / map.bp.kx;
    const lat = map.bp.lat0deg + ly / map.bp.ky;
    const m = matchToPath(map.bp, lat, lng, null);
    if (!m || Math.abs(m.offset) > 40) { flash('Too far from the corridor to place'); return; }
    const id = 'manual-' + Math.round(m.progress);
    if (events.some((x) => x.id === id)) { flash('An event already exists there'); return; }
    const ev = {
      id, type: 'pothole', at: Math.round(m.progress), lane: 1,
      severity: 0.7, confidence: 'manual', verifiedAt: 'manual entry',
    };
    setEvents(events.concat([ev]).sort((a, b) => a.at - b.at));
    setSelected(id);
    setPreview(Math.max(0, ev.at - 180));
  };

  const patch = (p) =>
    setEvents(events.map((e) => (e.id === selected ? Object.assign({}, e, p) : e)).sort((a, b) => a.at - b.at));
  const sel = events.find((e) => e.id === selected) || null;

  const publish = () => {
    if (!result) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
    const existing = CORRIDOR_DEFS.find((c) => c.id === id);
    registerCorridor({
      id, name, corridor: name.split(' ')[0],
      version: (existing ? existing.version : 0) + 1,
      publishedAt: new Date().toISOString(),
      freshness: 'today ' + new Date().toTimeString().slice(0, 5),
      mappers, status: 'live',
      length: Math.round(result.stats.routeLengthM),
      lanes, laneWidthM: 3.5,
      laneConfig: { overtaking, holdMeters: 150 },
      path: result.routeDef.path,
      laneSections: [{ from: 0, quality: Array.from({ length: lanes }, (_, i) => 70 + ((i * 13) % 25)) }],
      events, pois: [],
    });
    flash(`Published "${name}" — available on the Drive screen`);
  };

  return (
    <div className="console">
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 16 }}>Route Editor</h2>
        <span className="dim" style={{ fontSize: 11 }}>
          scan → map-match → fuse → verify in the HUD → publish
        </span>
      </div>

      <div className="grid2">
        {/* ---- corridor config ---- */}
        <div className="panel">
          <h3>Corridor</h3>
          <p className="hint">
            Geometry and lane model. The overtaking lane is excluded from cruising
            recommendations on 3+ lane roads; below that the exclusion lifts automatically.
          </p>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>Lanes</label>
              <select value={lanes} onChange={(e) => setLanes(+e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Overtaking side</label>
              <select value={overtaking || ''} onChange={(e) => setOvertaking(e.target.value || null)}>
                <option value="right">right</option>
                <option value="left">left</option>
                <option value="">none</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Mappers</label>
              <input type="number" min="1" max="12" value={mappers} onChange={(e) => setMappers(+e.target.value)} />
            </div>
          </div>
        </div>

        {/* ---- scan import ---- */}
        <div className="panel">
          <h3>Scan import</h3>
          <p className="hint">
            Corridor centreline as a GeoJSON LineString, defects as a Point FeatureCollection
            with <code>type</code> and <code>severity</code> or <code>depth_mm</code>.
          </p>
          <div className="field">
            <label>Route LineString</label>
            <textarea rows={3} value={routeText} onChange={(e) => setRouteText(e.target.value)} />
          </div>
          <div className="field">
            <label>Detections FeatureCollection</label>
            <textarea rows={3} value={detText} onChange={(e) => setDetText(e.target.value)} />
          </div>
          <div className="row">
            <button className="primary" onClick={runMapping}>RUN MAPPING</button>
            <button onClick={() => {
              const s = makeSampleScan();
              setRouteText(JSON.stringify(s.route));
              setDetText(JSON.stringify(s.detections));
            }}>
              RELOAD SAMPLE
            </button>
            {error ? <span className="t-danger" style={{ fontSize: 11 }}>{error}</span> : null}
          </div>
        </div>
      </div>

      {result ? (
        <>
          {/* ---- fusion stats ---- */}
          <div className="grid3">
            <Stat k="Detections" v={result.stats.detections} d="points in the scan" />
            <Stat k="Mapped" v={result.stats.mapped} d="projected onto the corridor" />
            <Stat k="Rejected" v={result.stats.rejected} d="> 30 m off-route — GPS glitches" tone={result.stats.rejected ? 't-warn' : ''} />
            <Stat k="Events" v={events.length} d="after multi-pass fusion" tone="t-ok" />
            <Stat k="Length" v={(result.stats.routeLengthM / 1000).toFixed(2) + ' km'} d="corridor chainage" />
          </div>

          {/* ---- corridor map ---- */}
          <div className="panel">
            <h3>Corridor</h3>
            <p className="hint">
              Click anywhere on the corridor to add a manual event. Rejected detections are
              marked <span className="t-danger">✕</span> where the scan claimed they were,
              pinned to the edge (<span className="t-danger">↗</span>) when they fall off the
              view — they are excluded from the model.
            </p>
            <svg
              className="map-canvas"
              viewBox={`0 0 ${MAPW} ${MAPH}`}
              onClick={addManual}
              style={{ height: MAPH }}
            >
              <polyline
                points={map.bp.xs.map((x, i) => `${map.tx(x)},${map.ty(map.bp.ys[i])}`).join(' ')}
                fill="none" stroke="#33424f" strokeWidth="5"
              />
              {/* chainage ticks every 250 m */}
              {Array.from({ length: Math.floor(result.stats.routeLengthM / 250) + 1 }, (_, i) => i * 250).map((m) => {
                const p = map.at(m);
                return (
                  <g key={m}>
                    <circle cx={p.x} cy={p.y} r="1.6" fill="#5f7385" />
                    <text x={p.x} y={p.y - 8} fill="#5f7385" fontSize="8" textAnchor="middle" fontFamily="monospace">
                      {m}
                    </text>
                  </g>
                );
              })}
              {/* rejections */}
              {result.rejected.map((r, i) => {
                const rawX = map.tx((r.det.lng - map.bp.lng0) * map.bp.kx);
                const rawY = map.ty((r.det.lat - map.bp.lat0deg) * map.bp.ky);
                const x = map.clampX(rawX), y = map.clampY(rawY);
                const pinned = x !== rawX || y !== rawY;
                return (
                  <g key={'r' + i}>
                    <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke="#ff5c60" strokeWidth="1.8" />
                    <line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} stroke="#ff5c60" strokeWidth="1.8" />
                    <text x={x + 9} y={y + 3} fill="#ff5c60" fontSize="8" fontFamily="monospace">
                      {r.reason}{r.distance ? ` ${Math.round(r.distance)}m` : ''}{pinned ? ' ↗' : ''}
                    </text>
                  </g>
                );
              })}
              {/* events */}
              {events.map((ev) => {
                const p = map.at(ev.at);
                const isSel = ev.id === selected;
                return (
                  <g key={ev.id} onClick={(e) => { e.stopPropagation(); setSelected(ev.id); setPreview(Math.max(0, ev.at - 180)); }} style={{ cursor: 'pointer' }}>
                    {ev.length ? (
                      <line
                        x1={p.x} y1={p.y}
                        x2={map.at(ev.at + ev.length).x} y2={map.at(ev.at + ev.length).y}
                        stroke={evColor(ev.type)} strokeWidth="7" opacity="0.45"
                      />
                    ) : null}
                    <circle cx={p.x} cy={p.y} r={isSel ? 7 : 4.5} fill={evColor(ev.type)} stroke={isSel ? '#fff' : 'none'} strokeWidth="1.5" />
                  </g>
                );
              })}
              {/* preview head */}
              <circle cx={map.at(preview).x} cy={map.at(preview).y} r="6" fill="none" stroke="#8fd6ff" strokeWidth="2" />
            </svg>
          </div>

          {/* ---- table + preview ---- */}
          <div className="grid2">
            <div className="panel" style={{ minWidth: 0 }}>
              <h3>Events</h3>
              <p className="hint">
                Confidence is earned by repetition across passes — 3+ observations high,
                2 medium, 1 low. Manual entries are marked as such and never claim otherwise.
              </p>
              <div className="scroll" style={{ maxHeight: 300 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Type</th><th className="num">At (m)</th><th className="num">Lane</th>
                      <th className="num">Sev</th><th>Conf</th><th className="num">Obs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr
                        key={ev.id}
                        className={'clickable' + (ev.id === selected ? ' sel' : '')}
                        onClick={() => { setSelected(ev.id); setPreview(Math.max(0, ev.at - 180)); }}
                      >
                        <td><span style={{ color: evColor(ev.type) }}>●</span> {ev.type}</td>
                        <td className="num">{Math.round(ev.at)}{ev.length ? `+${Math.round(ev.length)}` : ''}</td>
                        <td className="num">{ev.lane == null ? 'all' : ev.lane + 1}</td>
                        <td className="num">{(ev.severity ?? 0.7).toFixed(2)}</td>
                        <td>{ev.confidence || '—'}</td>
                        <td className="num">{ev.observations || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {sel ? (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div className="row">
                    <div className="field" style={{ flex: 2 }}>
                      <label>Type</label>
                      <select value={sel.type} onChange={(e) => patch({ type: e.target.value })}>
                        {Object.keys(EVENT_TYPES).map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Chainage</label>
                      <input type="number" value={Math.round(sel.at)} onChange={(e) => patch({ at: +e.target.value })} />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Lane</label>
                      <select value={sel.lane == null ? '' : sel.lane} onChange={(e) => patch({ lane: e.target.value === '' ? null : +e.target.value })}>
                        <option value="">all</option>
                        {Array.from({ length: lanes }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Severity</label>
                      <input type="number" min="0" max="1" step="0.05" value={sel.severity ?? 0.7} onChange={(e) => patch({ severity: +e.target.value })} />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Slow to</label>
                      <input type="number" value={sel.slowTo ?? ''} placeholder="auto" onChange={(e) => patch({ slowTo: e.target.value === '' ? undefined : +e.target.value })} />
                    </div>
                  </div>
                  <div className="row">
                    <button className="danger" onClick={() => { setEvents(events.filter((e) => e.id !== selected)); setSelected(null); }}>
                      DELETE EVENT
                    </button>
                    <span className="dim mono" style={{ fontSize: 10 }}>{sel.id} · verified {sel.verifiedAt || 'unknown'}</span>
                  </div>
                </div>
              ) : (
                <p className="hint" style={{ marginTop: 10 }}>Select an event to edit it, or click the corridor to add one.</p>
              )}
            </div>

            {/* ---- HUD verification ---- */}
            <div className="panel">
              <h3>Driver HUD preview</h3>
              <p className="hint">
                Exactly what the driver sees at this chainage — same engine, same advisory,
                same hysteresis. This is the verification step; nothing publishes without it.
              </p>
              {previewRoute ? (
                <RoadHazardView
                  mode="drive"
                  route={previewRoute}
                  progress={preview}
                  lanes={lanes}
                  laneConfig={{ overtaking }}
                  viewDistance={200}
                  showUpcoming={3}
                  quality={ULTRA_QUALITY}
                  environment={{ buildings: true, traffic: 'light' }}
                  width={420}
                  height={280}
                />
              ) : null}
              <div className="field" style={{ marginTop: 10 }}>
                <label>Position — {Math.round(preview)} m</label>
                <input
                  type="range" min="0" max={Math.round(result.stats.routeLengthM)} step="5"
                  value={preview} onChange={(e) => setPreview(+e.target.value)}
                />
              </div>
              <div className="row">
                <button className="primary" onClick={publish}>PUBLISH CORRIDOR</button>
                <button onClick={() => {
                  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = 'events.json';
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}>
                  EXPORT EVENTS
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="panel">
          <p className="hint" style={{ margin: 0 }}>
            Load a scan and run mapping to see the corridor, its fused events, and the driver HUD preview.
          </p>
        </div>
      )}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function Stat({ k, v, d, tone }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className={'v ' + (tone || '')}>{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}
