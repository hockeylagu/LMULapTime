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
contents; a display's `sourceRevision` must match its geometry revision. The same
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
