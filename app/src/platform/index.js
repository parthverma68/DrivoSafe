/* Platform adapters — SYSTEM_DESIGN §3.1.
 *
 * The seam between shared domain logic and the host platform. These are the
 * WEB implementations; `native/src/platform/index.js` is the sibling with the
 * same signatures (expo-speech, expo-av, expo-haptics, expo-location,
 * AsyncStorage). @drivosafe/shared crosses between them untouched.
 */

/* ---- storage: RN sibling is AsyncStorage --------------------------------- */
const NS = 'drivosafe:';

export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(NS + key); } catch { /* quota / private mode */ }
  },
};

/* ---- speech: RN sibling is expo-speech ----------------------------------
 * Voice is the primary driver channel (§9.3 rule 6); the screen is secondary.
 * Production ships Hindi and regional voices — `lang` is set per fleet config.
 */
let voiceEnabled = true;
let lang = 'en-IN';

export const speech = {
  setEnabled(v) { voiceEnabled = v; if (!v) this.cancel(); },
  isEnabled: () => voiceEnabled,
  setLang(l) { lang = l; },
  speak(text, priority) {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    // P0/P1 pre-empt mid-word (§9.3 rule 1)
    if (priority != null && priority <= 1) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = priority != null && priority <= 1 ? 1.15 : 1.0;
    u.pitch = 1;
    try { window.speechSynthesis.speak(u); } catch { /* no voices installed */ }
  },
  cancel() {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  },
};

/* ---- audible alerts: RN sibling is expo-av ------------------------------- */
let audioCtx = null;

export function chime(priority) {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const critical = priority === 0;
  const now = audioCtx.currentTime;
  const beeps = critical ? 4 : 2;
  for (let i = 0; i < beeps; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = critical ? 'square' : 'sine';
    osc.frequency.value = critical ? 880 : 620;
    gain.gain.setValueAtTime(0, now + i * 0.22);
    gain.gain.linearRampToValueAtTime(critical ? 0.22 : 0.09, now + i * 0.22 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.22 + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + i * 0.22);
    osc.stop(now + i * 0.22 + 0.2);
  }
}

/* ---- haptics: RN sibling is expo-haptics --------------------------------- */
export function haptic(priority) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  navigator.vibrate(priority === 0 ? [220, 90, 220, 90, 220] : [140, 70, 140]);
}

/* ---- geolocation: RN sibling is expo-location ---------------------------
 * Feeds createGpsTracker (§7.2). The simulator path exists so the app is
 * demonstrable indoors; the real path is identical downstream.
 */
export function watchPosition(onFix, onError) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError && onError(new Error('geolocation unavailable'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy,
      speed: p.coords.speed,
      timestamp: p.timestamp,
    }),
    onError,
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

/* ---- drive-loop output bundle -------------------------------------------
 * The exact surface `useDriveLoop` needs from a host platform. The native
 * adapter exports an identically-shaped `driveIO`, which is what lets the
 * drive loop itself live in @drivosafe/shared instead of being written twice.
 */
export const driveIO = {
  speak: (text, priority) => speech.speak(text, priority),
  chime,
  haptic,
};
