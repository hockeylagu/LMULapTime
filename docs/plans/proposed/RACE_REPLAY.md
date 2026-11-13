# Race replay: every car on the map and in 3D

Status: proposed 2026-11-08; decisions below are the user's. Order steps 1 and 2 implemented 2026-11-12
(uncommitted): pose windows, session clock, Race mode in the inspector, 2D map with every car, standings
tower; the followed car's incidents (pit stops, contacts, penalties) in a dropdown as in the game, a
hover tooltip for a car on the map or in the standings (no always-on labels: too crowded), gaps of a
minute or more as m:ss.s. Measured on Le Mans R1 (63 cars): a window is ~1 MB, 0.2–1.6 s the first time (worker
start + about 70 laps decoded), ~2 ms once its laps are cached. Next: step 3 (3D). Its first part is done: the followed car draws as one multi-draw per material content (94 → 33 draws for a median car; see REPLAY_3D_PERFORMANCE.md); the grid reuses those batches with an instance per car (about 5,700 → 200 draws for Le Mans R1, counted from the package).

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
- App: instanced LOD bodies per model, livery per instance (texture array or atlas); full models for
  the followed car and the N nearest (N from a frame-time check, start at 3); swap with hysteresis.
- Budget: the 16 ms frame target. A full model is ~100 draws (116 materials on the 911), so 60
  full cars (~6,000 draws ≈ 36 ms) are out of reach.
- Labels above the cars: one screen-space layer, not per-car meshes.
- Cameras: driver cameras and chase retarget to the selected car; trackside cameras switch by the
  selected car's position.

### 5. Overlays

- Standings tower from `replay_running_order` (class order, gaps), clickable.
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
4. Pipeline LOD export with liveries, then swap the boxes for it.

## Open

- Pose rate (10 vs 20 Hz) after a playback check.
- Number of full-detail cars after a frame-time check.
- LOD package budget, agreed with the pipeline session.
