# 3D replay performance review

Status: in progress (2026-11-04). Baseline measured; step 2 (shadows) done as a single snapped sun map, uncommitted; the
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
  builds the BVH and height index from it in a worker (today ~0.5 s of main-thread index building plus a main-thread merge per
  join). Disk: a few % of the sector.
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
