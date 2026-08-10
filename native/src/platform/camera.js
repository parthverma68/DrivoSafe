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
import { Platform, PermissionsAndroid } from 'react-native';

let VisionCamera = null;
try {
  // eslint-disable-next-line global-require
  VisionCamera = require('react-native-vision-camera');
} catch {
  VisionCamera = null;               // JS-only bundle, or the pods aren't built
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
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (res !== PermissionsAndroid.RESULTS.GRANTED) return 'denied';
    }
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

/** What the UI needs to describe the camera situation without guessing. */
export function cameraStatus(device, permission) {
  if (!VisionCamera) return { ok: false, reason: 'no-module', label: 'SIMULATED' };
  if (permission !== 'granted') return { ok: false, reason: 'denied', label: 'PERMISSION NEEDED' };
  if (!device) return { ok: false, reason: 'no-device', label: 'NO CAMERA' };
  return { ok: true, reason: null, label: 'LIVE' };
}
