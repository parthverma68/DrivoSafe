/* Design tokens — the RN mirror of app/src/styles/app.css.
 *
 * Two palettes, one structure, exactly as on the web. Night is the default and
 * the *only* palette the in-cab Drive surface ever uses: a white screen on a
 * windscreen mount at 03:00 is a glare hazard, not a preference. The consoles
 * that a depot office opens on this same tablet honour the toggle.
 *
 * Driver-facing surfaces stay tuned for glance time (SYSTEM_DESIGN §15.3):
 * large glyphs, high contrast, and tone carried by colour AND label so it
 * survives glare, dimming and colour-vision differences.
 *
 * `C` and `S` remain exported as the night palette so the surfaces written
 * against them keep working untouched; anything that should follow the toggle
 * reads `useTheme()` instead.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

export const PALETTES = {
  night: {
    mode: 'night',
    bg: '#07090c',
    bg1: '#0e1319',
    bg2: '#131a21',
    bg3: '#19222b',
    raised: '#1d2830',
    line: '#1e262f',
    line2: '#2a343f',
    line3: '#3a4854',

    fg: '#eaf1f6',
    fg2: '#9bb0c0',
    fg3: '#64798b',

    brand: '#1fe39b',
    brandSoft: 'rgba(31,227,155,0.14)',
    brandInk: '#04241a',

    sky: '#52c4ff',
    skySoft: 'rgba(82,196,255,0.14)',
    violet: '#ab8bff',
    violetSoft: 'rgba(171,139,255,0.15)',
    amber: '#ffb648',
    amberSoft: 'rgba(255,182,72,0.14)',
    danger: '#ff6070',
    dangerSoft: 'rgba(255,96,112,0.14)',
    critical: '#ff2f5e',

    mapVoid: '#070a0d',
    mapLand: '#0d1217',
    mapStreet: '#1b232b',
    mapRoad: '#263039',
    mapRoadHi: '#36444f',
    mapInk: '#4a5c6b',
  },
  day: {
    mode: 'day',
    bg: '#eef1f5',
    bg1: '#ffffff',
    bg2: '#f6f8fa',
    bg3: '#eef2f6',
    raised: '#ffffff',
    line: '#e2e8ee',
    line2: '#d3dce4',
    line3: '#b9c6d1',

    fg: '#0c151b',
    fg2: '#4d6070',
    fg3: '#75899a',

    brand: '#00a86b',
    brandSoft: 'rgba(0,168,107,0.12)',
    brandInk: '#ffffff',

    sky: '#0d84d8',
    skySoft: 'rgba(13,132,216,0.12)',
    violet: '#6f4ede',
    violetSoft: 'rgba(111,78,222,0.12)',
    amber: '#b97a00',
    amberSoft: 'rgba(185,122,0,0.14)',
    danger: '#d92d3f',
    dangerSoft: 'rgba(217,45,63,0.12)',
    critical: '#c50f34',

    mapVoid: '#d7e0e7',
    mapLand: '#edf2f4',
    mapStreet: '#b7c7d2',
    mapRoad: '#ffffff',
    mapRoadHi: '#a6bac8',
    mapInk: '#7f93a3',
  },
};

/* Semantic aliases every surface uses. */
const withAliases = (p) => ({ ...p, ok: p.brand, watch: p.sky, warn: p.amber, accent: p.brand });

export const C = withAliases(PALETTES.night);
export const C_DAY = withAliases(PALETTES.day);

export const MONO = Platform.select({
  android: 'monospace',
  ios: 'Menlo',
  default: 'monospace',
});

export const TONE_COLOR = {
  danger: C.danger,
  warn: C.warn,
  accent: C.ok,
  neutral: C.fg3,
  ok: C.ok,
  watch: C.watch,
  critical: C.critical,
};

export const ROLE_COLOR = {
  PRIMARY: C.ok,
  FALLBACK: C.watch,
  OK: '#6b7a85',
  AVOID: C.danger,
  EXCLUDED: '#3d4b57',
};

export const toneColor = (c, tone) =>
  tone === 'critical' ? c.critical : tone === 'danger' ? c.danger : tone === 'warn' ? c.warn
    : tone === 'watch' ? c.sky : tone === 'ok' ? c.brand : c.fg3;

export const scoreTone = (n) => (n >= 85 ? 'ok' : n >= 70 ? 'warn' : 'danger');

/* ---------------------------------------------------------- stylesheet --- */
export function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },

    /* ---- top bar ---- */
    topbar: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      backgroundColor: c.bg1,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
      gap: 12,
    },
    brand: { fontSize: 15, fontWeight: '800', letterSpacing: 1.6, color: c.fg },
    brandAccent: { color: c.brand },
    brandSub: { fontSize: 8, letterSpacing: 1.6, color: c.fg3, fontWeight: '600' },
    title: { fontSize: 15, fontWeight: '700', color: c.fg },
    titleSub: { fontSize: 10, color: c.fg3, marginTop: 1 },

    mark: {
      width: 34, height: 34, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.brand,
    },
    markTxt: { color: c.brandInk, fontWeight: '800', fontSize: 15 },

    navBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    navBtnOn: { backgroundColor: c.bg3, borderColor: c.line2 },
    navTxt: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: c.fg2 },
    navTxtOn: { color: c.fg },

    /* ---- rail ---- */
    rail: {
      width: 66, alignItems: 'center', paddingVertical: 14, gap: 6,
      backgroundColor: c.bg1, borderRightWidth: 1, borderRightColor: c.line,
    },
    railItem: {
      width: 46, height: 44, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    railItemOn: { backgroundColor: c.brandSoft },

    /* ---- chips ---- */
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.line2,
      backgroundColor: c.bg2,
    },
    chipTxt: { fontFamily: MONO, fontSize: 10, color: c.fg2, letterSpacing: 0.5 },
    dot: { width: 7, height: 7, borderRadius: 4 },

    /* ---- tiles ---- */
    tile: {
      backgroundColor: c.bg1,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      padding: 12,
      overflow: 'hidden',
    },
    tileAnchor: { padding: 0, backgroundColor: c.mapVoid },
    tileTitle: {
      fontFamily: MONO,
      fontSize: 9,
      letterSpacing: 1.3,
      color: c.fg3,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    tileBody: { flex: 1, justifyContent: 'center' },
    tileHero: { fontFamily: MONO, fontSize: 30, fontWeight: '700', color: c.fg },
    tileHeroSm: { fontFamily: MONO, fontSize: 21, fontWeight: '700', color: c.fg },
    tileSub: { fontSize: 11, color: c.fg2, marginTop: 5 },
    tileNote: { fontFamily: MONO, fontSize: 9, color: c.fg3, marginTop: 4 },

    /* ---- alert banner ---- */
    alertbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 13,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.line2,
      backgroundColor: c.bg1,
    },
    alertPrio: {
      fontFamily: MONO,
      fontSize: 9,
      letterSpacing: 1,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 5,
      backgroundColor: c.bg3,
      color: c.fg2,
      overflow: 'hidden',
    },
    alertTxt: { fontFamily: MONO, fontSize: 13, fontWeight: '700', color: c.fg, flexShrink: 1 },

    /* ---- generic ---- */
    card: {
      backgroundColor: c.bg1,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      padding: 16,
    },
    panel: {
      backgroundColor: c.bg1,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    h1: { fontSize: 26, fontWeight: '700', color: c.fg, letterSpacing: -0.5 },
    h2: { fontSize: 19, fontWeight: '700', color: c.fg },
    h3: { fontSize: 13.5, fontWeight: '700', letterSpacing: 0.4, color: c.fg, marginBottom: 4 },
    hint: { fontSize: 11.5, color: c.fg3, lineHeight: 17, marginBottom: 12 },
    body: { fontSize: 13, color: c.fg2, lineHeight: 20 },
    eyebrow: { fontFamily: MONO, fontSize: 9, letterSpacing: 1.6, color: c.fg3, textTransform: 'uppercase' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

    btn: {
      backgroundColor: c.bg3,
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    btnTxt: { color: c.fg, fontSize: 13, fontWeight: '600' },
    btnPrimary: { backgroundColor: c.brand, borderColor: c.brand },
    btnPrimaryTxt: { color: c.brandInk, fontWeight: '700' },
    btnDanger: { backgroundColor: c.danger, borderColor: c.danger },
    btnDangerTxt: { color: '#fff', fontWeight: '700' },
    btnGhost: { backgroundColor: 'transparent', borderColor: c.line2 },
    btnLg: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
    btnDisabled: { opacity: 0.42 },

    input: {
      backgroundColor: c.bg2,
      borderWidth: 1,
      borderColor: c.line2,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.fg,
      fontSize: 13,
    },
    label: {
      fontSize: 10,
      letterSpacing: 1,
      color: c.fg3,
      textTransform: 'uppercase',
      marginBottom: 6,
      fontWeight: '600',
    },

    kpi: {
      backgroundColor: c.bg1,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 16,
      padding: 14,
      flexGrow: 1,
      flexBasis: 150,
    },
    kpiK: { fontSize: 9, letterSpacing: 1.2, color: c.fg3, textTransform: 'uppercase', fontWeight: '600' },
    kpiV: { fontFamily: MONO, fontSize: 26, fontWeight: '700', color: c.fg, marginTop: 7 },
    kpiD: { fontSize: 10, color: c.fg3, marginTop: 6 },

    statLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 10 },
    statK: { fontSize: 11.5, color: c.fg3, flexShrink: 1 },
    statV: { fontFamily: MONO, fontSize: 11.5, color: c.fg },

    bar: { height: 7, borderRadius: 999, backgroundColor: c.bg3, overflow: 'hidden' },

    badge: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.9,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: c.bg3,
      color: c.fg2,
      overflow: 'hidden',
    },

    avatar: {
      width: 38, height: 38, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

    th: {
      fontSize: 9,
      letterSpacing: 1.1,
      color: c.fg3,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    td: { fontSize: 12, color: c.fg },
    trBorder: { borderBottomWidth: 1, borderBottomColor: c.line },

    /* ---- onboarding ---- */
    stageBar: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 12 },
    roleCard: {
      flexGrow: 1, flexBasis: 230,
      padding: 18,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.bg1,
    },
    roleIco: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    stepNum: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.line2, backgroundColor: c.bg1,
    },
    rule: { flex: 1, height: 1, backgroundColor: c.line2, marginHorizontal: 12 },

    viewport: {
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: '#05070a',
      borderWidth: 1,
      borderColor: c.line2,
      aspectRatio: 4 / 3,
    },
    vpBadge: {
      position: 'absolute', left: 10, top: 10, zIndex: 3,
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
      backgroundColor: 'rgba(6,10,14,0.72)',
    },
    vpBadgeTxt: { fontFamily: MONO, fontSize: 9.5, color: '#fff', letterSpacing: 1 },

    busRow: {
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.bg1,
      marginBottom: 8,
    },
    busRowOn: { borderColor: c.brand },
    plate: { fontFamily: MONO, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6, color: c.fg },

    lockout: {
      alignItems: 'center',
      padding: 26,
      borderRadius: 16,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    code: {
      fontFamily: MONO, fontSize: 20, letterSpacing: 4, color: c.fg,
      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
      borderWidth: 1, borderColor: c.line3, backgroundColor: c.bg1, marginTop: 14,
      overflow: 'hidden',
    },
  });
}

export const S = makeStyles(C);
export const S_DAY = makeStyles(C_DAY);

export const BADGE_COLOR = {
  Gold: { backgroundColor: 'rgba(255,182,72,0.2)', color: '#ffb648' },
  Silver: { backgroundColor: '#2f3a42', color: '#cfe2ee' },
  Bronze: { backgroundColor: 'rgba(201,139,75,0.22)', color: '#c98b4b' },
  Watch: { backgroundColor: 'rgba(255,96,112,0.18)', color: '#ff6070' },
};

/* Alert-banner tint by priority (§9.2) */
export function alertStyle(priority) {
  if (priority === 0) return { backgroundColor: 'rgba(255,47,94,0.18)', borderColor: C.critical };
  if (priority === 1) return { backgroundColor: 'rgba(255,96,112,0.14)', borderColor: C.danger };
  if (priority === 2) return { backgroundColor: 'rgba(255,182,72,0.12)', borderColor: C.warn };
  if (priority === 3) return { backgroundColor: 'rgba(255,182,72,0.08)', borderColor: 'rgba(255,182,72,0.35)' };
  return {};
}

/* ------------------------------------------------------------- context --- */
const ThemeCtx = createContext({ C, S, mode: 'night', toggle: () => {} });

export function ThemeProvider({ initial = 'night', children }) {
  const [mode, setMode] = useState(initial);
  const value = useMemo(
    () => ({
      mode,
      C: mode === 'day' ? C_DAY : C,
      S: mode === 'day' ? S_DAY : S,
      setMode,
      toggle: () => setMode((m) => (m === 'day' ? 'night' : 'day')),
    }),
    [mode]
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);

/** Force a subtree to the night palette — the cab, always. */
export function NightOnly({ children }) {
  const value = useMemo(() => ({ mode: 'night', C, S, setMode: () => {}, toggle: () => {} }), []);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
