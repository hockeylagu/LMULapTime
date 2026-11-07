# 3D replay rendering fidelity: what the game does

Status: research (2026-11-04), nothing implemented. Goal: make the replay's 3D view look closer to LMU by adopting the game's
own render settings (operators, curves, per-elevation values) instead of tuning by eye. No picture matching (user decision
2026-11-04): the game's values are the reference, and nothing is decoded or exported beyond what a step needs.

Already known from the pipeline (`LMUTrackPipeline/docs/research/SCENERY_MATERIALS.md`): materials, shader families, UV
conventions and the solar position are decoded and reproduced. Lighting, exposure, tone mapping and post-processing are still
"viewer approximations pending matched captures". This review covers that gap.

## Sources read

All installed with the game; decoded locally, never committed or published.

| File | Archive | What it holds |
|---|---|---|
| `PostProcessing.h` | `Core/Shared/coreshaders.mas` | Exposure (manual, or auto from log-average luminance), 8 tone-map operators, bloom, HSV and contrast/brightness grading, optional 1D lookup curve, then gamma 2.2 |
| `IBLShared.h`, `ps30_IBL*.psh` | same | Lighting model: GGX specular with Smith visibility and Schlick Fresnel, a sun-disc term (~1° disc), Disney diffuse, image-based ambient and specular from cubemaps, under-car shadow term, cockpit reflection occlusion from a signed-distance volume |
| `ps30_ambientOcclusion.psh` | same | Screen-space ambient occlusion (ring sampling); on in the user's settings |
| `ScreenSpaceReflection.h`, `ps30_roadReflectionShader.psh` | same | Screen-space reflections and road reflections (wet road, heat mirage) |
| `HDRParamTable.ini` | `Core/Shared/Weather.mas` | Per sun elevation (0–90°, 1° steps): sky luminance, target luminance, white point, air mass, Perez sky coefficient scales, cloud intensity; two tables, *Modified Reinhard* and *Filmic* |
| `SilverLining.config` | same | Sky: SilverLining middleware with Hosek-Wilkie and Preetham sky models, turbidity 3.25, ozone 0.35, SPECTRL2 air mass, sun disc, glare and lens-flare settings, tone-mapping brightness |
| `colorCorrectionCurve.png` | `Core/Shared/` (loose) | 256×2 lookup curve, neutral in colour, an S-curve that brightens mid-tones and clips near 0.81 input |
| Venue `.gdb` / `.scn` / `.wet` | layout archive | Air pollution, haze scales (base, cloudy, storm, dawn), fog height scalars, max shadow range (Fuji 1000 m), weather per session slot (sky type, start time) |

`HDRParamTable.ini`, `SilverLining.config` and the `.fx` sky shaders are text types the pipeline's archive extractor does not
accept yet; they were decoded with its decoder plus a text-only check (scratch script, not committed).

## What the game actually runs (2026-11-05)

`HDRParamTable.ini` and `PostProcessing.h` are the **legacy** path: the user's `Settings.JSON` has "Enable Legacy HDR Profiles"
off. The current renderer is Silicon Studio's YEBIS post library (strings in the executable), configured by `pplib_*.json` in
`Core/Shared/AE.mas`: one base file plus a preset per camera kind (VehicleOnboard, TvCameraStatic, TvCameraTracking,
**VehicleExternal** for chase-style views, VR variants, Showroom, Liveryroom).

- **Auto-exposure, metered.** `ToneMapping.AutoExposureEnabled` true; metering area 0.6 × 0.8 of the screen at (0.2, 0.2);
  adaptation sensitivity 0.25, scale 0.35, speed limit 1.0. Exposure aims the metered scene at a *target exposure* per
  time-of-day profile, clamped to a min/max.
- **Seven time-of-day profiles by sun elevation** (`fTonemapSunTarget`, degrees), clear sky, base → VehicleExternal:

  | Sun ° | Target exposure | Max exposure | White balance K | Sky sun proximity |
  |---|---|---|---|---|
  | −5 | 0.5 | 4.0 | 7500 | 0.80 |
  | 0 | 0.5 | 5.0 | 7000 | 0.80 |
  | 5 | 0.5 | 1.2 | 6800 | 0.80 |
  | 30 | 0.35 → **0.325** | 0.9 | 6600 | 0.80 |
  | 60 | 0.275 → **0.24** | 0.5 | 6500 | 0.88 |
  | 90 | 0.21 → **0.2** | 0.35 | 6500 | 0.97 |
  | 100 | 0.19 → **0.15** | 0.3 | 6500 | 0.99 |

  Tone curve 0.5 in every profile, light/dark exposure border 1.0–1.5, saturation 1.0, glare threshold 1.5.
- **Tone mapping:** YEBIS `Type` 2, `MappingFactor` 2.0, `CharacteristicCurve` 0.7, `SceneLuminanceScalar` 2.2, gamma 2.2,
  gamut mapping 0.5/0.5. The curve is recovered from the executable (LMUTrackPipeline
  `pipeline-data/review/yebis-camera/native/runtime-findings.md`, private): per colour component of the exposed linear colour
  x, `z = e^(-A·x)`, `tone = saturate((1 - z)(1 - B·z)²)`, then gamma. The time-of-day profiles' curve control 0.5 (not the
  base 0.7) reaches the library, giving A = 2.658, B = 0.665 (TV profiles 0.6: A = 2.762, B = 0.735). Profile saturation 1.0
  and the Kelvin table are the active colour settings; the base JSON saturation 0.95 / 10000 K / -1° are not registered.
- **Also on in the base:** SSAO (16 samples, radius 0.5 m, scale 4), light shafts, star glare; TAA, depth of field and motion
  blur off for the external view.

Consequence for step 1: exposure is relative (target ÷ metered luminance), so the app's arbitrary light units stop mattering
once it meters, but metering needs the HDR frame in a render target plus a luminance reduction (one more full-screen pass).
The operator is now known, so it is ported as is rather than approximated.

## Step 1 trial: metered auto-exposure (2026-11-05, committed 7f0fbab1)

`src/components/replay/view3d/autoExposure.ts`. The scene renders into a 4× multisampled half-float target. A 16 × 16 pass
averages log luminance over the game's metering window (16 taps per cell), and the GPU reads it back asynchronously every
4 frames. Exposure adapts in log space (rate 2/s, the first reading taken as is) toward target ÷ metered average, with the
target from the VehicleExternal profiles by sun elevation. The canvas gets one tone-mapped quad (still `NeutralToneMapping`),
and the canvas itself no longer multisamples. The game's min/max clamps are not applied: they are in its own light units.

- **Look:** both reference laps are brighter than the fixed 0.90 exposure, Silverstone the most (paler sky, lighter shadows).
  The frames before the first reading use exposure 1. The racing line is data, not scenery, so it keeps the fixed daylight
  exposure: exposure is set before the scene pass and the line divides it out of its colour as it draws (exposure is linear
  before tone mapping, so its pixels match the fixed-exposure look exactly, edges and blending included).
- **Calibration:** at the game's targets the replay reads "a little too bright" (user), first with Neutral and again with the
  game's curve (at the midday target both display mid grey near 0.20), so every target is scaled by 0.8 (`TARGET_SCALE`).
  It stands in for what is not recovered yet: the game's metering statistic and its scene luminance scale (2.2).
- **Cost, same machine and session:**

  | | Fuji p50 / p99 / >16 ms | Silverstone p50 / p99 / >16 ms |
  |---|---|---|
  | Before (fixed exposure) | 3.4 / 9.1 / 31 | 4.1 / 19.2 / 103 |
  | Auto-exposure | 3.5 / 9.5 / 41 | 4.3 / 22.9 / 112 |

  The baseline was slower than in the morning's runs (2.7 / 5.7 on Fuji), so compare within the table only.

## Steps 2–4 trial: game curve, white balance, ambient occlusion, sky (2026-11-05, committed 7f0fbab1)

All in the exposure pass (`autoExposure.ts`), in linear light before the curve:

- **Tone curve:** the recovered sensitometric curve with A/B for control 0.5, at the game's targets × 0.8;
  `renderer.toneMapping` is `NoToneMapping`. Softer contrast and lifted shadows against Neutral. The racing line stores
  `inverseToneCurve(colour)` and divides the exposure out, so it displays exactly the 2D map's colours.
- **White balance:** the profiles' Kelvin by sun elevation (7500 K at -5° to 6500 K from 60°) as a Bradford adaptation to
  6500 K; identity at midday, warmer at a low sun.
- **Ambient occlusion:** three's `GTAOPass` on the scene's resolved depth (no extra scene draw) with the base preset (16
  samples, 0.5 m, scale 4, occlusion colour 0.5), faded out from 50 to 150 m where depth precision speckled distant hills.
  Same-window A/B on Silverstone: no measurable cost (the frame is CPU-bound).
- **Sky:** kept. The game's sky (SilverLining Hosek-Wilkie) takes its turbidity and pollution values from compiled-in
  defaults, not files, so there are no game values to port beyond what the layout daylight already sets.

- **Sky in the sun's units:** HDR probe at Daytona (into the sun): sky overhead 3.8 / 7.7 / 10.6 against sunlit asphalt
  ~0.2, about 35× (real daylight: about 1×), so the sky showed white and pulled exposure down; the environment's 0.112 scale
  also cut the sunlit ground's bounce light to a tenth, darkening shaded stands and car sides. Now the sky material itself is
  scaled by 0.112 (constant blend colour, for the displayed sky and the reflection capture) and the environment runs at 1:
  sky 0.42 / 0.86 / 1.19, blue, with the ground bounce at its sunlit value.
- **Exposure floor:** the metered log luminance never goes below a sunlit 18 % grey ground (`darkestMeteredLog`). The
  cockpit filled the metering window with its dark interior and raised exposure 2.8 stops (Daytona: 18.6 vs ~1 in the
  chase view), burning out the track outside; with the floor it is 1.65. Sunlit views meter above the floor.

Still open: TV profiles' curve 0.6 and their own targets/meter (the replay applies VehicleExternal to every camera), the
onboard preset, weather blending, glare/light shafts.

## Critique log (user, by eye)

| # | Date | Where | Critique | Status |
|---|---|---|---|---|
| 1 | 2026-11-05 | Fuji main straight | Black under and between far trees too visible | Screenshot (overhead, forest left of the pit straight): `.cache/replay-3d-look/fuji-dark-trees.webp`; split off |
| 2 | 2026-11-05 | All | Game curve at the game targets a little too bright | Done: targets × 0.8 |
| 3 | 2026-11-05 | Daytona cockpit | Way too bright | Done: exposure floor |
| 4 | 2026-11-05 | Daytona | White areas: scenery not loaded (lap-window residency: on a circular venue, parts far along the lap are near in a straight line; the overhead view has none) | Distance loading measured (Daytona draws p95 516→854, +0.8 GB) and rejected; user chose coarse sector ground in the horizon chunk (exporter, requested from the pipeline) |
| 5 | 2026-11-05 | Daytona infield | Wrong texture (flat grass, pit area) | Exporter chunking defect: `pipeline/scenery/chunking/assign.ts` keeps a connected piece whole in the section nearest its bounding-box centre (split only above 1000 m extent). The banking `ROADA_WET` strip (8,502 triangles, 2,054 m of lap) sits in s001 (250–500 m), so at lap 2,288 m the lanes 8–20 m beside the car are not resident and the far ground grass shows. 227 Daytona pieces span more than 300 m of lap. Fix proposed to the pipeline session: split by triangle when a piece's lap range exceeds the budget. Export otherwise faithful (checked against the game physics surface; newest archives for all 33 layouts) |
| 6 | 2026-11-05 | Daytona lake | Water not right (speckled) | Fix on branch claude/confident-mccarthy-943a96: roughness widened by the wave-normal spread (specular AA); merged here, OK by eye for now (2026-11-05) |
| 7 | 2026-11-05 | Daytona banking, Genesis | Wheel goes through the chassis | Real bottoming (front ~24 mm compression, bump stop at 20 mm per the car's physics file); the model's tight arch clips; ride-height reference now the median of the slowest 10 % of samples (merged here), OK by eye for now (2026-11-05) |
| 8 | 2026-11-05 | Daytona, chase view toward the sun | Car looks low quality, stands too dark, sky too white; the opposite view looks much better | Sky and shade fixed (sky ×0.112 itself, environment at 1); car paint still to check |
| 9 | 2026-11-05 | All | Playback a little jittery | Open |
| 10 | 2026-11-05 | Daytona cockpit | Ripple (acne?) in the white line | Done (848920ac): shadow normalBias 0.01 → 0.05 (~1.3 texels); checked by eye |
| 11 | 2026-11-05 | Daytona | Slow to load | Open |
| 13 | 2026-11-05 | Daytona palms, crowd | Too bright, then too dark; not crisp, light not bouncing right. Same meshes as the game, so use known techniques | Done (eb507224): shadow pass faces the view camera (no rest-plane wedges), a card skips its own plane (1 m) in the sun shadow lookup (was self-shadowing black), single hardware-filtered shadow tap (game: one sample_c_lz; radius 1 blurred), alpha to coverage on cards (anti-aliased alpha test), game leaf translucency formula and min(2s,1) leaf shadow. World-up leaf normal replaced by spherical crown normals (standard billboard-foliage technique; per-card height span computed at load, foliageCrown.ts). Validated by eye at Daytona |
| 12 | 2026-11-05 | Daytona | The sun shadow window (160 m square, 30 m behind to 130 m ahead) moves with the car: shadows appear at its edge. Only the car's shadow should move | Done (eb507224, sunShadows.ts): cached static scenery map (1.2 km, ~29 cm texels, no cars, casters ≥ 1 m), double buffered and drawn a quarter per frame, redrawn after 200 m (100 m after a scenery change); near 160 m map unchanged, surfaces fade to the static map over its outer tenth. LMU itself draws 6 cascades per frame and bakes none; spread at runtime chosen (2026-11-07). Production A/B: no cost (Daytona p99 8.9/9.8 vs 10.5/7.6 ms off; one-frame redraw was 12.8). Awaiting eye check |
| 14 | 2026-11-07 | Le Mans (La Sarthe) start/finish, chase view, LMP2 #9, session `2026_11_05_16_23_26-44R1` driver 17 lap 5 | Car sits in the ground (wheels sunk into the road) | Fixed (ground fix commit): the horizon chunk's coarse far copy of the road (16 cm under the detailed road on the Mulsanne) answered the wheel and racing-line height lookups first; the ground fit and both height caches kept those heights after the detailed chunk loaded, so the car sat low and the line (missing on the Mulsanne, reported 2026-11-07) was draped under the road. The coarse chunk now serves the camera checks only. Checked headless at the start line and the Mulsanne; awaiting eye check |

## Pipeline audit (2026-11-07): to improve

The frame against standard practice, mesh to screen. Already standard and checked: HDR half-float target with 4x MSAA, sRGB
albedo / linear data textures, linear lighting with sRGB output last, metered auto-exposure, the game's tone curve and white
balance, near + cached static sun shadows (one hardware-filtered tap, normal offset), camera-facing foliage with crown normals
and alpha to coverage, distance-faded GTAO, compressed mip-chained textures with 8x anisotropy, PBR with sky image lighting.

To improve, cheapest first:

1. **Output dithering.** The HDR image is quantized to 8 bits with no dither: smooth gradients (sky, haze) can band. Add
   sub-bit noise before the output in the exposure pass. No cost.
2. **Alpha to coverage on every cut-out material.** Today only billboard cards and two fence textures matched by name
   (`BARRIERS_FENCE[AB]_ALBA`) get it; other fences, nets, grilles and car alpha-mask parts keep the hard cut and shimmer (Fuji
   catch fence reads dotted). Standard: every alpha-tested material under MSAA, with coverage kept in the far mips.
3. **Bloom / glare.** The game's profiles have glare on (threshold 1.5, star glare); we have none, so sun on chrome, white lines
   and the sky edge look flat. A bloom pass from the game's threshold, merged into the exposure pass.
4. **Car reflections and contact shadow.** Car paint reflects only the sky and a flat ground; the game captures track cubemaps
   and draws an under-car shadow term. A reflection probe near the car refreshed now and then, plus a contact shadow (ties to
   #8 and gaps 4–5 below).

Known limits, left as they are: MSAA resolves before the tone map (hard edges between very bright and dark; a tone-mapped
resolve needs multisampled textures WebGL lacks); AO multiplies the whole image, not only ambient light (as the game's
post-process AO does); no temporal AA (off in the game for this view).

## What the app does today

`sceneEnvironment.ts`: three.js `Sky` (Preetham) with fixed turbidity/Rayleigh/Mie, one sun `DirectionalLight` at intensity
4.0, PMREM of the sky plus a ground disc for ambient and reflections, exponential fog. The exposure pass meters, white-balances,
applies GTAO and the game's tone curve (steps above). No screen-space reflections, bloom or glare.

## Gaps, largest visual effect first (expected; screenshots decide)

1. **Exposure and tone mapping.** The game exposes per sun elevation (table above, auto-exposure from scene luminance) and
   tone-maps with Modified Reinhard or Filmic (which one is active is not settled: the post shader also has a
   `UseYebisPostProcessing` switch, and the user's settings disable "legacy HDR profiles"), then grades (HSV, contrast,
   lookup curve) and applies gamma 2.2. We use a fixed exposure and three.js's Neutral curve. This drives overall brightness,
   contrast and colour more than any material.
2. **Sky model and sun/sky balance.** Hosek-Wilkie (game) vs Preetham (us), different turbidity, and the game's per-elevation
   sky luminance and Perez scales. Affects the sky colour, the ambient light on everything and the horizon haze.
3. **Ambient occlusion.** The game runs SSAO; we have none. Contact darkening under barriers, in kerb joints and around the
   car is the most visible missing cue after exposure. three.js has a standard pass for it (`GTAOPass`/SSAO in the post
   addons); it costs GPU time, which we have spare (the frame is CPU-bound).
4. **Car grounding.** The game draws a dedicated under-car shadow term; our single sun shadow map gives a softer contact.
   Ties in with the "second shadow map around the car" option already noted in the performance plan.
5. **Reflections.** Static per-area cubemaps, spatial irradiance probes and SSR in the game vs one sky PMREM for us. Matters
   for glass, car paint and wet track; less for dry asphalt.
6. **Bloom, glare, lens flare.** Present in the game (sun glare disabled in the sky config). Small effect in daylight.

## Proposed order

1. Exposure + tone mapping: exposure from the sun elevation table, the game's operator (Modified Reinhard or Filmic) as a
   three.js tone-mapping function, plus the colour curve and gamma 2.2. The values are a few constants copied into the app;
   no new package data.
2. Sky: the game's turbidity, haze and sky luminance values on the existing sky; a Hosek-Wilkie sky only if that is not enough.
3. SSAO through the standard three.js post pass.
4. Car contact shadow, then reflections, if the view still lacks them.

Each step is judged by eye against the game and re-runs `npm run benchmark:replay3d:suite` (p99 must stay < 16 ms).
