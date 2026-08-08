/* Fleet domain seed data (SYSTEM_DESIGN §12.2).
 *
 * Stands in for the Fleet Service. The shapes are the contract; the values are
 * demo data. Everything is tenant-scoped by operatorId in the real system.
 */

export const OPERATORS = [
  { id: 'op-1', name: 'Sarthi Travels', type: 'Passenger', corridor: 'NH-52', buses: 42, rqi: 84, compliance: 91, contact: 'ops@sarthi.example' },
  { id: 'op-2', name: 'Malwa Roadways', type: 'Mixed', corridor: 'NH-52', buses: 28, rqi: 76, compliance: 68, contact: 'control@malwa.example' },
  { id: 'op-3', name: 'Narmada Transit', type: 'Passenger', corridor: 'SH-27', buses: 17, rqi: 88, compliance: 94, contact: 'depot@narmada.example' },
];

export const BUSES = [
  { id: 'bus-1', reg: 'MP09 FA 4412', operatorId: 'op-1', model: 'Ashok Leyland 12M', kit: 'Assistant+OBD', transmission: 'manual', efficiencyBand: { rpmLow: 1200, rpmHigh: 1750 }, dmsCamera: true },
  { id: 'bus-2', reg: 'MP09 FA 5518', operatorId: 'op-1', model: 'Tata Starbus', kit: 'Assistant+OBD', transmission: 'manual', efficiencyBand: { rpmLow: 1250, rpmHigh: 1800 }, dmsCamera: true },
  { id: 'bus-3', reg: 'MP09 GB 1207', operatorId: 'op-1', model: 'Volvo 9600', kit: 'Mapper (LiDAR)', transmission: 'automatic', efficiencyBand: { rpmLow: 1100, rpmHigh: 1600 }, dmsCamera: true },
  { id: 'bus-4', reg: 'MP04 HH 8890', operatorId: 'op-2', model: 'Eicher Skyline', kit: 'Assistant app-only', transmission: 'manual', efficiencyBand: { rpmLow: 1300, rpmHigh: 1900 }, dmsCamera: false },
  { id: 'bus-5', reg: 'MP04 JC 3341', operatorId: 'op-3', model: 'Scania Metrolink', kit: 'Assistant+OBD', transmission: 'automatic', efficiencyBand: { rpmLow: 1050, rpmHigh: 1550 }, dmsCamera: true },
];

export const DRIVERS = [
  { id: 'drv-1', name: 'Ramesh Yadav', operatorId: 'op-1', licenceNo: 'MP09-2019-0044', captainScore: 92, badge: 'Gold', trips: 318, harshEvents: 4, comfort: 94, adherence: 96, earBaseline: 0.31 },
  { id: 'drv-2', name: 'Imran Sheikh', operatorId: 'op-1', licenceNo: 'MP09-2020-1187', captainScore: 81, badge: 'Silver', trips: 204, harshEvents: 11, comfort: 86, adherence: 88, earBaseline: 0.28 },
  { id: 'drv-3', name: 'Sunil Patil', operatorId: 'op-2', licenceNo: 'MP04-2018-3320', captainScore: 64, badge: 'Watch', trips: 411, harshEvents: 29, comfort: 71, adherence: 74, earBaseline: 0.33 },
  { id: 'drv-4', name: 'Kavita Deshmukh', operatorId: 'op-3', licenceNo: 'MP04-2021-0902', captainScore: 89, badge: 'Gold', trips: 156, harshEvents: 3, comfort: 92, adherence: 95, earBaseline: 0.30 },
  { id: 'drv-5', name: 'Gopal Verma', operatorId: 'op-2', licenceNo: 'MP04-2017-7781', captainScore: 73, badge: 'Bronze', trips: 502, harshEvents: 18, comfort: 79, adherence: 81, earBaseline: 0.27 },
];

export const PARTNERS = [
  { id: 'lp-1', name: 'Vindhya Freight', mode: 'Line-haul', fleet: 64, corridors: 3, sla: 96 },
  { id: 'lp-2', name: 'Chambal Cold Chain', mode: 'Cold-chain', fleet: 22, corridors: 2, sla: 89 },
  { id: 'lp-3', name: 'Indore Last Mile', mode: 'Last-mile', fleet: 140, corridors: 1, sla: 93 },
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
