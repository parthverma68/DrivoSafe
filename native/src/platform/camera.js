/* Camera adapter — REACT NATIVE.
 *
 * Wraps `react-native-vision-camera` behind the seam every other host API in
 * this build sits behind (SYSTEM_DESIGN §3.1). Two cameras, two jobs:
 *
 *   FRONT  driver identity at the pre-drive gate, then fatigue-evidence clips
 *          for the rest of the shift.
 *   BACK   continuous road capture from the moment the shift starts.
 *
 * Two things this file deliberately does not do:
 *
 * 1. **It does not run a model.** No face embedding, no pothole segmentation.
 *    Those are `verifyFace()`'s and the road pipeline's job, and neither exists
 *    on device yet. This produces frames and files; `shared/src/recording.js`
 *    produces the labelled queue a model will later be pointed at.
 * 2. **It does not hard-require the native module.** VisionCamera needs a
 *    native build, and Metro must still bundle for a JS-only review, a
 *    simulator without camera permissions, or the web build's sibling. So the
 *    import is guarded and `available()` tells callers which world they are in
 *    — every screen already renders a synthetic feed when there is no camera,
 *    because a missing camera is a reported condition, not a crash.
 */
import { Platform, PermissionsAndroid, NativeModules } from 'react-native';

let VisionCamera = null;
let moduleError = null;
try {
  // eslint-disable-next-line global-require
  VisionCamera = require('react-native-vision-camera');
} catch (e) {
  /* VisionCamera's own entry throws `system/camera-module-not-found` when
   * NativeModules.CameraView is absent — i.e. the JS is bundled but the native
   * side is not in the installed binary. That is by far the most common cause,
   * and it has exactly one fix: rebuild the app (`npm run android`, or
   * `pod install && npm run ios`). Restarting Metro cannot help, because
   * autolinking runs at Gradle/CocoaPods time, not at bundle time.
   *
   * The error is kept rather than swallowed: a silent fallback to a synthetic
   * feed is correct behaviour but terrible diagnostics, and "why is my camera
   * simulated" should be answerable from the screen. */
  VisionCamera = null;
  moduleError = e && e.message ? e.message : String(e);
  if (__DEV__) {
    console.warn(
      '[DrivoSafe] Camera falling back to the synthetic feed: the native ' +
      'VisionCamera module is not in this build. Rebuild the app — ' +
      '`npm run android` (Android) or `cd ios && pod install && npm run ios`. ' +
      'A Metro reload will not pick it up.\n  ' + moduleError
    );
  }
}

/** Why the native module is unavailable, if it is. Null when it loaded. */
export const moduleFailure = () => moduleError;

/**
 * Everything needed to answer "why is there no camera" from the device itself.
 *
 * A release build has no `__DEV__` console and usually no attached debugger, so
 * a warning that only fires in development is a warning nobody on a real phone
 * will ever read. This is rendered on screen instead.
 */
export function diagnostics() {
  return {
    platform: `${Platform.OS} ${Platform.Version}`,
    jsBundled: true,                                   // this file imported at all
    nativeModule: !!NativeModules.CameraView,          // the autolinked native side
    libraryLoaded: !!VisionCamera,
    error: moduleError,
  };
}

export const Camera = VisionCamera ? VisionCamera.Camera : null;
export const useCameraDevice = VisionCamera ? VisionCamera.useCameraDevice : () => null;
export const useCameraPermission = VisionCamera ? VisionCamera.useCameraPermission : null;

/** Is the native module present at all? */
export const available = () => !!VisionCamera;

/**
 * Ask for camera permission.
 *
 * On the in-cab unit this is granted at provisioning by the MDM and never
 * prompts; the runtime request is for the phone builds and for a tablet being
 * set up by hand.
 */
export async function requestPermission() {
  if (!VisionCamera) return 'unavailable';
  try {
    if (Platform.OS === 'android') {
      /* Ask what we already have before prompting. Several Android skins —
       * Vivo's Funtouch and Xiaomi's MIUI among them — apply their own
       * permission policy on top of the platform's, and a grant made in system
       * settings is invisible unless it is re-read. Prompting blind also burns
       * the one "don't ask again" a user gets. */
      const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (!already) {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (res !== PermissionsAndroid.RESULTS.GRANTED) {
          return res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
        }
      }
      return 'granted';
    }
    const current = VisionCamera.Camera.getCameraPermissionStatus();
    if (current === 'granted') return 'granted';
    const status = await VisionCamera.Camera.requestCameraPermission();
    return status === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function permissionStatus() {
  if (!VisionCamera) return 'unavailable';
  try {
    return VisionCamera.Camera.getCameraPermissionStatus();
  } catch {
    return 'unavailable';
  }
}

/* ---------------------------------------------------------- identity ----- */
/**
 * Take the burst the face matcher needs.
 *
 * Returns the shape `makeCapture()` expects, so the caller hands the result
 * straight to `verifyFace()` without knowing a camera was involved. `template`
 * is null here: extracting an embedding is the model's job and the model is not
 * built, so this reports an honest "no template" rather than inventing one, and
 * the gate falls through to its registration path.
 */
export async function captureFace(cameraRef, { frames = 8 } = {}) {
  if (!cameraRef || !cameraRef.current) {
    return { template: null, quality: 0, frames: 0, at: Date.now(), source: 'unavailable' };
  }
  const shots = [];
  for (let i = 0; i < frames; i++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const photo = await cameraRef.current.takePhoto({ flash: 'off', enableShutterSound: false });
      shots.push(photo);
    } catch {
      break;
    }
  }
  return {
    template: null,             // ← the embedding model is not implemented
    quality: shots.length ? 0.9 : 0,
    frames: shots.length,
    at: Date.now(),
    source: 'vision-camera',
    /* Paths stay local. §16.4: frames never leave the device, and nothing
     * uploads them — they exist only long enough to be embedded, once there is
     * something to embed them with. */
    paths: shots.map((p) => p.path),
  };
}

/* --------------------------------------------------------- recording ----- */
/**
 * Segment recorder. `shared/src/recording.js` decides *when* a segment ends and
 * what metadata rides on it; this only starts and stops the hardware, so the
 * two builds share every rule about clip length, buffering and eviction.
 */
export function createVideoRecorder(cameraRef, { onFile } = {}) {
  let active = false;

  return {
    get active() { return active; },

    start() {
      if (!cameraRef || !cameraRef.current || active) return false;
      try {
        cameraRef.current.startRecording({
          fileType: 'mp4',
          videoCodec: 'h265',        // half the bytes of h264 for the same road
          onRecordingFinished: (video) => {
            active = false;
            if (onFile) onFile({ path: video.path, durationS: video.duration, bytes: video.size });
          },
          onRecordingError: () => { active = false; },
        });
        active = true;
        return true;
      } catch {
        active = false;
        return false;
      }
    },

    async stop() {
      if (!cameraRef || !cameraRef.current || !active) return false;
      try {
        await cameraRef.current.stopRecording();
        return true;
      } catch {
        active = false;
        return false;
      }
    },
  };
}

/**
 * What the UI needs to describe the camera situation without guessing.
 *
 * Each state names its own fix. "Simulated" on its own is the least useful
 * thing this could say, because all three failure modes look identical on
 * screen and only one of them is something the user can do anything about.
 */
export function cameraStatus(device, permission) {
  if (!VisionCamera) {
    return {
      ok: false,
      reason: 'no-module',
      label: 'NATIVE MODULE MISSING',
      hint: 'The camera library is in the JS bundle but not in this build. Rebuild the app — '
        + (Platform.OS === 'ios'
          ? 'cd ios && pod install, then npm run ios.'
          : 'npm run android.')
        + ' Reloading Metro will not pick it up: autolinking runs at build time.',
      fixable: false,
    };
  }
  if (permission === 'blocked') {
    return {
      ok: false,
      reason: 'blocked',
      label: 'PERMISSION BLOCKED',
      hint: 'Camera access was permanently denied, so the app can no longer ask. Grant it in '
        + 'Settings → Apps → DrivoSafe → Permissions → Camera, then reopen this step.',
      fixable: false,
    };
  }
  if (permission === 'denied') {
    return {
      ok: false,
      reason: 'denied',
      label: 'PERMISSION NEEDED',
      hint: 'Camera access has not been granted. On the in-cab unit this is granted at '
        + 'provisioning by the MDM; on a hand-set-up device, grant it here.',
      fixable: true,
    };
  }
  if (permission !== 'granted') {
    /* Not silent: a permission dialog that never resolves — which some Android
     * skins produce when the app is backgrounded mid-prompt — would otherwise
     * look identical to a camera that is merely slow to start. */
    return {
      ok: false,
      reason: 'pending',
      label: 'REQUESTING ACCESS',
      hint: 'Waiting for the camera permission dialog. If no dialog appeared, grant camera '
        + 'access in Settings → Apps → DrivoSafe → Permissions.',
      fixable: true,
    };
  }
  if (!device) {
    return {
      ok: false,
      reason: 'no-device',
      label: 'NO CAMERA ON THIS DEVICE',
      hint: 'No camera was reported for this facing. An emulator needs a webcam configured '
        + 'in its AVD settings before it will report one.',
      fixable: false,
    };
  }
  return { ok: true, reason: null, label: 'LIVE', hint: null, fixable: false };
}
