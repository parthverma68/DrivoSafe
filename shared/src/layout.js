/* Tile-layout algebra — SYSTEM_DESIGN §11.2.
 *
 * A 5x3 grid sized for a landscape tablet. Exactly one tile is the HUD anchor:
 * it holds a 3x2 span, cannot be removed, cannot be shrunk, and cannot be
 * swapped out. Everything else is a 1x1 info tile that the driver rearranges.
 *
 * Pure data + pure functions — the drag interaction is UI, the rules are here.
 *
 * ---- profiles ----
 * A phone is not a small tablet. Nine info tiles on a 6-inch screen is nine
 * things nobody can read at 80 km/h, so the phone gets a *different* grid
 * rather than the same one scaled down: 4x3 with the HUD taking a 3x3 block and
 * a single column beside it carrying the three tiles a driver acts on — speed
 * and gear, the next hazard, and the trip score.
 *
 * The compact layout is deliberately **not** editable. On the tablet the driver
 * arranges their own dashboard because there is room to; on a phone the reduced
 * set *is* the design, and letting someone drag the HUD into a corner of a
 * screen this size would defeat the anchor rule rather than express it.
 */

export const PROFILES = {
  full: { id: 'full', cols: 5, rows: 3, anchorW: 3, anchorH: 2, editable: true },
  /* phone, landscape — the driving orientation: HUD left, tiles in a column */
  compact: { id: 'compact', cols: 4, rows: 3, anchorW: 3, anchorH: 3, editable: false },
  /* phone, portrait — the fallback when rotation cannot be had: HUD on top,
     tiles in a row beneath it, so the road still gets the widest edge */
  compactPortrait: { id: 'compact-portrait', cols: 3, rows: 3, anchorW: 3, anchorH: 2, editable: false },
};

export const GRID = { cols: PROFILES.full.cols, rows: PROFILES.full.rows };
export const ANCHOR = { type: 'hud', x: 0, y: 0, w: PROFILES.full.anchorW, h: PROFILES.full.anchorH };

/** Which profile a viewport of this size should drive. */
export function profileFor(width, height) {
  if (!width || !height) return PROFILES.full;
  /* Either dimension being phone-sized is enough: a phone held landscape is
   * wide but very short, and a phone held portrait is the reverse. */
  if (width >= 900 && height >= 520) return PROFILES.full;
  return height > width ? PROFILES.compactPortrait : PROFILES.compact;
}

/** True for any of the phone profiles. */
export const isCompact = (profile) => !!profile && profile.id.indexOf('compact') === 0;

/* The reduced set, in the order they are read: what is the bus doing, what is
 * coming, how is the driver doing against it. */
export const COMPACT_LAYOUT = {
  anchor: { type: 'hud', x: 0, y: 0 },
  tiles: [
    { id: 'c-speed', type: 'speed-gear', x: 3, y: 0 },
    { id: 'c-hazard', type: 'next-hazard', x: 3, y: 1 },
    { id: 'c-score', type: 'trip-score', x: 3, y: 2 },
  ],
};

export const COMPACT_PORTRAIT_LAYOUT = {
  anchor: { type: 'hud', x: 0, y: 0 },
  tiles: [
    { id: 'c-speed', type: 'speed-gear', x: 0, y: 2 },
    { id: 'c-hazard', type: 'next-hazard', x: 1, y: 2 },
    { id: 'c-score', type: 'trip-score', x: 2, y: 2 },
  ],
};

/** The layout a profile ships with. Compact ignores saved preferences. */
export const layoutForProfile = (profile) => {
  if (!profile) return DEFAULT_LAYOUT;
  if (profile.id === 'compact') return COMPACT_LAYOUT;
  if (profile.id === 'compact-portrait') return COMPACT_PORTRAIT_LAYOUT;
  return DEFAULT_LAYOUT;
};

export const TILE_TYPES = {
  hud: { name: 'Road HUD', anchor: true, desc: 'Live wireframe view of the road ahead' },
  'lane-policy': { name: 'Lane policy', desc: 'Ranked lane guidance' },
  'speed-gear': { name: 'Speed & gear', desc: 'Current speed, advised gear' },
  'next-hazard': { name: 'Next hazard', desc: 'Countdown, slow-to, confidence' },
  drowsiness: { name: 'Driver state', desc: 'Fatigue level and contributing signals' },
  map: { name: 'Route map', desc: 'Top-down position and hazards ahead' },
  'trip-score': { name: 'Trip score', desc: 'Captain Score and RQI, live' },
  upcoming: { name: 'Upcoming', desc: 'Queue of the next hazards' },
  amenities: { name: 'Amenities', desc: 'Petrol, rest stop, mechanic ahead' },
  traffic: { name: 'Traffic', desc: 'Vehicles ahead, lane and closing state' },
  'compliance-checks': { name: 'Checks', desc: 'Last event pass/fail' },
  'road-scan': { name: 'Road scan', desc: 'Rear camera — corridor capture for later analysis' },
  'driver-cam': { name: 'Driver camera', desc: 'Front camera — fatigue evidence clips' },
};

/* Ships out of the box: HUD anchor + the four tiles a driver actually acts on. */
export const DEFAULT_LAYOUT = {
  anchor: { type: 'hud', x: ANCHOR.x, y: ANCHOR.y },
  tiles: [
    { id: 't-lane', type: 'lane-policy', x: 3, y: 0 },
    { id: 't-speed', type: 'speed-gear', x: 4, y: 0 },
    { id: 't-hazard', type: 'next-hazard', x: 3, y: 1 },
    { id: 't-drowsy', type: 'drowsiness', x: 4, y: 1 },
    { id: 't-upcoming', type: 'upcoming', x: 0, y: 2 },
    { id: 't-map', type: 'map', x: 1, y: 2 },
    { id: 't-score', type: 'trip-score', x: 2, y: 2 },
    { id: 't-amenities', type: 'amenities', x: 3, y: 2 },
    { id: 't-checks', type: 'compliance-checks', x: 4, y: 2 },
  ],
};

const key = (x, y) => x + ',' + y;

/** Every 1x1 slot not covered by the anchor, in reading order. */
export function freeSlots(anchor, profile = PROFILES.full) {
  const a = anchor || DEFAULT_LAYOUT.anchor;
  const covered = new Set();
  for (let dx = 0; dx < profile.anchorW; dx++)
    for (let dy = 0; dy < profile.anchorH; dy++) covered.add(key(a.x + dx, a.y + dy));
  const out = [];
  for (let y = 0; y < profile.rows; y++)
    for (let x = 0; x < profile.cols; x++)
      if (!covered.has(key(x, y))) out.push({ x, y });
  return out;
}

/** Content types not currently placed — the tile tray. `hud` is never offered. */
export function trayTypes(layout) {
  const placed = new Set(layout.tiles.map((t) => t.type));
  return Object.keys(TILE_TYPES).filter(
    (t) => !TILE_TYPES[t].anchor && !placed.has(t)
  );
}

/** Drag A onto B: they exchange slots. Both must be info tiles. */
export function swapTiles(layout, aId, bId, profile = PROFILES.full) {
  if (aId === bId) return layout;
  const tiles = layout.tiles.map((t) => Object.assign({}, t));
  const a = tiles.find((t) => t.id === aId);
  const b = tiles.find((t) => t.id === bId);
  if (!a || !b) return layout;                       // anchor is not in `tiles`
  const ax = a.x, ay = a.y;
  a.x = b.x; a.y = b.y;
  b.x = ax; b.y = ay;
  return validate(Object.assign({}, layout, { tiles }), profile);
}

/** Drop a tile onto an empty slot. */
export function moveTile(layout, id, x, y, profile = PROFILES.full) {
  const occupied = layout.tiles.some((t) => t.id !== id && t.x === x && t.y === y);
  if (occupied) {
    return swapTiles(layout, id, layout.tiles.find((t) => t.x === x && t.y === y).id, profile);
  }
  const tiles = layout.tiles.map((t) => (t.id === id ? Object.assign({}, t, { x, y }) : t));
  return validate(Object.assign({}, layout, { tiles }), profile);
}

export function addTile(layout, type, profile = PROFILES.full) {
  if (TILE_TYPES[type] && TILE_TYPES[type].anchor) return layout;
  if (layout.tiles.some((t) => t.type === type)) return layout;   // at most once
  const used = new Set(layout.tiles.map((t) => key(t.x, t.y)));
  const slot = freeSlots(layout.anchor, profile).find((s) => !used.has(key(s.x, s.y)));
  if (!slot) return layout;                                       // grid full
  const tiles = layout.tiles.concat([
    { id: 't-' + type + '-' + Date.now().toString(36), type, x: slot.x, y: slot.y },
  ]);
  return validate(Object.assign({}, layout, { tiles }), profile);
}

export function removeTile(layout, id, profile = PROFILES.full) {
  return validate(
    Object.assign({}, layout, { tiles: layout.tiles.filter((t) => t.id !== id) }),
    profile
  );
}

/** Anchor present and largest, no overlaps, nothing off-grid or under the
 *  anchor. Anything invalid is dropped rather than rendered wrong. */
export function validate(layout, profile = PROFILES.full) {
  const anchor = layout.anchor || DEFAULT_LAYOUT.anchor;
  const legal = new Set(freeSlots(anchor, profile).map((s) => key(s.x, s.y)));
  const seen = new Set();
  const tiles = [];
  for (const t of layout.tiles) {
    const k = key(t.x, t.y);
    if (!legal.has(k) || seen.has(k)) continue;
    if (TILE_TYPES[t.type] && TILE_TYPES[t.type].anchor) continue;
    seen.add(k);
    tiles.push(t);
  }
  return { anchor, tiles };
}

/** Repack tiles into reading order with no holes (§6A.2 reflow). */
export function reflow(layout, profile = PROFILES.full) {
  const slots = freeSlots(layout.anchor, profile);
  const ordered = layout.tiles
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t, i) => (slots[i] ? Object.assign({}, t, slots[i]) : t));
  return validate(Object.assign({}, layout, { tiles: ordered }), profile);
}
