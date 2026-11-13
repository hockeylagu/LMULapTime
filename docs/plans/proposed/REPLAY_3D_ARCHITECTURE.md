# Replay 3D architecture: one shape for the lap and race views

Status: in progress (2026-11-13). The user approved the whole plan ("yes do everything"). This file is the shared reference for the
sessions doing it; each owner updates its own rows. Measurements behind it: the race session's Le Mans start bench
(2026_10_22_14_49_23-99R1, 62 cars, ~35 fps, main-thread bound: per-draw work ~25 %, ground rays ~12 %, matrix walks ~8 %,
exposure readback ~2.8 %).

## Target shape

- **Scene shell** (`view3d/scene/sceneShell.ts`): renderer, scenery stream, environment, exposure, rig, warm-up, draw loop. Exists.
- **Asset store** (one per page): body fetch with the package revision check, parsed templates, textures, cabin volumes and far
  models, shared by every car and released when no car uses them.
- **Car renderer** (`view3d/cars/`): a flat part table per car (anchor = body, 4 wheels or steering wheel; fixed matrix relative
  to it), one batching system, tiers followed / near / far (v16 far model from `fromM`) / out of view with hysteresis; shadows
  only for followed and near.
- **Car track**: pose at time t plus the channels the wheels and lamps read, as typed arrays. A lap is one track on a clock over
  lap time (the ghost a second, synced); the race is the same clock with many tracks.
- **Car motion**: wheels and lamps built lazily from a car track, followed and near tiers only.
- **Scene host**: one hook and one 3D frame component with a content slot (lap or race), kept loaded behind 2D.
- **Road height**: a per-layout road height grid baked by the pipeline from the same scenery files; wheel height is a lookup, so the
  wheel ground ray casts and the `refreshHeights` chain go (the camera's ground checks stay).

## Work items

| # | Item | Owner | When | State |
|---|---|---|---|---|
| R1 | Part table + one batching system (`view3d/cars/`) | Race replay session | now (rework step 2) | done, uncommitted: `cars/carParts.ts`, `cars/carBatching.ts` (the release helper later folded into `batching/batchedParts.ts`, R7); `carBatches.ts`, `fieldBatches.ts` removed |
| R2 | Asset store, including body fetch for both hooks (catalog) | Race replay session | with R1 | done, uncommitted: `api/vehicles/bodyStore.ts` (one fetch per VEH id and revision; the race now checks bodies against the scene's revision), `cars/carTemplates.ts` (one parse per body per scene, shared by the lap, followed and near loaders; on the shell), `cars/carModels.ts` (livery models). A scene keeps its parsed bodies, livery textures and cabin volumes (about +530 MB over the first 13 s of play at the Le Mans start); releasing them when no car uses them was declined (user, 2026-11-13): a car coming near again would re-parse |
| R3 | Car track interface; car motion from it (rework step 3) | Race replay session | after R1 | done, uncommitted: `cars/carMotion.ts` (one lazy wheels-and-lamps motion for lap and race, `setTrack(key, source)`, `refreshHeights` kept; `placeCar(car, pose, motion)`); `race/raceTrack.ts` keeps `windowPoints`. Typed-array channels deferred: only drawn cars build their samples (followed and near once R4 lands), and `wheelAnimation` reads lap samples throughout |
| R4 | Tiers with the v16 far model; shadow policy (step 4) | Race replay session | after R3 | done, uncommitted: `cars/farCars.ts` (far model per livery, option triangles filtered, start-file textures), `race/raceField.ts` (near = nearest 6 in view inside `fromM`, entering at 0.85·`fromM`; far batched per body, no shadows; out of view hidden; the full models kept for smooth grid traversal, the user's pick 2026-11-13; since v2 P1 built per body and batched together, see REPLAY_3D_RENDERER_V2.md). Every car under the content root casts only in the live cascades (`setDynamic`, ≤ 100 m), so near cars need no flag |
| R5 | Lap view on the renderer (step 5) | Race replay session | after R4 | done, uncommitted: `cars/drawnCar.ts` (part table, own batches, motion) draws the lap car and ghost, the race's followed car and its near cars |
| R6 | Scene host: one hook + one 3D frame | Race replay session | after R5 | done, uncommitted: `scene/useSceneHost.ts`, `scene/Scene3DFrame.tsx`; both hooks and views on them; the race view now stays loaded behind 2D like the lap view |
| R7 | One batching utility for scenery and cars | Race replay session | after R5 | done, uncommitted: `batching/batchedParts.ts` used by `scenery/sceneryBatches.ts` and `cars/carBatching.ts` (scenery behaviour and the M2 release unchanged) |
| R8 | `lapLayer.ts` reduced to lap content; folder moves (`camera/`, wheel files into `cars/`, `scene/`) | Race replay session | last | done, uncommitted: `lapLayer.ts` 332 → 108 lines; `camera/` (6 files), wheel files and `sceneObjects.ts` in `cars/`, `replayScene.ts`, `racingLine.ts`, `Replay3DView.tsx` in `laps/`, pose, frame and loading files in `scene/` |
| M1 | Car and scenery texture levels: drop CPU copies once on the GPU (restored context re-reads the file) | 3D replay fidelity session | now | done, uncommitted (car textures without a start file via the race session's `sceneShell.ts` line) |
| M2 | Scenery geometry CPU copies after upload (a material's batches release after its last chunk; streaming peak unchanged) | 3D replay fidelity session | now | done, uncommitted |
| M3 | Exposure readback cost (one reused pack buffer, fence polled on the frame clock) | 3D replay fidelity session | now | done, uncommitted |
| H1 | Road height grid in the package: added to personal-v16 (schema 13), which is not accepted and serves this refactor. 0.25 m cells, 64-cell tiles over a 5 m corridor beyond the road edges (user's pick, 2026-11-13), uint16 heights, ambiguity bits. The app takes the nearest cell where the four corners spread over 0.1 m (steps); finer kerb tiles only if the first build's errors call for it | Pipeline exporter | now | done: personal-v16 rebuilt with 32 grids (candidate, not accepted); second-difference step rule (pipeline 2b5e89d, app reader matches) |
| H2 | App reads the height grid for wheel contact; wheel ground rays and `refreshHeights` removed (the camera's ground clearance and obstruction checks keep their own ground). The grid covers the happy path (road, kerbs, pit lane, a narrow margin); off the grid or on a no-data cell, the wheel falls back to the existing ray cast (user's choice, 2026-11-13: smaller grid). refits stay: on the grid they are lookups | 3D replay fidelity session, with the race session for its files | after H1 and R3 | done, uncommitted (grid read with the layout in `fetchSceneryLayout`; `surfaceHeight` grid first, rays off it or outside the query window; refit kept, now lookups on the grid); in-app check waits on the rebuilt v16 |
| V | Bench the Le Mans start and the lap view's reference captures (memory and frames) | 3D replay fidelity session | once, after all items land (user, 2026-11-13) | done 2026-11-13, results below |

## Rules every session keeps

- One writer per file. Race session: `view3d/cars/` (but `cars/wheelAnimation.ts`), `race/`, `laps/`, `camera/`, `batching/`,
  `scene/`. Fidelity session: `scenery/`, `autoExposure.ts`, `car/carReflection.ts`, `car/cockpitOcclusion.ts`,
  `car/carMaterials.ts`, `cars/wheelAnimation.ts`, `scenery/sceneWarmup.ts`. Message the owner before editing the other's files.
- Invariants: one reflection probe on the followed car; cockpit occlusion through `createCarMaterial`; car textures sharpen first;
  `fitToRoad` captures `restY` at creation and wheel pivots start at their hubs (until H2 replaces the fit); the 3D view stays
  loaded behind 2D.
- Game values come only through the package; no fallbacks. Commit only on the user's word in that session; never push.
- Measure before and after in a production build (headless browser), not in the hidden pane.

## Results (2026-11-13, all items in the working tree, personal-v16, production build, headless Edge, 1920x1080 DPR 1, RTX 5070 Ti)

Le Mans start (2026_10_22_14_49_23-99R1, t = 190, 62 cars, chase view, 10 s at 1x after 3 s), median of 3 runs; before = the race
session's release-c2 / field-c2-ready rows:

| | Before | After |
|---|---|---|
| fps | 35 / 34 | 54 |
| frame p50 / p95 | 24.5 / 32.4 ms; 24.4 / 40.5 ms | 15.8 / 34.3 ms |
| JS heap after load (GC'd) | 2,459 / 2,994 MB | 1,160 MB (1,690 MB after 13 s of play) |
| triangles per frame | 33.7 M | 33.7 M |
| load | 29 / 31 s | 31.9 s |

Draws are not compared: before counted three's render calls, after counts WebGL draw calls (1,404 a frame, shadow and post passes
included).

Lap view reference suite (`npm run benchmark:replay3d:suite`, 3 runs, medians; before = suite-v13-batched4, 1 run, 2026-11-12):

| | Fuji before / after | Silverstone before / after |
|---|---|---|
| frame p50 / p99 | 6.4 / 22.0 → 6.7 / 18.2 ms | 6.2 / 24.9 → 6.3 / 24.7 ms |
| frames over 16 ms | 79 → 65 | 104 → 93 |
| JS heap | 1,903 → 469 MiB | 1,819 → 439 MiB |
| first frame | 4.7 → 5.6 s | 4.7 → 5.0 s |

Open: the race heap grows ~530 MB in the first 13 s of play (cars entering the near tier load their full models); first frame in the
lap view is 0.3–0.9 s slower (the height grid and the per-body asset store load before it).

