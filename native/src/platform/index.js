/* Platform adapters — REACT NATIVE. SYSTEM_DESIGN §3.1.
 *
 * The sibling of `app/src/platform/index.js`, exporting the same names with
 * the same signatures. Everything in @drivosafe/shared — including the drive
 * loop itself — is written against this surface and never against either host,
 * which is what lets the domain cross platforms unmodified.
 *
 * Optional native modules are loaded through `optional()` rather than a bare
 * import. A tablet missing the TTS module must degrade to a silent screen, not
 * fail to boot: voice is the primary channel, but a crashed app has no
 * channels at all.
 */
import { Vibration, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';

function optional(load) {
  try {
    return load();
  } catch (e) {
    return null;
  }
}

const Tts = optional(() => require('react-native-tts').default || require('react-native-tts'));

/* ---- storage -------------------------------------------------------------
 * AsyncStorage is async where the web's localStorage is sync, so the adapter
 * keeps a hydrated in-memory mirror: callers get the same synchronous `get`,
 * and writes fire-and-forget to disk. `hydrate()` runs once at boot.
 */
const NS = 'drivosafe:';
let mirror = {};
let hydrated = false;

export const storage = {
  async hydrate() {
    if (hydrated) return;
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(NS));
      const pairs = await AsyncStorage.multiGet(keys);
      for (const [k, v] of pairs) {
        try { mirror[k.slice(NS.length)] = JSON.parse(v); } catch { /* skip corrupt */ }
      }
    } catch { /* first run, or storage unavailable */ }
    hydrated = true;
  },
  get(key, fallback) {
    return key in mirror ? mirror[key] : fallback;
  },
  set(key, value) {
    mirror[key] = value;
    AsyncStorage.setItem(NS + key, JSON.stringify(value)).catch(() => {});
    return true;
  },
  remove(key) {
    delete mirror[key];
    AsyncStorage.removeItem(NS + key).catch(() => {});
  },
};

/* ---- speech --------------------------------------------------------------
 * Production ships Hindi and regional voices; `lang` comes from fleet config.
 */
let voiceEnabled = true;
let lang = 'en-IN';
let ttsReady = false;

if (Tts) {
  Tts.getInitStatus?.()
    .then(() => {
      ttsReady = true;
      Tts.setDefaultLanguage?.(lang);
      Tts.setDucking?.(true);          // duck the cabin radio rather than fight it
    })
    .catch(() => { ttsReady = false; });
}

export const speech = {
  setEnabled(v) { voiceEnabled = v; if (!v) this.cancel(); },
  isEnabled: () => voiceEnabled,
  setLang(l) {
    lang = l;
    if (Tts && ttsReady) Tts.setDefaultLanguage?.(l);
  },
  speak(text, priority) {
    if (!voiceEnabled || !Tts || !ttsReady) return;
    // P0/P1 pre-empt mid-word (§9.3 rule 1)
    if (priority != null && priority <= 1) Tts.stop?.();
    Tts.setDefaultRate?.(priority != null && priority <= 1 ? 0.58 : 0.5, true);
    Tts.speak(text);
  },
  cancel() {
    if (Tts && ttsReady) Tts.stop?.();
  },
};

/* ---- audible alerts ------------------------------------------------------
 * Bare RN has no tone generator, and shipping an audio library for two beeps
 * is not worth the native-linking cost. The vibration motor carries the alert
 * envelope instead — on a dash-mounted unit the driver feels the mount, and
 * the P0 pattern is deliberately distinct from every other cue.
 */
export function chime(priority) {
  const critical = priority === 0;
  Vibration.vibrate(
    critical ? [0, 260, 110, 260, 110, 260] : [0, 90, 70, 90],
    false
  );
}

/* ---- haptics ------------------------------------------------------------- */
export function haptic(priority) {
  Vibration.vibrate(priority === 0 ? [0, 220, 90, 220, 90, 220] : [0, 140, 70, 140], false);
}

/* ---- geolocation ---------------------------------------------------------
 * Feeds createGpsTracker (§7.2). Identical fix shape to the web adapter, so
 * the tracker sees no difference between platforms.
 */
Geolocation.setRNConfiguration?.({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
  locationProvider: 'auto',
});

export function watchPosition(onFix, onError) {
  const id = Geolocation.watchPosition(
    (p) => onFix({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy,
      speed: p.coords.speed,
      timestamp: p.timestamp,
    }),
    onError,
    { enableHighAccuracy: true, distanceFilter: 0, interval: 500, fastestInterval: 250 }
  );
  return () => Geolocation.clearWatch(id);
}

/* ---- drive-loop output bundle -------------------------------------------
 * Same shape as the web adapter's `driveIO`. This is the entire platform
 * surface the shared drive loop depends on.
 */
export const driveIO = {
  speak: (text, priority) => speech.speak(text, priority),
  chime,
  haptic,
};

export const platformName = Platform.OS;
