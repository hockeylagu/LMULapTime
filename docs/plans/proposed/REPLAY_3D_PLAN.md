# Simplified 3D replay

Status: unstarted proposal. Product direction: a simplified game-like scene supplied by the existing
external geometry export/plugin mechanism, simple cars and cameras for line analysis. The exporter
exists; its usable output/coordinate contract still needs a representative sample. Reviewed for
scope 2026-10-25; no scene or browser performance was validated in this review.

## First step

Load one real exported layout and one full-resolution cached lap. Establish scene units, pivot,
axes, Euler order/body origin, altitude, materials and analytical-geometry revision. Check a climb,
banked corner and timing-line crossing before choosing the plugin schema or estimating delivery.
Do not invent a new extraction pipeline or couple this feature to the replay-storage proposal.

## Accepted scope

- Road, kerbs, useful barriers/runoff/landmarks and generic class-sized car bodies. Detailed liveries,
  animated suspension, weather effects, full-field races, VR and video export are not prerequisites.
- Primary lap plus a station-aligned comparison ghost using the existing replay/telemetry cursor,
  selection and deterministic comparisons. Preserve time/distance alignment and lap-seam behavior.
- Orbit/pan/zoom, world-heading follow, chase, fixed trackside and orthographic top views; reset and
  fullscreen. Manual input must not fight follow. Scrubbing/loops snap to the current target;
  smoothing must not delay cars or telemetry. Respect reduced motion and keyboard access.
- Explain approximate/interpolated pose or incomplete scenery without implying measured geometry.
  Do not invent wheel-state/TC/ABS animation from missing data.

## Data and acceptance constraints

Keep detailed scenes in external local packages. Bind every asset to an exact circuit layout and
validated source/geometry revision; never infer compatibility from a shared facility name. Keep
existing 2D plugins/replay caches usable. Validate paths and binary assets, serve through the existing
backend/API client, and retain fallback when packages, WebGL or assets fail.

Lazy-load the renderer, dispose scene/GPU resources, bound quality and measure frame pacing, memory
and load time on the intended machine (including a large layout such as Le Mans). The scene, primary
car and ghost must remain aligned through play, pause, scrub, lap loops and camera changes. Existing
telemetry and 2D behavior must pass their usual correctness checks. Optional meshes/scenery can follow
only after this single-track placement and lifecycle gate succeeds.
