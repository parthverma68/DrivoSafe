/* Alert arbitration — SYSTEM_DESIGN §9.
 *
 * There is exactly one voice channel, one banner slot and one haptic actuator.
 * Five subsystems want them. This module is the only thing allowed to decide
 * who gets them, so that the message which mattered is never the one that got
 * buried under a celebration.
 */

export const P = {
  SAFETY: 0,        // D4 micro-sleep, imminent collision
  IMMINENT: 1,      // severe hazard < 100 m
  DROWSY_HIGH: 2,   // D3
  HAZARD: 3,        // countdown 100-800 m
  LANE: 4,          // lane policy change
  DROWSY_LOW: 5,    // D2
  INFO: 6,          // celebration, amenity, score
};

const MIN_GAP_MS = 2500;
const DEDUPE_MS = 60000;
const BUDGET_WINDOW_MS = 300000;  // 5 min
const BUDGET_MAX = 30;            // = 6 utterances/min averaged (§9.4)

/** Modality routing (§9.3 rule 5). Only P0 may take the full screen. */
export function modalityFor(priority) {
  if (priority === P.SAFETY) return { voice: true, banner: true, haptic: true, fullscreen: true, chime: true };
  if (priority <= P.HAZARD) return { voice: true, banner: true, haptic: priority <= P.DROWSY_HIGH, fullscreen: false, chime: false };
  if (priority === P.LANE) return { voice: true, banner: true, haptic: false, fullscreen: false, chime: false };
  if (priority === P.DROWSY_LOW) return { voice: false, banner: true, haptic: false, fullscreen: false, chime: true };
  return { voice: false, banner: false, haptic: false, fullscreen: false, chime: false };
}

export function createAlertArbiter(cfg) {
  cfg = cfg || {};
  const speak = cfg.speak || (() => {});
  const chime = cfg.chime || (() => {});
  const haptic = cfg.haptic || (() => {});
  const onChange = cfg.onChange || (() => {});

  let queue = [];
  let current = null;       // { alert, until }
  let lastSpokeAt = -1e9;
  const spokenAt = new Map();  // dedupeKey -> ts
  const budget = [];           // timestamps of spoken utterances
  let suppression = { drowsyLevel: 'D0', hazardActive: false };
  let dropped = 0;

  function post(alert) {
    const a = Object.assign(
      { id: 'a-' + Math.random().toString(36).slice(2), priority: P.INFO, ttlMs: 15000 },
      alert
    );
    a.postedAt = a.postedAt == null ? Date.now() : a.postedAt;
    a.dedupeKey = a.dedupeKey || a.text;
    a.modality = a.modality || modalityFor(a.priority);

    // rule 4: positive/informational is fully suppressed while the driver is
    // drowsy or a P1 hazard is live. Congratulating someone who is falling
    // asleep is worse than saying nothing.
    if (a.priority >= P.INFO && (isDrowsy() || suppression.hazardActive)) {
      dropped++;
      return null;
    }
    queue.push(a);
    return a.id;
  }

  const isDrowsy = () =>
    suppression.drowsyLevel === 'D2' ||
    suppression.drowsyLevel === 'D3' ||
    suppression.drowsyLevel === 'D4';

  function setSuppression(s) {
    suppression = Object.assign({}, suppression, s);
  }

  function withinBudget(now) {
    while (budget.length && now - budget[0] > BUDGET_WINDOW_MS) budget.shift();
    return budget.length < BUDGET_MAX;
  }

  function tick(now) {
    now = now == null ? Date.now() : now;

    // expire — an alert that aged out unspoken was dropped, and is counted as
    // such: silent discards are exactly what a silence budget must not hide
    const kept = queue.filter((a) => now - a.postedAt <= a.ttlMs);
    dropped += queue.length - kept.length;
    queue = kept;
    if (current && now >= current.until) {
      current = null;
      onChange(null);
    }

    if (!queue.length) return current ? current.alert : null;
    queue.sort((a, b) => a.priority - b.priority || a.postedAt - b.postedAt);
    const next = queue[0];

    // rule 1: P0/P1 pre-empt immediately, cutting the current utterance off
    // mid-word. Everything else waits for the current one to finish.
    const preempts = next.priority <= P.IMMINENT;
    if (current && !preempts && next.priority >= current.alert.priority) {
      return current.alert;
    }
    if (current && !preempts && now - lastSpokeAt < MIN_GAP_MS) {
      return current.alert;
    }
    // rule 2: minimum inter-utterance gap — continuous speech is not information
    if (!preempts && now - lastSpokeAt < MIN_GAP_MS) return current ? current.alert : null;

    // rule 3: dedupe by message identity. Hazard countdowns opt out via
    // `exemptDedupe` because the changing distance IS the information.
    const last = spokenAt.get(next.dedupeKey);
    if (!next.exemptDedupe && last != null && now - last < DEDUPE_MS) {
      queue.shift();
      return current ? current.alert : null;
    }

    // §9.4 silence budget: over budget, drop P4-P6 rather than delay them
    if (!withinBudget(now) && next.priority >= P.LANE) {
      queue.shift();
      dropped++;
      return current ? current.alert : null;
    }

    queue.shift();
    const m = next.modality;
    if (m.voice) { speak(next.text, next.priority); lastSpokeAt = now; budget.push(now); }
    if (m.chime) chime(next.priority);
    if (m.haptic) haptic(next.priority);
    spokenAt.set(next.dedupeKey, now);

    current = { alert: next, until: now + (next.holdMs || 4000) };
    onChange(next);
    return next;
  }

  return {
    post, tick, setSuppression,
    current: () => (current ? current.alert : null),
    stats: () => ({ queued: queue.length, dropped, spokenLast5min: budget.length }),
    clear: () => { queue = []; current = null; onChange(null); },
  };
}
