/* Themed primitives for the role-aware surfaces — the RN twin of the web
 * build's `components/ui.jsx`.
 *
 * These read their palette from `useTheme()` rather than importing the night
 * constants, which is what lets the console surfaces on this tablet follow the
 * day/night toggle while the cab stays locked to night.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, {
  Path, Circle, Rect, Ellipse, G, Defs, LinearGradient, Stop, Line, Polyline,
} from 'react-native-svg';
import { useTheme, MONO } from '../theme.js';

/* ---------------------------------------------------------------- icons --- */
const mk = (children) =>
  function Icon({ size = 18, color = 'currentColor', w = 1.7 }) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </Svg>
    );
  };

export const IconWheel = mk(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Circle cx="12" cy="12" r="3" />
    <Path d="M12 3v6M4.2 8.5l5.3 3M19.8 8.5l-5.3 3M12 15v6M9.2 14.2 5 19M14.8 14.2 19 19" />
  </>
);
export const IconBus = mk(
  <>
    <Rect x="3" y="4" width="18" height="13" rx="2.5" />
    <Path d="M3 10h18M7 17v2.5M17 17v2.5" />
  </>
);
export const IconShield = mk(
  <>
    <Path d="M12 3 20 6v5.5c0 4.6-3.2 8-8 9.5-4.8-1.5-8-4.9-8-9.5V6z" />
    <Path d="m9 12 2 2 4-4" />
  </>
);
export const IconGov = mk(
  <>
    <Path d="M3 10 12 4l9 6" />
    <Path d="M5 10v9M10 10v9M14 10v9M19 10v9M3 20h18" />
  </>
);
export const IconMap = mk(<><Path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3z" /><Path d="M9 4v13M15 7v13" /></>);
export const IconCheck = mk(<Path d="m4.5 12.5 5 5 10-11" />);
export const IconAlert = mk(<><Path d="M12 4.5 21 20H3z" /><Path d="M12 10v4.2M12 17.3v.2" /></>);
export const IconLock = mk(<><Rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><Path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>);
export const IconFace = mk(
  <>
    <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M20 8.5V6a2 2 0 0 0-2-2h-2.5M4 15.5V18a2 2 0 0 0 2 2h2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5" />
    <Path d="M9.8 14.6a3.2 3.2 0 0 0 4.4 0" />
  </>
);
export const IconWind = mk(<><Path d="M3 8h9.5a3 3 0 1 0-3-3" /><Path d="M3 12.5h13a3 3 0 1 1-3 3" /><Path d="M3 17h7" /></>);
export const IconSun = mk(
  <>
    <Circle cx="12" cy="12" r="4" />
    <Path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </>
);
export const IconMoon = mk(<Path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5" />);
export const IconArrow = mk(<><Path d="M5 12h14" /><Path d="m13 6 6 6-6 6" /></>);
export const IconBack = mk(<><Path d="M19 12H5" /><Path d="m11 6-6 6 6 6" /></>);
export const IconSignOut = mk(
  <>
    <Path d="M14 5.5H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h7" />
    <Path d="M17.5 12H10M14.5 8.5 18 12l-3.5 3.5" />
  </>
);
export const IconChip = mk(
  <>
    <Rect x="7" y="7" width="10" height="10" rx="2" />
    <Path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" />
  </>
);
export const IconRefresh = mk(<><Path d="M20 11a8 8 0 1 0-1.6 6" /><Path d="M20 4v6h-6" /></>);
export const IconPlay = mk(<Path d="M8 5.5v13l11-6.5z" />);
export const IconPower = mk(<><Path d="M12 3v9" /><Path d="M6.6 6.6a8 8 0 1 0 10.8 0" /></>);

export const ROLE_ICON = { wheel: IconWheel, bus: IconBus, shield: IconShield, gov: IconGov };

export const accentOf = (C, accent) =>
  accent === 'sky' ? C.sky : accent === 'violet' ? C.violet : accent === 'amber' ? C.amber : C.brand;
export const accentSoftOf = (C, accent) =>
  accent === 'sky' ? C.skySoft : accent === 'violet' ? C.violetSoft : accent === 'amber' ? C.amberSoft : C.brandSoft;

/* ----------------------------------------------------------- primitives --- */

export function Chip({ children, tone, live, style }) {
  const { C, S } = useTheme();
  const col =
    tone === 'ok' ? C.brand : tone === 'warn' ? C.amber : tone === 'watch' ? C.sky :
    tone === 'violet' ? C.violet : tone === 'danger' ? C.danger : tone === 'critical' ? '#fff' : C.fg2;
  return (
    <View
      style={[
        S.chip,
        tone === 'critical'
          ? { backgroundColor: C.critical, borderColor: C.critical }
          : tone ? { borderColor: col + '66' } : null,
        style,
      ]}
    >
      {live ? <View style={[S.dot, { backgroundColor: col }]} /> : null}
      <Text style={[S.chipTxt, { color: col }]} numberOfLines={1}>{children}</Text>
    </View>
  );
}

export function Btn({ children, onPress, onPressIn, onPressOut, kind, disabled, icon, size, style }) {
  const { C, S } = useTheme();
  const txt = [
    S.btnTxt,
    kind === 'primary' && S.btnPrimaryTxt,
    kind === 'danger' && S.btnDangerTxt,
    size === 'lg' && { fontSize: 15 },
  ];
  const iconColor = kind === 'primary' ? C.brandInk : kind === 'danger' ? '#fff' : C.fg;
  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        S.btn,
        kind === 'primary' && S.btnPrimary,
        kind === 'danger' && S.btnDanger,
        kind === 'ghost' && S.btnGhost,
        size === 'lg' && S.btnLg,
        disabled && S.btnDisabled,
        style,
      ]}
    >
      {icon ? React.createElement(icon, { size: size === 'lg' ? 18 : 15, color: iconColor }) : null}
      <Text style={txt}>{children}</Text>
    </TouchableOpacity>
  );
}

export function Avatar({ name = '?', hue = 160, size = 38, radius }) {
  const initials = String(name).split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <View
      style={{
        width: size, height: size, borderRadius: radius == null ? size * 0.32 : radius,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: `hsl(${hue} 55% 38%)`,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.35 }}>{initials}</Text>
    </View>
  );
}

export function Meter({ value, max = 100, tone }) {
  const { C, S } = useTheme();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={S.bar}>
      <View style={{ width: pct + '%', height: '100%', backgroundColor: tone || C.brand }} />
    </View>
  );
}

export function Ring({ value = 0, size = 74, stroke = 7, tone, label, sub }) {
  const { C } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.bg3} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={tone || C.brand} strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - pct / 100)}
          />
        </G>
      </Svg>
      <View style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: MONO, fontSize: size / 4, fontWeight: '700', color: C.fg }}>
          {label != null ? label : Math.round(pct)}
        </Text>
        {sub ? <Text style={{ fontSize: 8, letterSpacing: 1, color: C.fg3 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function Wordmark({ sub = 'drivosafe.com' }) {
  const { C, S } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={S.mark}><Text style={S.markTxt}>D</Text></View>
      <View>
        <Text style={S.brand}>DRIVO<Text style={S.brandAccent}>SAFE</Text></Text>
        <Text style={S.brandSub}>{sub}</Text>
      </View>
    </View>
  );
}

export function Stepper({ steps, index }) {
  const { C, S } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 22 }}>
      {steps.map((s, n) => (
        <React.Fragment key={s.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={[
              S.stepNum,
              n === index && { backgroundColor: C.brand, borderColor: C.brand },
              n < index && { backgroundColor: C.brandSoft, borderColor: C.brand },
            ]}>
              {n < index
                ? <IconCheck size={14} color={C.brand} />
                : <Text style={{ fontSize: 12, fontWeight: '700', color: n === index ? C.brandInk : C.fg3 }}>{n + 1}</Text>}
            </View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: n === index ? C.fg : C.fg3 }}>{s.label}</Text>
          </View>
          {n < steps.length - 1 ? (
            <View style={[S.rule, n < index && { backgroundColor: C.brand }]} />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}

/* A synthesised cab view. RN has no canvas, so the same composition the web
 * build paints is expressed as vector layers — a windscreen band, a seated
 * silhouette, and a rim light from the display. */
export function SyntheticFeed({ seed = 1, night = true, kind = 'face', width = 320, height = 240 }) {
  const rnd = (n) => Math.abs(Math.sin((seed + n) * 12.9898) * 43758.5453) % 1;
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="cab" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={night ? '#12181f' : '#4a5b6a'} />
          <Stop offset="1" stopColor={night ? '#05080b' : '#141b22'} />
        </LinearGradient>
        <LinearGradient id="screenband" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={night ? '#0b1220' : '#8fa7bd'} />
          <Stop offset="0.5" stopColor={night ? '#16304a' : '#c3d4e2'} />
          <Stop offset="1" stopColor={night ? '#0b1220' : '#8fa7bd'} />
        </LinearGradient>
      </Defs>

      <Rect width={width} height={height} fill="url(#cab)" />
      <Rect y={height * 0.12} width={width} height={height * 0.3} fill="url(#screenband)" />

      {[0, 1, 2, 3, 4].map((i) => (
        <Ellipse
          key={i}
          cx={rnd(i) * width}
          cy={height * 0.2 + rnd(i + 5) * height * 0.14}
          rx={13} ry={4}
          fill={night ? 'rgba(255,214,140,0.5)' : 'rgba(255,255,255,0.35)'}
        />
      ))}

      {kind === 'face' ? (
        <>
          <Ellipse cx={width / 2} cy={height * 1.02} rx={width * 0.34} ry={height * 0.36} fill={night ? '#1b242e' : '#2c3a47'} />
          <Ellipse cx={width / 2} cy={height * 0.56} rx={width * 0.13} ry={height * 0.19} fill={night ? '#1b242e' : '#2c3a47'} />
          <Path
            d={`M ${width / 2 - width * 0.13} ${height * 0.56} a ${width * 0.13} ${height * 0.19} 0 0 0 ${width * 0.26} 0`}
            stroke={night ? 'rgba(31,227,155,0.45)' : 'rgba(255,255,255,0.5)'}
            strokeWidth="3" fill="none"
          />
        </>
      ) : (
        <>
          <Path
            d={`M ${width * 0.2} ${height} a ${width * 0.3} ${width * 0.3} 0 0 1 ${width * 0.6} 0`}
            stroke={night ? '#222d38' : '#3b4b5a'} strokeWidth="14" fill="none"
          />
          <Rect y={height * 0.74} width={width} height={height * 0.26} fill={night ? '#0c1116' : '#26313b'} />
        </>
      )}
    </Svg>
  );
}

/** The viewport chrome around a feed. */
export function Viewport({ badge, stamp, children, tone }) {
  const { C, S } = useTheme();
  return (
    <View style={[S.viewport, tone ? { borderColor: tone } : null]}>
      {children}
      {badge ? (
        <View style={S.vpBadge}>
          <View style={[S.dot, { backgroundColor: tone || C.amber }]} />
          <Text style={S.vpBadgeTxt}>{badge}</Text>
        </View>
      ) : null}
      {stamp ? (
        <View style={{ position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(6,10,14,0.72)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
          <Text style={{ fontFamily: MONO, fontSize: 9.5, color: '#dfe9f0' }}>{stamp}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A slow pulse for "live" affordances that must not look frozen. */
export function usePulse(active = true) {
  const v = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!active) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  return v;
}

export { Svg, Path, Circle, Rect, G, Line, Polyline };
