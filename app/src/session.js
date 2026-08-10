/* Session and install state for the web build.
 *
 * Two things are persisted, and they have very different lifetimes:
 *
 *   install  — written once, when a tablet is first bound to a vehicle. It
 *              survives sign-out, because the tablet does not stop being
 *              bolted into that bus when a shift ends.
 *   session  — who is signed in. For a driver this also survives a reload:
 *              they log in on install and never again, exactly as asked. What
 *              does *not* survive is the pre-drive gate — every shift blows
 *              into the breathalyser again.
 *
 * `useSession` is deliberately a plain hook over the storage adapter rather
 * than a context: there is one shell, it holds the state, and every screen
 * receives what it needs as props. Nothing reads identity out of a global.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ROLE_BY_ID, publicAccount, ACCOUNTS, deviceBySerial, byId, BUSES,
  profileFor, isCompact, seedAttendance, closeAttendance, resetLockout,
} from '@drivosafe/shared';
import { storage } from './platform/index.js';

const K_SESSION = 'session';
const K_INSTALL = 'install';
const K_THEME = 'theme';
const K_ATTENDANCE = 'attendance';
const K_LOCKOUTS = 'lockouts';

/* ------------------------------------------------------------- theme ----- */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = storage.get(K_THEME, null);
    if (saved === 'day' || saved === 'night') return saved;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
    }
    return 'night';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'day' ? '#eef1f5' : '#07090c');
    storage.set(K_THEME, theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'day' ? 'night' : 'day')), []);
  return { theme, setTheme, toggle, isDay: theme === 'day' };
}

/* ------------------------------------------------------------ viewport --- */
/**
 * Live viewport size and the layout profile it implies.
 *
 * `visualViewport` is preferred where it exists: on a phone the browser chrome
 * and the on-screen keyboard change the usable height without firing a resize
 * that `innerHeight` reflects usefully, and the drive screen has to know its
 * real height to decide between the tablet grid and the phone grid.
 */
export function useViewport() {
  const read = () => {
    if (typeof window === 'undefined') return { width: 1280, height: 800 };
    const vv = window.visualViewport;
    return {
      width: Math.round(vv ? vv.width : window.innerWidth),
      height: Math.round(vv ? vv.height : window.innerHeight),
    };
  };

  const [size, setSize] = useState(read);

  useEffect(() => {
    const onChange = () => setSize(read());
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', onChange);
    };
  }, []);

  const profile = profileFor(size.width, size.height);
  return {
    ...size,
    profile,
    compact: isCompact(profile),
    portrait: size.height > size.width,
    phone: size.width < 700,
  };
}

/* ---------------------------------------------------------- fleet log ---- */
/**
 * Attendance rows and vehicle lockouts, persisted locally.
 *
 * This is the Fleet Service's write side, standing in for a server. It matters
 * that it is *shared* rather than per-role: a driver who fails three breath
 * tests in this browser raises a lockout that the operator, signing in
 * afterwards in the same browser, can actually see and clear. Splitting the
 * store per role would make the demo lie about the one flow that has two ends.
 *
 * Seeded with a fortnight of history on first run so the consoles are not empty
 * before anyone has driven anything.
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

  const write = useCallback((rows) => {
    setAttendance(rows);
    storage.set(K_ATTENDANCE, rows);
  }, []);

  const writeLocks = useCallback((rows) => {
    setLockouts(rows);
    storage.set(K_LOCKOUTS, rows);
  }, []);

  /** Open a shift. Returns the record so the caller can close it later by id. */
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

  const raiseLockout = useCallback((lockout, attendanceRow) => {
    setLockouts((prev) => {
      const rows = [lockout].concat(prev);
      storage.set(K_LOCKOUTS, rows);
      return rows;
    });
    if (attendanceRow) openShift(attendanceRow);
    return lockout;
  }, [openShift]);

  /**
   * Clear a lock. The permission check is `resetLockout()` in the domain, not
   * an `if` in a button handler — the same call the API will make.
   */
  const clearLockout = useCallback((id, account, note) => {
    const target = lockouts.find((l) => l.id === id);
    const result = resetLockout(target, account, { note });
    if (!result.ok) return result;
    writeLocks(lockouts.map((l) => (l.id === id ? result.lockout : l)));
    return result;
  }, [lockouts, writeLocks]);

  return useMemo(
    () => ({ attendance, lockouts, openShift, closeShift, raiseLockout, clearLockout, write }),
    [attendance, lockouts, openShift, closeShift, raiseLockout, clearLockout, write]
  );
}

/* ----------------------------------------------------------- session ----- */
export function useSession() {
  const [account, setAccountState] = useState(() => {
    const saved = storage.get(K_SESSION, null);
    if (!saved) return null;
    /* Re-resolve against the account list rather than trusting the stored copy:
     * a stale snapshot must never be what a role check reads. */
    const live = ACCOUNTS.find((a) => a.id === saved.id);
    return live ? publicAccount(live) : null;
  });

  const [install, setInstallState] = useState(() => storage.get(K_INSTALL, null));

  /* The role the welcome screen picked, before anyone has signed in. */
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

  /** Bind this browser/tablet to a vehicle. One-time, by design. */
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
