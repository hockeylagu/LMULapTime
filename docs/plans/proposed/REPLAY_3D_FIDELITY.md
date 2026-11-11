# 3D replay rendering fidelity

Status: in progress (2026-11-04 onward). Goal: make the replay's 3D view look closer to LMU. Game render settings reach the app
only through the data package: the pipeline reads them from the installed game and exports them (the scenery catalog's
`camera` profile, `LMUTrackPipeline/docs/SCENE_PACKAGE.md`; materials and their parameters in the chunk and car files). The app
holds only its own rendering code. How the game's files were read and what they hold is pipeline research
(`LMUTrackPipeline/docs/research/`), not repeated here. Picture matching against the 24 in-game screenshots is allowed (user
decision 2026-11-08, replacing "no picture matching" of 2026-11-04): they measure the look (exposure in stops, colour balance,
shadow level per track) and may calibrate what the game files cannot give, such as the conversion from the app's light units to
the game's exposure units. Values still come from the game files where they exist; a constant fitted to the screenshots is
named as such, with the shots and the measurement it came from.

## Where we are

Score against the 62 reference frames (`docs/local/replay-3d-reference`, `inputs/score.py` / `compare.py`): f is the game's
brightness over the app's (1 = equal; band 0.8–1.25), dE the mean colour difference. The app's own baseline frames score f 1.01,
54/62 in band, dE 10.2.

| Run | Date | Change | f median | In band | dE | Cockpit f | Chase f | TV f |
|---|---|---|---|---|---|---|---|---|
| after4 | 2026-11-08 | Before the v8 package | 1.08 | 52/62 | 9.78 | 1.23 | 1.04 | 1.07 |
| after6 | 2026-11-09 | v8: package sky dome, profiles by sun strength, no 10° sun floor, AO at package scale | 0.89 | 34/62 | 10.78 | 1.59 | 1.17 | 0.81 |
| after7 | 2026-11-09 | Camera AO removed (the frames have none at the reference settings) | 0.89 | 34/62 | 10.60 | 1.44 | 1.15 | 0.80 |
| after8 | 2026-11-09 | Scenery reflection by the package rule, 128 px venue cubes | 0.87 | 33/62 | 11.16 | 1.50 | 1.12 | 0.80 |

Open, in order:
1. **Camera types split since v8:** cockpit views are now too dark (f 1.44) and TV views too bright (f 0.80), where after4
   had both near 1. AO was not the cause. The suspect is where each type's profile lands on its `sunTarget` knots (the sun
   strength's unit against the knots'); check before touching the exposure calibration (4.06).
2. **Sun shadow beyond the near square:** done 2026-11-11. Every view takes the sun's shadow from the package's cascades
   (cockpit set onboard, chase set elsewhere; the package publishes no TV splits), so the 80 m near square and the 29 cm
   static map are gone, and with them the picture's dependence on what had loaded when the static map was drawn. Small set
   against the same tree before: dE 10.46 → 10.77, a little darker where finer shadows now land (trackside guardrails,
   Silverstone stands).
3. **Venue probe ground bounce:** one probe per venue lights shade from below about 1.3× too much.

Done since v8: **scenery reflection** (package `shading.sceneryReflection`, `integrationMap`): the convolved venue cube read
at lodScale × roughness with the split-sum Fresnel, except on glass and clear coat. The Le Mans overpass no longer mirrors its
surroundings; its remaining dark band is the shadow issue in item 2.

Replaced by game data in v8 (assumptions removed): the Perez sky and its grey overcast blend, the 10° minimum sun, the ×0.25
occlusion scale and then the camera occlusion pass itself, profile placement by sun elevation.

## Step 1 trial: metered auto-exposure (2026-11-05, committed 7f0fbab1)

`src/components/replay/view3d/autoExposure.ts`. The scene renders into a 4× multisampled half-float target. A 16 × 16 pass
averages luminance (arithmetic mean since 2026-11-09, item 11b) over the camera profile's metering window (16 taps per cell), and the GPU reads it back asynchronously
every 4 frames. Exposure adapts in log space (rate 2/s, the first reading taken as is) toward target ÷ metered average, with the
target from the camera profile by sun elevation. The canvas gets one tone-mapped quad, and the canvas itself no longer
multisamples. Exposure is relative (target ÷ metered luminance), so the app's light units do not matter once it meters.

- **Look:** both reference laps are brighter than the old fixed 0.90 exposure, Silverstone the most (paler sky, lighter
  shadows). The frames before the first reading use exposure 1. The racing line is data, not scenery, so it keeps the fixed
  daylight exposure: exposure is set before the scene pass and the line divides it out of its colour as it draws (exposure is
  linear before tone mapping, so its pixels match the fixed-exposure look exactly, edges and blending included).
- **Calibration:** none of the app's own; the law's border, limits and luminance scale come from the package (item 11b-2).
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
- **Ambient occlusion:** removed 2026-11-09. Frame captures at the reference settings have no screen-space occlusion pass (no
  pass reads the scene depth into an occlusion target, in 12 of 14 captures), so the replay draws none; the package's camera
  occlusion values are not used. Material occlusion maps stay.
- **Sky:** the package's analytic sky (`perezSky.ts`, package schema 7), replacing three's sky shader.
- **Sky in the sun's units:** HDR probe at Daytona (into the sun): sky overhead 3.8 / 7.7 / 10.6 against sunlit asphalt
  ~0.2, about 35× (real daylight: about 1×), so the sky showed white and pulled exposure down; the environment's 0.112 scale
  also cut the sunlit ground's bounce light to a tenth, darkening shaded stands and car sides. Now the sky material itself is
  scaled by 0.112 (constant blend colour, for the displayed sky and the reflection capture) and the environment runs at 1:
  sky 0.42 / 0.86 / 1.19, blue, with the ground bounce at its sunlit value.
- **Exposure floor:** the metered log luminance never goes below a sunlit 18 % grey ground (`darkestMeteredLog`). The
  cockpit filled the metering window with its dark interior and raised exposure 2.8 stops (Daytona: 18.6 vs ~1 in the
  chase view), burning out the track outside; with the floor it is 1.65. Sunlit views meter above the floor. Replaced with
  package schema 7: per-type profiles and the exposure law `C · T / L^s` with the onboard type's own window, and pixels nearer
  than 4 m left out of the meter on every perspective view (the near mask went on 2026-11-09, item 11b: the reference meters
  the cockpit too).

Package schema 7 (2026-11-08) carries a profile per camera type (external, onboard, TV), each with its own tone curve, metering
window and adaptation scale, plus the output encode, the analytic sky and the venue's probe position. The app reproduces the
frozen 62-shot reference set from them. Still open: light shafts. Weather blending of the camera profiles and the sky is done
(2026-11-08, below); the sun comes from the package's sampled sun grid, dimmed under cloud (item 9).

## Critique log (user, by eye)

| # | Date | Where | Critique | Status |
|---|---|---|---|---|
| 1 | 2026-11-05 | Fuji main straight | Black under and between far trees too visible | Screenshot (overhead, forest left of the pit straight): `.cache/replay-3d-look/fuji-dark-trees.webp`; split off. 2026-11-08: ambient read with the normal's height halved (render audit item 1), to check by eye |
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
| 13 | 2026-11-05 | Daytona palms, crowd | Too bright, then too dark; not crisp, light not bouncing right. Use known techniques | Done (eb507224): shadow pass faces the view camera (no rest-plane wedges), a card skips its own plane (1 m) in the sun shadow lookup (was self-shadowing black), single hardware-filtered shadow tap (radius 1 blurred), alpha to coverage on cards (anti-aliased alpha test), leaf translucency from the material's parameters and min(2s,1) leaf shadow. World-up leaf normal replaced by spherical crown normals (standard billboard-foliage technique; per-card height span computed at load, foliageCrown.ts). Validated by eye at Daytona. 2026-11-08: crown normals replaced by corner-tilted card normals (render audit item 4) |
| 12 | 2026-11-05 | Daytona | The sun shadow window (160 m square, 30 m behind to 130 m ahead) moves with the car: shadows appear at its edge. Only the car's shadow should move | Done (eb507224, sunShadows.ts): cached static scenery map (1.2 km, ~29 cm texels, no cars, casters ≥ 1 m), double buffered and drawn a quarter per frame, redrawn after 200 m (100 m after a scenery change); near 160 m map unchanged, surfaces fade to the static map over its outer tenth. Spread at runtime chosen (2026-11-07). Production A/B: no cost (Daytona p99 8.9/9.8 vs 10.5/7.6 ms off; one-frame redraw was 12.8). Validated by eye (2026-11-07) |
| 14 | 2026-11-07 | Le Mans (La Sarthe) start/finish, chase view, LMP2 #9, session `2026_11_05_16_23_26-44R1` driver 17 lap 5 | Car sits in the ground (wheels sunk into the road) | Fixed (0944fca9): the horizon chunk's coarse far copy of the road (16 cm under the detailed road on the Mulsanne) answered the wheel and racing-line height lookups first; the ground fit and both height caches kept those heights after the detailed chunk loaded, so the car sat low and the line (missing on the Mulsanne, reported 2026-11-07) was draped under the road. The coarse chunk now serves the camera checks only. Checked headless at the start line and the Mulsanne; validated by eye (2026-11-07) |
| 15 | 2026-11-07 | Daytona, orbit around Genesis #17 (session `2026_11_05_12_14_39-32R1` driver 9 lap 13) | Red paint too mirror-like and low quality on the front and side; car shadow low quality | Paint: the metallic share is not a metal: it replaces the base layer with the lacquered base-coat reflection, faded off the facing angle and tinted by the flake colour, where three's `metalness` had tinted the reflection with the albedo (orange chrome). The remaining rear sheen is the livery's own base coat (index ~2.5, ~18 % reflection; blue flake colour), to compare against the game. Shadow: near window 160 → 80 m (~2 cm texels) halves the edge stair-steps; the light bars in it are the rear wing's real gaps. Awaiting eye check |
| 16 | 2026-11-10 | Silverstone trackside wall, Fuji trackside Ginetta | Advert banner on the tyre wall shows torn colours; the headlight's inner lamps are missing | Fixed (uncommitted): both lie about 1 cm in front of the surface behind them, closer than the 24-bit depth buffer could separate at that distance. The scene now draws into a reversed 32-bit float depth buffer; the shadow passes stay in plain depth. The lamps are still dimmer than the game's (the lit frame is not drawn) |

Open items, in the order to take them (user, 2026-11-07): fidelity first, then performance. Fidelity: #9 playback jitter, #8 car
paint, then the pipeline-audit items below (bloom, car reflections and contact shadow). Performance after: #11 Daytona load, then
the v5 lap visibility and LOD A/B.

## Pipeline audit (2026-11-07): to improve

The frame against standard practice, mesh to screen. Already standard and checked: HDR half-float target with 4x MSAA, sRGB
albedo / linear data textures, linear lighting with sRGB output last, metered auto-exposure, the profile's tone curve and white
balance, near + cached static sun shadows (one hardware-filtered tap, normal offset), camera-facing foliage with crown normals
and alpha to coverage, compressed mip-chained textures with 8x anisotropy, PBR with sky image lighting.

To improve, cheapest first:

1. **Output dithering.** The HDR image is quantized to 8 bits with no dither: smooth gradients (sky, haze) can band. Add
   sub-bit noise before the output in the exposure pass. No cost. Done (uncommitted): triangular interleaved-gradient dither of
   one 8-bit step after the output colour space; validated by eye (2026-11-07).
2. **Alpha to coverage on every cut-out material.** Today only billboard cards and two fence textures matched by name
   (`BARRIERS_FENCE[AB]_ALBA`) get it; other fences, nets, grilles and car alpha-mask parts keep the hard cut and shimmer (Fuji
   catch fence reads dotted). Standard: every alpha-tested material under MSAA, with coverage kept in the far mips. Done
   (uncommitted): every alpha-tested scenery material and car alpha-mask part; validated by eye. Since 2026-11-10 a scenery
   cut-out's own alpha is its coverage in the multisampled scene pass (no sharpening, no lowered cut), so wire thinner than a
   pixel still veils what is behind it; passes without multisampling keep the hard cut. Earlier state: validated by eye
   (2026-11-07).
3. **Bloom / glare.** Sun on chrome, white lines and the sky edge looked flat. A bloom pass from the profile's glare threshold,
   merged into the exposure pass. Done (uncommitted, `glare.ts`): threshold in exposed luminance, half-resolution chain of 5
   levels, composited after the tone curve (tone + (1 − tone)·glare); strength set by eye (gain 0.5); no star streaks.
   Production pass at Silverstone: no cost. Validated by eye (2026-11-07). Removed with package schema 7: the reference shots
   matched without it.
4. **Car reflections and contact shadow.** Car paint reflected only the sky and a flat ground. A reflection probe near the car
   refreshed now and then, plus a contact shadow (ties to #8). Done (uncommitted): `car/carContactShadow.ts`, a soft
   rounded-footprint quad under the car (strength 0.6, 0.5 m spread); `car/carReflection.ts`, a 256 px cube probe at the car
   without the cars, one face a frame, convolved between frames and used by the car's lit materials only. Its reach is its cost:
   1.5 km doubled Silverstone's frames (p50 7 → 14 ms, p99 14 → 21 ms); 300 m matches no probe (p50 7.0, p99 14.0 ms, 28 vs 24
   frames over 16 ms); Daytona unchanged. Validated by eye (2026-11-07).

Known limits, left as they are: MSAA resolves before the tone map (hard edges between very bright and dark; a tone-mapped
resolve needs multisampled textures WebGL lacks); AO multiplies the whole image, not only ambient light; no temporal AA.

## Render audit against the reference frames (2026-11-08)

A second pass, this time comparing each stage of the app's lighting with what the reference frames show (tone, colour, cloud,
reflections, trees). Applied, uncommitted, then re-captured over the 62 reference shots (`docs/local/replay-3d-reference/after*`,
scored by `inputs/score.py` against the frozen game frames):

1. **Ambient light from a halved normal height** (`scenery/materials/ambientLookup.ts`, every lit scenery and car material).
   The sky image was read along the surface normal, so upward faces took the whole sky dome and every vertical face only half of
   it: tree tops and roofs too bright against their sides, and the undersides of foliage black (critique #1). The lookup now reads
   the sky with the normal's height halved, which pulls every surface's ambient toward the horizon band.
2. **Indirect specular at a fixed facing reflectance** (same module). Standard materials reflected the environment by their
   direct Fresnel term (index 1.4, 2.8 % facing), roads 5.8 %. Environment reflections now use 8 % per unit of specular level
   with the direct term unchanged, so far scenery and wet-looking roads pick up more sky without brightening the sun highlight.
3. **Terrain baked shadow** (`shaderParts.ts`, `patchSurfaceShader.ts`). The terrain's splat alpha carries a baked shadow map
   the app ignored; it now also cuts the direct sun (`min(shadow, baked)`), so tree lines and buildings darken the ground beside
   them beyond the 1.2 km cached shadow map.
4. **Foliage card normals** (`foliageCrown.ts`, replaces the spherical crown of critique #13). A card's normal is the view
   direction tilted sideways by its corner (left edge away, right edge toward) and upward above its middle, the upward tilt fading
   as the card faces the sun; never downward. The crown-height attribute and its per-geometry pass at load are gone.
5. **Haze by ray distance** (`atmosphere/haze.ts`): `exp(−density · |view position|)` instead of the view depth, so the fog no
   longer thins toward the frame's edges.
6. **Sky dome from the package** (`atmosphere/skyDome.ts`, `hosekSky.ts`, `timeOfDay.ts`, 2026-11-09). The dome is the
   Hosek-Wilkie sky cooked from the package's datasets, with the package's colour looks, altitude dimming and its own haze
   (sky haze depth and colour). It replaces the earlier assumed sky (Perez with a grey overcast blend by cover², the scene fog
   over a 100 m path): frame captures show the game never blends toward an overcast sky. Removed with it, as assumptions the
   package now supersedes: the 10° minimum sun (a sun below the horizon is now held on it) and the camera occlusion pass.
7. **Camera profiles under cloud** (`autoExposure.ts`). Each camera type's look blends toward its package `overcast` look by the
   cloud cover squared, raised to the profile's `weatherLerpPower`, before the profiles are placed by the direct sun's strength
   (`sunTarget` knots, `timeOfDay.ts`).
8. **Half the low-sun dimming; the warm sun stays** (`sceneEnvironment.ts`, 2026-11-09). The sun's air-mass dimming and
   reddening now use half the former optical depths, lifting the low-sun Le Mans frames (subset: F0 dE 9.1 → 8.6, cockpit F1
   11.8 → 11.4, f 1.24 → 1.12) without touching the high-sun circuits. A white sun reddened from the zenith (the package's sun
   is not a fixed colour) was measured too: on the 10-shot subset it scored best (dE 13.27 → 13.05 against a same-morning
   control, whose run-to-run noise is about 0.15), but over all 62 shots it is a loss (`after2`: dE 10.21 → 10.46, b* −0.9 →
   −2.3): Daytona gains a full dE (12.4 → 11.4, its warm cast gone) while Fuji, Le Mans and Silverstone all turn bluer. The
   subset over-represents Daytona; the warm tint stays. Measured and left alone in the same runs: turbidity fixed at 3.25 (dE
   13.20, within noise) and the haze colour sampled at 2° instead of the package's 10° (13.27 against 13.12: worse), so the
   package values stay.
9. **The sun from the package** (`sceneEnvironment.ts`, `atmosphere/sunSamples.ts`, 2026-11-09). Frame captures of the game
   put its sun at 0.35 / 0.72 / 0.88 / 1.07 of the 56° sun at 9.6° / 28° / 37° / 60°, greener than red above 37° and far redder
   below 10°, where the app's fixed warm colour with air-mass dimming gave 0.65 / 0.87 / 0.90 / 0.94 and a red bias. Package
   schema 8 carries each layout's direct sun as a grid by sun elevation (3–90°) and base cloud coverage (0–1); the app
   interpolates it (log-linear in relative air mass between elevations, linear in coverage) and converts with one unit factor
   (`SUN_UNIT`, 4.0 at the ~100 midday sun). The fixed sun colour, optical depths and transmittance are gone; the sun is now
   dimmed under cloud, with the replay's cover standing in for the base coverage. Known gap stated by the pipeline: clouded
   captures run 2–20 % brighter than the grid. Re-scored with item 10 (`after4.json`, 62 shots): dE 10.17 → 9.64, the red
   bias gone (a* +1.69 → +0.36), b* −1.14 → −1.38, band 54 → 52. Every circuit improves (Daytona 12.25 → 11.07, its warm cast
   b* 4.7 → 3.7). The low-sun Le Mans shots (9.6°) are darker (F0–F3 f 1.14 → 1.40–1.52): the sampled sun is 0.35 of midday
   there against the former 0.65, which is right, so the darkness now points at the exposure (the app exposes 2–4× less than
   the game at low sun; next item).
10. **The full dry haze density** (`atmosphere/perezSky.ts`, 2026-11-09). The density was the clear-day value alone; frame
   captures showed Daytona's haze thicker than the app's. The package's dry formula now applies: the base term mixes from the
   dawn density to the day density along the fog colour's sun ramp (0.21 of the way at Daytona's 28°), the cloud cover adds
   its term and the damped pollution its own; the storm term stays off (every replay is dry). The pipeline checked the
   formula against seven captures within 0.1 %.
11. **Exposure from the captures, measured and parked** (`autoExposure.ts`, 2026-11-09). The frame captures fix the game's
   displayed multiplier exactly: the tone pass multiplies by the frame's exposure over the package's `sceneLuminanceScale`, which
   in the scene's sun units is 1.44–1.77× the app's exposure for the same four views (9.6°–60°), so the law's constant C would be
   4.06 instead of 2.59. Applied over the 62 shots (`after5.json`) it did what the per-shot arithmetic predicted (Le Mans cockpit
   f 2.34 → 1.47, Silverstone cockpit 1.50 → 0.99) and made the set too bright wherever the sky shows (55 of 62 below the band,
   dE 9.64 → 15.1): with the exposure right, the residual is the scene, 1.2–1.9× the game's in sky-dominated views (the sky is
   2–2.6× too bright, item 2 of the capture findings) and 0.69× in the Le Mans cockpit. C stays 2.59 until the sky luminance is
   on the game's curve (Hosek–Wilkie, decoded by the pipeline session, not yet published); then 4.06 takes over and the cockpit
   darkness is what remains.
11b. **Exposure law from the HDR frame dumps** (`autoExposure.ts`, 2026-11-09 evening, uncommitted). The tone pass input of 22
   captured frames gives the reference's metering directly: the displayed multiplier follows `G · T / (L / 2.2)^s` with L the
   arithmetic mean luminance of the type's metering window, every pixel counted (the cockpit interior too), T and s the package's
   target and adaptation scale. G fits at 1.24 over 20 frames, the three camera types and a 150-fold range of L (11 % scatter);
   the log average the app used scatters 23 %, and a near mask makes the onboard frames worse. The app now meters the mean
   without the 4 m mask and exposes by `1.24 · U · T / (U · L)^s`, U = 1 / (SUN_UNIT · 2.2), replacing C = 4.06. A fitted
   constant, named as one (replaced in item 11b-2). The reference also caps exposure at a per-profile maximum (never reached
   in the captures); carried since item 11b-2. Over the 62 shots (`after9.json` against
   `after8.json`): in band 33 → 49, f median 0.868 → 0.893, mean dE 11.04 → 10.42; cockpit f 1.50 → 0.97 (dE 9.3 → 7.9), TV
   0.82 → 0.89, chase 1.13 → 0.87, reverse 1.23 → 0.78. What remains bright is the scene, not the exposure: a pixel trace of one
   Daytona frame puts the app's sunlit road at 1.2× the reference's (the wall beside it equal), which is the chase and reverse
   residual. Daytona stays at f 0.75 (5 of 12 in band): its screenshots show soft or no car shadows, the sun dimmed by cloud at
   those moments, which the replay data does not carry; the captured Daytona frame with the sun out matches.
11b-2. **Exposure law without a fitted constant** (`autoExposure.ts`, 2026-11-09 late, uncommitted; needs a package with the
   new fields). The package now gives each time-of-day look its light/dark border B and its exposure limits
   (`lightDarkBorder`, `minExposure`, `maxExposure`, clear and overcast), and the app exposes by
   `U · clamp(T · B^(1 − s) / (U · L)^s, min, max)`, U from the package's `sceneLuminanceScale`. The fitted G = 1.24 is gone:
   it was mostly B^(1 − s), about 1.15 by day. The 20 reference frames sit 9 % over this law (9.5 % scatter), so the app
   now exposes about 8 % lower than under item 11b. Not carried: the reference's dark-scene adaptation set, its glare
   influence on the target and its adaptation speed limit. Not yet scored on the 62 shots.
11c. **Road rubber groove at an assumed level** (`scenery/materials/roadSurface.ts`, 2026-11-09 night, uncommitted; needs a
   package that carries the groove). The sunlit road at 1.2× was the rubber laid on the racing line, which the app did not
   draw. The package now gives each rubbered road its groove map (`flags.grooveMap`, `maps.groove`) and the groove's albedo,
   roughness and specular level (`parameters.groove`); the road mixes toward them after its tint by
   `max(2 · max(m − 0.5, 0) · mask.g, mask.r · min(1.5 · m, 1))`, `m = mix(details.g, 1, R)`, and ambient occlusion goes to 1
   where the groove lies. R, the rubber laid, is session state the replay does not carry: `ASSUMED_RUBBER` = 0.2 for every
   session (0.18 and 0.24 read in one captured practice frame), an assumption named as one, chosen by the user over leaving
   the road bare. Not carried: the groove's shift of the index of refraction. Over the 62 shots on a debug package
   (`after10.json` against `after9.json`): in band 49 → 53, f median 0.893 → 0.948, mean dE 10.42 → 9.68, b* 1.13 → 0.66;
   chase f 0.87 → 0.94 (dE 11.0 → 9.6), reverse 0.78 → 0.85, TV 0.89 → 0.94, cockpit 0.97 → 1.04; Daytona 0.75 → 0.80. The
   lamps, the baked terrain shadow and the v8 sky landed between the two runs, so not all of the difference is the groove.
   Out of band still: F1, F2 (bright), F4, F5, F9, N12, N13, N17, N23 (dark).
12. **Car reflection probe from the frame captures** (`car/carReflection.ts`, `car/carPaint.ts`, 2026-11-09). The captures
   show the reference reflection as a live cube rendered from the car's roof (0.72 m over the bounding-box centre), 0.1–150 m,
   the car itself never drawn into it, read sharp by any clear coat of roughness 0.1 or less and from a convolved chain above
   that. The app's probe now sits at that eye (it was 0.5 m over the origin), sees 0.1–150 m (was 0.5–300, half the scenery
   per face), and the coat lookup reads the sharpest prefiltered level at or below the package's cutoff
   (`shading.carPaintReflection.roughnessCutoff`). The sun glint on smooth paint now comes from the package's `shading`
   section (`sunGlint`, `smallEdge`): a coat under the glint's roughness cutoff adds a disc of the cosine threshold to its
   direct sun specular, the whole term scaled, limited by the small-edge detector (limit squared, in the package's light units,
   so × SUN_UNIT), for the clear coat and for the base coat under it (roughness base + coat × coat strength), inside three's
   directional-light loop where the shadowed sun is at hand. The probe now matches the reference's 1024 px faces, three a
   frame (a probe every two frames; chosen by the user before its cost was measured, to optimise after). Not carried: the
   rough-coat convolution chain (`shading.convolution` stays unread; next, read from the package-convolved cube). Cost measured
   (production build, headless, 40 s played, one run each; 256 px one face → 1024 px three faces): Silverstone p50 6.2 → 9.7 ms,
   p99 25 → 40, frames over 16 ms 113 → 367 of ~5600/3500; Daytona p50 6.3 → 9.3, p99 33 → 31, over 16 ms 242 → 172. Offscreen
   draws a frame double (311 → 649 median): the three faces' draw calls on the CPU-bound frame, not the pixels. Kept at the
   user's word (optimise after). after6 shows the paint shader compiled with the glint in; its views have no sun-facing paint,
   so the glint is not yet seen. The game's paint shows a bright sky reflection along the body edges (Genesis roof view) that
   the app's did not. Done next (2026-11-09 pm): the car paint reads the car's own reflection cubes as the package rules
   (`shading.carPaintReflection`): the probe keeps its mips (regenerated after the last face only), `reflectionCube.ts`
   convolves it with the package kernels after the sixth face, each coat samples the sharp cube at or under the roughness
   cutoff and the convolved cube above it at (r − cutoff)/(1 − cutoff) × lodScale, as the level itself (base coat, `explicit`)
   or added to the hardware level (clear coat, `bias`), clamped to the last kernel level; three's sky environment stands in
   before the first probe; the car's other lit materials keep three's prefiltered probe. Renders without errors on the Genesis
   lap; the look is to be judged on the next 62-view run and by eye. Cost not yet measured; the convolution reuses its cube
   across probes.

Full 62-shot re-score (`after3.json` with item 8, `after.json` without; same metrics as `reference.json`, frozen renders re-scored
beside): f median 1.01 → 1.07, within ±20 % 54 → 54, mean dE 10.1 → 10.2, b* −0.1 → −1.1 (a touch bluer); reverse views 0.82 →
1.06 (dE 13.7 → 11.2) and Daytona 0.85 → 0.92 (8 → 10 in band) improve, Le Mans sits a little darker (f 1.08, 14 of 15 in
band) and Silverstone at 1.14. The frame means are level with the frozen reference; judged by eye in the triptychs on 2026-11-09,
the new renders read as better than the frozen ones (trees, skyline, hazed distance, low sun). Cockpits remain the darkest group (f 1.23): the near mask and the onboard
law are the remaining levers, both measured as regressions before.

Measured on the subset, the ambient lookup (1), the indirect reflectance (2) and the baked terrain shadow (3) move the frame
means by under 0.01 in f and 0.1 in dE: they change where light falls (tree crowns, shaded ground) rather than how much, so they
are judged by eye in the pairs, not by the scores.

Left as they are, with the reason: the exposure clamps per camera type (the reference exposures sit inside them, so they cannot
explain the Daytona chase brightness); the billboard shadow pass facing the sun (critique #13 chose the view camera on purpose);
the
turbidity and haze-colour calibration (measured in item 8: neither alternative scores better than the package values).

## Still open

- **Sky model.** Done with package schema 7: the package's turbidity and Perez scales, the multipliers at the sun's height (linear between
  rows), the table as the package ships it.
- **Reflections beyond the car probe.** Screen-space or per-area reflections for glass and wet track.
- **Car lamps.** The most visible car difference in the chase views (2026-11-09, six reference pairs): the reference cars'
  tail lights, rear LED strips and identification lights glow; the app draws them as dim lit surfaces. The package's self-lit
  effect materials (about 225 across the car bodies) are drawn as ordinary lit materials at the first frame of their texture
  strip (the unlit state where the strip has two or three frames). Needed from the package before the app can draw them: each
  lamp's role (always on, brake, rain, pit limiter, brake disc), the texture frame per state and the luminance of each self-lit
  kind. The app side is then small: an unlit material at that luminance, shown by role from the lap's brake channel.
  Measured in the same pairs: the car's darkest parts are as dark as the reference's (2nd percentile luminance 0.0003 to
  0.0014 against 0.0007 to 0.0015), so the car's shading contrast is not a gap. Since 2026-11-09 the car parts drawn by the surface program (lamp housings and covers, wheels, trim) reflect the car's own convolved probe by the scenery reflection rule, not the venue's cube (`car/carReflection.ts` `bindCarSurfaceReflection`): the lamp covers lost their pale sky wash and read dark red, unlit (checked on N1, N12, N18).

Each step is judged by eye against the game and re-runs `npm run benchmark:replay3d:suite` (p99 must stay < 16 ms).
