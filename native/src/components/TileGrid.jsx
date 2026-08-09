/* Drag-and-drop tile grid — REACT NATIVE. SYSTEM_DESIGN §11.2.
 *
 * RN has no CSS grid, so cells are computed from the measured container and
 * every tile is absolutely positioned. Dragging uses PanResponder rather than a
 * gesture library: it is built in, it works on any device, and the interaction
 * is simple enough that Reanimated would be dependency for its own sake.
 *
 * The HUD anchor is rendered here from `layout.anchor` and is never part of
 * `layout.tiles` — the same structural guarantee as the web build, which is why
 * no drag or remove path can reach it.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, ScrollView, TouchableOpacity } from 'react-native';
import {
  PROFILES, TILE_TYPES, freeSlots, trayTypes,
  swapTiles, moveTile, addTile, removeTile,
} from '@drivosafe/shared';
import { C, S } from '../theme.js';
import { TILE_COMPONENTS } from './tiles.jsx';

const GAP = 8;

/* `profile` is the grid being drawn — the 5x3 tablet grid or one of the phone
 * grids, both from @drivosafe/shared. Cell size, hit-testing and every layout
 * mutation are derived from it, so a tile can never land where the current grid
 * has no slot. */
export default function TileGrid({
  layout, setLayout, editing, state, route, onBreak, hud, profile = PROFILES.full,
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dragId, setDragId] = useState(null);
  const [overSlot, setOverSlot] = useState(null);

  const cellW = box.w ? (box.w - GAP * (profile.cols - 1)) / profile.cols : 0;
  const cellH = box.h ? (box.h - GAP * (profile.rows - 1)) / profile.rows : 0;
  const at = (x, y) => ({ left: x * (cellW + GAP), top: y * (cellH + GAP) });

  const occupied = useMemo(
    () => new Set(layout.tiles.map((t) => t.x + ',' + t.y)),
    [layout]
  );
  const empties = freeSlots(layout.anchor, profile).filter((s) => !occupied.has(s.x + ',' + s.y));
  const tray = trayTypes(layout);

  /* Which grid cell does a point land in? Returns null for cells under the
   * anchor, so a tile dropped on the HUD snaps back instead of vanishing. */
  const cellAt = (px, py) => {
    const x = Math.floor(px / (cellW + GAP));
    const y = Math.floor(py / (cellH + GAP));
    if (x < 0 || y < 0 || x >= profile.cols || y >= profile.rows) return null;
    const a = layout.anchor;
    if (x >= a.x && x < a.x + profile.anchorW && y >= a.y && y < a.y + profile.anchorH) return null;
    return { x, y };
  };

  return (
    <>
      <View
        style={{ flex: 1 }}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {cellW > 0 ? (
          <>
            {/* drop-target hints, drawn beneath the tiles */}
            {editing &&
              empties.map((s) => (
                <View
                  key={'e' + s.x + ',' + s.y}
                  style={[
                    S.tile,
                    {
                      position: 'absolute',
                      ...at(s.x, s.y),
                      width: cellW, height: cellH,
                      borderStyle: 'dashed',
                      backgroundColor: 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderColor:
                        overSlot && overSlot.x === s.x && overSlot.y === s.y ? C.accent : C.line2,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 10, color: C.fg3 }}>DROP HERE</Text>
                </View>
              ))}

            {/* anchor — always largest, never draggable, never removable */}
            <View
              style={[
                S.tile, S.tileAnchor,
                {
                  position: 'absolute',
                  ...at(layout.anchor.x, layout.anchor.y),
                  width: cellW * profile.anchorW + GAP * (profile.anchorW - 1),
                  height: cellH * profile.anchorH + GAP * (profile.anchorH - 1),
                },
              ]}
            >
              {hud(
                Math.round(cellW * profile.anchorW + GAP * (profile.anchorW - 1)),
                Math.round(cellH * profile.anchorH + GAP * (profile.anchorH - 1))
              )}
            </View>

            {layout.tiles.map((t) => (
              <DraggableTile
                key={t.id}
                tile={t}
                editing={editing}
                pos={at(t.x, t.y)}
                w={cellW}
                h={cellH}
                dragging={dragId === t.id}
                overSlot={overSlot}
                onStart={() => setDragId(t.id)}
                onMove={(px, py) => setOverSlot(cellAt(px, py))}
                onEnd={(px, py) => {
                  const cell = cellAt(px, py);
                  setDragId(null);
                  setOverSlot(null);
                  if (!cell) return;                       // invalid drop: snap back
                  const other = layout.tiles.find((o) => o.x === cell.x && o.y === cell.y);
                  setLayout(
                    other && other.id !== t.id
                      ? swapTiles(layout, t.id, other.id, profile)
                      : moveTile(layout, t.id, cell.x, cell.y, profile)
                  );
                }}
                onRemove={() => setLayout(removeTile(layout, t.id, profile))}
                state={state}
                route={route}
                onBreak={onBreak}
              />
            ))}
          </>
        ) : null}
      </View>

      {editing ? (
        <View
          style={[
            S.panel,
            { marginBottom: 0, marginTop: GAP, paddingVertical: 9, borderColor: C.line2 },
          ]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[S.tileTitle, { marginBottom: 0 }]}>TILE TRAY</Text>
              {tray.length === 0 ? (
                <Text style={{ fontSize: 11, color: C.fg3 }}>all tiles placed</Text>
              ) : (
                tray.map((type) => (
                  <TouchableOpacity
                    key={type}
                    activeOpacity={0.7}
                    disabled={empties.length === 0}
                    onPress={() => setLayout(addTile(layout, type, profile))}
                    style={[S.btn, empties.length === 0 && { opacity: 0.4 }]}
                  >
                    <Text style={S.btnTxt}>+ {TILE_TYPES[type].name}</Text>
                  </TouchableOpacity>
                ))
              )}
              <Text style={{ fontSize: 10, color: C.fg3 }}>
                {empties.length} free slot{empties.length === 1 ? '' : 's'}
              </Text>
            </View>
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}

function DraggableTile({
  tile, editing, pos, w, h, dragging, overSlot,
  onStart, onMove, onEnd, onRemove, state, route, onBreak,
}) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const posRef = useRef(pos);
  posRef.current = pos;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => editingRef.current,
        onMoveShouldSetPanResponder: (_, g) =>
          editingRef.current && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onPanResponderGrant: () => {
          pan.setValue({ x: 0, y: 0 });
          onStart();
        },
        onPanResponderMove: (_, g) => {
          pan.setValue({ x: g.dx, y: g.dy });
          // centre of the dragged tile, in grid-container coordinates
          onMove(posRef.current.left + g.dx + w / 2, posRef.current.top + g.dy + h / 2);
        },
        onPanResponderRelease: (_, g) => {
          onEnd(posRef.current.left + g.dx + w / 2, posRef.current.top + g.dy + h / 2);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 20 }).start();
        },
        onPanResponderTerminate: () => {
          onEnd(-1, -1);
          pan.setValue({ x: 0, y: 0 });
        },
      }),
    [w, h]
  );

  const Comp = TILE_COMPONENTS[tile.type];
  const isTarget =
    !dragging && overSlot && overSlot.x === tile.x && overSlot.y === tile.y;

  return (
    <Animated.View
      {...(editing ? responder.panHandlers : {})}
      style={[
        S.tile,
        {
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          width: w,
          height: h,
          transform: pan.getTranslateTransform(),
          zIndex: dragging ? 10 : 1,
          elevation: dragging ? 10 : 0,
          opacity: dragging ? 0.85 : 1,
          borderColor: dragging || isTarget ? C.accent : editing ? C.line2 : C.line,
          borderWidth: isTarget ? 2 : 1,
        },
      ]}
    >
      {editing ? (
        <TouchableOpacity
          onPress={onRemove}
          style={{
            position: 'absolute', top: 4, right: 4, zIndex: 20,
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#1a0406', fontWeight: '800', fontSize: 13, lineHeight: 15 }}>×</Text>
        </TouchableOpacity>
      ) : null}
      {Comp ? (
        <Comp s={state} route={route} onBreak={onBreak} />
      ) : (
        <Text style={{ color: C.fg3 }}>{tile.type}</Text>
      )}
    </Animated.View>
  );
}
