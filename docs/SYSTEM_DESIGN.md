# DrivoSafe — System Design Document

**Product** DrivoSafe · **Domain** drivosafe.com
**Document type** System architecture & design specification
**Status** Baseline v1.0 — build-ready
**Audience** Engineering, product, fleet-operations, and the vendors integrating the in-cab kit

---

## 0. How to read this document

This is the architecture of record. It defines **what the system is made of, where each
responsibility lives, what crosses each boundary, and what the system guarantees**. It is
deliberately implementation-specific where a decision has been made (and says so), and
deliberately silent on visual design, which is owned by the design track.

The upstream input is the *RoadIntel Application Specification*, which defined the
route-intelligence platform in the abstract. DrivoSafe is the productisation of that
specification for one concrete deployment: **an Android tablet mounted in a passenger bus
cab**, plus the web consoles that feed and monitor it. Where this document and the RoadIntel
spec disagree, this document wins for DrivoSafe.

Three things are new here and not in the upstream spec, and they carry the most design
weight:

1. **Driver Monitoring / drowsiness detection** (§8) — a second sensing subsystem, driver-facing
   rather than road-facing, with its own privacy regime.
2. **Alert arbitration** (§9) — once drowsiness, hazards, lane policy, and score feedback all
   want the driver's attention, *who speaks* becomes a first-class architectural concern.
3. **The bus context** — a scheduled vehicle, a rostered driver, a depot, a shift. This changes
   session model, break enforcement, and what "off-route" means.

| Section | Contents |
|---|---|
| §1–§3 | Product framing, actors, surfaces |
| §4–§5 | Target hardware, system architecture |
| §6–§11 | The seven subsystems |
| §12 | Data model |
| §13 | Screens |
| §14 | Cloud APIs & sync protocol |
| §15–§19 | Non-functional requirements, security, deployment, observability, risk |
| §20–§22 | Build order, library API map, glossary |

---

## 1. Product definition

**One line.** DrivoSafe is an in-cab road-intelligence assistant for bus fleets: a mounted
tablet that knows the road ahead kilometre-by-kilometre from a pre-scanned digital road model,
tells the driver which lane to hold and what speed to carry before the hazard is visible, and
watches the driver for fatigue — while the cloud turns every trip into fleet, government, and
passenger-facing intelligence.

**The core inversion.** Most driver-assistance products are *reactive*: a camera sees a pothole
and warns you a second before you hit it. DrivoSafe is *predictive*: the pothole was surveyed
by a mapper bus at 05:40 this morning, fused into the corridor model, and downloaded to your
tablet before you left the depot. You are warned **800 metres out**, with a lane to move to
and a speed to carry. The onboard camera exists to *validate and exonerate*, not to discover.

> **Architectural consequence, stated once and relied on throughout:** the preloaded map is the
> source of truth; live detection is a transient overlay. This is why the tablet runs fully
> offline, why advisory is a pure function of `(route, progress)`, and why a camera failure
> degrades the product rather than disabling it.

**What DrivoSafe sells, per audience.**

| Audience | Value delivered |
|---|---|
| Bus operator | Lower fuel and tyre cost, fewer harsh events, measurable driver behaviour (Captain Score), fewer breakdown-inducing impacts |
| Driver | Advance warning, a lane to hold, fatigue protection, positive scoring rather than surveillance framing |
| Passenger / booking platform | RideScore comfort badge on listings |
| Road owner / concessionaire | Continuously refreshed pavement condition and maintenance priority |
| Regulator | Auditable fatigue-management and speed-compliance record |

**Non-goals for v1.** DrivoSafe does not steer, brake, or actuate anything. It is advisory-only.
It does not do live route planning or turn-by-turn navigation — it operates on **assigned,
pre-scanned corridors**. It does not identify passengers.

---

## 2. Actors

| Actor | Surface | Responsibilities |
|---|---|---|
| **Driver** | Tablet · Drive screen | Receives advisory, is monitored for fatigue, earns Captain Score |
| **Depot supervisor** | Web · Fleet console | Assigns buses to routes and drivers to shifts, reviews fatigue events |
| **Fleet operator** | Web · Fleet dashboard | Fleet RQI, compliance, fuel, leaderboard |
| **Platform admin** | Web · Admin console | Onboards operators, buses, routes, partners |
| **Data/ops engineer** | Web · Route Editor | Turns raw mapper scans into km-mapped events; edits and publishes corridors |
| **Mapper crew** | Instrumented bus | Drives the corridor daily; uploads scans |
| **Government / concessionaire** | Web · Government dashboard | Surface score, maintenance priority, deterioration |
| **Booking platform** | API | Consumes RideScore badge |

Two actors deserve a note. The **depot supervisor** is new relative to the upstream spec and is
the operational owner of the fatigue programme — drowsiness events escalate to a human, and
that human is the supervisor, not the fleet operator. The **mapper crew** is a *hardware* role:
their buses carry the LiDAR kit and run the same app in mapper mode.

---

## 3. Surfaces

| Surface | Platform | Notes |
|---|---|---|
| **Drive screen** | Android tablet, landscape, kiosk-locked | The product. Tile dashboard with the wireframe HUD anchored. |
| **Route Editor** | Web (desktop) | Corridor authoring: waypoints, scan import, event fusion, HUD preview, publish |
| **Admin console** | Web (desktop) | Onboarding, fleet summaries, driver profiles |
| **Fleet dashboard** | Web (desktop) | Operator KPIs, corridor heatmap, Captain leaderboard |
| **Government dashboard** | Web (desktop) | Pavement intelligence |
| **RideScore badge** | API + embed | Passenger-facing |

### 3.1 Codebase strategy — one domain, two renderers

The tablet ships as **React Native**; the consoles ship as **React web**. Rather than maintain
two products, the codebase is split at a **platform adapter boundary**:

```
src/domain/     pure JS — no React, no DOM, no RN.  Shared 100%.
                route model, advisory, compliance, drowsiness fusion,
                gear advisory, alert arbitration, tile-layout algebra
src/platform/   thin adapters with one implementation per platform:
                geolocation · speech · storage · camera · haptics
src/components/ React components — shared where they are pure presentational,
                forked where layout primitives differ
```

`react-road-hazards` is built the same way and is the reason this works: its `computeFrame()`
core is renderer-agnostic and returns plain batched line segments, with a `<canvas>` renderer for
web and a Skia renderer for React Native, selected automatically by Metro via the package's
`react-native` entry field. **The HUD looks and behaves identically on both, from one import.**

**This repository delivers the React (web) build.** It is the reference implementation, it is
what runs in the consoles, and it runs on the tablet today inside a kiosk WebView. The React
Native port is a swap of `src/platform/*` plus the Skia renderer the library already provides —
`src/domain/` moves across unmodified. §20 sequences it.

---

## 4. Target platform

### 4.1 The in-cab unit

A **dedicated Android tablet**, dash- or A-pillar-mounted in the driver's near-peripheral field,
landscape-locked, permanently powered from ignition-switched vehicle supply.

| Property | Minimum | Recommended |
|---|---|---|
| Screen | 10", 1280×800 | 11–12", 1920×1200 (WUXGA), 16:10 |
| Brightness | 500 nits | 700 nits + anti-glare bonding |
| SoC | Snapdragon 6-class / Dimensity 900-class | Snapdragon 7/8-class, Dimensity 8000-class |
| NPU | Present (NNAPI-capable) | Dedicated, ≥ 10 TOPS |
| RAM | 6 GB | 8–12 GB |
| Storage | 64 GB | 128 GB+ |
| GPU | OpenGL ES 3.1 | Vulkan |
| OS | Android 11 (API 30) | Android 13+ |

Layout must scale gracefully across 8"–13". The design baseline is **1920×1200**, giving roughly
a 1280×800 dp working area in landscape.

### 4.2 Sensors and connectivity

| Input | Interface | Required? | Used by |
|---|---|---|---|
| GNSS | Internal or external puck | **Required** | Positioning (§7) |
| OBD-II | BLE or wired dongle | **Required** | Speed, RPM → compliance, gear advisory |
| Vehicle IMU | Chassis-mounted, CAN or BLE | Required for scoring | Impact/harshness, lane-weave |
| Device IMU | Internal | Fallback | Cross-check only — a dash mount is not the chassis frame |
| Forward camera | USB/CSI, or tablet rear camera | Optional | Live detections, lane-ID, exoneration |
| **Driver camera** | **USB/CSI, NIR-capable, IR illuminator** | **Required for DMS** | **Drowsiness (§8)** |
| LTE/4G | SIM or tether | Optional at runtime | Sync only — never in the driving loop |
| Wi-Fi | Depot AP | Recommended | Bulk sync, OTA |

Two of these are worth calling out.

**The driver camera must be NIR (near-infrared) with an IR illuminator.** A visible-light camera
fails in exactly the conditions where fatigue detection matters most — night driving — and fails
completely through sunglasses. NIR at 850–940 nm sees through most tinted lenses and works in
total darkness. This is a hardware requirement, not a preference; a visible-light-only unit
should be treated as *no DMS camera* and run the degraded path in §8.7.

**The compliance IMU must be chassis-mounted, not the tablet's.** A tablet on a suction mount
measures the mount's resonance, not the vehicle's vertical acceleration. The device IMU is
usable for coarse motion and as a cross-check; it must never be the sole input to a
score that affects a driver's employment record.

### 4.3 Compute budget

The tablet runs a 60 fps wireframe HUD *and* two inference streams. The budget is fixed and
enforced:

| Consumer | Budget | Enforcement |
|---|---|---|
| HUD `computeFrame` + draw | ≤ 12 ms/frame at 60 fps | Quality step-down (§6.3) |
| DMS inference | ≤ 8 W sustained, ≤ 15 fps | Frame-rate governor |
| Forward detection | ≤ 7 W sustained, best-effort | **Pre-emptible — dropped first** |
| App + OS | remainder | — |

**Priority order under thermal or compute pressure — non-negotiable:**

```
1. Advisory + HUD responsiveness      never degraded
2. Drowsiness detection               degraded last among inference
3. Forward obstacle detection         degraded first
4. Scenery / traffic simulation       dropped
5. Telemetry upload                   deferred to depot
```

The rationale: advisory is the product and is hard-real-time; drowsiness is safety-critical
and cannot be traded for decoration; forward detection is a validation signal whose loss
degrades scoring accuracy but not driver safety, because the map already knows what is ahead.

---

## 5. System architecture

### 5.1 Three systems

```
┌──────────────────────┐   scans      ┌──────────────────────┐  corridor  ┌──────────────────────┐
│   MAPPER SYSTEM      │   (GeoJSON)  │    CLOUD PLATFORM    │  bundles   │   DRIVER ASSISTANT   │
│                      │─────────────▶│                      │───────────▶│                      │
│ few instrumented     │              │ fusion · scoring     │            │ every other bus      │
│ buses, LiDAR + cam   │              │ fleet · APIs         │◀───────────│ tablet, offline      │
│ daily corridor scan  │              │                      │  trip logs │ HUD + DMS            │
└──────────────────────┘              └──────────────────────┘            └──────────────────────┘
        ~1 in 50 buses                   stateless services                   the fleet
```

The economics of the product live in this diagram: **one expensive sensing bus amortises across
fifty cheap advisory buses.** A LiDAR mapper kit costs orders of magnitude more than an
assistant kit; the corridor model it produces is a shared asset consumed by every bus on that
route. This is why detection is not the product.

### 5.2 Edge architecture (the tablet)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION                                        │
│   Drive screen (tile grid) · Route Editor · Admin · Fleet · Government      │
├────────────────────────────────────────────────────────────────────────────┤
│                       ALERT ARBITER  (§9)                                   │
│   single prioritised channel → voice · banner · chime · haptic              │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────────┤
│  ADVISORY    │  COMPLIANCE  │  DROWSINESS  │  DETECTION   │  TILE LAYOUT   │
│    (§6)      │     (§10)    │     (§8)     │    (§11)     │     (§11.2)    │
├──────────────┴──────────────┴──────────────┴──────────────┴────────────────┤
│                   POSITIONING & MAP-MATCHING  (§7)                          │
├────────────────────────────────────────────────────────────────────────────┤
│                       ROUTE MODEL  (preloaded, immutable)                   │
├────────────────────────────────────────────────────────────────────────────┤
│                       PLATFORM ADAPTERS                                     │
│   geolocation · OBD · IMU · camera · speech · storage · haptics             │
├────────────────────────────────────────────────────────────────────────────┤
│                       SYNC AGENT  (store-and-forward, §14.3)                │
└────────────────────────────────────────────────────────────────────────────┘
```

**Two invariants hold this together.**

*Invariant 1 — the driving loop never blocks on I/O.* Everything below the Route Model line is
either synchronous local computation or an async producer that writes into a state buffer the
loop samples. No advisory computation ever awaits a network call, a disk read, or an inference
result. The sync agent is entirely off the critical path.

*Invariant 2 — advisory is a pure function of `(route, progress)`.* Given the same corridor
bundle and the same chainage, the HUD, the voice cue, and the pre-computed route plan produce
byte-identical guidance. The library guarantees this: `route.plan(windowM)` pre-computes ranked
advisory for the entire corridor with hysteresis threaded window-to-window, and its output is
verified identical to what the live HUD computes while driving. This is what lets voice cues be
scheduled before departure without any risk of contradicting the screen.

### 5.3 Cloud architecture

```
                        ┌─────────────────────────────────────┐
  mapper uploads  ─────▶│  Scan Ingest        object store    │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  Fusion Pipeline    (batch, nightly)│
                        │  map-match → cluster → confidence   │
                        └──────────────┬──────────────────────┘
                                       ▼
   ┌────────────────┐   ┌─────────────────────────────────────┐   ┌───────────────┐
   │ Identity &     │   │  Corridor Service   (PostGIS)       │   │  Fleet Service│
   │ Tenancy        │   │  routes · events · lane sections    │   │  operators    │
   └────────────────┘   │  → versioned corridor bundles       │   │  buses·drivers│
                        └──────────────┬──────────────────────┘   └───────┬───────┘
                                       ▼                                   │
   ┌────────────────┐   ┌─────────────────────────────────────┐           │
   │ Trip Service   │◀──│  Sync Gateway  (device-facing API)   │◀──────────┘
   │ trip logs      │   └─────────────────────────────────────┘
   │ fatigue events │                  ▲
   └───────┬────────┘                  │ tablets
           ▼
   ┌────────────────┐   ┌─────────────────────────────────────┐
   │ Scoring        │──▶│  Public API   RideScore badge        │
   │ RQI · Captain  │   └─────────────────────────────────────┘
   └────────────────┘
```

**Corridor Service** is the system of record for road geometry and events, backed by PostGIS
with linear referencing (chainage) as the primary index — the same model the device uses, so
there is no impedance mismatch between cloud and edge. **Fusion** is deliberately batch, not
streaming: defect confidence comes from *repeat observation across passes*, which is inherently a
windowed aggregate, and a nightly cadence matches the daily rescan rhythm.

**Tenancy.** Every entity is scoped to an operator tenant. A driver's Captain Score is visible to
their operator and to no one else — including other operators on the same corridor. Corridor
data, by contrast, is a shared platform asset: all operators on NH-52 consume the same model.
This asymmetry (shared roads, private drivers) is enforced at the service layer, not in the UI.

---

## 6. Subsystem — Advisory & HUD

### 6.1 Responsibility

Convert `(corridor model, current chainage)` into: a ranked lane recommendation, a speed and
gear advisory, a hazard countdown, and a 3D wireframe rendering of the road ahead.

This subsystem is **provided by the `react-road-hazards` library** (v0.12). DrivoSafe does not
reimplement it; it configures it, feeds it, and consumes its outputs. §21 maps every library
export to its role here.

### 6.2 Ranked lane advisory

Not "use lane 3" but a **role per lane**, recomputed every frame over a 160 m lookahead:

| Role | Meaning | HUD treatment |
|---|---|---|
| `PRIMARY` | Hold this lane | Flowing chevrons, BEST label |
| `FALLBACK` | Acceptable alternative (within ~28% of primary) | Neutral, labelled |
| `AVOID` | Materially worse or degraded by an event | Red X marks on the road surface |
| `EXCLUDED` | The overtaking lane — never recommended for *cruising* | Grey, unranked |
| `OK` | Drivable, unremarkable | Plain |

Two behaviours matter more than the ranking itself.

**Lane discipline is encoded, not advisory.** On 3+ lane roads the overtaking lane is `EXCLUDED`
from cruising recommendations entirely (configurable left/right per corridor for the rare
left-hand-overtaking stretch). A bus that cruises in the overtaking lane is the single most
common complaint against intercity operators, and the product refuses to recommend it. Below
3 lanes the exclusion lifts automatically; a 1-lane road yields a single `PRIMARY` and
speed advice only.

**Hysteresis prevents ping-pong.** A lane change is only recommended when the candidate beats
the incumbent by `minGain` (default 6 points) **and** the incumbent has been held for
`holdMeters` (default 150 m). The one exception — the only way to get an instant switch — is
*collapse*: the current primary dropping below 55, which is what an accident or a fresh
washout does. Without this, a driver on a corridor with two near-equal lanes would be told to
weave every few hundred metres, and would stop listening. **Trust is the scarce resource;
hysteresis is how it is protected.**

Both rules live in `rankLanes()` in the library and are shared verbatim between the live HUD
and the pre-computed plan.

### 6.3 Render quality governor

The HUD targets 60 fps. Grid density is a preset ladder — `LOW → HIGH → ULTRA → EXTREME`
(EXTREME ≈ 13k segments/frame, ~7 ms). DrivoSafe adds a **governor**:

```
step down when   rolling p95 frame time > 14 ms over 3 s
                 OR skin temperature > threshold
                 OR battery-only (ignition off) operation
step up when     p95 < 9 ms sustained for 30 s AND not thermally limited
```

The governor never steps below `HIGH` while the vehicle is moving — below that the road reads as
a sketch rather than a surface, and the lane-quality colouring loses its legibility, which is the
one thing the HUD exists to convey.

### 6.4 Speed and gear advisory

Speed comes from event severity, on the physical argument that **impact energy scales with the
square of speed**: severity ≥ 0.8 → 30 km/h, ≥ 0.5 → 40, otherwise 50, overridable per event via
`slowTo`. Gear is derived from OBD RPM and speed against a per-bus-model efficiency band
(configured on the `Bus` record), advising up-shift when RPM sits above the band at steady
throttle and down-shift ahead of a mapped gradient or a `slowTo` zone. Gear advice is
**suppressed on automatic transmissions** — a per-bus flag, because half of a mixed fleet will
ignore it otherwise and learn to ignore the tile.

---

## 7. Subsystem — Positioning & map-matching

### 7.1 Responsibility

Turn a noisy stream of GNSS fixes into a **monotonic chainage** along the assigned corridor, plus
a lane estimate, plus an off-route flag.

Chainage — distance along the corridor centreline in metres — is the universal coordinate of this
system. Events are at a chainage. Lane sections start at a chainage. Advisory windows are
chainage ranges. Compliance evaluates at chainage crossings. **Latitude and longitude appear only
at the boundary**, in map-matching and in the map tile.

### 7.2 The tracker

`createGpsTracker(route)` handles four failure modes that a naive implementation gets wrong:

| Failure | Handling |
|---|---|
| **Reported accuracy poor** (> 40 m) | Fix discarded entirely; dead-reckon on last speed |
| **Single outlier jump** (a 220 m glitch under an overpass) | Held, not applied. Position continues on dead reckoning. |
| **Real relocation** (two consistent far fixes) | Applied — this is a genuine reposition, not noise |
| **Dropout** (tunnel, urban canyon) | Dead-reckon forward at last known speed; measured worst-case error 3.2 m through a 6-fix dropout |

Position is **monotonic**: chainage never runs backwards during a trip, because an advisory that
un-passes a hazard is worse than no advisory.

### 7.3 Lane estimation — a deliberate hierarchy

Three sources, and the priority between them is a safety decision:

```
1. Camera lane-ID (on-device model)   PRIMARY   — the only lane-precise source
2. GNSS lateral offset                CORROBORATION — ±3–5 m civilian accuracy is
                                                     not lane-precise at 3.5 m widths
3. Driver's manual lane selector      FALLBACK  — when no camera is fitted
```

**GNSS lateral offset must never be the sole input to the compliance lane check.** It is
routinely wrong by a full lane, and a driver penalised for a lane they were not in will
correctly conclude the product is lying. `laneFromOffset()` is used for the HUD's YOU marker
and as a *disagreement signal* — sustained camera/GPS disagreement flags the camera for
recalibration — never as a scoring input.

### 7.4 Off-route

Beyond 30 m lateral, the corridor model no longer describes the road under the bus. The app:
enters `off-route`, suppresses **all** hazard advisory (a pothole warning for a road you are not
on is actively dangerous), keeps the DMS running at full function (fatigue does not care what
road you are on), continues logging, and shows a re-acquire affordance. On rejoining, advisory
resumes at the matched chainage. Off-route duration is logged per trip — a bus that spends 40%
of a trip off-route means the corridor model is wrong, and that is a Route Editor task.

---

## 8. Subsystem — Driver Monitoring System (drowsiness)

> **The most safety-critical subsystem in the product, and the one with the strictest privacy
> regime.** It watches a human being for signs of impairment. Every design choice below is made
> with the awareness that this data, mishandled, costs someone their job.

### 8.1 Why fatigue and not distraction (in v1)

Both matter. Fatigue is prioritised because for intercity bus operations it is the dominant
crash factor: long shifts, overnight departures, monotonous highway, and the 02:00–06:00
circadian trough. Distraction detection (gaze-off-road) shares the entire pipeline and is
specified as a v1.1 addition — the landmark model already produces the gaze vector.

### 8.2 Pipeline

```
NIR camera 15 fps
      │
      ▼  [on-device, INT8, NNAPI/GPU]
 ① face detect (BlazeFace-class)   ─ every 15th frame, then track between
      ▼
 ② landmark mesh (468-pt)          ─ eyes, mouth, head pose
      ▼
 ③ per-frame features
      EAR   eye aspect ratio, per eye     ┐
      MAR   mouth aspect ratio            │  scalars only — frames are
      pose  yaw / pitch / roll            │  discarded immediately
      gaze  vector (v1.1)                 ┘
      ▼
 ④ temporal aggregation  (rolling 60 s window, 1 Hz update)
      ▼
 ⑤ fusion → drowsiness score → level D0–D4
      ▲
      └── context features (no camera required, always available)
```

### 8.3 Ocular metrics

| Metric | Definition | Why |
|---|---|---|
| **PERCLOS-80** | Fraction of the 60 s window with eyelid closure ≥ 80% | The single best-validated ocular fatigue measure; the industry reference |
| **Long-blink rate** | Blinks with duration > 400 ms, per minute | Micro-sleep precursor; rises before PERCLOS does |
| **Blink duration p90** | 90th-percentile blink duration in window | Sensitive earlier than the mean |
| **Yawn rate** | MAR above threshold, sustained > 1.5 s, per 10 min | Weak alone, useful in fusion; sustain requirement rejects speech |
| **Head-nod events** | Pitch drop > 15° with return < 2 s | Late-stage, high-specificity |
| **Head-pose entropy** | Variance of pose over window | *Falling* entropy indicates fixation/torpor |

**Per-driver calibration is mandatory.** EAR is strongly person-specific — eye shape, glasses,
epicanthic fold all shift the open-eye baseline by more than the drowsy/alert difference. The
first **90 seconds** of every trip establish the driver's open-eye EAR baseline; all thresholds
are expressed relative to it. The baseline is stored on the driver's profile and reused as a
prior, re-established each trip. **Absolute EAR thresholds are a bug**, and the most common
reason naive DMS implementations produce unusable false-positive rates.

### 8.4 Context features

These require no camera and are why the degraded mode (§8.7) is still useful:

| Feature | Source | Rationale |
|---|---|---|
| **Time-on-task** | Trip clock since last break ≥ 15 min | Risk rises sharply past 4 h continuous |
| **Circadian factor** | Local time-of-day weight | Peaks 02:00–06:00; secondary 14:00–16:00 |
| **Cumulative duty** | Shift record from Fleet Service | Hours driven in last 24 h / 7 days |
| **Lane-keeping variance** | σ of lateral deviation over 3 min (camera lane-ID + IMU yaw rate) | "Weaving" — classic behavioural fatigue signature |
| **Speed variance** | σ of OBD speed on constant-limit stretches | Degraded speed control tracks fatigue |
| **Steering reversal rate** | IMU yaw-rate zero-crossings | Falls then spikes as fatigue advances |

### 8.5 Fusion and levels

A weighted logistic model over normalised features, output mapped to the **Karolinska Sleepiness
Scale (KSS 1–9)** so that the number means something to a human reviewer and can be validated
against the sleep-research literature, then bucketed:

| Level | KSS | Interpretation | Action |
|---|---|---|---|
| **D0** | 1–3 | Alert | None |
| **D1** | 4–5 | Early signs | Silent: tile turns amber, event logged |
| **D2** | 6 | Drowsy | Soft chime + spoken advisory; nearest rest stop surfaced from corridor POIs |
| **D3** | 7–8 | Seriously impaired | Persistent voice + haptic; **escalation to depot supervisor**; rest-stop routing prompt |
| **D4** | 9 | Micro-sleep detected | Loud alarm until acknowledged; supervisor paged; trip flagged; **pull-over strongly advised** |

Weights are configuration, not code — shipped per fleet, tunable from the cloud, versioned, and
recorded on every event so a historical event can be re-interpreted against the model that
produced it.

**Asymmetric hysteresis, deliberately:**

```
escalate    2 consecutive 1 Hz windows at the higher level   (~2 s — fast)
de-escalate 180 s sustained at the lower level               (3 min — slow)
```

Fatigue does not resolve in ten seconds. A driver who blinks their way back to a passing PERCLOS
for one window has not recovered, and letting the level drop would produce an alarm that
oscillates and is therefore ignored. **The asymmetry is the whole design.** D4 additionally
latches until explicitly acknowledged.

### 8.6 False-positive discipline

The failure mode that kills a DMS deployment is not missed detection — it is crying wolf. Drivers
disable, cover, or learn to ignore an alarm that fires when they are fine. Countermeasures:

- **Never single-signal.** No level above D1 can be reached on one metric. D3+ requires ocular
  *and* context agreement.
- **Sustain requirements** on every event-type metric (yawns, nods) to reject speech, laughter,
  shoulder-checks, and speed-bump jolts.
- **Suppress during known head motion** — a mirror check produces pose excursions that must not
  read as nodding. Cross-reference IMU: a pose change coincident with a lateral manoeuvre is
  discounted.
- **Vibration gating.** Sustained high vertical acceleration (a rough stretch) degrades landmark
  stability; confidence is down-weighted rather than allowing garbage features through.
- **Per-driver adaptation** of the baseline (§8.3).

Target, to be validated on road data before general release: **false alarms ≤ 1 per 8-hour shift
at D2+, ≤ 1 per 40 hours at D3+.** These are release-gating numbers, not aspirations.

### 8.7 Degraded modes

| Condition | Behaviour |
|---|---|
| Camera absent, failed, or obscured | **Context-only mode**: time-on-task, circadian, lane variance, speed variance. Capped at **D2** — behavioural signals alone do not justify a D3 alarm. Tile shows reduced-confidence state; degradation logged. |
| Face not found > 30 s while moving | Treated as camera-obscured; distinct alert to the driver ("driver camera blocked"); supervisor notified if persistent |
| Thermal pressure | Frame rate 15 → 8 → 5 fps before pausing. Below 5 fps, fall back to context-only rather than infer from too few frames. |
| Driver not signed in | DMS runs, events logged against the **vehicle**, not a driver identity |

**Camera obscuration is treated as a tamper signal, not a fault.** Persistent obscuration while
moving is reported to the supervisor. This is stated in the driver-facing consent flow — no
surprises.

### 8.8 Privacy regime

**This is a hard boundary, not a policy preference.** Facial imagery of an identified individual
is sensitive personal data under India's DPDP Act 2023, and the driver is an employee who cannot
freely refuse — which raises, not lowers, the bar for handling it.

| Rule | Detail |
|---|---|
| **Frames never persist** | Camera frames exist in a ring buffer for inference and are overwritten. No frame is written to disk in normal operation. |
| **Frames never leave the device** | No upload path exists in the client for raw imagery. This is enforced by there being no such API on the Sync Gateway. |
| **Only derived scalars are stored** | An event record is `{ level, KSS, contributing features, timestamp, chainage, model version }`. No imagery, no landmarks, no template. |
| **No biometric template** | The system does not build or store a face template. It does not identify who is driving — the *session* says who is driving. |
| **Optional D4 clip, off by default** | An 8 s pre/post clip on D4 only, requiring: operator opt-in, explicit driver notification at sign-in, 30-day maximum retention, and access logging on every read. Ships **disabled**. |
| **Driver access** | A driver can view their own fatigue event history. Transparency is what makes this tolerable rather than adversarial. |
| **Scoring firewall** | **Drowsiness events do not feed the Captain Score.** |

The last rule deserves its reasoning. If fatigue detection lowers a driver's score, the rational
response is to defeat the camera. Fatigue must be routed to *rest and rostering* — a supervisor
conversation, a schedule change — never to a performance metric. A DMS that punishes the driver
for being tired is a DMS that gets a sticker put over it in week two. Captain Score measures
*choices*; fatigue is a *condition*.

---

## 9. Subsystem — Alert arbitration

### 9.1 The problem

At any instant, five subsystems may want the driver's attention: a hazard countdown, a lane
policy change, a drowsiness escalation, a live obstacle detection, and a celebration for a
hazard well handled. Without arbitration they overlap into noise — and the message that gets
lost will eventually be the one that mattered.

There is exactly **one voice channel, one banner slot, and one haptic actuator**. Arbitration is
therefore a first-class subsystem, not a UI detail.

### 9.2 Priority ladder

| P | Class | Examples | Pre-empts |
|---|---|---|---|
| **P0** | Safety-critical | D4 micro-sleep, imminent-collision detection | Everything, immediately |
| **P1** | Imminent hazard | Severe hazard < 100 m, `NOW` state | P2–P6 |
| **P2** | Drowsiness escalation | D3 alert | P3–P6 |
| **P3** | Hazard advisory | Countdown 100–800 m, `slowTo` | P4–P6 |
| **P4** | Lane policy change | New PRIMARY lane | P5–P6 |
| **P5** | Drowsiness advisory | D2 chime + rest-stop suggestion | P6 |
| **P6** | Positive / informational | Celebration, amenity, score update | — |

### 9.3 Rules

1. **Pre-emption is immediate at P0/P1** — the current utterance is cut off mid-word. Everywhere
   else, the current utterance completes and the queue reorders behind it.
2. **Minimum inter-utterance gap 2.5 s.** Continuous speech is not information.
3. **Deduplication window per message identity** — the same lane-policy sentence is not repeated
   within 60 s. Hazard countdowns are exempt (they *are* the changing information) but are
   throttled to at most three utterances per event: acquire, mid, imminent.
4. **P6 is fully suppressed** while drowsiness ≥ D2 or a P1 hazard is active. Congratulating a
   driver who is falling asleep is worse than saying nothing.
5. **Modality routing** — P0 uses voice + haptic + full-screen visual; P1–P2 voice + banner;
   P3–P4 voice + banner; P5 chime + tile; P6 tile only. Only P0 may take the full screen.
6. **Voice is the primary channel; the screen is secondary.** Guidance is spoken in
   Hindi/regional language. A driver looking at the tablet is a driver not looking at the road,
   and the arbiter's success metric is *reducing* glance count.

### 9.4 Silence budget

An explicit, measurable constraint: **no more than 6 utterances per minute, averaged over any
5-minute window.** If the queue exceeds it, P4–P6 are dropped rather than delayed. A quiet
assistant is a trusted assistant, and a system that cannot be quiet will be muted.

---

## 10. Subsystem — Compliance & Captain Score

### 10.1 Per-event evaluation

As the bus passes each mapped event, up to four checks are evaluated — **only the applicable
ones count**:

| Check | Applies to | Source | Passes when |
|---|---|---|---|
| `slow` | Physical hazards with a `slowTo` | OBD speed | Max speed during passage ≤ advised + 6 km/h tolerance |
| `lane` | Lane-specific, non-full-width events | Camera lane-ID | Dominant lane during passage ≠ hazard lane |
| `limit` | `speed-limit` zones | OBD speed | Max speed ≤ posted + 3 |
| `smooth` | Physical hazards | Chassis IMU | Peak vertical acceleration ≤ 0.35 g |

An event passes only if **all** applicable checks pass. Majors — physical hazards at severity
≥ 0.7 — weigh double, and a fully mitigated major fires the celebration animation.

### 10.2 Exoneration

**The most important rule in the scoring system.** Events verified by the onboard AI as
externally caused — a vehicle cutting in forcing a hard brake, an obstacle appearing — are
**excluded entirely**. Not discounted: excluded. They never touch the score.

This is what makes the score defensible to a driver. Every fleet-scoring product that penalises
drivers for other people's mistakes is discredited within a month by the first driver who was
punished for avoiding a collision. Exoneration flows either live (`externalIds` in the telemetry
tick, from a forward-camera detection at the event site) or retroactively via
`tracker.exonerate(id, reason)` during supervisor review, with the retroactive path fully
audited.

### 10.3 Score composition

```
eventScore  = weighted pass rate over counted events   (majors ×2)
demerits    = 2·harshBrakes + 4·rashManeuvers + 20·overspeedFraction
CaptainScore = clamp(eventScore − demerits, 0, 100)
```

Trip **RQI** (Ride Quality Index) is the passenger-facing composite:
**Road Quality 35% · Driver Behaviour 30% · Vehicle Dynamics 20% · Route Events 15%**. Note that
65% of RQI is *road and route* — a driver on a bad corridor cannot be blamed for the ride, and
an operator reading RQI is being told about the road as much as the driver. **RideScore** is the
operator/route-level roll-up of RQI that appears as a badge on booking listings.

### 10.4 Privacy

Captain Score is **operator-only** and never public, never passenger-visible, never shared
across tenants. RideScore is badge-only: its absence carries no signal, so a new operator is
not penalised for having no history.

---

## 11. Supporting subsystems

### 11.1 Live detection (forward camera)

Optional. An INT8 YOLO-nano-class model produces `{ type, distance, lane|lateral, confidence }`
at ~10 Hz, rendered as pulsing wireframe boxes in the HUD, visually distinct from mapped events.
Three roles, in order of importance: **exoneration evidence** (§10.2), **lane-ID for the
compliance lane check**, and **transient obstacle warning**. Because camera streams are jittery,
detections are smoothed (~0.25 lerp per frame on distance and lateral) before reaching the
renderer. It is the first thing dropped under pressure (§4.3) — the map already knows what is
ahead.

### 11.2 Tile dashboard

An Android-Auto-style grid the driver arranges. One **anchor tile is permanently the HUD**,
always the largest span, non-removable and non-shrinkable; every other tile is a thin
presentational view over the same live `drive` payload.

Available tiles: `hud` (anchor) · `map` · `lane-policy` · `speed-gear` · `next-hazard` ·
`drowsiness` · `trip-score` · `upcoming` · `amenities` · `traffic` · `compliance-checks`.

**Safety rule, enforced in the state machine and not merely in the UI: layout editing requires
the vehicle to be stationary.** In motion the grid is read-only; the edit affordance is not
merely disabled but absent. Content updates continue live throughout editing — data flow is
completely independent of layout.

Layout persists per driver and syncs to the cloud, so it follows them across buses. Adding a new
tile type is one new consumer of the existing payload — no new data plumbing.

### 11.3 Route-event mapping pipeline

Turns raw scans into corridor events. One call: `buildRouteEvents(routeGeoJSON, detectionsGeoJSON, opts)`.

```
GeoJSON LineString (centreline) + Points (defects)
   │
   ├─ parse                    routeFromGeoJSON / detectionsFromGeoJSON
   ├─ map-match                project each point → chainage + lane
   │                           reject > 30 m off-route (GPS glitches)
   ├─ fuse                     cluster repeat observations of one physical defect
   │                           (same type, ~10 m, same lane):
   │                             confidence ← observation count (3+ high / 2 med / 1 low)
   │                             severity   ← max observed
   │                             verifiedAt ← freshest scan
   │                             span > 12 m → one extended event with length
   ▼
Event[] + routeDef (createRoute-ready) + rejected[] + stats
```

**Confidence is earned by repetition, not asserted.** A pothole seen once by one mapper is `low`
confidence; seen on three consecutive daily passes it is `high`. This directly answers the
product's biggest trust risk — a stale or phantom warning teaches the driver to ignore the next
one — and it is why every warning carries both a confidence and a verified-at stamp on screen.

### 11.4 Sync agent

Store-and-forward, entirely off the critical path. **Down:** corridor bundles by version, model
files, config, tile layout. **Up:** trip logs, compliance results, fatigue events, scan uploads
(mapper buses), degradation telemetry. Queued to local storage with idempotency keys, uploaded
opportunistically on Wi-Fi at depot or LTE when idle, exponential backoff, resumable. **A device
that has not synced for a week still delivers full advisory** on its cached corridors — it just
carries staler freshness stamps, which the UI surfaces honestly.

---

## 12. Data model

Canonical entities. Types are indicative; field lists are the minimum a rebuild needs.

### 12.1 Corridor domain

```
Route {
  id, name, corridor,                    // "NH-52 Indore–Bhopal"
  path: [{ lat, lng }],                  // centreline polyline from mapper
  lengthM, lanes (1–6), laneWidthM,
  laneConfig: { overtaking: 'left'|'right'|null, holdMeters, minGain, fallbackBand },
  laneSections: [{ from(m), quality: [perLane 0–100] }],
  events: [Event],
  pois:   [POI],
  version, publishedAt, mappers(int), freshness(timestamp),
  status: 'draft' | 'pending-scan' | 'live' | 'retired'
}

Event {
  id, type,                              // pothole | speed-breaker | broken-road |
                                         // rough-road | diversion | school-area |
                                         // speed-limit | accident | curve-road | ...
  at(m),                                 // chainage
  lane | null,                           // null = full width
  length(m)?, severity(0–1), slowTo?, value?,
  confidence: 'high'|'med'|'low'|'manual',
  verifiedAt, note?, observations?
}

POI { type: 'petrol-pump'|'rest-stop'|'mechanic', at(m), side: 'left'|'right' }
```

### 12.2 Fleet domain

```
Operator { id, name, type: 'Passenger'|'Logistics'|'Mixed', corridor,
           buses(int), rqi(0–100), compliance(%), contact }

Bus { id, reg, operatorId, model,
      kit: 'Assistant+OBD' | 'Assistant app-only' | 'Mapper (LiDAR)',
      transmission: 'manual'|'automatic',      // gates gear advisory
      efficiencyBand: { rpmLow, rpmHigh },     // gear advisory
      dmsCamera: boolean }                     // gates DMS to context-only

Driver { id, name, operatorId, licenceNo,
         captainScore(0–100), badge: 'Gold'|'Silver'|'Bronze'|'Watch',
         trips, harshEvents, comfort(%), adherence(%),
         earBaseline?,                         // DMS calibration prior (§8.3)
         layoutId }

LogisticsPartner { id, name, mode: 'Line-haul'|'Container'|'Last-mile'|'Cold-chain',
                   fleet(int), corridors(int), sla(%) }

Shift { id, driverId, busId, routeId, depotId,
        plannedStart, plannedEnd, actualStart, actualEnd,
        breaks: [{ from, to }],
        dutyHours24h, dutyHours7d }            // feeds DMS context features
```

### 12.3 Runtime & telemetry

```
Trip { id, shiftId, routeId, busId, driverId,
       startedAt, endedAt, distanceM, offRouteM,
       rqi: RQI, captainScore, events: [ComplianceResult],
       fatigueEvents: [FatigueEvent], syncState }

Telemetry {                                    // one tick, ~10 Hz
  progress(m), speed(km/h, OBD), rpm(OBD),
  lane(camera AI), vertG(chassis IMU),
  harshBrake, rash, externalIds[]
}

ComplianceResult { id, type, name, at,
                   checks: { slow?, lane?, limit?, smooth? },
                   applicable, passed, major, excluded, excludeReason,
                   maxSpeed, maxVertG, slowTo }

FatigueEvent {                                 // NO imagery, ever (§8.8)
  id, tripId, driverId, at(chainage), timestamp,
  level: 'D0'..'D4', kss(1–9),
  features: { perclos, longBlinkRate, blinkP90, yawnRate,
              nodEvents, laneVariance, timeOnTaskMin, circadianFactor },
  mode: 'full' | 'context-only',
  modelVersion, weightsVersion,
  acknowledgedAt?, supervisorNotifiedAt?
}

Detection { id, type: 'vehicle'|'pedestrian'|'animal'|'obstacle'|'pothole-live',
            distance(m), lane|lateral(m), confidence, label? }   // transient, never persisted

RQI { score, roadQuality(35%), driverBehaviour(30%),
      vehicleDynamics(20%), routeEvents(15%) }

DriverLayout { driverId,
               anchor: { type: 'hud', slot },
               tiles: [{ id, type, slot:{x,y}, size:{w,h} }],
               updatedAt }
```

### 12.4 Retention

| Data | Retention | Rationale |
|---|---|---|
| Camera frames (either camera) | **Never persisted** | §8.8 |
| Live detections | In-memory only | Transient by definition |
| Raw telemetry ticks | 30 days on device, 90 days cloud | Incident investigation |
| Trip summaries + compliance | 3 years | Scoring history, insurance |
| Fatigue events (scalars) | 1 year | Rostering analysis, regulatory |
| Optional D4 clip | 30 days max, access-logged | §8.8, off by default |
| Corridor scans | Indefinite | Deterioration trend is the government product |

---

## 13. Screens

Each: purpose · components · data · states · flows. Visual design is out of scope.

### 13.1 Drive screen — tablet, the product

- **Purpose.** Live in-cab guidance as a customisable tile dashboard with the HUD anchored.
- **Components.** Tile grid; HUD anchor tile; info tiles; tile tray; drag handles; status bar
  (corridor, freshness, GPS/OBD/camera health, sync state); alert banner; full-screen fatigue
  overlay (P0 only).
- **Data.** Preloaded `Route`; live chainage; `Telemetry`; derived advisory; `DrowsinessState`;
  `DriverLayout`.
- **States.**
  - *Screen:* `acquiring-gps` · `driving-clear` · `warning-active` · `off-route` ·
    `fatigue-critical` (P0 overlay) · `trip-summary`
  - *Tile edit:* `view` · `edit` · `dragging` · `swapping` · `tray-open` — **all edit states
    unreachable while moving**
  - *Overlays:* celebration, reduce-speed, rest-stop suggestion
- **Flows.**
  - *Drive:* sign in → shift + corridor resolved → bundle loaded from cache → DMS calibration
    (90 s) → drive loop `[position → advisory → tiles + HUD + arbiter]` → trip end → summary →
    score written → queued for sync.
  - *Fatigue:* D2 → chime + rest stop surfaced → D3 → supervisor notified → D4 → P0 overlay +
    alarm until acknowledged, latched.
  - *Customise:* stationary → Edit layout → drag to swap → tray add/remove → Done → validated,
    saved, synced.

### 13.2 Route Editor — web

- **Purpose.** Author and publish a corridor: geometry, then events, then verification.
- **Components.** Corridor map (waypoint laying, event plotting coloured by type, rejected
  points, chainage ticks); route form (name, lane count 1–6, overtaking side, mapper count);
  GeoJSON import (route LineString + detections FeatureCollection); editable event table (type,
  lane, severity, chainage, `slowTo`, note); **live HUD preview with a position scrubber**;
  export/publish.
- **Data.** `routeGeoJSON`, `detectionsGeoJSON` → `Event[]` + `routeDef` + `rejected[]` + stats.
- **States.** `empty` · `laying` (≥1 waypoint) · `valid` (name + ≥2 points) · `mapped` (stats
  shown) · `editing` (event selected) · `previewing` · `published`.
- **Flows.** Lay waypoints or import a scan → run mapping → review rejections → edit/add/delete
  events → **scrub the HUD preview to see exactly what the driver will see** → publish → version
  increments → devices pull on next sync.

> The HUD preview is the critical control in this screen. An event edited in a table is an
> abstraction; an event seen in the driver's own HUD at the driver's own approach speed is a
> verification. Nothing publishes without it.

### 13.3 Admin console — web

Sub-tabs: **Onboarding** (operator / bus / route / logistics partner, each validated with
confirmation) · **Fleet summaries** (per-operator: buses, RQI, compliance — low-compliance
flagged as renewal risk; per-partner: fleet, corridors, SLA) · **Driver profiles** (Captain
Score, badge, trips, harsh events, comfort, adherence; "Watch"-tier highlighted) · **Fatigue
review** (events by driver/route/time-of-day, acknowledgement status, rostering
recommendations).

States: `idle` · `invalid` · `submitting` · `success` · `error`; tables `loaded` · `empty`.

### 13.4 Fleet dashboard — web

KPI row (fleet RQI, advisory compliance %, fuel saved, harsh events / 1000 km); corridor
condition heatmap (lanes × chainage); Captain Score leaderboard; value-stack table.
States: `loading` · `loaded` · `empty` (no scans yet) · `stale` (freshness > 1 day → flagged).

### 13.5 Government dashboard — web

KPI row (surface score, P1 count, scan freshness, deterioration alerts); maintenance-priority
table (segment, defect, lane, score, trend, P1–P3); deterioration trend chart (score vs weeks —
the post-monsoon decay curve is the headline); passive observables (lane-marking visibility,
signage, shoulder, encroachment).

---

## 14. Cloud APIs & sync

### 14.1 Service boundaries

| Service | Owns | Key endpoints |
|---|---|---|
| Identity | Tenants, users, devices, sessions | `POST /v1/auth/device`, `POST /v1/auth/driver` |
| Corridor | Routes, events, lane sections, bundles | `GET /v1/corridors`, `GET /v1/corridors/{id}/bundle?since=`, `POST /v1/corridors/{id}/publish` |
| Scan Ingest | Raw mapper uploads | `POST /v1/scans` (multipart, resumable) |
| Fleet | Operators, buses, drivers, shifts | `GET/POST /v1/operators`, `/v1/buses`, `/v1/drivers`, `/v1/shifts` |
| Trip | Trip logs, compliance, fatigue events | `POST /v1/trips` (idempotent), `GET /v1/trips/{id}` |
| Scoring | Captain Score, RQI, RideScore | `GET /v1/drivers/{id}/score`, `GET /v1/routes/{id}/ridescore` |
| Config/OTA | App, model, weights, feature flags | `GET /v1/config/{deviceId}`, `GET /v1/models/manifest` |
| Public | RideScore badge | `GET /public/v1/ridescore/{operatorId}/{routeId}` |

### 14.2 Corridor bundle

The unit of offline distribution: one corridor, everything the device needs.

```json
{
  "version": 412,
  "routeId": "nh52-indore-bhopal",
  "publishedAt": "2026-08-08T05:52:00Z",
  "path": [{ "lat": 22.7201, "lng": 75.8503 }, "..."],
  "lanes": 4, "laneWidthM": 3.5,
  "laneConfig": { "overtaking": "right", "holdMeters": 150 },
  "laneSections": [{ "from": 0, "quality": [45, 74, 88, 81] }],
  "events": ["..."],
  "pois": ["..."],
  "voicePlan": [{ "from": 0, "to": 200, "policy": "NEXT 200m: LANE 3 BEST · FALLBACK L2" }]
}
```

A few MB per corridor. `voicePlan` is `route.plan(200)` pre-computed server-side — the library
guarantees it is byte-identical to what the device computes live, so shipping it costs nothing in
correctness and saves the device a full-corridor pass at trip start. Delivery is
delta-by-version with an ETag; devices poll on ignition-on and at depot.

### 14.3 Sync protocol

```
Device boot ─▶ auth (device cert) ─▶ GET /config ─▶ GET bundles for assigned routes
                                                  ─▶ GET model manifest → fetch changed models
Trip end    ─▶ enqueue trip bundle (idempotency key = tripId)
            ─▶ upload on Wi-Fi/idle-LTE, exponential backoff, resumable
            ─▶ server ACK ─▶ local record marked synced ─▶ pruned per §12.4
```

Rules: **no synchronous cloud dependency in the driving loop**; every upload idempotent by
client-generated ID; queue survives power cycles; a full queue drops oldest *raw telemetry*
first and never drops trip summaries or fatigue events.

---

## 15. Non-functional requirements

### 15.1 Latency budgets

| Path | Budget |
|---|---|
| GNSS fix → chainage update | ≤ 100 ms |
| Chainage update → HUD reflects it | ≤ 1 frame (16.7 ms) |
| Hazard enters window → banner + voice queued | ≤ 200 ms |
| Camera frame → DMS features | ≤ 120 ms |
| DMS feature → level change decision | ≤ 1 s (1 Hz window) |
| **D4 detected → audible alarm** | **≤ 300 ms** |
| Tile drag → visual response | ≤ 50 ms |
| App cold start → advisory live | ≤ 6 s |

### 15.2 Performance & reliability

- HUD **60 fps** at `HIGH`+; governor keeps p95 frame time < 14 ms.
- Sustained thermal operation at 45 °C cabin ambient without dropping below `HIGH`.
- **Fully functional offline indefinitely** on cached corridors.
- Crash-free session rate ≥ 99.5%; automatic restart into the driving state within 10 s,
  resuming the trip rather than starting a new one.
- Clean shutdown on ignition-off via battery buffer; trip finalised and queued, never truncated.

### 15.3 Localisation & accessibility

All driver-facing text and voice in **Hindi plus regional languages**; voice is the primary
channel. Large-glyph, high-contrast, day/night themes on ambient light. Minimum glance time is
the governing UI metric — every tile must be readable in a sub-second glance, which is why tile
count is bounded and the HUD is the largest element on screen.

---

## 16. Security & privacy

| Domain | Control |
|---|---|
| Device identity | Per-device certificate provisioned at depot; mutual TLS to the gateway |
| Driver identity | PIN or NFC card at sign-in. **No facial recognition** — the session establishes identity, the camera never does |
| Transport | TLS 1.3 throughout; certificate pinning on the device |
| At rest (device) | Full-disk encryption; corridor bundles and trip queue in app-private storage |
| At rest (cloud) | Encrypted volumes; fatigue events in a separately-keyed store with narrower access |
| Tenancy | Row-level isolation by operator; cross-tenant reads impossible at the service layer, not just filtered in the UI |
| Device lockdown | Android device-owner / kiosk mode, screen pinning, app allowlist, MDM-enforced |
| Camera imagery | **No upload path exists**, client-side or server-side (§8.8) |
| Audit | Every read of a fatigue event and every retroactive exoneration is logged with actor and reason |
| Regulatory | India DPDP Act 2023 — driver data is sensitive personal data; consent at onboarding is informed, specific, and separately recorded for the optional D4 clip |

**Driver-facing transparency is a design requirement, not a courtesy.** At sign-in the driver
sees what is monitored, what is stored, what their supervisor can see, and what is never
recorded. A monitoring system the monitored person does not understand will be defeated.

---

## 17. Deployment & operations

| Concern | Approach |
|---|---|
| App distribution | MDM/EMM OTA; staged rollout 1% → 10% → 50% → 100% with automatic halt on crash-rate regression |
| Model distribution | Versioned manifest, separate from app releases; models are data, and a DMS weight change must not require an app release |
| Config | Remote, per-fleet, versioned; DMS weights and alert thresholds are config |
| Kiosk | Device-owner mode, auto-launch on boot, screen pinning, no launcher |
| Provisioning | Depot: cert install, route assignment, bundle preload, OBD pairing, **camera aim + focus check** |
| Recovery | Watchdog restart into the driving state; trip resumed from the local log |
| Environments | `dev` · `staging` (a real corridor, real buses) · `prod`. No DMS change reaches prod without a staging shift on real road data. |

---

## 18. Observability

**Device → cloud (batched, low volume):** frame-time p50/p95, quality-governor transitions,
thermal events, GPS fix rate and off-route duration, OBD/camera/IMU health, DMS mode
(full/context-only) and time in each, alert counts by priority, sync queue depth, crashes.

**Product health metrics that actually matter:**

| Metric | Why it is the right one |
|---|---|
| **Alerts per hour, by priority** | The over-alerting canary. Rising P3–P6 means the arbiter is losing. |
| **Advisory compliance rate** | Are drivers *acting* on guidance? If not, nothing else matters. |
| **DMS false-alarm proxy** — D2+ events dismissed within 10 s | Direct read on trust in the fatigue system |
| **Corridor freshness distribution** | Stale warnings are the #1 trust risk |
| **Rejected-detection rate** in fusion | A spike means a mapper's GPS is failing |
| **Off-route duration per corridor** | Persistent off-route = the corridor model is wrong |

The first and third are treated as **release gates**, not dashboards. A build that raises alerts
per hour is a regression regardless of what else it improves.

---

## 19. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Stale corridor data** produces phantom warnings | Trust collapse — drivers ignore everything | Confidence + verified-at on every warning; daily rescan cadence; stale corridors visibly degraded; freshness as a release gate |
| R2 | **DMS false alarms** | Camera gets covered; subsystem defeated | Multi-signal fusion, per-driver calibration, asymmetric hysteresis, sustain requirements, ≤ 1 FA/shift release gate (§8.6) |
| R3 | **Alert fatigue** across all channels | The one message that mattered is missed | Alert arbiter with silence budget (§9.4); alerts/hour as a release gate |
| R4 | **Driver perceives surveillance** | Sabotage, union resistance | Fatigue firewalled from Captain Score; driver sees own data; exoneration is prominent; transparency at sign-in |
| R5 | **GPS-only lane estimation is wrong** | Unfair compliance failures | Camera is primary for lane; GPS is corroboration only (§7.3) |
| R6 | Thermal throttling in a hot cab | HUD stutter at the worst moment | Fixed budget with strict priority order (§4.3); HUD never degraded |
| R7 | OBD dongle unplugged or incompatible | No speed → no compliance, no gear | Health surfaced on the status bar; graceful degradation to advisory-only; unpair events logged |
| R8 | Mapper coverage gaps on new corridors | No product on that route | Route lifecycle blocks `live` until first scan; app never shows advisory for `pending-scan` routes |
| R9 | Model drift after monsoon | Advisory diverges from reality | Deterioration trend monitoring; confidence decay with age; forced rescan triggers |
| R10 | Regulatory change on driver monitoring | Feature block | Scalars-only architecture, no biometric template, no imagery egress — the most defensible posture available |

---

## 20. Build order

| Phase | Deliverable | Rationale |
|---|---|---|
| **1** | Data model + route-event mapping pipeline | Everything downstream consumes `Event[]`; get the shape right first |
| **2** | HUD engine integration + positioning | The hero surface; proves the offline-pure-function architecture |
| **3** | Drive screen: tile grid, advisory, compliance | The product a driver touches |
| **4** | DMS: pipeline, fusion, escalation, arbiter | Highest safety value, highest tuning cost — needs real road data early |
| **5** | Route Editor | Unblocks corridor authoring at scale |
| **6** | Admin + Fleet + Government consoles | Commercial surfaces; can lag the vehicle |
| **7** | React Native port | Swap `src/platform/*`, adopt the Skia renderer; `src/domain/*` moves unchanged (§3.1) |

DMS lands at phase 4 rather than later specifically because its false-alarm rate can only be
tuned against real road data, and that tuning is the long pole. Building it late means shipping
it untuned.

---

## 21. Library API map

`react-road-hazards` v0.12 covers §6, §7, §10, and §11.3 outright. Nothing in that list is
reimplemented in DrivoSafe.

| Export | Role in DrivoSafe |
|---|---|
| `RoadHazardView` | The HUD anchor tile. Web `<canvas>`; React Native Skia via the package's `react-native` entry — **same import, both platforms** |
| `computeFrame` | Renderer-agnostic core. Used directly by the Route Editor's preview |
| `createRoute` | Builds the preloaded corridor model from a bundle |
| `route.plan(windowM)` | Pre-computed voice plan; guaranteed identical to live HUD output |
| `route.upcoming / eventsBetween / laneQualityAt / advisoryAt` | Tile data sources |
| `route.matchProgress(lat, lng)` | GNSS → chainage + lateral offset + lane guess |
| `createGpsTracker` | Smoothing, outlier rejection, dead reckoning, off-route (§7.2) |
| `createComplianceTracker` | Captain Score loop, per-event checks, exoneration (§10) |
| `buildRouteEvents` | The whole §11.3 pipeline in one call |
| `routeFromGeoJSON`, `detectionsFromGeoJSON`, `mapDetectionsToRoute`, `fuseDetections` | Route Editor's step-by-step pipeline view |
| `effectiveLaneQuality`, `rankLanes`, `policySentence` | Shared with the cloud voice pipeline so cloud and device cannot disagree |
| `haversineM`, `buildPath`, `matchToPath`, `laneFromOffset` | Map tile and editor geometry |
| `EVENT_TYPES`, `POI_TYPES`, `DETECTION_TYPES`, `SCENES` | Editor pickers, tile labels, legends |
| `LOW/HIGH/ULTRA/EXTREME_QUALITY` | Quality governor ladder (§6.3) |
| `onDriveInfo(d)` payload | **The single data source every info tile renders from** — `policyText`, `laneInfo`, `nextEvent`, `distance`, `slowTo`, `upcoming`, `amenities`, `traffic`, `detections`, `driverLane` |

The last row is the load-bearing one: because every tile is a thin view over one payload, a new
tile type is a new component and zero new plumbing.

**What DrivoSafe builds on top:** the DMS (§8) in full, the alert arbiter (§9), the tile-layout
algebra (§11.2), the quality governor (§6.3), gear advisory (§6.4), the sync agent (§11.4), and
every screen.

---

## 22. Glossary

| Term | Meaning |
|---|---|
| **Chainage** | Distance in metres along a corridor centreline. The system's universal coordinate. |
| **Corridor / Route** | A scanned, published stretch of road with a lane model and events |
| **Corridor bundle** | The versioned offline package a device downloads for one corridor |
| **Mapper bus** | A LiDAR-equipped bus that scans corridors daily |
| **Assistant bus** | An ordinary bus running the tablet app |
| **Event** | A mapped road feature at a chainage — hazard, zone, or marking |
| **Advisory** | The ranked lane + speed + gear recommendation at a position |
| **Captain Score** | Per-driver compliance score, 0–100, operator-only |
| **RQI** | Ride Quality Index — trip comfort composite (35/30/20/15) |
| **RideScore** | Passenger-facing operator/route badge derived from RQI |
| **Exoneration** | Excluding an externally-caused event from scoring |
| **PERCLOS** | Percentage of eyelid closure over the pupil over time — the reference ocular fatigue measure |
| **EAR / MAR** | Eye / mouth aspect ratio from facial landmarks |
| **KSS** | Karolinska Sleepiness Scale, 1–9 |
| **D0–D4** | DrivoSafe drowsiness levels (§8.5) |
| **P0–P6** | Alert arbitration priorities (§9.2) |
| **Time-on-task** | Continuous driving minutes since the last break ≥ 15 min |
| **Anchor tile** | The permanently-largest HUD tile on the Drive screen |
| **Passive observable** | Roadside condition inferred from scans — lane marking, signage, shoulder, encroachment |

---

*End of baseline v1.0.*
