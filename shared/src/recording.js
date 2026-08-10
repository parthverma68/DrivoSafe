/* Camera recording — the two cameras that run once a shift starts.
 *
 *   REAR / road-facing    continuous segmented capture of the road surface.
 *                         This is how a corridor gets re-scanned without a
 *                         survey crew: every bus on the route is a mapper.
 *   FRONT / driver-facing event-triggered capture around fatigue signals.
 *
 * **No inference happens here, and none happens on the device yet.** The AI —
 * pothole/crack segmentation on the rear feed, and the ocular pipeline behind
 * the DMS on the front feed — is not implemented. What this module does is the
 * part that has to be right first: capture the evidence, label it with where
 * and when and under what conditions, keep it bounded, and hand it to the sync
 * agent. A model can be pointed at a labelled clip queue later; it cannot be
 * pointed at footage that was never kept, or kept without its chainage.
 *
 * The privacy line from §8.8 is unchanged and is why the two feeds are
 * different shapes. Rear clips are of a public road and are uploaded routinely.
 * Front clips are of a person: they are only cut when an event justifies one,
 * they are retention-bounded, and every retrieval is audited. Neither camera's
 * frames are ever passed to the drowsiness engine — that boundary is a module
 * boundary and stays that way.
 */

export const CAMERAS = {
  rear: {
    id: 'rear',
    label: 'Road scan',
    facing: 'back',
    purpose: 'Surface condition and event detection along the corridor',
    mode: 'continuous',
    segmentSec: 30,
    resolution: '1920x1080',
    fps: 30,
    startsOn: 'shift-start',
    retentionH: 72,
    uploads: 'on wifi at the depot',
  },
  front: {
    id: 'front',
    label: 'Driver monitor',
    facing: 'front',
    purpose: 'Fatigue evidence around a DMS event',
    mode: 'event',
    preRollSec: 8,
    postRollSec: 4,
    resolution: '1280x720',
    fps: 15,
    startsOn: 'shift-start',
    retentionH: 720,        // 30 days, §12.4
    uploads: 'on request, audited',
  },
};

/** Nothing is analysed yet — this is what the queue is *for*. */
export const ANALYSIS_STATE = 'pending-model';

const round = (v, p = 0) => { const m = Math.pow(10, p); return Math.round(v * m) / m; };

/**
 * A clip recorder for one camera.
 *
 * Pure and clock-injected like everything else in shared/: the host owns the
 * actual camera and calls `tick` from the drive loop. On the tablet the segment
 * boundaries returned here are what drive the native recorder's start/stop; in
 * the browser build there is no camera and the same records are produced from
 * the simulated drive, which is enough to build and review the queue against.
 */
export function createClipRecorder(cameraId, options = {}) {
  const camera = { ...CAMERAS[cameraId], ...options.camera };
  const maxClips = options.maxClips || 40;      // ring buffer — storage is finite
  const onClip = options.onClip || (() => {});

  let recording = false;
  let startedAt = 0;
  let segmentStart = 0;
  let clips = [];
  let dropped = 0;
  let seq = 0;

  const push = (clip) => {
    clips = clips.concat(clip);
    if (clips.length > maxClips) {
      /* Oldest first, but never an unuploaded event clip: those are the ones
       * somebody asked for. */
      const idx = clips.findIndex((c) => c.upload !== 'queued' || c.kind !== 'event');
      clips.splice(idx === -1 ? 0 : idx, 1);
      dropped += 1;
    }
    onClip(clip);
    return clip;
  };

  const snapshot = () => ({
    cameraId,
    camera,
    recording,
    startedAt,
    clips: clips.slice(),
    clipCount: clips.length,
    dropped,
    pendingAnalysis: clips.filter((c) => c.analysis === ANALYSIS_STATE).length,
    queuedBytes: clips.reduce((a, c) => a + c.bytes, 0),
    uptimeS: recording ? 0 : 0,
  });

  return {
    camera,
    state: snapshot,

    start(now) {
      if (recording) return snapshot();
      recording = true;
      startedAt = now;
      segmentStart = now;
      return snapshot();
    },

    stop(now) {
      if (!recording) return snapshot();
      if (camera.mode === 'continuous' && now - segmentStart > 2000) {
        push(makeClip({ camera, kind: 'segment', from: segmentStart, to: now, seq: seq++ }));
      }
      recording = false;
      return snapshot();
    },

    /**
     * Advance. For a continuous camera this closes a segment every
     * `segmentSec`; for an event camera it does nothing until `mark()` is
     * called. `context` is the drive state at this instant — chainage, lane,
     * speed, light — and is what makes a clip trainable later.
     */
    tick(now, context = {}) {
      if (!recording) return snapshot();
      if (camera.mode === 'continuous' && now - segmentStart >= camera.segmentSec * 1000) {
        push(makeClip({ camera, kind: 'segment', from: segmentStart, to: now, context, seq: seq++ }));
        segmentStart = now;
      }
      const s = snapshot();
      s.uptimeS = Math.round((now - startedAt) / 1000);
      s.segmentProgress = camera.mode === 'continuous'
        ? Math.min(1, (now - segmentStart) / (camera.segmentSec * 1000))
        : 0;
      return s;
    },

    /**
     * Cut an event clip — a fatigue level change, a harsh event, a hazard the
     * driver ignored. The pre-roll is why the camera has to already be running:
     * the interesting eight seconds are the ones before anything fired.
     */
    mark(now, { reason, severity = null, context = {} } = {}) {
      if (!recording) return snapshot();
      const pre = (camera.preRollSec || 6) * 1000;
      const post = (camera.postRollSec || 3) * 1000;
      push(makeClip({
        camera, kind: 'event', reason, severity,
        from: now - pre, to: now + post, context, seq: seq++,
      }));
      return snapshot();
    },

    /** Mark clips as sent once the sync agent has drained them. */
    markUploaded(ids) {
      const set = new Set(ids);
      clips = clips.map((c) => (set.has(c.id) ? { ...c, upload: 'sent' } : c));
      return snapshot();
    },

    clear() {
      clips = [];
      dropped = 0;
      return snapshot();
    },
  };
}

function makeClip({ camera, kind, reason = null, severity = null, from, to, context = {}, seq }) {
  const durationS = Math.max(0.5, (to - from) / 1000);
  /* ~1.1 MB per second at 1080p30, ~0.35 at 720p15 — close enough to size a
   * queue and a nightly upload window against. */
  const rate = camera.resolution === '1920x1080' ? 1.1 : 0.35;
  return {
    id: `${camera.id}-${Math.floor(from / 1000).toString(36)}-${seq}`,
    cameraId: camera.id,
    facing: camera.facing,
    kind,
    reason,
    severity,
    from,
    to,
    durationS: round(durationS, 1),
    bytes: Math.round(durationS * rate * 1024 * 1024),
    /* Where the vehicle was — a rear clip with no chainage cannot be matched to
     * a corridor segment, which makes it useless as training data. */
    context: {
      chainageM: context.chainageM != null ? Math.round(context.chainageM) : null,
      lat: context.lat != null ? round(context.lat, 5) : null,
      lng: context.lng != null ? round(context.lng, 5) : null,
      lane: context.lane != null ? context.lane : null,
      speedKph: context.speedKph != null ? Math.round(context.speedKph) : null,
      routeId: context.routeId || null,
      driverId: context.driverId || null,
      busId: context.busId || null,
      light: context.light || null,
      dmsLevel: context.dmsLevel || null,
    },
    analysis: ANALYSIS_STATE,
    upload: 'queued',
  };
}

/**
 * Both cameras as one unit, which is how the drive screen uses them: they start
 * together at shift start, stop together at shift end, and the front one cuts a
 * clip whenever the DMS level worsens.
 */
export function createShiftRecorders(options = {}) {
  const rear = createClipRecorder('rear', options.rear);
  const front = createClipRecorder('front', options.front);
  let lastLevel = 'D0';

  return {
    rear,
    front,
    start(now) { rear.start(now); front.start(now); },
    stop(now) { rear.stop(now); front.stop(now); },

    /** Drive-loop tick. Returns both snapshots; cuts a driver clip on a rise. */
    tick(now, context = {}) {
      const r = rear.tick(now, context);
      let f = front.tick(now, context);
      const level = context.dmsLevel || 'D0';
      if (rank(level) > rank(lastLevel) && rank(level) >= rank('D2')) {
        f = front.mark(now, { reason: `dms-${level}`, severity: rank(level) / 4, context });
      }
      lastLevel = level;
      return { rear: r, front: f };
    },

    state() {
      const r = rear.state();
      const f = front.state();
      return {
        rear: r,
        front: f,
        recording: r.recording || f.recording,
        clips: r.clipCount + f.clipCount,
        pendingAnalysis: r.pendingAnalysis + f.pendingAnalysis,
        queuedMb: round((r.queuedBytes + f.queuedBytes) / (1024 * 1024), 1),
      };
    },
  };
}

const rank = (level) => ['D0', 'D1', 'D2', 'D3', 'D4'].indexOf(level);
