# 3D replay rendering fidelity

Status: in progress (2026-11-04 onward). Goal: make the replay's 3D view look closer to LMU. Game render settings reach the app
only through the data package: the pipeline reads them from the installed game and exports them (the scenery catalog's
`camera` profile, `LMUTrackPipeline/docs/SCENE_PACKAGE.md`; materials and their parameters in the chunk and car files). The app
holds only its own rendering code. How the game's files were read and what they hold is pipeline research
(`LMUTrackPipeline/docs/research/`), not repeated here. No picture matching (user decision 2026-11-04).

## Step 1 trial: metered auto-exposure (2026-11-05, committed 7f0fbab1)

`src/components/replay/view3d/autoExposure.ts`. The scene renders into a 4× multisampled half-float target. A 16 × 16 pass
averages log luminance over the camera profile's metering window (16 taps per cell), and the GPU reads it back asynchronously
every 4 frames. Exposure adapts in log space (rate 2/s, the first reading taken as is) toward target ÷ metered average, with the
target from the camera profile by sun elevation. The canvas gets one tone-mapped quad, and the canvas itself no longer
multisamples. Exposure is relative (target ÷ metered luminance), so the app's light units do not matter once it meters.

- **Look:** both reference laps are brighter than the old fixed 0.90 exposure, Silverstone the most (paler sky, lighter
  shadows). The frames before the first reading use exposure 1. The racing line is data, not scenery, so it keeps the fixed
  daylight exposure: exposure is set before the scene pass and the line divides it out of its colour as it draws (exposure is
  linear before tone mapping, so its pixels match the fixed-exposure look exactly, edges and blending included).
- **Calibration:** at the profile's targets the replay reads "a little too bright" (user), with Neutral and again with the
  profile's curve, so every target is scaled by 0.8 (`TARGET_SCALE`, the app's own calibration).
- **Cost, same machine and session:**

  | | Fuji p50 / p99 / >16 ms | Silverstone p50 / p99 / >16 ms |
  |---|---|---|
  | Before (fixed exposure) | 3.4 / 9.1 / 31 | 4.1 / 19.2 / 103 |
  | Auto-exposure | 3.5 / 9.5 / 41 | 4.3 / 22.9 / 112 |

  The baseline was slower than in the morning's runs (2.7 / 5.7 on Fuji), so compare within the table only.

## Steps 2–4 trial: tone curve, white balance, ambient occlusion, sky (2026-11-05, committed 7f0fbab1)

All in the exposure pass (`autoExposure.ts`), in linear light before the curve:

- **Tone curve:** the camera profile's curve, `renderer.toneMapping` is `NoToneMapping`. Softer contrast and lifted shadows
  against Neutral. The racing line stores `inverseToneCurve(colour)` and divides the exposure out, so it displays exactly the
  2D map's colours.
- **White balance:** the profile's Kelvin by sun elevation as a Bradford adaptation to 6500 K; identity at 6500 K, warmer under
  a bluer profile white (low sun).
- **Ambient occlusion:** three's `GTAOPass` on the scene's resolved depth (no extra scene draw) with the profile's radius,
  samples, scale and occlusion colour, faded out from 50 to 150 m where depth precision speckled distant hills. Same-window A/B
  on Silverstone: no measurable cost (the frame is CPU-bound).
- **Sky:** kept (three's Preetham sky, turbidity from the layout daylight).
- **Sky in the sun's units:** HDR probe at Daytona (into the sun): sky overhead 3.8 / 7.7 / 10.6 against sunlit asphalt
  ~0.2, about 35× (real daylight: about 1×), so the sky showed white and pulled exposure down; the environment's 0.112 scale
  also cut the sunlit ground's bounce light to a tenth, darkening shaded stands and car sides. Now the sky material itself is
  scaled by 0.112 (constant blend colour, for the displayed sky and the reflection capture) and the environment runs at 1:
  sky 0.42 / 0.86 / 1.19, blue, with the ground bounce at its sunlit value.
- **Exposure floor:** the metered log luminance never goes below a sunlit 18 % grey ground (`darkestMeteredLog`). The
  cockpit filled the metering window with its dark interior and raised exposure 2.8 stops (Daytona: 18.6 vs ~1 in the
  chase view), burning out the track outside; with the floor it is 1.65. Sunlit views meter above the floor.

Still open: per-camera profiles (the package carries the chase-view profile, applied to every camera), weather blending, light
shafts.

## Critique log (user, by eye)

| # | Date | Where | Critique | Status |
|---|---|---|---|---|
| 1 | 2026-11-05 | Fuji main straight | Black under and between far trees too visible | Screenshot (overhead, forest left of the pit straight): `.cache/replay-3d-look/fuji-dark-trees.webp`; split off |
| 2 | 2026-11-05 | All | Tone curve at the profile targets a little too bright | Done: targets × 0.8 |
| 3 | 2026-11-05 | Daytona cockpit | Way too bright | Done: exposure floor |
| 4 | 2026-11-05 | Daytona | White areas: scenery not loaded (lap-window residency: on a circular venue, parts far along the lap are near in a straight line; the overhead view has none) | Distance loading measured (Daytona draws p95 516→854, +0.8 GB) and rejected; user chose coarse sector ground in the horizon chunk (exporter, requested from the pipeline) |
| 5 | 2026-11-05 | Daytona infield | Wrong texture (flat grass, pit area) | Exporter chunking defect: `pipeline/scenery/chunking/assign.ts` keeps a connected piece whole in the section nearest its bounding-box centre (split only above 1000 m extent). A banking road strip (8,502 triangles, 2,054 m of lap) sits in s001 (250–500 m), so at lap 2,288 m the lanes 8–20 m beside the car are not resident and the far ground grass shows. 227 Daytona pieces span more than 300 m of lap. Fix proposed to the pipeline session: split by triangle when a piece's lap range exceeds the budget |
| 6 | 2026-11-05 | Daytona lake | Water not right (speckled) | Fix on branch claude/confident-mccarthy-943a96: roughness widened by the wave-normal spread (specular AA); merged here, OK by eye for now (2026-11-05) |
| 7 | 2026-11-05 | Daytona banking, Genesis | Wheel goes through the chassis | Real bottoming (front ~24 mm compression, bump stop at 20 mm); the model's tight arch clips; ride-height reference now the median of the slowest 10 % of samples (merged here), OK by eye for now (2026-11-05) |
| 8 | 2026-11-05 | Daytona, chase view toward the sun | Car looks low quality, stands too dark, sky too white; the opposite view looks much better | Sky and shade fixed (sky ×0.112 itself, environment at 1). Car paint (uncommitted, `car/carPaint.ts`): the package's paint description on three's physical model: region map blending of five paint setups, base and clear coat Fresnel from their refractive indices, lacquer absorption over the coat depth, AO/spec mask occlusion, carbon (red region); flakes, orange peel, damage and rain not carried. Plus contact shadow and reflection probe (audit item 4). Validated by eye (2026-11-07) |
| 9 | 2026-11-05 | All | Playback a little jittery | Fixed (uncommitted): the playback loop and the 3D view each ran their own animation-frame callback, and their order changed from frame to frame, so a frame showed the pose for its own time or the previous frame's. The car moved by 0.4–1.9× its speed per frame (production, per-frame position log), worst where frames alternate between 7 and 14 ms (Silverstone). Now the clock advances once per frame, to that frame's time, by whichever callback ticks first (`replayPlaybackCursor.ts` `tick`, the scene's `beforeFrame`): per-frame motion within 1 % of its local average on Daytona and Silverstone; frame cost unchanged. Validated by eye (2026-11-07) |
| 10 | 2026-11-05 | Daytona cockpit | Ripple (acne?) in the white line | Done (848920ac): shadow normalBias 0.01 → 0.05 (~1.3 texels); checked by eye |
| 11 | 2026-11-05 | Daytona | Slow to load | Open |
| 13 | 2026-11-05 | Daytona palms, crowd | Too bright, then too dark; not crisp, light not bouncing right. Use known techniques | Done (eb507224): shadow pass faces the view camera (no rest-plane wedges), a card skips its own plane (1 m) in the sun shadow lookup (was self-shadowing black), single hardware-filtered shadow tap (radius 1 blurred), alpha to coverage on cards (anti-aliased alpha test), leaf translucency from the material's parameters and min(2s,1) leaf shadow. World-up leaf normal replaced by spherical crown normals (standard billboard-foliage technique; per-card height span computed at load, foliageCrown.ts). Validated by eye at Daytona |
| 12 | 2026-11-05 | Daytona | The sun shadow window (160 m square, 30 m behind to 130 m ahead) moves with the car: shadows appear at its edge. Only the car's shadow should move | Done (eb507224, sunShadows.ts): cached static scenery map (1.2 km, ~29 cm texels, no cars, casters ≥ 1 m), double buffered and drawn a quarter per frame, redrawn after 200 m (100 m after a scenery change); near 160 m map unchanged, surfaces fade to the static map over its outer tenth. Spread at runtime chosen (2026-11-07). Production A/B: no cost (Daytona p99 8.9/9.8 vs 10.5/7.6 ms off; one-frame redraw was 12.8). Validated by eye (2026-11-07) |
| 14 | 2026-11-07 | Le Mans (La Sarthe) start/finish, chase view, LMP2 #9, session `2026_11_05_16_23_26-44R1` driver 17 lap 5 | Car sits in the ground (wheels sunk into the road) | Fixed (0944fca9): the horizon chunk's coarse far copy of the road (16 cm under the detailed road on the Mulsanne) answered the wheel and racing-line height lookups first; the ground fit and both height caches kept those heights after the detailed chunk loaded, so the car sat low and the line (missing on the Mulsanne, reported 2026-11-07) was draped under the road. The coarse chunk now serves the camera checks only. Checked headless at the start line and the Mulsanne; validated by eye (2026-11-07) |
| 15 | 2026-11-07 | Daytona, orbit around Genesis #17 (session `2026_11_05_12_14_39-32R1` driver 9 lap 13) | Red paint too mirror-like and low quality on the front and side; car shadow low quality | Paint: the metallic share is not a metal: it replaces the base layer with the lacquered base-coat reflection, faded off the facing angle and tinted by the flake colour, where three's `metalness` had tinted the reflection with the albedo (orange chrome). The remaining rear sheen is the livery's own base coat (index ~2.5, ~18 % reflection; blue flake colour), to compare against the game. Shadow: near window 160 → 80 m (~2 cm texels) halves the edge stair-steps; the light bars in it are the rear wing's real gaps. Awaiting eye check |

Open items, in the order to take them (user, 2026-11-07): fidelity first, then performance. Fidelity: #9 playback jitter, #8 car
paint, then the pipeline-audit items below (bloom, car reflections and contact shadow). Performance after: #11 Daytona load, then
the v5 lap visibility and LOD A/B.

## Pipeline audit (2026-11-07): to improve

The frame against standard practice, mesh to screen. Already standard and checked: HDR half-float target with 4x MSAA, sRGB
albedo / linear data textures, linear lighting with sRGB output last, metered auto-exposure, the profile's tone curve and white
balance, near + cached static sun shadows (one hardware-filtered tap, normal offset), camera-facing foliage with crown normals
and alpha to coverage, distance-faded GTAO, compressed mip-chained textures with 8x anisotropy, PBR with sky image lighting.

To improve, cheapest first:

1. **Output dithering.** The HDR image is quantized to 8 bits with no dither: smooth gradients (sky, haze) can band. Add
   sub-bit noise before the output in the exposure pass. No cost. Done (uncommitted): triangular interleaved-gradient dither of
   one 8-bit step after the output colour space; validated by eye (2026-11-07).
2. **Alpha to coverage on every cut-out material.** Today only billboard cards and two fence textures matched by name
   (`BARRIERS_FENCE[AB]_ALBA`) get it; other fences, nets, grilles and car alpha-mask parts keep the hard cut and shimmer (Fuji
   catch fence reads dotted). Standard: every alpha-tested material under MSAA, with coverage kept in the far mips. Done
   (uncommitted): every alpha-tested scenery material and car alpha-mask part (fences keep their lowered 0.2 cut); validated by eye
   (2026-11-07).
3. **Bloom / glare.** Sun on chrome, white lines and the sky edge looked flat. A bloom pass from the profile's glare threshold,
   merged into the exposure pass. Done (uncommitted, `glare.ts`): threshold in exposed luminance, half-resolution chain of 5
   levels, composited after the tone curve (tone + (1 − tone)·glare); strength set by eye (gain 0.5); no star streaks.
   Production pass at Silverstone: no cost. Validated by eye (2026-11-07).
4. **Car reflections and contact shadow.** Car paint reflected only the sky and a flat ground. A reflection probe near the car
   refreshed now and then, plus a contact shadow (ties to #8). Done (uncommitted): `car/carContactShadow.ts`, a soft
   rounded-footprint quad under the car (strength 0.6, 0.5 m spread); `car/carReflection.ts`, a 256 px cube probe at the car
   without the cars, one face a frame, convolved between frames and used by the car's lit materials only. Its reach is its cost:
   1.5 km doubled Silverstone's frames (p50 7 → 14 ms, p99 14 → 21 ms); 300 m matches no probe (p50 7.0, p99 14.0 ms, 28 vs 24
   frames over 16 ms); Daytona unchanged. Validated by eye (2026-11-07).

Known limits, left as they are: MSAA resolves before the tone map (hard edges between very bright and dark; a tone-mapped
resolve needs multisampled textures WebGL lacks); AO multiplies the whole image, not only ambient light; no temporal AA.

## Still open

- **Sky model.** Preetham with the layout daylight's turbidity; a different sky model only if the look needs it.
- **Reflections beyond the car probe.** Screen-space or per-area reflections for glass and wet track.

Each step is judged by eye against the game and re-runs `npm run benchmark:replay3d:suite` (p99 must stay < 16 ms).
