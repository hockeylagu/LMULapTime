# 3D replay: state and next round

Reviewed 2026-11-15 against the code, Git and the freeze-v18 run. Implementation lives in [CODE_MAP](../../CODE_MAP.md)
(replay inspector, `src/components/replay/view3d/`); the package contract is the pipeline's `docs/SCENE_PACKAGE.md` and
[plugin setup](../../PLUGINS.md). This file holds what is still open, the targets, and the decisions and rejected designs that
the next round must not redo. Completed delivery plans (simplified viewer, architecture R1–R8, renderer v2, performance review,
race replay steps 1–3, fidelity audits) are in Git history before this file.

## Where it stands

- **One scene for lap and race.** A scene shell per layout (`scene/sceneShells.ts`) serves the lap view (car + ghost) and the
  race view (whole grid on the session clock), kept loaded behind 2D; one WebGL context per circuit.
- **Package:** personal-v18 (schema 15, generator 9b1e7ec) is accepted and in `.env.local`. One colour rule for scenery and cars:
  sRGB when the format has an sRGB form and the DDS tag, the annotation or the SPECULARMAP stage says so; normals, BC4 and BC5
  linear. Colour-rule confirmation research was parked by the user as unnecessary: revisit only if a texture looks wrong or a
  new format appears.
- **Look:** freeze-v18 accepted by the user 2026-11-15 (61 views, mean dE 8.07, brightness ratio f 1.02, 54/61 in band; run,
  scores and review sheets in `docs/local/replay-3d-reference/FREEZE.md`). Later work keeps this picture. It includes the road
  groove at `ASSUMED_RUBBER` 51 drawn whole (groove 0.20): meant to be 13, the user kept the darker road as accepted.
  Refreshed 2026-11-24 as freeze-v26 on personal-v26 and `b62cff6eb` (mean dE 7.94, f 1.01, 54/61 in band): slightly closer to
  the game than v18 at every circuit; accepted by the user 2026-11-24. Later work keeps the freeze-v26 picture.
- **Performance:** the user declared the goal met 2026-11-15 (table below).

## Targets and current numbers

Production build, headless Edge, 1920×1080, cold (fresh profile, no browser cache), this machine (RTX 5070 Ti). Machine load
moves these by several ms: compare only interleaved A/B runs taken back to back, never during a build or export.

| Measure | Target (user) | freeze-v18 tree | personal-v20 tree (2026-11-16) | freeze-v26 tree (2026-11-24) |
|---|---|---|---|---|
| Lap first frame | < 5 s (2026-11-11) | Fuji 4.1 s, Silverstone 4.7 s | Fuji 4.6 s, Silverstone 5.1 s | Fuji 4.9 s, Silverstone 5.7 s |
| Lap playable, not stuck | < 7 s | met | met | met |
| Lap frame p50 / p99 after 7 s | < 10 / < 30 ms (2026-11-11); p99 ≤ 16.7 ms kept as the v2 aim | Fuji 2.8 / 16.5 ms, Silverstone 3.2 / 20.2 ms | Fuji 3.0 / 18.1 ms, Silverstone 3.2 / 15.0 ms | Fuji 5.2 / 24.6 ms, Silverstone 5.8 / 16.4 ms |
| Le Mans race start shown | < 5 s | 5.0–5.3 s | 5.4–5.8 s | — |
| Le Mans race start p50 / p95 / p99 | ≤ 10 / ≤ 16.7 ms (2026-11-14); p99 < 30 | 8.1–8.8 ms / 14.7–16 ms / 26.5–28.7 ms | 9.6–9.8 ms / 15.2–15.8 ms / 27–30 ms | — |
| Draws per frame | < 1,000 in every frame (a guide only) | ~750 at the race start | — | — |
| JS heap, disk | no higher than before each change; the package must not grow without an offsetting saving | — | — | Fuji 337 MiB, Silverstone 325 MiB |

freeze-v26 timing: the lap first frame and p50 drifted up since v18 (p50 varies 3–6 ms between runs on 2026-11-24; the readout
on/off A/B shows no readout cost); the cause is not measured yet.

Tools: `npm run benchmark:replay3d:suite -- --package personal-v18 --runs 2 --seconds 20` with
`PLAYWRIGHT_NODE_MODULES=C:/Documents/LMUTrackPipeline` ([harness](../../../tools/benchmarks/replay3d/README.md)); `--package`
is only a label, the backend's `LMU_PLUGIN_ROOT` decides what is measured. The race-start bench (Le Mans
`2026_10_22_14_49_23-99R1`, t = 190, 62 cars) is still a scratch script, not in the repo.

Look checks: the 10 views F13 F17 F18 F22 N1 N15 N16 N21 and night Q1 Q2 for each change, the full 70-view capture (61 day,
9 night) after a batch, scored by `docs/local/replay-3d-reference/inputs/score.py` and `compare.py` against the game frames. The
night set Q1–Q9 (`inputs/night.json`, captured by `night.mjs`) is the Algarve race replay at the game's RenderDoc night frames;
the scorer summarises it in its own `night` group, so the day `all` numbers stay comparable with the freezes. The capture hooks are a local patch
(`inputs/capture-hooks.patch`), applied to a scratch copy of the tree, never committed. Silverstone F17/F18/F22 flip between two
states run to run (stand chunk in the cached far cascade or not); the 10-view subsets over-weight Daytona.

## Rules

- Game values reach the app only through the package; no game names in app source, docs or tests. A constant fitted to the
  reference frames is named as one with the frames it came from. The exporter stays true to the game files (no decimation or
  invented parts) and never encodes how to display.
- three.js through its public API only (`onBeforeCompile` on our own materials included); never patch three. Remaining
  borderline use: `batching/batchedParts.ts` releases buffer arrays after upload.
- Anything that changes `scene.environment` or an `envMap`'s size or presence after the warm-up recompiles every lit material;
  anything that never draws needs `layers.mask` 0, or r187's `compile()` builds a program for it.
- A sampler more silently unbatches a material (texture units against `maxTextures`); count units before adding a map.
- Measure load with stage marks in a side build before proposing a load fix; estimates from waterfalls were wrong before.

## Decisions that stand

| Topic | Decision |
|---|---|
| Texture sharpening | 2 MiB upload budget a frame, shared by every warm-up and the sharpening, excess carried as debt; 1 MiB and 0.5 MiB were measured and rejected (sharpening 12–36 s, tail unchanged) |
| Car textures | The package sizes them (livery albedo and paint region 2048, other exterior maps 1024); the app adds no cap |
| Car reflection probe | 1024 px faces. With the package's reflection set (schema 17, the game's REFMAP0 set: a face is ~5 draws and 0.1-0.6 M triangles instead of ~216 draws and up to 3.7 M) three faces a frame, a cube every two frames as the game draws it, the prefilter and convolution riding the frames after (2026-11-16, personal-v20). Measured at the Le Mans start: frame p50 unchanged (~10.4 ms), GPU memory +165 MB, JS heap +194 MB; p95 16 to 27 ms, which was the exposure's CPU readback waiting on the busier GPU (4–6 ms median, 24 ms worst, ~15 a second), not the conversions: the exposure now meters and adapts on the GPU (2026-11-16, p95 back to 15.2–15.8 ms, slow frames 67 to ~28). Against a cube renewed every frame, the set reflects nearly the full scenery's picture (mean difference 0.29 Silverstone, 1.37 Barcelona), and the set at the game's rate is as close to that reference as the slower full-scenery probe with the overhead correction (Silverstone 0.98 vs 0.85, Barcelona 3.6 vs 4.2). Every layout ships the set; the full-scenery probe (one face a frame) was removed 2026-11-16. Near race cars share the followed car's probe. Between probes, car paint corrects its rising rays with depth maps of the scenery from above and below (car/overheadMap.ts): a ray meets a bridge, gantry or tree where it passes between an underside and its top, so their reflection slides over the car instead of stepping at each probe (2026-11-16; against a probe renewed every frame, Barcelona's bridge mean error 8.1 to 3.9). A fixed thickness under the tops was tried first: 3 m missed thick decks, 8 m counted the open space under gantries. Glass, lamps and trim take the same correction (car/carReflection.ts), with the venue's cube for the sky. A probe renewed 3x faster scored the same against the every-frame reference, and a ground-lit underside in place of the probe's view of the structure scored worse (Barcelona 3.9 to 9.7). A probe parallax (per-texel distances) was tried first and dropped: the probe, drawn ~25 m behind the car at speed, never saw the deck above the car and flashed bright on entry |
| Far shadow cascade | Cached; not redrawn when a chunk joins (Silverstone garages lighter or darker by load order, accepted) |
| Race field | Nearest 6 in view as full models (kept once built, for smooth traversal; parsed bodies not released), the rest as the body's far model, which casts and takes the sun's shadow too (the shadow does not pop at the tier switch, 2026-11-16); steering on full models only; far lamps for the nearest 16 within 300 m; ghost drawn part by part |
| Clouds and exposure | World-fixed cloud layer, sun visibility from the camera; meter −ln(1 − Y709(mean tone-mapped)) / E and the package's law; cloud sun dimming on |
| Road surface | Assumed rubber 51 on every element; the replay's own surface state (`docs/VCR_FORMAT.md` §4.21; its decoder, removed unused, is in 7fdc0455) needs a replay cache step (v11, with rainLight; user "not now"); never add a .Vcr file read in the meantime |
| Lamps | Headlight, brake and 4 Hz pit flash from the replay; disc glow parked (`docs/local/parked-disc-glow`) until a proven temperature mapping |
| Race timeline | The ticks are the followed (selected) car's laps, so they stop where it retires; never the leader's (user, 2026-11-17) |

## Rejected or parked, with the reason

- **Precomputed visibility per 40 m segment** (pipeline lists): main draws −25–35 %, but holes (thin and far objects, see-through
  fences counted as occluders) and +1.5–3 min export per layout. Parked by the user; not to be re-proposed unless raised.
- **Distance-based scenery loading** for circular venues: draws p95 516 → 854, +0.8 GB. Rejected; coarse ground in the horizon chunk instead.
- **Pre-linking every field body's programs during load:** load 6.5 → 11.5 s, heap +530 MB. Rejected; main-thread slicing kept.
- **Compile on arrival alone, car reduced-levels-first alone, deferring the environment:** no first-frame gain, measured.
- **Uber car material, merged anchors (renderer v2 P2/P3), livery texture arrays:** not needed for the targets; arrays are also
  blocked (r187's `copyTextureToTexture` has no compressed 2D → array layer path).
- **Ahead-of-time PMREM link:** three has no public pre-link; a cold launch pays ~0.8 s once. Propose upstream if it matters.
- **Transparent sort far-to-near under reversed depth:** hid a wheel display behind its glass; parked in `docs/local/parked-transparent-sort` until the
  screen/glass order is understood. Clouds keep their own order.
- **WebGPU/TSL migration, splitting scenery into more meshes, shorter resident windows:** more draws or hidden cost.
- **Look alternatives measured and left:** a white zenith sun (better on Daytona, worse on the other three circuits), turbidity
  fixed at 3.25, haze colour at 2°, exposure clamps per camera type, a sun-facing billboard shadow pass.
- **Known limits accepted:** MSAA resolves before the tone map, no temporal AA, ambient occlusion multiplies the whole image.

## Next round

The user's order (2026-11-15): colour fix, freeze (both done), then the analysis and UX work for using the 3D replay during
telemetry and race analysis.

### Analysis and UX

Proposed 2026-11-15: (1) corner focus, (2) driving markers, (3) lap events, (4) time-loss reel, (5) incident replays,
(6) car tags, (7) battle camera, (8) the followed car's event list. The user took 1 first, then 2 and 5 are next. Click-to-follow
a car: the user said "not now"; don't re-offer.

- **Corner focus (built 2026-11-16)**: a corner picked while the 3D view shows puts the cursor at its stretch and playback repeats
  it (`laps/useCornerFocus.ts`, the loop on `replayPlaybackCursor.ts`). The stretch starts 30 m before the brake point and ends as
  far past the slowest point; the corner segment itself runs speed peak to speed peak, a straight each side. The camera stays as
  it is (chase by default, the user's call); the bar's Corner view frames the stretch from the orbit camera outside the turn
  (`camera/cornerFraming.ts`). Slow plays at 0.5x.
- **Driving markers (built 2026-11-16)**: while a corner is focused, each lap's brake point, turn-in, slowest point and throttle
  on (the corner table's) lie on the road as stripes across its line, in the lap's colour; the comparison lap's are narrower and
  on top (`laps/drivingMarks.ts`, drawn through the line meshes' colour path in `racingLine.ts`). The comparison lap's slowest
  point is its own (`baselineMinDistM`), picked as the primary lap's. No labels: the bar shows the corner's time. Only the
  picked corner, the user's call over every corner.
- **Incident replays**: the race view's incident pick already lands 5 s before; it would add a camera on both cars and slow motion.

### Fidelity

- Known gaps carried in freeze-v18: Daytona's sun brighter than the game's under its clouds, Daytona chase F5 too bright,
  transparent objects in three's order.
- Replay data not drawn yet (decoded in `docs/VCR_FORMAT.md` unless noted), parked for a later round in this order: tyre smoke
  and sparks (§4.11 effect levels and spark points; decoder fields, one shared particle effect, needs the replay cache), cockpit
  displays (engine speed and gear decoded; needs the package's display layout), fitted tyre compound (§4.12; a texture per
  compound), brake disc glow (temperatures decoded), damage and debris (§4.5, §4.22; package extents and parts by bit), flags
  and track lights (§4.17, §4.18), exhaust effects (trigger meaning not established), tyre squish and tread (player car only).
- Headlight beams: the car files carry `Light=` spots, unit conversion unproven; needs a night capture and a per-body light list.
- The track-average groove reads the median rubber, an approximation. The real groove check waits for a filled surface (the
  Daytona cloud captures hold rubber on 51–54 % of the road).
- Ligier alternative bodies unselected; McLaren 720S render baselines and the Roof camera not yet checked by eye.

### Performance

- Le Mans race start shows at 5.4–5.8 s with the reflection set, over the 5 s line; remaining slow frames are the start burst
  (near car batching, warm compile, near loads).
- Follow switch (2026-11-17): the camera moves to the clicked car in ~0.1 s. The followed car is its body's field near car, lent
  (shared materials and batches), plus its cabin (the interior parts and the interior file at full level, own batches). It shows
  0.5-1.8 s later (Fuji, six rows): 0.5 s when the body is already near, else mostly the cabin's parse (0.2-1.3 s), then 14-19 MB
  of geometry uploaded; long frames 45-75 ms. The full model path it replaced took 1.0-1.5 s with 38-49 MB. Batches and a cabin
  wait in a layer no pass draws until warmed: drawn first, each new material linked its program at the draw (~200 ms each, a
  2-4 s stall per switch). A cockpit view still waits for the cabin. At the race start the followed car's body builds its full models
  first (from ~0.4 s, its cabin loading meanwhile), its far models and the other bodies after: Fuji 5.6 s against 5.1-5.3 s on
  the full model path (6.2 s waiting for the far models first); play heap 789 MB against 825 MB. The full models now build while
  the scenery loads (done ~2.1 s) and take 1.8 s instead of 0.8 s: the start is bound by that shared load.
- Fuji lap p99 18.1 ms against the 16.7 ms aim (personal-v20, measured before the GPU exposure).

### Race replay

- Pose rate check: 10 Hz windows with interpolation against 20 Hz.
- Labels over cars, flags and weather overlays: later.
