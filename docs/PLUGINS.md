# Optional local data packages

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
The backend listens on loopback. Plugin endpoints also check Host and Origin.

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
Each record has `id`, `model`, `carClass`, `vehicleIds`; optional
`dimensions` hold `lengthM`, `widthM`, `heightM`. Optional convex
`outlineXZ` coordinates are metres with forward -Z. A validated
`replayOriginOffsetXZ` is required before model footprints are placed on replay poses.
Exact aliases win; ambiguous model matches remain unresolved. Primary and comparison
vehicles resolve independently. Body direction continues to use replay yaw.

## Behavior without detailed data

Bundled layouts, recorded trajectories and channel-based analysis remain available.
Geometry-dependent corner results, road/kerb distances and road banking are unavailable.
The GPS map uses labeled approximate class-size bodies until suitable local vehicle
footprints are available. Missing data never selects another layout or invents flat roads.

The local API exposes `/api/data-plugin/status`, `/vehicles` and
`/tracks/:layoutKey` (geometry and optional display together). It serves validated
responses, not arbitrary package files. Status contains availability and a content revision.
The browser can inspect the local data it displays. Cloud AI remains available regardless
of package availability. Reports use the normal analysis evidence, including available derived
measurements; missing details reduce the report's specificity rather than disabling it.
Raw package files and geometry arrays are not uploaded by the report evidence builder.

No scripts, downloads, registry, logos, settings manager or automatic extraction are part
of this version. Packages are supplied separately and excluded from static builds.
`npm run build` checks inputs and output for forbidden detailed assets; basic SVGs are allowed.

## Regression tests

The default suite uses synthetic geometry and vehicle records. Optional personal
regressions use `LMU_PERSONAL_REGRESSION_ROOT` for a package and
`LMU_PERSONAL_FIXTURES` for a private folder containing `replays/` and
`__snapshots__/`. These folders must stay outside committed release inputs.
Use `LMU_PLUGIN_ROOT` too when testing recording enrichment with that package.

Removing datasets from the current tree prevents future bundling; it does not remove
copies from earlier Git history, tags, deployments or releases.
