# 3D replay frame-time benchmark

Opens one lap in the running app's fullscreen 3D view in headless Edge on the real GPU, measures load, plays the lap and reports
frame-time percentiles. Targets and the plan it measures: [`docs/plans/proposed/REPLAY_3D.md`](../../../docs/plans/proposed/REPLAY_3D.md).

## Reference suite (compare packages and builds)

```bash
PLAYWRIGHT_NODE_MODULES=C:/Documents/LMUTrackPipeline npm run benchmark:replay3d:suite -- --package personal-v2
```

Start only the backend first (`npm run dev:server`, with `LMU_PLUGIN_ROOT` on the package to measure); the suite does the rest.
Method:

- **Build**: production. The suite runs `vite build` into `.cache/replay-3d-performance/dist` and serves it with `vite preview` on
  port 4173, which proxies `/api` to the backend like the dev server. Never compare against dev-server numbers: React's
  development build adds a 20 Hz tail during playback.
- **Laps**: the reference laps below (all four by default; pick with `--laps fuji,silverstone,algarveNight,spaRace`). Before measuring, the suite checks that the backend's
  package has scenery for each layout.
- **Runs**: `--runs` (default 3) runs per lap, interleaved (fuji, silverstone, fuji, …), 40 replay seconds each. A fresh headless Edge per
  run, so every load is cold in the browser (package files are served `no-store`; the OS file cache stays warm after the first run).
- **Clock**: the replay advances one fixed 60 Hz step per frame (see *What it measures*), so every run draws the same moments
  of the lap; `--real-clock` plays in real time instead.
- **Device**: headless Edge, ANGLE D3D11, vsync and frame-rate limit off, 1920×1080 at device pixel ratio 1, on whatever GPU the
  machine has (recorded in the result). Only compare suites from the same machine.
- **Output**: per lap, the medians of time to first frame, when the last package file finished, MiB of package files, main-thread
  WebAssembly time during load (texture decoding: meshes decode in workers), long-task time during load, played-frame p50/p99,
  frames over 16 ms, JS heap, callback p50, and per pass the main-thread p50 and the run's draws. The load is CPU-profiled; the
  played frames are not. Saved with the method and every run to
  `.cache/replay-3d-performance/suite-<package>-<time>.json`.

## Run one lap

Start the app (`npm run dev`, UI on 5173, a data package with scenery for the layout in `LMU_PLUGIN_ROOT`), then:

```bash
PLAYWRIGHT_NODE_MODULES=C:/Documents/LMUTrackPipeline npm run benchmark:replay3d -- --session 2026_11_03_16_37_20-02R1 --driver 3 --lap 10 --label fuji
```

Check the targets against a production build. The dev server's React development build adds a 20 Hz tail of ~17 ms
frames during playback. Build into any folder, serve it with `npx vite preview --outDir <folder> --port 4173` (it proxies
`/api` like the dev server) and pass `--base http://localhost:4173`.

`PLAYWRIGHT_NODE_MODULES` is any directory whose `node_modules` holds `playwright` or `playwright-core` (the app does not depend
on it). Options: `--seconds` of replay played (default 40; wall seconds with `--real-clock`), `--real-clock`, `--base` UI URL, `--width`/`--height` viewport (default 1920×1080, device pixel
ratio 1), `REPLAY3D_BROWSER` channel (default `msedge`). The page runs at the app's own pixel-ratio cap; a 2560 monitor at
fullscreen is `--width 2560 --height 1440`.

`--skip-offscreen-draws` is an experiment, not a baseline: it drops every draw outside the main pass (shadow maps, the
reflection probe, bloom) at the GL call, so comparing a run with and without it gives those passes' GPU cost; their script
still runs.

`--uniform-names` is a diagnostic: it counts `uniform*` calls by uniform name and pass, and per shader program its active
uniforms (what three walks each time a draw refreshes the material), array floats, switches and draws per pass (`uniformStats` in
the result). It adds a cost per uniform call: compare its runs with each other only.

`--cpu-profile` samples the main thread with the DevTools profiler during load and while playing, and reports the 25
functions with the most self time for each. Every run also reports the renderer main thread's busy share (task, script, style, layout time per second).

Results print as JSON and are saved, with the ten worst frames and the per-frame series (`series`: interval, callback ms,
upload KiB, program links, cube faces, then draws and main-thread ms of each pass in `seriesPasses` order, then each pass's GPU
ms in the same order), to
`.cache/replay-3d-performance/<label>-<time>.json`.

## What it measures

- **Clock**: every animation frame hands the page a timestamp one 60 Hz step after the last, and the replay advances by those
  timestamps, so frame *n* shows the same moment of the lap in every run and every build however long frames take; a loaded
  machine only makes the run take longer. `performance.now()` stays real, so the app's time budgets and the timings below
  measure the real machine. Two runs of one build draw the same main-pass draws in most frames (streaming and sharpening, which
  run on real-time budgets, account for the rest). `--real-clock` plays in real time, as a viewer sees it.
- **Load**: navigation to the first 3D frame (canvas shown, "Loading 3D track surfaces…" gone), long tasks during load. A scene
  that fails to load stops the run with its error message.
- **Frames** (only frames that drew the main pass; the scene redraws only on change): Chromium runs with `--disable-gpu-vsync --disable-frame-rate-limit`, so each `requestAnimationFrame` interval is
  the frame's whole cost (script, render submission and GPU back-pressure), not a 60 Hz tick. p50/p95/p99/max, frames over 16
  and 33 ms. The first five frames after the play key are skipped.
- **Callback time**: main-thread time in the page's animation-frame callbacks per drawn frame (script and render
  submission, without GPU waits or idle time). Steadier than the interval for comparing two builds; compare intervals for the
  targets.
- **Passes**: each frame's work split by the framebuffer bound while it runs: `script` (before the frame binds any: replay
  clock, streaming, content), `main` (the multisampled scene target and the canvas), `probe` (cube faces: the car's reflection
  probe and its convolution), `depth` (targets with a depth texture: shadow cascades, the car's overhead map), `other` (bloom,
  exposure, PMREM, readouts, bakes, picking). Per pass: draw calls, draws (a `WEBGL_multi_draw` call counts each draw in it:
  batched scenery and cars), indices, uniform calls, texture binds, and the main-thread time spent while its framebuffer was
  bound (the script that issued it, not its GPU time). The counts depend only on what is drawn, so under the fixed clock they
  are the steadiest A/B figures; the pass times still feel the machine's load, but far less than the frame interval.
- **GPU time per pass** (`gpuMs`): one `EXT_disjoint_timer_query_webgl2` TIME_ELAPSED query per span a pass's framebuffer is
  bound in a frame, read a few frames later into the frame that issued it (the run waits 0.5 s after recording for the last
  ones). `gpuTimer` says whether the context had the extension (headless Edge on ANGLE D3D11 does); `gpuDropped` counts
  queries a GPU disjoint voided. What a shader change costs per pixel shows here, where the CPU figures cannot see it.
- **Cube faces**: reflection probe faces drawn in the frame (level 0 cube faces with more than one draw; the convolution's
  single quad a face is left out).
- **Interval**: real time between the starts of two frames' callbacks (`performance.now()`). The animation-frame timestamp is the
  frame's planned begin, snapped to 60 Hz slots: a frame that starts late read a whole slot long and the next one a slot short.
- **Per frame**: bytes uploaded to buffers and textures (a `bufferSubData` with a source offset or length counts that part only), program
  links during play, long tasks during play.

The probe wraps `WebGL2RenderingContext` methods (draws, uniforms, texture binds), which adds a constant cost per call; compare runs
with each other, not with numbers from other tools. A hidden or throttled browser window makes the numbers meaningless, which is why it runs headless.

## Reference laps

Local sessions of the 2026-11-04 baseline (the car must have a textured body in the package):

| Label | Session | Driver | Lap | Car |
|---|---|---|---|---|
| fuji | 2026_11_03_16_37_20-02R1 | 8 | 10 | ADESS AD25 LMP3 |
| silverstone | 2026_10_30_12_58_04-48R1 | 1 | 20 | BMW M4 LMGT3 |
| algarveNight | 2026_10_29_09_37_07-18R1 | 4 | 2 | GT3, the night race of the night picture set (lamps, night sky) |
| spaRace | 2026_11_26_21_53_52-83R1 | 5 | 6 | LMP3, a race lap in traffic; its scenery-heavy stretches made the slowest frames |

With the player's own cars (Ginetta at Fuji: driver 3 lap 10; Aston Martin at Silverstone: driver 19 lap 24; McLaren at
Le Mans 2026_11_03_09_38_24-03R1: driver 6 lap 2) once their car bodies validate.
