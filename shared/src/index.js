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
  PROFILES, COMPACT_LAYOUT, COMPACT_PORTRAIT_LAYOUT, profileFor, layoutForProfile, isCompact,
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
  createBreathTest, createSimulatedAnalyser, createCheckinGate, verifyFace, makeCapture,
} from './checkin.js';

export {
  ATTENDANCE_STATUS, LATE_GRACE_MIN,
  openAttendance, closeAttendance, lockedOutAttendance, attendanceSummary,
  attendanceForDriver, attendanceForOperator, attendanceOn, byNewest, seedAttendance,
} from './attendance.js';

export {
  RESET_ROLES, LOCKOUT_STATUS,
  createLockout, resetLockout, openLockouts, lockoutsForScope, lockoutNotice, defaultCode,
} from './lockouts.js';

export {
  CAMERAS, ANALYSIS_STATE, createClipRecorder, createShiftRecorders,
} from './recording.js';

export {
  busTelemetry, fleetSnapshot, fleetSummary, pointAlong,
  requestCabinClip, clipState, STATUS_META,
} from './liveFleet.js';

export { makeSampleScan } from './sampleScan.js';

export { useDriveLoop } from './useDriveLoop.js';
