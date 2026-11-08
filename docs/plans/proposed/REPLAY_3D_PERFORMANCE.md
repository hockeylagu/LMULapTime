# 3D replay performance review

Status: in progress (2026-11-04). Baseline measured; step 2 (shadows) done as a single snapped sun map; the
production build meets the frame targets on both reference laps (see "Results"). Load: package files are now served as plain
static files (`no-store`, no per-request hash); the whole-file zstd textures of step 3 are with the pipeline session for the v2
export, after which the client loads plain KTX2 (`Content-Encoding: zstd`) and load is re-measured. Stack: `src/components/replay/view3d/` (client),
`server/routes/dataPluginRoutes.ts` + `server/plugins/packageFiles.ts` (file serving), exporter in
`C:\Documents\LMUTrackPipeline\pipeline\scenery\` and `pipeline/glb/` (separate repo), contract in the pipeline's
`docs/SCENE_PACKAGE.md`. Harness: [`tools/benchmarks/replay3d/`](../../../tools/benchmarks/replay3d/README.md).

## Targets

- Steady playback on the user's PC (RTX 5070 Ti, 2560 monitor, fullscreen): frame time **p50 < 10 ms, p99 < 16 ms** over a
  whole lap, chunk joins and leaves included.
- Load: time to the first 3D frame reduced; no long task (> 50 ms) once the first frame is up.
- Disk: the package does not grow (`debug-fuji` ~20 GB: 11 GB scenery textures, 5.8 GB scenery GLBs, 3 GB cars). Every
  exporter change reports its disk delta; a speed gain that costs disk needs an offsetting saving in the same package bump.
- Approach: the standard techniques for large static streamed scenes, in the exporter where they belong. No per-layout tuning,
  no shader string tweaks to hide cost.

## Baseline (2026-11-04)

Package: `debug-perf`, a debug export of the schema-4 `build/` (pipeline c937a35) for fuji_chicane and
silverstone_international. Its scenery is the same as `debug-fuji` (same triangles, draws, horizons). The build's car
catalog fails validation for 11 car models ("appearances do not cover exactly the body's vehicle ids": Ginetta, Ligier,
Duqueine, Oreca, Porsche 963, Toyota, Peugeot, Vanwall); for profiling they were removed from a private copy of the
catalog, so laps of surviving cars were used (ADESS AD25 at Fuji, BMW M4 LMGT3 at Silverstone). No Le Mans session has a
surviving car, so the largest layout is not in the baseline. Dev server (Vite, React development build), headless Edge,
ANGLE D3D11 on the RTX 5070 Ti, 60 s of playback per run.

| Run | First frame | p50 | p95 | p99 | max | > 16 ms | Main draws | Offscreen draws | JS heap |
|---|---|---|---|---|---|---|---|---|---|
| Fuji 1080p | 12.8 s | 3.9 | 14.1 | 22.8 | 114 | 3.0 % | 246 | 400 | 2.8 GB |
| Fuji 1080p, shadow draws dropped | 11.8 s | 3.5 | 12.3 | 16.9 | 107 | 1.6 % | 247 | (400 skipped) | 2.6 GB |
| Fuji 2560×1440 | 11.6 s | 3.5 | 12.3 | 16.4 | 140 | 1.3 % | 241 | 401 | 2.6 GB |
| Silverstone Intl 1080p | 13.2 s | 6.5 | 24.7 | 34.5 | 85 | 12.4 % | 462 | 653 | 2.9 GB |
| Silverstone Intl 1080p, shadow draws dropped | 13.1 s | 6.9 | 24.2 | 28.8 | 89 | 10.1 % | 469 | (634 skipped) | 2.9 GB |
| Silverstone Intl 2560×1440 | 12.8 s | 6.7 | 23.0 | 27.3 | 70 | 8.9 % | 461 | 633 | 3.0 GB |

(ms; "draws" are per-frame medians; a first Fuji run gave p99 17.3, so run-to-run spread is a few ms at p99.)

What it shows:

- **p50 already meets the target; p95/p99 do not.** Silverstone misses p99 by 2×, Fuji by ~1.4×.
- **The frame is CPU-bound on draw calls, not GPU-bound.** While playing, the renderer main thread is 99 % busy, 94 % in
  script (DevTools metrics). Dropping the shadow passes' GL draw calls changes nothing measurable (the GPU work of shadows is
  small), and 2560×1440 is no slower than 1080p (fill is not the limit). Frame time follows the number of draw calls:
  Fuji ~650 draws/frame → 3.9 ms, Silverstone ~1,100 → 6.5 ms, about **6 µs of CPU per draw** in three.js + ANGLE. Within a
  lap, frames with 1,200+ draws have p95 29 ms against 17 ms at 800–1,000.
- **Where the CPU goes** (Silverstone, 30 s CPU profile, self time): three.js per-draw state work dominates —
  `WebGLBindingStates.needsUpdate`/`setup` (VAO checks, 13 %), `renderBufferDirect`, `setProgram`, `getParameters`,
  uniform `upload`/`setValue`/`flatten`, `renderObject`, `projectObject` — plus React (`jsxDEV`/`createElement`, ~9 %, the
  development build re-rendering during playback).
- **Shadows cost CPU, not GPU.** The offscreen passes are 60 % of all draws (400 of 646 at Fuji, 653 of 1,115 at
  Silverstone). Dropping only the GL call leaves three.js's per-object work in place, which is why the experiment barely
  moved; the passes' real cost is roughly their share of the per-draw CPU time, ~2.5–4 ms per frame.
- **Spikes come in runs** of consecutive slow frames where the draw count is high, not from uploads (no upload or program link
  in the 30 frames before 70–80 % of the > 33 ms frames) and not from long JS tasks (none during play).
- **Load: 12–13 s to the first frame**, 11–18 long tasks (up to ~1 s each, ~2 s total). Load CPU profile: ~3.1 s in
  WebAssembly (the zstd decode of KTX2 textures, on the main thread; meshopt runs in workers), ~1.5 s in GL upload calls,
  0.6 s finishing shader programs (`onFirstUse`), ~0.5 s building the height index, 0.3 s in `KTX2Loader` decode.
- **Server**: one 17 MB texture takes 0.24 s and Silverstone's 56 MB horizon GLB 0.31 s to serve, because `readPackageFile`
  reads and SHA-256-hashes the whole file on every request, on the event loop; nothing else is served meanwhile.
- **JS heap 2.6–3.0 GB**: decoded texture mips and geometry arrays are kept after upload.

## Results

### Shadows: one texel-snapped sun map instead of CSM (2026-11-04)

`sceneEnvironment.ts` now uses one `DirectionalLight` shadow (4096², 160 m square, led 50 m ahead of the camera, centre snapped
to the shadow texel grid so static shadows do not shimmer) in place of the `CSM` addon and its global `ShaderChunk` rewrite.
The replay camera looks at the car from close range, so cascades beyond 80 m bought little that was visible. A/B screenshots at
Silverstone (car, kerbs, walls) look the same.

Interleaved runs, 40 s each, ms (intervals; callback = main-thread time in animation-frame callbacks):

| Build | Lap | Shadows | p50 | p95 | p99 | callback p50 / p99 | Offscreen draws |
|---|---|---|---|---|---|---|---|
| dev | Silverstone | CSM | ~9 | ~23 | 39–46 | 8.1–8.4 / ~19.5 | 666 |
| dev | Silverstone | sun | 5.8 | ~22 | 29–30 | 5.5 / 12.7–13.2 | 255 |
| production | Silverstone | CSM | 6.4 | 8.8–9.0 | 12.5–13.9 | 6.1 / 9.2–9.8 | 673 |
| production | Silverstone | sun | 4.7–5.4 | 7.0–9.0 | 9.5–13.9 | 4.5–5.1 / 7.5–10.5 | 259 |
| production | Fuji | CSM | 3.5–4.0 | 4.9–6.4 | 6.3–8.7 | 3.3–3.8 / 4.9–7.0 | 408 |
| production | Fuji | sun | 2.6–2.7 | 4.0–4.4 | 4.9–5.8 | 2.5–2.6 / 3.9–4.4 | 149 |

- The shadow change cuts offscreen draws by 2.6× and the frame's CPU by 20–30 %.
- **The p95/p99 tail in the dev server was React's development build**, not the renderer. The slow frames came every
  50 ms, matching the 20 Hz React update during playback (`77ef39df`); each cost ~17 ms in `jsxDEV`/`createElement` outside the
  render callback. A production build (`vite build` + `vite preview`) removes it. Even with CSM, the production build meets the
  targets on both laps; the sun map adds headroom for denser layouts (Le Mans not yet measured).
- **Measure the targets on a production build from now on.** The dev server's React overhead hides renderer changes in the tail.
- Load is unchanged (10.5–12.8 s to the first frame), so step 3 is now the larger win.

### Load: whole-file zstd textures and overlapped stages (2026-11-04)

Package personal-v2 (`.ktx2.zst` served with `Content-Encoding: zstd`), production build, other jobs on the machine (CPU 30–80 %).

| | Fuji first frame | Silverstone first frame |
|---|---|---|
| debug-perf baseline (main-thread zstd decode) | 10.5–12 s | 12–13 s |
| v2 files, before the app changes below | — | 13.2 s (single run) |
| v2, after the three changes below (suite median of 3) | 8.3 s | 10.9 s |
| v2, after the four changes after that (3 runs) | 7.2–8.1 s | 10.5–11.0 s |

- Texture decode left the main thread (0 ms, was ~3.3 s); all package files finish by ~3 s.
- First three changes: KTX2 read with `fetchBinary` (three's FileLoader re-streamed every body chunk through script for
  progress events, which kept the main thread busy for ~3 s after the files arrived); the sky PMREM built while the files
  download; the wheel/line height index replaced by the camera BVH (`scenery/sceneryGround.ts`, one tree per chunk built in a
  worker, triangles tagged by the query they serve).
- Next four changes: BVHs built in a pool of three workers outside the serialized warm-up chain; car models and textures
  loading alongside the scenery; behind the loading screen, texture and geometry uploads in 50 ms slices that yield a task
  instead of waiting for a frame; removal of a chunk's tree only by the load that owns it.
- Tried and dropped: four meshopt decode workers and six concurrent chunk loads (no gain). `ParallelMeshBVHWorker` needs
  `SharedArrayBuffer`, so cross-origin isolation headers; not worth it for this.
- Then: until the first view is resident, only the horizon and the chunks under the view load, all at once (they were
  queued behind other chunks with three load slots). Silverstone ~9.5–10 s. Fetching a chunk's textures with its GLB made no
  measurable difference (dropped).
- What the first frame waits for on Silverstone: the horizon chunk. It is 53 MiB of GLB, 2.0 M triangles and 472 textures
  (1.18 GB on the GPU, most of the venue's 1.53 GB, 97 of them 2048²) at full resolution. Its download competes with
  everything else (~4.5 s), its ray tree takes ~1.4 s, and the final warm-up uploads its textures (~3 s).
- A ground-only BVH (stand-in for HATTarget flags from the exporter) cut Silverstone's tree triangles 5.8 M → 1.0 M and the
  first frame by ~0.5–1 s; not pursued for now.

### First frame: low mips first, horizon after (2026-11-05)

Client only. Scenery textures of 512 px or more join on their levels 2 and below (the files already hold every level) and a
background queue uploads the full chains after the first frame, at most 4 MiB per frame (at least one texture). The car's
textures load whole. The first frame waits only for the chunks under the view; the horizon joins when ready.

| personal-v2, suite median of 3 | Fuji | Silverstone |
|---|---|---|
| First frame, before | 8.3 s | 10.9 s |
| First frame, after | **6.3 s** | **6.8 s** |
| p50 / p99 during the 40 s played | 2.7 / 5.7 ms | 5.2 / 18.0 ms (runs 16.9–20.8) |

- Simulated first with an exporter-free proof of concept (6.6–6.8 s on Silverstone); the BVH variants on top (HATTarget
  flag, or a BVH from the exporter) changed nothing once the horizon no longer gates the first frame.
- Silverstone's p99 sits just above 16 ms. Slow frames: the first ~5 s while ~0.9 GB of full chains upload (a 2048² BC7
  chain is ~5.6 MB, uploaded whole, so a lower budget cannot shrink those frames), and a dense stretch at ~25 s (draws
  370 → 580, no uploads) that predates this change. A time budget did not bound the uploads (2 ms slices queued up to
  27 MiB), hence the byte budget.
- Silverstone's default trackside camera at the lap start sits inside the Wing structure (camera data, not load-related).

### Second pass: what the slow Silverstone frames are (2026-11-05)

The scene now renders into the auto-exposure target, so the probe counts draws into multisampled framebuffers as the main
pass (`probe.ts`); before that fix every scene draw showed as offscreen.

- **Sharpening is the cost.** Same build with sharpening switched off: 2–8 s frames ~8 ms and no frame over 16 ms, against
  10–14 ms medians with it. The 0–2 s frames and the 26–30 s stretch (new chunks streaming) are slow either way.
- **What it uploads:** 593 distinct textures, 1.5 GB of full chains in the first 20 s, nothing uploaded twice. BC5 normal
  maps 374 / 776 MiB, BC7 colour 205 / 491 MiB, uncompressed RGBA8 14 / 245 MiB. The RGBA8 ones are tiling terrain and road
  textures (grass, gravel, road lines, armco) at 21 MiB each; the game ships them uncompressed (BGRA8/RGBA16 DDS) and the
  pipeline keeps them as they are.
- **Tried and dropped:** sharpen only textures used within 150 m of the camera. Scenery meshes are merged per material over
  100–1,300 m, so every bounding sphere contains the camera (290 textures, 873 MiB in 6 s, all at distance 0). A budget per
  second instead of per frame (240 MiB/s) was not measurably better; the machine was loaded (other processes ~95 % CPU), so
  timings from that hour are noisy.
- **Levers considered:** BC7 for the RGBA8 tiling textures (pipeline, ~4× smaller, lossy re-encode); keep normal maps on
  their reduced levels (flatter close-up detail); a lower upload rate (longer blur). The user chose full detail, so none of
  these: the upgrade itself was made cheaper instead.
- **Done: mip streaming** (`scenery/materials/mipStreaming.ts`). A large texture allocates its full chain once, fills levels
  2+ and samples from `TEXTURE_BASE_LEVEL` 2; the missing top levels are copied into the same GPU texture in bands of rows
  (2 MiB per frame) and the base level drops as each level lands. Before, each texture was disposed and re-uploaded whole
  (a 21 MiB RGBA8 texture in one frame). The cost is the copy (~2.5 ms per MiB on this machine), so bands bound it per frame.
  Same quiet machine, Silverstone, 3 runs each (old whole-texture build vs streaming):

  | | Old | Streaming |
  |---|---|---|
  | p50 | 4.4–4.7 ms | 4.3–4.4 ms |
  | p99 | 24.8–28.6 ms | 21.0–23.4 ms |
  | Frames over 16 ms during the upgrade (2–10 s) | 19–53 | 11–17 |
  | Full detail reached | 9.4 s | 9.4 s |

  The raw RGBA8/R8 textures also got trilinear filtering: three's KTX2 loader gives raw textures nearest filtering.
- **What sets p99 now:** the first ~1.7 s after the first frame (~55 of ~80 frames over 16 ms, ~900 draws while the rest of
  the window's chunks join) and the chunk streaming at 26–32 s (~35–45 frames). Both are the same with and without
  sharpening; they are the next pass.
- **First 2 s, profiled** (production build, Silverstone, play CPU profile): each frame renders in ~16–20 ms of main thread
  while the window joins (~900 draws). The spikes on top come from chunks joining: three-mesh-bvh's generic
  `StaticGeometryGenerator` merge of the ground meshes took 12–31 ms per chunk, glTF setup and program compile a few ms more.
  The exposure readback (`getBufferSubData`) is ~5 ms per 2 s, not a lever. Changed (225645f7): the merge is a tight
  position-only copy (`sceneryGround.ts` `mergePositions`), which is all the ray tree needs. Its A/B is still owed: the
  machine was at 60–70 % CPU from other processes when it ran, and both builds were equally slow (first-2 s p99 100–500 ms).
  Next levers if the target (first 2 s p99 < 30 ms) is still missed: hold sharpening until the window's chunks have joined,
  and byte-budget the warm-up uploads instead of the 1 ms slice.

### Precomputed visibility per lap segment: a possibility, parked (2026-11-07)

The pipeline's prototype lists, per 40 m of lap, the scenery primitives visible from the cockpit, chase and far-chase
cameras (forward, left, right, up). The app kept only those of the current and next segment in the main view (others on a layer
the main camera skips, still casting sun shadows; the old lap window when the camera looks more than 60° off the car's heading).
Production build, personal-v4, vsync off, first 25 s of lap 1 and of the second pass, two runs each:

| | Main draws p50/p99 | Frame p99 (ms) | First 2 s p99 (ms) |
|---|---|---|---|
| Daytona, lap window | 400 / 580–611 | 12–33 | 13–35 |
| Daytona, visibility lists | 298 / 391 | 9–13 | 7–12 |
| Silverstone International, lap window | 488 / 1015 | 16–33 | ~35 |
| Silverstone International, visibility lists | 395 / 576 | 9–13 | 9–25 |

Shadow and reflection-probe draws fell about 20 %. Cars, lines, sky and post passes are a constant 66 main draws at Daytona.
The same paused frame with and without the lists showed holes: at Daytona 400 m a light tower, crane and tents across the
infield; at 3.6 km the spectator cards behind the catch fence (the see-through fence counted as an occluder); at Silverstone
only small far details. Parked by the user: a real gain, but the precompute adds 1.5–3 min per layout to the export, too slow
for now. If taken up: fix the holes (thin and far objects, alpha-tested fences not occluding) and retest.

## The scene (from the package index)

| | Typical | Worst |
|---|---|---|
| Sectors (500 m) | 20–30 | sarthe 44 |
| Triangles per layout | 4.5–7 M | sarthe 9.8 M |
| Draw calls per sector (one per material) | 65–90 | silverstone_wec 109 |
| Horizon (always resident) | 0.3–0.6 M tris, 13–25 draws | silverstone_national 2.48 M / 150 draws / 67 MB; silverstone_international 1.99 M / 170 / 56 MB |
| Textures per layout | 450–700 | sarthe 895 |

The resident window (300 m behind, 1500 m ahead, 250 m hysteresis) holds 4–6 sectors: ~1.6–2.4 M triangles and
~350–550 draw calls at full detail, plus the horizon. The exporter keeps only the game's LOD0 (`buildVenueScene.mjs:469,511`).
Each sector repeats its materials, so the same material is a separate draw (and a separate three.js material) in every
resident sector.

## Recommendations

Ordered by measured effect. The baseline changes one earlier proposal: tiling into many small meshes would *raise* the draw
count, which is the cost. The standard answer for a draw-call-bound static scene is to batch, not split.

### 1. Fewer draw calls: batch static scenery per material (client + exporter)

- **`BatchedMesh` per material across all resident sectors and the horizon** (three.js's standard for many static pieces,
  using `WEBGL_multi_draw`): one draw per material per pass instead of one per material per sector. Each tile (~100 m piece
  of a sector's primitive) is a geometry range inside the batch with its own bounding sphere, so `BatchedMesh` culls per tile
  on the CPU and submits only visible ranges in a single multi-draw. Expected: Silverstone's ~460 main draws → roughly the
  number of distinct materials resident (~100–150), and the same factor in every shadow pass.
- **Exporter:** publish each sector primitive as tiles (index ranges with bounds) so the client adds ranges without
  re-splitting, and a stable material key (the existing `programKey` + texture set) so a material shared by several sectors
  is one batch. Same textures under one material across sectors is already true (content-named KTX2), so this is a grouping
  change, not new data. Disk: neutral (ranges and bounds only).
- Join/leave becomes add/remove of geometry ranges in the batch. Batch buffers need reserved capacity per material; size it
  from the resident-set budgets in `sceneBudgets.json`.

### 2. Shadows: cached static map plus a small dynamic one (client)

The shadow passes are 60 % of draws. Static scenery under a fixed sun does not need re-rendering every frame. Standard
practice: static casters render into the shadow map only when the shadow window moves (texel-snapped, per-light
`shadow.autoUpdate = false` + `needsUpdate`); the cars render every frame into a small map with a tight frustum. This removes
most offscreen draws on most frames and drops the `CSM` addon's global `ShaderChunk` rewrite. Needs a visual sign-off; the
fallback is cascades with staggered far-cascade updates. After step 1, any shadow re-render is cheap too.

Done in a simpler form (see "Results"): a single texel-snapped sun map replaced CSM and took the offscreen draws from ~660 to
~260 at Silverstone. Caching the static part is not needed for the targets now. Revisit it only if a denser layout misses them.

Compared with CSM (3 × 2048 px up to 150 m), the sun map is coarser right at the camera (about 4 cm per texel against roughly 2 cm in
CSM's nearest cascade) and does not cover walls more than 80 m to the side. If cockpit shadows look soft, add a second, smaller
sun map around the car (decided 2026-11-04: only when needed).

### 3. Load: move texture decode off the main thread, fix serving (client, server, exporter)

- **Server:** verify package files once (at load, or first read then size + mtime), then `res.sendFile` (async, streaming).
  Removes 0.24–0.31 s of blocked event loop per large file.
- **Textures:** store each texture once as a whole-file zstd of a KTX2 without supercompression (`<sha256>.ktx2.zst`), served
  unchanged with `Content-Encoding: zstd`; the browser decompresses during download, off the main thread, and `KTX2Loader`
  only slices mips. Disk about the same as today; never both copies. Removes the ~3 s of main-thread wasm decode. Fallback:
  today's files decoded in our own worker (`ktx-parse` + `zstddec`).
- **Free CPU copies after upload** (texture mips; geometry arrays once a collision/height proxy serves the ground queries).
  Brings the 2.6–3.0 GB heap down to the proxies plus metadata.
- **Collision/height proxy per sector (exporter):** a small position-only mesh of drivable and ground surfaces; the client
  builds the BVH from it in a worker (today a main-thread merge per join; the height index now queries the same BVH). Disk: a few % of the sector.
- **Byte-budgeted upload queue** checked before each upload, and overlapping warmups instead of the `warming` chain.

### 4. Horizon and LOD (exporter)

Lower priority than measured before: triangles are not the limit, draws are. Still worth it for disk, VRAM and the horizon's
170 draws at Silverstone:
- Horizon under a hard budget in `sceneBudgets.json` (proposal ≤ 0.5 M triangles, ≤ 30 materials, ≤ 15 MB); Silverstone
  National/International, Paul Ricard 3A, Qatar Short, Sebring School, COTA National, Bahrain Paddock exceed it.
- Vertex quantization (`KHR_mesh_quantization` with meshopt filters): halves geometry upload, VRAM and GLB disk.
- HLOD (game LODs first) only if a measurement after steps 1–3 shows GPU time at distance matters; its ~30 % geometry disk cost
  must be paid by quantization.
- Texture disk (11 GB): trim the top mips of textures on pieces far from the route; instancing duplicates (~47 % of raw
  geometry) if geometry disk is still too large.

### 5. React during playback (client)

~9 % of main-thread time in the development build goes to React re-rendering around the 3D view during playback. Re-measured
against a production build (see "Results"): the 20 Hz updates no longer show in the tail. Nothing to do unless a later
production measurement shows them again.

### Not recommended

- **WebGPU + TSL migration now.** It is three.js's long-term direction and would lower per-draw CPU cost, but it means
  rewriting every surface family's shader patch in TSL. Revisit if batching and cached shadows leave the CPU per frame above
  budget.
- **Smaller tiles as separate meshes**: more draws, which is the measured cost.
- **Shorter resident windows or per-layout quality tables**: they hide cost instead of removing it.

## Order of work

1. Client-only, no format change, each re-measured with the harness: server hash-once + `sendFile`; cached static shadows;
   free CPU copies; React out of the playback path. These are independent and small.
2. Exporter, one schema bump: tiles as ranges + material keys for batching, whole-file zstd textures, collision/height proxy,
   quantization, horizon budget. Report disk delta with the frame numbers.
3. Client side of the new format: `BatchedMesh` per material, proxy-based heights and collision in a worker, byte-budgeted
   upload queue.
4. Re-baseline all three reference layouts (Le Mans once a car loads there) at 1080p and 1440p; record budgets in
   `sceneBudgets.json` from measurements.

Prerequisite: the build's car descriptors must validate (11 models fail today), otherwise most laps cannot open in 3D.

## Risks

- Shadow changes alter the look; visual sign-off on the same laps.
- `BatchedMesh` needs every material in a batch to share one program and texture set; sector-specific uniform values (if any)
  must move to per-instance data or split the batch.
- Quantized render geometry must never feed wheel contact or the camera floor; the proxy owns those.
- The baseline numbers come from the Vite dev server. React's development build adds a 20 Hz tail there that a production build
  does not have. Compare runs under the same mode only, and check the targets on a production build.
