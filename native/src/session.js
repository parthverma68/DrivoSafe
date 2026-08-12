/* Session and install state — REACT NATIVE.
 *
 * The sibling of `app/src/session.js`, minus the DOM. The storage adapter is
 * hydrated once at boot (App.jsx), so these reads are synchronous exactly as
 * they are on the web and the two files stay line-for-line comparable.
 *
 * The install record is the important one here: on a real tablet it is written
 * at fitment and then survives every sign-out, reboot and app update for the
 * life of the vehicle.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ROLE_BY_ID, publicAccount, ACCOUNTS, deviceBySerial, byId, BUSES,
  seedAttendance, closeAttendance, resetLockout,
} from '@drivosafe/shared';
import { storage } from './platform/index.js';

const K_SESSION = 'session';
const K_INSTALL = 'install';
const K_ATTENDANCE = 'attendance';
const K_LOCKOUTS = 'lockouts';

/* ---------------------------------------------------------- fleet log ----
 * Attendance rows and vehicle lockouts — the Fleet Service's write side,
 * standing in for a server. The sibling of the web build's `useFleetLog`, and
 * deliberately shared across roles on the device: a driver locked out on this
 * tablet raises an event the operator can see and clear from the same build.
 */
export function useFleetLog() {
  const [attendance, setAttendance] = useState(() => {
    const saved = storage.get(K_ATTENDANCE, null);
    if (saved && saved.length) return saved;
    const seeded = seedAttendance();
    storage.set(K_ATTENDANCE, seeded);
    return seeded;
  });
  const [lockouts, setLockouts] = useState(() => storage.get(K_LOCKOUTS, []));

  const openShift = useCallback((record) => {
    setAttendance((prev) => {
      const rows = [record].concat(prev);
      storage.set(K_ATTENDANCE, rows);
      return rows;
    });
    return record;
  }, []);

  const closeShift = useCallback((id, at = Date.now()) => {
    setAttendance((prev) => {
      const rows = prev.map((r) => (r.id === id ? closeAttendance(r, at) : r));
      storage.set(K_ATTENDANCE, rows);
      return rows;
    });
  }, []);

  const raiseLockout = useCallback((lockout, row) => {
    setLockouts((prev) => {
      const rows = [lockout].concat(prev);
      storage.set(K_LOCKOUTS, rows);
      return rows;
    });
    if (row) openShift(row);
    return lockout;
  }, [openShift]);

  /* The permission check is the domain's, not a button's — the same call the
   * API will make. */
  const clearLockout = useCallback((id, account, note) => {
    const target = lockouts.find((l) => l.id === id);
    const result = resetLockout(target, account, { note });
    if (!result.ok) return result;
    const rows = lockouts.map((l) => (l.id === id ? result.lockout : l));
    setLockouts(rows);
    storage.set(K_LOCKOUTS, rows);
    return result;
  }, [lockouts]);

  return useMemo(
    () => ({ attendance, lockouts, openShift, closeShift, raiseLockout, clearLockout }),
    [attendance, lockouts, openShift, closeShift, raiseLockout, clearLockout]
  );
}

export function useSession() {
  const [account, setAccountState] = useState(() => {
    const saved = storage.get(K_SESSION, null);
    if (!saved) return null;
    const live = ACCOUNTS.find((a) => a.id === saved.id);
    return live ? publicAccount(live) : null;
  });

  const [install, setInstallState] = useState(() => storage.get(K_INSTALL, null));
  const [pendingRole, setPendingRole] = useState(null);

  const signIn = useCallback((acc) => {
    setAccountState(acc);
    storage.set(K_SESSION, acc);
    setPendingRole(null);
  }, []);

  const signOut = useCallback(() => {
    setAccountState(null);
    storage.remove(K_SESSION);
    setPendingRole(null);
  }, []);

  const bindInstall = useCallback((serial) => {
    const device = deviceBySerial(serial);
    if (!device) return { ok: false, message: 'No vehicle is registered to that unit serial.' };
    const record = { serial: device.serial, busId: device.busId, boundAt: Date.now() };
    setInstallState(record);
    storage.set(K_INSTALL, record);
    return { ok: true, device, record };
  }, []);

  const clearInstall = useCallback(() => {
    setInstallState(null);
    storage.remove(K_INSTALL);
  }, []);

  const role = account ? ROLE_BY_ID[account.role] : pendingRole ? ROLE_BY_ID[pendingRole] : null;
  const bus = install ? byId(BUSES, install.busId) : null;

  return useMemo(
    () => ({
      account, role, pendingRole, setPendingRole,
      install, bus,
      signIn, signOut, bindInstall, clearInstall,
      signedIn: !!account,
    }),
    [account, role, pendingRole, install, bus, signIn, signOut, bindInstall, clearInstall]
  );
}
