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

## Contract version 1

```json
{
  "schemaVersion": 1,
  "id": "personal-data",
  "version": "1",
  "tracks": { "catalog": "tracks/index.json" },
  "vehicles": { "catalog": "vehicles/index.json" }
}
```

Tracks and vehicles are independently optional; at least one must be declared. Catalog
paths are package-relative JSON files. Absolute paths, traversal and symlink/junction
escapes are rejected. The whole package is validated before activation.

Track catalogs use the existing canonical layout identities. Geometry files sit beside
the catalog as `<layoutKey>.json`; optional display files are
`tracks-display/<layoutKey>.json`. Geometry and projection revisions must match their
contents; a display's `sourceRevision` must match its geometry revision. Display brake markers may carry `baseY`, the native height of the board bottom where the game bounds are measured. The same
provider supplies backend projection, profiles and frontend geometry. Null samples
remain unavailable, including measured widths, kerb profiles and banking.

Vehicle catalogs contain `schemaVersion: 1`,
`coordinates: "local-xz-metres-forward-minus-z"`, and a `vehicles` array.
Each record has `id`, `model`, `carClass`, `vehicleIds`. `carClass` must be one of the app's
canonical classes (`Hyper`, `GT3`, `GTE`, `LMP2`, `LMP2_ELMS`, `LMP3`, `SafetyCar`), not LMU's VEH
labels such as `LMGT3`: the app reads it as published and uses it as the replay driver's class.
`model` only helps resolve a vehicle; the car name shown and filtered on stays the one the
sessions record. Optional
`dimensions` hold `lengthM`, `widthM`, `heightM`. Optional `handling` holds
`wheelbaseM` and the complete steering trio `steeringRatio`, `defaultSteeringWheelRangeDeg`
(total lock-to-lock wheel rotation) and `defaultSteeringLockDeg` (one-sided road-wheel lock).
Wheelbase is the mean of the physics left/right axle distances, independent of collision-body length.
Steering values describe the base HDV's selected default setting, including its steering fraction;
they do not identify the setup or circuit-specific upgrade selected for a recorded lap.
The ratio must agree with `defaultSteeringWheelRangeDeg / (2 * defaultSteeringLockDeg)`.
Partial steering trios, nonfinite/out-of-range values and unknown handling fields invalidate the package.
Optional `deploymentKw` lists a hybrid's deployment settings in kW, ascending, exactly as the game's
MFD labels them (2–40 values, 0–500 kW); anything else invalidates the package. Hybrids without it
get deployment advice as the game's map position instead of kW. The track pipeline fills it from each car's
electric motor file (`ElectricMotorMapSpecial` labels, from personal-v18: 0–200 kW in 20 kW steps for the LMH hybrids,
0–50 kW in 10 kW steps for the LMDh cars). Live advice looks it up by model and class; variants of one model
(the Peugeot 9x8's two generations) share the list only when they agree.
Geometry-only version-1 catalogs remain supported. Missing wheelbase or steering data independently
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

## 3D track scenes (package version 2)

An optional `scenes: { "catalog": "scenes/index.json" }` capability on manifest `schemaVersion: 2`
adds a 3D scene per layout. Version 1 remains supported; old app versions reject v2.
Scenes require the exact analytical layout and matching `sourceGeometryRevision`. Vehicle-only
or scene-only packages do not establish a road coordinate frame. Existing packages are not modified.

Scene catalog entries use `schemaVersion: 1`, `layoutKey`,
`coordinates: "lmu-local-xyz-metres"`, `sourceGeometryRevision`, `revision`, `asset`, `sha256`,
`byteLength`, `bounds: { min: [x,y,z], max: [x,y,z] }`, `triangles` and `coverage: "surfaces"` or `"surfaces+barriers"`. The latter adds roadside
structure as nodes `barrier`, `tyreBarrier`, `tecpro` and `pitWall` (collision proxies, which stand
~10 m tall, capped by the exporter to about a metre over the wall beneath, dropping catch fences), and `building`, `wall` and `armco` (the game's own render
meshes at their real height; `armco` is the low-LOD guard rail), standing down to the filler ground; the viewer keeps them out of road heights.
New ground-bearing exports also have a `ground` node: the exporter's filler ground, a 6 m (or coarser, at most 768 corners a side) grid
0.2 m under the scanned surfaces, fading to a flat level 700 m out. Ground sheets are wound face up.
Primitives may share one position accessor; validation budgets and scans it once.
`revision` is `scene-<sha256>` over the GLB bytes. Positions are native LMU XYZ metres, Y up,
without model transforms. These native positions are left-handed: the viewer reflects Z once
for Three.js, including car bodies, trails and camera targeting. An overhead view then matches the
2D map's handedness (+X right, +Z up). No timing/station or analytical revisions change for scenery.

The first supported GLB subset is static indexed triangles, float32 XYZ, uint32 indices, simple
untextured materials and one root node per mesh. External resources, extensions, transforms,
animation, textures and oversized/invalid buffers are rejected. Limits are 128 MB per scene,
1 GB total, four million triangles and six million visited vertices across primitives, and
100 catalog rows. Layouts of one venue whose scenes are identical name the same content-named file
(`scenes/<sha256>.glb`); it is read, validated and counted once, and its rows must agree.
Catalog and binary paths remain package-contained, including junction checks. An invalid scene
invalidates the package under the existing all-or-nothing snapshot rule. No last-good fallback
silently supplies another package's geometry.

`GET /api/data-plugin/scenes/:layoutKey` returns public metadata without local asset paths;
`GET /api/data-plugin/scenes/:layoutKey/:revision/asset` returns only that registered GLB.
Bytes are hash-checked on each request; changed files return 409 and unknown layouts/revisions 404.
The API client loads the binary with cancellation and `ApiError` handling. Detailed GLBs/catalogs
remain outside static builds and committed data. Synthetic scene fixtures test the contract.

In the replay inspector choose **3D view**. Orbit, follow, chase, fixed trackside and orthographic
overhead cameras share the existing playhead; a comparison ghost uses the same track station.
Follow is the default. Dragging, panning, centering or zooming preserves the selected mode;
Follow retains the adjusted camera/focus offsets as the car moves. Chase carries those offsets
with the car's heading. Use 1 Follow, 2 Chase, 3 Orbit, 4 Trackside or 5 Overhead to select a mode.
The focused 3D scene supports Left/Right sample steps, Shift+Left/Right half-second jumps,
Home/End, Space playback, +/- zoom, W/A/S/D pan, C center, F follow, R/0 reset and M fullscreen.
Escape exits fullscreen; ? opens the 3D-specific shortcut list and Escape closes that list first.
Camera dropdowns, typing, browser modifiers and other dialogs retain their own keys.
Racing lines follow the matching exported surface with a small lift to avoid flicker. Cars and
nearer terrain occlude them; translucent ghosts blend over them. Missing surfaces or an unrelated
road layer leave a gap in the line. This visual projection never changes measured poses or analytics.
Car bodies use recorded XYZ and available yaw/pitch/roll, with quaternion interpolation between
continuous samples. Recorded body Y already carries vertical motion; four-corner ride-height
measurements, when available, are displayed in millimetres and are never added to Y again.
Missing attitude channels remain partial. Body-origin placement and individual wheel contact
are not calibrated: the display origin is fitted to the lap-median road contact, wheels follow
ride height (else the road surface) within ±0.15 m, and the generic sky, fog and the package's filler
ground (kept under every scanned triangle) are estimates, not the game's scenery. Scenes contain native road,
kerbs, runoff, pit, paint, grass and gravel with simple colors, plus the roadside structure each
venue's SCN names (coverage varies by venue). Textures are not included. A missing scene or WebGL
context offers a return to 2D.

Source-coloured packages bake a small palette from each layout's primary albedo/UV0 into flat
materials. `kerb-source-*` groups retain those colours and kerb shadows; only legacy `kerb` groups
receive the generic red/white stripes. Runoff without usable source colour uses a neutral fallback.
This is a simplified colour bake, not full source shading: layered textures, wetness and decals are
not reproduced, and small atlas-boundary artifacts can remain. Analytical revisions do not change.
Packaged filler stays separate from road-height sampling for cars, racing lines and braking boards.

The sibling pipeline's `export:plugin --scenes` adds every layout's scene to a new package from the
same validated build and decoded GMT buffers. See the [remaining 3D work](plans/proposed/REPLAY_3D_PLAN.md).

### Optional brake-board artwork

Version 2 packages may add `scenes.brakeBoardArtwork: "brake-board-artwork/index.json"`.
This is a separate PNG catalog; the static GLB subset still rejects embedded textures/images.
Each entry contains `layoutKey`, `sourceGeometryRevision`, `markerIds`, the published `label`,
`revision: "artwork-<sha256>"`, `sha256`, `asset`, `byteLength`, `widthPx`, `heightPx`, `widthM` and
`heightM`. IDs and label must match the exact layout's display markers and analytical revision.
One marker cannot have two artwork bindings. Measured panel sizes are 0.05–5 m per side.

Assets are content-named `brake-board-artwork/<sha256>.png` files contained inside the package,
including junction checks. Validation checks PNG signature/header/end, exact dimensions and hash;
only non-interlaced 8-bit grayscale/RGB images (with optional alpha) and IHDR/IDAT/IEND chunks
are accepted; animated images are excluded. Limits are 1 MB per image, 1024 pixels per side,
16 MB of distinct images and 2048 catalog entries.
Files are checked again on requests. `GET /api/data-plugin/brake-board-artwork/:layoutKey` returns
metadata without asset paths; `GET /api/data-plugin/brake-board-artwork/:layoutKey/:revision/asset`
serves only the registered PNG with `nosniff`. Stale or changed assets fail closed.

The renderer matches marker IDs and labels, preserves source panel proportions, and shares an image
texture across repeated signs. Source UV corners are rectified for readable artwork before export;
board faces remain outside the reflected world so text does not mirror. Missing artwork or an older
package retains generated labels. Optional image loading errors never prevent the track from opening.
These crops reproduce static board artwork, not dynamic digital flag states or a full game shader.
Packages declaring this field require an app version that supports it; older strict loaders reject it.

### Optional visible vehicle meshes

A v2 manifest may also declare `vehicleMeshes: { "catalog": "vehicle-meshes/index.json" }`.
Each entry contains the common binary fields (`asset`, `sha256`, `revision`, `byteLength`,
`bounds`, `triangles`), `schemaVersion: 1`, an exact `vehicleRecordId` from the vehicle catalog,
`coordinates: "vehicle-local-xyz-metres-forward-minus-z"`, `representation: "render"`,
`originCalibration: "unverified"` and unique `parts` drawn from `body`, `chassis`, `exterior`,
`wing`, `glass`, `tyres`, `rims`. The body is required. Revision is `mesh-<sha256>`. A bounded
render model is 1–3.5 m wide, 0.3–4 m high and 3–7 m long, with local bounds within 10 m.
The same static GLB, byte/hash/path validation applies, with a separate 256 MB catalog budget.
This capability needs vehicle identities; scene or class names cannot supply the binding.

Vehicle GLBs additionally support per-corner `tyres-FL/FR/RL/RR` and `rims-FL/FR/RL/RR`
root meshes. Each carries only `extras: { "wheelPivot": [x, y, z] }`, a finite rolling hub
in the same body-local metres, with each coordinate strictly within ±4 m and the correct
left/right and front/rear signs. Track GLBs continue to reject node extras. The viewer requires
all eight wheel parts, matching tyre/rim pivots and plausible tyre bounds around each hub
before enabling animation; malformed sets stay static. Legacy combined `tyres`/`rims` nodes
retain bounds-derived hubs. Source hubs define rolling axes; rest-height and replay-origin
calibration remain separate from this metadata.

The `glass` material role denotes exterior cabin windows, including exact source-selected
window variants. It uses simplified dark opaque shading. Source glass transparency, tint,
reflection/transmission shaders and alpha-masked light-cover overlays are not reproduced.

Vehicle packages must supply outward CCW faces, unit float32 `NORMAL` attributes aligned with
`POSITION`, and PBR roughness/metalness for each material role. The viewer preserves these
properties: it does not reverse faces, regenerate normals or override primary material roles.
Rebuild older exports without normals in the pipeline; the validator rejects vehicle GLBs without finite unit normals.
The visible Three.js daylight sky also supplies the shared prefiltered reflection environment;
the directional sun supplies direct lighting and shadows. No separate car reflection texture
or per-car brightness correction is applied. This is simplified daylight, not LMU's renderer.

`GET /api/data-plugin/vehicle-meshes/:recordId` returns public metadata without local asset paths;
`GET /api/data-plugin/vehicle-meshes/:recordId/:revision/asset` serves only the registered GLB.
Missing models return 404 and retain a labelled estimated body; changed assets return 409.
The client checks both record and package revision, deduplicates a matching primary/ghost load,
and gives each car independent materials. Primary body tint and translucent comparison tint
preserve tyre/rim material roles. Model coordinates are neither recentered nor scaled to the
collision envelope; declared XZ replay-origin offsets remain applicable. Vertical calibration
remains unverified and is labelled as approximate placement.

The first private render export is the Duqueine D09 P3 at exterior LOD1: body, chassis, external
parts, wing, glass, all four tyres and four rims. The pipeline preserves bounded part translations,
binds installed VEH/GEN references and emits a separate review candidate through
`export:vehicle-scene`. The app splits the static tyre/rim geometry per corner to roll, steer and
move it from recorded data; damage, liveries and textures are not inferred. Other models retain their existing estimated body until
their own exact render data is available. Analytical vehicle records and accepted packages stay
unchanged; this is not publication of a new accepted dataset.

### Optional vehicle liveries

A v2 manifest may declare `vehicleLiveries: { "catalog": "vehicle-liveries/index.json" }`.
The catalog is a flat array of entries:
`{ liveryKey, vehicleRecordId, vehicleIds, asset, sha256, byteLength, width, height, revision }`.
Each livery entry binds a specific visual mesh variant (`vehicleRecordId`) and its driving vehicle aliases (`vehicleIds`).
Assets are content-addressed WebP files under `vehicle-liveries/<sha256>.webp` with `RIFF....WEBP` container headers,
matching hashes, and dimensions within 4096 px. The catalog budget is 256 MB total.

`GET /api/data-plugin/vehicle-liveries/:vehicleId` resolves a vehicle alias (case-insensitive) and
returns public metadata with `packageRevision`. Each alias may appear in at most one entry; one image may serve
several mesh variants under the same `liveryKey` and revision.
`GET /api/data-plugin/vehicle-liveries/:liveryKey/:revision/asset` serves only the registered WebP image.

In the 3D replay inspector, cars load their matching livery texture for primary and comparison
vehicles. Textures use direct vertical orientation (`flipY = false`) and repeat wrapping (`wrapS = wrapT = RepeatWrapping`)
to match source UV coordinates. Textures apply strictly to the `livery` material on meshes with native `TEXCOORD_0`
whose `vehicleRecordId` matches.
Drivers in replays with a custom skin hash (a 24-character hex identifier) and the 14 vehicle records without the paint
binding (`WCCARBODY` + `L2IBLCARBODY`) retain the neutral body without texture.

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

### Standard Meshopt GLBs

Track scenes and car meshes may use the ratified `EXT_meshopt_compression` extension.
Files remain GLBs; asset hashes, byte lengths and revisions describe the physical GLB served
unchanged by the server. No custom container or storage metadata is used. Existing uncompressed
GLBs remain supported. Upgrade the app before selecting a Meshopt package.

The supported static subset uses embedded compressed data plus the extension's declared fallback
buffer, float32 XYZ and uint32 triangle indices. `ATTRIBUTES`, `TRIANGLES` and `INDICES` modes
with no lossy filters are accepted. The server bounds compressed ranges and decoded allocation
before calling the standard Meshoptimizer decoder, then applies the existing coordinate, mesh,
triangle, vertex, wheel-pivot and scene limits to the decoded data. External resources and other
extensions remain rejected. Three.js uses its Meshopt decoder for both track and car loading.

The exporter uses glTF Transform's standard extension writer without quantization or simplification.
Coordinates retain exact float32 bits; triangle ordering, topology and winding are preserved,
allowing the triangle codec's cyclic rotation of the three corners. Materials, node bindings,
transforms and wheel pivots are checked before publishing. Identical car GLBs share a physical
file while all vehicle records and aliases retain their own identities.
