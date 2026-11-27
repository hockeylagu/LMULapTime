# Night release (plan, 2026-11-25)

Brings the night look of the 3D replay from research into the package and the app in one pass, then reviews performance.
Source for every rule below: the night research doc (pipeline worktree `LMUTrackPipeline-nightwet`, branch
`research/night-wet`, `docs/research/NIGHT_AND_WET_RENDERING.md`), its exe trace (`review/night-wet/exe-trace.md`) and
its viewer (`pipeline/viewer/appView/client/`). The viewer modules are research hooks on the app's shaders: port the
rules, not the hooks. Wet is out of scope: the research branch stays for the wet work (user, 2026-11-25); the package
code lands on pipeline main through the exporter, the app code is written in the app.

## Where it stands

Validated in the research viewer against game captures (Algarve chase and TV, Silverstone 18207/18531, Sebring):
ambient 1.00, scenery 0.89–1.12, horizon sky 0.89–1.01, exposure limits exact, lamps and glow cards 1.03–1.06,
bloom within 7 %, cars 0.99–1.14, cockpit 0.86–0.97.

Track lights and car spots come straight from game files (SCN and GEN `Light=` blocks). Fitted or traced, not decoded:
the moon's light and scattered share (0.0175), the dome zenith's 0.515 share of the moon's scatter, fog 0.727 ×
twilight, the twilight table and middleware constants (exe trace Q6). These enter the package as traced constants with
their evidence in the source registry, never as app constants.

Not validated: moonless deep night (no capture; the model extrapolates); which spots the game lists per object (the 20
nearest the camera land within 6 % on the scenery).

Prerequisite, done: the replay clock reads the weather packet's time of day (8634db327), so practices draw at their
real hour.

## Steps

Each step lands as its own commits, tests and a capture check. The app never requires a field before an export carries it.

### 1. Package (exporter session; the night session reviews), in this order
1. Layout night facts: the place, date and `DSTRange` from the GDB of the replay's own scene (Algarve's night replays
   run on the WEC scene, 2023-04-04, not the ELMS GDB the package took: the moon would be wrong); UTC offset from
   `DSTRange` where the date can change; `NightLightThreshold` and `NightLightPollution`; the traced twilight table and
   constants with their source.
2. Track light table from the SCN: position, range (far value), `Color/255 × Intensity`. Tolerant parser: malformed
   records (Fuji `NightLight_29` trailing comma, `NightLight_80` range run into position) are skipped with a warning
   and registered as gaps.
3. Capped light lists: an object needs a list only when more than 20 lights reach its GMT bounding sphere (keep the 20
   nearest its centre); every other object takes every light in reach. The package merges instances, so the list index
   is per vertex (or capped instances are kept out of merged batches). Built after chunking. Measure its size and build
   time against the 25-minute budget (Fuji chicane: 81 lights, 74 capped instances, 581 k vertex positions).
4. Glow cards (`NightLight##Glow`, reverses the past drop) and instance visibility: `VisGroups` 1024 night-only,
   512 day-only (hidden at night).
5. Material night parameters: `NIGHTONLY`, dashboard night intensity, retroreflector colour, scalar, emissive map mode
   and mask, also where the material does not glow (35 materials at 13 of 18 venues: Le Mans and Spa cat's eyes ×500,
   corner-worker posts, ARMCO rails, Qatar brake markers). Check what the game binds for `＠Null` emissive maps.
6. Per body: the GEN spots (two headlights and a red tail spot; the tail spot is almost never listed in game), with the
   pose conversion (lamps 0.32 m below the replay pose, GEN z = −forward); the cockpit light; the cockpit material set
   once its source is found (the game compiles them with `COCKPIT_MODE`: find it in the car material definitions; the
   viewer's name match is a guess from one car).
7. Reflection set instances drawn textured, as the
   game's cube draws them (user, 2026-11-25; the per-material mean colours were 1.5–7× too bright near the ground;
   textured brings the TV cars from 1.15 to 1.01).

Then export `personal-v30` (schema bump) and sync `shared/packageContract`.

### 2. Sky, sun, moon and ambient (viewer: `nightModel.ts`, `nightSky.ts`, `reference.ts`, `main.ts` modelNight)
- The sun is no longer clamped at 0° (`MIN_SUN_ELEVATION_DEG`, `hosekSky.ts`, `sunSamples.ts` 0° row). Its direct light
  is `clamp(e + 1, 0, 1)²`; the moon takes the one directional light below −1° of sun (no second light: every program
  would recompile). Shadows stay on.
- Sky dome: the Hosek blend fades from +2.9° to −0.83° of sun, then the Perez branch: zenith at chromaticity
  (0.25, 0.25) with the twilight luminance plus 0.515 of the moon's scattered light; colour look at `(e + 5) / 5`; haze
  toward the camera heading. Fixes the yellow dusk sky (Silverstone 18207).
- Ambient from the twilight table plus the moon's scattered light (which shifts it toward green); `dayShare` from the
  ambient, not the sun's green; fog neutral grey (1, 1, 1.05) at 0.727 × the mapped twilight; haze sunward glow off at
  night; clouds lit by the moon or the ambient; `setDaylight` re-lights on ambient steps at dusk, not only sun steps.
- Exposure: no change expected; check the first profile knot.
- Venue capture at night: the lit venue, scaled by the ambient.

### 3. Night switches and night emission (viewer: `reference.ts` frameDayLight, `nightGlow.ts`)
- Materials: the game's switch, `ambient r < 2.35` (hard step) for night emission and `NIGHTONLY`, its smooth blend for
  screens and dashboards; day-only instances hide.
- Track lights and glow cards: the light-level table (48 half-hours × cloud) against `NightLightThreshold` (only Qatar
  sets it; the default is not traced; Bahrain's lights are on with the sun 2.9° up). Car lamps follow the replay bits.
- Glow cards draw opaque, depth-writing, unblended, front faces culled, wrap sampler.
- Retroreflection term (`retroReflector.ts`) on the materials step 1.5 carries.

### 4. Track lights per vertex (viewer: `gameLights.ts`; rule: `pipeline/research/omniLightLists.ts`)
- Scenery: lights in reach, or the object's capped list read per vertex; diffuse only; a light below the vertex has its
  vertical part stretched ×20. The lamp light joins under the AO (`constantLight · AO / π · albedo`).
- Cars: every light in reach (cars are never capped), from a uniform array (the viewer holds 128, nearest beyond that).
- One program variant (the loop runs with count 0 by day) unless warm-up cost says otherwise.

### 5. Car spots per pixel (viewer: `gameLights.ts`, `reference.ts` spotsOf, `frameCars.ts`)
- A scene-wide list of the 20 spots nearest the camera, filled per frame from the replay poses and the bodies' GEN
  spots, for cars whose lamp bit is on (lap view, race field, far cars, stand-ins). Stand-in for the game's per-object
  rule.
- Paint: the AO occludes the cube term only, not the lamp light
  (`lamp · albedo/π · (1 + loss · inside · albedo)`, after the base-coat loss); tyres occlude both; the two plain
  textured car programs take omni and moon light but no spots; scenery under the AO.

### 6. Cars and cockpit (viewer: `frameCars.ts`, `gameLights.ts` setCockpitLight)
- Lamp emitters draw before the car glass (render order), so the glass dims them.
- Race numbers glow at night (`numberPlate` emissive, game light units).
- Box-projected paint reflection per car (the game does it by day too), 16× anisotropic clamped cube sampler. Each car's
  box (world axis-aligned, recomputed per pose, centre = `cubeBBPos`) is wider than any body (~4 × 2.3 × 6.3 m; McLarens
  11 m tall), so its source is not the body mesh: trace it (first guess: the union of every GMT's header bounds in the
  GEN) and carry it per body in the package. The lamp order is done; the driver near planes already come from the
  game cameras.
- Cockpit materials take no lamps or spots, only the car's cockpit light at night; driver camera near plane 0.075 m. The cockpit
  light is each material's own `parameters.cockpitLight` (intensity 0 = none), not the body's GEN `lights.cockpit`: the files
  often differ and whether the game copies the GEN's over the material's is not traced (user, 2026-11-25).

### 7. Bloom (viewer: `nightBloom.ts`, the chain from capture 135627, after the tone curve)
Built (2026-11-26, `view3d/bloom.ts`, uncommitted) on `personal-v30` with the package's bloom (pipeline 474c5d9): the halo around the
Mustang's tail lamps at capture 21459 lands within 2–7 % of the game's ring by ring; one day chase view changes 1,190 pixels by
at most 16 levels. Left: the 8-view day check, then the full set with the other night changes.
In scope (user, 2026-11-25). It also changes the day picture: the day set's crops go to the user. Its values are game
config (`pplib_base_0.json` TimeOfDayProfile 0–6: glare threshold 1.5, bloom luminance 1.5 night / 1.0 day, remap
factor), so they come through the package's rendering profile, blended like the exposure profiles. Not traced: the
1.68 gain factor, the knee formula and the blur sizes. Bloom is always on: in all 7 Algarve night captures of one session
(2026-10-29, chase, cockpit and TV) the full-frame composite (3440 × 1440) has strength `afRGBA_Modulate[0].y` = 1; the
draws with 0 are a 3440 × 215 strip and 128 × 54 images, not the scene (the 0 read for 133205 and 18207 is likely one of
those). The bright pass knee moves with the time of day (14.95 at 16227 and 17986, 14.0 at the later five).

## Checks
- Night frames: the research frames above, each within the viewer's figures (`referenceBundles.ts`, `referenceCompare.ts`).
- Day must not move except where steps 6 and 7 intend: full 61-view capture against `freeze-v26` after each step that
  touches day programs; crops to the user for any visible change.
- Lint, tests, build, zero warnings; file and folder limits (`race/` is at 20 files).

## Then: performance review
Against the targets of the 3D replay performance review: frame time on the bench set by day and at night (race start
with the full field at Le Mans 21:00, Sebring dusk), warm-up time (new uniform arrays and program variants), GPU memory,
package size and build time. Bench only when no build or export is running.

## Open, not blocking
Moonless deep night capture (optional), the per-object spot list rule, the 0.515 dome zenith fit, the
`NightLightThreshold` default, how the game reads Fuji `NightLight_80`, driver models, disc glow (parked).
