# Optional local data packages

## Peripheral plugins (separate from data packages)

The analyzer also supports an optional executable peripheral integration. This is a separate contract
from the immutable JSON data packages below: `LMU_PLUGIN_ROOT` still loads data only.

`lmu-peripheral-simagic` is built from the sibling `../SimagicWheelDeamon` repository, now a
TypeScript plugin package with no standalone daemon, Python runtime, tray or startup service.
Run `npm install` and `npm run build` in that repository, then `npm install` in the analyzer.
The optional `file:` dependency is loaded dynamically against peripheral contract version 1.
An absent or incompatible package leaves analytics available and reports its status in Settings.
The package is local development integration; release distribution must include/build that package
or omit it deliberately. The frontend build does not bundle backend plugin code.

Start SimPro Manager yourself. Open **Settings → Peripherals**, enable the plugin, discover and
select your wheel, and refresh the preset catalog. Only presets tagged for Le Mans Ultimate in
SimPro are offered, suggested or selected; tag a profile for LMU in SimPro to make it available. Use **Suggest mappings** to
preview deterministic name/class matches, then save the proposed rows or choose presets manually.
Existing assignments are preserved unless you explicitly request replacing them in the preview.
Assignments use UUIDs, so preset renaming does not break them. Failed refreshes preserve cached
lists and mappings; confirmed missing presets remain visibly unavailable. Complete SimPro device
wheel profiles are selected (LEDs/buttons/paddles). The wheelbase is never switched: it keeps one
profile for every car.

Settings shows **Loaded presets** for connected wheelbases and wheels even without a live session.
`GET /api/peripherals/:id/loaded-presets` reads SimPro directly with a five-second deadline; it does
not select presets or update the assignment catalog. Exactly one selected profile is required per
device; missing, ambiguous or failed reads are shown explicitly. Profiles without LMU tags can be
displayed here. The visible panel refreshes every 15 seconds and offers a manual refresh, with the
observation time beside it. Session switching details appear in a collapsed disclosure only when
there is a session or a previous decision. Unassigned catalog presets are highlighted above the
collapsed car assignments, with **Review assignments** opening and focusing that section.

Session switching details show the detected car, resolved wheel target and whether the assignment
comes from the car or its class default. The last decision includes the requested, previously active
and confirmation-readback UUIDs when those reads occurred. Skipped loads keep their reason visible,
including missing configuration or leaving the garage before the car could be identified. Opening
Settings refreshes health immediately for an enabled plugin; concurrent health checks share one
request. This refresh does not apply presets. `LM P2` and `WEC P2` are explicit Oreca suggestion
aliases; when both are equally eligible, Suggest leaves the assignment ambiguous for manual choice.

Automatic switching runs once in the first garage of a loaded event, after a three-second settling
period and car resolution. Practice, qualifying, race and returns to the garage share that one load.
The host reads each active preset first and sends no selection if it already matches. Unknown
readback, failed selection and disconnects never cause selection retries. Leaving the garage aborts
pending work; driving, historical sessions, replays and demo mode never trigger automation.
An explicit **Apply** in Settings is allowed in the garage even after the load was handled, but refused on track.
Offline/menu Apply is available for deliberate configuration testing. The app does not reset profiles,
enforce mappings during a drive, launch SimPro or change presets on reconnect.

The connected live dashboard displays read-only SimPro health. It has no peripheral actions, and
offline dashboard demos do not query plugin status. Backend health monitoring runs without browser
clients while the plugin is enabled. Disabled plugins make no vendor requests.

Disable the former daemon's Startup shortcut and stop its running copy before enabling this plugin.
The migration preserves its private `local/` data but does not import legacy configuration.
The host contract is defined in `server/peripherals/peripheralContract.ts`; the vendor contract is
maintained by the sibling plugin repository. See [remaining acceptance](plans/README.md#peripheral-acceptance).

## Track and vehicle data packages

Basic track layouts are always bundled with the app as SVG illustrations. They provide
orientation and thumbnails; they are never used as calibrated geometry for analysis.
Detailed tracks and vehicle records come from an optional local JSON package.
Session-log, replay and DuckDB ingestion work without a package.

## Setup

Set the backend-only setting in your ignored `.env.local`:

```dotenv
LMU_PLUGIN_ROOT=C:/LocalData/package-v1
```

Run `npm start`. The backend reads and validates one immutable snapshot at startup.
To change packages, select a new folder, restart the backend and reload the app. A
missing or invalid package disables detailed features; it does not reuse a previous
package's measurements. Local paths never enter frontend configuration or status responses.
The backend listens on loopback. Plugin endpoints use the same server access behavior as the rest of the API.

## Contract

```json
{ "schemaVersion": 11, "id": "personal-data", "version": "1" }
```

The manifest is exactly these three keys; the catalogs sit at fixed paths (`tracks/index.json`, `vehicles/index.json`,
`vehicles/logos.json`, `scenery/index.json`, `rendering/index.json`) and all five are required. Schema 11 is the only supported
format: any other `schemaVersion` (including 8 and 10) invalidates the package, with no fallback. The file shapes, path rules and
parsers are the pipeline's contract module (its `shared/contract/`), copied here verbatim as `shared/packageContract/` by the
pipeline's `npm run package -- sync-contract` (never edited here; `sync-contract --check` there verifies the copy). The app's
loader adds only what needs this machine: contained, size-checked file reads and the hash checks below. The whole package is
validated before activation.

Track catalogs use the existing canonical layout identities. Geometry files sit beside
the catalog as `<layoutKey>.json` (keys in the contract's order, map `surfaces` and `brakeMarkers` included). Geometry and projection
revisions must match their contents (`TRACK_GEOMETRY_KEYS` of the contract names the keys the geometry revision covers). The same
provider supplies backend projection, profiles and frontend geometry. Null samples
remain unavailable, including measured widths, kerb profiles and banking.

Vehicle catalogs are `{ vehicles, bodies }`: the records, and the car bodies (below) that serve their VEH ids.
Each record has `id`, `model`, `carClass`, `vehicleIds`. `carClass` must be one of the app's
canonical classes (`Hyper`, `GT3`, `GTE`, `LMP2`, `LMP2_ELMS`, `LMP3`, `SafetyCar`), not LMU's VEH
labels such as `LMGT3`: the app reads it as published and uses it as the replay driver's class.
`model` only helps resolve a vehicle; the car name shown and filtered on stays the one the
sessions record. Optional
`dimensions` hold `lengthM`, `widthM`, `heightM`. Optional `handling` holds
`wheelbaseM` and the complete steering trio `steeringRatio`, `defaultSteeringWheelRangeDeg`
(total lock-to-lock wheel rotation) and `defaultSteeringLockDeg` (one-sided road-wheel lock).
Wheelbase is the mean of the physics left/right axle distances, independent of collision-body length.
Steering values describe the base car's default steering setting, including its steering fraction;
they do not identify the setup or circuit-specific upgrade selected for a recorded lap.
The ratio must agree with `defaultSteeringWheelRangeDeg / (2 * defaultSteeringLockDeg)`.
Partial steering trios, nonfinite/out-of-range values and unknown handling fields invalidate the package.
Optional `deploymentKw` lists a hybrid's deployment settings in kW, ascending, exactly as the game's
MFD labels them (2–40 values, 0–500 kW); anything else invalidates the package. Hybrids without it
get deployment advice as the game's map position instead of kW. The track pipeline fills it from each car's
electric motor file (`ElectricMotorMapSpecial` labels, from personal-v18: 0–200 kW in 20 kW steps for the LMH hybrids,
0–50 kW in 10 kW steps for the LMDh cars). Live advice looks it up by model and class; variants of one model
(the Peugeot 9x8's two generations) share the list only when they agree.
Missing wheelbase or steering data independently
uses the historical approximate fallback (2.7 m, 11:1, 540° lock-to-lock); no other model is substituted.
The client exposes the applied `handlingCalibration` and its plugin/default/fallback sources.
Both DuckDB and VCR handling calculations use this calibration while the steering chart retains
its normalized ±270° display scale. Optional convex
`outlineXZ` coordinates are metres with forward -Z. A validated
`replayOriginOffsetXZ` establishes calibrated placement on replay poses. Without it,
the map still displays the model envelope at its preserved local origin, explicitly labeled
as approximate placement. It does not recenter the outline or invent a provider offset.
Exact aliases win; ambiguous model matches remain unresolved. Primary and comparison
vehicles resolve independently. Body direction continues to use replay yaw.

## 3D scenery and vehicle bodies (package schema 11)

This app loads schema 11 only (see Contract above). The pipeline repository's `docs/PACKAGE_FORMAT.md`, `docs/SCENE_PACKAGE.md` and
`docs/VEHICLE_PIPELINE.md` own the file formats; this section records what the app reads and checks. In the package, the API and
the code, a *vehicle* is a catalog record (model, class, VEH ids, handling) and a *body* is a 3D model of the top-level `bodies`
list of the vehicle catalog; every record id has exactly one body.

### Scenery (`scenery/index.json`) and rendering (`rendering/index.json`)

The scenery catalog is `{ chunking, streaming, textures, layouts }`. `chunking` and `streaming` (`residentBehindM`, `residentAheadM`,
`freeCameraRadiusM`) are shared by every layout; `textures` is the table of distinct texture files (`sha256`, `byteLength`, `width`,
`height`, `levels`, `format`, `srgb`, `gpuBytes`, optional `start`). A layout row holds `layoutKey`, `sourceGeometryRevision`,
`routeLengthM`, `pitLaneLengthM`, `shadowRangeM`, `environmentProbe` (`position`: where the venue's light is captured, LMU local
metres), `daylight` (required: `date`, `sessions` race, qualify, practice1 and practice2 in that order with `localTime` `HH:MM`,
`sunElevationDeg` and optional `sunBearingDeg`, `airPollution`, the haze weights and height scalars, location), one `horizon` chunk,
`sectors` (main chunks ordered by lap range, then pit chunks), `textures`, references (`texture` index, optional `maxPx`) into the
table, and `materials`: per material key, its `vertices`, `indices`, `primitives` and `draws` summed over the layout's chunks. A chunk
GLB material carries its key as `extras.lmuMaterial` (a hash of its content: one key is one material in every chunk of the venue,
and all its primitives share one vertex layout). The app draws each opaque material once across chunks from those totals
(`src/components/replay/view3d/scenery/sceneryBatches.ts`); which materials draw together is the app's choice. A chunk has no path, neighbours or totals: its file is `scenery/<sha256>.glb`, a texture is `scenery/textures/<sha256>.ktx2.zst`
(a KTX2 without supercompression, compressed as one zstd file), and a chunk's `textures` are indices into its layout's reference list.
The loader (`server/plugins/scenePackage.ts`) expands each row (`expandSceneryCatalog` of the contract) into the layout the client
gets: `asset` paths rebuilt, chunk texture lists as paths, the shared parameters and the rendering profiles attached. The layout must
exist in the track catalog (every track has scenery) and its `sourceGeometryRevision` must equal that geometry's revision; main sector
lap ranges are ordered and inside the route (a venue-shared `v...` chunk may overlap them and wrap past the line); every file exists
with its catalogued size.

`rendering/index.json` holds `camera`, `sky` and `shading`, shared by every layout and attached to each layout the client gets (the
parsers are the contract's; `server/plugins/renderingPackage.ts` loads the cloud map files). In the sky, `sun.layouts` and
`hosek.layoutAltitudeM` are keyed by layout key, exactly one per catalog layout; the loader narrows them to the layout's own `sky.sun.grid`
and `sky.hosek.altitudeM`.

What `rendering/index.json` holds:
`camera` holds a positive `outputGamma` (the display encode), a positive `sceneLuminanceScale` and `types` with exactly `external`, `onboard` and `tv`; each type has a
`meteringWindow` inside the frame (fractions from the top left), a positive `adaptationScale` (s of the exposure law
`T · B^(1 - s) / L^s` kept inside the look's limits, L the metered mean luminance over `sceneLuminanceScale`), a positive `weatherBlendRate` (per second, the rate of the clear to overcast profile blend), `ambientOcclusion` and
`profiles` ascending by `sunElevationDeg`, each with a positive `targetExposure` (T), a positive `lightDarkBorder` (B), `minExposure` and `maxExposure`
(0 ≤ min ≤ max, max > 0), `whiteBalanceK` and a `toneCurve` {`a` > 0, `b`} (the clear values), a positive `weatherLerpPower` and
an `overcast` look with the same six values, validated the same way (the package's overcast profile; the viewer does not blend to it yet). The viewer interpolates a profile by sun elevation and holds it past the ends;
the cockpit view uses `onboard`, trackside `tv`, every other view `external`. `sky` holds five `perezScale` values,
`perezMultipliers` rows ascending by `sunElevationDeg` (four values each), `pollution`, `turbidity` and `fog.density` (each range
with `min` ≤ `max`), `airMass`, the haze's `fog.colour`, `fog.sunInfluence` and `fog.height`, and `sun` {`unit`, ascending
`sunElevationDeg`, ascending `cloudCoverage` in 0..1, `layouts`}: a grid of positive RGB triples per catalog layout (coverage rows by
elevation columns), exactly one per layout, which the loader attaches to its layout as `sky.sun.grid`; the pipeline's
docs/SCENE_PACKAGE.md "Sky and atmosphere" has the formulas. `atmosphere/perezSky.ts` reads the sky and `atmosphere/sunSamples.ts` the sun. The viewer takes the cloud
cover from the replay at the lap and treats every replay as dry, and reads the sun's colour and strength from `sky.sun` at the sun's
elevation and that cover (the base coverage the grid is sampled by); it applies the dry haze density (dawn mix, cloud and pollution
terms, no storm term) and does not apply `airMass` or `sceneLuminanceScale` yet.

`sky.clouds` (the pipeline's docs/SCENE_PACKAGE.md "Clouds") is the cloud field. Its maps are not inline: each map entry (`maps`, `lightMaps`) is
`{ width, height, channels?, sha256, byteLength, mipByteLengths }` naming the file `rendering/<sha256>.bin`, the 8-bit mip levels concatenated,
largest first, row-major, channels interleaved. The server hash-checks every such file at startup; `GET /api/data-plugin/scenery/:layoutKey`
returns the entries as is, `/api/data-plugin/rendering/files/<sha256>.bin` serves the bytes (`application/octet-stream`), and the client
(`fetchSceneryLayout` in `src/api/sceneryApi.ts`, `shared/domain/scenery/cloudMaps.ts`) fetches each distinct file once and slices it by
`mipByteLengths` into the mip arrays the viewer reads. The field: two `layers` (`lower`, `upper`) whose `instances`
add up to the `cells` table (`lowerCells` first), sixteen `codes` each naming one of `types` (a shown type has meshes and materials
that exist in `meshes` and `maps`, a clear one has none), `height`, `placement`, `coverage`, `alpha`, `averagedInputs` (the values a
replay does not carry, as averages) and opacity `maps` whose first level has width × height bytes. A mesh carries its unit vertex
frame (`normals`, `tangents`, `binormals`, one vector per vertex). A material carries how it is lit: a `light` block (`uv`,
`albedo`, `ambient`, `backlight`, `diffuse`) and the keys of its three `lightMaps` (`cloudMap` with 1 channel, `sideMap` and
`endMap` with 3; every level has width × height × channels bytes). `shading.sunVisibility` is how the
clouds hide the sun: `occlusion` (`bias`, `curve` exactly `sqrt`, `dryMax`, `wetMax`), a square `view` toward the sun (`fovRad`,
`near` < `far`, `resolution`) and the `horizon` ramp. The replay gives each cell's code and both layer drifts
(docs/VCR_FORMAT.md, Type 10). `atmosphere/clouds.ts` places the sheets around the scene origin, takes the cloud coverage from the
cells and computes the sun visibility once per lap moment: it sums the sheets' opacity over the view's rays on the processor, adding
overlapping sheets, reads the first map level and ignores the view's far limit. The visibility scales the sun's
light and feeds the weather weight and the exposure; a replay without a cloud field keeps the plain cloud cover and an undimmed sun.
`atmosphere/cloudLayer.ts` draws the same sheets: one mesh per sheet with the first of its materials, lit by the package's formula
(the sun before the clouds dim it, the scene's environment as ambient light, half the haze distance), behind everything, far to
near, following the camera like the sky. The sheets are placed once per lap moment and do not drift during it; a cloud's two
randoms are the package's averages. The venue capture is taken without them.

`shading.shadows` (the pipeline's docs/SCENE_PACKAGE.md "Shadows") is the cascaded sun shadow: `atlas` (tiles inside
their atlas, one per cascade), `select`, `filter` (taps whose weights times `scale` sum to 1), `normalOffset`, `texelSnap`, `fit`, `fade`,
`centre` and `orientation` (each exactly the one rule the viewer accepts: squares centred at the middle of their view slice, axes
fixed to the sun) and `cameras` with exactly `chase`, `cockpit` and `tv`. Each camera set has `nearM` < `farM` and either a `splitRatio` in 0..1, a `count`
no larger than the tile count and that many ascending `splitsM` ending at `farM`, or all three null (no published set). The viewer does
not use it yet.

Startup checks that each listed file exists and has its catalogued size; it does not hash the scenery (several GB). Only the small cloud
map files are hashed, once at load. Package files
are pregenerated, content-named and published by folder swap, so they are never rewritten in place: the backend serves them as is,
with no hash or change check. A hash check can come back if a real failure ever needs one.

`GET /api/data-plugin/scenery/:layoutKey` returns the expanded layout plus `packageRevision`. `/api/data-plugin/scenery/files/` serves the
package's `scenery/` folder, `/api/data-plugin/vehicles/files/` its `vehicles/` folder and `/api/data-plugin/rendering/files/` its `rendering/` folder as static files with `Cache-Control: no-store`
(a local server: a browser cache would only duplicate the package on disk); a missing file is a 404. A `.ktx2.zst` texture goes out
as `Content-Type: image/ktx2` with `Content-Encoding: zstd`, so the browser decompresses it while downloading, off the main thread.

The viewer always keeps the horizon chunk loaded and streams the sector chunks by the resident-set rule: at lap distance `L`, a main
sector is resident while its lap range meets `[L - residentBehindM, L + residentAheadM]` (circular; a pit chunk uses its main lap
range), and so is a sector whose xz bounds are within `residentAheadM` of the camera in a straight line (a circuit that folds back on
itself shows sectors far along the lap from close by). The orbit and overhead cameras use the camera position instead and keep chunks whose xz bounds are within
`freeCameraRadiusM`. Loading goes under the camera first, then ahead nearest first, then behind, then the straight-line ones; a chunk unloads only after it is 250 m
outside the window. Each loaded chunk holds one reference on every texture it uses and a texture is released with its last chunk.
A chunk that fails to load is reported and not retried. Road and ground heights (racing line, track limits, wheels, camera
clearance) come from the resident chunks only.

Camera clearance uses `three-mesh-bvh` raycasts over position-only copies of resident ground geometry.
BVHs are generated in a worker and released when a chunk unloads; they are not exported package assets.
The renderer's geometry buffers stay available while the worker builds the collision data.

### Bodies (`bodies` of `vehicles/index.json`)

Each body row lists `folder`, `vehicleIds` (every VEH id it serves, sorted, upper case, the ids of one or several records),
`descriptorSha256`, `sha256`/`byteLength`/`triangles`/`vertices` of its GLB (`vehicles/<sha256>.glb`), `interior` and `textures`
(`vehicles/textures/<sha256>.ktx2.zst`). The descriptor is at `vehicles/bodies/<folder>.json`; paths are derived, never stated.
Bodies are sorted by folder and no id is in two. `GET /api/data-plugin/vehicles/:identity/body` looks the body up by VEH id through
that list (`normalizeVehicleId` of the contract: any case, with or without `.veh`). The descriptor is read and its hash checked at
startup and validated against the body's row (`parseBodyDescriptor`): there is one appearance per vehicle id, every texture it names
is declared by the body, and its `cameras` hold a `frame` and `cockpitViewRule` statement and well-formed `cockpit`, `hood` and `roof`
cameras. Whether the GLB holds the nodes it names, the wheel rig and the lamp state rules are the pipeline's file-content checks, not
the app's startup.

A body carries its entries' part alternatives (number plates, lights, displays, some
body panels and tyre versions). The descriptor's `optionNodes` lists them, sorted and unique, each a mesh-only GLB node named
`option_<mesh file stem>` (letters, digits and `_`, so three.js keeps the name; GLB node names are unique); every appearance has its own
sorted `optionNodes`, a subset of the body's (`[]` for none). The viewer keeps the lap entry's options, leaves the body's other
options out of that body (no draw, no texture load) and fails if the GLB lacks a listed node. An option node may also carry
`extras.cockpitView`; the cockpit view rule then applies to it as to any other node.

The descriptor's required `lamps` list and `glowMaterialIds`, the sorted native material ids of the glow
meshes and brake disc glow slots, each one in the body's `materials` list. Each lamp is checked: a known `role`, non-empty `nodes` (GLB
node names; the loader drops `.`, `:`, `/`, `[` and `]` from them, so they are matched the same way), a `material`, `frames` that are
texture paths or null (no texture shipped for that frame), an `animation` (all null, or a known method, a rate and frame indexes), an
`emission` null (a lamp the game draws with a lit shader: nothing to draw) or {`scale` ≥ 0, `vertexColour`, `viewBoost` null or {`gain`, `power` > 0}, `ambientScaled`, `vertexAlpha`}, a `blend` of `alpha`
or `opaque`, `states` null or {`off`, `on`, `brake`} each a frame index or null, `defaultLit` and `hiddenInOwnCockpit` true, false or
null, and `brakeGlowRange` [low, high] on a disc glow only. A glow mesh is drawn only through a lamp with a known `states.off` whose frame
has a texture (headlight and brake glow): the slot that is the lamp's GLB `material`, under one of its `nodes`, renders that frame unlit
with the emission formula (`car/carLamps.ts`, in the sun's light unit), casts no shadow, and is hidden on the lap's own car in the in-cockpit view when
`hiddenInOwnCockpit`. Other glow slots and meshes are not drawn. No lamp switches on yet (no lit frame is known); the other lamp
materials are drawn as ordinary materials.

A body is split by where it is seen from and has texture start files:

- `interior` is required on every body row: null, or `sha256` (`vehicles/<sha256>.glb`), `byteLength`, `triangles` and
  `vertices` of a second GLB that holds only the parts the driver cameras draw (`extras.cockpitView: 'in'`), under one `chassis`
  node at the car origin. Node names are unique across both files. The viewer loads both and puts those parts under the body's
  `chassis` node (`laps/lapLayer.ts`); a body with an interior and no `chassis` node fails to load.
- A mesh node in either GLB may carry `extras.lod` {`inM`, `outM`}: it is drawn while `inM` <= camera distance < `outM` (`outM`
  null = no limit). The followed car is always at distance 0, the comparison car at its distance from the camera
  (`sceneObjects.ts`, `setCameraDistance`).
- A body texture row may carry `interiorOnly: true` (no outside part uses it; the viewer reads it at full size, the rest of the
  car up to its size limit) and `start`, with the full file's `width`, `height`, `levels` and `format` stated exactly when it has
  a `start`.
- A scenery or body texture row may carry `start`: `sha256` (a content-named KTX2 in the same textures folder),
  `byteLength`, `width`, `height`, `levels` and `gpuBytes` of the texture's start file, a complete texture that is the row's
  texture from at least two levels down, down to 256 px on its longer side (128 px for BC5 normal maps; the contract's
  `textureStartDrop`). Only a texture with more than two levels and a smaller side of at least 512 px has one; the server checks
  the start against the row's full size. The viewer draws from the start file first and reads the whole file later for the
  levels above it, as many as the row's `levels` less the start's (`scenery/cachedKtx2Loader.ts`,
  `scenery/materials/mipStreaming.ts`); a row without one is read whole.

`GET /api/data-plugin/vehicles/:identity/body` (a VEH id with or without `.veh`) returns the body row plus `packageRevision`;
`/vehicles/files/` serves the body and interior GLBs, descriptor, textures and their start files. The viewer selects the
lap's appearance by `vehicleIdentity.vehicleId`, creates one material per native material from the descriptor and animates the four
wheel rigs (`wheel_`, `steer_` and `spin_` nodes at the rolling hub) and the `steering_wheel` node about its `extras.steeringWheelPivot` and
`extras.steeringWheelAxis`, by the recorded steering times the wheel range. The Cockpit, Hood and Roof views sit on the descriptor's
`cockpit`, `hood` and `roof` cameras (position, pitch, vertical FOV, near clip) and show the cockpit mesh variant the camera names. A lap without a vehicle id, or a vehicle without a body, is an
error shown with the 2D map as the alternative; there is no estimated body.

Textures are KTX2 with raw GPU block data (no Basis transcoder). Scenery and vehicle bodies are Meshopt-compressed GLBs decoded by three.js.
The viewer's materials are approximate: carPaint region shading and normal or ambient-occlusion maps are not reconstructed.

## Behavior without detailed data

Bundled layouts, recorded trajectories and channel-based analysis remain available.
Geometry-dependent corner results, road/kerb distances and road banking are unavailable.
The GPS map uses labeled approximate class-size bodies until suitable local vehicle
footprints are available. Missing data never selects another layout or invents flat roads.

The local API exposes `/api/data-plugin/vehicles/logos` and `/api/data-plugin/tracks/:layoutKey`
(geometry and optional display together). Manufacturer SVG logos are optional vehicle-catalog
assets, loaded through their own endpoint. Vehicle records are resolved internally for telemetry;
the unused public vehicle-list and plugin-status endpoints were removed. The API serves validated
responses, not arbitrary package files. `/api/status` carries the package content revision.
The browser can inspect the local data it displays. Cloud AI remains available regardless
of package availability. Reports use the normal analysis evidence, including available derived
measurements; missing details reduce the report's specificity rather than disabling it.
Raw package files and geometry arrays are not uploaded by the report evidence builder.

No executable package scripts, downloads, registry, settings manager or automatic extraction are part
of this version. Packages are supplied separately and excluded from static builds.
`npm run build` checks inputs and output for forbidden detailed assets; basic SVGs are allowed.

Optional display `surfaces.raisedKerb` polygons identify native raised/anti-cut kerbs. They are an amber overlay under the existing Kerbs toggle; the combined `kerb` footprint remains usable by older clients. Missing overlays in older packages retain the standard kerb colour.

## Regression tests

The default suite uses synthetic geometry and vehicle records. Optional personal
regressions use `LMU_PERSONAL_REGRESSION_ROOT` for a package and
`LMU_PERSONAL_FIXTURES` for a private folder containing `replays/` and
`__snapshots__/`. These folders must stay outside committed release inputs.
Use `LMU_PLUGIN_ROOT` too when testing recording enrichment with that package.
