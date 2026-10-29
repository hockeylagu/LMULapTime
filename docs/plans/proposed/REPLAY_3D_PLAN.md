# Simplified 3D replay

Status: **In progress**. The viewer and plugin loading are in the app; the pipeline's
`export:plugin --scenes` publishes a scene for all 32 layouts (surfaces plus each venue's roadside
structure) in the v2 data package. Car models decode for a few records only; extending the exporter to
every car is the next step. The initial mirrored view exposed a missing handedness conversion, now
corrected consistently for scene/poses/cameras.
The renderer conversion is documented in [telemetry coordinates](../../TELEMETRY_FORMAT.md#map-and-native-coordinates).

## First step

Export a render model for every car record (each manufacturer's GEN names its body, tyre and rim
meshes differently), then complete camera/comparison acceptance on more layouts. Keep performance
and full-attitude calibration as separate gates before adding detail.

The surface-only candidate is 6.56 MB, with 317,861 triangles and a 30.4 m elevation range.
A source review and one cached VCR lap checked native metres, matching geometry revision and
yaw direction. At 99 mesh intersections the body origin sits 0.306–0.386 m above the surface;
that establishes registration for this recording, not calibrated wheel contact or every track.
The viewer renders recorded XYZ and available yaw/pitch/roll, labels approximate body placement, uses the existing
playhead and offers orbit/follow/chase/fixed/top cameras. A station-aligned ghost is implemented;
full comparison and lifecycle acceptance remains. See [the package contract](../../PLUGINS.md#3d-track-scenes-package-version-2).

The Duqueine D09 P3 now has an exact-record optional render mesh with native body, chassis,
exterior, wing, glass, four tyres and four rims. The 2 MB private export uses one exterior LOD;
primary and ghost load independently tinted copies. It remains untextured and labelled
as approximate placement. Other vehicle records fall back to an estimated body with class-sized
tyres. Every car's wheels roll (telemetry wheel speed, else replay travel, scaled by `1 + slip ratio`
from the live capture so lockups stop and wheelspin overruns; native wheel speed tracks ground speed and
never shows either), steer (recorded steering over the plugin ratio) and move vertically (ride height, else road contact); the model origin is fitted
to the lap median. Over a Portimao lap the tyres stay within ±2 cm of the road, which is a visual fit,
not calibrated contact. The scene has a sky dome, horizon fog, sun shadows from the car, walls, boards and kerbs within 60 m of the car, and a generated relief
terrain: each grid corner sits 0.2 m under the lowest scanned triangle above it, fading to a flat
horizon level. Ground sheets are turned face-up and drawn one-sided, so no underside shows past a
hillside edge; the camera cannot go below road, relief or ground. Follow/chase stay locked on the car.
The racing line is a 0.6 m ribbon draped on the road in the 2D map's colours (pedal, speed, delta,
gain/loss, plain); the comparison lap lies on top at 0.3 m. Kerbs carry red/white bands by lap
distance. The road inside the 2D map's active-layout outline is dark (a 0.25 m mask with a per-pixel edge); other roads stay lighter grey. The layout's boundaries (the painted white lines, the track limits) are draped as sharp 0.25 m white ribbons. Exported brake boards stand as tall white portrait signs with stacked digits on steel posts,
like the game's Portimão boards, facing approaching cars. Barriers come from the scene's collision-only
`COL_*` meshes (armco, tyre walls, TecPro, closed-road walls), capped to display height; the pit wall is
`PitWall_Col` capped to 1.2 m. The main pit-building shell and perimeter/brick walls are the game's
render meshes, flat-coloured; pit details, lights and ad panels stay out. Cameras: follow, chase,
orbit (free), trackside (fixed TV-style spots every 160 m, 18 m left of the line) and overhead. The terrain stays
a rough generated estimate by choice: the track is what matters, so game terrain meshes are not exported.

Remaining requirements:

- Validate corrected corner handedness, camera switching, scrubbing, lap loops, ghost placement,
  fullscreen focus/Escape, context-loss recovery and repeated enter/leave cleanup on real laps.
- Measure frame pacing, load time and GPU/memory lifetime on the intended PC; the production
  bundle is lazy-loaded, but a successful build does not establish rendering performance.
- Export useful landmarks (garages, pit wall). Current selection covers HAT surfaces and
  collision barriers; buildings and textures are not yet published. Preserve analytical package revisions.
- Validate combined attitude against an independent game orientation matrix and calibrate vertical
  model origin/wheel contact; current Y-X-Z composition has source-lap pitch/slope and roll/bank checks,
  not full contact acceptance. Extend exact-record render mesh coverage beyond the initial car. Add speed/pedal trail
  coloring and selected-corner framing without changing metrics.
- Check barrier coverage per venue: the SCN mesh names were tuned on Portimao, and many venues
  export surfaces only.

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
