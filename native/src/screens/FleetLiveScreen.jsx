/* Live operations board — REACT NATIVE.
 *
 * The operator's morning screen: every vehicle in their tenancy on a corridor
 * map, who is at the wheel right now, that driver's fatigue state, and cabin
 * video on request. Scope comes from `scopeOf(account)` — a fleet owner's
 * snapshot is built from their own operatorId, so other operators' vehicles are
 * never in the array, not merely hidden.
 *
 * The map is drawn from the same corridor centrelines the HUD is built from
 * (see the web build's FleetMap for the reasoning); a tile provider is a
 * production concern and a network the depot may not have.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import {
  OPERATORS, byId, fleetSnapshot, fleetSummary, requestCabinClip, clipState, scopeOf,
  CORRIDOR_DEFS,
} from '@drivosafe/shared';
import { useTheme, MONO, toneColor, scoreTone } from '../theme.js';
import {
  Btn, Chip, Avatar, Meter, Ring, Viewport, SyntheticFeed,
  IconPlay, IconRefresh, IconWheel, IconAlert,
} from '../components/kit.jsx';

export default function FleetLiveScreen({ account, onMirror }) {
  const { C, S } = useTheme();
  const scope = scopeOf(account);
  const isAdmin = account && account.role === 'admin';
  const { width } = useWindowDimensions();
  const wide = width >= 1000;

  const [operatorId, setOperatorId] = useState(scope.all ? null : scope.operatorId);
  const [now, setNow] = useState(Date.now());
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const records = useMemo(
    () => fleetSnapshot({ operatorId: scope.all ? operatorId : scope.operatorId, at: now }),
    [scope.all, scope.operatorId, operatorId, now]
  );

  useEffect(() => {
    if (records.length === 0) { setSelectedId(null); return; }
    if (!records.some((r) => r.busId === selectedId)) setSelectedId(records[0].busId);
  }, [records, selectedId]);

  const selected = records.find((r) => r.busId === selectedId) || null;
  const summary = fleetSummary(records);

  return (
    <View style={{ flex: 1 }}>
      <View style={[S.row, { padding: 14, paddingBottom: 0 }]}>
        {scope.all ? (
          <View style={S.row}>
            <TouchableOpacity
              style={[S.chip, !operatorId && { borderColor: C.brand }]}
              onPress={() => setOperatorId(null)}
            >
              <Text style={[S.chipTxt, !operatorId && { color: C.brand }]}>All operators</Text>
            </TouchableOpacity>
            {OPERATORS.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={[S.chip, operatorId === o.id && { borderColor: C.brand }]}
                onPress={() => setOperatorId(o.id)}
              >
                <Text style={[S.chipTxt, operatorId === o.id && { color: C.brand }]}>{o.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Chip tone="ok">{(byId(OPERATORS, scope.operatorId) || {}).name} · your fleet only</Chip>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <View style={[S.row, { gap: 10 }]}>
          <Kpi k="On route" v={summary.onRoute} d={`${summary.total} in scope`} tone={C.brand} />
          <Kpi k="Needs attention" v={summary.alerts} d="fatigue or compliance" tone={summary.alerts ? C.danger : null} />
          <Kpi k="Avg speed" v={summary.avgSpeed} d="km/h, moving" />
          <Kpi k="Compliance" v={summary.avgCompliance + '%'} d="fleet mean" tone={toneColor(C, scoreTone(summary.avgCompliance))} />
        </View>

        <CorridorMap records={records} selected={selected} onSelect={setSelectedId} />

        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
          <View style={{ flex: wide ? 1 : undefined }}>
            {records.map((r) => (
              <BusRow key={r.busId} r={r} on={selected && selected.busId === r.busId} onPress={() => setSelectedId(r.busId)} />
            ))}
          </View>

          <View style={{ flex: wide ? 1 : undefined, gap: 12 }}>
            {selected ? (
              <Detail r={selected} now={now} isAdmin={isAdmin} onMirror={onMirror} account={account} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Kpi({ k, v, d, tone }) {
  const { S } = useTheme();
  return (
    <View style={S.kpi}>
      <Text style={S.kpiK}>{k}</Text>
      <Text style={[S.kpiV, tone ? { color: tone } : null]}>{v}</Text>
      <Text style={S.kpiD}>{d}</Text>
    </View>
  );
}

function BusRow({ r, on, onPress }) {
  const { C, S } = useTheme();
  const tone = toneColor(C, r.statusMeta.tone);
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[S.busRow, on && S.busRowOn]}>
      <View style={[S.row, { gap: 8 }]}>
        <View style={[S.dot, { backgroundColor: tone }]} />
        <Text style={S.plate}>{r.bus.reg}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[S.chipTxt, { color: tone }]}>{r.statusMeta.label}</Text>
      </View>
      <Text style={[S.hint, { marginBottom: 0, marginTop: 3 }]}>
        {r.bus.service} · {r.driver ? r.driver.name : 'unassigned'}
      </Text>
      <View style={[S.row, { marginTop: 8, gap: 14 }]}>
        <Text style={[S.statV, { color: C.fg2 }]}>{r.speedKph} km/h</Text>
        <Text style={[S.statV, { color: C.fg2 }]}>{r.remainingKm} km left</Text>
        <Text style={[S.statV, { color: toneColor(C, r.fatigue.tone) }]}>fatigue {r.fatigue.level}</Text>
      </View>
      <View style={{ marginTop: 9 }}>
        <Meter value={r.progress * 100} tone={tone} />
      </View>
    </TouchableOpacity>
  );
}

/* The corridor of whichever vehicle is selected, with every vehicle on it.
 * Two corridors 150 km apart in one frame would render each 1.7 km road as a
 * few pixels of nothing, so the map follows the selection instead. */
function CorridorMap({ records, selected, onSelect }) {
  const { C, S } = useTheme();
  const W = 900;
  const H = 300;

  const focusId = selected ? selected.corridorId : records.length ? records[0].corridorId : null;
  const corridor = CORRIDOR_DEFS.find((c) => c.id === focusId);
  const visible = records.filter((r) => r.corridorId === focusId);

  if (!corridor) {
    return (
      <View style={[S.card, { alignItems: 'center', paddingVertical: 40 }]}>
        <Text style={S.hint}>No vehicle is reporting a position right now.</Text>
      </View>
    );
  }

  const lats = corridor.path.map((p) => p.lat);
  const lngs = corridor.path.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = Math.max((maxLat - minLat) * 1.4, 0.006);
  const padLng = Math.max((maxLng - minLng) * 0.1, 0.002);
  const lat0 = minLat - padLat, lat1 = maxLat + padLat;
  const lng0 = minLng - padLng, lng1 = maxLng + padLng;
  const s = Math.min(W / (lng1 - lng0), H / (lat1 - lat0));

  const px = (lat, lng) => ({
    x: W / 2 + (lng - (lng0 + lng1) / 2) * s,
    y: H / 2 - (lat - (lat0 + lat1) / 2) * s,
  });
  const line = (pts) => pts.map((p) => { const q = px(p.lat, p.lng); return `${q.x},${q.y}`; }).join(' ');

  return (
    <View style={{
      borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
      backgroundColor: C.mapVoid,
    }}>
      <Svg width="100%" height={260} viewBox={`0 0 ${W} ${H}`}>
        <Rect width={W} height={H} fill={C.mapVoid} />

        {/* a synthesised street grid, so the corridor is not floating in void */}
        {Array.from({ length: 14 }, (_, i) => (
          <Path
            key={'g' + i}
            d={`M ${(i * W) / 14} 0 V ${H}`}
            stroke={C.mapStreet}
            strokeWidth="0.8"
            opacity="0.4"
          />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <Path key={'h' + i} d={`M 0 ${(i * H) / 5} H ${W}`} stroke={C.mapStreet} strokeWidth="0.8" opacity="0.4" />
        ))}

        <Polyline points={line(corridor.path)} fill="none" stroke={C.mapLand} strokeWidth="52" strokeLinecap="round" />
        <Polyline points={line(corridor.path)} fill="none" stroke={C.mapRoadHi} strokeWidth="15" strokeLinecap="round" />
        <Polyline points={line(corridor.path)} fill="none" stroke={C.mapRoad} strokeWidth="11" strokeLinecap="round" />
        <Polyline points={line(corridor.path)} fill="none" stroke={C.mapInk} strokeWidth="1" strokeDasharray="8 10" opacity="0.5" />

        <SvgText
          x={px(corridor.path[0].lat, corridor.path[0].lng).x}
          y={px(corridor.path[0].lat, corridor.path[0].lng).y - 18}
          fill={C.mapInk} fontSize="12" fontFamily={MONO}
        >
          {corridor.corridor}
        </SvgText>

        {visible.map((r) => {
          const p = px(r.lat, r.lng);
          const on = selected && selected.busId === r.busId;
          const tone = toneColor(C, r.statusMeta.tone);
          return (
            <G key={r.busId} onPress={() => onSelect(r.busId)}>
              {on ? <Circle cx={p.x} cy={p.y} r="24" fill={tone} opacity="0.16" /> : null}
              <Circle cx={p.x} cy={p.y} r={on ? 14 : 11} fill={C.bg1} stroke={tone} strokeWidth={on ? 3 : 2} />
              <Rect x={p.x - 5.5} y={p.y - 4} width="11" height="8" rx="1.6" fill="none" stroke={tone} strokeWidth="1.5" />
            </G>
          );
        })}
      </Svg>

      <View style={{ position: 'absolute', left: 12, top: 12 }}>
        <Chip tone="ok" live>LIVE · {visible.length} ON THIS CORRIDOR</Chip>
      </View>
    </View>
  );
}

function Detail({ r, now, isAdmin, onMirror, account }) {
  const { C, S } = useTheme();
  const [clip, setClip] = useState(null);
  useEffect(() => { setClip(null); }, [r.busId]);
  const live = clip ? clipState(clip, now) : null;
  const driver = r.driver;

  return (
    <>
      <View style={S.card}>
        <View style={[S.row, { gap: 12 }]}>
          {driver ? <Avatar name={driver.name} hue={driver.avatarHue} size={52} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[S.plate, { fontSize: 15 }]}>{r.bus.reg}</Text>
            <Text style={[S.hint, { marginBottom: 0, marginTop: 2 }]}>{r.bus.model} · {r.bus.serial}</Text>
          </View>
          <Ring value={r.complianceScore} size={58} stroke={6} tone={toneColor(C, scoreTone(r.complianceScore))} sub="COMPLY" />
        </View>

        <View style={[S.row, { marginTop: 12, gap: 6 }]}>
          <Chip tone={chipTone(r.statusMeta.tone)} live={r.speedKph > 3}>{r.statusMeta.label}</Chip>
          <Chip tone={chipTone(r.fatigue.tone)}>{r.fatigue.level} {r.fatigue.label}</Chip>
          <Chip>{r.corridorName}</Chip>
        </View>

        {driver ? (
          <Text style={[S.hint, { marginTop: 12, marginBottom: 0 }]}>
            {driver.name} · on duty since {r.shiftStart} · {r.dutyHours24h} h in 24 h
          </Text>
        ) : null}
      </View>

      <View style={S.card}>
        <View style={[S.row, { marginBottom: 12 }]}>
          <Text style={S.h3}>Cab</Text>
          <View style={{ flex: 1 }} />
          <Chip tone={r.cabin.cameraOnline ? 'ok' : 'warn'}>
            {r.cabin.cameraOnline ? `SNAPSHOT ${r.cabin.driverSnapshotAgeS}s AGO` : 'CAMERA OFFLINE'}
          </Chip>
        </View>

        {r.cabin.cameraOnline ? (
          <Viewport
            badge={live && live.state === 'ready' ? `CABIN CLIP · ${live.seconds}s` : 'DRIVER CAM · STILL'}
            stamp={new Date(now - r.cabin.driverSnapshotAgeS * 1000).toLocaleTimeString()}
          >
            <SyntheticFeed
              seed={r.bus.seats}
              kind={live && live.state === 'ready' ? 'cabin' : 'face'}
              night={new Date(now).getHours() < 7 || new Date(now).getHours() > 18}
            />
          </Viewport>
        ) : (
          <View style={[S.viewport, { alignItems: 'center', justifyContent: 'center', padding: 20 }]}>
            <Text style={[S.hint, { textAlign: 'center', marginBottom: 0 }]}>
              This vehicle has no working driver camera. The DMS is running context-only — duty
              hours, circadian phase and lane-keeping, with no ocular signal.
            </Text>
          </View>
        )}

        {live && live.state === 'uploading' ? (
          <View style={{ marginTop: 12 }}>
            <View style={S.statLine}>
              <Text style={S.statK}>Uploading last {live.seconds}s from the cab</Text>
              <Text style={S.statV}>{Math.round(live.progress * 100)}%</Text>
            </View>
            <Meter value={live.progress * 100} tone={C.sky} />
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Btn
              icon={live && live.state === 'ready' ? IconRefresh : IconPlay}
              disabled={!r.cabin.clipAvailable}
              onPress={() => setClip(requestCabinClip({
                busId: r.busId, seconds: 20, reason: 'routine check',
                by: account ? `${account.role}:${account.username}` : 'console',
              }))}
            >
              {live && live.state === 'ready' ? 'Request again' : 'Request 20 s clip'}
            </Btn>
          </View>
        )}

        <Text style={[S.hint, { marginTop: 10, marginBottom: 0 }]}>
          Cabin video is pulled on request and never streamed continuously (§16.3). Every request
          is stamped with who asked, when, and why.
        </Text>
      </View>

      <View style={S.card}>
        <Text style={S.h3}>Live telemetry</Text>
        <View style={{ marginTop: 8 }}>
          <Stat k="Position" v={`${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`} />
          <Stat k="Speed / lane" v={`${r.speedKph} km/h · lane ${r.lane} of ${r.lanes}`} />
          <Stat k="Heading" v={`${r.heading}°`} />
          <Stat k="ETA" v={r.etaMin != null ? `${r.etaMin} min · ${r.remainingKm} km` : 'stationary'} />
          <Stat k="Engine" v={`${r.rpm} rpm · ${r.coolantC} °C`} />
          <Stat k="Fuel" v={`${r.fuelPct}%`} tone={r.fuelPct < 20 ? C.danger : null} />
          <Stat k="Load" v={r.bus.cargo} />
          <Stat k="Harsh events this trip" v={r.harshEvents} tone={r.harshEvents > 3 ? C.amber : null} />
          <Stat k="Last sync" v={`${r.lastSyncS}s ago`} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Meter value={r.progress * 100} tone={toneColor(C, r.statusMeta.tone)} />
        </View>
      </View>

      {isAdmin ? (
        <Btn kind="primary" size="lg" icon={IconWheel} onPress={() => onMirror && onMirror(r)}>
          Open this driver's screen
        </Btn>
      ) : null}

      {r.status === 'alert' ? (
        <View style={[S.card, { borderColor: C.danger }]}>
          <View style={[S.row, { gap: 9 }]}>
            <IconAlert size={18} color={C.danger} />
            <Text style={[S.h3, { marginBottom: 0 }]}>Needs attention</Text>
          </View>
          <Text style={[S.hint, { marginTop: 9, marginBottom: 0 }]}>
            {r.fatigue.level === 'D4' || r.fatigue.level === 'D3'
              ? `Driver is at ${r.fatigue.level} ${r.fatigue.label}. The tablet has already spoken and notified the depot. Call before the next stop.`
              : `Advisory compliance has fallen to ${r.complianceScore}%. The driver is repeatedly ignoring lane and speed advice.`}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function Stat({ k, v, tone }) {
  const { S } = useTheme();
  return (
    <View style={S.statLine}>
      <Text style={S.statK}>{k}</Text>
      <Text style={[S.statV, tone ? { color: tone } : null]}>{v}</Text>
    </View>
  );
}

const chipTone = (t) =>
  t === 'danger' ? 'danger' : t === 'warn' ? 'warn' : t === 'watch' ? 'watch' : t === 'ok' ? 'ok' : null;
