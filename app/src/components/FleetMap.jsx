/* Live fleet map.
 *
 * A real tile provider is a production concern (§14.4) — and a hard dependency
 * on a network the depot may not have. What the console actually needs is
 * *relative* truth: where each bus is on its corridor, which way it is pointed,
 * and which one you are looking at. So the corridor centrelines are drawn from
 * the same GeoJSON the HUD is built from, and the surrounding street network is
 * synthesised deterministically around them.
 *
 * Projection is a plain equirectangular fit — over a 2 km corridor the error is
 * far below a marker's radius, and it keeps the overlay maths exact enough to
 * position HTML callouts on top of SVG coordinates.
 */
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CORRIDOR_DEFS } from '@drivosafe/shared';
import { toneVar } from './ui.jsx';

function useSize(ref) {
  const [size, setSize] = useState({ w: 800, h: 520 });
  useLayoutEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize({ w: Math.max(120, Math.floor(r.width)), h: Math.max(120, Math.floor(r.height)) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const rnd = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;

export default function FleetMap({ records, selectedId, onSelect, follow = true }) {
  const wrapRef = useRef(null);
  const { w, h } = useSize(wrapRef);
  const [zoom, setZoom] = useState(1);

  const selected = records.find((r) => r.busId === selectedId) || null;

  /* Corridors carrying at least one vehicle, with their counts — the strip
   * along the top of the map. */
  const active = useMemo(() => {
    const counts = new Map();
    for (const r of records) counts.set(r.corridorId, (counts.get(r.corridorId) || 0) + 1);
    return CORRIDOR_DEFS.filter((c) => counts.has(c.id)).map((c) => ({ c, n: counts.get(c.id) }));
  }, [records]);

  /* One corridor is in view at a time. Two corridors 150 km apart fitted into
   * one frame would render each 1.7 km road as a few pixels of nothing — so
   * the map focuses the selected vehicle's corridor and the strip switches. */
  const focusId = selected ? selected.corridorId : active.length ? active[0].c.id : null;
  const corridors = useMemo(
    () => CORRIDOR_DEFS.filter((c) => c.id === focusId),
    [focusId]
  );
  const visible = records.filter((r) => r.corridorId === focusId);

  const project = useMemo(() => {
    const pts = corridors.flatMap((c) => c.path);
    if (pts.length === 0) return () => ({ x: w / 2, y: h / 2 });

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of pts) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    }
    /* A corridor is long and thin; pad the short axis hard so the road sits in
     * a landscape rather than hugging the frame. */
    const padLat = Math.max((maxLat - minLat) * 1.4, 0.006);
    const padLng = Math.max((maxLng - minLng) * 0.1, 0.002);
    minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;

    const s = Math.min(w / (maxLng - minLng), h / (maxLat - minLat)) * zoom;
    const cx = (minLng + maxLng) / 2;
    const cy = (minLat + maxLat) / 2;

    /* Following only matters once zoomed in — at fit scale the whole corridor
     * is already on screen and recentring would just make it drift. */
    const chase = follow && selected && zoom > 1.05;
    const fx = chase ? selected.lng : cx;
    const fy = chase ? selected.lat : cy;

    return (lat, lng) => ({
      x: w / 2 + (lng - fx) * s,
      y: h / 2 - (lat - fy) * s,
    });
  }, [corridors, w, h, zoom, follow, selected]);

  /* Deterministic street network around each corridor — drawn once per
   * corridor set, not per frame. */
  const streets = useMemo(() => {
    const out = [];
    corridors.forEach((c, ci) => {
      const a = c.path[0];
      const b = c.path[c.path.length - 1];
      const dLng = b.lng - a.lng;
      for (let i = 0; i < 16; i++) {
        const t = (i + 0.5) / 16;
        const base = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + dLng * t };
        const len = 0.004 + rnd(ci * 31 + i) * 0.02;
        const side = rnd(ci * 17 + i) > 0.5 ? 1 : -1;
        const skew = (rnd(ci * 7 + i) - 0.5) * 0.006;
        out.push({
          key: `s${ci}-${i}`,
          from: base,
          to: { lat: base.lat + side * len, lng: base.lng + skew },
          w: rnd(ci * 3 + i) > 0.72 ? 2.4 : 1.2,
        });
      }
      /* two ring roads */
      for (let k = 0; k < 2; k++) {
        const off = (k === 0 ? 1 : -1) * (0.008 + rnd(ci + k) * 0.006);
        out.push({
          key: `r${ci}-${k}`,
          poly: c.path.map((p, i) => ({ lat: p.lat + off + Math.sin(i / 6) * 0.001, lng: p.lng })),
          w: 2,
        });
      }
    });
    return out;
  }, [corridors]);

  const water = useMemo(() => {
    if (corridors.length === 0) return null;
    const c = corridors[0];
    return c.path.map((p, i) => ({ lat: p.lat - 0.021 + Math.sin(i / 4) * 0.003, lng: p.lng }));
  }, [corridors]);

  const line = (pts) => pts.map((p) => { const q = project(p.lat, p.lng); return `${q.x},${q.y}`; }).join(' ');

  const selPos = selected ? project(selected.lat, selected.lng) : null;

  return (
    <div className="map-shell" ref={wrapRef}>
      <svg width={w} height={h}>
        <defs>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M42 0H0v42" fill="none" stroke="var(--map-street)" strokeWidth="0.6" opacity="0.35" />
          </pattern>
        </defs>

        <rect width={w} height={h} fill="var(--map-void)" />
        <rect width={w} height={h} fill="url(#grid)" />

        {/* land mass under the corridor, so the road is not floating in void */}
        {corridors.map((c) => (
          <polyline
            key={'land-' + c.id}
            points={line(c.path)}
            fill="none"
            stroke="var(--map-land)"
            strokeWidth={Math.max(46, 60 * zoom)}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        ))}

        {water ? (
          <polyline points={line(water)} fill="none" stroke="var(--map-water)" strokeWidth={Math.max(9, 13 * zoom)} strokeLinecap="round" />
        ) : null}

        {streets.map((s) => (
          s.poly
            ? <polyline key={s.key} points={line(s.poly)} fill="none" stroke="var(--map-street)" strokeWidth={s.w} opacity="0.9" />
            : <line
                key={s.key}
                x1={project(s.from.lat, s.from.lng).x} y1={project(s.from.lat, s.from.lng).y}
                x2={project(s.to.lat, s.to.lng).x} y2={project(s.to.lat, s.to.lng).y}
                stroke="var(--map-street)" strokeWidth={s.w} opacity="0.85" strokeLinecap="round"
              />
        ))}

        {/* the corridor itself: casing, surface, centre dashes */}
        {corridors.map((c) => (
          <g key={c.id}>
            <polyline points={line(c.path)} fill="none" stroke="var(--map-road-hi)" strokeWidth={Math.max(11, 15 * zoom)} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={line(c.path)} fill="none" stroke="var(--map-road)" strokeWidth={Math.max(8, 11 * zoom)} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={line(c.path)} fill="none" stroke="var(--map-ink)" strokeWidth="1" strokeDasharray="7 9" opacity="0.5" />
            <text
              x={project(c.path[0].lat, c.path[0].lng).x}
              y={project(c.path[0].lat, c.path[0].lng).y - 16}
              fill="var(--map-ink)" fontSize="10" fontFamily="var(--mono)" letterSpacing="1.4"
            >
              {c.corridor}
            </text>
          </g>
        ))}

        {/* the buses */}
        {visible.map((r) => {
          const p = project(r.lat, r.lng);
          const on = r.busId === selectedId;
          const tone = toneVar(r.statusMeta.tone);
          return (
            <g
              key={r.busId}
              transform={`translate(${p.x} ${p.y})`}
              style={{ cursor: 'pointer', transition: 'transform 0.9s linear' }}
              onClick={() => onSelect && onSelect(r.busId)}
            >
              {on ? <circle r="22" fill={tone} opacity="0.16"><animate attributeName="r" values="16;26;16" dur="2.4s" repeatCount="indefinite" /></circle> : null}
              {r.speedKph > 3 ? (
                <path
                  d="M0,-19 L5,-9 L-5,-9 Z"
                  fill={tone}
                  opacity="0.8"
                  transform={`rotate(${r.heading})`}
                />
              ) : null}
              <circle r={on ? 14 : 11} fill="var(--surface)" stroke={tone} strokeWidth={on ? 2.5 : 1.8} filter={on ? 'url(#glow)' : undefined} />
              <g transform="translate(-6.5 -6)" stroke={tone} strokeWidth="1.5" fill="none" strokeLinecap="round">
                <rect x="1" y="1" width="11" height="8" rx="1.6" />
                <path d="M1 5h11" />
              </g>
            </g>
          );
        })}
      </svg>

      {selected && selPos ? (
        <div className="map-card" style={{ left: selPos.x, top: selPos.y }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
            <span className="plate">{selected.bus.reg}</span>
            <span className={'chip ' + toneChip(selected.statusMeta.tone)} style={{ padding: '2px 8px' }}>
              {selected.statusMeta.label}
            </span>
          </div>
          <div className="kv"><span>Position</span><span>{selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</span></div>
          <div className="kv"><span>Speed</span><span>{selected.speedKph} km/h · lane {selected.lane}</span></div>
          <div className="kv"><span>Remaining</span><span>{selected.remainingKm} km{selected.etaMin != null ? ` · ${selected.etaMin} min` : ''}</span></div>
          <div className="kv"><span>Driver</span><span>{selected.driver ? selected.driver.name : '—'}</span></div>
        </div>
      ) : null}

      <div className="map-overlay tl">
        <span className="chip ok"><i className="dot live" /> LIVE · {visible.length} ON THIS CORRIDOR</span>
        {active.length > 1 ? active.map(({ c, n }) => (
          <button
            key={c.id}
            className={'chip' + (c.id === focusId ? ' watch' : '')}
            style={{ cursor: 'pointer', background: 'var(--glass)', backdropFilter: 'blur(10px)' }}
            onClick={() => {
              const first = records.find((r) => r.corridorId === c.id);
              if (first && onSelect) onSelect(first.busId);
            }}
          >
            {c.corridor} · {n}
          </button>
        )) : null}
      </div>

      <div className="map-overlay br">
        <button className="map-btn" onClick={() => setZoom((z) => Math.min(6, z * 1.4))} title="Zoom in">+</button>
        <button className="map-btn" onClick={() => setZoom((z) => Math.max(1, z / 1.4))} title="Zoom out">−</button>
      </div>

      <div className="map-overlay bl">
        <span className="chip neutral mono">
          {zoom > 1.05 ? `${zoom.toFixed(1)}×` : 'FIT'} · {selected ? 'FOLLOWING' : 'ALL CORRIDORS'}
        </span>
      </div>
    </div>
  );
}

const toneChip = (t) =>
  t === 'danger' ? 'danger' : t === 'warn' ? 'warn' : t === 'watch' ? 'watch' : t === 'ok' ? 'ok' : 'neutral';
