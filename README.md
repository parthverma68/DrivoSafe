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

Five parts of it are new relative to the upstream RoadIntel specification and carry the
most design weight:

- **§8 Driver Monitoring System** — camera-based drowsiness detection: PERCLOS, blink
  dynamics, yawn and nod events fused with time-on-task, circadian phase and lane-keeping
  variance into a KSS-mapped level D0–D4, with per-driver calibration, asymmetric
  hysteresis, a context-only degraded mode, and a strict scalars-only privacy regime.
- **§9 Alert arbitration** — one voice channel, five subsystems competing for it. A
  priority ladder P0–P6 with pre-emption, deduplication and an explicit silence budget.
- **§11.2 Tile dashboard** — the anchor-tile algebra that makes the HUD structurally
  impossible to remove.
- **§12.5 Identity, roles and device binding** — role as a *scope* rather than a job title,
  `operatorId` tenancy applied where data is selected rather than where it is rendered, and the
  one-time bolt-in that makes the vehicle known before anyone signs in.
- **§13.0 The pre-drive gate** — vehicle → face → breath, and the three rules that decide whether
  a safety device gets used or routed around: a short blow is not an attempt, an over-long one is
  truncated not rejected, and three failures lock the vehicle in a way the driver cannot clear.

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

npm test             # 60 domain tests, plain Node, neither host installed
npm run web          # http://localhost:5173
npm run web:build
```

### The tablet app (bare React Native)

Needs **JDK 17** (not 21) and the Android SDK — full setup, monorepo notes and troubleshooting
in **[`native/BUILDING.md`](native/BUILDING.md)**.

```bash
npm install          # from the REPO ROOT — it is a workspace

cd native
npm run android      # build, install and launch on a device or tablet emulator
npm run bundle       # production JS bundle only — no SDK or device needed
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

### One flow, four roles

```
welcome → sign in → [driver: check-in gate] → the surfaces that role owns
```

`role.surfaces` is the allow-list the shell iterates, so a surface outside a role's scope is
never constructed — a driver's running app contains no fleet console at all, and a government
official's contains no vehicle anywhere in it.

| Role | Sees | Sign in as |
|---|---|---|
| **Driver** | Drive, after clearing the pre-drive gate | `ramesh` / `1234` |
| **Fleet owner** | Fleet console — their own buses only | `sarthi` / `fleet` |
| **Administrator** | Everything, and can mirror any cab's live drive screen | `admin` / `admin` |
| **Government official** | Road Authority only — no operator, driver or vehicle identity | `rto` / `gov` |

**The driver's pre-drive gate** is the part with teeth. The tablet is bound to one bus once, at
fitment, so every shift after that the *vehicle* is already known and the driver only has to
prove they are the driver:

1. **Vehicle** — the bound serial resolves the bus; confirm, or rebind if the unit was moved.
2. **Identity** — a front-camera burst matched against the faces enrolled for that bus's
   operator. An unknown face opens **registration, not refusal**; a dark lens is a capture
   verdict, not an identity one.
3. **Breath** — a 5–8 s blow at 0.01 %BAC fleet policy. A short blow does not cost an attempt;
   **three failures lock the vehicle** and only a supervisor override clears it.

Tick *sensor sim · alcohol present* on the breath step to walk the lockout path.

| Surface | What it is |
|---|---|
| **Drive** | The tablet product. Drag-and-drop tile grid with the HUD anchored, live advisory, compliance, drowsiness, alert arbitration. |
| **Fleet** | Live operations board — map, vehicle list, the driver at the wheel, cabin video on request, live telemetry — plus operator KPIs, corridor heatmap, Captain Score leaderboard, value stack, RideScore. |
| **Admin** | Onboarding, fleet summaries, driver profiles, fatigue review. |
| **Corridors** | Corridor authoring: scan import, multi-pass fusion, editable events, live HUD verification, publish. |
| **Road Authority** | Surface score, maintenance priority P1–P3, deterioration trend, passive observables. |

On a real bus the app launches straight into the check-in gate and then **Drive** under Android
kiosk mode with no navigation at all (`KIOSK = true` in `native/src/App.jsx`).

### On a phone

Both builds are usable on a handset, and the drive screen is the part that needed real thought
rather than a media query.

- **Consoles re-stack rather than shrink.** The three-column operations board becomes one
  scrolling column, the icon rail moves to the bottom within thumb reach, and wide data — the
  corridor heatmap, the event tables — scrolls inside its own card instead of stretching the page.
- **The drive screen gets a different grid** (§11.2 profiles), not a scaled-down one: the HUD plus
  the three tiles a driver acts on — **speed & gear, next hazard, trip score**. Everything else is
  gone, because nine tiles on a 6-inch screen is nine things nobody can read at 80 km/h. It is
  fixed, so a phone never overwrites the dashboard the driver arranged on their tablet.
- **Landscape is requested at the tap that starts the shift** — fullscreen, then an orientation
  lock. Both are best-effort (iOS has no lock at all), so if the phone stays portrait the screen
  says so, and the portrait profile still renders a usable dashboard: HUD across the top, the
  three tiles in a row beneath it.

### Day and night

Both builds carry two full palettes as tokens — night for the cab and the ops floor, day for a
depot office with a window behind the monitor. The web toggle is in the rail and follows the OS
preference on first load. On the tablet the console surfaces honour the toggle and **the Drive
surface does not**: it is wrapped in `<NightOnly>`, because a white screen on a windscreen mount
at 03:00 is a glare hazard, not a preference.

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
├── layout.js        tile algebra: anchor invariants, swap, reflow, validate,
│                   and the tablet / phone grid profiles
├── telemetry.js     gear advisory + vehicle/OBD/IMU simulator
├── corridors.js     corridor catalogue → library Route model
├── fleet.js         operators, buses, drivers, partners, assignments, shifts
├── accounts.js      roles, accounts, device binding, face enrolments, tenancy
├── checkin.js       the pre-drive gate: breath-test machine + face matcher
├── liveFleet.js     the live telemetry feed the consoles watch
├── useDriveLoop.js  the 10 Hz drive loop — platform injected, not imported
└── *.test.js        60 behavioural tests

app/src/  ·  native/src/
├── platform/        the seam — the only forked layer
├── session.js       role session + the one-time install record
├── components/      TileGrid, the ten info tiles, the fleet map, camera views
└── screens/         welcome · login · check-in · the five surfaces
```

`accounts.js` is the frontend stand-in for the Identity Service and is deliberately shaped like
what the server will return, so the backend can be built against it rather than around it.
