/* Tile-layout algebra — SYSTEM_DESIGN §11.2.
 *
 * A 5x3 grid sized for a landscape tablet. Exactly one tile is the HUD anchor:
 * it holds a 3x2 span, cannot be removed, cannot be shrunk, and cannot be
 * swapped out. Everything else is a 1x1 info tile that the driver rearranges.
 *
 * Pure data + pure functions — the drag interaction is UI, the rules are here.
 */

export const GRID = { cols: 5, rows: 3 };
export const ANCHOR = { type: 'hud', x: 0, y: 0, w: 3, h: 2 };

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
export function freeSlots(anchor) {
  const a = anchor || DEFAULT_LAYOUT.anchor;
  const covered = new Set();
  for (let dx = 0; dx < ANCHOR.w; dx++)
    for (let dy = 0; dy < ANCHOR.h; dy++) covered.add(key(a.x + dx, a.y + dy));
  const out = [];
  for (let y = 0; y < GRID.rows; y++)
    for (let x = 0; x < GRID.cols; x++)
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
export function swapTiles(layout, aId, bId) {
  if (aId === bId) return layout;
  const tiles = layout.tiles.map((t) => Object.assign({}, t));
  const a = tiles.find((t) => t.id === aId);
  const b = tiles.find((t) => t.id === bId);
  if (!a || !b) return layout;                       // anchor is not in `tiles`
  const ax = a.x, ay = a.y;
  a.x = b.x; a.y = b.y;
  b.x = ax; b.y = ay;
  return validate(Object.assign({}, layout, { tiles }));
}

/** Drop a tile onto an empty slot. */
export function moveTile(layout, id, x, y) {
  const occupied = layout.tiles.some((t) => t.id !== id && t.x === x && t.y === y);
  if (occupied) return swapTiles(layout, id, layout.tiles.find((t) => t.x === x && t.y === y).id);
  const tiles = layout.tiles.map((t) => (t.id === id ? Object.assign({}, t, { x, y }) : t));
  return validate(Object.assign({}, layout, { tiles }));
}

export function addTile(layout, type) {
  if (TILE_TYPES[type] && TILE_TYPES[type].anchor) return layout;
  if (layout.tiles.some((t) => t.type === type)) return layout;   // at most once
  const used = new Set(layout.tiles.map((t) => key(t.x, t.y)));
  const slot = freeSlots(layout.anchor).find((s) => !used.has(key(s.x, s.y)));
  if (!slot) return layout;                                       // grid full
  const tiles = layout.tiles.concat([
    { id: 't-' + type + '-' + Date.now().toString(36), type, x: slot.x, y: slot.y },
  ]);
  return validate(Object.assign({}, layout, { tiles }));
}

export function removeTile(layout, id) {
  return validate(
    Object.assign({}, layout, { tiles: layout.tiles.filter((t) => t.id !== id) })
  );
}

/** Anchor present and largest, no overlaps, nothing off-grid or under the
 *  anchor. Anything invalid is dropped rather than rendered wrong. */
export function validate(layout) {
  const anchor = layout.anchor || DEFAULT_LAYOUT.anchor;
  const legal = new Set(freeSlots(anchor).map((s) => key(s.x, s.y)));
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
export function reflow(layout) {
  const slots = freeSlots(layout.anchor);
  const ordered = layout.tiles
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t, i) => (slots[i] ? Object.assign({}, t, slots[i]) : t));
  return validate(Object.assign({}, layout, { tiles: ordered }));
}
