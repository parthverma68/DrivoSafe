# DrivoSafe

**In-cab road-intelligence assistant for bus fleets.** · drivosafe.com

A mounted tablet that knows the road ahead kilometre-by-kilometre from a pre-scanned
digital road model, tells the driver which lane to hold and what speed to carry *before*
the hazard is visible, and watches the driver for fatigue — while the cloud turns every
trip into fleet, government and passenger-facing intelligence.

```
├── docs/SYSTEM_DESIGN.md    the architecture of record — read this first
└── app/                     the React implementation
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

## The app

React 18 + Vite, built on **`react-road-hazards` v0.12** (vendored in `app/vendor/`), which
supplies the wireframe HUD engine, the preloaded route model, GPS map-matching, the
compliance tracker and the GeoJSON → events fusion pipeline.

```bash
cd app
npm install
npm run dev       # http://localhost:5173
npm test          # 22 domain tests, no browser needed
npm run build
```

### Five surfaces

| Surface | What it is |
|---|---|
| **Drive** | The tablet product. Drag-and-drop tile grid with the HUD anchored, live advisory, compliance, drowsiness, alert arbitration. |
| **Route Editor** | Corridor authoring: waypoints, GeoJSON scan import, multi-pass fusion, editable events, live HUD verification, publish. |
| **Admin** | Onboarding (operator / bus / logistics partner), fleet summaries, driver profiles, fatigue review. |
| **Fleet** | Operator KPIs, corridor condition heatmap, Captain Score leaderboard, value stack, RideScore. |
| **Government** | Surface score, maintenance priority P1–P3, deterioration trend, passive observables. |

On a real bus the app launches straight into **Drive** under Android kiosk mode with no
navigation at all. The surface switcher exists so all five are reviewable from one build.

### Trying the Drive screen

The **sensor sim** strip along the bottom stands in for the GNSS / OBD / IMU / driver-camera
bus. On real hardware it is absent and the identical state arrives from
`src/platform/`.

- **Fatigue** is the simulated driver's *ground truth* — their eyes, mouth and head respond
  to it, and the DMS has to infer the level back out from those observables alone.
- **Local hour** drives the circadian risk factor. Push fatigue high at **04:00** and the
  system escalates through D2 → D3 → D4 and takes the screen. At **10:00** the same driver
  needs to be far more impaired before it says anything — that asymmetry is the design.
- **Edit layout** is only enabled when stationary. Start driving and the affordance
  disappears mid-session.

### Code layout

```
app/src/
├── domain/        pure JS — no React, no DOM. Shared 100% with the React Native port.
│   ├── drowsiness.js    DMS fusion engine + deterministic driver simulator
│   ├── alerts.js        priority arbiter, dedupe, silence budget
│   ├── layout.js        tile algebra: anchor invariants, swap, reflow, validate
│   ├── telemetry.js     gear advisory + vehicle/OBD/IMU simulator
│   ├── corridors.js     corridor catalogue → library Route model
│   ├── fleet.js         operators, buses, drivers, partners, shifts
│   └── *.test.js        22 behavioural tests
├── platform/      the seam: storage · speech · chime · haptics · geolocation
├── hooks/         useDriveLoop — the 10 Hz drive loop
├── components/    TileGrid + the ten info tiles
└── screens/       the five surfaces
```

The `domain` / `platform` split is what makes the React Native port a swap of
`src/platform/*` plus the library's Skia renderer, with `src/domain/*` moving across
unmodified. See §3.1 of the system document.
