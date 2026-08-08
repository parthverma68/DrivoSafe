/* Drag-and-drop tile grid — SYSTEM_DESIGN §11.2.
 *
 * The HUD anchor is rendered by the parent and passed in as a child element; it
 * is never part of `layout.tiles`, which is what structurally guarantees it can
 * neither be dragged out nor removed. The rules live in domain/layout.js; this
 * file is only the interaction.
 */
import React, { useState } from 'react';
import { GRID, ANCHOR, TILE_TYPES, freeSlots, trayTypes, swapTiles, moveTile, addTile, removeTile } from '@drivosafe/shared';
import { TILE_COMPONENTS } from './tiles/index.jsx';

export default function TileGrid({ layout, setLayout, editing, state, route, onBreak, hud }) {
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);

  const occupied = new Set(layout.tiles.map((t) => t.x + ',' + t.y));
  const empties = freeSlots(layout.anchor).filter((s) => !occupied.has(s.x + ',' + s.y));
  const tray = trayTypes(layout);

  const drop = (target) => {
    if (!dragId) return;
    if (typeof target === 'string') setLayout(swapTiles(layout, dragId, target));
    else setLayout(moveTile(layout, dragId, target.x, target.y));
    setDragId(null);
    setOverKey(null);
  };

  return (
    <>
      <div
        className={'tile-grid' + (editing ? ' editing' : '')}
        style={{
          gridTemplateColumns: `repeat(${GRID.cols}, 1fr)`,
          gridTemplateRows: `repeat(${GRID.rows}, 1fr)`,
        }}
      >
        {/* anchor — always largest, never draggable, never removable */}
        <div
          className="tile anchor"
          style={{
            gridColumn: `${layout.anchor.x + 1} / span ${ANCHOR.w}`,
            gridRow: `${layout.anchor.y + 1} / span ${ANCHOR.h}`,
          }}
        >
          {hud}
        </div>

        {layout.tiles.map((t) => {
          const Comp = TILE_COMPONENTS[t.type];
          const isOver = overKey === t.id;
          return (
            <div
              key={t.id}
              className={
                'tile' +
                (editing ? ' wobble' : '') +
                (dragId === t.id ? ' dragging' : '') +
                (isOver && dragId && dragId !== t.id ? ' droptarget' : '')
              }
              style={{ gridColumn: t.x + 1, gridRow: t.y + 1 }}
              draggable={editing}
              onDragStart={() => setDragId(t.id)}
              onDragEnd={() => { setDragId(null); setOverKey(null); }}
              onDragOver={(e) => { if (editing) { e.preventDefault(); setOverKey(t.id); } }}
              onDragLeave={() => setOverKey(null)}
              onDrop={(e) => { e.preventDefault(); drop(t.id); }}
            >
              {editing ? (
                <button
                  className="tile-remove"
                  title="Remove tile"
                  onClick={() => setLayout(removeTile(layout, t.id))}
                >
                  ×
                </button>
              ) : null}
              {Comp ? <Comp s={state} route={route} onBreak={onBreak} /> : <div className="dim">{t.type}</div>}
            </div>
          );
        })}

        {/* empty slots are drop targets only while editing */}
        {editing &&
          empties.map((s) => {
            const k = 'e' + s.x + ',' + s.y;
            return (
              <div
                key={k}
                className={'tile empty' + (overKey === k ? ' droptarget' : '')}
                style={{ gridColumn: s.x + 1, gridRow: s.y + 1 }}
                onDragOver={(e) => { e.preventDefault(); setOverKey(k); }}
                onDragLeave={() => setOverKey(null)}
                onDrop={(e) => { e.preventDefault(); drop(s); }}
              >
                DROP HERE
              </div>
            );
          })}
      </div>

      {editing ? (
        <div className="tray">
          <span className="mono dim" style={{ fontSize: 10, letterSpacing: '0.1em' }}>
            TILE TRAY
          </span>
          {tray.length === 0 ? (
            <span className="dim" style={{ fontSize: 11 }}>all tiles placed</span>
          ) : (
            tray.map((type) => (
              <button
                key={type}
                className="tray-item"
                title={TILE_TYPES[type].desc}
                onClick={() => setLayout(addTile(layout, type))}
                disabled={empties.length === 0}
              >
                + {TILE_TYPES[type].name}
              </button>
            ))
          )}
          <span className="spacer" />
          <span className="dim" style={{ fontSize: 10 }}>
            {empties.length} free slot{empties.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}
    </>
  );
}
