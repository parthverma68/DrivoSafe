/* Small shared primitives — the RN equivalents of the web build's utility
 * classes. Kept in one file so the screens read like the web screens do.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { MONO, BADGE_COLOR, useTheme } from '../theme.js';

export function Chip({ children, tone, style }) {
  const { C, S } = useTheme();
  const col =
    tone === 'ok' ? C.ok : tone === 'warn' ? C.warn :
    tone === 'danger' ? C.danger : tone === 'critical' ? '#fff' : C.fg2;
  return (
    <View
      style={[
        S.chip,
        tone === 'critical'
          ? { backgroundColor: C.critical, borderColor: C.critical }
          : tone
          ? { borderColor: col + '66' }
          : null,
        style,
      ]}
    >
      <Text style={[S.chipTxt, { color: col }]} numberOfLines={1}>{children}</Text>
    </View>
  );
}

export function Btn({ children, onPress, kind, disabled, style }) {
  const { C, S } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        S.btn,
        kind === 'primary' && S.btnPrimary,
        kind === 'danger' && S.btnDanger,
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text style={[S.btnTxt, kind === 'primary' && S.btnPrimaryTxt, kind === 'danger' && S.btnPrimaryTxt]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

export function Kpi({ k, v, d, tone }) {
  const { C, S } = useTheme();
  return (
    <View style={S.kpi}>
      <Text style={S.kpiK}>{k}</Text>
      <Text style={[S.kpiV, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {v}
      </Text>
      <Text style={S.kpiD}>{d}</Text>
    </View>
  );
}

export function Panel({ title, hint, children, style }) {
  const { C, S } = useTheme();
  return (
    <View style={[S.panel, style]}>
      {title ? <Text style={S.h3}>{title}</Text> : null}
      {hint ? <Text style={S.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function StatLine({ k, v, tone }) {
  const { C, S } = useTheme();
  return (
    <View style={S.statLine}>
      <Text style={S.statK} numberOfLines={1}>{k}</Text>
      <Text style={[S.statV, tone ? { color: tone } : null]}>{v}</Text>
    </View>
  );
}

export function Bar({ pct, color }) {
  const { C, S } = useTheme();
  return (
    <View style={S.bar}>
      <View style={{ width: Math.max(0, Math.min(100, pct)) + '%', height: '100%', backgroundColor: color || C.ok }} />
    </View>
  );
}

export function Badge({ children, kind }) {
  const { C, S } = useTheme();
  const c = BADGE_COLOR[kind];
  return <Text style={[S.badge, c]}>{children}</Text>;
}

/* A minimal table. RN has no <table>, so columns are flex weights. */
export function Table({ cols, rows, keyExtractor, maxHeight }) {
  const { C, S } = useTheme();
  const body = (
    <>
      <View style={[{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line2 }]}>
        {cols.map((c, i) => (
          <Text
            key={i}
            style={[S.th, { flex: c.flex || 1, textAlign: c.num ? 'right' : 'left', paddingHorizontal: 6 }]}
            numberOfLines={1}
          >
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={keyExtractor ? keyExtractor(r, ri) : ri} style={[{ flexDirection: 'row', paddingVertical: 7 }, S.trBorder]}>
          {cols.map((c, i) => {
            const cell = c.render(r);
            return (
              <View key={i} style={{ flex: c.flex || 1, paddingHorizontal: 6, alignItems: c.num ? 'flex-end' : 'flex-start' }}>
                {typeof cell === 'string' || typeof cell === 'number' ? (
                  <Text style={[S.td, c.num && { fontFamily: MONO }]} numberOfLines={1}>{cell}</Text>
                ) : (
                  cell
                )}
              </View>
            );
          })}
        </View>
      ))}
    </>
  );
  return maxHeight ? <ScrollView style={{ maxHeight }} nestedScrollEnabled>{body}</ScrollView> : <View>{body}</View>;
}

/* RN has no <input type=range>; this is a touch-draggable equivalent sized for
 * a tablet rather than a mouse. */
export function Slider({ value, min, max, step, onChange, width }) {
  const { C, S } = useTheme();
  const w = width || 120;
  const pct = (value - min) / (max - min || 1);
  const set = (x) => {
    const raw = min + (Math.max(0, Math.min(w, x)) / w) * (max - min);
    const snapped = step ? Math.round(raw / step) * step : raw;
    onChange(Math.max(min, Math.min(max, snapped)));
  };
  return (
    <View
      style={{ width: w, height: 28, justifyContent: 'center' }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}
    >
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.bg3 }}>
        <View style={{ width: pct * 100 + '%', height: '100%', borderRadius: 2, backgroundColor: C.accent }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', left: pct * (w - 16), width: 16, height: 16,
          borderRadius: 8, backgroundColor: C.accent,
        }}
      />
    </View>
  );
}

/* A cycling selector — a dropdown is a poor control on a moving vehicle, so
 * options advance on tap instead. */
export function Cycler({ options, value, onChange, label, width }) {
  const { C, S } = useTheme();
  const i = options.findIndex((o) => (o.value !== undefined ? o.value : o) === value);
  const cur = options[i] || options[0];
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        const next = options[(i + 1) % options.length];
        onChange(next.value !== undefined ? next.value : next);
      }}
      style={[S.btn, width ? { width } : null]}
    >
      {label ? <Text style={[S.chipTxt, { fontSize: 8 }]}>{label}</Text> : null}
      <Text style={S.btnTxt} numberOfLines={1}>{cur.label !== undefined ? cur.label : cur}</Text>
    </TouchableOpacity>
  );
}
