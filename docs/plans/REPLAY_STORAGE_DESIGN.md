# Replay storage and ingestion design

Status: **Proposed; initial POC complete; binary lap codec done** ([REPLAY_BINARY_LAP_CODEC.md](REPLAY_BINARY_LAP_CODEC.md)).
Reviewed: 2026-10-22. Lap blobs are now binary columns (6.4 GB to 2.6 GB database); prepared views and channel groups remain open.
Dependencies: canonical replay classification, track geometry revisions, XML ownership, DuckDB session links.

## Requirements

- User priority, in order: **total storage size, app read response time, ingestion time**. Correctness and retained-data safety remain constraints, not optimization tradeoffs.
- Keep the current format unless a replacement earns its storage cost. Eliminating all read transformations is an aspiration subordinate to size, not a reason to persist large prepared views.
- Read-heavy application: normal prepared replay reads should decode and assemble stored values, without repeating domain transformations. Traffic may remain lazy.
- Fastest ingestion consistent with those reads: one packet scan, bounded memory, worker-owned SQLite writes, no raw-object staging and second full encode.
- One authoritative retained sample representation; no original-VCR archive plus a complete decoded copy.
- Unknown fields may be discarded. Version the known fields retained; a migration requiring discarded information needs the original VCR.
- Preserve retained known source channels needed to rebuild projections, including when LMU deleted the VCR. Do not irreversibly replace signals with display filtering.
- Database size is an acceptance criterion, including indexes, derived columns, WAL and temporary rebuild space.

The previous experimental single-scan implementation is not accepted: comparable full-field runs were 137.5 s for sequential direct worker saves and 190.7 s for experimental object staging. These are historical import measurements, not measurements of this proposal.

Current implementation work returned to the existing schema: packet staging and
one source scan replace the rejected decoded-object staging. The fresh full-field
comparison averaged 116.6 s sequential versus 93.8 s with one scan across two
runs per mode, with identical final database size and contents. Temporary disk and first-driver availability costs
are documented in [the ingestion measurements](../VCR_PERFORMANCE_ANALYSIS.md).
This does not implement the proposed storage redesign below.

The [initial storage POC](REPLAY_STORAGE_POC.md) tested 107 laps / 554,733 samples. Current storage used 14.00 MiB; binary source columns used 15.68 MiB; exact prepared views used 73.70 MiB. Neither candidate meets the storage priority. The prepared-view direction below records the explored design, not an accepted implementation. Preserve the current storage baseline and necessary read transformations while evaluating smaller representations.

## Actual consumers

These are source-level access patterns, not observed request frequencies or new latency measurements.

| Consumer | Current read/work | Storage implication |
|---|---|---|
| Inspector and lap comparison | One selected driver/lap; optional reference lap; maps and channel traces | Keep the lap as the primary indexed read unit; preserve all known recorded channels |
| Standard/high/full resolution | 4 m / 2 m spacing / all points; high is the UI default | Store one full-resolution source and compact prepared selection indexes, not three full copies |
| Corner consistency and debrief repeatability | Multiple clean laps of one driver, requesting 400 points each | Batch compact lap views; avoid repeating full preparation for each lap |
| Session/leaderboard debrief | Target/reference/optional technique laps at default resolution, plus repeatability laps and traffic | Same prepared lap contract should serve all consumers |
| Timing line correction | Selected lap plus previous and next full blobs, retaining at most 2 s of each neighbor | Resolve line cuts during preparation with rolling boundary context; ordinary reads should not load neighbors |
| Native replay response | Garage repair, retained lap classification, official validation, geometry projection, surface annotations, line cut, response downsampling | Prepare stable results once; revisions trigger background preparation, not domain recomputation on every GET |
| DuckDB response | Load/cache a telemetry lap, fuse replay coordinates onto its clock, then project/cut/downsample | A separate preparation dependency; replay-only ingestion cannot finalize data that has not arrived |
| Browser telemetry processing | Denoise throttle/speed/gear, convert steering units, compute dynamics after downsampling | Part of the read-transformation audit, not just backend work; order affects results |
| Session pit service | SQL pit events/lap spans; player stops decompress intersecting lap trajectories to get time and virtual energy | Expose time/energy columns without full point hydration; optionally prepare small refill facts |
| Session weather classification | SQL condition intervals, no sample blob required | Keep normalized conditions; no need for geometry or full sample preparation |
| Replay metadata/cache lists and matching | Metadata blob and scalar/indexed ownership/ingest facts | Keep independent from large sample blobs |
| Traffic | First build loads every lap blob, decompresses/JSON-parses all channels, selects time/XYZ/state at 5 Hz, projects; subsequent reads use a compact stored index | Keep lazy, versioned derived traffic; permit reading only its required channel groups |

Evidence: `server/replay/replayRecordingService.ts`, `replayTrajectoryService.ts`, `replayTelemetryService.ts`; `server/core/replay/dbReplayTrajectoryStore.ts`; `server/sessions/sessionPitStops.ts`; `server/traffic/lapSamples.ts`, `raceTrafficService.ts`; `src/components/replay/inspector/useReplayInspectorData.ts`, `analysis/useCornerConsistency.ts`, `telemetry/telemetryResolution.ts`; `src/components/session-detail/debrief/loadSessionDebrief.ts`; `src/utils/telemetryPostProcessing.ts`.

## What the existing model already gets right

- Lap blobs are columns with constant-channel elimination, stored in the lossless binary lap format (scaled-integer deltas in byte planes, Brotli 9) since 2026-10-22. Rows hold what the app serves; no read-time fixes.
- Normalized SQL tables already hold lap facts, conditions, driver events and running order.
- Default-driver/default-lap selection already uses pointers rather than duplicate blobs.
- Current canonical writes strip most replay-wide arrays and the driver's lap list from blobs. Own-driver pit events remain for garage reconstruction; some metadata remains repeated.
- Geometry and display-derived channels are largely not persisted in native replay blobs today, which saves space but repeats preparation during reads.

## Recommended direction

Keep **logical lap storage**, rather than making arbitrary time chunks the normal application read unit.
The access patterns support this more strongly than a replay-wide or whole-driver blob.
Use bounded physical segments only where needed for malformed/missing lap timing or exceptionally long recordings; the lap index can reference those segments.
The normal timed-lap path should not incur segment joins without demonstrated benefit.

The binary column codec was chosen and shipped (0.41 of the JSON size, reads faster). Preserve absence masks, known channel precision, four-wheel arrays and meaningful boolean state.
Separately compressed channel groups may improve time/position and energy reads, but reduce cross-channel compression and add row/index overhead. Measure that tradeoff.

Proposed ownership:

| Stored item | Ownership / role |
|---|---|
| Recording identity, roster, known event/timing facts | Stored once at replay/driver level; authoritative inputs for future rebuilds |
| Native known sample columns | Stored once, indexed by recording/driver/lap or segment; preserve source inputs for retained-data migrations |
| Prepared annotations | Versioned additional columns: geometry, garage state, derived dynamics where justified; do not duplicate unchanged source channels |
| Prepared lap/view descriptors | Boundary sample references, calculated seam endpoints, sectors, bounds, validated summaries and compact selection indexes |
| Display corrections | Prefer sparse overrides where only some source values change; dense derived columns must earn their space through measurement |
| Traffic index | Existing lazy derived representation, invalidated by sample/layout/projection revisions |
| Import/preparation status | Explicit source identity, schema/decoder version and preparation dependency revisions |

The target GET path is indexed lookup, decompression/decoding, selection of already prepared values and response assembly.
Decompression, ordinary serialization and assembling metadata are unavoidable representation work; classification, filtering, projection, fusion and feature selection are the transformations to remove.

## Preparation lifecycle

1. One worker scans the packet stream once; consumed bytes and packets are released immediately.
2. Each driver keeps current samples and sufficient boundary/state context. Flush bounded segments when timing is missing, so memory cannot grow with the recording.
3. Encode known source columns once and write pending rows directly to SQLite in bounded transactions. No compressed temporary raw objects followed by a second complete sample serialization.
4. Finalize lap facts and preparation when the required timing/pit/weather/context is available. Late facts update their own rows/annotation groups rather than forcing base-channel rewrites.
5. Publish a consistent prepared generation after source validation. An incomplete replacement must not erase the old published data. Account for temporary old/new storage and bound replacement work per driver or lap set.
6. XML linkage, track packages or DuckDB arrivals trigger dependent preparation in a worker. Reuse unchanged channel groups. A replay may have native views ready while fused views are not ready.
7. Reads serve a matching prepared revision. Missing/stale preparation queues work and exposes readiness; it must not silently repeat the full transformation chain in the request handler.
8. Traffic remains independently lazy and rebuildable from known stored coordinates/state and events.

Source ingestion and preparation are distinct measured stages, but both count toward **time until usable**. Reporting a fast scan while moving all costs into a preparation backlog is not an improvement.

## Decisions that require measurements or a behavior change

### Resolution and browser processing

Today filters/dynamics run **after** resolution selection. Processing once at full resolution then selecting points can change outputs.
Two candidates must be compared: accept a canonical full-resolution prepared signal with explicitly validated behavior changes, or store resolution-specific corrections/dynamics for the small supported view set.
Selection indexes alone do not reproduce resolution-dependent dynamics. Do not claim they do.
The API also permits arbitrary point budgets and spacings; literal transformation-free reads require restricting the prepared view contract or materializing custom requests outside the read path.
No silent removal of raw/full-resolution functionality is proposed.

### DuckDB fusion

The user can select native VCR or automatic DuckDB/fused data, with different sample clocks and densities.
Eliminating fusion during reads requires preparation after both sources exist.
Share unchanged telemetry channels where possible and store only necessary aligned coordinates/annotations; do not automatically create a third complete sample copy.
Measure added coordinates/annotations and rebuild costs before accepting this extension.

### Geometry and minimal transformation

Storing ready geometry removes read-time projection but adds data and invalidation work.
Preserve native coordinates and boundary context so geometry updates can rebuild without the VCR.
Store cut descriptors and necessary interpolated endpoints rather than irreversibly deleting the only samples around the timing line.
Minimal irreversible transformation remains compatible with prepared derived columns; zero additional derived storage is not compatible with eliminating their computation at read time.

### Versioning

Separate stored field/encoding version, decoder semantics, and preparation revisions (geometry, official timing/classification, display processing and source fusion).
Do not force a VCR reparse because a derived algorithm changed. Migrate from retained known fields where sufficient; retain compatible legacy reads where a rebuild lacks inputs.
Compatibility handling may transform legacy data during a bounded migration/preparation job; the steady-state read path is the target for eliminating transformations.

## Delivery plan and acceptance gates

1. Profile representative reads: native 2 m/full, reference pair, 400-point multi-lap consistency, session pit services, cold/warm traffic and fused telemetry. Separate DB fetch, decompression, object hydration, validation/classification, neighbors, geometry, fusion, response selection and browser preparation. Use the same fixed dataset before/after.
2. Prototype codecs off the live DB: current lap codec, binary lap columns, and grouped columns. Include normal/long/partial laps, missing channels, four-wheel data and late events. Measure compression, encode/decode, selected-channel reads and full API assembly, not codec throughput alone.
3. Prototype one read-ready native lap end to end. Compare both numerical/semantic parity and the cost/space of prepared geometry, selection and display processing. Resolve the resolution-dependent behavior above before schema integration.
4. Choose the smallest model that achieves the read target. Record exact retained fields and irreversible losses. Define publication, revision invalidation, archived-data migration and readiness behavior.
5. Implement the one-scan importer against that contract, retaining bounded memory and worker-owned SQLite writes. Integrate dependent preparation; preserve source-identity/layout checks and atomic replacements.
6. Migrate isolated archived-cache copies with no original VCR. Verify known-channel preservation, lap seams, official timing, four-corner interpolation, pit/garage behavior, traffic rebuilds and migration restartability.
7. Run paired large-replay ingestion and endpoint benchmarks, appropriate tests and the full build. Accept only with evidence for elapsed ingestion, time until native/fused views are usable, peak worker/main memory, main-loop delay, full DB size, WAL/temp peak, cold/warm read latency and correct outputs.

No numerical saving is promised by this source audit. Existing import timings and endpoint reports are historical baselines, not fresh measurements of the proposed format.
