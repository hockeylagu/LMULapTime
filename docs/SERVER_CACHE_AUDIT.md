# Server cache audit

Reviewed 2026-10-10. Scope: server caches, shared server-side indexes, and their SQLite alternatives.
Client loader/hook state, SQLite's own page cache and transient per-calculation maps are excluded.

## Read-only local measurements

Five sequential runs per operation with `better-sqlite3`, median wall time. No scans, migrations,
writes or network requests. OS/SQLite pages warm during runs. These are query/materialization
timings, not end-to-end startup or memory measurements.

| Operation | Rows | Median ms |
|---|---:|---:|
| Session `data_json` rows without parsing | 992 | 189.22 |
| Session rows plus JSON parsing | 992 | 747.26 |
| Session `metadata_json` rows plus JSON parsing | 992 | 43.44 |
| Replay `metadata_br` rows without decoding | 388 | 0.90 |
| Replay metadata plus Brotli and JSON decoding | 388 | 19.08 |
| Telemetry metadata rows | 153 | 7.42 |
| Benchmark rows without JSON reconstruction | 198 | 0.32 |

Sessions are plain JSON; replay metadata and trajectories are compressed. SQLite reads can be
fast while materializing whole histories is expensive. Simply deleting the session memory cache
would have repeated ~747 ms of work with the previous APIs. The implemented compact projections,
indexed detail reads and SQL aggregates remove that whole-history dependency. Benchmark timing
excludes rebuilding its latest diff.

## Every retained result cache/index

| Owner / data | Usage and lifetime | Decision versus direct SQLite |
|---|---|---|
| Replay matching candidates | SQLite queries indexed end/start windows for one session, with exact lookup for a linked name | **No server history index.** Compact persisted matching facts avoid loading all compressed metadata; standalone/offline parsers may index an explicitly supplied directory. |
| `benchmarks/referenceLaptimes.ts`: `cachedData` | Hot per-lap/driver benchmark lookup; lazy load, replaced on refresh; worker gets a snapshot | **Keep.** Reconstructing the whole benchmark set per lap is unnecessary. Indexed single-entry SQL is the alternative. Workers deliberately avoid main SQLite. |
| `telemetry/telemetryCatalog.ts`: scan-local file-version map | Loaded from SQLite only when a scan starts; released after settlement | **Keep operation-scoped.** Reuses only matching mtime/size without enrichment errors. Completed metadata/listings belong to SQLite; status uses a SQL count. |
| `plugins/dataPlugin.ts`: tracks/display, vehicles, logos | Validated immutable package snapshot, eagerly loaded | **Keep as source snapshot.** Files are not in SQLite; adding them creates another persistence layer. Measure package validation separately before changing startup. |
| `shared/domain/vehicleMapping.ts`: `VEHICLE_FILES` | Model/class alias index from package; reset by `setVehicleCatalog` | **Keep.** Small derived identity lookup, not a full catalog copy. SQL adds a table and per-driver queries. |
| `tracks/trackGeometryStore.ts`: `cache` | Lazy derived centerline spatial index with references to plugin geometry | **Keep.** SQL cannot replace constructing the spatial index. File-backed mode checks stamps; provider mode shares frozen geometry arrays without copying raw geometry or display data. |
| `telemetry/telemetryLinks.ts`: availability and ownership maps | Operation-scoped loaded links and file-existence memoization | **Keep operation-scoped.** SQL rows are already read directly. Disk existence still needs filesystem access; these are not process-wide availability caches. |
| `telemetry/duckdbReader.ts`: `cachedTables` | Schema table list per open reader; discarded on close | **Keep reader-scoped.** Avoids repeated DuckDB schema queries; SQLite does not own that schema. |
| `traffic/racePositions.ts`: `lapStartCache` | Derived lap-start arrays for repeated traffic calculations | **Keep.** WeakMap keys allow collection with positions. SQL queries per sample would be inappropriate. |

No TTL/LRU result caches were found in this server inventory. Remaining data scales with loaded
file identities/layouts/catalogs or is collected with its owner. Detailed sessions are hydrated only
for a requested detail/page or a bounded ingestion batch. Eager package data still deserves profiling.

## Removed redundant caches

- **`core/db.ts`: `allSessionsCache` and `ServerContext.loadSessions()` removed.** Session pages query
  compact persisted projections; detail reads fetch one source row by ID. Startup telemetry ownership
  reconciliation reads ten detailed sessions per turn and delays replay-only fallback until those session
  candidates have been considered. Full-history reads are available only through the explicit streamed
  iterator used by ingestion and reconciliation.
- **`ServerContext.enrichedInputs`: removed.** Linking runs during ingestion and background reconciliation;
  ordinary reads have no enrichment side effects or shared mutable session snapshot.
- **Leaderboard `layoutsFor` snapshot memo: removed.** Ribbon layouts and ranks now query persisted
  condition summaries and lap facts, without retaining a session-array identity.
- **`xmlMtimeCache`: removed.** Replay matching reads ingestion's persisted `file_mtime` by ID/path;
  only missing stored values fall back to stat, without retaining either successes or failures.
- **`replayMatchCheckedAt`: removed.** Reconciliation validates current session metadata every time;
  reparses and failed reads cannot be hidden by a previously checked replay revision.
- **`TelemetryCatalog.files`: removed.** Constructor does not hydrate metadata. Reads use SQLite;
  completed scans release their version map. Listings include retained metadata for deleted files,
  and clearing scan state does not discard authoritative rows.
- **Duplicate plugin geometry: removed.** Internal `trackGeometry()` returns the deeply frozen
  geometry owned by the plugin. Spatial definitions share its arrays; public snapshots remain copies.

- **`tracks/trackOutline.ts` and `outlineCache`: removed.** The only production caller was the
  leaderboard ribbon endpoint. All 32 known layouts have bundled SVGs. The ribbon now uses
  `getTrackOutlineUrl`, canonical layout resolution, and an image-error fallback. The endpoint
  no longer sends `outlinePath` or loads metric geometry for thumbnails. The SVG illustrations
  remain useful; the duplicate runtime generator does not.
- **`telemetryMatcher.ts` global `duckDbMetadataCache`: removed.** It duplicated catalog metadata
  with only a path key, no version invalidation or eviction. Replaced/locked recordings could
  inherit stale identity. Discovery now uses filename/stat facts; the existing catalog supplies
  enriched metadata only after mtime/size/error checks.

## Pending work and resources

`ReplayRecordingService.pendingDecodes`, `RaceTrafficService.building`, `aiReport.inFlight` and
`TelemetryCatalog.refreshPromise` share active work and clear when it settles. Keep them: SQLite
does not stop concurrent requests starting the same expensive missing-data job.
`ServerContext.replayJobs`, scan and upgrade status describe work, not cached results. Worker
references and the default SQLite connection are resources.

`ReplayCacheService` is now **`ReplayRecordingService`** (file, class, consumers and tests). It serves
retained recordings, resolves drivers, runs missing decodes in workers and persists them. Completed
metadata/trajectories live in SQLite, including recordings LMU has deleted.

## Persistent SQLite data

| Group | Why retain it |
|---|---|
| Sessions | Parsed XML history and classifications; deleted XML history survives. `sessionSummaries` adds compact card metadata, per-driver/per-condition aggregates and lap facts, maintained in the same transaction as source writes. |
| Shared session aggregates | `session_summary_facts` stores one compact row per session/current player, reusing classified driver/lap projections. Dashboard sums and ranks these scalar facts directly; no process-wide result cache. Projection version 3 backfills retained source JSON in bounded batches. |
| Replay metadata/trajectories/facts/laps/conditions/events/order/positions | Avoids huge VCR reads/decodes and may be the only remaining copy. Identity/file/decoder-version checks remain mandatory. |
| Telemetry metadata and laps | Ownership and expensive DuckDB reads; file/cache versions govern reuse. |
| Benchmarks and update history | Offline targets and their history; explicit/stale-startup refresh updates them. |
| AI reports | Avoids paid/network generation for identical evidence and prompt version. |
| Metadata, ingest outcomes, rejected links, trajectory defaults | Migration/retry/integrity bookkeeping, not optional result caches. |
| Rival targets | User state, never discarded with cache cleanup. |

## Write-once XML simplification

Completed results XMLs are immutable at their paths (AGENTS.md and XML_FORMAT.md). Ordinary scans
load stored paths/IDs and skip known successful files before stat/parsing; they no longer read or
compare every stored mtime/size. New files, previous failures, parser upgrades and explicit force
reparses still read attributes and parse. Deleted XML sessions survive. Replay matching uses
persisted mtimes; missing values fall back to disk and failed reads retry. This assumption never applies to filename-reusing
VCRs or growing DuckDB recordings.

Next useful optimization: migrate any future session consumer to compact pages or the streamed iterator.
Startup telemetry ownership reconciliation is already bounded to ten detailed sessions at a time. Measure
package validation separately. Do not infer end-to-end startup wins from query timings alone.

The implementation and measurements are detailed in [Persisted session summaries](plans/PERSISTED_SESSION_SUMMARIES.md).

## Second pass after the session-summary migration

Rechecked declarations, readers and invalidation on 2026-10-10. This pass also includes shared
browser caches; ordinary component state and `useMemo` calculations are not retained-history caches.
Findings below are source observations, not new memory or startup measurements. The subsequent
user-authorized removal of four caches is recorded above; the original findings below explain why.

### Highest-value simplifications

1. **XML end timestamps can come from SQLite.** `SessionReplayLinks.xmlMtimeCache` grows with
   successful paths and repeats filesystem reads after every restart, although ingestion already
   persists `sessions.file_mtime`. Provide a narrow stored-timestamp lookup, with stat only when no
   usable stored value exists. Preserve retries for missing/failed reads and explicit reparses.
   This removes the normal need for a second process-wide timestamp map under write-once XML.
2. **Replay validation memo has incomplete invalidation.** `replayMatchCheckedAt` is keyed only by
   session ID and parser replay revision. It is not cleared by the session-cache clear endpoint,
   and source reparses can reuse an ID at the same replay revision. More directly, the code records
   the revision before checking that replay metadata and XML mtime are available: a failed stat is
   therefore not retried for an existing link at that revision. Mark only completed validations,
   and either include session source revision or scope the memo to reconciliation. The map retains
   one entry per checked session; it has no per-session deletion hook.
3. **Replay matching index is still history-sized.** `LmuParser.replaysMap` retains replay matching
   entries and is populated from all stored compressed metadata at startup. It is an array despite
   its name: each `addReplayEntry` uses `findIndex`, so bulk insertion does quadratic name searches;
   matching also traverses candidates. A keyed map is a straightforward intermediate improvement.
   A compact indexed SQLite matching projection could remove eager blob reconstruction and the
   long-lived index, while preserving archives, layout/time validation and ownership rules.
4. **Telemetry catalog duplicates persistent metadata.** `TelemetryCatalog.files` is eagerly loaded
   from SQLite and retains every file's metadata. It is useful during discovery but ordinary
   session telemetry now uses scoped SQL. Reduce the catalog to scan status and an operation-scoped
   file-version lookup; let the `/telemetry` listing read compact paged SQL. Its current `publish`
   filters/copies the full file array for each publication, adding quadratic scan work.
   Separately, every ten-session ownership batch calls `getTelemetryFiles()` and
   `getTelemetryMetadata()` again. With 10k sessions this means about 1,000 full telemetry-catalog
   reads. Reuse a reconciliation-scoped catalog snapshot and update ownership as batches commit,
   or query only unowned candidate files. Do not introduce another process-wide metadata cache.
5. **Geometry has two server owners.** `DataPlugin` eagerly validates and retains all geometry and
   display assets before the server listens. `TrackGeometryStore` calls `dataPlugin.track()`, which
   deep-clones geometry AND display; it discards display but retains the cloned geometry with its
   derived spatial index. Keep the spatial index, but provide a geometry-only internal immutable
   view to avoid cloning/retaining another full definition. Lazy package resource loading is a
   separate startup optimization requiring the existing package-validation guarantees to survive.

### Retain these caches and work guards

| State | Reason and remaining caveat |
|---|---|
| Server benchmark `cachedData` and worker snapshot | Small repeated lookup used per lap; keep. Refresh replaces it. Direct `SessionDatabase.saveReferenceLaptimes`/`clearReferenceLaptimes` bypass memory invalidation, so future writers must use one coordinated update path. |
| Vehicle alias map | Small immutable derived identity index; keep. Rebuilt by `setVehicleCatalog`. |
| Track spatial indexes | Expensive derived search structure, bounded by layouts rather than session history; keep. Avoid duplicate raw geometry ownership. |
| DuckDB reader table list | Lives only as long as its reader; keep. It does not duplicate telemetry samples. |
| Traffic lap-start WeakMap | Derived array tied to `DriverPositions` lifetime; keep. No permanent history retention. |
| Replay/traffic/AI pending promises | Deduplicate concurrent expensive work and delete on settlement; keep. Their purpose is coordination, not completed-result reuse. |
| Comparison hydrated-session map | Local to one request, bounded by page plus three special locators; keep to avoid parsing the same detail multiple times. |
| `ServerContext.replayJobs` | Latest scan status, cleared at the next replay scan; not a decoded-recording cache. Size still follows scanned replay count. |

### Browser caches

| Cache | Assessment |
|---|---|
| Benchmark loader (`referenceApi.ts`) | Keep one shared table/promise. Manual and startup refresh invalidation is wired. Failed loads retry. |
| Track geometry (`useTrackBoundaryGeometry.ts`) | Keep: explicit LRU maximum of three geometries, keyed by layout and supplied package revision; in-flight requests clear on settlement. Callers omitting revision use the constant `startup`, so they cannot notice a package change without a page reload. |
| Vehicle logos (`vehicleLogosApi.ts`) | Keep shared small lookup and 60-second failure cooldown. Server instance and package revision from `/status` invalidate the shared source fingerprint across app-hook remounts; mounted consumers reload even while an older request is pending. Generations prevent obsolete responses from restoring stale logos. |
| Demo anonymizer name maps | Stable pseudonym state for demo mode, not a performance cache. Grows with distinct demo names for the page lifetime; reverse mapping can collide because a fixed pseudonym list is reused. No SQLite replacement is warranted. |

Completed: removed replay-validation memo, XML timestamp map, persistent telemetry array and copied
plugin geometry. The final cleanup below completes replay matching, reconciliation reads and logo invalidation.
Verification: full suite 2379 passed / 56 skipped, clean production build, and unchanged coverage
thresholds passed with two workers (94.03% lines, 82.86% branches). Regression cases cover deleted
XML timestamps, same-revision validation retries/reparses, database-owned telemetry metadata and
shared deeply frozen geometry with defensive public snapshots.
Removing small benchmark/alias caches or work guards would add repeated work without addressing
the measured dashboard/comparison SQL bottlenecks.

## Final cleanup

- The server parser no longer receives all stored replays at construction, sync or worker dispatch.
  `replay_metadata` holds versioned compact matching JSON and recording-start time. Candidate reads
  use end/start indexes and the existing deterministic layout/type/time rules; exact linked-recording
  reads preserve validation and archive names. Metadata upserts publish matching facts atomically.
  Existing rows undergo a one-time additive rebuild from retained metadata in 50-row transactions;
  source VCRs are not needed. The migration is synchronous but does not retain full history in memory.
- Telemetry ownership reconciliation reads catalog metadata once, shares it across ten-session
  batches, and updates its ownership entries after each committed link. Availability reads use
  session-scoped SQL. A compact replay list is read only for the final fallback phase, released with
  the reconciliation. No new process-wide cache was introduced.
- Browser logos track a shared server/package fingerprint and cache generation. Identity changes
  clear successes, empty tables and failure cooldowns, wake mounted consumers, and discard stale
  in-flight responses. This also works across app-hook remounts and while a previous load is pending.

The original second-pass findings above are historical rationale; these three cleanup items are
implemented. Dashboard/comparison aggregation remains per-request SQL and is a separate performance task.

The subsequent shared-session aggregate change moves dashboard contributions into
`session_summary_facts` at ingestion/update time. Global sums/ranking remain SQL over compact rows;
benchmark percentages still use current targets. The synthetic 10k-session dashboard query took
49.5 ms in one observational run, versus the earlier 304–313 ms. Comparison candidate optimization
and telemetry preparation remain separate work. See the updated persisted-summary plan for details.

Final verification: 2387 tests passed / 56 skipped, clean production build, and unchanged coverage
thresholds passed with two workers (94.05% lines, 91.71% statements, 91.88% functions,
82.91% branches). Regression cases cover indexed matching, archived identity, legacy projection
migration, catalog reuse across 25 sessions, mounted logo consumers and stale in-flight responses.
