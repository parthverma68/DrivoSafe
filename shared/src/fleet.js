/* Fleet domain seed data (SYSTEM_DESIGN §12.2).
 *
 * Stands in for the Fleet Service. The shapes are the contract; the values are
 * demo data. Everything is tenant-scoped by operatorId in the real system —
 * see `scopeOf()` in accounts.js for the filter every console applies.
 */

export const OPERATORS = [
  { id: 'op-1', name: 'Sarthi Travels', type: 'Passenger', corridor: 'NH-52', buses: 42, rqi: 84, compliance: 91, contact: 'ops@sarthi.example', depot: 'Indore — Rau depot', since: 2019 },
  { id: 'op-2', name: 'Malwa Roadways', type: 'Mixed', corridor: 'NH-52', buses: 28, rqi: 76, compliance: 68, contact: 'control@malwa.example', depot: 'Dewas — Ring Road yard', since: 2016 },
  { id: 'op-3', name: 'Narmada Transit', type: 'Passenger', corridor: 'SH-27', buses: 17, rqi: 88, compliance: 94, contact: 'depot@narmada.example', depot: 'Bhopal — Habibganj', since: 2021 },
];

/* `serial` mirrors the tablet bolted into the cab (accounts.js DEVICES). It is
 * duplicated here deliberately: the fleet console resolves a bus to its unit
 * without loading the device registry, exactly as the API will return it. */
export const BUSES = [
  { id: 'bus-1', reg: 'MP09 FA 4412', serial: 'DS-TAB-8841', operatorId: 'op-1', model: 'Ashok Leyland 12M', kit: 'Assistant+OBD', transmission: 'manual', efficiencyBand: { rpmLow: 1200, rpmHigh: 1750 }, dmsCamera: true, cabinCamera: true, seats: 49, service: 'Indore → Dewas express', cargo: 'Passenger · 41 seated', routeId: 'nh52-indore-dewas' },
  { id: 'bus-2', reg: 'MP09 FA 5518', serial: 'DS-TAB-8842', operatorId: 'op-1', model: 'Tata Starbus', kit: 'Assistant+OBD', transmission: 'manual', efficiencyBand: { rpmLow: 1250, rpmHigh: 1800 }, dmsCamera: true, cabinCamera: true, seats: 45, service: 'Indore city ring', cargo: 'Passenger · 38 seated', routeId: 'nh52-indore-dewas' },
  { id: 'bus-3', reg: 'MP09 GB 1207', serial: 'DS-TAB-9017', operatorId: 'op-1', model: 'Volvo 9600', kit: 'Mapper (LiDAR)', transmission: 'automatic', efficiencyBand: { rpmLow: 1100, rpmHigh: 1600 }, dmsCamera: true, cabinCamera: true, seats: 41, service: 'Corridor scan run', cargo: 'Survey · mapper rig', routeId: 'nh52-indore-dewas' },
  { id: 'bus-4', reg: 'MP04 HH 8890', serial: 'DS-TAB-6620', operatorId: 'op-2', model: 'Eicher Skyline', kit: 'Assistant app-only', transmission: 'manual', efficiencyBand: { rpmLow: 1300, rpmHigh: 1900 }, dmsCamera: false, cabinCamera: false, seats: 40, service: 'Dewas → Ujjain', cargo: 'Passenger · 33 seated', routeId: 'nh52-indore-dewas' },
  { id: 'bus-5', reg: 'MP04 JC 3341', serial: 'DS-TAB-7104', operatorId: 'op-3', model: 'Scania Metrolink', kit: 'Assistant+OBD', transmission: 'automatic', efficiencyBand: { rpmLow: 1050, rpmHigh: 1550 }, dmsCamera: true, cabinCamera: true, seats: 47, service: 'Bhopal → Sehore', cargo: 'Passenger · 44 seated', routeId: 'sh27-bhopal-sehore' },
  { id: 'bus-6', reg: 'MP09 FB 2260', serial: 'DS-TAB-7105', operatorId: 'op-1', model: 'Ashok Leyland 12M', kit: 'Assistant+OBD', transmission: 'manual', efficiencyBand: { rpmLow: 1200, rpmHigh: 1750 }, dmsCamera: true, cabinCamera: true, seats: 49, service: 'Indore → Dewas local', cargo: 'Passenger · 27 seated', routeId: 'nh52-indore-dewas' },
  { id: 'bus-7', reg: 'MP04 KD 7719', serial: 'DS-TAB-7106', operatorId: 'op-2', model: 'Tata Ultra Cargo', kit: 'Assistant+OBD', transmission: 'manual', efficiencyBand: { rpmLow: 1300, rpmHigh: 1850 }, dmsCamera: true, cabinCamera: true, seats: 3, service: 'Dewas line-haul', cargo: 'Freight · 4 200 kg electronics', routeId: 'nh52-indore-dewas' },
  { id: 'bus-8', reg: 'MP04 KD 9903', serial: 'DS-TAB-7107', operatorId: 'op-3', model: 'Scania Metrolink', kit: 'Assistant+OBD', transmission: 'automatic', efficiencyBand: { rpmLow: 1050, rpmHigh: 1550 }, dmsCamera: true, cabinCamera: true, seats: 47, service: 'Sehore → Bhopal', cargo: 'Passenger · 19 seated', routeId: 'sh27-bhopal-sehore' },
];

export const DRIVERS = [
  { id: 'drv-1', name: 'Ramesh Yadav', operatorId: 'op-1', licenceNo: 'MP09-2019-0044', licenceExpiry: '2029-04-11', captainScore: 92, badge: 'Gold', trips: 318, harshEvents: 4, comfort: 94, adherence: 96, earBaseline: 0.31, avatarHue: 152, phone: '+91 94250 11882' },
  { id: 'drv-2', name: 'Imran Sheikh', operatorId: 'op-1', licenceNo: 'MP09-2020-1187', licenceExpiry: '2028-09-30', captainScore: 81, badge: 'Silver', trips: 204, harshEvents: 11, comfort: 86, adherence: 88, earBaseline: 0.28, avatarHue: 28, phone: '+91 94250 33107' },
  { id: 'drv-3', name: 'Sunil Patil', operatorId: 'op-2', licenceNo: 'MP04-2018-3320', licenceExpiry: '2027-01-22', captainScore: 64, badge: 'Watch', trips: 411, harshEvents: 29, comfort: 71, adherence: 74, earBaseline: 0.33, avatarHue: 4, phone: '+91 94240 55219' },
  { id: 'drv-4', name: 'Kavita Deshmukh', operatorId: 'op-3', licenceNo: 'MP04-2021-0902', licenceExpiry: '2030-06-05', captainScore: 89, badge: 'Gold', trips: 156, harshEvents: 3, comfort: 92, adherence: 95, earBaseline: 0.30, avatarHue: 316, phone: '+91 94240 77014' },
  { id: 'drv-5', name: 'Gopal Verma', operatorId: 'op-2', licenceNo: 'MP04-2017-7781', licenceExpiry: '2026-11-18', captainScore: 73, badge: 'Bronze', trips: 502, harshEvents: 18, comfort: 79, adherence: 81, earBaseline: 0.27, avatarHue: 205, phone: '+91 94240 21663' },
  { id: 'drv-6', name: 'Farid Ansari', operatorId: 'op-1', licenceNo: 'MP09-2022-4410', licenceExpiry: '2031-02-27', captainScore: 86, badge: 'Silver', trips: 121, harshEvents: 6, comfort: 90, adherence: 91, earBaseline: 0.29, avatarHue: 262, phone: '+91 94250 90233' },
  { id: 'drv-7', name: 'Meera Chouhan', operatorId: 'op-3', licenceNo: 'MP04-2020-6612', licenceExpiry: '2029-08-14', captainScore: 91, badge: 'Gold', trips: 233, harshEvents: 5, comfort: 93, adherence: 94, earBaseline: 0.32, avatarHue: 42, phone: '+91 94240 33119' },
];

export const PARTNERS = [
  { id: 'lp-1', name: 'Vindhya Freight', mode: 'Line-haul', fleet: 64, corridors: 3, sla: 96 },
  { id: 'lp-2', name: 'Chambal Cold Chain', mode: 'Cold-chain', fleet: 22, corridors: 2, sla: 89 },
  { id: 'lp-3', name: 'Indore Last Mile', mode: 'Last-mile', fleet: 140, corridors: 1, sla: 93 },
];

/* Who is at the wheel of what, right now. This is what the operator console
 * reads to answer "who is driving my bus" without asking the tablet. */
export const ASSIGNMENTS = [
  { busId: 'bus-1', driverId: 'drv-2', startedAt: '04:30', dutyHours24h: 6.5 },
  { busId: 'bus-2', driverId: 'drv-1', startedAt: '05:10', dutyHours24h: 4.0 },
  { busId: 'bus-3', driverId: 'drv-6', startedAt: '06:00', dutyHours24h: 2.5 },
  { busId: 'bus-4', driverId: 'drv-3', startedAt: '03:50', dutyHours24h: 8.1 },
  { busId: 'bus-5', driverId: 'drv-4', startedAt: '05:45', dutyHours24h: 3.2 },
  { busId: 'bus-6', driverId: 'drv-1', startedAt: '07:20', dutyHours24h: 1.1 },
  { busId: 'bus-7', driverId: 'drv-5', startedAt: '02:15', dutyHours24h: 9.4 },
  { busId: 'bus-8', driverId: 'drv-7', startedAt: '06:35', dutyHours24h: 2.0 },
];

/* The signed-in shift. Drives DMS context features (duty hours, time-on-task)
 * and binds the trip to a driver, bus and corridor. */
export const ACTIVE_SHIFT = {
  id: 'shift-2026-08-08-a',
  driverId: 'drv-2',
  busId: 'bus-1',
  routeId: 'nh52-indore-dewas',
  depotId: 'depot-indore',
  plannedStart: '2026-08-08T04:30:00+05:30',
  plannedEnd: '2026-08-08T13:00:00+05:30',
  breaks: [],
  dutyHours24h: 6.5,
  dutyHours7d: 47,
};

export const badgeFor = (score) =>
  score >= 88 ? 'Gold' : score >= 78 ? 'Silver' : score >= 70 ? 'Bronze' : 'Watch';

export const byId = (list, id) => list.find((x) => x.id === id) || null;
export const forOperator = (list, operatorId) =>
  operatorId ? list.filter((x) => x.operatorId === operatorId) : list;

export const assignmentFor = (busId) => ASSIGNMENTS.find((a) => a.busId === busId) || null;
export const busBySerial = (serial) => BUSES.find((b) => b.serial === serial) || null;

/** Build a shift record for an ad-hoc driver/bus pair — what the check-in gate
 *  produces once identity and breath have cleared. */
export function makeShift({ driverId, busId, routeId, at = new Date() }) {
  const assign = assignmentFor(busId);
  return {
    id: `shift-${busId}-${at.toISOString().slice(0, 10)}`,
    driverId,
    busId,
    routeId: routeId || (byId(BUSES, busId) || {}).routeId || 'nh52-indore-dewas',
    depotId: 'depot-indore',
    plannedStart: at.toISOString(),
    plannedEnd: null,
    breaks: [],
    dutyHours24h: assign ? assign.dutyHours24h : 0,
    dutyHours7d: 42,
  };
}
