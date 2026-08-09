/* @drivosafe/shared — the platform-independent half of DrivoSafe.
 *
 * SYSTEM_DESIGN §3.1: everything in here is pure JS with no DOM and no React
 * Native. It is consumed byte-identically by `app` (React web) and `native`
 * (React Native), which supply the platform adapters. The only React dependency
 * is `useDriveLoop`, which uses hooks but never touches a host component.
 */

export {
  createDrowsinessMonitor, createDriverSimulator, circadianFactor,
  LEVELS, LEVEL_META, DEFAULT_WEIGHTS,
} from './drowsiness.js';

export { createAlertArbiter, modalityFor, P } from './alerts.js';

export {
  GRID, ANCHOR, TILE_TYPES, DEFAULT_LAYOUT,
  freeSlots, trayTypes, swapTiles, moveTile, addTile, removeTile, validate, reflow,
} from './layout.js';

export {
  gearAdvice, createVehicleSimulator, simulateDetections,
} from './telemetry.js';

export { CORRIDOR_DEFS, getRoute, registerCorridor } from './corridors.js';

export {
  OPERATORS, BUSES, DRIVERS, PARTNERS, ASSIGNMENTS, ACTIVE_SHIFT,
  badgeFor, byId, forOperator, assignmentFor, busBySerial, makeShift,
} from './fleet.js';

export {
  ROLES, ROLE_BY_ID, SURFACES, ACCOUNTS, DEVICES, ENROLMENTS,
  authenticate, publicAccount, accountByUsername, accountsForRole,
  deviceBySerial, deviceForBus, enrolmentFor, normaliseSerial,
  surfacesFor, canAccess, scopeOf,
} from './accounts.js';

export {
  ALCOHOL_POLICY, FACE_POLICY, CHECKIN_STEPS,
  createBreathTest, createCheckinGate, verifyFace, makeCapture, failingCell,
} from './checkin.js';

export {
  busTelemetry, fleetSnapshot, fleetSummary, pointAlong,
  requestCabinClip, clipState, STATUS_META,
} from './liveFleet.js';

export { makeSampleScan } from './sampleScan.js';

export { useDriveLoop } from './useDriveLoop.js';
