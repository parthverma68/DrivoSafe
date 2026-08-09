/* Identity, roles and device binding — the frontend stand-in for the Identity
 * Service (SYSTEM_DESIGN §12.1, §16.2).
 *
 * There is no backend yet, so this file *is* the contract: the same JSON shapes
 * — ROLES, ACCOUNTS, DEVICES, ENROLMENTS — are what the server will serve from
 * `/v1/auth/*` and `/v1/devices/*` when it exists. Nothing else in the app
 * invents an account shape; every surface reads its scope from here.
 *
 * Secrets are plain here on purpose. On the server the `secret` column is an
 * Argon2id hash and never leaves it; the device holds a refresh token, not a
 * PIN. Swapping `authenticate()` for a fetch is the whole migration.
 */

/* ---------------------------------------------------------------- roles ---
 * A role is a scope, not a job title: it decides which surfaces exist at all.
 * `surfaces` is the allow-list the shell renders from — a role cannot reach a
 * surface by typing a URL, because the shell never mounts one outside this set.
 */
export const ROLES = [
  {
    id: 'driver',
    label: 'Driver',
    tagline: 'In-cab tablet',
    blurb: 'One-time install per vehicle. Sign in once, then it is the vehicle that identifies you every shift.',
    home: 'drive',
    surfaces: ['drive'],
    accent: 'mint',
    icon: 'wheel',
    gate: 'checkin',           // must clear the pre-drive gate before `home`
  },
  {
    id: 'operator',
    label: 'Fleet Owner',
    tagline: 'Operator console',
    blurb: 'Your buses only. Live position, the driver at the wheel right now, cabin video on request, cargo and condition.',
    home: 'fleet',
    surfaces: ['fleet'],
    accent: 'sky',
    icon: 'bus',
    gate: null,
  },
  {
    id: 'admin',
    label: 'Administrator',
    tagline: 'Everything',
    blurb: 'Every operator, every vehicle. Open any bus and watch the exact drive screen its driver is looking at.',
    home: 'fleet',
    surfaces: ['fleet', 'admin', 'editor', 'gov', 'drive'],
    accent: 'violet',
    icon: 'shield',
    gate: null,
  },
  {
    id: 'gov',
    label: 'Government Official',
    tagline: 'Road authority',
    blurb: 'Surface condition and maintenance priority for your jurisdiction. No operator, driver or vehicle identity is exposed.',
    home: 'gov',
    surfaces: ['gov'],
    accent: 'amber',
    icon: 'gov',
    gate: null,
  },
];

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

/* Surface catalogue — label and where it belongs in the shell's nav. */
export const SURFACES = [
  { id: 'fleet', label: 'Fleet', sub: 'live operations' },
  { id: 'admin', label: 'Admin', sub: 'onboarding & drivers' },
  { id: 'editor', label: 'Corridors', sub: 'scan & publish' },
  { id: 'gov', label: 'Road Authority', sub: 'surface & maintenance' },
  { id: 'drive', label: 'Drive', sub: 'in-cab tablet' },
];

/* ------------------------------------------------------------- accounts ---
 * `operatorId` is the tenancy boundary. A fleet-owner account can only ever
 * see rows carrying its own operatorId; admin carries null and sees all.
 */
export const ACCOUNTS = [
  {
    id: 'acc-drv-1', role: 'driver', username: 'ramesh', secret: '1234',
    name: 'Ramesh Yadav', driverId: 'drv-1', operatorId: 'op-1',
    phone: '+91 94250 11882', title: 'Driver · Sarthi Travels', avatarHue: 152,
  },
  {
    id: 'acc-drv-2', role: 'driver', username: 'imran', secret: '1234',
    name: 'Imran Sheikh', driverId: 'drv-2', operatorId: 'op-1',
    phone: '+91 94250 33107', title: 'Driver · Sarthi Travels', avatarHue: 28,
  },
  {
    id: 'acc-drv-3', role: 'driver', username: 'sunil', secret: '1234',
    name: 'Sunil Patil', driverId: 'drv-3', operatorId: 'op-2',
    phone: '+91 94240 55219', title: 'Driver · Malwa Roadways', avatarHue: 4,
  },
  {
    id: 'acc-op-1', role: 'operator', username: 'sarthi', secret: 'fleet',
    name: 'Anita Rao', operatorId: 'op-1',
    phone: '+91 731 4001 220', title: 'Owner · Sarthi Travels', avatarHue: 205,
  },
  {
    id: 'acc-op-2', role: 'operator', username: 'malwa', secret: 'fleet',
    name: 'Devendra Malwa', operatorId: 'op-2',
    phone: '+91 731 4002 118', title: 'Owner · Malwa Roadways', avatarHue: 262,
  },
  {
    id: 'acc-adm-1', role: 'admin', username: 'admin', secret: 'admin',
    name: 'Parth Verma', operatorId: null,
    phone: '+91 731 4000 100', title: 'Platform Administrator', avatarHue: 268,
  },
  {
    id: 'acc-gov-1', role: 'gov', username: 'rto', secret: 'gov',
    name: 'S. Iyer', operatorId: null, jurisdiction: 'Indore Circle',
    department: 'MP Road Development Corporation', title: 'Executive Engineer · MPRDC',
    phone: '+91 731 2530 400', avatarHue: 42,
  },
];

/* --------------------------------------------------------------- devices ---
 * The one-time install. A tablet is bolted into one bus and enrolled once; the
 * serial on the case is what binds the JS install to a vehicle. Every shift
 * after that, the *vehicle* is known before anyone signs in — the driver only
 * has to prove they are the driver.
 */
export const DEVICES = [
  { serial: 'DS-TAB-8841', busId: 'bus-1', firmware: '2.4.1', installedAt: '2026-03-02', mount: 'A-pillar', simIccid: '8991 0001 2233' },
  { serial: 'DS-TAB-8842', busId: 'bus-2', firmware: '2.4.1', installedAt: '2026-03-02', mount: 'A-pillar', simIccid: '8991 0001 2234' },
  { serial: 'DS-TAB-9017', busId: 'bus-3', firmware: '2.4.0', installedAt: '2026-04-19', mount: 'Dash centre', simIccid: '8991 0001 2911' },
  { serial: 'DS-TAB-6620', busId: 'bus-4', firmware: '2.3.8', installedAt: '2025-11-27', mount: 'Dash centre', simIccid: '8991 0000 8814' },
  { serial: 'DS-TAB-7104', busId: 'bus-5', firmware: '2.4.1', installedAt: '2026-05-11', mount: 'A-pillar', simIccid: '8991 0001 0455' },
  { serial: 'DS-TAB-7105', busId: 'bus-6', firmware: '2.4.1', installedAt: '2026-05-11', mount: 'A-pillar', simIccid: '8991 0001 0456' },
  { serial: 'DS-TAB-7106', busId: 'bus-7', firmware: '2.4.1', installedAt: '2026-06-02', mount: 'Dash centre', simIccid: '8991 0001 0457' },
  { serial: 'DS-TAB-7107', busId: 'bus-8', firmware: '2.4.1', installedAt: '2026-06-02', mount: 'A-pillar', simIccid: '8991 0001 0458' },
];

/* Face templates enrolled against a driver. §16.4: what is stored is a 128-float
 * embedding and nothing else — no frames, ever. `template` here stands in for
 * that embedding; `quality` is the enrolment score the matcher calibrates on.
 */
export const ENROLMENTS = [
  { driverId: 'drv-1', template: 'fp:9c41a2', quality: 0.94, enrolledAt: '2026-01-08', frames: 12 },
  { driverId: 'drv-2', template: 'fp:2b7de0', quality: 0.91, enrolledAt: '2026-01-08', frames: 12 },
  { driverId: 'drv-3', template: 'fp:55ff3c', quality: 0.86, enrolledAt: '2025-12-02', frames: 9 },
  { driverId: 'drv-4', template: 'fp:71a0cd', quality: 0.95, enrolledAt: '2026-02-14', frames: 14 },
  { driverId: 'drv-5', template: 'fp:0ea884', quality: 0.83, enrolledAt: '2025-10-30', frames: 8 },
];

/* ----------------------------------------------------------------- api ---- */

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

/** Serials are read off a sticker by a fitter with cold hands — be forgiving. */
export const normaliseSerial = (s) =>
  String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function accountByUsername(username) {
  const u = norm(username);
  return ACCOUNTS.find((a) => norm(a.username) === u) || null;
}

export function accountsForRole(roleId) {
  return ACCOUNTS.filter((a) => a.role === roleId);
}

/**
 * The whole auth surface, and the only place a credential is compared.
 * Returns a discriminated result rather than throwing: every caller is a
 * screen that has to render the failure, not a service that can crash.
 */
export function authenticate({ username, secret, role } = {}) {
  const account = accountByUsername(username);
  if (!account) return { ok: false, reason: 'unknown-user', message: 'No account with that username.' };
  if (role && account.role !== role) {
    return {
      ok: false,
      reason: 'wrong-role',
      message: `That account signs in as ${ROLE_BY_ID[account.role].label}.`,
      actualRole: account.role,
    };
  }
  if (String(secret) !== String(account.secret)) {
    return { ok: false, reason: 'bad-secret', message: 'Incorrect passcode.' };
  }
  return { ok: true, account: publicAccount(account) };
}

/** What a session may hold. The secret is stripped here and never re-attached. */
export function publicAccount(account) {
  if (!account) return null;
  const { secret, ...rest } = account;
  return rest;
}

export function deviceBySerial(serial) {
  const s = normaliseSerial(serial);
  return DEVICES.find((d) => normaliseSerial(d.serial) === s) || null;
}

export function deviceForBus(busId) {
  return DEVICES.find((d) => d.busId === busId) || null;
}

export function enrolmentFor(driverId) {
  return ENROLMENTS.find((e) => e.driverId === driverId) || null;
}

/** Surfaces this role may mount, resolved to their catalogue entries. */
export function surfacesFor(roleId) {
  const role = ROLE_BY_ID[roleId];
  if (!role) return [];
  return role.surfaces.map((id) => SURFACES.find((s) => s.id === id)).filter(Boolean);
}

export function canAccess(roleId, surfaceId) {
  const role = ROLE_BY_ID[roleId];
  return !!role && role.surfaces.includes(surfaceId);
}

/** The tenancy filter. Admin (operatorId null) sees everything; nobody else does. */
export function scopeOf(account) {
  if (!account) return { operatorId: null, all: false };
  if (account.role === 'admin' || account.role === 'gov') return { operatorId: null, all: true };
  return { operatorId: account.operatorId || null, all: false };
}
