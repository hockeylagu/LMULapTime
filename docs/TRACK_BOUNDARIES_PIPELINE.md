# 🏎️ Track Boundaries Pipeline & Geometry Reference Guide

This document describes the automated physical track boundaries pipeline for **Le Mans Ultimate (LMU)**, how track corridor geometries are generated and aligned, and the exact process to follow whenever a **new track or layout variant** is driven or upgraded.

---

## 1. Overview & Purpose

In motorsport telemetry analysis, knowing the car's telemetry line alone does not reveal whether the driver was using the entire width of the road, clipping apex kerbs, or exceeding track limits. 

The **Track Boundaries Pipeline** generates and maintains exact 2D boundary polygons and 3D track infrastructure:
- **`leftBoundary`**: Outer left track limit coordinates `[x, z]` in LMU local meters.
- **`rightBoundary`**: Outer right track limit coordinates `[x, z]` in LMU local meters.
- **`centerline`**: Physical track center coordinates `[x, z]` in LMU local meters.
- **`elevationProfile`**: 3D altitude profile `y` in meters matching the centerline stations.
- **`pitLane`**: 3D pit lane centerline `[x, z]` and elevation profile `y`.
- **`pitStalls`**: Exact physical pit stall markers `{ id, center: [x, z], widthM, angleDeg }`.
- **`gridSlots`**: Starting grid box slot positions `{ slot, center: [x, z] }`.
- **`timingGates`**: Perpendicular timing lines for Start/Finish, Sector 1, and Sector 2 `{ name, center, left, right, stationM }`.
- **`bounds`**: Bounding box `{ minX, maxX, minZ, maxZ, spanX, spanZ }`.

Because all coordinates are stored directly in **LMU world Cartesian meters**, frontend map components (like `GpsTrackMapScene` and replay visualizers) can directly render the physical road ribbon, kerb limits, pit infrastructure, and telemetry traces with zero coordinate transformations or reprojection overhead.

---

## 2. Directory & File Layout

```
LMULapTime/
├── tools/analysis/
│   ├── cache/                           # Cached raw external sources & game APIs
│   │   ├── lmu_all_trackmaps.json       # Native LMU REST API 3D geometries for all tracks
│   │   ├── Monza.csv                    # TUM surveyed boundaries
│   │   ├── Spa.csv                      # TUM surveyed boundaries
│   │   ├── circuit-de-la-sarthe_24h.geojson
│   │   └── ...
│   └── buildAllTrackBoundaries.ts       # Unified generation & registration script
├── server/data/tracks/                  # Backend storage & API-ready geometries
│   ├── index.json                       # Catalog manifest of all 21 circuits & bounds
│   ├── monza_gp.json
│   ├── sarthe_full.json
│   └── ...
└── public/tracks/                       # Client-side static assets (mirrored for Vite)
    ├── index.json
    ├── monza_gp.json
    └── ...
```

---

## 3. Data Sources & Ingestion Hierarchy

Tracks are acquired through a 5-tier hierarchy, prioritizing native in-game ground truth whenever available:

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 1: Native In-Game 3D Trackmaps (LMU REST API)          │  Exact 1:1 scale, zero distortion,
│         Reconstructed Road Centerline + Variable Widths     │  pit lane, stalls, grid, elevation
└──────────────────────────────┬──────────────────────────────┘
                               │ fallback if API map unavailable
┌──────────────────────────────▼──────────────────────────────┐
│ Tier 2: Surveyed Boundaries (TUM Racetrack Database)        │  Centimeter-accurate survey,
│         Procrustes Similarity Alignment to Replays          │  scale factor within 0.05%
└──────────────────────────────┬──────────────────────────────┘
                               │ fallback if TUM survey unavailable
┌──────────────────────────────▼──────────────────────────────┐
│ Tier 3: Curvature-Adaptive Centerlines (Track-Atlas / OSM)  │  Transverse Mercator projection,
│         FIA / ACO Homologation Width Extrusions             │  uniform 2.5m resampling
└──────────────────────────────┬──────────────────────────────┘
                               │ for layout variants (chicanes, shortcuts)
┌──────────────────────────────▼──────────────────────────────┐
│ Tier 4: Hybrid Boundary Synthesis                           │  Parent survey retained for 70-98%,
│         Parent Survey + Spliced Telemetry Bypasses          │  C1 Hermite/cosine transition blending
└──────────────────────────────┬──────────────────────────────┘
                               │ fallback for unmapped layout variants
┌──────────────────────────────▼──────────────────────────────┐
│ Tier 5: Standalone Native Telemetry Corridors               │  Clean replay telemetry resampled
│         Replay Spline Extruded to FIA Width                 │  with smoothed normal expansion
└─────────────────────────────────────────────────────────────┘
```

---

### Tier 1: Native In-Game 3D Trackmaps (`lmu_api`)
- **Source**: LMU Embedded REST API (`GET /rest/race/track/{id}/trackmap`) cached in `tools/analysis/cache/lmu_all_trackmaps.json`.
- **Properties**: Native 1:1 metric Cartesian space ($s = 1.0, \theta = 0.0^\circ, t = 0$). Zero geometric distortion or reprojection error.
- **Point Classification**:
  - `type: 0`: High-density 3D fast racing path (2,500 – 3,500+ points).
  - `type: 1`: Continuous 3D pit lane centerline from pit-in entry wall to pit-out re-entry.
  - `type: 2..99`: Pit stall markers (paired coordinates defining stall center, width, and pit box angle).
  - `type: 100+`: Starting grid slot positions (paired coordinates defining grid box centers).

#### Physical Road Centerline Reconstruction
In LMU's engine, the native `type: 0` path is the **ideal fast racing line**, not the physical road centerline. Symmetrically projecting $\pm \text{halfWidth}$ from `type: 0` centers the road on the driving line, which pushes apex kerbs too far out and traps the car in the middle 50% of the ribbon.

To recover the true physical road surface:
1. Compute cumulative station distance $s_i$ and signed curvature $\kappa_i = \frac{\Delta \theta_i}{\Delta s_i}$ along the native path.
2. Determine variable section half-widths $hw_i$ from `sectionWidths` (smoothed over a rolling window of 17 points for $C^1$ continuity).
3. Compute dynamic outward apex offset $\Delta_i$ using hyperbolic tangent scaling:
   $$\Delta_i = -\tanh(\kappa_i \cdot 80) \cdot (hw_i - 2.8\text{m})$$
   A 5-point ($\approx 25\text{m}$) moving-average filter is applied to $\Delta_i$ to ensure smooth, natural transitions.
4. Extrude the physical road centerline:
   $$\vec{C}_{\text{road}}(i) = \vec{C}_{\text{fast}}(i) + \Delta_i \hat{N}_i$$
5. Extrude the left and right physical track limits:
   $$\vec{B}_{\text{left}}(i) = \vec{C}_{\text{road}}(i) + hw_i \hat{N}_i, \quad \vec{B}_{\text{right}}(i) = \vec{C}_{\text{road}}(i) - hw_i \hat{N}_i$$

**Result**: Cars utilize **95.8% of the available track width** (from 1.7% to 97.5% from left to right kerb), hugging apex kerbs tightly while staying safely within track limits on straights.

#### Variable Width Profiles (`sectionWidths`)
Real tracks vary in width by sector (e.g. Circuit de la Sarthe: 15.5m pit straight, 13.5m Dunlop chicane, 12.0m narrow sections). The pipeline supports explicit per-section width ranges:
```typescript
sectionWidths: [
  { startM: 0, endM: 650, widthM: 15.5, description: 'Pit / Start-Finish straight' },
  { startM: 650, endM: 1150, widthM: 13.5, description: 'Dunlop Curve & Chicane' },
  { startM: 1150, endM: 2000, widthM: 12.0, description: 'Forest Esses & Tertre Rouge' },
  // ...
]
```

---

### Tier 2: Surveyed Boundaries (TUM Racetrack Database)
- **Source**: [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database)
- **Included Tracks (7)**: Monza GP, Spa-Francorchamps, Circuit of the Americas (COTA), Circuit de Barcelona-Catalunya, Interlagos, Silverstone GP (WEC), Bahrain GP (WEC).
- **Format**: High-frequency metric survey points `# x_m, y_m, w_tr_right_m, w_tr_left_m`.
- **Processing**: Standard Procrustes similarity alignment ($s, \theta, t_x, t_z$) matching LMU replay telemetry. LMU modeling scale matches TUM to within $0.05\%$.

---

### Tier 3: Curvature-Adaptive Centerlines (Track-Atlas / OpenStreetMap GPS)
- **Source**: [tobi/track-atlas](https://github.com/tobi/track-atlas) & [OpenStreetMap](https://www.openstreetmap.org)
- **Included Tracks (7)**: Autodromo Enzo e Dino Ferrari (Imola), Daytona Road Course, Algarve / Portimão, Paul Ricard 1A-V2, Fuji Speedway GP, WeatherTech Raceway Laguna Seca, Sebring International Raceway Full WEC.
- **Processing**:
  1. Transverse Mercator projection to metric coordinates $(x, y)$.
  2. Uniform resampling at 2.5-meter step intervals.
  3. 5-point moving average smoothing.
  4. Unit normal vector displacement according to official FIA / ACO circuit homologation road widths (12.0m to 15.0m).
  5. Optimal similarity alignment with LMU replay telemetry.

---

### Tier 4: Hybrid Boundary Synthesis (Parent Survey + LMU Ground Truth Spliced Connectors)
- **Source**: Combines centimeter-accurate parent survey (`TUM-survey`, `track-atlas`, or `LMU-API`) and native LMU API ground truth (or high-frequency replay trajectories) for divergent bypasses and shortcuts.
- **Included Layouts (5)**:
  - `monza_curvagrande`: **96.8%** anchored to Monza GP TUM survey (bypasses Prima Variante via 160m connector).
  - `fuji_classic`: **98.8%** anchored to Fuji GP track-atlas survey (bypasses Dunlop chicane via 100m straight).
  - `sebring_school`: **98.3%** anchored to Sebring Full track-atlas survey (shortcuts hairpin complex across paddock).
  - `bahrain_outer`: **81.4%** anchored to Bahrain WEC TUM survey (connects Turn 4 to back straight via outer link).
  - `bahrain_paddock`: **96.0%** anchored to Bahrain WEC TUM survey (bypasses Oasis complex and inner loop).
- **Stitching with the LMU Ground Truth Pattern**:
  1. **Ground Truth Spline Sourcing**: When `lmuTrackId` is configured, the divergent trajectory is extracted directly from the native in-game 3D trackmap (`type: 0`) in `tools/analysis/cache/lmu_all_trackmaps.json`, providing sub-centimeter point density and native altitude ($y$).
  2. **Adaptive Boundary Width Continuity**: To eliminate width steps at junctions, the half-width along the connector smoothly interpolates between the parent survey's actual width at the exit junction ($hw_{\text{exit}} = \frac{1}{2}\|\vec{P}_{\text{left}}[kExit] - \vec{P}_{\text{right}}[kExit]\|$), the circuit nominal width ($hw_{\text{nom}}$), and the parent width at the entry junction ($hw_{\text{entry}}$).
  3. **Curvature-Driven Road Centerline Reconstruction**: In corners on the connector, signed curvature $\kappa_i = \frac{\Delta \theta_i}{\Delta s_i}$ is calculated, and the physical road centerline is shifted outward toward the outside of the turn:
     $$\Delta_i = -\tanh(\kappa_i \cdot 80) \cdot \max(0, hw_i - 2.8\text{m})$$
     smoothed with a moving-average filter. This ensures the car does not appear trapped in the dead center of the connector ribbon and can naturally clip apex kerbs.
  4. **Smooth $C^1$ Transition Blending**: Hermite / cosine weighting ($u(b) = \frac{1}{2}(1 - \cos(\frac{\pi b}{B}))$) is applied across $B$ transition points at both departure and re-entry junctions, guaranteeing zero boundary step-discontinuities.
  5. **Elevation Splicing & Infrastructure Inheritance**: Parent `elevationProfile` is sliced and interpolated across the connector, and parent pit lane (`pitLane`), pit stalls (`pitStalls`), grid slots (`gridSlots`), and Start/Finish survey anchor are fully inherited by the hybrid variant.

---

### Tier 5: Standalone Native Telemetry Corridors
- **Source**: High-frequency replay streams stored in `server/lmu_cache.db`.
- **Included Layouts (1)**: `qatar_short` (Lusail Short Circuit).
- **Processing**: Clean flying laps extracted from the replay cache provide ground truth physics coordinates in native 1:1 metric space ($s = 1.0, \theta = 0.0^\circ$). Unit normals project standard FIA corridor widths.

---

## 4. Strict Perpendicular Normal Raycasting for Timing Gates

Start/Finish and sector timing gates must be perpendicular to the road ribbon. Using PCA on discrete replay start samples can produce slanted lines ($130^\circ+$) due to sampling tick scatter or diagonal car movement.

The pipeline uses **strict ribbon normal raycasting**:
1. Identify the centerline crossing point index $k$ using replay sample consensus or authoritative survey anchors.
2. Compute the local road tangent vector $\hat{T}$:
   $$\vec{T} = \vec{C}[k+1] - \vec{C}[k-1], \quad \hat{T} = \frac{\vec{T}}{\|\vec{T}\|}$$
3. Derive the strict 2D normal vector pointing towards the left boundary:
   $$\hat{N} = (-T_z, T_x)$$
4. Raycast from the centerline intersection along $\hat{N}$ to intersect `leftBoundary` and along $-\hat{N}$ to intersect `rightBoundary`:
   $$\vec{P}_{\text{left}} = \text{intersect}(\vec{C}[k], \hat{N}, \text{leftBoundary})$$
   $$\vec{P}_{\text{right}} = \text{intersect}(\vec{C}[k], -\hat{N}, \text{rightBoundary})$$
5. Roll the entire closed polyline array so that index `0` corresponds exactly to the Start/Finish line station ($s = 0.0\text{m}$).

**Angle Verification**: The resulting gate vector $\vec{P}_{\text{left}} - \vec{P}_{\text{right}}$ forms an angle of **$89.93^\circ \approx 90.0^\circ$** with the track tangent, ensuring a clean, perpendicular line across the track ribbon.

---

## 5. All 21 Driven Tracks & Layouts Reference

| Layout Key | Circuit ID | Layout ID | Venue Name | Course Name | Length | Source | Shared % | Features |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `sarthe_full` | `sarthe` | `full` | Circuit de la Sarthe | Circuit de la Sarthe | 13,624.6 m | LMU-API+Telemetry | 100% | 3D elev, pit lane (289 pts), 62 stalls, 62 grid slots |
| `monza_gp` | `monza` | `gp` | Autodromo Nazionale Monza | Autodromo Nazionale Monza | 5,792.7 m | TUM-survey | 100% | TUM physical road boundaries, LMU API pit lane (252 pts), stalls (38), grid (38), 3D elev |
| `monza_curvagrande` | `monza` | `curvagrande` | Autodromo Nazionale Monza | Monza Curva Grande Circuit | 5,756.6 m | hybrid (monza_gp) | 77.8% | TUM physical boundaries with glitch-free Curva Grande bypass, 3D elev, pit/timing inherited |
| `spa_gp` | `spa` | `gp` | Circuit de Spa-Francorchamps | Circuit de Spa-Francorchamps | 6,968.9 m | TUM-survey | 100% | Flat 3m corridor padding |
| `cota_gp` | `cota` | `gp` | Circuit of the Americas | Circuit of the Americas | 5,509.2 m | TUM-survey | 100% | Timing gates (S/F, S1, S2) |
| `barcelona_gp` | `barcelona`| `gp` | Circuit de Barcelona | Circuit de Barcelona | 4,648.3 m | TUM-survey | 100% | Timing gates (S/F, S1, S2) |
| `interlagos_gp` | `interlagos`| `gp` | Autódromo José Carlos Pace | Autódromo José Carlos Pace | 4,281.7 m | TUM-survey | 100% | Timing gates (S/F, S1, S2) |
| `silverstone_wec` | `silverstone`| `gp` | Silverstone Circuit | Silverstone Grand Prix Circuit - WEC | 5,869.8 m | TUM-survey | 100% | Timing gates (S/F, S1, S2) |
| `bahrain_wec` | `bahrain` | `wec` | Bahrain International Circuit | Bahrain International Circuit | 5,390.6 m | TUM-survey | 100% | Timing gates (S/F, S1, S2) |
| `bahrain_outer` | `bahrain` | `outer` | Bahrain International Circuit | Bahrain Outer Circuit | 3,532.3 m | hybrid (bahrain_wec) | 81.4% | LMU API ground truth stitched connector, pit/timing inherited |
| `bahrain_paddock` | `bahrain` | `paddock` | Bahrain International Circuit | Bahrain Paddock Circuit | 3,882.4 m | hybrid (bahrain_wec) | 96.0% | LMU API ground truth stitched connector, pit/timing inherited |
| `imola_gp` | `imola` | `gp` | Autodromo Enzo e Dino Ferrari | Autodromo Enzo e Dino Ferrari | 4,901.4 m | track-atlas | 100% | Timing gates (S/F, S1, S2) |
| `daytona_road_course` | `daytona` | `road_course` | Daytona International Speedway | Daytona International Speedway Road Course | 5,721.5 m | OpenStreetMap | 100% | Timing gates (S/F, S1, S2) |
| `fuji_chicane` | `fuji` | `chicane` | Fuji Speedway | Fuji Speedway | 4,535.4 m | track-atlas | 100% | Timing gates (S/F, S1, S2) |
| `fuji_classic` | `fuji` | `classic` | Fuji Speedway | Fuji Speedway Classic | 4,506.4 m | hybrid (fuji_chicane) | 98.8% | LMU API ground truth stitched connector, pit/timing inherited |
| `portimao_wec` | `portimao` | `wec` | Algarve International Circuit | Algarve International Circuit | 4,666.8 m | OpenStreetMap | 100% | Timing gates (S/F, S1, S2) |
| `sebring_full` | `sebring` | `full` | Sebring International Raceway | Sebring International Raceway | 5,858.4 m | track-atlas | 100% | Timing gates (S/F, S1, S2) |
| `sebring_school` | `sebring` | `school` | Sebring International Raceway | Sebring School Circuit | 3,077.2 m | hybrid (sebring_full) | 98.3% | LMU API ground truth stitched connector, pit/timing inherited |
| `laguna_seca` | `laguna_seca`| `full` | WeatherTech Raceway Laguna Seca | WeatherTech Raceway Laguna Seca | 3,599.9 m | track-atlas | 100% | Timing gates (S/F, S1, S2) |
| `qatar_short` | `qatar` | `short` | Lusail International Circuit | Lusail Short Circuit | 3,660.7 m | telemetry-corridor | 100% | Timing gates (S/F, S1, S2) |
| `paul_ricard_1a_v2_short` | `paul_ricard`| `1a_v2_short`| Paul Ricard Circuit | Paul Ricard - 1A-V2-Short | 5,192.8 m | OpenStreetMap | 100% | Timing gates (S/F, S1, S2) |

---

## 6. How to Add or Upgrade a Track Layout

Whenever a new track is driven or an existing track is upgraded to Tier 1 native 3D geometry:

### Step 1: Ingest Session / Replay
Drive or import at least one session so that clean flying laps exist in `UserData/LOG/Results/*.xml` or `UserData/Replays/*.Vcr`. The background scanner registers the replay in `server/lmu_cache.db`.

### Step 2: Check for LMU Native API Trackmap (Tier 1)
Check if the track's native geometry is available in `tools/analysis/cache/lmu_all_trackmaps.json`:
1. Find the track's internal ID from LMU REST API (`GET http://localhost:6397/rest/race/tracks`).
2. If the API is running, query:
   ```bash
   curl -s http://localhost:6397/rest/race/track/{id}/trackmap > tools/analysis/cache/track_{slug}.json
   ```

### Step 3: Configure `TRACK_CONFIGS` in `buildAllTrackBoundaries.ts`
Add or update the track configuration entry:
```typescript
{
  layoutKey: 'sarthe_full',
  circuitId: 'sarthe',
  layoutId: 'full',
  trackVenue: 'Circuit de la Sarthe',
  trackCourse: 'Circuit de la Sarthe',
  sourceType: 'lmu_api',
  lmuTrackId: '4cdc72fe3acb2c912fd6cbd6828095625ba2d5a7',
  replayPattern: 'Circuit de la Sarthe P1 43.Vcr',
  preferredLap: 2,
  nominalWidthM: 13.5,
  sectionWidths: [
    { startM: 0, endM: 650, widthM: 15.5, description: 'Pit / Start-Finish straight' },
    { startM: 650, endM: 1150, widthM: 13.5, description: 'Dunlop Curve & Chicane' },
    // ...
  ]
}
```

### Step 4: Run the Pipeline Generator
Execute the automated generator script:
```bash
npx tsx tools/analysis/buildAllTrackBoundaries.ts
```

The script will automatically:
1. Reconstruct the physical road centerline from the fast path and signed curvature offsets.
2. Blend variable widths with $C^1$ continuity.
3. Extract pit lane, pit stalls, and grid slot infrastructure.
4. Align and roll the coordinates to the strictly perpendicular Start/Finish line.
5. Export synchronized JSON files to `server/data/tracks/` and `public/tracks/`.
6. Update `index.json` with the new track metadata and bounding boxes.

---

## 7. Standard Track Boundary JSON Schema

```typescript
export interface TimingGateGeometry {
  name: string;
  center: [number, number];   // [x, z] in LMU meters
  left: [number, number];     // [x, z] at left boundary
  right: [number, number];    // [x, z] at right boundary
  stationM: number;           // Distance from S/F line in meters
}

export interface TrackBoundaryGeometry {
  layoutKey: string;           // Canonical layout identifier (e.g. "sarthe_full")
  circuitId: string;           // Canonical circuit identifier (e.g. "sarthe")
  layoutId: string;            // Layout variant (e.g. "full", "gp")
  trackVenue: string;         // Official LMU session track_venue
  trackCourse: string;        // Official LMU session track_course
  lengthM: number;            // Total circuit perimeter length in meters
  source: string;             // e.g. "LMU-API+Telemetry", "TUM-survey", "track-atlas"
  transform?: {
    scale: number;            // Procrustes scale factor relative to LMU meters (1.0 for native)
    rotationDeg: number;      // Rotation angle in degrees
    tx: number;               // X-translation in LMU meters
    tz: number;               // Z-translation in LMU meters
    rmse: number;             // Fit error in meters
  };
  bounds: {
    minX: number; maxX: number;
    minZ: number; maxZ: number;
    spanX: number; spanZ: number;
  };
  leftBoundary: Array<[number, number]>;   // [[x, z], ...] in LMU meters
  rightBoundary: Array<[number, number]>;  // [[x, z], ...] in LMU meters
  centerline: Array<[number, number]>;     // [[x, z], ...] in LMU meters
  nominalWidthM?: number;
  startFinish?: [number, number];          // [x, z] coordinates of S/F crossing
  timingGates?: {
    startFinish: TimingGateGeometry;
    sector1?: TimingGateGeometry;
    sector2?: TimingGateGeometry;
  };
  elevationProfile?: number[];             // Altitude y (meters) for each centerline point
  pitLane?: {
    centerline: Array<[number, number]>;   // [[x, z], ...] along pit lane
    elevation?: number[];                  // Altitude y (meters) along pit lane
  };
  pitStalls?: Array<{
    id: number;
    center: [number, number];              // [x, z] pit box center
    widthM: number;
    angleDeg?: number;
  }>;
  gridSlots?: Array<{
    slot: number;                          // Starting grid position (1-based)
    center: [number, number];              // [x, z] grid box center
  }>;
  createdAt: string;
  updatedAt?: string;
}
```

---

## 8. GPS Map Rendering & Visualizer Quick-Start

In frontend React components such as `GpsTrackMapScene`:

```typescript
// 1. Fetch track boundaries by layoutKey (or use useTrackBoundaryGeometry hook)
const res = await fetch(`/tracks/${layoutKey}.json`);
const trackGeom: TrackBoundaryGeometry = await res.json();

// 2. Project coordinates to SVG canvas space
const projectPt = (x: number, z: number) => ({
  sx: offsetX + (x - trackGeom.bounds.minX) * scale,
  sy: viewBoxSize - (offsetZ + (z - trackGeom.bounds.minZ) * scale)
});

// 3. Render physical road surface polygon
const roadPolygon = [
  ...trackGeom.leftBoundary.map(([x, z]) => `${projectPt(x, z).sx},${projectPt(x, z).sy}`),
  ...[...trackGeom.rightBoundary].reverse().map(([x, z]) => `${projectPt(x, z).sx},${projectPt(x, z).sy}`)
].join(' ');

// 4. Render pit lane & start/finish line in SVG
// Road surface:
<polygon points={roadPolygon} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />

// Pit lane (if present):
{trackGeom.pitLane && (
  <polyline
    points={trackGeom.pitLane.centerline.map(([x, z]) => `${projectPt(x, z).sx},${projectPt(x, z).sy}`).join(' ')}
    fill="none"
    stroke="#64748b"
    strokeWidth={1}
    strokeDasharray="4 2"
  />
)}

// Start / Finish timing line:
{trackGeom.timingGates?.startFinish && (
  <line
    x1={projectPt(...trackGeom.timingGates.startFinish.left).sx}
    y1={projectPt(...trackGeom.timingGates.startFinish.left).sy}
    x2={projectPt(...trackGeom.timingGates.startFinish.right).sx}
    y2={projectPt(...trackGeom.timingGates.startFinish.right).sy}
    stroke="#38bdf8"
    strokeWidth={2.5}
  />
)}
```

