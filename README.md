# DrivoSafe

**In-cab road-intelligence assistant for bus fleets.** · drivosafe.com

A mounted tablet that knows the road ahead kilometre-by-kilometre from a pre-scanned
digital road model, tells the driver which lane to hold and what speed to carry *before*
the hazard is visible, and watches the driver for fatigue — while the cloud turns every
trip into fleet, government and passenger-facing intelligence.

```
├── docs/SYSTEM_DESIGN.md    the architecture of record — read this first
├── shared/                  @drivosafe/shared — pure domain, no DOM, no React Native
├── app/                     React web    — consoles + browser-runnable Drive screen
└── native/                  React Native — the in-cab tablet app (Android)
```

---

## The system document

**[`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)** is the primary deliverable: target
hardware, edge and cloud architecture, all seven subsystems, the data model, every screen,
the cloud API and sync protocol, non-functional requirements, security and privacy,
deployment, observability, risks and build order.

Three parts of it are new relative to the upstream RoadIntel specification and carry the
most design weight:

- **§8 Driver Monitoring System** — camera-based drowsiness detection: PERCLOS, blink
  dynamics, yawn and nod events fused with time-on-task, circadian phase and lane-keeping
  variance into a KSS-mapped level D0–D4, with per-driver calibration, asymmetric
  hysteresis, a context-only degraded mode, and a strict scalars-only privacy regime.
- **§9 Alert arbitration** — one voice channel, five subsystems competing for it. A
  priority ladder P0–P6 with pre-emption, deduplication and an explicit silence budget.
- **§11.2 Tile dashboard** — the anchor-tile algebra that makes the HUD structurally
  impossible to remove.

---

## One domain, two builds

Both apps are built on **`react-road-hazards` v0.12** (vendored in `vendor/`), which supplies
the wireframe HUD engine, the preloaded route model, GPS map-matching, the compliance tracker
and the GeoJSON → events fusion pipeline. Its `computeFrame()` core is renderer-agnostic, so
the *same* `import { RoadHazardView } from 'react-road-hazards'` resolves to a `<canvas>`
renderer on web and a Skia renderer under Metro.

Everything platform-independent — including the drive loop — lives in `@drivosafe/shared` and
is consumed byte-identically by both. The only forked layer is `src/platform/`.

```bash
npm install          # workspace root: installs shared + app + native

npm test             # 22 domain tests, plain Node, neither host installed
npm run web          # http://localhost:5173
npm run web:build
```

### The tablet app (bare React Native)

```bash
cd native
npm run android      # device or emulator, Android 11+ (API 30+)
npm run bundle       # production JS bundle — no device or SDK needed
```

Bare RN CLI rather than Expo, deliberately: the in-cab unit is a device-owner kiosk appliance
with a custom manifest, a HOME-category launcher intent, MDM enrolment, and native modules
coming for the OBD-II dongle and the NIR camera pipeline.

| Concern | Web (`app/`) | Native (`native/`) |
|---|---|---|
| HUD | `<canvas>` + rAF | Skia + rAF |
| Voice | SpeechSynthesis | react-native-tts |
| Chime / haptics | WebAudio · `navigator.vibrate` | `Vibration` patterns |
| Storage | `localStorage` | AsyncStorage + hydrated sync mirror |
| Geolocation | `navigator.geolocation` | `@react-native-community/geolocation` |
| Vector graphics | inline SVG | `react-native-svg` |
| Layout | CSS grid | measured cells + absolute positioning |
| Drag & drop | HTML5 DnD | `PanResponder` + `Animated` |

### Five surfaces, on both

| Surface | What it is |
|---|---|
| **Drive** | The tablet product. Drag-and-drop tile grid with the HUD anchored, live advisory, compliance, drowsiness, alert arbitration. |
| **Route Editor** | Corridor authoring: scan import, multi-pass fusion, editable events, live HUD verification, publish. |
| **Admin** | Onboarding, fleet summaries, driver profiles, fatigue review. |
| **Fleet** | Operator KPIs, corridor condition heatmap, Captain Score leaderboard, value stack, RideScore. |
| **Government** | Surface score, maintenance priority P1–P3, deterioration trend, passive observables. |

On a real bus the app launches straight into **Drive** under Android kiosk mode with no
navigation at all (`KIOSK = true` in `native/src/App.jsx`). The surface switcher exists so all
five are reviewable from one build.

---

## Trying the Drive screen

The **sensor sim** strip along the bottom stands in for the GNSS / OBD / IMU / driver-camera
bus. On real hardware it is absent and the identical state arrives from `src/platform/`.

- **Fatigue** is the simulated driver's *ground truth* — their eyes, mouth and head respond
  to it, and the DMS has to infer the level back out from those observables alone.
- **Local hour** drives the circadian risk factor. Push fatigue high at **04:00** and the
  system escalates D2 → D3 → D4 and takes the screen. At **10:00** the same driver needs to
  be far more impaired before it says anything — that asymmetry is the design.
- **Edit layout** is only enabled when stationary. Start driving and the affordance
  disappears mid-session.

---

## Code layout

```
shared/src/
├── drowsiness.js    DMS fusion engine + deterministic driver simulator
├── alerts.js        priority arbiter, dedupe, silence budget
├── layout.js        tile algebra: anchor invariants, swap, reflow, validate
├── telemetry.js     gear advisory + vehicle/OBD/IMU simulator
├── corridors.js     corridor catalogue → library Route model
├── fleet.js         operators, buses, drivers, partners, shifts
├── useDriveLoop.js  the 10 Hz drive loop — platform injected, not imported
└── *.test.js        22 behavioural tests

app/src/  ·  native/src/
├── platform/        the seam — the only forked layer
├── components/      TileGrid + the ten info tiles
└── screens/         the five surfaces
```
