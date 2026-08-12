/* Attendance and lockouts — REACT NATIVE.
 *
 * Attendance here is a by-product of the pre-drive gate, not a separate
 * register: every row was produced by a face match and a breath reading, which
 * is considerably harder to sign on somebody else's behalf than a sheet at the
 * depot gate.
 *
 * Lockouts sit above the sheet rather than in a tab of their own. A bus
 * immobilised at the gate is the most time-critical thing this screen knows
 * about, and the two people who can clear it — the operator and an
 * administrator — are exactly the two who open this console.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import {
  DRIVERS, BUSES, OPERATORS, byId, scopeOf,
  attendanceForOperator, attendanceSummary, byNewest, ATTENDANCE_STATUS,
  lockoutsForScope, openLockouts, lockoutNotice,
} from '@drivosafe/shared';
import { useTheme, MONO, toneColor, scoreTone } from '../theme.js';
import { Btn, Chip, Avatar, IconLock, IconAlert, IconCheck } from '../components/kit.jsx';

const WINDOWS = [
  { id: 7, label: '7 days' },
  { id: 14, label: '14 days' },
  { id: 90, label: '90 days' },
];

export default function AttendanceScreen({ account, fleetLog }) {
  const { C, S } = useTheme();
  const scope = scopeOf(account);
  const [days, setDays] = useState(14);

  const rows = fleetLog ? fleetLog.attendance : [];
  const locks = fleetLog ? openLockouts(lockoutsForScope(fleetLog.lockouts, account)) : [];

  const windowed = useMemo(() => {
    const scoped = byNewest(attendanceForOperator(rows, scope.all ? null : scope.operatorId));
    const cutoff = Date.now() - days * 86400000;
    return scoped.filter((r) => new Date(r.checkinAt).getTime() >= cutoff);
  }, [rows, scope.all, scope.operatorId, days]);

  const summary = attendanceSummary(windowed);

  const perDriver = useMemo(() => {
    const map = new Map();
    windowed.forEach((r) => {
      const cur = map.get(r.driverId) || { driverId: r.driverId, shifts: 0, late: 0, lockouts: 0, minutes: 0 };
      if (r.status === 'locked-out') cur.lockouts += 1; else cur.shifts += 1;
      if (r.late) cur.late += 1;
      cur.minutes += r.durationMin || 0;
      map.set(r.driverId, cur);
    });
    return [...map.values()].sort((a, b) => b.shifts - a.shifts);
  }, [windowed]);

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
      {locks.map((l) => (
        <LockoutCard
          key={l.id}
          lockout={l}
          account={account}
          onReset={(note) => fleetLog.clearLockout(l.id, account, note)}
        />
      ))}

      <View style={[S.row, { gap: 6 }]}>
        {WINDOWS.map((w) => (
          <TouchableOpacity
            key={w.id}
            style={[S.navBtn, days === w.id && S.navBtnOn]}
            onPress={() => setDays(w.id)}
          >
            <Text style={[S.navTxt, days === w.id && S.navTxtOn]}>{w.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <Chip>{windowed.length} records</Chip>
      </View>

      <View style={[S.row, { gap: 10 }]}>
        <Kpi k="Shifts" v={summary.completed + summary.onDuty} d={`${summary.onDuty} on duty now`} />
        <Kpi
          k="Punctuality" v={summary.punctuality + '%'} d={`${summary.late} late starts`}
          tone={toneColor(C, scoreTone(summary.punctuality))}
        />
        <Kpi k="Hours" v={summary.hours} d="closed shifts" />
        <Kpi k="Turned away" v={summary.lockedOut} d="failed breath tests" tone={summary.lockedOut ? C.danger : null} />
      </View>

      <View style={S.card}>
        <Text style={S.h3}>By driver</Text>
        <Text style={S.hint}>
          Every row below was produced by a face match and a breath reading at the pre-drive gate.
        </Text>
        {perDriver.length === 0 ? (
          <Text style={S.hint}>No attendance in this window.</Text>
        ) : perDriver.map((d) => {
          const driver = byId(DRIVERS, d.driverId);
          return (
            <View key={d.driverId} style={[S.statLine, S.trBorder, { alignItems: 'center' }]}>
              <View style={[S.row, { gap: 8, flex: 1 }]}>
                <Avatar name={driver ? driver.name : d.driverId} hue={driver ? driver.avatarHue : 200} size={26} />
                <Text style={S.td}>{driver ? driver.name : d.driverId}</Text>
              </View>
              <Text style={S.statV}>{d.shifts} shifts</Text>
              <Text style={[S.statV, d.late ? { color: C.amber } : null]}>{d.late} late</Text>
              <Text style={[S.statV, d.lockouts ? { color: C.danger } : null]}>{d.lockouts} lockouts</Text>
              <Text style={S.statV}>{Math.round(d.minutes / 6) / 10} h</Text>
            </View>
          );
        })}
      </View>

      <View style={S.card}>
        <Text style={S.h3}>Recent check-ins</Text>
        <Text style={S.hint}>Newest first — each row carries the evidence the gate produced.</Text>
        {windowed.slice(0, 30).map((r) => {
          const driver = byId(DRIVERS, r.driverId);
          const bus = byId(BUSES, r.busId);
          const meta = ATTENDANCE_STATUS[r.status];
          return (
            <View key={r.id} style={[S.trBorder, { paddingVertical: 8 }]}>
              <View style={[S.row, { gap: 8 }]}>
                <Text style={[S.statV, { color: C.fg3 }]}>
                  {new Date(r.checkinAt).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
                  })}
                </Text>
                <Text style={S.td}>{driver ? driver.name : r.driverId}</Text>
                <View style={{ flex: 1 }} />
                <Text style={[S.chipTxt, { color: toneColor(C, meta.tone) }]}>
                  {meta.label}{r.late ? ' · late' : ''}
                </Text>
              </View>
              <Text style={[S.hint, { marginBottom: 0, marginTop: 3 }]}>
                {bus ? bus.reg : r.busId}
                {r.identity ? ` · face ${(r.identity.confidence * 100).toFixed(0)}%` : ''}
                {r.breath ? ` · ${r.breath.bac.toFixed(3)} %BAC` : ''}
                {r.durationMin != null ? ` · ${(r.durationMin / 60).toFixed(1)} h` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
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

function LockoutCard({ lockout, account, onReset }) {
  const { C, S } = useTheme();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  const bus = byId(BUSES, lockout.busId);
  const driver = byId(DRIVERS, lockout.driverId);
  const notice = lockoutNotice(lockout, { bus, driver, operator: byId(OPERATORS, lockout.operatorId) });

  return (
    <View style={[S.card, { borderColor: C.danger }]}>
      <View style={[S.row, { gap: 12 }]}>
        <View style={{
          width: 40, height: 40, borderRadius: 12,
          alignItems: 'center', justifyContent: 'center', backgroundColor: C.danger,
        }}>
          <IconLock size={20} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text style={[S.td, { fontWeight: '650', fontSize: 14 }]}>
            {bus ? bus.reg : lockout.busId} immobilised — breath test failed
          </Text>
          <Text style={[S.hint, { marginBottom: 0, marginTop: 3 }]}>
            {driver ? driver.name : lockout.driverId} · {lockout.attempts} attempts · highest{' '}
            {lockout.worstBac.toFixed(3)} %BAC{lockout.overLegal ? ' · above the statutory limit' : ''}
          </Text>
        </View>
        <Chip tone="danger" live>{lockout.code}</Chip>
        <Btn onPress={() => { setOpen(!open); setError(null); }}>{open ? 'Close' : 'Review & reset'}</Btn>
      </View>

      {open ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }}>
          <Text style={S.eyebrow}>Readings from the analyser</Text>
          {lockout.readings.map((r, i) => (
            <View key={i} style={S.statLine}>
              <Text style={S.statK}>Attempt {i + 1}</Text>
              <Text style={[S.statV, { color: C.danger }]}>
                {r.bac.toFixed(3)} %BAC · {r.overLegal ? 'OVER STATUTORY' : 'OVER POLICY'}
              </Text>
            </View>
          ))}

          <Text style={[S.eyebrow, { marginTop: 14 }]}>Notification</Text>
          <View style={{
            marginTop: 8, padding: 12, borderRadius: 12,
            backgroundColor: C.bg2, borderWidth: 1, borderColor: C.line,
          }}>
            <Text style={[S.td, { fontWeight: '600', fontSize: 12 }]}>{notice.subject}</Text>
            {notice.lines.map((line) => (
              <Text key={line} style={[S.hint, { marginBottom: 0, marginTop: 4 }]}>{line}</Text>
            ))}
            <View style={[S.row, { marginTop: 10, gap: 6 }]}>
              {lockout.notify.map((n) => (
                <Chip key={n.role} tone="warn">{n.role} · {n.state}</Chip>
              ))}
            </View>
            <Text style={[S.hint, { marginTop: 10, marginBottom: 0 }]}>
              Delivery is not implemented — see docs/NOTIFICATIONS.md. The event, its recipients
              and who may act on it are.
            </Text>
          </View>

          {error ? (
            <View style={[S.row, { gap: 8, marginTop: 12 }]}>
              <IconAlert size={15} color={C.danger} />
              <Text style={{ color: C.danger, fontSize: 12, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          <Text style={[S.label, { marginTop: 14 }]}>Reset note</Text>
          <TextInput
            style={S.input}
            value={note}
            placeholder="Driver stood down, relief called."
            placeholderTextColor={C.fg3}
            onChangeText={setNote}
          />

          <View style={[S.row, { marginTop: 14 }]}>
            <Text style={[S.hint, { flex: 1, marginBottom: 0 }]}>
              Clearing this releases the immobiliser. Only you and a platform administrator can.
            </Text>
            <Btn
              kind="danger"
              icon={IconCheck}
              onPress={() => {
                const r = onReset(note.trim() || null);
                if (!r.ok) { setError(r.message); return; }
                setError(null);
                setNote('');
                setOpen(false);
              }}
            >
              Reset lockout
            </Btn>
          </View>
        </View>
      ) : null}
    </View>
  );
}
