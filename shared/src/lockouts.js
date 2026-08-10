/* Vehicle lockouts — the event a failed breath test raises, and who may clear it.
 *
 * Three failed readings immobilise the bus. The driver cannot undo that; if
 * they could, the test would be advisory and the whole gate would be theatre.
 * So the lock leaves the cab and becomes an *event* addressed to two people who
 * are not in it: the vehicle's operator and a platform administrator. Either
 * can reset it, and the reset is itself part of the record.
 *
 * Delivery of that event — email, SMS, push — is deliberately not implemented
 * here; see docs/NOTIFICATIONS.md for the intended design. What matters now is
 * that the event exists, carries its evidence, names its recipients, and cannot
 * be cleared by the person it is about.
 */

/** Roles that may clear a lock. Notably absent: the driver it applies to. */
export const RESET_ROLES = ['operator', 'admin'];

export const LOCKOUT_STATUS = {
  open: { label: 'Locked', tone: 'danger' },
  reset: { label: 'Reset', tone: 'ok' },
  expired: { label: 'Expired', tone: 'neutral' },
};

/**
 * Raise a lockout from a finished breath session.
 *
 * `readings` is the analyser's own history, copied in full: the operator who
 * clears this is making a judgement, and they need the actual numbers rather
 * than a summary of them.
 */
export function createLockout({
  busId, operatorId, driverId, deviceSerial = null, readings = [], lockCode = null, at = Date.now(),
}) {
  const worst = readings.reduce((a, r) => Math.max(a, r && r.bac ? r.bac : 0), 0);
  return {
    id: `lk-${busId}-${Math.floor(at / 1000).toString(36)}`,
    busId,
    operatorId,
    driverId,
    deviceSerial,
    code: lockCode || defaultCode(busId, at),
    status: 'open',
    raisedAt: at,
    attempts: readings.filter((r) => r && r.valid).length,
    worstBac: Math.round(worst * 1000) / 1000,
    overLegal: readings.some((r) => r && r.overLegal),
    readings: readings.map((r) => ({ bac: r.bac, at: r.at, overLegal: !!r.overLegal })),
    /* Who this is addressed to. The transport is a future feature; the
     * addressing is not, because it decides who is allowed to act. */
    notify: [
      { role: 'operator', operatorId, channel: 'email', state: 'pending' },
      { role: 'admin', channel: 'email', state: 'pending' },
    ],
    resetBy: null,
    resetAt: null,
    resetNote: null,
  };
}

export function defaultCode(busId, at = Date.now()) {
  const d = new Date(at);
  const mmdd = String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return `LK-${String(busId).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${mmdd}`;
}

/**
 * Clear a lock.
 *
 * Returns a discriminated result rather than throwing — every caller is a
 * console button that has to render the refusal. The rules are the point:
 *
 *  - only an operator or an administrator may reset;
 *  - an operator may only reset a lock on their own fleet;
 *  - nobody may reset a lock raised against themselves.
 */
export function resetLockout(lockout, account, { note = null, at = Date.now() } = {}) {
  if (!lockout) return { ok: false, reason: 'not-found', message: 'That lockout no longer exists.' };
  if (lockout.status !== 'open') {
    return { ok: false, reason: 'not-open', message: 'This lockout has already been cleared.' };
  }
  if (!account || RESET_ROLES.indexOf(account.role) === -1) {
    return {
      ok: false,
      reason: 'forbidden',
      message: 'Only the vehicle operator or a platform administrator can clear a lockout.',
    };
  }
  if (account.role === 'operator' && account.operatorId !== lockout.operatorId) {
    return {
      ok: false,
      reason: 'wrong-tenant',
      message: 'That vehicle belongs to another operator.',
    };
  }
  if (account.driverId && account.driverId === lockout.driverId) {
    return {
      ok: false,
      reason: 'self-reset',
      message: 'A driver cannot clear a lockout raised against themselves.',
    };
  }

  return {
    ok: true,
    lockout: {
      ...lockout,
      status: 'reset',
      resetBy: { id: account.id, name: account.name, role: account.role },
      resetAt: at,
      resetNote: note,
      notify: lockout.notify.map((n) => ({ ...n, state: 'resolved' })),
    },
  };
}

export const openLockouts = (list) => list.filter((l) => l.status === 'open');

export const lockoutsForScope = (list, account) => {
  if (!account) return [];
  if (account.role === 'admin') return list.slice();
  if (account.role === 'operator') return list.filter((l) => l.operatorId === account.operatorId);
  if (account.role === 'driver') return list.filter((l) => l.driverId === account.driverId);
  return [];
};

/** The message body the notifier will send once it exists (docs/NOTIFICATIONS.md). */
export function lockoutNotice(lockout, { bus, driver, operator } = {}) {
  return {
    subject: `[DrivoSafe] Vehicle ${bus ? bus.reg : lockout.busId} immobilised — breath test failed`,
    lines: [
      `${driver ? driver.name : lockout.driverId} failed ${lockout.attempts} breath tests at the pre-drive check.`,
      `Highest reading ${lockout.worstBac.toFixed(3)} %BAC${lockout.overLegal ? ' — above the statutory limit.' : '.'}`,
      `Vehicle ${bus ? bus.reg : lockout.busId}${operator ? ` (${operator.name})` : ''} is immobilised.`,
      `Lock code ${lockout.code}. Clear it from the fleet console once you have spoken to the driver.`,
    ],
    to: lockout.notify.map((n) => n.role),
  };
}
