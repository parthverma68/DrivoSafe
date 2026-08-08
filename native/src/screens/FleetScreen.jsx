/* Fleet dashboard — REACT NATIVE. SYSTEM_DESIGN §13.4.
 * One operator's health on one corridor.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { OPERATORS, DRIVERS, forOperator, CORRIDOR_DEFS, getRoute } from '@drivosafe/shared';
import { C, S, MONO } from '../theme.js';
import { Panel, Kpi, Table, Badge, Bar, Chip, Cycler, StatLine } from '../components/ui.jsx';

const qColor = (q) => (q >= 80 ? C.ok : q >= 60 ? C.warn : q >= 35 ? '#ff8b52' : C.danger);

const VALUE_STACK = [
  { item: 'Fuel — smoother speed profile, fewer needless decelerations', perBus: 41000 },
  { item: 'Tyres — fewer impacts at speed', perBus: 18500 },
  { item: 'Suspension & chassis — reduced shock loading', perBus: 22000 },
  { item: 'Breakdown avoidance — fewer road-induced failures', perBus: 15000 },
  { item: 'Insurance — verifiable driver-behaviour record', perBus: 9500 },
];

export default function FleetScreen() {
  const [operatorId, setOperatorId] = useState(OPERATORS[0].id);
  const [routeId, setRouteId] = useState(CORRIDOR_DEFS[0].id);

  const operator = OPERATORS.find((o) => o.id === operatorId);
  const corridor = CORRIDOR_DEFS.find((c) => c.id === routeId);
  const route = useMemo(() => getRoute(routeId), [routeId]);
  const drivers = forOperator(DRIVERS, operatorId).slice().sort((a, b) => b.captainScore - a.captainScore);
  const stale = !/today/.test(corridor.freshness || '');

  /* Corridor condition heatmap: lanes × 250 m segments, taking each segment's
   * base lane quality and degrading it by any event sitting in it — the same
   * effective-quality idea the advisory uses, aggregated for a human. */
  const segments = useMemo(() => {
    const out = [];
    for (let m = 0; m < route.length; m += 250) {
      const base = route.laneQualityAt(m) || [];
      const evs = route.eventsBetween(m, m + 250);
      out.push({
        m,
        cells: base.map((q, lane) => {
          const hit = evs.filter((e) => e.lane == null || e.lane === lane);
          const pen = hit.reduce((a, e) => a + (e.severity != null ? e.severity : 0.6) * 30, 0);
          return Math.max(0, Math.round(q - pen));
        }),
      });
    }
    return out;
  }, [route]);

  const totalValue = VALUE_STACK.reduce((a, v) => a + v.perBus, 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
      <View style={[S.row, { marginBottom: 12 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.fg }}>Fleet dashboard</Text>
        <Cycler
          options={OPERATORS.map((o) => ({ value: o.id, label: o.name }))}
          value={operatorId}
          onChange={setOperatorId}
          width={160}
        />
        <Cycler
          options={CORRIDOR_DEFS.map((c) => ({ value: c.id, label: c.name }))}
          value={routeId}
          onChange={setRouteId}
          width={190}
        />
        <Chip tone={stale ? 'warn' : 'ok'}>
          {stale ? 'STALE' : 'FRESH'} — {corridor.freshness}
        </Chip>
      </View>

      <View style={[S.row, { marginBottom: 12 }]}>
        <Kpi k="Fleet RQI" v={operator.rqi} d="ride quality index, 0–100" tone={operator.rqi >= 80 ? C.ok : C.warn} />
        <Kpi
          k="Advisory compliance" v={operator.compliance + '%'} d="events handled as advised"
          tone={operator.compliance >= 85 ? C.ok : operator.compliance >= 75 ? C.warn : C.danger}
        />
        <Kpi k="Fuel saved" v="6.8%" d="vs. pre-install baseline" tone={C.ok} />
        <Kpi k="Harsh events" v="3.1" d="per 1000 km" />
        <Kpi k="Buses reporting" v={operator.buses} d="telemetry in the last 24 h" />
      </View>

      <Panel
        title={`Corridor condition — ${corridor.name}`}
        hint="Lane × 250 m chainage. Base scan quality degraded by the events sitting in each cell — the same effective-quality calculation the in-cab advisory runs, aggregated for a human reader."
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {Array.from({ length: route.lanes }, (_, lane) => (
              <View key={lane} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <Text style={{ fontFamily: MONO, fontSize: 10, color: C.fg3, width: 52 }}>LANE {lane + 1}</Text>
                {segments.map((s) => (
                  <View
                    key={s.m}
                    style={{ width: 30, height: 20, borderRadius: 2, marginRight: 2, backgroundColor: qColor(s.cells[lane]) }}
                  />
                ))}
              </View>
            ))}
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: 52 }} />
              {segments.map((s) => (
                <Text key={s.m} style={{ width: 30, marginRight: 2, fontFamily: MONO, fontSize: 8, color: C.fg3, textAlign: 'center' }}>
                  {s.m / 1000}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
        <View style={[S.row, { marginTop: 10 }]}>
          <Text style={{ fontSize: 10, color: C.fg3 }}>km along corridor ·</Text>
          <Text style={{ fontSize: 10, color: C.ok }}>■ good ≥80</Text>
          <Text style={{ fontSize: 10, color: C.warn }}>■ medium 60–79</Text>
          <Text style={{ fontSize: 10, color: C.danger }}>■ poor &lt;60</Text>
        </View>
      </Panel>

      <Panel title="Captain Score leaderboard" hint="Operator-only. Never public, never passenger-visible.">
        {drivers.length === 0 ? (
          <Text style={{ fontSize: 12, color: C.fg3 }}>No drivers assigned to this operator.</Text>
        ) : (
          drivers.map((d) => (
            <View key={d.id} style={{ marginBottom: 11 }}>
              <View style={[S.row, { justifyContent: 'space-between', marginBottom: 4 }]}>
                <View style={S.row}>
                  <Text style={{ fontSize: 12, color: C.fg }}>{d.name}</Text>
                  <Badge kind={d.badge}>{d.badge}</Badge>
                </View>
                <Text style={{ fontFamily: MONO, fontSize: 12, color: C.fg }}>{d.captainScore}</Text>
              </View>
              <Bar pct={d.captainScore} color={d.captainScore >= 85 ? C.ok : d.captainScore >= 70 ? C.warn : C.danger} />
            </View>
          ))
        )}
      </Panel>

      <Panel title="Value stack" hint="Per bus per year, ₹. Modelled from the operator's own telemetry, not a generic figure.">
        <Table
          keyExtractor={(v) => v.item}
          cols={[
            { label: 'Line item', flex: 4, render: (v) => <Text style={{ fontSize: 11, color: C.fg }}>{v.item}</Text> },
            { label: '₹ / bus / yr', num: true, flex: 1.4, render: (v) => v.perBus.toLocaleString('en-IN') },
          ]}
          rows={VALUE_STACK}
        />
        <View style={{ marginTop: 8 }}>
          <StatLine k="Total per bus per year" v={'₹ ' + totalValue.toLocaleString('en-IN')} tone={C.ok} />
          <StatLine k={`Fleet of ${operator.buses}`} v={'₹ ' + (totalValue * operator.buses).toLocaleString('en-IN')} tone={C.ok} />
        </View>
      </Panel>

      <Panel
        title="RideScore"
        hint="The passenger-facing badge, derived from trip RQI. Absence is neutral — a new operator with no history is not penalised on a listing."
      >
        <View style={[S.row, { alignItems: 'flex-start' }]}>
          <View style={{ borderWidth: 1, borderColor: C.line2, borderRadius: 10, padding: 14, backgroundColor: C.bg2, minWidth: 220 }}>
            <Text style={{ fontSize: 9, letterSpacing: 1.2, color: C.fg3 }}>DRIVOSAFE RIDESCORE</Text>
            <Text style={{ fontFamily: MONO, fontSize: 34, fontWeight: '700', color: C.ok }}>{operator.rqi}</Text>
            <Text style={{ fontSize: 11, color: C.fg }}>{operator.name} · {corridor.corridor}</Text>
            <Text style={{ fontSize: 9, color: C.fg3, marginTop: 4 }}>verified {corridor.freshness}</Text>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 240 }}>
            {[
              ['Road quality', 35, corridor.laneSections[0].quality.reduce((a, b) => a + b, 0) / corridor.lanes],
              ['Driver behaviour', 30, operator.compliance],
              ['Vehicle dynamics', 20, 88],
              ['Route events', 15, Math.max(0, 100 - route.events.length * 3)],
            ].map(([label, weight, val]) => (
              <View key={label} style={{ marginBottom: 8 }}>
                <StatLine k={`${label} (${weight}%)`} v={String(Math.round(val))} />
                <Bar pct={val} color={C.ok} />
              </View>
            ))}
          </View>
        </View>
      </Panel>
    </ScrollView>
  );
}
