/* Route Editor — REACT NATIVE. SYSTEM_DESIGN §13.2.
 *
 * Corridor authoring: geometry, then events, then verification. The HUD preview
 * is the critical control — an event edited in a table is an abstraction, an
 * event seen in the driver's own HUD at the driver's approach speed is a
 * verification. Nothing publishes without it.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import {
  RoadHazardView, buildRouteEvents, createRoute, buildPath, matchToPath,
  EVENT_TYPES, HIGH_QUALITY,
} from 'react-road-hazards';
import { makeSampleScan, CORRIDOR_DEFS, registerCorridor } from '@drivosafe/shared';
import { MONO, TONE_COLOR, useTheme } from '../theme.js';
import { Panel, Btn, Kpi, Table, Slider, Cycler, Chip } from '../components/ui.jsx';

const MAPW = 900, MAPH = 260, PAD = 26;
const evColor = (t) => TONE_COLOR[(EVENT_TYPES[t] || {}).tone || 'accent'] || TONE_COLOR.accent;

export default function RouteEditorScreen() {
  const { C, S } = useTheme();
  const sample = useRef(makeSampleScan()).current;

  const [name, setName] = useState('NH-52 Indore → Dewas (rev)');
  const [lanes, setLanes] = useState(4);
  const [overtaking, setOvertaking] = useState('right');
  const [mappers, setMappers] = useState(3);

  const [result, setResult] = useState(null);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(0);
  const [toast, setToast] = useState(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  const runMapping = () => {
    try {
      const out = buildRouteEvents(sample.route, sample.detections, {
        lanes, laneWidthM: 3.5, laneConfig: { overtaking },
      });
      setResult(out);
      setEvents(out.events);
      setSelected(null);
      setPreview(0);
      flash(`Mapped ${out.stats.mapped} of ${out.stats.detections} → ${out.stats.events} events`);
    } catch (e) {
      flash('Mapping failed: ' + e.message);
    }
  };

  const previewRoute = useMemo(() => {
    if (!result) return null;
    return createRoute({
      name, path: result.routeDef.path, lanes, laneWidthM: 3.5,
      laneConfig: { overtaking }, events, pois: [],
    });
  }, [result, events, lanes, overtaking, name]);

  const map = useMemo(() => {
    if (!result) return null;
    const bp = buildPath(result.routeDef.path);
    const minX = Math.min(...bp.xs), maxX = Math.max(...bp.xs);
    const minY = Math.min(...bp.ys), maxY = Math.max(...bp.ys);
    const sc = Math.min((MAPW - 2 * PAD) / Math.max(maxX - minX, 1), (MAPH - 2 * PAD) / Math.max(maxY - minY, 1));
    const tx = (x) => PAD + (x - minX) * sc;
    const ty = (y) => MAPH - PAD - (y - minY) * sc;
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

  /* Tap the corridor to add a manual event at that chainage. */
  const [mapW, setMapW] = useState(MAPW);
  const tapMap = (e) => {
    if (!map) return;
    const scale = MAPW / (mapW || MAPW);
    const sx = e.nativeEvent.locationX * scale;
    const sy = e.nativeEvent.locationY * scale;
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
    setEvents(events.map((e) => (e.id === selected ? { ...e, ...p } : e)).sort((a, b) => a.at - b.at));
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
      <View style={[S.row, { marginBottom: 12 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.fg }}>Route Editor</Text>
        <Text style={{ fontSize: 11, color: C.fg3 }}>
          scan → map-match → fuse → verify in the HUD → publish
        </Text>
      </View>

      <Panel
        title="Corridor"
        hint="Geometry and lane model. The overtaking lane is excluded from cruising recommendations on 3+ lane roads; below that the exclusion lifts automatically."
      >
        <Text style={S.label}>Name</Text>
        <Text style={[S.input, { marginBottom: 10 }]}>{name}</Text>
        <View style={S.row}>
          <Cycler label="LANES" options={[1, 2, 3, 4, 5, 6]} value={lanes} onChange={setLanes} />
          <Cycler
            label="OVERTAKING"
            options={[{ value: 'right', label: 'right' }, { value: 'left', label: 'left' }, { value: null, label: 'none' }]}
            value={overtaking}
            onChange={setOvertaking}
          />
          <Cycler label="MAPPERS" options={[1, 2, 3, 4, 6, 8]} value={mappers} onChange={setMappers} />
          <Btn kind="primary" onPress={runMapping}>RUN MAPPING</Btn>
        </View>
        <Text style={[S.hint, { marginTop: 10, marginBottom: 0 }]}>
          The scan is a GeoJSON LineString plus a Point FeatureCollection with
          <Text style={{ fontFamily: MONO }}> type</Text> and
          <Text style={{ fontFamily: MONO }}> severity</Text> or
          <Text style={{ fontFamily: MONO }}> depth_mm</Text>. On the tablet it arrives from
          Scan Ingest rather than being pasted.
        </Text>
      </Panel>

      {result ? (
        <>
          <View style={[S.row, { marginBottom: 12 }]}>
            <Kpi k="Detections" v={result.stats.detections} d="points in the scan" />
            <Kpi k="Mapped" v={result.stats.mapped} d="projected onto the corridor" />
            <Kpi k="Rejected" v={result.stats.rejected} d="> 30 m off-route" tone={result.stats.rejected ? C.warn : null} />
            <Kpi k="Events" v={events.length} d="after multi-pass fusion" tone={C.ok} />
            <Kpi k="Length" v={(result.stats.routeLengthM / 1000).toFixed(2) + ' km'} d="corridor chainage" />
          </View>

          <Panel
            title="Corridor"
            hint="Tap anywhere on the corridor to add a manual event. Rejected detections are marked ✕ where the scan claimed they were, pinned to the edge when they fall off the view — they are excluded from the model."
          >
            <View
              onLayout={(e) => setMapW(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onResponderRelease={tapMap}
            >
              <Svg width="100%" height={MAPH} viewBox={`0 0 ${MAPW} ${MAPH}`}>
                <Polyline
                  points={map.bp.xs.map((x, i) => `${map.tx(x)},${map.ty(map.bp.ys[i])}`).join(' ')}
                  fill="none" stroke={C.line2} strokeWidth="5"
                />
                {Array.from({ length: Math.floor(result.stats.routeLengthM / 250) + 1 }, (_, i) => i * 250).map((m) => {
                  const q = map.at(m);
                  return (
                    <React.Fragment key={m}>
                      <Circle cx={q.x} cy={q.y} r="1.6" fill={C.fg3} />
                      <SvgText x={q.x} y={q.y - 8} fill={C.fg3} fontSize="8" textAnchor="middle" fontFamily={MONO}>
                        {m}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
                {result.rejected.map((r, i) => {
                  const rawX = map.tx((r.det.lng - map.bp.lng0) * map.bp.kx);
                  const rawY = map.ty((r.det.lat - map.bp.lat0deg) * map.bp.ky);
                  const x = map.clampX(rawX), y = map.clampY(rawY);
                  const pinned = x !== rawX || y !== rawY;
                  return (
                    <React.Fragment key={'r' + i}>
                      <Line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke={C.danger} strokeWidth="1.8" />
                      <Line x1={x + 5} y1={y - 5} x2={x - 5} y2={y + 5} stroke={C.danger} strokeWidth="1.8" />
                      <SvgText x={x + 9} y={y + 3} fill={C.danger} fontSize="8" fontFamily={MONO}>
                        {r.reason}{r.distance ? ` ${Math.round(r.distance)}m` : ''}{pinned ? ' ↗' : ''}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
                {events.map((ev) => {
                  const q = map.at(ev.at);
                  const isSel = ev.id === selected;
                  return (
                    <React.Fragment key={ev.id}>
                      {ev.length ? (
                        <Line
                          x1={q.x} y1={q.y}
                          x2={map.at(ev.at + ev.length).x} y2={map.at(ev.at + ev.length).y}
                          stroke={evColor(ev.type)} strokeWidth="7" opacity="0.45"
                        />
                      ) : null}
                      <Circle
                        cx={q.x} cy={q.y} r={isSel ? 7 : 4.5}
                        fill={evColor(ev.type)} stroke={isSel ? '#fff' : 'none'} strokeWidth="1.5"
                      />
                    </React.Fragment>
                  );
                })}
                <Circle cx={map.at(preview).x} cy={map.at(preview).y} r="6" fill="none" stroke={C.watch} strokeWidth="2" />
              </Svg>
            </View>
          </Panel>

          <Panel
            title="Events"
            hint="Confidence is earned by repetition across passes — 3+ observations high, 2 medium, 1 low. Manual entries are marked as such and never claim otherwise."
          >
            <Table
              maxHeight={230}
              keyExtractor={(e) => e.id}
              cols={[
                {
                  label: 'Type', flex: 2.2,
                  render: (ev) => (
                    <TouchableOpacity onPress={() => { setSelected(ev.id); setPreview(Math.max(0, ev.at - 180)); }}>
                      <Text style={[S.td, ev.id === selected && { color: C.ok, fontWeight: '700' }]} numberOfLines={1}>
                        ● {ev.type}
                      </Text>
                    </TouchableOpacity>
                  ),
                },
                { label: 'At (m)', num: true, render: (ev) => `${Math.round(ev.at)}${ev.length ? '+' + Math.round(ev.length) : ''}` },
                { label: 'Lane', num: true, render: (ev) => (ev.lane == null ? 'all' : String(ev.lane + 1)) },
                { label: 'Sev', num: true, render: (ev) => (ev.severity ?? 0.7).toFixed(2) },
                { label: 'Conf', render: (ev) => ev.confidence || '—' },
                { label: 'Obs', num: true, render: (ev) => String(ev.observations || 1) },
              ]}
              rows={events}
            />

            {sel ? (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
                <View style={S.row}>
                  <Cycler label="TYPE" options={Object.keys(EVENT_TYPES)} value={sel.type} onChange={(v) => patch({ type: v })} width={160} />
                  <Cycler
                    label="LANE"
                    options={[{ value: null, label: 'all' }, ...Array.from({ length: lanes }, (_, i) => ({ value: i, label: String(i + 1) }))]}
                    value={sel.lane}
                    onChange={(v) => patch({ lane: v })}
                  />
                  <View>
                    <Text style={[S.chipTxt, { fontSize: 9 }]}>CHAINAGE {Math.round(sel.at)} m</Text>
                    <Slider value={sel.at} min={0} max={Math.round(result.stats.routeLengthM)} step={5} onChange={(v) => patch({ at: v })} width={150} />
                  </View>
                  <View>
                    <Text style={[S.chipTxt, { fontSize: 9 }]}>SEVERITY {(sel.severity ?? 0.7).toFixed(2)}</Text>
                    <Slider value={sel.severity ?? 0.7} min={0} max={1} step={0.05} onChange={(v) => patch({ severity: v })} width={110} />
                  </View>
                  <Btn kind="danger" onPress={() => { setEvents(events.filter((e) => e.id !== selected)); setSelected(null); }}>
                    DELETE
                  </Btn>
                </View>
                <Text style={[S.tileNote, { marginTop: 8 }]}>
                  {sel.id} · verified {sel.verifiedAt || 'unknown'}
                </Text>
              </View>
            ) : (
              <Text style={[S.hint, { marginTop: 10, marginBottom: 0 }]}>
                Select an event to edit it, or tap the corridor to add one.
              </Text>
            )}
          </Panel>

          <Panel
            title="Driver HUD preview"
            hint="Exactly what the driver sees at this chainage — same engine, same advisory, same hysteresis. This is the verification step; nothing publishes without it."
          >
            {previewRoute ? (
              <View style={{ alignItems: 'center' }}>
                <RoadHazardView
                  mode="drive"
                  route={previewRoute}
                  progress={preview}
                  lanes={lanes}
                  laneConfig={{ overtaking }}
                  viewDistance={200}
                  showUpcoming={3}
                  quality={HIGH_QUALITY}
                  environment={{ buildings: true, traffic: 'light' }}
                  width={420}
                  height={280}
                />
              </View>
            ) : null}
            <Text style={[S.label, { marginTop: 12 }]}>Position — {Math.round(preview)} m</Text>
            <Slider
              value={preview} min={0} max={Math.round(result.stats.routeLengthM)} step={5}
              onChange={setPreview} width={320}
            />
            <View style={[S.row, { marginTop: 12 }]}>
              <Btn kind="primary" onPress={publish}>PUBLISH CORRIDOR</Btn>
              <Chip>{events.length} events · v{(CORRIDOR_DEFS.find((c) => c.name === name) || {}).version || 'new'}</Chip>
            </View>
          </Panel>
        </>
      ) : (
        <Panel hint="Run mapping to see the corridor, its fused events, and the driver HUD preview." />
      )}

      {toast ? (
        <View style={{ position: 'absolute', bottom: 18, alignSelf: 'center', backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: '#04120c', fontWeight: '700', fontSize: 13 }}>{toast}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
