# 🏎️ Track Boundaries Pipeline & Geometry Reference Guide

This document describes the automated physical track boundaries pipeline for **Le Mans Ultimate (LMU)**, how track corridor geometries are generated and aligned, and the exact process to follow whenever a **new track or layout variant** is driven.

---

## 1. Overview & Purpose

In motorsport telemetry analysis, knowing the car's telemetry line alone does not reveal whether the driver was using the entire width of the road, clipping apex kerbs, or exceeding track limits. 

The **Track Boundaries Pipeline** generates and maintains exact 2D boundary polygons:
- **`leftBoundary`**: Outer left track limit coordinates `[x, z]` in LMU local meters.
- **`rightBoundary`**: Outer right track limit coordinates `[x, z]` in LMU local meters.
- **`centerline`**: Physical track center coordinates `[x, z]`.
- **`bounds`**: Bounding box `{ minX, maxX, minZ, maxZ, spanX, spanZ }`.

Because all coordinates are pre-aligned and stored in **LMU world Cartesian meters**, frontend map components (like `GpsTrackMapScene`) can directly render the physical road surface ribbon and kerb limits without performing heavy coordinate projections or alignments on the fly.

---

## 2. Directory & File Layout

```
LMULapTime/
├── tools/analysis/
│   ├── cache/                           # Cached raw external sources (.csv, .geojson)
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

Tracks are acquired through a 3-tier hierarchy:

### Tier 1: Surveyed Boundaries (TUM Racetrack Database)
- **Source**: [TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database)
- **Included Tracks (7)**: Monza GP, Spa-Francorchamps, Circuit of the Americas (COTA), Circuit de Barcelona-Catalunya, Interlagos, Silverstone GP (WEC), Bahrain GP (WEC).
- **Format**: High-frequency metric survey points `# x_m, y_m, w_tr_right_m, w_tr_left_m`.
- **Processing**: Standard Procrustes similarity alignment ($s, \theta, t_x, t_z$) matching LMU replay telemetry. LMU modeling scale matches TUM to within $0.05\%$.

### Tier 2: Curvature-Adaptive Centerlines (Track-Atlas / OSM GPS)
- **Source**: [tobi/track-atlas](https://github.com/tobi/track-atlas) & OpenStreetMap
- **Included Tracks (6)**: Circuit de la Sarthe (24h Le Mans), Autodromo Enzo e Dino Ferrari (Imola), Daytona Road Course, Fuji Speedway (GP), WeatherTech Raceway Laguna Seca, Sebring International Raceway (Full WEC).
- **Format**: WGS-84 GPS coordinates `[lon, lat]`.
- **Processing**:
  1. Transverse Mercator projection to metric coordinates $(x, y)$.
  2. Uniform resampling at 2.5-meter step intervals.
  3. 5-point moving average smoothing.
  4. Unit normal vector displacement according to official FIA / ACO circuit homologation road widths (12.0m to 15.0m).
  5. Optimal similarity alignment with LMU replay telemetry.

### Tier 3: Layout Variants & Custom Connectors (LMU Native Telemetry Corridors)
- **Source**: High-frequency replay streams stored in `server/lmu_cache.db`.
- **Included Layouts (8)**:
  - `monza_curvagrande`: Autodromo Nazionale Monza bypassing Prima Variante.
  - `fuji_classic`: Fuji Speedway straight bypassing Dunlop chicane.
  - `bahrain_outer`: Bahrain Outer Circuit.
  - `bahrain_paddock`: Bahrain Paddock Circuit.
  - `portimao_wec`: Algarve International Circuit (WEC 2023 layout with T1-T2 hairpin connector).
  - `sebring_school`: Sebring School Circuit.
  - `qatar_short`: Lusail Short Circuit.
  - `paul_ricard_1a_v2_short`: Paul Ricard 1A-V2-Short layout.
- **Processing**:
  Clean flying laps extracted from the replay cache provide ground truth physics coordinates in native 1:1 metric space ($s = 1.0, \theta = 0.0^\circ$). Unit normals are derived to project standard FIA corridor widths, perfectly matching connected parent tracks.

---

## 4. All 21 Driven Tracks & Layouts Reference

| Layout Key | Circuit ID | Layout ID | Venue Name | Course Name | Length | Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `monza_gp` | `monza` | `gp` | Autodromo Nazionale Monza | Autodromo Nazionale Monza | 5,787.7 m | TUM-survey |
| `monza_curvagrande` | `monza` | `curvagrande` | Autodromo Nazionale Monza | Monza Curva Grande Circuit | 5,730.6 m | telemetry-corridor |
| `spa_gp` | `spa` | `gp` | Circuit de Spa-Francorchamps | Circuit de Spa-Francorchamps | 6,968.9 m | TUM-survey |
| `sarthe_full` | `sarthe` | `full` | Circuit de la Sarthe | Circuit de la Sarthe | 13,621.2 m | track-atlas |
| `cota_gp` | `cota` | `gp` | Circuit of the Americas | Circuit of the Americas | 5,509.2 m | TUM-survey |
| `barcelona_gp` | `barcelona`| `gp` | Circuit de Barcelona | Circuit de Barcelona | 4,648.3 m | TUM-survey |
| `interlagos_gp` | `interlagos`| `gp` | Autódromo José Carlos Pace | Autódromo José Carlos Pace | 4,281.7 m | TUM-survey |
| `silverstone_wec` | `silverstone`| `gp` | Silverstone Circuit | Silverstone Grand Prix Circuit - WEC | 5,869.8 m | TUM-survey |
| `bahrain_wec` | `bahrain` | `wec` | Bahrain International Circuit | Bahrain International Circuit | 5,390.6 m | TUM-survey |
| `bahrain_outer` | `bahrain` | `outer` | Bahrain International Circuit | Bahrain Outer Circuit | 3,487.9 m | telemetry-corridor |
| `bahrain_paddock` | `bahrain` | `paddock` | Bahrain International Circuit | Bahrain Paddock Circuit | 3,836.8 m | telemetry-corridor |
| `imola_gp` | `imola` | `gp` | Autodromo Enzo e Dino Ferrari | Autodromo Enzo e Dino Ferrari | 4,901.4 m | track-atlas |
| `daytona_road_course` | `daytona` | `road_course` | Daytona International Speedway | Daytona International Speedway Road Course | 5,680.1 m | track-atlas |
| `fuji_chicane` | `fuji` | `chicane` | Fuji Speedway | Fuji Speedway | 4,535.4 m | track-atlas |
| `fuji_classic` | `fuji` | `classic` | Fuji Speedway | Fuji Speedway Classic | 4,471.5 m | telemetry-corridor |
| `portimao_wec` | `portimao` | `wec` | Algarve International Circuit | Algarve International Circuit | 4,695.3 m | telemetry-corridor |
| `sebring_full` | `sebring` | `full` | Sebring International Raceway | Sebring International Raceway | 5,858.4 m | track-atlas |
| `sebring_school` | `sebring` | `school` | Sebring International Raceway | Sebring School Circuit | 3,079.8 m | telemetry-corridor |
| `laguna_seca` | `laguna_seca`| `full` | WeatherTech Raceway Laguna Seca | WeatherTech Raceway Laguna Seca | 3,599.9 m | track-atlas |
| `qatar_short` | `qatar` | `short` | Lusail International Circuit | Lusail Short Circuit | 3,660.7 m | telemetry-corridor |
| `paul_ricard_1a_v2_short` | `paul_ricard`| `1a_v2_short`| Paul Ricard Circuit | Paul Ricard - 1A-V2-Short | 5,145.4 m | telemetry-corridor |

---

## 5. How to Add a Newly Driven Track or Layout

Whenever a new circuit or layout is added to LMU (e.g. Nürburgring Nordschleife, Qatar GP, Paul Ricard 1A-V2 full):

### Step 1: Record or Import Session / Replay
Drive or import at least one session so that a clean flying lap exists in `UserData/LOG/Results/*.xml` or `UserData/Replays/*.Vcr`. Rescan or allow the background ingestion engine to register the replay in `server/lmu_cache.db`.

### Step 2: Check Existing External Sources
1. Check if the circuit exists in TUM:
   ```bash
   curl -s https://raw.githubusercontent.com/TUMFTM/racetrack-database/master/tracks/{TrackName}.csv -o tools/analysis/cache/{TrackName}.csv
   ```
2. Or check if the circuit exists in track-atlas:
   ```bash
   curl -s https://raw.githubusercontent.com/tobi/track-atlas/main/tracks/{slug}/raw/layers/{layout}.geojson -o tools/analysis/cache/{slug}_{layout}.geojson
   ```

### Step 3: Add Configuration to `TRACK_CONFIGS`
Open [tools/analysis/buildAllTrackBoundaries.ts](file:///c:/Documents/LMULapTime/tools/analysis/buildAllTrackBoundaries.ts) and add the track entry:

```typescript
{
  layoutKey: 'new_track_gp',
  circuitId: 'new_track',
  layoutId: 'gp',
  trackVenue: 'Venue Name in LMU',
  trackCourse: 'Course Name in LMU',
  sourceType: 'TUM', // or 'atlas' or 'telemetry'
  sourceFile: 'NewTrack.csv',
  replayPattern: 'Venue Name P1 1.Vcr',
  preferredLap: 2,
  nominalWidthM: 12.0,
}
```

### Step 4: Run the Generator
Execute:
```bash
npx tsx tools/analysis/buildAllTrackBoundaries.ts
```

The script will automatically:
1. Load the raw survey or replay telemetry.
2. Execute the multi-orientation Procrustes alignment.
3. Validate scale ($0.99 < s < 1.01$), rotation angle, and RMSE.
4. Output the standardized JSON geometry to `server/data/tracks/` and `public/tracks/`.
5. Update `index.json` with the new track metadata.

---

## 6. Standard Track Boundary JSON Schema

```typescript
export interface TrackBoundaryGeometry {
  layoutKey: string;           // Unique layout identifier (e.g. "monza_gp")
  circuitId: string;           // Canonical facility identifier (e.g. "monza")
  layoutId: string;            // Layout variant (e.g. "gp", "curvagrande")
  trackVenue: string;         // Official LMU session track_venue
  trackCourse: string;        // Official LMU session track_course
  lengthM: number;            // Total circuit perimeter length in meters
  source: 'TUM-survey' | 'track-atlas' | 'OSM-FIA-profile' | 'telemetry-corridor';
  transform?: {
    scale: number;            // Procrustes scale factor relative to LMU meters
    rotationDeg: number;      // Rotation angle in degrees (-180° to 180°)
    tx: number;               // X-translation in LMU meters
    tz: number;               // Z-translation in LMU meters
    rmse: number;             // Fit error in meters
  };
  bounds: {
    minX: number; maxX: number;
    minZ: number; maxZ: number;
    spanX: number; spanZ: number;
  };
  leftBoundary: Array<[number, number]>;   // [[x, z], ...]
  rightBoundary: Array<[number, number]>;  // [[x, z], ...]
  centerline: Array<[number, number]>;     // [[x, z], ...]
  nominalWidthM: number;
  createdAt: string;
}
```

---

## 7. GPS Map Rendering Quick-Start (For Future Prompts)

In frontend components such as `GpsTrackMapScene`:

```typescript
// 1. Fetch track boundaries by layoutKey
const res = await fetch(`/tracks/${layoutKey}.json`);
const trackGeom: TrackBoundaryGeometry = await res.json();

// 2. Project directly using the existing projectTrajectoryPoints utility
const projectPt = (x: number, z: number) => ({
  sx: offsetX + (x - bounds.minX) * scale,
  sy: viewBoxSize - (offsetZ + (z - bounds.minZ) * scale)
});

// 3. Render road polygon
const polyPoints = [
  ...trackGeom.leftBoundary.map(([x, z]) => `${projectPt(x, z).sx},${projectPt(x, z).sy}`),
  ...[...trackGeom.rightBoundary].reverse().map(([x, z]) => `${projectPt(x, z).sx},${projectPt(x, z).sy}`)
].join(' ');

// In JSX:
<polygon points={polyPoints} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
```
