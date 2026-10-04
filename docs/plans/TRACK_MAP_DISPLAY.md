# Track map display plan

Date: 2026-10-03. Implemented: simple SVG outlines, optional revision-matched display assets, layer
controls, seam-free fallback ribbon, camera fitting, persistent preferences, scale bar and corner-label
collision filtering. Unsupported categories are disabled.

## Display assets

The app loads layout geometry, display layers and outlines from `public/tracks/`,
`public/tracks-display/` and `public/track-outlines/`. Display layers preserve polygon holes
and match the geometry revision. The client rejects stale layers and uses its road ribbon
fallback until matching assets are available.

## Intended experience

Track detail uses a crisp, lightweight SVG silhouette of its exact circuit layout. The GPS map
starts with the active racing surface and its kerbs, keeping the lap traces visually dominant.
Surrounding surfaces and pits are optional context available through one Layers control.

## 1. Track detail: restore the simple SVG

- Render the existing white outline treatment in the header and circuit information modal;
  remove native road/kerb/runoff rendering from TrackCircuitLayout, including compact variants.
- Fit the outline to the active centerline's bounds, rather than bounds containing surrounding
  surfaces. Keep each layout resolved directly through getCircuitSpecification.
- Generate small SVG assets per layout from its validated centerline, with an indexed loader
  through src/api. There are currently no per-layout public SVG assets. Use the existing outline
  path as the transition/fallback and invalidate any path cache by geometry/projection revision.
- Track-detail layout display should not fetch the full surface payload. The information modal
  may still load physical geometry for its elevation, banking and measurement panels.

## 2. Fix the surface contract before adding misleading toggles

Current TrackMapSurfaces has road, kerb and runoff; the exporter merges pit into road. A frontend
checkbox alone cannot reliably hide pits or inactive roads in these files.

- Export distinct display polygons for active road, active kerbs, surrounding runoff, pit lane /
  apron, and other circuit roads or inactive connectors. Keep holes and exact local x/z coordinates.
- Keep each surface category aligned with the active layout.
  Do not treat an arbitrary corridor margin as the exact boundary of an active surface.
- Ambiguous classification stays explicitly unavailable; never pretend a toggle removed geometry
  that remains merged. Retain compatibility with older files, with unsupported options disabled
  and a short explanation.
- Extend shared types and validators; regenerate display layers independently of analytical
  centerlines, stations, timing gates and telemetry. No station migration for visibility settings.
- Coordinate export ownership with the agent testing geometry; validate staged outputs before
  replacing public files and update CODE_MAP for any added modules or contract changes.

## 3. GPS Layers control

Add one labeled Layers button beside the existing map controls, opening a compact popover:

| Option | Default |
| --- | --- |
| Active track | On |
| Kerbs | On |
| Runoff | Off |
| Pit lane and apron | Off |
| Other circuit roads | Off |
| Road edges | Off |
| Centerline guide | Off |

- Existing lap, comparison, corner and pedal controls retain their behavior. Keep geometry
  settings separate from telemetry color modes and comparison fading.
- Remember display preferences locally, with a Restore defaults action; degrade gracefully when
  storage is unavailable. Render only supported options for each geometry version.
- Use keyboard-accessible checkboxes, Escape and outside-click dismissal, focus return, and
  prevent popover pointer/wheel events from panning or zooming the map.
- Layers change visibility without resetting pan, zoom, playback or selected corner. Keep the
  projection frame stable; Fit track fits active geometry, and an explicit Fit visible layers
  includes enabled context. Hidden outer surfaces must not shrink the default racing layout.

## 4. Diagnose and remove distracting lines

Code evidence, not a visual diagnosis: GpsTrackSurfaceLayers strokes every polygon ring;
GpsTrackRoadRibbon draws a dashed centerline plus boundary strokes. buildRoadRibbonSvgPath joins
the end of one closed boundary to the other, introducing a cross-track closure seam.

1. Compare identical views with fill only, then edges, centerline and telemetry enabled separately.
   Check native surfaces and fallback geometry, especially start/finish and overlapping layouts.
2. Default surface fills to no stroke. Make road edges and the centerline independent opt-ins.
3. Represent a closed fallback ribbon as separate closed left/right rings with an appropriate
   hole fill rule; draw each boundary separately only when requested. Avoid stroked connectors.
4. If lines survive the fill-only view, inspect polygon holes, tiny slivers, overlaps, disconnected
   fragments and quantization artifacts in the source data. Fix confirmed defects at export;
   preserve legitimate islands and holes, and never hide defects with thicker strokes.

## 5. Further improvements worth including

- Quiet, consistent road/kerb/runoff/pit colors from themeColors; preserve strong primary and
  comparison traces. Context layers should not compete with braking and delta colors.
- Reduce label clutter when zoomed out; reveal detail as space becomes available. Keep selected
  corners and start/finish easy to identify. A modest scale bar makes zoomed distances readable.
- Keep the minimap as a simple active-layout outline regardless of enabled outer surfaces.
- Memoize projected paths by layout, revision and projection frame; visibility toggles should
  not rebuild every polygon or rerender static surfaces on each playback frame.

## Delivery and acceptance

First restore track-detail SVGs and clean up strokes/ribbon closure. Then introduce the separated
display layers and Layers popover. Finish with fitting, persistence and label/performance polish.

Validate Monza GP versus Curva Grande, one pit-heavy layout, one layout with extensive runoff and
one legacy file. Check default track + kerbs, independent pit/runoff toggles, correct holes, no
start/finish seam, stable camera on toggles, accessible controls and preserved lap selection.
Use targeted component/domain tests plus npm test and npm run build; visually inspect overview,
corner zoom, start/finish and pit entry. Confirm display changes do not alter projection revisions,
lap alignment or deterministic coaching measurements.
