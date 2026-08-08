/* Design tokens — the RN mirror of app/src/styles/app.css.
 *
 * Driver-facing surfaces are tuned for glance time (SYSTEM_DESIGN §15.3):
 * large glyphs, high contrast, and tone carried by colour AND label so it
 * survives glare, dimming and colour-vision differences.
 */
import { Platform, StyleSheet } from 'react-native';

export const C = {
  bg: '#080b0f',
  bg1: '#0d1218',
  bg2: '#131a22',
  bg3: '#1a232d',
  line: '#24303c',
  line2: '#33424f',

  fg: '#e8f0f6',
  fg2: '#93a6b6',
  fg3: '#5f7385',

  ok: '#46e6aa',
  watch: '#8fd6ff',
  warn: '#ffbe50',
  danger: '#ff5c60',
  critical: '#ff2f5e',
  accent: '#46e6aa',
};

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

export const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  /* ---- top bar ---- */
  topbar: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: C.bg1,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    gap: 12,
  },
  brand: { fontSize: 15, fontWeight: '800', letterSpacing: 1.6, color: C.fg },
  brandAccent: { color: C.accent },
  brandSub: { fontSize: 8, letterSpacing: 1.6, color: C.fg3, fontWeight: '600' },

  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navBtnOn: { backgroundColor: C.bg3, borderColor: C.line2 },
  navTxt: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, color: C.fg2 },
  navTxtOn: { color: C.fg },

  /* ---- chips ---- */
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line2,
  },
  chipTxt: { fontFamily: MONO, fontSize: 10, color: C.fg2, letterSpacing: 0.5 },

  /* ---- tiles ---- */
  tile: {
    backgroundColor: C.bg1,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 10,
    overflow: 'hidden',
  },
  tileAnchor: { padding: 0, backgroundColor: '#0a0e13' },
  tileTitle: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1.3,
    color: C.fg3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  tileBody: { flex: 1, justifyContent: 'center' },
  tileHero: { fontFamily: MONO, fontSize: 30, fontWeight: '700', color: C.fg },
  tileHeroSm: { fontFamily: MONO, fontSize: 21, fontWeight: '700', color: C.fg },
  tileSub: { fontSize: 11, color: C.fg2, marginTop: 5 },
  tileNote: { fontFamily: MONO, fontSize: 9, color: C.fg3, marginTop: 4 },

  /* ---- alert banner ---- */
  alertbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.bg2,
  },
  alertPrio: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: C.line,
    color: C.fg2,
    overflow: 'hidden',
  },
  alertTxt: { fontFamily: MONO, fontSize: 13, fontWeight: '700', color: C.fg, flexShrink: 1 },

  /* ---- generic ---- */
  panel: {
    backgroundColor: C.bg1,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  h3: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, color: C.fg, marginBottom: 4 },
  hint: { fontSize: 11, color: C.fg3, lineHeight: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },

  btn: {
    backgroundColor: C.bg3,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  btnTxt: { color: C.fg, fontSize: 12, fontWeight: '600' },
  btnPrimary: { backgroundColor: C.accent, borderColor: C.accent },
  btnPrimaryTxt: { color: '#04120c', fontWeight: '700' },
  btnDanger: { backgroundColor: C.danger, borderColor: C.danger },

  input: {
    backgroundColor: C.bg1,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: C.fg,
    fontSize: 13,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    color: C.fg3,
    textTransform: 'uppercase',
    marginBottom: 5,
  },

  kpi: {
    backgroundColor: C.bg1,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 13,
    flexGrow: 1,
    flexBasis: 150,
  },
  kpiK: { fontSize: 9, letterSpacing: 1.1, color: C.fg3, textTransform: 'uppercase' },
  kpiV: { fontFamily: MONO, fontSize: 26, fontWeight: '700', color: C.fg, marginTop: 5 },
  kpiD: { fontSize: 10, color: C.fg3, marginTop: 5 },

  statLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  statK: { fontSize: 11, color: C.fg3, flexShrink: 1 },
  statV: { fontFamily: MONO, fontSize: 11, color: C.fg },

  bar: { height: 7, borderRadius: 4, backgroundColor: C.bg3, overflow: 'hidden' },

  badge: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: C.line,
    color: C.fg2,
    overflow: 'hidden',
  },

  th: {
    fontSize: 9,
    letterSpacing: 1.1,
    color: C.fg3,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  td: { fontSize: 12, color: C.fg },
  trBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
});

export const BADGE_COLOR = {
  Gold: { backgroundColor: '#4a3c12', color: '#ffd66b' },
  Silver: { backgroundColor: '#2f3a42', color: '#cfe2ee' },
  Bronze: { backgroundColor: '#402f22', color: '#e0a878' },
  Watch: { backgroundColor: '#4a1e22', color: '#ff9b9e' },
};

/* Alert-banner tint by priority (§9.2) */
export function alertStyle(priority) {
  if (priority === 0) return { backgroundColor: 'rgba(255,47,94,0.18)', borderColor: C.critical };
  if (priority === 1) return { backgroundColor: 'rgba(255,92,96,0.14)', borderColor: C.danger };
  if (priority === 2) return { backgroundColor: 'rgba(255,190,80,0.12)', borderColor: C.warn };
  if (priority === 3) return { backgroundColor: 'rgba(255,190,80,0.08)', borderColor: 'rgba(255,190,80,0.35)' };
  return {};
}
