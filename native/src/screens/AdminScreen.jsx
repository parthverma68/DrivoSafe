/* Admin console — REACT NATIVE. SYSTEM_DESIGN §13.3.
 * Onboarding · fleet summaries · driver profiles · fatigue review.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import {
  OPERATORS, BUSES, DRIVERS, PARTNERS, byId, forOperator, CORRIDOR_DEFS, LEVEL_META,
} from '@drivosafe/shared';
import { C, S, MONO, TONE_COLOR } from '../theme.js';
import { Panel, Btn, Kpi, Table, Badge, Bar, StatLine, Cycler, Chip } from '../components/ui.jsx';

const TABS = ['Onboarding', 'Fleet summaries', 'Driver profiles', 'Fatigue review'];

export default function AdminScreen() {
  const [tab, setTab] = useState(TABS[0]);
  const [operators, setOperators] = useState(OPERATORS);
  const [buses, setBuses] = useState(BUSES);
  const [partners, setPartners] = useState(PARTNERS);
  const [toast, setToast] = useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
      <View style={[S.row, { marginBottom: 10 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.fg }}>Admin console</Text>
        <Text style={{ fontSize: 11, color: C.fg3 }}>platform tenancy, onboarding and driver records</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[S.navBtn, tab === t && S.navBtnOn]}
            >
              <Text style={[S.navTxt, tab === t && S.navTxtOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {tab === TABS[0] && (
        <Onboarding
          operators={operators}
          onOperator={(o) => { setOperators(operators.concat([o])); flash(`Operator "${o.name}" onboarded`); }}
          onBus={(b) => {
            setBuses(buses.concat([b]));
            setOperators(operators.map((o) => (o.id === b.operatorId ? { ...o, buses: o.buses + 1 } : o)));
            flash(`Bus ${b.reg} onboarded — operator fleet count updated`);
          }}
          onPartner={(p) => { setPartners(partners.concat([p])); flash(`Partner "${p.name}" onboarded`); }}
        />
      )}
      {tab === TABS[1] && <Summaries operators={operators} buses={buses} partners={partners} />}
      {tab === TABS[2] && <DriverProfiles operators={operators} />}
      {tab === TABS[3] && <FatigueReview />}

      {toast ? (
        <View style={{ position: 'absolute', bottom: 18, alignSelf: 'center', backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: '#04120c', fontWeight: '700', fontSize: 13 }}>{toast}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={S.label}>{label}</Text>
      <TextInput
        style={S.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.fg3}
      />
    </View>
  );
}

function Onboarding({ operators, onOperator, onBus, onPartner }) {
  const [op, setOp] = useState({ name: '', type: 'Passenger', corridor: 'NH-52', contact: '' });
  const [bus, setBus] = useState({
    reg: '', operatorId: operators[0] ? operators[0].id : '', model: '',
    kit: 'Assistant+OBD', transmission: 'manual', dmsCamera: true,
  });
  const [lp, setLp] = useState({ name: '', mode: 'Line-haul', fleet: 10, corridors: 1, sla: 95 });

  return (
    <>
      <Panel
        title="Onboard operator"
        hint="Creates a tenant. Every downstream record — buses, drivers, trips, scores — is scoped to it and invisible to other tenants."
      >
        <Field label="Name" value={op.name} onChange={(v) => setOp({ ...op, name: v })} placeholder="Sarthi Travels" />
        <View style={[S.row, { marginBottom: 10 }]}>
          <Cycler label="TYPE" options={['Passenger', 'Logistics', 'Mixed']} value={op.type} onChange={(v) => setOp({ ...op, type: v })} />
          <Cycler
            label="CORRIDOR"
            options={[...new Set(CORRIDOR_DEFS.map((c) => c.corridor))]}
            value={op.corridor}
            onChange={(v) => setOp({ ...op, corridor: v })}
          />
        </View>
        <Field label="Contact" value={op.contact} onChange={(v) => setOp({ ...op, contact: v })} placeholder="ops@example.com" />
        <Btn
          kind="primary"
          disabled={!op.name.trim() || !op.contact.trim()}
          onPress={() => {
            onOperator({ id: 'op-' + Date.now().toString(36), buses: 0, rqi: 0, compliance: 0, ...op });
            setOp({ name: '', type: 'Passenger', corridor: 'NH-52', contact: '' });
          }}
        >
          ONBOARD OPERATOR
        </Btn>
      </Panel>

      <Panel
        title="Onboard bus"
        hint="The kit tier decides what the app can do. App-only has no OBD, so speed compliance and gear advisory are unavailable. No DMS camera caps drowsiness detection at D2, context-only."
      >
        <Field label="Registration" value={bus.reg} onChange={(v) => setBus({ ...bus, reg: v })} placeholder="MP09 FA 4412" />
        <Field label="Model" value={bus.model} onChange={(v) => setBus({ ...bus, model: v })} placeholder="Tata Starbus" />
        <View style={[S.row, { marginBottom: 10 }]}>
          <Cycler
            label="OPERATOR"
            options={operators.map((o) => ({ value: o.id, label: o.name }))}
            value={bus.operatorId}
            onChange={(v) => setBus({ ...bus, operatorId: v })}
            width={150}
          />
          <Cycler
            label="KIT"
            options={['Assistant+OBD', 'Assistant app-only', 'Mapper (LiDAR)']}
            value={bus.kit}
            onChange={(v) => setBus({ ...bus, kit: v })}
            width={150}
          />
          <Cycler label="TRANSMISSION" options={['manual', 'automatic']} value={bus.transmission} onChange={(v) => setBus({ ...bus, transmission: v })} />
          <Cycler
            label="DMS CAMERA"
            options={[{ value: true, label: 'NIR fitted' }, { value: false, label: 'none — context only' }]}
            value={bus.dmsCamera}
            onChange={(v) => setBus({ ...bus, dmsCamera: v })}
            width={150}
          />
        </View>
        <Btn
          kind="primary"
          disabled={!bus.reg.trim() || !bus.model.trim() || !bus.operatorId}
          onPress={() => {
            onBus({ id: 'bus-' + Date.now().toString(36), efficiencyBand: { rpmLow: 1200, rpmHigh: 1800 }, ...bus });
            setBus({ ...bus, reg: '', model: '' });
          }}
        >
          ONBOARD BUS
        </Btn>
      </Panel>

      <Panel
        title="Onboard logistics partner"
        hint="Freight tenants consume the same corridor model with an SLA-oriented roll-up instead of RideScore."
      >
        <Field label="Name" value={lp.name} onChange={(v) => setLp({ ...lp, name: v })} placeholder="Vindhya Freight" />
        <View style={[S.row, { marginBottom: 10 }]}>
          <Cycler label="MODE" options={['Line-haul', 'Container', 'Last-mile', 'Cold-chain']} value={lp.mode} onChange={(v) => setLp({ ...lp, mode: v })} />
          <Cycler label="FLEET" options={[10, 25, 50, 100, 200]} value={lp.fleet} onChange={(v) => setLp({ ...lp, fleet: v })} />
          <Cycler label="SLA %" options={[85, 90, 93, 95, 98]} value={lp.sla} onChange={(v) => setLp({ ...lp, sla: v })} />
        </View>
        <Btn
          kind="primary"
          disabled={!lp.name.trim()}
          onPress={() => { onPartner({ id: 'lp-' + Date.now().toString(36), ...lp }); setLp({ ...lp, name: '' }); }}
        >
          ONBOARD PARTNER
        </Btn>
      </Panel>

      <Panel
        title="Route onboarding"
        hint="Corridors are authored in the Route Editor, not here. A route stays pending first scan until a mapper has driven it — the app never shows advisory for a corridor it has not seen."
      >
        <Table
          keyExtractor={(c) => c.id}
          cols={[
            { label: 'Corridor', flex: 2.4, render: (c) => c.name },
            { label: 'Lanes', num: true, render: (c) => String(c.lanes) },
            { label: 'Length', num: true, render: (c) => (c.length / 1000).toFixed(2) + ' km' },
            {
              label: 'Freshness', flex: 1.4,
              render: (c) => (
                <Text style={[S.td, { color: /today/.test(c.freshness) ? C.ok : C.warn }]} numberOfLines={1}>
                  {c.freshness}
                </Text>
              ),
            },
            { label: 'Status', render: (c) => <Badge>{c.status}</Badge> },
          ]}
          rows={CORRIDOR_DEFS}
        />
      </Panel>
    </>
  );
}

function Summaries({ operators, buses, partners }) {
  return (
    <>
      <Panel title="Operators" hint="Compliance below 75% is flagged as a renewal risk — a fleet not acting on advisory will not renew.">
        <Table
          keyExtractor={(o) => o.id}
          cols={[
            { label: 'Operator', flex: 2, render: (o) => o.name },
            { label: 'Type', render: (o) => o.type },
            { label: 'Buses', num: true, render: (o) => String(o.buses) },
            { label: 'RQI', num: true, render: (o) => String(o.rqi || '—') },
            {
              label: 'Compliance', num: true, flex: 1.3,
              render: (o) => (
                <Text style={[S.td, { fontFamily: MONO, color: o.compliance && o.compliance < 75 ? C.danger : C.ok }]}>
                  {o.compliance ? o.compliance + '%' : '—'}{o.compliance && o.compliance < 75 ? ' ⚠' : ''}
                </Text>
              ),
            },
          ]}
          rows={operators}
        />
      </Panel>

      <Panel title="Logistics partners">
        <Table
          keyExtractor={(p) => p.id}
          cols={[
            { label: 'Partner', flex: 2, render: (p) => p.name },
            { label: 'Mode', render: (p) => p.mode },
            { label: 'Fleet', num: true, render: (p) => String(p.fleet) },
            { label: 'Corridors', num: true, render: (p) => String(p.corridors) },
            {
              label: 'SLA', num: true,
              render: (p) => <Text style={[S.td, { fontFamily: MONO, color: p.sla < 90 ? C.warn : C.ok }]}>{p.sla}%</Text>,
            },
          ]}
          rows={partners}
        />
      </Panel>

      <Panel title="Buses & kit coverage" hint="Kit tier determines available capability per bus; the app degrades rather than failing when a sensor is absent.">
        <Table
          keyExtractor={(b) => b.id}
          cols={[
            { label: 'Reg', flex: 1.4, render: (b) => <Text style={[S.td, { fontFamily: MONO }]}>{b.reg}</Text> },
            { label: 'Operator', flex: 1.4, render: (b) => { const o = byId(operators, b.operatorId); return o ? o.name : '—'; } },
            { label: 'Model', flex: 1.4, render: (b) => b.model },
            { label: 'Kit', flex: 1.4, render: (b) => <Badge>{b.kit}</Badge> },
            {
              label: 'Transmission', flex: 1.4,
              render: (b) => (
                <Text style={[S.td, b.transmission === 'automatic' && { color: C.fg3 }]} numberOfLines={1}>
                  {b.transmission}{b.transmission === 'automatic' ? ' (no gear)' : ''}
                </Text>
              ),
            },
            {
              label: 'DMS',
              render: (b) => (
                <Text style={[S.td, { color: b.dmsCamera ? C.ok : C.warn }]} numberOfLines={1}>
                  {b.dmsCamera ? 'camera' : 'context-only'}
                </Text>
              ),
            },
          ]}
          rows={buses}
        />
      </Panel>
    </>
  );
}

function DriverProfiles({ operators }) {
  const [opFilter, setOpFilter] = useState('');
  const list = forOperator(DRIVERS, opFilter);
  return (
    <>
      <View style={[S.row, { marginBottom: 12 }]}>
        <Cycler
          label="OPERATOR"
          options={[{ value: '', label: 'All operators' }, ...operators.map((o) => ({ value: o.id, label: o.name }))]}
          value={opFilter}
          onChange={setOpFilter}
          width={170}
        />
        <Text style={{ fontSize: 11, color: C.fg3, flexShrink: 1 }}>
          Captain Score is operator-only — never public, never passenger-visible, never shared across tenants.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {list.map((d) => (
          <View key={d.id} style={[S.panel, { flexGrow: 1, flexBasis: 230, marginBottom: 0 }]}>
            <View style={[S.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.fg, fontWeight: '700' }}>{d.name}</Text>
              <Badge kind={d.badge}>{d.badge}</Badge>
            </View>
            <Text style={{ fontFamily: MONO, fontSize: 10, color: C.fg3, marginVertical: 6 }}>{d.licenceNo}</Text>
            <Text
              style={{
                fontFamily: MONO, fontSize: 30, fontWeight: '700',
                color: d.captainScore >= 85 ? C.ok : d.captainScore >= 70 ? C.warn : C.danger,
              }}
            >
              {d.captainScore}
            </Text>
            <Text style={{ fontSize: 10, color: C.fg3, marginBottom: 10 }}>Captain Score</Text>
            <StatLine k="Trips" v={String(d.trips)} />
            <StatLine k="Harsh events" v={String(d.harshEvents)} tone={d.harshEvents > 20 ? C.danger : undefined} />
            <StatLine k="Comfort" v={d.comfort + '%'} />
            <StatLine k="Adherence" v={d.adherence + '%'} />
            <View style={{ marginTop: 8 }}>
              <Bar pct={d.adherence} color={d.adherence >= 85 ? C.ok : C.warn} />
            </View>
            {d.badge === 'Watch' ? (
              <Text style={{ color: C.danger, fontSize: 10, marginTop: 8 }}>
                ⚠ Watch tier — schedule a coaching review
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </>
  );
}

const DEMO_FATIGUE = [
  { id: 'fe-1', driverId: 'drv-3', level: 'D3', kss: 7.4, at: 'NH-52 @ 8.4 km', time: '03:12', mode: 'full', perclos: 0.34, timeOnTask: 268, ack: true },
  { id: 'fe-2', driverId: 'drv-3', level: 'D2', kss: 6.1, at: 'NH-52 @ 21.0 km', time: '04:40', mode: 'full', perclos: 0.21, timeOnTask: 356, ack: true },
  { id: 'fe-3', driverId: 'drv-5', level: 'D2', kss: 6.0, at: 'SH-27 @ 4.1 km', time: '15:05', mode: 'context-only', perclos: null, timeOnTask: 214, ack: false },
  { id: 'fe-4', driverId: 'drv-2', level: 'D4', kss: 8.8, at: 'NH-52 @ 33.7 km', time: '04:58', mode: 'full', perclos: 0.48, timeOnTask: 402, ack: true },
];

function FatigueReview() {
  return (
    <>
      <Panel
        title="Fatigue events"
        hint="Derived scalars only — no imagery is ever recorded or uploaded. Fatigue events are firewalled from the Captain Score by design: a system that punishes a driver for being tired is a system that gets a sticker put over the camera. These route to rest and rostering, not to performance."
      >
        <Table
          keyExtractor={(f) => f.id}
          cols={[
            { label: 'Driver', flex: 1.6, render: (f) => { const d = byId(DRIVERS, f.driverId); return d ? d.name : f.driverId; } },
            {
              label: 'Level', flex: 1.6,
              render: (f) => {
                const meta = LEVEL_META[f.level];
                return (
                  <Text style={[S.td, { color: TONE_COLOR[meta.tone] }]} numberOfLines={1}>
                    <Text style={{ fontWeight: '700' }}>{f.level}</Text> {meta.label}
                  </Text>
                );
              },
            },
            { label: 'KSS', num: true, render: (f) => String(f.kss) },
            { label: 'Location', flex: 1.6, render: (f) => f.at },
            { label: 'Time', num: true, render: (f) => f.time },
            { label: 'Mode', flex: 1.3, render: (f) => <Text style={[S.td, f.mode !== 'full' && { color: C.fg3 }]} numberOfLines={1}>{f.mode}</Text> },
            { label: 'PERCLOS', num: true, render: (f) => (f.perclos == null ? '—' : (f.perclos * 100).toFixed(0) + '%') },
            { label: 'On task', num: true, render: (f) => `${Math.floor(f.timeOnTask / 60)}h ${f.timeOnTask % 60}m` },
            { label: 'Ack', render: (f) => <Text style={[S.td, { color: f.ack ? C.ok : C.danger }]}>{f.ack ? 'yes' : 'PENDING'}</Text> },
          ]}
          rows={DEMO_FATIGUE}
        />
      </Panel>

      <View style={[S.row, { marginBottom: 12 }]}>
        <Kpi k="Events this week" v={DEMO_FATIGUE.length} d="across 3 drivers" />
        <Kpi k="D3+ events" v={2} d="supervisor escalation fired" tone={C.danger} />
        <Kpi k="Peak window" v="03–05" d="the circadian trough, as expected" />
        <Kpi k="Context-only share" v="25%" d="buses without a DMS camera" tone={C.warn} />
      </View>

      <Panel
        title="Rostering recommendation"
        hint="Three of four events fall in the 03:00–05:00 circadian trough at over 4 hours continuous driving. The lever here is the roster, not the driver: shorten the overnight leg or insert a mandatory break at the 3.5-hour mark. Sunil Patil (drv-3) has two events in one week and should not be assigned the overnight NH-52 leg until reviewed."
      />
    </>
  );
}
