/* Tile-layout algebra tests (SYSTEM_DESIGN §11.2). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LAYOUT, GRID, ANCHOR, freeSlots, trayTypes,
  swapTiles, moveTile, addTile, removeTile, validate, reflow,
  PROFILES, COMPACT_LAYOUT, COMPACT_PORTRAIT_LAYOUT, profileFor, layoutForProfile, isCompact,
} from './layout.js';
import { createAlertArbiter, P } from './alerts.js';

test('the anchor is never in tiles, so it cannot be dragged or removed', () => {
  assert.ok(!DEFAULT_LAYOUT.tiles.some((t) => t.type === 'hud'));
  const after = removeTile(DEFAULT_LAYOUT, 'hud');
  assert.equal(after.tiles.length, DEFAULT_LAYOUT.tiles.length);
  assert.deepEqual(after.anchor, DEFAULT_LAYOUT.anchor);
});

test('free slots are the grid minus the anchor span', () => {
  const slots = freeSlots(DEFAULT_LAYOUT.anchor);
  assert.equal(slots.length, GRID.cols * GRID.rows - ANCHOR.w * ANCHOR.h);
});

test('the default layout is valid and fills the grid', () => {
  const v = validate(DEFAULT_LAYOUT);
  assert.equal(v.tiles.length, DEFAULT_LAYOUT.tiles.length);
  assert.equal(v.tiles.length, freeSlots(v.anchor).length);
});

test('swapping two tiles exchanges their slots and nothing else', () => {
  const a = DEFAULT_LAYOUT.tiles[0], b = DEFAULT_LAYOUT.tiles[3];
  const out = swapTiles(DEFAULT_LAYOUT, a.id, b.id);
  const a2 = out.tiles.find((t) => t.id === a.id);
  const b2 = out.tiles.find((t) => t.id === b.id);
  assert.deepEqual([a2.x, a2.y], [b.x, b.y]);
  assert.deepEqual([b2.x, b2.y], [a.x, a.y]);
  assert.equal(out.tiles.length, DEFAULT_LAYOUT.tiles.length);
});

test('a tile type can be placed at most once', () => {
  const start = removeTile(DEFAULT_LAYOUT, 't-map');
  const once = addTile(start, 'map');
  const twice = addTile(once, 'map');
  assert.equal(once.tiles.filter((t) => t.type === 'map').length, 1);
  assert.equal(twice.tiles.length, once.tiles.length);
});

test('the hud tile is never offered in the tray', () => {
  assert.ok(!trayTypes(DEFAULT_LAYOUT).includes('hud'));
  const stripped = { anchor: DEFAULT_LAYOUT.anchor, tiles: [] };
  assert.ok(!trayTypes(stripped).includes('hud'));
});

test('moving onto an occupied slot degrades to a swap, never an overlap', () => {
  const a = DEFAULT_LAYOUT.tiles[0], b = DEFAULT_LAYOUT.tiles[1];
  const out = moveTile(DEFAULT_LAYOUT, a.id, b.x, b.y);
  const keys = out.tiles.map((t) => t.x + ',' + t.y);
  assert.equal(new Set(keys).size, keys.length, 'no two tiles may share a slot');
});

test('validate drops anything overlapping the anchor', () => {
  const bad = { anchor: DEFAULT_LAYOUT.anchor, tiles: [{ id: 'x', type: 'map', x: 0, y: 0 }] };
  assert.equal(validate(bad).tiles.length, 0);
});

test('reflow packs tiles into reading order with no holes', () => {
  const sparse = removeTile(removeTile(DEFAULT_LAYOUT, 't-map'), 't-score');
  const packed = reflow(sparse);
  const slots = freeSlots(packed.anchor).slice(0, packed.tiles.length);
  packed.tiles.forEach((t, i) => assert.deepEqual({ x: t.x, y: t.y }, slots[i]));
});

/* ---- alert arbitration ---- */

test('higher priority pre-empts lower', () => {
  const spoken = [];
  const arb = createAlertArbiter({ speak: (t) => spoken.push(t) });
  const t0 = 1_000_000;
  arb.post({ priority: P.LANE, text: 'lane three best', postedAt: t0 });
  arb.post({ priority: P.SAFETY, text: 'pull over now', postedAt: t0 });
  arb.tick(t0);
  assert.equal(spoken[0], 'pull over now');
});

test('positive feedback is suppressed while the driver is drowsy', () => {
  const spoken = [];
  const arb = createAlertArbiter({ speak: (t) => spoken.push(t) });
  arb.setSuppression({ drowsyLevel: 'D3' });
  const id = arb.post({ priority: P.INFO, text: 'pothole handled, nice work' });
  assert.equal(id, null, 'P6 must be refused outright while drowsy');
  arb.tick(Date.now());
  assert.equal(spoken.length, 0);
});

test('identical messages are deduped inside the window', () => {
  const spoken = [];
  const arb = createAlertArbiter({ speak: (t) => spoken.push(t) });
  const t0 = 2_000_000;
  arb.post({ priority: P.LANE, text: 'lane three best', postedAt: t0 });
  arb.tick(t0);
  arb.post({ priority: P.LANE, text: 'lane three best', postedAt: t0 + 5000 });
  arb.tick(t0 + 5000);
  assert.equal(spoken.length, 1);
});

test('the silence budget caps chatter and drops the excess rather than queueing it', () => {
  const spoken = [];
  const arb = createAlertArbiter({ speak: (t) => spoken.push(t) });
  const t0 = 3_000_000;
  // 200 s of a chatty corridor: a fresh lane-policy alert every 3 s, ticked at
  // 2 Hz so the arbiter gets a fair chance to speak each one
  for (let ms = 0; ms <= 200_000; ms += 500) {
    if (ms % 3000 === 0) arb.post({ priority: P.LANE, text: 'policy ' + ms, postedAt: t0 + ms });
    arb.tick(t0 + ms);
  }
  assert.ok(spoken.length <= 30, `budget caps at 30 per 5 min, got ${spoken.length}`);
  assert.ok(arb.stats().dropped > 0, 'over-budget alerts must be dropped, not queued');
});

test('the arbiter honours the minimum inter-utterance gap', () => {
  const spoken = [];
  const arb = createAlertArbiter({ speak: (t, p) => spoken.push({ t, p }) });
  const t0 = 4_000_000;
  arb.post({ priority: P.HAZARD, text: 'pothole in 300 metres', postedAt: t0 });
  arb.tick(t0);
  arb.post({ priority: P.HAZARD, text: 'rough road in 500 metres', postedAt: t0 + 800 });
  arb.tick(t0 + 800);
  assert.equal(spoken.length, 1, 'continuous speech is not information');
});


/* ---------------------------------------------------------------- profiles --
 * The phone profile is a different grid, not a scaled-down one. What must hold
 * is that it is still a legal layout under its own rules, and that it carries
 * exactly the three tiles a driver acts on.
 */

test('a phone-sized viewport selects a compact profile, a tablet does not', () => {
  assert.equal(profileFor(1280, 800).id, 'full', 'landscape tablet');
  assert.equal(profileFor(844, 390).id, 'compact', 'phone held landscape — too short');
  assert.equal(profileFor(390, 844).id, 'compact-portrait', 'phone held portrait — too narrow');
  assert.equal(profileFor(0, 0).id, 'full', 'an unknown viewport must not degrade the tablet');
  assert.ok(isCompact(profileFor(844, 390)) && isCompact(profileFor(390, 844)));
  assert.ok(!isCompact(profileFor(1280, 800)));
});

test('both phone profiles put the HUD on the screen\'s widest edge', () => {
  /* Landscape gives the road the width by taking three of four columns;
   * portrait cannot, so it takes the full width and two of three rows. */
  assert.equal(PROFILES.compact.anchorW / PROFILES.compact.cols, 0.75);
  assert.equal(PROFILES.compactPortrait.anchorW, PROFILES.compactPortrait.cols);

  const p = validate(COMPACT_PORTRAIT_LAYOUT, PROFILES.compactPortrait);
  assert.equal(p.tiles.length, 3, 'the same three tiles survive in portrait');
  assert.ok(p.tiles.every((t) => t.y === 2), 'in a row under the HUD');
  assert.equal(layoutForProfile(PROFILES.compactPortrait), COMPACT_PORTRAIT_LAYOUT);
});

test('the compact layout is legal under the compact grid and unchanged by validation', () => {
  const validated = validate(COMPACT_LAYOUT, PROFILES.compact);
  assert.equal(validated.tiles.length, COMPACT_LAYOUT.tiles.length,
    'no compact tile may be dropped as off-grid or under the anchor');
  assert.deepEqual(
    validated.tiles.map((t) => t.type),
    ['speed-gear', 'next-hazard', 'trip-score']
  );
});

test('the compact grid leaves exactly three slots beside the HUD', () => {
  const slots = freeSlots(COMPACT_LAYOUT.anchor, PROFILES.compact);
  assert.equal(slots.length, 3);
  assert.ok(slots.every((s) => s.x === 3), 'all three sit in the column beside the anchor');
});

test('the compact anchor still covers more of its grid than every tile combined', () => {
  const p = PROFILES.compact;
  const anchorCells = p.anchorW * p.anchorH;
  assert.ok(anchorCells > COMPACT_LAYOUT.tiles.length,
    'the HUD stays the largest thing on the screen at any size');
});

test('the tablet layout does not survive validation against the compact grid', () => {
  /* A saved 5x3 dashboard cannot simply be reused on a phone: its right-hand
   * column is off-grid there. This is why the compact profile ships a fixed
   * layout rather than reusing the driver's saved one. */
  const carried = validate(DEFAULT_LAYOUT, PROFILES.compact);
  assert.ok(carried.tiles.length < DEFAULT_LAYOUT.tiles.length);
  assert.equal(layoutForProfile(PROFILES.compact), COMPACT_LAYOUT);
  assert.equal(layoutForProfile(PROFILES.full), DEFAULT_LAYOUT);
});
