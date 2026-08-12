/* Shared UI primitives and the icon set.
 *
 * Icons are inline SVG on a 24-box with `currentColor` strokes — no icon font,
 * no sprite fetch, and they inherit tone from whatever they sit in. The native
 * build carries the same set drawn with react-native-svg.
 */
import React from 'react';

/* ------------------------------------------------------------- icons ----- */
const svg = (paths, extra = {}) =>
  function Icon({ size = 18, ...rest }) {
    return (
      <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={extra.w || 1.7}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}
      >
        {paths}
      </svg>
    );
  };

export const IconWheel = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v6M4.2 8.5l5.3 3M19.8 8.5l-5.3 3M12 15v6M9.2 14.2 5 19M14.8 14.2 19 19" />
  </>
);
export const IconBus = svg(
  <>
    <rect x="3" y="4" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M7 17v2.5M17 17v2.5" />
    <circle cx="7.5" cy="13.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="13.6" r="1" fill="currentColor" stroke="none" />
  </>
);
export const IconShield = svg(
  <>
    <path d="M12 3 20 6v5.5c0 4.6-3.2 8-8 9.5-4.8-1.5-8-4.9-8-9.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </>
);
export const IconGov = svg(
  <>
    <path d="M3 10 12 4l9 6" />
    <path d="M5 10v9M10 10v9M14 10v9M19 10v9M3 20h18" />
  </>
);
export const IconMap = svg(
  <>
    <path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3z" />
    <path d="M9 4v13M15 7v13" />
  </>
);
export const IconRoute = svg(
  <>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M8.5 18h5a4 4 0 0 0 0-8h-3a4 4 0 0 1 0-8h5" transform="translate(0 2)" />
  </>
);
export const IconUsers = svg(
  <>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M3 20c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4" />
    <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.9c2 .7 3.5 2.4 3.5 5.1" />
  </>
);
export const IconSun = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </>
);
export const IconMoon = svg(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5" />);
export const IconArrow = svg(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);
export const IconBack = svg(<><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>);
export const IconCheck = svg(<path d="m4.5 12.5 5 5 10-11" />);
export const IconAlert = svg(
  <>
    <path d="M12 4.5 21 20H3z" />
    <path d="M12 10v4.2M12 17.3v.2" />
  </>
);
export const IconLock = svg(
  <>
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </>
);
export const IconCam = svg(
  <>
    <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" />
    <path d="m15.5 11 5.5-3v8l-5.5-3z" />
  </>
);
export const IconFace = svg(
  <>
    <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M20 8.5V6a2 2 0 0 0-2-2h-2.5M4 15.5V18a2 2 0 0 0 2 2h2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5" />
    <circle cx="9.6" cy="11" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="14.4" cy="11" r="0.6" fill="currentColor" stroke="none" />
    <path d="M9.8 14.6a3.2 3.2 0 0 0 4.4 0" />
  </>
);
export const IconWind = svg(
  <>
    <path d="M3 8h9.5a3 3 0 1 0-3-3" />
    <path d="M3 12.5h13a3 3 0 1 1-3 3" />
    <path d="M3 17h7" />
  </>
);
export const IconPower = svg(<><path d="M12 3v9" /><path d="M6.6 6.6a8 8 0 1 0 10.8 0" /></>);
export const IconPin = svg(
  <>
    <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </>
);
export const IconPlay = svg(<path d="M8 5.5v13l11-6.5z" />);
export const IconRefresh = svg(
  <>
    <path d="M20 11a8 8 0 1 0-1.6 6" />
    <path d="M20 4v6h-6" />
  </>
);
export const IconSearch = svg(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>);
export const IconSignOut = svg(
  <>
    <path d="M14 5.5H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h7" />
    <path d="M17.5 12H10M14.5 8.5 18 12l-3.5 3.5" />
  </>
);
export const IconChip = svg(
  <>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" />
  </>
);
export const IconBluetooth = svg(
  <>
    <path d="m7 8 10 8-5 4V4l5 4-10 8" />
  </>
);
export const IconCalendar = svg(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>
);
export const IconRoad = svg(
  <>
    <path d="M8 3 5 21M16 3l3 18" />
    <path d="M12 4v3M12 10.5v3M12 17v3" />
  </>
);
export const IconRec = svg(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
  </>
);
export const IconGauge = svg(
  <>
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="m12 13 4-3.5" />
  </>
);

export const ROLE_ICON = { wheel: IconWheel, bus: IconBus, shield: IconShield, gov: IconGov };
export const SURFACE_ICON = { fleet: IconMap, admin: IconUsers, editor: IconRoute, gov: IconGov, drive: IconWheel };

/* Role accents resolve to theme tokens, so a role reads the same in both themes. */
export const ACCENT_VAR = {
  mint: 'var(--brand)', sky: 'var(--sky)', violet: 'var(--violet)', amber: 'var(--amber)',
};
export const ACCENT_SOFT = {
  mint: 'var(--brand-soft)', sky: 'var(--sky-soft)', violet: 'var(--violet-soft)', amber: 'var(--amber-soft)',
};

/* ---------------------------------------------------------- primitives --- */

export function Wordmark({ sub = 'drivosafe.com' }) {
  return (
    <div className="wordmark">
      <div className="mk">D</div>
      <div>
        <b>DRIVO<i>SAFE</i></b>
        <small>{sub}</small>
      </div>
    </div>
  );
}

export function Avatar({ name = '?', hue = 160, size, photo, className = '', ...rest }) {
  const initials = String(name).split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div
      className={`avatar ${size || ''} ${className}`}
      style={{ '--hue': hue }}
      title={name}
      {...rest}
    >
      {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  );
}

export function Chip({ tone, children, live, ...rest }) {
  return (
    <span className={'chip' + (tone ? ' ' + tone : '')} {...rest}>
      {live ? <i className="dot live" /> : null}
      {children}
    </span>
  );
}

export function Kpi({ k, v, d, tone }) {
  return (
    <div className="kpi">
      <div className="k">{k}</div>
      <div className={'v ' + (tone || '')}>{v}</div>
      {d ? <div className="d">{d}</div> : null}
    </div>
  );
}

export function Gauge({ k, v, unit, tone, foot }) {
  return (
    <div className="gauge">
      <div className="k">{k}</div>
      <div className={'v ' + (tone || '')}>
        {v}{unit ? <span className="u">{unit}</span> : null}
      </div>
      {foot}
    </div>
  );
}

export function Meter({ value, max = 100, tone = 'var(--brand)' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="bar"><i style={{ width: pct + '%', background: tone }} /></div>;
}

/** A donut with a value in the middle — compliance, charge, anything 0–100. */
export function Ring({ value = 0, size = 74, stroke = 7, tone = 'var(--brand)', label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s var(--ease)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        textAlign: 'center', lineHeight: 1.1,
      }}>
        <div>
          <div className="mono" style={{ fontSize: size / 4, fontWeight: 700 }}>{label != null ? label : Math.round(pct)}</div>
          {sub ? <div className="dim" style={{ fontSize: 8.5, letterSpacing: '0.1em' }}>{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** The equaliser strip from the reference dashboards — a value's recent shape. */
export function EqBars({ seed = 0, value = 60, bars = 22, tone = 'var(--brand)' }) {
  const items = [];
  for (let i = 0; i < bars; i++) {
    const n = (Math.sin((seed + i) * 12.9898) * 43758.5453) % 1;
    const h = 24 + Math.abs(n) * 62;
    const lit = (i / bars) * 100 < value;
    items.push(
      <i key={i} style={{ height: h + '%', background: lit ? tone : 'var(--line-2)', opacity: lit ? 0.55 + (i / bars) * 0.45 : 1 }} />
    );
  }
  return <div className="eqbars">{items}</div>;
}

export function StatLine({ k, v, tone }) {
  return (
    <div className="stat-line">
      <span>{k}</span>
      <span className={tone || ''}>{v}</span>
    </div>
  );
}

export function Empty({ title, children, icon }) {
  return (
    <div className="empty-state">
      {icon || null}
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="subnav">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Tone helpers shared by every console. */
export const toneClass = (t) =>
  t === 'critical' ? 't-critical' : t === 'danger' ? 't-danger' : t === 'warn' ? 't-warn'
    : t === 'watch' ? 't-watch' : t === 'ok' ? 't-ok' : 't-neutral';

export const toneVar = (t) =>
  t === 'critical' ? 'var(--critical)' : t === 'danger' ? 'var(--danger)' : t === 'warn' ? 'var(--warn)'
    : t === 'watch' ? 'var(--sky)' : t === 'ok' ? 'var(--brand)' : 'var(--fg-3)';

export const scoreTone = (n) => (n >= 85 ? 'ok' : n >= 70 ? 'warn' : 'danger');
