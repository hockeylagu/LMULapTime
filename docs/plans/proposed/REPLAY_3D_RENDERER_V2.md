# Replay 3D renderer v2: draw sets from the package, not scene graphs

Status: in progress (2026-11-13). The user started P0a, P0b and P1 ("Start P0a, P0b, P1"); the rest awaits them. Follows [REPLAY_3D_ARCHITECTURE.md](REPLAY_3D_ARCHITECTURE.md) (R1–R8 done).
The user's direction (2026-11-13): stop fighting the renderer, lean on what we control end to end (pipeline, package, app), and
rewrite where it buys flexibility, simplicity and speed. The race is the stress case; the lap view uses the same code.

## Where the frame goes today

Le Mans start, 62 cars, personal-v16, production build, RTX 5070 Ti, 1920x1080 (fidelity bench V and its CPU profile):

- 54 fps, p95 34 ms, **1,402 draws**, **33.7 M triangles**, main-thread bound.
- Profile (inclusive): `WebGLRenderer.render` 70 %; per-object draw work 48 % of which `setProgram` 36 % and uniform upload 15 %;
  `updateMatrixWorld` 9.8 %; `projectObject` 8.6 %; React ~3 %; the GPU multi-draw itself 2.2 %.
- `updateMatrixWorld` is three's own `scene.updateMatrixWorld()` at the top of every `render()` call: 4 near shadow layers (6.7 %),
  the main pass (1.7 %), the environment update (1.3 %). What it still walks is the content root: one group per far car.
- Near shadow layers (≤ 96 m, redrawn each frame) A/B, two clean rounds: scenery only 66 / 61 fps, everything 53 / 51 fps.
  The cars there cost 10–13 fps (~370 draws, ~5 M triangles); the batched scenery is nearly free. Each layer swaps depth
  materials over a full scene traversal.
- Even without car shadows the race start draws ~1,030 times a frame (13 ms) against the lap view's ~180 (6–7 ms). The
  ~850 extra are the 62 cars in the main view, the far shadow layers and the probe: **the target is car draws in every pass,
  not the scenery.**

Why it costs that much (package survey, 41 bodies):

- A body is 53–146 mesh nodes and **72–172 materials, one primitive per material**; 261–753 k triangles over all levels;
  360–470 k drawn at 0 m. The app batches per material, so a near car is ~30–170 batches, and each near car **copies** its own.
- Distance levels are per part (13–30 distinct bands per body from the game), not a ladder, and the lowest kept level is still
  60–190 k triangles at 400 m. The v16 far model is 106–238 k triangles: 62 far cars are most of the 33.7 M.
- Materials differ in program because flags and the set of maps are code-generated per material (~10–25 programs per body),
  and per-material state (alpha mask, blend, side). Paint is already close to one program (≤ 4 variants).
- Livery albedo and paint region maps are all 2048² with full mips; ~96 % BC7, a few BC3/BC1 (v14 keeps the game's blocks).
  Paint parameters vary per livery (1–63 sets per body); the other paint maps are per body.

The cost is not the GPU: it is three walking ~1,400 objects and ~10–25 programs per pass, five-plus passes a frame.

## Target shape

1. **A body is a draw set, built by the pipeline.** Per body, per anchor (chassis, four corner wheels, steering wheel): merged
   geometry per distance tier with a per-vertex **material index** (and `_LMU_OPTION` kept for option parts), in a few groups
   by render state from our surface data (opaque, alpha-masked, blended, lamps). Wheels stay one geometry per corner (front and
   rear differ in size on every body, left and right are authored apart, mirroring would reverse sidewall text and break face
   winding); byte-identical corners share one geometry id, and four ids in one batch are still one draw. Tiers: near (the
   game's full parts), mid (the parts drawn at a distance the app sets, `mid.fromM`, the same rule as today's far), far (the
   game's lowest kept levels, as today's far model, lamps as a group). The package stays true to the game files: no decimated or
   invented parts (the user, relayed by the exporter session 2026-11-13). The materials table ships as data, not as GLB materials.
2. **One GPU set per body in the app.** One `BatchedMesh` per render-state group per body, holding every tier as alternative
   geometries; a car is a handful of instances (chassis, 4 wheels, steering wheel) whose tier is `setGeometryIdAt`. No per-car
   `Object3D`, no per-car batch copies, no stand-in meshes, nothing for three to walk. A car coming near costs a geometry id
   change, so the near-model loading, `NEAR_KEPT` and the far/near swap go.
3. **One car material per group** (an uber shader built from today's shader parts): per-material data (finish, flags, detail
   strengths, UV scales, alpha mode) in a data texture read by the material index; per-car data (livery layer, paint regions,
   lamp state) in a data texture read by the instance id (three r186 gives `getIndirectIndex(gl_DrawID)` and the colour texture).
   Livery albedo and region as **texture arrays per body built by the app** from the per-livery KTX2 files it already loads
   (one layer per upload), only for the session's liveries, grouped by block format so the v14 decision stands. The package
   ships no array files.
4. **One visibility pass per frame** decides each car's tier, visibility, shadow casting and matrices; nothing else toggles
   `visible`. The scene's matrices update once per frame (`scene.matrixWorldAutoUpdate = false`).
5. **Shadows read the same decision**: casters are the followed car plus the nearest N; one traversal and one depth-material
   swap per frame for all live layers, each layer still culling by its own frustum.
6. **The followed car keeps its detail path**: reflection probe, cockpit interior and occlusion, lamps in full; the same draw
   set with its own material variant (probe cube, cockpit define) and its own instances.
7. **The lap view is the same thing with one or two cars**; the ghost is a transparent variant of the set.

## Targets and validation

The user (2026-11-13) made the 3D replay fidelity session the orchestrator and validator: one scene for the lap view (one car,
compared) and the race (the whole grid), the render technique that reaches the targets below, fast loading. The race replay
session does the app work, the Pipeline exporter the package work; personal-v16 may change as often as needed. The package sends
layout and order that make the app's work easy (merged anchors, material tables, texture groups) while staying true to the game
files; it never says how to display.

| Measure (production build, headless Edge, 1920x1080, this machine) | Now | Target |
|---|---|---|
| Le Mans start, 62 cars, chase: draws per frame | ~1,400 | low hundreds |
| Le Mans start: frame p50 / p95 | 15.8 / 34 ms | ≤ 10 / ≤ 16.7 ms (main thread no longer the limit) |
| Lap view (Fuji, Silverstone): frame p50 / p99 | 6.7 / 18–25 ms | no worse; p99 ≤ 16.7 ms |
| Load: lap first frame / race start loaded | 5.0–5.6 s / 32 s | no slower; race faster |
| JS heap: lap / race start | 0.44–0.47 / 1.16 GB | no higher |
| Race: follow switch to a car whose body is near / not near | 0.87 / 1.02 s | no slower |
| Look | freeze3 | within the freeze3 harness's noise (dE, in-band count); a visible change goes to the user |

One bench at a time, never during a build or export; each session checks before it builds.

Heap and follow switch (2026-11-13, JS heap after GC, Le Mans start paused, 3 interleaved rounds, median and range). Each build
drops a body's parse once its cars are built (`releaseParsed`, parses evicted when settled), and the race holds the parse of each
body with cars near the camera (`CarTemplates.hold`) until none is near. Holding it made the switch to a car whose body is near
874 ms (859–875) instead of 1,162 ms (1,072–1,220); a switch to a body that isn't near stays at 1,024 ms (995–1,042). The heap is
990 MB once the field has loaded (841 MB without holding) and 1,118 MB after both switches (898 MB). The margin to the 1.16 GB target is
thin, so every heap change is measured after switches as well as at the start. Of a switch that parses, the GLB files (25 MB)
arrive within ~70–130 ms and the textures within ~240 ms; the rest is parse, build and warm-up. A held switch still costs ~870 ms
building the followed car, which stays a set of its own beside its body's near set.

Load is measured cold: the suite starts each run on a fresh browser profile, so every shader program compiles from nothing. The
browser keeps compiled programs in its profile, and a second load of the same build is much faster (2026-11-13, current tree, one
reused profile: Fuji 6.2 s cold → 3.7 s warm, Silverstone 6.8 → 3.8–4.7 s). Of the cold cost, ~0.8 s is three's two environment
prefilter programs (the venue environment's and the car probe's cube sizes), which three links on the main thread at their first
use; it has no public way to link them ahead (the earlier ahead-of-time link used its internals and is gone). Warm, the two take
~10 ms. The cold lap first frame is therefore ~0.2–0.7 s over the 5.0–5.6 s line on a first launch only.

### Simplest path first

The user (2026-11-13): the right rendering technique for the job, without over-complicating it. The cost is per-car draws, so
the technique is instancing: every car of a body draws through the body's shared batches, and only what differs per car moves
to per-instance data. Steps, each measured before the next:

1. P0b, one shadow walk per frame (done, uncommitted), and one depth-only batch per near body for the car shadows (done,
   uncommitted: `batchCars` `shadows`, positions only on `SHADOW_ONLY_LAYER`, which only the cascade cameras see; every opaque
   uncut part casts from it, both faces as the car materials do. Car draws in the shadow atlas at the Le Mans start: 204 → 44).
   The lap car, the followed car and each near body now share one path, `cars/drawnCar.ts` `createCarSets` `build` (a set of one,
   or a body's cars), so all of them cast this way.
2. **Livery as an instance layer**: per body, the session's livery albedo (and paint region) maps in a texture array built by
   the app from the KTX2 files it loads (grouped by block format), a per-instance layer index, and today's materials sampling
   the array. Then a body's near and far cars share every batch, and draws scale with bodies on track times materials, not
   with cars. No new shader model.
3. Measure. Only if program switches or per-body material counts still keep the frame over target: the uber material and data
   textures (P3) and the package's merged anchors (P2). Mip streaming on array layers only if the array's memory needs it.

## Gaps and work

| # | Gap → change | Owner | Needs | Expected |
|---|---|---|---|---|
| P0a | Renderer walks the scene each pass → `scene.matrixWorldAutoUpdate = false`, one update per frame in the shell; far cars stop being groups (instances only, from P1) | Race session (`scene/`) | nothing | most of the 9.8 %. Done, uncommitted (`sceneShell.ts`: one `scene.updateMatrixWorld()` after the content places its cars); the car groups are already out of the walk (`carParts`), so the walk is now one check per car per frame |
| P0b | Each live shadow layer traverses, swaps to depth materials (already cached per material key) and restores → traverse and swap once per frame, draw all live layers, restore once; casters filtered to followed + nearest N. Each layer's own frustum cull stays (a car 60 m out already skips the 15 m and 32 m layers) | Fidelity session (`shadows/`) | nothing | part of the 10–13 fps car-shadow cost |
| P1 | Near cars copy their own batches → one per-body set shared by near and far cars, distance levels as geometry ids, per-car instances; drop `NEAR_KEPT`, near model loading, stand-ins | Race session (`cars/`, `race/`, `batching/`) | nothing (today's per-material groups) | near draws ÷ cars per body; instant near. First step done, uncommitted (`race/raceField.ts`): a body's full models are built together the first time one of its cars turns near, their opaque parts batched with each other (one geometry copy per body), and kept; `NEAR_KEPT`, per-car near loads and per-car batch copies are gone. Second step done, uncommitted: the field cars' glass, decals and far blended pieces batch too (`batchCars` `transparent`, instances sorted back to front in their batch; since P4 the followed and lap cars too). Draw count at the Le Mans start (dev build, main view): car batches + car parts 209 → 191. What is left per car is one draw per material: per-livery materials (far appearance, near paint and retextured parts), lamps (per-car state), contact shadows and the followed car's parts. Near and far in one set, levels as geometry ids and the stand-ins out wait for P2's merged anchors: on today's per-part, per-material package they would move draws, not remove them |
| P2 | Package ships per-part, per-material primitives → schema 14: merged anchors with material index (generalising `farBody.ts`), four corner wheels deduplicated when identical, tier ladder (near / mid at `mid.fromM` / far simplified per group, option and material piece with borders locked, lamps as a group), materials table as data, block format, size and mip count on each texture row. A two-body prototype (one GT3, one Hypercar) first, for real draw, size and build-time numbers (car stage within the 25 min build limit). Far tier ~139 MB → ~15–25 MB | Pipeline exporter session | P1's reading shape and `mid.fromM` rule; P3's material field list; the user's decisions | package-side; schema 14 is v17 unless the user folds it into the v16 candidate |
| P3 | ~10–25 programs per body, per-material uniforms → uber car material per group, data textures, texture arrays. Arrays: the non-livery maps (normal, metal/roughness, detail, emissive) differ in size and format per material, so arrays group by (size, format) too; the number of groups per body sets the program count, so P2 surveys it first. Livery layers only for the liveries in the session, allocated on demand (63 layers of 2048² BC7 with mips ≈ 350 MB for one body). Mip streaming on array layers is new: per-layer level uploads (`compressedTexSubImage3D`) and start-file levels per layer; `mipStreaming.ts` is 2D only | Fidelity session (`car/carMaterials.ts`, paint, surface patch) with the race session for the set | P2 | ~3–6 draws per body instead of ~30–170 |
| P4 | Followed car on its own loaders → same draw set, own material variant (probe, cockpit), lamps in full. The probe (10 % of the frame) renders every car from the followed car's roof → far tier at most, or no other cars (a few texels in a reflection) | Fidelity + race (probe: fidelity) | P1 (moved ahead of P2/P3, user 2026-11-13) | one code path: the lap car is the race field with one car (a batch of one in its body's set), the followed and lap cars a material variant of the same set, so P3 changes one path. Done, uncommitted: `cars/drawnCar.ts` `createCarSets` owns every full-model car; `build(bodies, {own})` is the one path, the own car (lap or followed) differing only by its own materials (probe, cockpit) and kept interior, its glass and decals batched like the field's. The followed car stays a set of one beside its body's near set, not inside it. The ghost stays part by part (user, 2026-11-13) |
| P5 | Lap view on the draw set: the lap car is done with P4; the ghost stays apart (user, 2026-11-13). Then one scene for both views on a circuit (user, 2026-11-13: no second WebGL context for the same circuit) | Race session | P4 | lap gets the same savings. Done, uncommitted: `scene/sceneShells.ts` keeps one shell per layout for the inspector page; each view attaches its element and shows its content, leaving detaches it. Le Mans race ↔ lap, 4 switches, 2 interleaved rounds (headless Edge, game running): WebGL contexts 5 → 1; race → lap 4.7-5.0 s first and 3.3-3.8 s after → 2.4-2.5 and 1.1 s; lap → race 3.3-3.6 → 1.4 s; heap after GC after 4 switches 1,231 / 1,244 MB (rising each switch) → 1,041 / 1,044 MB (flat). The sun is the shell's from its creation until the fidelity session's `setLight` / `shell.setDaylight` (the race's clock at the race view's time then, built server-side like the lap's) |
| T1 | three r186 (0.186.1) → r187 (0.187.0), its own step once the current batch is validated, never mixed into it (user, 2026-11-13). (1) Bump `three` and `@types/three` to 0.187; check that `three-mesh-bvh` (0.9.18, kept) supports it. (2) Read the r187 changes: does `copyTextureToTexture` now blit depth with end coordinates (r186 passes width/height) and take a `CompressedArrayTexture` destination on its 3D path (r186 skips it)? If so, the plain public copy works with no workaround: decide between keeping the depth-writing quad (`shadowCasterPass.ts`) and the copy, and report which; the livery-array copy (paused) reopens too. (3) Re-check what leans on three's exact shader text or behaviour: the `onBeforeCompile` string matches (carPaint, cascadeSampling, haze, the ambient lookup), BatchedMesh after upload (the `onUpload` release), PMREM; and whether r187's `PMREMGenerator` has a public way to link its prefilter program ahead of its first conversion (user, 2026-11-13: use it if so, otherwise propose one upstream; until then the cold link stays, see Targets). (4) `npm test`, lint and build clean, then the 8-view capture against acc-v14 and one bench | Fidelity session | current batch validated | done 2026-11-13, uncommitted. (1) three and @types/three 0.187.0; three-mesh-bvh 0.9.18 accepts it (peer >= 0.159). (2) `copyTextureToTexture` now blits depth with end coordinates: the shadow pass copies each held tile's static depth with it, and the depth-writing quad and its shader are gone (8 views unchanged; main atlas GPU 1.6 vs 1.8-2.0 ms). The CompressedArrayTexture 3D path is still unreachable (`isDst3D` leaves it out), so the livery-array copy stays paused. (3) The string anchors hold (module checks + tests); the environment map is now a `samplerCube` (still one sampler); `Loader.cache` is now the fetch cache mode, so the KTX2 loader's own map is `loads`; the prefilter returns a cube render target. PMREM is rewritten: cube targets with mips, at least 256 px a face (the 128 px venue probe becomes 256), and one prefilter program for every size, so a cold load links one instead of two; still no public way to link it ahead. (4) tests, lint, build clean. Look: game dE sum 85.48 (r186 tree 85.82, acc-v14 85.59), an even small shift (mean dE 0.3-0.75), closer to the game. Race start A/B under load: same frame time and heap, load 29.6-31.2 vs 32.6-33.1 s |
| V2 | Bench the Le Mans start and the lap captures once, after P3 and after P5. Fidelity gate: the car look is frozen on the freeze3 reference captures, so P3 replaces `carMaterials` only once it matches them (the fidelity runs' dE check), with cockpit occlusion and the probe intact | Fidelity session | — | — |

P0a, P0b and P1 need no package change and start now. The material field list of P3 is designed before P2's schema is fixed
(the fidelity session drafts it while P1 runs); P2's two-body prototype can start once P1 has fixed the reading shape. Target after P3:
draws in the low hundreds at the Le Mans start, main thread no longer the limit. The gain comes from fewer draws and programs
(the GPU multi-draw is 2.2 % of the frame), not fewer triangles; if triangles still matter after P3, the levers are the app's:
which tier draws at what distance, culling and shadow casters.

## Open decisions (user)

- ~~Far model decimation~~: answered no (the user, relayed by the exporter session 2026-11-13): the package stays true to the
  game files.
- **Livery arrays**: built in the app per body, grouped by block format (keeps v14), not a BC7 transcode of the BC1/BC3 liveries
  nor package array files.
- **Car shadow casters**: how many near cars cast (followed + nearest N); far cars never cast (as today).
- **Mid tier distance** (`mid.fromM`): between near and far (today's far `fromM` is 30–100 m). Proposed at the common part band
  edge of 20 m (the 499P's rims switch level there), so full parts draw only for the closest cars; settled in P1 from the band
  edges per body.
- **Release**: schema 14 as v17, or folded into the v16 candidate the user has not yet accepted.

## Rules

As in REPLAY_3D_ARCHITECTURE.md: one writer per file, message the owner first; game values only through the package; commit only
on the user's word in that session; measure once in a production build when the items land, never during builds.
