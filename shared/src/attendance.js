/* Driver attendance — the record the pre-drive gate produces.
 *
 * A depot's attendance sheet is normally a register at the gate, signed by
 * whoever is holding the pen. Here it is a by-product of a process that already
 * has to happen: the gate already knows who the driver is (face match), that
 * they were fit to drive (breath reading), which vehicle they took and when.
 * Writing that down is free, and it is far harder to fake than a signature.
 *
 * A record is opened when a shift starts and closed when it ends. A driver who
 * was turned away still gets a record — `locked-out` is attendance data too,
 * and losing it would be the single most useful thing to lose.
 *
 * Pure data + pure functions. The host owns persistence; nothing here reaches
 * for storage, which is why the same module serves the tablet, both consoles
 * and (later) the server.
 */

export const ATTENDANCE_STATUS = {
  'on-duty': { label: 'On duty', tone: 'ok' },
  completed: { label: 'Completed', tone: 'neutral' },
  'locked-out': { label: 'Locked out', tone: 'danger' },
  absent: { label: 'Absent', tone: 'warn' },
};

/** Shift start counts as late past this many minutes after the rostered time. */
export const LATE_GRACE_MIN = 10;

const iso = (t) => new Date(t).toISOString();
const dayOf = (t) => iso(t).slice(0, 10);

/**
 * Open a record. `checkin` is the gate's own evidence, kept verbatim: what the
 * face matcher decided and what the analyser read. A record without its
 * evidence is just a claim.
 */
export function openAttendance({
  driverId, busId, operatorId, routeId, at = Date.now(),
  identity = null, breath = null, rosteredStart = null, deviceSerial = null,
}) {
  const lateBy = rosteredStart ? Math.round((at - rosteredStart) / 60000) : null;
  return {
    id: `att-${driverId}-${dayOf(at)}-${Math.floor(at / 1000).toString(36)}`,
    date: dayOf(at),
    driverId,
    busId,
    operatorId,
    routeId,
    deviceSerial,
    status: 'on-duty',
    checkinAt: iso(at),
    shiftStart: iso(at),
    shiftEnd: null,
    durationMin: null,
    late: lateBy != null && lateBy > LATE_GRACE_MIN,
    lateByMin: lateBy != null && lateBy > 0 ? lateBy : 0,
    identity: identity && {
      status: identity.status,
      confidence: identity.confidence,
      driverId: identity.driverId || driverId,
    },
    breath: breath && {
      bac: breath.bac,
      attempts: breath.attempts,
      passed: breath.passed !== false,
      deviceId: breath.deviceId || null,
    },
  };
}

/** Close a record when the driver ends the shift. */
export function closeAttendance(record, at = Date.now()) {
  if (!record || record.shiftEnd) return record;
  const start = new Date(record.shiftStart).getTime();
  return {
    ...record,
    status: 'completed',
    shiftEnd: iso(at),
    durationMin: Math.max(0, Math.round((at - start) / 60000)),
  };
}

/**
 * A driver who reached the breath test and failed it three times. This is not
 * a shift — no vehicle moved — but it is the most important row on the sheet,
 * so it is recorded with the same shape and a status of its own.
 */
export function lockedOutAttendance({
  driverId, busId, operatorId, at = Date.now(), breath = null, lockCode = null, deviceSerial = null,
}) {
  return {
    ...openAttendance({ driverId, busId, operatorId, routeId: null, at, breath, deviceSerial }),
    status: 'locked-out',
    shiftStart: null,
    lockCode,
  };
}

/* ------------------------------------------------------------- queries --- */

export const attendanceForDriver = (records, driverId) =>
  records.filter((r) => r.driverId === driverId);

export const attendanceForOperator = (records, operatorId) =>
  operatorId ? records.filter((r) => r.operatorId === operatorId) : records.slice();

export const attendanceOn = (records, date) => records.filter((r) => r.date === date);

/** Newest first — every console lists it this way. */
export const byNewest = (records) =>
  records.slice().sort((a, b) => (a.checkinAt < b.checkinAt ? 1 : -1));

/** Roll-up for a KPI strip. `days` bounds the window; 0 means everything. */
export function attendanceSummary(records, { days = 0, now = Date.now() } = {}) {
  const cutoff = days ? now - days * 86400000 : 0;
  const rows = records.filter((r) => !cutoff || new Date(r.checkinAt).getTime() >= cutoff);
  const shifts = rows.filter((r) => r.status !== 'locked-out');
  const worked = rows.filter((r) => r.durationMin != null);

  return {
    total: rows.length,
    onDuty: rows.filter((r) => r.status === 'on-duty').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    lockedOut: rows.filter((r) => r.status === 'locked-out').length,
    late: rows.filter((r) => r.late).length,
    punctuality: shifts.length
      ? Math.round(((shifts.length - shifts.filter((r) => r.late).length) / shifts.length) * 100)
      : 100,
    hours: Math.round((worked.reduce((a, r) => a + r.durationMin, 0) / 60) * 10) / 10,
    drivers: new Set(rows.map((r) => r.driverId)).size,
  };
}

/* --------------------------------------------------------------- seed ----
 * A fortnight of history so the consoles have something to show on first run.
 * Deterministic: the same dates and the same two incidents every time.
 */
export function seedAttendance(now = Date.now()) {
  const roster = [
    { driverId: 'drv-1', busId: 'bus-2', operatorId: 'op-1', routeId: 'nh52-indore-dewas', start: 5, hours: 8 },
    { driverId: 'drv-2', busId: 'bus-1', operatorId: 'op-1', routeId: 'nh52-indore-dewas', start: 4.5, hours: 8.5 },
    { driverId: 'drv-6', busId: 'bus-3', operatorId: 'op-1', routeId: 'nh52-indore-dewas', start: 6, hours: 7 },
    { driverId: 'drv-3', busId: 'bus-4', operatorId: 'op-2', routeId: 'nh52-indore-dewas', start: 3.8, hours: 9 },
    { driverId: 'drv-5', busId: 'bus-7', operatorId: 'op-2', routeId: 'nh52-indore-dewas', start: 2.25, hours: 9.5 },
    { driverId: 'drv-4', busId: 'bus-5', operatorId: 'op-3', routeId: 'sh27-bhopal-sehore', start: 5.75, hours: 8 },
    { driverId: 'drv-7', busId: 'bus-8', operatorId: 'op-3', routeId: 'sh27-bhopal-sehore', start: 6.5, hours: 7.5 },
  ];

  const out = [];
  for (let d = 13; d >= 1; d--) {
    const day = new Date(now - d * 86400000);
    day.setHours(0, 0, 0, 0);
    roster.forEach((r, i) => {
      /* One driver misses one day a fortnight, and one fails a breath test —
       * a sheet with nothing but green rows teaches a reviewer nothing. */
      if (d === 9 && r.driverId === 'drv-3') return;                       // absent

      const at = day.getTime() + r.start * 3600000 + ((d * 7 + i * 11) % 17) * 60000;
      const rostered = day.getTime() + r.start * 3600000;

      if (d === 6 && r.driverId === 'drv-5') {
        out.push(lockedOutAttendance({
          driverId: r.driverId, busId: r.busId, operatorId: r.operatorId, at,
          breath: { bac: 0.058, attempts: 3, passed: false, deviceId: 'ble-analyser' },
          lockCode: 'LK-BUS7-0612',
        }));
        return;
      }

      const rec = openAttendance({
        driverId: r.driverId, busId: r.busId, operatorId: r.operatorId, routeId: r.routeId,
        at, rosteredStart: rostered,
        identity: { status: 'matched', confidence: 0.9 + ((i * 13) % 8) / 100, driverId: r.driverId },
        breath: { bac: 0, attempts: 1, passed: true, deviceId: 'ble-analyser' },
      });
      out.push(closeAttendance(rec, at + r.hours * 3600000));
    });
  }
  return byNewest(out);
}
