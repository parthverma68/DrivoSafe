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
import { ROLE_BY_ID, publicAccount, ACCOUNTS, deviceBySerial, byId, BUSES } from '@drivosafe/shared';
import { storage } from './platform/index.js';

const K_SESSION = 'session';
const K_INSTALL = 'install';

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
