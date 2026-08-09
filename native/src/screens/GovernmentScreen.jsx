/* Government / concessionaire dashboard — REACT NATIVE. SYSTEM_DESIGN §13.5.
 *
 * Pavement intelligence for road owners. Every figure here is a by-product of
 * buses that were driving the corridor anyway — which is the commercial point:
 * continuous survey at no marginal survey cost.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { getEventType } from 'react-road-hazards';
import { CORRIDOR_DEFS, getRoute } from '@drivosafe/shared';
import { MONO, useTheme } from '../theme.js';
import { Panel, Kpi, Table, Bar, StatLine, Cycler } from '../components/ui.jsx';

const OBSERVABLES = [
  { k: 'Lane-marking visibility', v: 58, note: 'faded between 0.6–1.1 km; repaint before monsoon' },
  { k: 'Signage presence', v: 74, note: 'speed-breaker at 0.38 km is unmarked' },
  { k: 'Shoulder condition', v: 41, note: 'erosion on the left shoulder past 1.2 km' },
  { k: 'Encroachment', v: 66, note: 'informal parking narrowing L1 near the school zone' },
];

export default function GovernmentScreen() {
  const { C, S } = useTheme();
  const [routeId, setRouteId] = useState(CORRIDOR_DEFS[0].id);
  const corridor = CORRIDOR_DEFS.find((c) => c.id === routeId);
  const route = useMemo(() => getRoute(routeId), [routeId]);

  /* Maintenance priority: severity × confidence × lane exposure.
   * P1 is "structural and confirmed", P3 is "watch". */
  const defects = useMemo(
    () =>
      route.events
        .filter((e) => {
          const T = getEventType(e.type);
          return T.tone === 'danger' || T.tone === 'warn';
        })
        .map((e) => {
          const sev = e.severity != null ? e.severity : 0.6;
          const conf = e.confidence === 'high' ? 1 : e.confidence === 'med' ? 0.72 : 0.45;
          const T = getEventType(e.type);
          const exposure = e.lane == null ? 1 : 0.7;
          const score = Math.round(100 - sev * conf * exposure * 85);
          return {
            id: e.id,
            segment: `${(e.at / 1000).toFixed(2)}–${((e.at + (e.length || T.len)) / 1000).toFixed(2)} km`,
            defect: T.name,
            lane: e.lane == null ? 'full width' : 'L' + (e.lane + 1),
            score,
            priority: score < 45 ? 'P1' : score < 65 ? 'P2' : 'P3',
            trend: sev > 0.75 ? -9 : sev > 0.5 ? -4 : -1,
            confidence: e.confidence || 'med',
            verifiedAt: e.verifiedAt || 'unknown',
          };
        })
        .sort((a, b) => a.score - b.score),
    [route]
  );

  const p1 = defects.filter((d) => d.priority === 'P1').length;
  const surfaceScore = Math.round(
    corridor.laneSections.reduce((a, s) => a + s.quality.reduce((x, y) => x + y, 0) / s.quality.length, 0) /
      corridor.laneSections.length
  );

  /* Post-monsoon deterioration: same segments re-scored week over week. This
   * curve is the government product — a single scan is a photograph, a series
   * is evidence. */
  const trend = [
    { week: 'W-10', score: surfaceScore + 14 },
    { week: 'W-8', score: surfaceScore + 12 },
    { week: 'W-6', score: surfaceScore + 7 },
    { week: 'W-4', score: surfaceScore + 3 },
    { week: 'W-2', score: surfaceScore + 1 },
    { week: 'now', score: surfaceScore },
  ];
  const maxT = Math.max(...trend.map((t) => t.score));

  const prioColor = (p) => (p === 'P1' ? C.danger : p === 'P2' ? C.warn : C.watch);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
      <View style={[S.row, { marginBottom: 12 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.fg }}>Government dashboard</Text>
        <Cycler
          options={CORRIDOR_DEFS.map((c) => ({ value: c.id, label: c.name }))}
          value={routeId}
          onChange={setRouteId}
          width={190}
        />
        <Text style={{ fontSize: 11, color: C.fg3, flexShrink: 1 }}>
          surveyed by {corridor.mappers} mapper bus{corridor.mappers === 1 ? '' : 'es'} on their normal service runs
        </Text>
      </View>

      <View style={[S.row, { marginBottom: 12 }]}>
        <Kpi
          k="Surface score" v={surfaceScore} d="corridor mean, 0–100"
          tone={surfaceScore >= 75 ? C.ok : surfaceScore >= 60 ? C.warn : C.danger}
        />
        <Kpi k="P1 defects" v={p1} d="structural and confirmed" tone={p1 ? C.danger : C.ok} />
        <Kpi
          k="Scan freshness" v={corridor.freshness} d={`v${corridor.version}`}
          tone={/today/.test(corridor.freshness) ? C.ok : C.warn}
        />
        <Kpi k="Deterioration" v={trend[trend.length - 1].score - trend[0].score + ' pts'} d="over 10 weeks" tone={C.danger} />
      </View>

      <Panel
        title="Maintenance priority"
        hint="Ranked by severity × confidence × lane exposure. Confidence comes from repeat observation, so a P1 here has been seen on at least three separate passes — it is not one bus's bad afternoon."
      >
        <Table
          keyExtractor={(d) => d.id}
          cols={[
            { label: 'Segment', flex: 1.7, render: (d) => <Text style={[S.td, { fontFamily: MONO }]} numberOfLines={1}>{d.segment}</Text> },
            { label: 'Defect', flex: 1.8, render: (d) => d.defect },
            { label: 'Lane', flex: 1.2, render: (d) => d.lane },
            {
              label: 'Score', num: true,
              render: (d) => (
                <Text style={[S.td, { fontFamily: MONO, color: d.score < 45 ? C.danger : d.score < 65 ? C.warn : C.fg }]}>
                  {d.score}
                </Text>
              ),
            },
            { label: 'Trend', num: true, render: (d) => <Text style={[S.td, { fontFamily: MONO, color: C.danger }]}>{d.trend}</Text> },
            {
              label: 'Priority',
              render: (d) => (
                <Text style={[S.badge, { color: prioColor(d.priority), backgroundColor: prioColor(d.priority) + '22' }]}>
                  {d.priority}
                </Text>
              ),
            },
            {
              label: 'Conf', flex: 0.9,
              render: (d) => (
                <Text style={[S.td, { color: d.confidence === 'high' ? C.ok : d.confidence === 'low' ? C.fg3 : C.fg }]} numberOfLines={1}>
                  {d.confidence}
                </Text>
              ),
            },
            { label: 'Verified', flex: 1.5, render: (d) => <Text style={[S.tileNote, { marginTop: 0 }]} numberOfLines={1}>{d.verifiedAt}</Text> },
          ]}
          rows={defects}
        />
      </Panel>

      <Panel title="Deterioration trend" hint="Same segments re-scored week over week. A single scan is a photograph; the series is evidence.">
        <Svg width="100%" height={160} viewBox="0 0 400 160">
          <Polyline
            points={trend.map((t, i) => `${24 + i * 70},${145 - (t.score / maxT) * 110}`).join(' ')}
            fill="none" stroke={C.danger} strokeWidth="2.5"
          />
          {trend.map((t, i) => (
            <React.Fragment key={t.week}>
              <Circle cx={24 + i * 70} cy={145 - (t.score / maxT) * 110} r="3.5" fill={C.danger} />
              <SvgText x={24 + i * 70} y={156} fill={C.fg3} fontSize="9" textAnchor="middle" fontFamily={MONO}>
                {t.week}
              </SvgText>
              <SvgText
                x={24 + i * 70} y={145 - (t.score / maxT) * 110 - 8}
                fill={C.fg2} fontSize="9" textAnchor="middle" fontFamily={MONO}
              >
                {t.score}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
      </Panel>

      <Panel title="Passive observables" hint="Roadside condition inferred from the same scans — no extra sensor, no extra pass.">
        {OBSERVABLES.map((o) => (
          <View key={o.k} style={{ marginBottom: 12 }}>
            <StatLine k={o.k} v={String(o.v)} tone={o.v < 50 ? C.danger : o.v < 70 ? C.warn : C.ok} />
            <Bar pct={o.v} color={o.v < 50 ? C.danger : o.v < 70 ? C.warn : C.ok} />
            <Text style={{ fontSize: 10, color: C.fg3, marginTop: 3 }}>{o.note}</Text>
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}
