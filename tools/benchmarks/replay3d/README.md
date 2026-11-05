# 3D replay frame-time benchmark

Opens one lap in the running app's fullscreen 3D view in headless Edge on the real GPU, measures load, plays the lap and reports
frame-time percentiles. Targets and the plan it measures: [`docs/plans/proposed/REPLAY_3D_PERFORMANCE.md`](../../../docs/plans/proposed/REPLAY_3D_PERFORMANCE.md).

## Run

Start the app (`npm run dev`, UI on 5173, a data package with scenery for the layout in `LMU_PLUGIN_ROOT`), then:

```bash
PLAYWRIGHT_NODE_MODULES=C:/Documents/LMUTrackPipeline npm run benchmark:replay3d -- --session 2026_11_03_16_37_20-02R1 --driver 3 --lap 10 --label fuji
```

Check the targets against a production build. The dev server's React development build adds a 20 Hz tail of ~17 ms
frames during playback. Build into any folder, serve it with `npx vite preview --outDir <folder> --port 4173` (it proxies
`/api` like the dev server) and pass `--base http://localhost:4173`.

`PLAYWRIGHT_NODE_MODULES` is any directory whose `node_modules` holds `playwright` or `playwright-core` (the app does not depend
on it). Options: `--seconds` played (default 40), `--base` UI URL, `--width`/`--height` viewport (default 1920×1080, device pixel
ratio 1), `REPLAY3D_BROWSER` channel (default `msedge`). The page runs at the app's own pixel-ratio cap; a 2560 monitor at
fullscreen is `--width 2560 --height 1440`.

`--skip-offscreen-draws` is an experiment, not a baseline: it drops every draw into a framebuffer other than the canvas
(shadow maps, warm-up probes), so comparing a run with and without it gives the shadow passes' cost.

`--cpu-profile` samples the main thread with the DevTools profiler during load and while playing, and reports the 25
functions with the most self time for each. Every run also reports the renderer main thread's busy share (task, script, style, layout time per second).

Results print as JSON and are saved, with the ten worst frames and the per-frame series (interval, main draws, offscreen draws,
upload KiB, program links, callback ms), to `.cache/replay-3d-performance/<label>-<time>.json`.

## What it measures

- **Load**: navigation to the first 3D frame (canvas shown, "Loading 3D track surfaces…" gone), long tasks during load. A scene
  that fails to load stops the run with its error message.
- **Frames** (only frames that drew the main pass; the scene redraws only on change): Chromium runs with `--disable-gpu-vsync --disable-frame-rate-limit`, so each `requestAnimationFrame` interval is
  the frame's whole cost (script, render submission and GPU back-pressure), not a 60 Hz tick. p50/p95/p99/max, frames over 16
  and 33 ms. The first five frames after the play key are skipped.
- **Callback time**: main-thread time in the page's animation-frame callbacks per drawn frame (script and render
  submission, without GPU waits or idle time). Steadier than the interval for comparing two builds; compare intervals for the
  targets.
- **Per frame**: draw calls into the default framebuffer (main pass) and into other framebuffers (shadow maps, warm-up probes),
  bytes passed to buffer/texture uploads, program links during play, long tasks during play.

The probe wraps `WebGL2RenderingContext` methods, which adds a small constant cost per draw; compare runs with each other, not
with numbers from other tools. A hidden or throttled browser window makes the numbers meaningless, which is why it runs headless.

## Reference laps

Local sessions of the 2026-11-04 baseline (the car must have a textured body in the package):

| Label | Session | Driver | Lap | Car |
|---|---|---|---|---|
| fuji | 2026_11_03_16_37_20-02R1 | 8 | 10 | ADESS AD25 LMP3 |
| silverstone | 2026_10_30_12_58_04-48R1 | 1 | 20 | BMW M4 LMGT3 |

With the player's own cars (Ginetta at Fuji: driver 3 lap 10; Aston Martin at Silverstone: driver 19 lap 24; McLaren at
Le Mans 2026_11_03_09_38_24-03R1: driver 6 lap 2) once their car bodies validate.
