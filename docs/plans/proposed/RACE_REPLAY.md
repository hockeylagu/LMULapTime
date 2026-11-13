# Race replay: every car on the map and in 3D

Status: proposed 2026-11-08; decisions below are the user's. Order steps 1 and 2 implemented 2026-11-12:
pose windows, session clock, Race mode in the inspector, 2D map with every car, standings
tower; the followed car's incidents (pit stops, contacts, penalties) in a dropdown as in the game, a
hover tooltip for a car on the map or in the standings (no always-on labels: too crowded), gaps of a
minute or more as m:ss.s, live between line crossings; the lap map's toolbar and keys. Measured on Le Mans R1 (63 cars): a window is ~1 MB, 0.2–1.6 s the first time (worker
start + about 70 laps decoded), ~2 ms once its laps are cached. Next: step 3 (3D). Its first part is done: the followed car draws as one multi-draw per material content (94 → 33 draws for a median car; see REPLAY_3D_PERFORMANCE.md); the grid reuses those batches with an instance per car (about 5,700 → 200 draws for Le Mans R1, counted from the package).
Step 3 v1 implemented 2026-11-12: the race's 2D/3D button opens the scene shell shared with the lap view; the followed car is
its full model and the cameras ride on it. Since 2026-11-13 every other car is its body model too, at the body's own distance
levels (`extras.lod`, already in the package) instead of a class-coloured box (now only while a car loads, or a car without
a body): liveries of one body share its GLB and parsed geometry, the other cars draw part by part (no per-car batch copy, which
held ~3 GB for 41 cars), drop their interior parts, update their matrices once per frame and are skipped out of view. Cost
(dev build, headless Edge, 1080p): bunched start of 44 cars 48–65 fps at ~1,800–2,400 draws against 134–167 fps with boxes;
spread field ~75–120 fps against ~110–145. Memory keeps only what draws: GLB bytes are read for the parse only and the
race's vertex buffers leave the CPU once uploaded (Le Mans start, 61 cars: JS heap 3.6 → 2.5 GB, CPU car geometry 680 → 51 MB;
the ~0.9 GB of car textures still keep their CPU levels for mip streaming). Since then the field draws from batches shared by
the cars of each body (18 bodies, 42 liveries for 62 cars at Le Mans): 2,884 → 1,747 draws at the start, one GPU copy per
body, but the same ~35 fps: the frame is bound by the main thread (per-draw work ~25 %, wheel ground rays ~12 %, matrix walk
~8 %), and a body still splits into ~60 batches, one per material. Each car's wheel build and road fit now wait until the car is
drawn (out-of-view cars no longer refit at each window or scenery change; not yet benchmarked). Since the car renderer rework
(2026-11-13, REPLAY_3D_ARCHITECTURE.md R1–R5) the field draws by tier: the nearest 6 cars in view inside their body's far
distance (`far.fromM`, from package schema 13) as full models with wheels, lamps and shadows, every other car in view as its
body's far model (a few primitives, liveries retextured, batched per body, still, no shadows), out of view nothing; the lap
view and the race share one part table, batching and wheel motion (`view3d/cars/`). Not yet benchmarked (once, after all the
architecture items). The
scenery streams ahead of the followed car by its station from the progress grid; trackside spots stand along the followed
car's samples of the pose window; a followed car still in its garage box puts the camera on its nearest pose or the first car
on track. The full models roll, steer and travel their suspension and light their lamps from the window (2026-11-13: the
windows carry steering, brake, a lamp bitmask and the four deflections, 15 channels, about 1.6 MB for 45 cars). Not yet: the
game clock's daylight, labels.

## Goal

Play back a whole session like the game's replay viewer: every car on the 2D map and in the 3D
view on one session clock, with seek, playback speed and a followed car. Any session type
(practice, qualifying, race).

## Decisions

| Topic | Decision |
|---|---|
| Scope | Full race playback now (not "traffic in my lap" first). |
| Where | A **Race** mode in the replay inspector, beside the current lap view; the lap view and ghost sync stay as they are. |
| Sessions | All session types. |
| Data | Built **on demand** from the stored laps into a server memory cache; no new database table. |
| 3D cars | Full models for the followed car and the few nearest; **low-poly LOD cars with the real livery** for the rest. |
| Cameras | Chase / Cockpit / Hood / Roof on any car, trackside cameras following the selected car, free orbit. |
| Overlays (v1) | Standings tower, the followed car's incidents (pit, contact, penalty) in a dropdown, a car tooltip on hover (no always-on labels). Flags and weather later. |

## What already exists

- `replay_trajectories` holds **every car, every lap, at the replay's full rate** (~50 Hz). Le Mans
  R1 47: 63 cars, 735 laps, 72 MB; a lap blob is ~98 KB, ~16k samples, decoded whole.
- Each car's skin id is in the replay header; the package maps it to a body and an appearance (livery).
- Race-wide tables: `replay_running_order` (order over time), `replay_driver_events` (pit, contact,
  penalty), `replay_conditions`, `replay_driver_roster`.
- 3D: the whole circuit is loaded once, only the view window drawn (`fbc30866`); trackside cameras,
  driver cameras and chase tracking exist for one car.

## Work

### 1. Pose stream (server)

- New service reading the pose columns (x, y, z, attitude, speed, garage state) of every car's laps
  that overlap a session-time window, resampled to a fixed rate on the session clock.
- Windows of ~60 s, fetched ahead of the cursor; a byte-bounded LRU in memory on the server.
  Binary response (Float32 columns per car), not JSON.
- Sizing: 60 cars × 60 s × 10 Hz × ~32 B ≈ 1.2 MB per window raw. Rate to settle with a playback check
  (10 Hz + interpolation vs 20 Hz).
- Cost: first seek ~0.5–1 s (each overlapping lap blob is decompressed whole); decode in a worker so
  the event loop stays free (rule D in AGENTS.md).
- Cars in the garage or between gaps are hidden, using the stored garage state (no position is
  guessed across a gap).

### 2. Session clock (client)

- A race cursor on session time, separate from the lap cursor: play/pause, 1×–16×, seek, jump to an event.
- Selected car = the followed car; picking a car in the tower, on the map or in 3D sets it.
- Switching back to the lap view opens the followed car's lap at the cursor (and the reverse).

### 3. 2D map

- One marker per car from the package outline (`outlineXZ`), class colour, label; click to follow.
- Racing lines and the heatmap stay lap-view only.

### 4. 3D

- **Pipeline exporter**: a low-poly body per car model (~3–5k triangles, one material) plus a small
  livery texture per appearance. The package grows by a few MB per model; agree the budget with the
  pipeline session (the user wants the package to stay small).
- App: done without a pipeline step, from the bodies' own distance levels (see the status above); a low-poly export stays an
  option if the draw count of a full field needs it.
- Budget: the 16 ms frame target. A full model is ~100 draws (116 materials on the 911), so 60
  full cars (~6,000 draws ≈ 36 ms) are out of reach.
- Labels above the cars: one screen-space layer, not per-car meshes.
- Cameras: driver cameras and chase retarget to the selected car; trackside cameras switch by the
  selected car's position.

### 5. Overlays

- Standings tower from `replay_running_order` (class order, gaps), clickable. Race gaps are live: the time since the class
  leader passed the car's place on the track on the same lap, from the traffic index of every car's track distance.
- Incidents of the followed car from `replay_driver_events` in a dropdown (what, who, when); a pick seeks 3 s before.
- A car's timing line as a tooltip when it is hovered on the map or in the standings.

## Impact

- Inspector: the URL gains the mode and session time; the lap view, ghost sync and telemetry strips
  are unchanged. The 300-line component limit means the race mode has its own components.
- Server memory: bounded by the window LRU; no change to the database or `REPLAY_CACHE_VERSION`.
- Package: new LOD assets (pipeline), so a manifest schema step and `bodyPackage.ts` validation.
- Performance: run the 3D harness (`benchmark:replay3d`) on a full grid at Le Mans and Daytona.

## Order

1. Pose stream + session clock + 2D map with all cars and the tower (no pipeline dependency).
2. Incidents dropdown and hover tooltips.
3. 3D with full models near the camera and class-coloured boxes as a temporary far LOD.
4. Every car its body model at the body's distance levels (done 2026-11-13), then near full models and the package's far
   models by tier (done 2026-11-13).

## Open

- Pose rate (10 vs 20 Hz) after a playback check.
- Frame rate of a bunched full field with the far models: measured once with the architecture bench (REPLAY_3D_ARCHITECTURE.md V).
