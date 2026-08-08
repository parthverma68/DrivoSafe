/* Info tiles — REACT NATIVE. SYSTEM_DESIGN §11.2.
 *
 * The RN siblings of app/src/components/tiles/index.jsx. Same contract: every
 * tile is a thin presentational view over ONE live payload (the HUD engine's
 * `drive` info plus telemetry), so adding a tile type is a new component and
 * zero new plumbing.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import Svg, { Polyline, Circle, Rect } from 'react-native-svg';
import { getEventType } from 'react-road-hazards';
import { LEVEL_META } from '@drivosafe/shared';
import { C, S, MONO, TONE_COLOR, ROLE_COLOR } from '../theme.js';
import { StatLine, Btn } from './ui.jsx';

const POI_COLOR = {
  'petrol-pump': C.warn,
  'rest-stop': C.ok,
  mechanic: C.danger,
};

/* ---------- lane policy ---------- */
export function LanePolicyTile({ s }) {
  const d = s.driveInfo;
  const lanes = (d && d.laneInfo) || [];
  const policy = (d && d.policyText) || 'ACQUIRING';
  const reduce = s.advisory && s.advisory.reduceSpeed;
  return (
    <>
      <Text style={S.tileTitle}>Lane policy</Text>
      <View style={S.tileBody}>
        <Text
          style={{
            fontFamily: MONO, fontSize: 12, fontWeight: '700', lineHeight: 16,
            color: reduce ? C.danger : C.ok,
          }}
        >
          {policy}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 46, gap: 4, marginTop: 8 }}>
          {lanes.map((l) => (
            <View key={l.lane} style={{ flex: 1, justifyContent: 'flex-end' }}>
              <View
                style={{
                  height: Math.max(4, l.score * 0.34),
                  borderTopLeftRadius: 3, borderTopRightRadius: 3,
                  backgroundColor: ROLE_COLOR[l.role] || '#6b7a85',
                }}
              />
              <Text
                style={{ fontFamily: MONO, fontSize: 8, textAlign: 'center', color: ROLE_COLOR[l.role], marginTop: 3 }}
              >
                L{l.lane + 1}
              </Text>
            </View>
          ))}
        </View>
        <Text style={S.tileNote}>
          you: L{s.lane + 1}
          {s.advisory && s.advisory.primary != null ? ` · hold L${s.advisory.primary + 1}` : ''}
        </Text>
      </View>
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
      <Text style={S.tileTitle}>Speed &amp; gear</Text>
      <View style={S.tileBody}>
        <Text style={[S.tileHero, over && { color: C.danger }]}>
          {s.speed}
          <Text style={{ fontSize: 12, color: C.fg3 }}> km/h</Text>
        </Text>
        <Text style={[S.tileSub, { color: slowTo != null ? (over ? C.danger : C.warn) : C.fg3 }]}>
          {slowTo != null ? `SLOW TO ${slowTo}` : 'cruise'}
        </Text>
        <Text style={S.tileNote}>
          {g.gear ? `gear ${g.gear} · ${s.rpm} rpm` : `${s.rpm} rpm · auto`}
          {g.advice ? <Text style={{ color: C.warn }}> · SHIFT {g.advice}</Text> : null}
        </Text>
      </View>
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
        <Text style={S.tileTitle}>Next hazard</Text>
        <View style={S.tileBody}>
          <Text style={[S.tileHeroSm, { color: C.ok }]}>ROAD CLEAR</Text>
          <Text style={[S.tileSub, { color: C.fg3 }]}>nothing in the 200 m window</Text>
        </View>
      </>
    );
  }
  const T = getEventType(ev.type);
  const col = TONE_COLOR[T.tone] || C.ok;
  const dist = Math.round(d.distance);
  return (
    <>
      <Text style={S.tileTitle}>Next hazard</Text>
      <View style={S.tileBody}>
        <Text style={{ fontFamily: MONO, fontSize: 12, fontWeight: '700', color: col }} numberOfLines={1}>
          {T.name}
        </Text>
        <Text style={[S.tileHero, { color: col, marginTop: 3 }]}>
          {dist <= 0 ? 'NOW' : dist}
          {dist > 0 ? <Text style={{ fontSize: 12, color: C.fg3 }}> m</Text> : null}
        </Text>
        <Text style={S.tileNote}>
          {ev.lane != null ? `lane ${ev.lane + 1} · ` : 'full width · '}
          {ev.confidence || 'med'} conf
        </Text>
        <Text style={[S.tileNote, { color: C.fg3 }]}>verified {ev.verifiedAt || 'unknown'}</Text>
      </View>
    </>
  );
}

/* ---------- driver state (DMS) ---------- */
export function DrowsinessTile({ s, onBreak }) {
  const d = s.drowsiness;
  const meta = LEVEL_META[d.level] || LEVEL_META.D0;
  const oc = d.ocular;
  const col = TONE_COLOR[meta.tone] || C.ok;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={S.tileTitle}>Driver state</Text>
        <Text style={[S.tileTitle, { color: d.mode === 'full' ? C.ok : C.warn }]}>
          {d.mode === 'full' ? 'CAM' : 'CTX'}
        </Text>
      </View>
      <View style={S.tileBody}>
        {d.calibrating ? (
          <>
            <Text style={[S.tileHeroSm, { color: C.fg3 }]}>CALIBRATING</Text>
            <Text style={[S.tileSub, { color: C.fg3 }]}>90 s open-eye baseline</Text>
          </>
        ) : (
          <>
            <Text style={[S.tileHeroSm, { color: col }]}>
              {d.level} <Text style={{ fontSize: 12 }}>{meta.label}</Text>
            </Text>
            <Text style={S.tileSub}>KSS {d.kss} · conf {d.confidence}</Text>
            <Text style={S.tileNote}>
              {oc
                ? `PERCLOS ${(oc.perclos * 100).toFixed(0)}% · long blinks ${oc.longBlinkRate.toFixed(1)}/min`
                : 'context-only — capped at D2'}
            </Text>
            <Text style={[S.tileNote, { color: C.fg3 }]}>
              on task {Math.floor(d.timeOnTaskMin)} min
            </Text>
          </>
        )}
        {['D2', 'D3', 'D4'].includes(d.level) && onBreak ? (
          <Btn kind="primary" onPress={onBreak} style={{ marginTop: 7, paddingVertical: 5 }}>
            LOG BREAK
          </Btn>
        ) : null}
      </View>
    </>
  );
}

/* ---------- trip score ---------- */
export function TripScoreTile({ s }) {
  const c = s.compliance;
  const col = c.score >= 85 ? C.ok : c.score >= 70 ? C.warn : C.danger;
  return (
    <>
      <Text style={S.tileTitle}>Trip score</Text>
      <View style={S.tileBody}>
        <Text style={[S.tileHero, { color: col }]}>{c.score}</Text>
        <Text style={S.tileSub}>RQI {s.rqi.score} · {c.passed}/{c.counted} passed</Text>
        <Text style={S.tileNote}>{c.excluded} exonerated · {c.demerits} demerits</Text>
        <Text style={[S.tileNote, { color: C.fg3 }]}>
          {c.behaviour.harshBrakes} harsh · {c.behaviour.overspeedPct}% overspeed
        </Text>
      </View>
    </>
  );
}

/* ---------- upcoming ---------- */
export function UpcomingTile({ s, route }) {
  const list = route.upcoming(s.progress, 5);
  return (
    <>
      <Text style={S.tileTitle}>Upcoming</Text>
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
        {list.length === 0 ? (
          <Text style={{ fontFamily: MONO, fontSize: 11, color: C.fg3 }}>corridor clear</Text>
        ) : (
          list.map((u) => (
            <StatLine
              key={u.event.id}
              k={u.name}
              v={u.passing ? 'NOW' : u.distance + 'm'}
              tone={TONE_COLOR[u.tone]}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

/* ---------- amenities ---------- */
export function AmenitiesTile({ s }) {
  const list = (s.driveInfo && s.driveInfo.amenities) || [];
  return (
    <>
      <Text style={S.tileTitle}>Amenities ahead</Text>
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
        {list.length === 0 ? (
          <Text style={{ fontFamily: MONO, fontSize: 11, color: C.fg3 }}>none in range</Text>
        ) : (
          list.map((a, i) => (
            <StatLine key={i} k={a.name} v={`${Math.round(a.distance)}m ${a.side === 'left' ? '←' : '→'}`} />
          ))
        )}
      </ScrollView>
    </>
  );
}

/* ---------- traffic ---------- */
export function TrafficTile({ s }) {
  const list = (s.driveInfo && s.driveInfo.traffic) || [];
  return (
    <>
      <Text style={S.tileTitle}>Traffic ahead</Text>
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
        {list.length === 0 ? (
          <Text style={{ fontFamily: MONO, fontSize: 11, color: C.fg3 }}>clear</Text>
        ) : (
          list.slice(0, 5).map((v, i) => (
            <StatLine
              key={i}
              k={`${v.kind} L${v.lane + 1}${v.braking ? ' BRAKING' : ''}`}
              v={`${Math.round(v.distance)}m`}
              tone={v.braking ? C.danger : undefined}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

/* ---------- compliance checks ---------- */
export function ComplianceChecksTile({ s }) {
  return (
    <>
      <Text style={S.tileTitle}>Last checks</Text>
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
        {s.results.length === 0 ? (
          <Text style={{ fontFamily: MONO, fontSize: 11, color: C.fg3 }}>no events passed yet</Text>
        ) : (
          s.results.map((r) => (
            <StatLine
              key={r.id}
              k={r.name}
              v={r.excluded ? 'EXCL' : r.passed ? 'PASS' : 'FAIL'}
              tone={r.excluded ? C.fg3 : r.passed ? C.ok : C.danger}
            />
          ))
        )}
      </ScrollView>
    </>
  );
}

/* ---------- route map ---------- */
export function MapTile({ s, route }) {
  const W = 240, H = 110, PAD = 12;
  const p = route.path;
  if (!p) return <Text style={S.tileTitle}>Map unavailable</Text>;

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
      <Text style={S.tileTitle}>Route map</Text>
      <View style={S.tileBody}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <Polyline points={line} fill="none" stroke={C.line2} strokeWidth="3" />
          {route.events.map((ev) => {
            const q = at(ev.at);
            const T = getEventType(ev.type);
            return (
              <Circle
                key={ev.id} cx={q.x} cy={q.y} r="2.6"
                fill={TONE_COLOR[T.tone] || C.ok}
                opacity={ev.at < s.progress ? 0.3 : 1}
              />
            );
          })}
          {route.pois.map((poi, i) => {
            const q = at(poi.at);
            return (
              <Rect
                key={i} x={q.x - 2} y={q.y - 2} width="4" height="4"
                fill={POI_COLOR[poi.type] || C.watch} opacity="0.85"
              />
            );
          })}
          <Circle cx={me.x} cy={me.y} r="5" fill={C.ok} />
          <Circle cx={me.x} cy={me.y} r="8" fill="none" stroke={C.ok} strokeWidth="1.5" opacity="0.5" />
        </Svg>
        <Text style={S.tileNote}>
          {(s.progress / 1000).toFixed(2)} / {(route.length / 1000).toFixed(2)} km
        </Text>
      </View>
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
};
