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
import { ROLE_BY_ID, publicAccount, ACCOUNTS, deviceBySerial, byId, BUSES } from '@drivosafe/shared';
import { storage } from './platform/index.js';

const K_SESSION = 'session';
const K_INSTALL = 'install';
const K_THEME = 'theme';

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
