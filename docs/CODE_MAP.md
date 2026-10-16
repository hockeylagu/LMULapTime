# Code Map: where things live and how they flow

A fast index for new sessions: find the right file without searching. `AGENTS.md` holds the rules;
this file holds the **routes through the code**. Keep it current (see "Keeping this file current" at the end).

Canonical domain contracts live in `shared/types/`; `shared/types/index.ts` is the approved barrel.
Import server telemetry reader contracts directly from `server/telemetry/duckdbTypes.ts`.
Local contracts also have independent owners: replay storage facts in `server/core/replay/replayStorageTypes.ts`,
decode options in `server/replay/decode/replayTrajectoryTypes.ts`, telemetry chart results in
`src/components/replay/telemetry/telemetryChartTypes.ts`, and map marker coordinates in
`src/components/replay/map/gpsTrackMapTypes.ts`. Import these definitions directly to avoid cycles through their consumers.
The type cleanup is tracked in [the archived type refactoring plan](plans/archive/TYPE_REFACTORING_PLAN.md), and its
Phase 6 naming table.

Last checked 2026-10-12 after the type refactoring follow-ups (main `25d1e988`): 476 TypeScript source files
in src/server/shared, 305 test suites (300 passed, 5 skipped), 2663 tests (2607 passed, 56 skipped); the
production build passed without warnings or errors. Coverage was last measured before those follow-ups:
94.68% lines, 92.41% statements, 92.64% functions and 83.77% branches. Branch/worktree results are separate;
see [plans](plans/README.md).

---

## 1. The three data sources and where each enters

| Source | Files on disk | Ingest entry | Stored in (SQLite, `server/lmu_cache.db`) |
|---|---|---|---|
| XML results log | `UserData/LOG/Results/*.xml` | `server/core/dbSessionSync.ts` → `LmuParser.parseSessionXml` (`server/sessions/parser.ts`) | `sessions` (58 scalar columns, legacy JSON columns removed in Phase 3) and its rows: `session_recordings`, `session_drivers`, `session_laps`, `session_lap_passes`, `session_events`, with the dictionaries `drivers`, `vehicles`, `teams` |
| Binary replay | `UserData/Replays/*.Vcr` | `server/core/replay/dbReplaySync.ts` → worker (`server/replay/worker/replayTrajectoryWorker*.ts`) → `replayTrajectory.ts` → `replayFacts.ts` | `replay_metadata`, `replay_trajectories`, `replay_facts`, `replay_laps`, `replay_conditions`, `replay_driver_events`, `replay_running_order`, `replay_race_positions` |
| DuckDB 100 Hz telemetry | `UserData/Telemetry/*.duckdb` | `server/telemetry/telemetryCatalog.ts` → `duckdbReader.ts` | `telemetry_metadata`, `telemetry_lap_cache` |

Other tables: `reference_laptimes` (benchmarks), `ai_reports`, `rival_targets` (user state, never cleared),
`cache_metadata`, `ingest_errors`, `replay_ingest_drivers`, `rejected_replay_links`, `replay_trajectory_defaults`.
DDL is coordinated by `server/core/dbSchema.ts`; additive session projection tables and indexes
live in `server/core/sessionSummaries/schema.ts` and `aggregateStore.ts`, and replay matching columns/indexes in
`server/core/replay/replayMatchingSchema.ts`. Cache versions and JSON compression live in the independent
`server/core/dbCache.ts`; stores and codecs import them directly without depending on schema initialization.
Normalized session rows (`server/core/sessionRows/`, completed plan [NORMALIZED_SESSION_STORAGE](plans/archive/NORMALIZED_SESSION_STORAGE.md)) are the
stored session. JSON columns, temporary conversion tools, verification backfill and its startup gate have been removed.
`specs.ts` declares every stored column once (`fields.ts` helpers); `schema.ts` holds the DDL, extra session scalars and derived-column lists.
`writer.ts` (`writeSessionRows`, `updateDerivedColumns`) writes or updates rows with their projection; `dictionaries.ts` resolves driver names, vehicles and teams.
`reader.ts` (`readSession`, `sessionScalars`, `driverScalars`, `recordingLink`) assembles the `DetailedSession`; callers import `readSession` directly.
`access.ts` exposes `loadSessions` (ordered reads of existing ids), `readStoredLinkState` (link and DuckDB file from two small row reads), and `sameReplayLink`.
`targeted.ts` implements granular replay link, rename, telemetry and conditions updates. Ingestion writes rows transactionally with the source and aggregates;
write failures propagate so the transaction rolls back. `canonical.ts` defines round-trip expectations for regression tests and the shared
`sessionTelemetry` / `withSessionTelemetry` attachment helpers; `stub.ts` inserts a bare session for tests and tools.
Future table schema changes receive a migration when needed; there is no row-version rebuild from deleted JSON.

**Dictionaries**: `drivers` is keyed by the exact name (never merged by case or spacing; player and human flags belong to the session's driver row),
`vehicles` by raw XML car type and class, `teams` by name; an absent value is a NULL id. They are emptied with the session cache and never pruned.

Benchmark rating uses `createBenchmarkLookup` (`shared/domain/paceCategory.ts`) to resolve benchmark layouts once per batch,
and `createPaceCalculator` (`server/benchmarks/referenceLaptimes.ts`) to reuse target matches within a read.
`calculateBenchmarkPace` (`shared/domain/paceCategory.ts`) owns percentage/delta rounding and category selection;
detail, card, comparison and dashboard trend ratings consume it. Dashboard history aggregates retain bounded SQL
calculation and ranking, using the same two-decimal percentage and shared category bands.
Session lap rating and paginated cards share these batch lookups; dashboard trends use the same indexed snapshot while retaining
strict class matching, and dashboard cards are rated once. Track cards compute pace once per card and reuse it for sorting and rendering.
These lookups are scoped to the batch/view inputs and recreated with refreshed benchmarks; no persistent target cache or cache-version bump is needed.
**Derived columns** live on `session_drivers` (`is_human`, `driver_class`, counted `laps_count` / `pit_stops_count`, `clean_laps_count`,
`driving_time_seconds`, `max_top_speed`, `best_lap_ordinal`, `top3_average`, `consistency_score`) and `session_laps` (condition group,
clean/representative/human/leaderboard flags, with partial indexes). The derived columns repeat no raw fact: `is_player`, `best_lap_number`,
`best_lap_wet` (NULL is not wet) and `avg_lap_time` exist once, and XML-declared figures are `declared_laps_count` / `declared_pit_stops_count`.
Raw columns retain XML values such as `lap_number` and `is_pit_stop`. Files carry `file_mtime_ms` and `file_size_bytes` on every table.
**DuckDB file**: the main attachment lives on `sessions.duckdb_filename` only (there is no `has_duckdb_telemetry` flag or replay-link mirror).
A driver's events are stored once, on the driver (`session_events`, one row per event, each with its `lap_number`); a lap's events are derived with
`lapEvents(driver, lapNumber)` (`shared/domain/lapComparison.ts`), and the incident / track-limit / penalty counts are the list lengths.
`session_drivers.lists_mask` distinguishes an empty event array from an absent one. Times are stored as numbers only; the UI formats them
with `shared/domain/formatters.ts` (`formatTime`, `formatElapsedSeconds`, `formatPitStopDuration`).

The telemetry comparison picker requests `telemetryOnly=true` on `/api/compare/laps`: linked replay and flying-lap filters run before pagination. With it, `sort` (`lap` default, `recent`, `driver`), `sessionType` (`practice`/`quali`/`race`) and `condition` (`Dry`/`Wet`/`Dynamic Weather`) also run before pagination (shared definitions in `shared/domain/compareLapScope.ts`), and the response lists `carTypes` of the scope ignoring the car filter; the picker state lives in `useReplayInspectorData`.
That request uses `queryTelemetryComparableLaps` in `comparisonQueries.ts`: direct SQL reads of the visible lap rows,
identity/display fields and best-lap badges, without full session hydration, benchmark rating or unused summary aggregates.
The general leaderboard comparison response retains its summaries. Both paths share filter and personal-best scope rules.
Personal-best (gold) badges mark each driver's fastest valid lap of the layout and class: any car, any condition, with or without a replay; car, recording, session and lap filters only narrow the displayed rows. Gold marks the personal best, while blue marks a session best. They are ranked from each session's stored driver best (`session_drivers.best_lap_ordinal` / `best_lap_time`), one row per driver and session.
`comparisonLapRows.ts` reads the general response's selected page and up to three best-lap locators in one query,
deduplicates those locators, and rates only those laps against current benchmarks. It never hydrates full sessions,
driver histories or events. Equivalent representative/player-best queries share their result when the scopes match.
Read-only checks on 2026-10-10 matched all response fields across 12 saved cases (three layouts, player/all-driver scopes,
two pages). Bahrain LMP3's first 50 player laps read 52 lap rows instead of 1,032 laps across 11 sessions;
warm backend time fell from 36.7 to 17.1 ms, and Road Atlanta LMGT3 from 17.5 to 8.3 ms.
On 2026-10-10 the Road Atlanta GT3 default picker measured about 4 ms versus 19 ms previously (992 stored sessions),
with zero full session reads and a 32 KB response instead of 58 KB; these are local backend measurements.
The Compare page (`useCompareLapsData.ts`) takes its personal best (`playerBestLap`) and all-time best (`overallTrackBestLap`) only from the server's exact bests, for both the default selection and the preset buttons; with none, the lap and its button are absent, never the fastest lap of the current 50-lap page. Theoretical-best pace comes only from the benchmark target.
The replay inspector's reference-lap suggestion (`compare/useReferenceLapSuggestion.ts`) is one request: `pageSize=1` with the roster `carType`, `driverExact=true` (whole-name match through `comparisonScope`) and `excludeSessionId` / `excludeLapOrdinal` (the lap on screen); the telemetry picker's `carTypes` list is returned on page 1 only and the client keeps it, and the client no longer re-filters the server's `telemetryOnly` page.
Inspector state, comparison selection and reference suggestions use session IDs exclusively; recording filenames never substitute for session identity.
`ReplayTrajectoryService` accepts session context plus driver/lap ordinals and resolves its recording internally; legacy filename/slot request parameters and unused request types are removed.
`server/core/sessionRows/replayContext.ts` reads only the roster, replay link and compact official timing fields:
metadata requests include every lap's source ordinal; trajectories include the selected and primary driver's timing histories;
traffic requests include no XML laps. `ReplaySessionContext` / `ReplayContextDriver` / `ReplayTimingLap` in
`replayServiceTypes.ts` define those inputs without full session, event or pass hydration. Official validation output stays unchanged.
Session detail and PB reads use exact stored session IDs; filenames remain file metadata and are never aliases.
Session detail selects drivers by source ordinal; replay requests require an explicit recorded slot or a
unique exact roster mapping. Unresolved requests never select the first driver. The PB endpoint uses
the selected row's exact dictionary identity rather than reconstructing ownership from history names.
Canonical session types control filtering and weekend grouping; display names do not override them.
Known layouts compare canonical keys, while custom layouts retain exact venue/course pairs through
filters, track links and comparison requests. Benchmark matching has no substring fallback.
Replay-link updates return only whether they changed; the necessary conditions reclassification performs the single session read.
The 2026-10-10 endpoint sweep (same snapshot/cohort/environment, 20 warm HTTP samples) measured player PB
5.70 → 1.56 ms, replay metadata 5.81 → 2.45 ms, fused telemetry 189.64 → 161.75 ms and traffic
172.66 → 155.65 ms. Response sizes matched; the final sweep had no failures/skips or flagged regressions.
Local reports live under `.cache/endpoint-benchmarks/`; these timings exclude browser rendering and live ingestion.
Map geometry and session thumbnails resolve from canonical layout/venue/course without filename hints.
Session views no longer display recording filenames, and improvement-chart rows no longer carry them.
`/scan/status.sessionReplayJobs` maps ingestion/upgrade work to stored session owners on the server;
launch buttons and indicators use only session IDs. File-based diagnostics remain in Settings.
AI evidence and `ai_reports` identify both laps by session ID and driver/lap ordinals.
`dbSchema.ts` defines the current local cache structure directly; obsolete AI-report, telemetry-cache,
trajectory-source and decode-attempt schema upgrades have been removed after verifying the LMU cache.
Reports already retained with null locators remain readable; history labels these as previous reports.
Same-session tabs send `sessionId`; the picker loads 50 laps per page, with `compare/CompareLapPagination.tsx` exposing previous/next navigation.
DuckDB cache clearing and ownership-rule resets invalidate the session attachment columns transactionally, so sessions that lose ownership stop advertising old files.

Session-scoped telemetry reads use `idx_telemetry_session` and load only that owner's metadata and cached filenames.

Session list projections are maintained transactionally by `server/core/sessionSummaries/store.ts`:
a session card (`SessionCard`) is built from columns by `cards.ts` (`readSessionCards`: the `sessions` row, the replay link, the player's driver row with its dictionaries; no JSON,
no `json_extract`); `session_driver_condition_summaries` contains per-driver aggregates and the per-driver/per-lap
derived facts are columns of `session_drivers` / `session_laps` (see above); `session_summary_facts` holds one compact scalar row per session with the current player's
completed/declared/clean laps, driving time, distance, pit count, speed, position, pace inputs,
and session date/layout. `buildSessionAggregate.ts` reuses the driver/lap projections; it does not
reclassify laps. `aggregateStore.ts` writes those facts inside the same source/projection transaction.
The 2026-10-11 shared-domain cleanup makes `buildSessionSummaryProjection.ts` select clean laps once per driver,
reuse the selection for consistency and top-N metrics, reuse the consistency average, and check membership with a Set.
Driver, lap and condition projection arrays are assembled once; consistency appends to local condition arrays.
Projection consumers import its defining module directly. Circuit constants/types come from `circuitDefinitions.ts`,
and every layout resolution calls `getCircuitSpecification` in `circuitSpecs.ts` directly.
Leaderboard sector and top-three pace rankings map each sorted value to its first rank, preserving competition ties
without scanning the sorted list for every entry. `findWeekendSessions` derives the current session's layout/event/timing
once and selects the nearest session of each type during one traversal, retaining only the best candidates;
`aggregateTrackSummaries` honors class filtering and the explicit empty-venue option in one pass.
Same-car rival comparison computes class rivals only as a fallback. The scalar and indexed lap-class position APIs
share the ranking rule while retaining the indexed API's reusable peer index.
Dashboard metrics/trends scan these rows, not card JSON or detailed lap history; track queries
reuse the stored timestamp/sectors/length and progression reads the stored date. Benchmarks remain
current-target calculations. Failed projections retain a zero-player fact row for session counts.
The layout, session kind, primary driver ordinal,
empty flag, source/projection revisions and projection version live on `sessions`. Rebuild old rows
through `readSession` in bounded batches (`backfillSessionSummaries`); never load full history to backfill.
`persistSessionProjection` is the only writer of the derived columns (cards are built directly from columns), so a current projection always has its card.
A session whose summaries cannot be built is marked done with `projection_error`, its condition summaries and derived columns cleared, and a
card without player figures, so one bad row never holds the rebuild. Readiness (`isSessionSummaryReady`)
reads the covering `idx_sessions_ready` index (projection version and source/projection revisions).
While derived summaries rebuild, `server/routes/summaryReadiness.ts` answers 503 on history paths only
(lists, dashboard, tracks, boards, comparisons); routers share `/api`, so it is mounted per path, never router-wide.
Projection version 4 (`shared/types/sessionSummaries.ts`) rebuilds these shared facts onto the merged tables from the stored
rows in bounded batches. Source updates and replay
rain reclassification replace the affected contribution atomically. Declared lap count remains
separate from completed lap count. Partial valid/eligible lap-time indexes support bounded
comparison personal-best lookups. Bump the projection version when changing stored aggregate rules.
Do not add an index that leads with `driver_class` or `driver_id` on `session_drivers`: the planner then starts the leaderboard from every driver of the
class (measured 520 ms against 5 ms starting from the layout). The sessions of a layout are found through `idx_sessions_layout_timestamp`, then their drivers by primary key.
Historical JSON columns (`data_json`, `metadata_json`, `summary_json`) were dropped in Phase 3b/3c. Fresh and rewritten databases have no `normalized_version` column.

**Replays are the source of truth once cached**: LMU deletes old `.Vcr` files, and their rows are the only copy. Never write
code that drops replay rows because the file is gone.

DuckDB ownership (`server/telemetry/telemetryLinks.ts`, `TELEMETRY_LINK_RULE = session-span-exact-identity-player-v5`) uses
session spans. Restarted offline races can share their XML start timestamp; ties go to the earliest
session still running when recording begins, before end-time slack, so the empty attempt does not
claim the restarted race's files. Changing this rule recalculates stored links once, retaining telemetry caches.
An exact official venue name in native telemetry is layout-unspecified: ownership uses the session's
course or the replay's course/native scene, together with the existing driver, type and time checks.
Explicit telemetry layout names/keys/scenes must match the owner's layout; different venues never match.
The Bahrain Paddock regression covers both recordings from a session whose DuckDB names contain only the venue.
Venue-only telemetry is left unmatched when eligible owners disagree on layout. Named recordings
require a unique exact trusted player match. Replay ownership is repaired from retained metadata once
per configured player identity; explicit slot trajectories survive, while legacy unresolved defaults
are invalidated once. Replay matching facts version 2 retains the custom venue/course tuple.

The route loader keeps its suspended component separate from the preloaded fast path, so resolving a page chunk never skips a previously suspended `use()` call.

### Background orchestration
Client freshness is coordinated in `src/api/useAppData.ts`. It polls while sessions, replays,
telemetry, upgrades or the startup benchmark check are active. `/scan/status` exposes a process-scoped
`dataRevision` from DB session/replay/telemetry revisions; completion timestamps catch fast scans.
Changed revisions reload status counts; route loaders fetch their own bounded pages and aggregates.
`/status` includes server instance identity and data-plugin revision. Their shared logo-source
fingerprint invalidates browser logos, notifies mounted consumers and rejects stale in-flight results.
The combined `/session-snapshot` endpoint is removed. `sessionDataContext.ts` refreshes
open track/session details and lets `common/replay/ReplayIndicator` show the current replay's processing spinner.
Recovered scan-status polling errors clear independently of route data or manual-refresh errors.
API JSON requests use `no-store`; detailed geometry comes from the local package API. Session detail retains
only mounted same-session data during a revision refresh; switching IDs or remounting fetches fresh.
Refreshes during a scan are coalesced into one follow-up
XML scan (preserving a requested force reparse), followed by replay and DuckDB scans.
`server/core/ingest/fileIngestWorker*.ts` parses XML and replay metadata in a reused worker. XML returns unrated session facts, without benchmark snapshots or SQLite access in the worker. Standalone XML parsing has the same contract; compose displayed pace with the read-time rating functions. A worker that dies fails only the file it was reading (XML is then read on the main thread) and the next file starts a new worker.
Every worker client (ingest, replay decode, race positions) reads its port through `isWorkerMessage` (`replayTrajectoryWorkerClient.ts`): under `npm run dev`
(`node --watch`) tsx posts `{ 'watch:import': [...] }` on every worker port, which was once read as an empty answer and lost new sessions and replays.
XML publishes ten-session transactions before proceeding; cached sessions whose XML is gone survive.
Results XMLs are assumed write-once at their paths (`XML_FORMAT.md`): ordinary scans skip stored
successful paths before stat/parsing. A new file that changed while it was read is not stored and is retried
as a failed read. A reparse keeps the stored replay link and DuckDB file (`restoreStoredSessionLinks`). Parser upgrades, explicit force reparses and failed reads
are the exceptions. Replay matching reads stored XML `mtimeMs` values from SQLite; missing values fall back
to disk and failed reads retry. Validation runs during reconciliation without a per-session memo.
Each batch reapplies lap conditions before persistence. Benchmark pace is calculated only at read time,
so delayed worker results cannot restore obsolete ratings; stored best-lap conditions exclude wet bests.
Replay discovery finishes and reconciles links in ten-session batches, yielding with
`setImmediate` and keeping `/scan/status` incomplete through replay-link and DuckDB ownership
reconciliation, before decoding associated recordings. Reconciliation is bounded by change stamps
(`server/core/dbReconciliationStore.ts`): replay links re-check sessions written, or near replays stored,
since `replay_links_reconciled_at`; DuckDB ownership loads only matching session scalars, driver names and replay names
through `dbReconciliationStore.getTelemetrySessionCandidatesStartingBetween`, plus replays in each new file's
time window, and stores the owner's main file by session ID without hydrating its history. XML end time still uses
`SessionReplayLinks.xmlMtime` (persisted ingestion time, disk fallback). A replay sync asked for while links reconcile
runs once they finish; per-replay
jobs expose queued/processing/ready/failed states and whether a failed decode still has a playable primary trajectory. Launch actions remain available for playable cached data or DuckDB telemetry and report partial failures.
Async replay scans report monotonic file progress directly in `server/core/replay/dbReplaySync.ts`,
including driver caching before completion.
The worker reports its primary slot before stream decoding, so that driver's work is counted once from the start.
Driver decode outcomes (`replay_ingest_drivers`, `dbReplayIngestStore.ts`): `failed` when the decoder rejects the file
(`ReplayDecodeError`, `server/replay/decode/replayDecodeError.ts`), `interrupted` for a worker exit, server shutdown, locked file or
storage error. Either is retried, and settles (shown as failed) after `MAX_DECODE_ATTEMPTS` failures in a row on one file version;
until then the replay job shows as queued. Only a manual refresh (`POST /api/scan` → `runSessionSyncInBackground(false, true)`)
retries settled failures; a server start leaves them alone. Recordings are decoded newest first.

`server/index.ts` builds one `ServerContext` (`server/core/serverContext.ts`), which owns:
- the scan jobs (`runInitialSessionSyncInBackground`, `runReplaySyncInBackground`, `runSessionSyncInBackground`), pumped one step per
  event-loop turn by `server/core/backgroundScan.ts`;
- compact list queries use `SessionDatabase.queryCompactSessions()`; detail endpoints read one session by ID.
  telemetry ownership reconciliation reads the catalog once, takes unowned files in time-ordered chunks
  (at most ten, six hours apart), and decides each chunk against the sessions and replays of its window;
- replay links through `SessionReplayLinks` (`server/sessions/sessionReplayLinks.ts`, rules in `replayMatching.ts`);
- the low-priority replay re-decode (`ReplayUpgradeRunner`).

The cache inventory, direct-SQLite tradeoffs and local read-only measurements are in
[`SERVER_CACHE_AUDIT.md`](SERVER_CACHE_AUDIT.md). The leaderboard ribbon uses bundled SVGs through
`getTrackOutlineUrl`; its former server outline generator/cache and `outlinePath` field are removed.
DuckDB metadata is owned by SQLite. The catalog loads a file-version map only for a scan; status uses
a SQL count, and listings read retained rows directly (including files no longer on disk). `clear()`
resets scan state; explicit `clearTelemetryCache()` deletes persisted data when directories change.
Replay matching's timestamp/revision maps are removed. `DataPlugin.trackGeometry()` supplies frozen
shared geometry to the spatial-index store; public `track()` still returns a defensive snapshot.
The final cache cleanup removes those remaining smells. Server replay matching uses indexed SQLite
end/start candidate ranges and exact recording lookups, without populating a parser history index or
sending it to XML workers. `replay_metadata.matching_json`, `recording_start_ms`, and `matching_version`
store compact matching facts; upserts maintain them atomically. Archive reads use authoritative
renamed identity columns. A one-time migration reads retained compressed metadata in 50-row transaction
batches; ordinary restarts do not decompress history. Standalone/offline parser instances may still
index their explicitly supplied replay directory locally.

---

## 2. Life of a session (XML → screen)

1. **Parse** (`server/sessions/parser.ts`, `parseSessionXml`), in order:
   - raw XML shapes: `sessionXmlTypes.ts`; streaming events (incidents, track limits, penalties, damage): `sessionXmlStream.ts` / `parseStreamEvents`; roster-scoped unique exact normalized names reject partial/ambiguous event owners. Parser version `2.23_exact_stream_event_identity` reparses available XMLs and preserves deleted-source sessions;
   - `parseDriver` → per lap `parseLap`; then `applyLapTiming` (`sessionLapTiming.ts`), in one ordered pass: missing lap times inferred
     (`isInferred`), out-laps marked (`isOutLap`, rule `isCompletedPitStop` in `shared/domain/lapComparison.ts`), pit loss on the in-lap
     (`pitStopDuration`, spans in-lap + out-lap);
   - `annotateLapTraffic` (`shared/domain/raceTraffic.ts`): who was around the car on each lap;
   - `classifySessionLaps` (`server/sessions/sessionLapClassification.ts`): conditions (`shared/domain/lapConditions.ts`), non-representative
     laps (`shared/domain/lapRepresentativeness.ts`), clean-lap average and `bestLapWet` (wet bests are excluded
     from read-time benchmark ratings: the targets are dry laps);
   - car class: `shared/domain/vehicleMapping.ts` (`resolveDriverCarClass`, `mapVehicleIdToClass`); layout: `getCircuitSpecification`;
   - replay match: `findMatchingReplay` (`server/sessions/replayMatching.ts`).
2. **Store**: `dbSessionSync.ts` (holds `DB_PARSER_VERSION`; bumping it re-parses every stored session) → `dbSessionStore.ts`.
3. **Re-classify with rain**: `server/core/dbSessionConditions.ts` runs `classifySessionLaps` again with the replay's rain when a
   session gets its replay or the replay's conditions are stored, and sets the link's peak rain and weather from every stored
   condition (the header scan samples 30 windows and can miss the peak).
   XML parsing and persistence do not rate benchmark pace; benchmark refresh needs no history rewrite or XML reparse.
4. **Serve**: `GET /api/session/:id` (`server/routes/sessionRoutes.ts`) adds, per request and not stored:
   - current benchmark pace via `rateSessionDetail` and bounded history context via `querySessionContext`; history queries a personal best only for a uniquely identified session player. Selecting another driver loads `/api/session/:id/personal-best/:driverOrdinal` through `querySessionPersonalBestById`, reading layout and one driver's identity/class without hydrating the session and retaining only the active result without a per-driver cache. Both PB paths share a layout-first SQL query and strict unknown-layout venue/course scope. Stored telemetry attachments are already read from normalized session rows;
   - pit stop details from replay events (`attachPitServices`, `server/sessions/sessionPitStops.ts`, maths in `shared/domain/pitStops.ts`).
5. **Load in the client**: `src/components/session-detail/useSessionDetailData.ts` (`fetchJson('/api/session/…')`).
6. **Show**: `src/components/session-detail/SessionDetail.tsx`, then:
   - `overview/` (header, session summary: `DriverPerformancePanel` = `BestLapBlock` + `SummaryStat` rows + sectors; the header card holds the `BenchmarkLadder`, conditions), `standings/` (race result row, classification, fuel, rules); the stewards' tally sits under the lap table's heading (`table/SessionLapStewardsLine`), the events themselves on each lap's expanded row;
   - `table/`: clicking a lap row or its number toggles its event details when available; telemetry and comparison use the dedicated action links. The lap table memoizes class ranks and expanded-event sections per session/driver; `shared/domain/lapPlaces.ts` indexes rival lap positions once, and sorting/expansion reuse the prepared entries. The expanded row text comes from `lapDetailSections.ts` (sections), `lapPlaces.ts`
     (class places, the stop a lap belongs to), `SessionLapDetailsRow.tsx` (grouped event debrief, semantic colors and recorded lap/session clocks), `pitStopText.ts` (pit lines per lap), `src/utils/lapTrafficText.ts` (traffic and
     "left out of average" wording);
   - `debrief/`: the on-demand debrief (`loadSessionDebrief.ts` → `/api/compare/laps` + replay trajectories/traffic; ranking in `src/utils/sessionDebrief.ts`). `useSessionDebrief.ts` keeps results only in mounted hook state, clears them on session/driver changes, and refreshes requested results when the session data revision changes; an unavailable result can recover after ingestion settles. It aborts and ignores obsolete requests;
   - `chart/`: the session telemetry chart.
   - `standings/DriverSafetySummary.tsx`: independent contact, track-limit severity and penalty badges in classification, with the full event tooltip preserved.

## 3. Life of a replay lap (VCR → telemetry studio)

- Decode (all in `server/replay/decode/`): `replayParser.ts` (header, driver index, slices; format in `docs/VCR_FORMAT.md`) → `replayTrajectory.ts`
  (`extractReplayTrajectory` / `extractReplayDriverTrajectories`) → shared pose decoder `replayPose.ts` → `replayTrajectoryFinalizer.ts`
  → laps sliced by `replayLapBuilder.ts` / `replayLapPoints.ts` → garage/pit state `garageState.ts`.
- File-backed ingestion runs in `worker/replayTrajectoryWorkerClient.ts` (bootstrap `.mjs`), also used by `ReplayRecordingService` (`replayRecordingService.ts`).
  Sync/upgrades scan pending drivers together once, staging bounded pose chunks in worker-owned SQLite TEMP storage (`replayDriverSamples.ts`).
  They materialize and finalize one driver at a time, encode each lap immediately, then atomically save its existing blobs/facts/defaults/ingest markers
  through `dbReplayDriverStore.ts`. Upgrades preserve the stored default driver even when the configured player changes.
  Single-driver on-demand requests use direct extraction, then read the committed cache. Private `:memory:` test databases use a synchronous fallback.
  Temporary disk and peak-memory costs, first-driver availability and unchanged final DB sizes are measured in [VCR performance analysis](VCR_PERFORMANCE_ANALYSIS.md).
- Driver selection prefers exact normalized names and rejects ambiguous partial matches.
  Native replay trajectories retain their session clock and timing-loop lap start; DuckDB fusion explicitly
  converts that clock to lap time, including early race laps. Older retained rows use their first sample.
  `decode/replayLapClassification.ts` recovers pit flags from retained lap spans, pit events and samples on read;
  matched XML classification takes precedence in `replayTransforms.ts`. Replay consistency uses
  `isCleanReplayLap` (`shared/domain/lapComparison.ts`) to exclude pit, out, invalid and non-representative laps.
  Session telemetry responses list the selected driver's session laps that the replay recorded, retaining invalid laps;
  replay-only segments (no session locator) and session laps the recording missed are left out. Requesting a missed lap
  fails with `ReplayLapNotRecordedError` (404) rather than serving the replay's default lap. Inspector navigation follows this list's actual lap numbers.
  These read-time corrections preserve deleted recordings and require no cache version bump.
- Normalised facts (pure): `replayFacts.ts` → written by `server/core/replay/dbReplayLapStore.ts`
  (`replaceReplayDriverLapFacts`, `replaceReplayWideFacts`; read with `getReplayLaps`, `getReplayConditions`, `getLapConditions`).
- Trajectory blobs: `dbReplayTrajectoryStore.ts` + codec `replayTrajectoryCodec.ts`; downsampling `trajectoryDownsampler.ts`.
  `getReplayLapEdges` reads only selected-row identity and bounded neighbor point objects; modern columnar
  blobs retain full-column garage phase checks, while older blobs keep full compatibility decoding.
  Trajectory operations share one metadata snapshot. Worker saves coordinate per recording version
  across requests/scans/upgrades and recheck stored results after waiting; write eligibility remains transactional.
  Primary selection uses `resolveReplayPrimarySlot` before decoding. A current cached driver can
  become the primary through a source-validated transaction that only updates the alias/ingest state.
  Missing or ambiguous player matches remain unresolved; explicit driver ingestion still proceeds.
  Upgrades preserve an existing resolved primary slot rather than choosing today's configured player.
  An open DuckDB reader shares its lap list, and a session reclassification batch shares replay rain snapshots.
  DuckDB sector lookup advances through ordered lap windows. Numbered/duration selection shares readers
  within one operation; simultaneous cold reads share an in-flight operation by session/file version/lap.
  Connections close after either pass, and completed operations are removed; SQLite remains the lap cache.
  GPS boundary indices are aggregated inside DuckDB using insertion order, followed by a lap-scoped
  timestamp read. Continuous-channel offsets and event-state lookup retain the full-timeline semantics;
  DuckDB still scans for bounds, but JavaScript no longer hydrates every session timestamp.
  Columnar decoding walks each channel once when rebuilding sample objects. Fusion skips its intermediate
  geometry-clearing copy for unannotated native samples; it still creates independent output points.
  Geometry copying checks only the seven wheel-array channels, with a type-checked exhaustive channel map,
  rather than enumerating every scalar on every sample. Stored formats and response resolution are unchanged.
- Geometry preparation copies point scalars and wheel-channel arrays directly, deep-cloning only the smaller metadata tree;
  child laps and timing-line context remain isolated from retained inputs. `trackProjection.ts` reuses a candidate during segment
  searches instead of allocating one per segment. Projection scores, timing-line cuts and point resolution are unchanged.
- Unused API routes were removed: the telemetry file list, standalone progression and rival reads, plugin status/vehicle lists, and the manual replay-upgrade POST. Their benchmark cases and exclusive helpers were removed too. Track detail still uses `queryProgression`, leaderboard/pin responses still resolve rivals, the internal catalog still owns telemetry scans/status, the vehicle catalog still resolves cars, and automatic replay upgrades still run and expose GET status.
- Serving: `GET /api/session/:id/telemetry?driverOrdinal=&lapOrdinal=` (`replayRoutes.ts`) resolves one retained session and follows its stored replay link → `ReplayTrajectoryService` → `ReplayTelemetryService`
  (DuckDB reads only `TelemetryLinks.filesForSession`; replay-owned/unmatched recordings never serve a session request)
  (fuses DuckDB channels, `server/telemetry/telemetryFusion.ts`; native status/weather values take precedence,
  otherwise the current recorded VCR frame supplies discrete flags and weather. This prevents fused laps
  losing known on-track status after the timing-line sample. Fusion runs on request, without changing stored cache shapes)
  → `server/tracks/` (line cut `lapLineCut.ts`, projection
  `trackProjection.ts`, glitches `stationGlitches.ts`, geometry `serverTrackSync.ts`, store `trackGeometryStore.ts`).
- Replay roster cars (`composeReplayMetadata`, `resolveRosterVehicles`): `carType` is the raw name the matched session log stores (unique driver-name match; the raw replay name otherwise), never the data package's model name, so exact car filters and the DB agree ("Genesis GMR001" vs the package's "Genesis GMR-001"). Only `carClass` comes from the data package, resolved by vehicle id.
- Replay serving is session-addressed; filename-based replay list/metadata/trajectory routes are removed.
  Settings retains `/api/replays/cache` and `/api/replays/upgrade` for recording maintenance.
- Traffic: `GET /api/session/:id/traffic` resolves the session's stored replay link → `server/traffic/raceTrafficService.ts` → race positions index
  (`racePositions.ts`, built on a worker by `racePositionsWorkerClient.ts`, stored by `dbRacePositionStore.ts`) → `trafficSpells.ts`.
- Client: `src/api/replayApi.ts` → `src/components/replay/ReplayInspectorPage.tsx` (route `/telemetry?sessionId=&driverOrdinal=&lapOrdinal=`):
  Source and resolution reloads of the same session/driver/lap remap the live scrub index and chart zoom endpoints
  in `useReplayInspectorData.ts` using canonical lap distances (`getDistancesInReferenceFrame` for track stations),
  keeping the same location despite different sample counts, clock origins or driven distances.
  Clicking an active map color mode in regular or fullscreen controls deselects the heat map (`default`),
  hides its legend, and restores the solid blue primary and dashed amber baseline line colors.
  `inspector/` (data hook `useReplayInspectorData.ts`, `replayPlaybackCursor.ts` publishes frame-by-frame visual interpolation to the charts and map without rerendering the whole inspector between recorded samples; telemetry readouts remain on real samples, `useReplayPersonalBest.ts` (canonical same-layout/class leaderboard identity for the gold lap time), sidebar, timeline, `compare/` (Compare button, comparison lap picker and its rows); HUD assist labels reserve height so TC/ABS toggles do not resize the map), `map/` (GPS map; Delta colors the cumulative gap, while Gain / Loss colors its local change in s/s over a centered ±0.3 s window, with a 0.015 s/s neutral deadband and saturation at 0.16 s/s; both modes require a baseline and are available in regular and fullscreen controls. `computeGainLossByIdx` in `replayMapUtils.ts` splits at recording gaps, teleports and invalid timestamps; baseline colors use the primary rate at the matched distance. The SVG scene pieces are in `map/scene/`, racing lines share one non-scaling 28px hit stroke (44px on touch) per continuous section for nearest-sample selection; selected-corner ranges stay stable during playback to avoid rebuilding static paths, boundaries via
  `useTrackBoundaryGeometry.ts` from `/api/data-plugin/tracks/:layoutKey`; optional `mapSurfaces` road/kerb/runoff (plus optional apron, gravel and grass) polygons are drawn by
  `scene/GpsTrackSurfaceLayers.tsx` as compound paths preserving holes. Optional raised kerbs share the Kerbs toggle, with an amber overlay and a labelled colour legend. Coordinates are local x/z meters; these
  display layers leave centerline projection and timing gates unchanged. `map/display/` owns persistent Layers
  preferences, optional revision-matched display assets from `/api/data-plugin/tracks/:layoutKey`, quiet active-route backgrounds,
  fitting controls, a metric scale bar and `GpsBrakeMarkers.tsx` for optional world-position braking boards (faded by
  zoom level; boards without a station fall back to their order along the lap). Their
  labels report printed board distances; unknown distances use a generic brake label.
  `scene/markerPlacement.ts` shares badge-box and connector collision checks across brake boards, START,
  sectors, turns, APEX and pedal badges. The scene lays out brake boards, then the exact START badge from
  `scene/startFinishPlacement.ts`, then sectors and corner/pedal labels against those final occupied boxes.
  Badge searches reuse the spatial road index in `scene/cornerRibbonClearance.ts` (built once per lap from
  simplified edges and lines, so wheel zoom only pays for nearby-segment queries); measured stations and
  timing gates stay fixed. Crowding moves labels outward rather than accepting an overlapping final slot;
  `placeMarkerNear` lets turn and sector badges step around their anchor instead of being pushed far down one
  ray, avoiding crossed turn tethers. `placeCornerBadges` prefers the circuit exterior on a closed lap and hides
  an unselected turn badge with no room within 96px of its apex (zoomed out). Pan/zoom clamps the view centre.
  Brake ticks yield to timing gates, other ticks and badges; `scene/MarkerGuide.tsx` suppresses decorative
  connectors through occupied badges. Pedal badges remain distinct even when their physical events coincide.
  The mixed-marker render regression checks every badge pair at 0.6x, 1x, 4.5x and 10x zoom. Map Layers
  (`display/mapLayers.ts`, `MapLayersControl.tsx`) toggles start/finish, sector markers, turns and Pedal Points
  independently; Pedal Points state stays in `ReplayMapContainer.tsx` and is shared by normal and fullscreen views.
  Fullscreen adds `map/telemetry/GpsMapTelemetryDock.tsx`: one selectable 112px trace under the map, including
  overlaid throttle/brake and comparison-only delta. It shares playback, chart paths and distance alignment with
  the inspector, with separate persisted channel/collapse preferences (the collapse state lives in the scene so the T
  shortcut shares it; remembered toggles use `map/useStoredToggle.ts`). It reuses the scene's lap comparisons, draws
  S1/S2 lines from `trajectory.sectors` whenever they fall inside the visible range. Its toolbar has quick Speed, Delta and
  Throttle + Brake buttons and a More channel selector on the left; `GpsMapPlaybackStrip.tsx` (play, shared playback
  speed, cursor lap time and distance) sits on the right beside the trace visibility toggle. `GpsMapTelemetryHud.tsx` sits horizontally
  in the bottom dock above the trace, with primary left, baseline right, a centered live delta and always-visible readouts.
  Completing a valid drag-to-zoom selection returns the shared telemetry interaction mode to scrubbing while retaining the zoomed range.
  `GpsMapLapTimingPanel.tsx` floats on the right with recorded lap/S1/S2/S3 times and baseline differences; it
  highlights the cursor's sector and, when comparing, its live change since that sector's start line
  (`display/liveSectorSplit.ts`, deterministic from the distance-aligned delta). Below 2xl it stacks under the mode
  bar in one right-hand column. Its lap-column headers consume `inspector/replayFullscreenControls.ts` (lap choices,
  load state and playback speed): the primary button opens a keyboard-operable
  lap menu; the baseline button opens the same comparison picker as the normal inspector. Selected times appear
  only in the timing rows. The shared picker is body-portaled above fullscreen and uses `useModalFocus` to isolate
  focus; Escape closes the picker first and restores its trigger. Header controls remain when timing rows collapse.
  The bottom HUD uses one inline readout row; G-force breakdown and weather/status detail remain in accessible
  labels and hover titles. `GpsMapCompactTrace.tsx` renders Speed, combined Pedals and Delta without duplicate
  titles or live-value badges; other channels keep their existing renderers. Full-lap reset appears only while
  zoomed; the common channels lead the selector, with the rest grouped under Other channels.
  Camera scaling observes the viewport above the dock; chart pointer, wheel and keyboard gestures stay separate from map navigation.
  Compact traces reserve a 56px scale gutter. Their SVG, scrub cursor and pointer hit area share the remaining
  plot width, with ticks aligned to the same SVG scale. HUD readouts use matching fixed columns and a centered live delta.
  `useStableCullViewBox.ts` (rule `nextCullViewBox` in `replayMapUtils.ts`) keeps the culling view box unchanged while
  the live view stays inside its margin, so the memoised `TrackPathLayers` in `scene/GpsTrackSegments.tsx` skip
  re-rendering during pans; `useGpsMapShortcuts.ts` acts only on the focused or expanded map, never on chart keys,
  except M (toggle fullscreen from any replay surface) and T (hide/show the fullscreen trace). Leaving fullscreen
  entered from its button returns focus to the map, so M can re-expand it. Active road and kerbs are the defaults; runoff (one toggle for paved runoff, apron, gravel, grass and other circuit roads, with a colour key for the kinds present), pits,
  road edges and the centerline guide are opt-ins. Legacy files use a seam-free measured ribbon and measured kerb
  clipping; unavailable pit/outer-road controls are disabled. Layer toggles preserve camera and playback. Maps without
  surfaces retain the road ribbon),
  `telemetry/` (strip charts; `TelemetryScrubCursor.tsx` snaps the shared scrub line to physical pixels for stable thickness; channels by subsystem; `presets/`),
  `ReplayShortcutHelp.tsx` lists chart/map shortcuts. `src/utils/replayShortcuts.ts` excludes native controls, typing,
  browser modifiers and modal dialogs. Chart interaction supports Shift-wheel pointer-anchored zoom, Shift-drag range
  selection, Alt-drag pan, sample arrows / 0.5 s Shift-arrows, Home/End, +/− and 0 reset; distance windows and wheel
  normalization live in `telemetry/telemetryViewport.ts`, with viewport updates coalesced per animation frame.
  M toggles the fullscreen map from a chart/map; Escape exits. Space toggles playback from a chart/map; manual cursor selection pauses it. Map C centers once at the existing zoom,
  F toggles following while preserving the current camera when stopped, and the center button labels itself when the car
  is off-screen. Zoomed scrubbing resumes following unless the driver explicitly pans or disables it.
  `analysis/` (corner phase cards, consistency, AI tab). Corner consistency is lazy, recomputes from the mounted replay/driver/lap/trajectory/source inputs, and aborts obsolete comparison-lap requests; its result does not persist across view remounts. Algorithms in `src/utils/` (`cornerAnalysis/` (types, helpers, segmentComparisons), `lapAlignment.ts`,
  `replayComparison.ts`, `computedTelemetry.ts`, `handlingBalanceDetection.ts`, `telemetryPostProcessing.ts`).
  Steering handling warnings use `src/utils/handlingBalance/evidence.ts`: a sustained response deficit or rear slide is required,
  not just the fixed-ratio Ackermann residual. With aligned comparison samples, events also need at least 0.10 s of local
  delta growth and a sustained speed deficit. Badge tooltips show evidence and a driving experiment; badges display time
  loss only when available. The local delta is observed during the event, not attributed entirely to it.
  The inspector header uses the chart baseline color for its comparison driver. Driver/lap requests, baseline requests and
  comparison candidates have separate loading/error recovery; canceled or superseded requests cannot replace the selection,
  and an old baseline is cleared before loading its replacement.
  Swaps keep replay, driver and lap together through URL updates: external lap changes only apply to the
  loaded active replay, and completed requests use the current lap-change callback to preserve route parameters.
  `ReplayInspectorTitle.tsx` keeps weather, rain intensity and air/track temperatures visible beneath the circuit name;
  its two-line header keeps event/split and replay file details in Info. Lap conditions take precedence over replay metadata when present.
  The comparison picker defaults to Same condition (Dry, Wet or Dynamic Weather), with explicit condition and All conditions
  overrides; it uses the inspected trajectory's weather before replay metadata and never guesses from another driver's lap.
  Telemetry channels: `telemetry/TelemetryStaticTrace.tsx` reserves a 24px title row above the plot, whose SVG viewBox and
  tick positions cover the same scale; live readings appear only on the scrub cursor, at a fixed height through the lap.
  Gear ticks and viewBox share the G1–G7 path extent (`gearTraceY` in `telemetryChartPathBuilders.ts`). Steering fits a
  symmetric lap-wide range (primary and comparison, at least ±25%) with manual ±25/50/100% scales; only the trace paths
  scale, so handling overlays and raw cursor readings are unchanged.

## 4. Other features at a glance

| Feature | Server | Shared domain | Client |
|---|---|---|---|
| Dashboard | `/api/dashboard` (`sessionSummaries/dashboardQueries.ts`: complete-history grouped metrics, current-benchmark ratings and recent trend candidates; paginated session cards) | `trackSummaryUtils.ts`, `paceCategory.ts` | `components/dashboard/` (`useDashboardData.ts` loads the bounded page and persisted aggregates; `Dashboard.tsx` uses server ranked track/car/pace cards; legacy metrics hooks remain for injected sessions/tests) |
| Session list (dashboard + track detail) | `/api/sessions` (compact `SessionCard` rows from `sessionSummaries/pageQueries.ts` and `cards.ts`, without detailed driver/lap arrays); `/api/track/:trackName` returns the server page consumed by the same list | | `components/session-list/` (`SessionList.tsx`; 25 per page via `useSessionPage.ts` + `SessionPagination.tsx`, `?page=` reset by `updateSearchParams` on any other filter change; `SessionFilterParts.tsx` two-row toolbar with Clear filters, used by `dashboard/DashboardFilterBar.tsx` and `track-detail/TrackSessionsToolbar.tsx`; row chips in `SessionRowParts.tsx`) |
| Tracks | `/api/tracks`; `/api/track/:trackName` (scoped history aggregate, compact filter options, server-paged cards, every progression point of the scope (unpaged: the chart's personal-best line, ranges and totals need the whole history; `queryProgression` returns an array) and full-history position averages via `sessionSummaries/trackQueries.ts`) | `circuitSpecs.ts`, `circuitDefinitions.ts` | `components/track-summaries/` (native card links preserve class context; benchmark status/retry, unavailable pace sorting, explicit missing-record states; session-style PaceBadge and Last driven date), `components/track-detail/` (`useTrackDetailState.ts` drives server filters/pages; `TrackSurfaceProfiles.tsx` local road elevation/grade/bank traces) |
| Leaderboard & rivals | `leaderboardRoutes.ts` (`/leaderboard/layouts`, `/leaderboard` (optional rival status), `/rivals/pin`), `dbRivalStore.ts` | `leaderboard.ts`, `rivals.ts`, `sessionRivals.ts` | `src/api/leaderboardApi.ts`, `components/leaderboard/` (`board/`, `ribbon/`, `rivals/`, `debrief/`, 2-lap compare; DTO telemetry availability is boolean and navigation uses session+ordinal locators; `picker/` pages compact lap candidates and fetches exact deep-linked laps separately) |
| Lap comparison | `/api/compare/laps` (`sessionSummaries/comparisonQueries.ts`: compact fact paging/aggregates; `comparisonLapRows.ts`: selected normalized lap DTOs) | `lapComparison.ts` | `src/components/leaderboard/` (50-row numbered pages, one-row exact deep-link fetch, picker); `src/utils/telemetryCompareLink.ts` (session-scoped telemetry locators) |
| Benchmarks | `referenceRoutes.ts`, `server/benchmarks/referenceLaptimes.ts`, `server/benchmarks/benchmarkImpact.ts` (player laps only; `BENCHMARK_IMPACT_RULE` stamped on each diff, stored diffs from an older rule are recounted by `context.refreshBenchmarkDiffImpacts` after the startup refresh and on read; the status reads the latest update from its history row), `dbReferenceLaptimeStore.ts` (`benchmark_diff_history`) | `paceCategory.ts` | `src/api/referenceApi.ts`, `common/BenchmarkLadder.tsx` (the one benchmark display, session and track header cards), `settings/ReferenceChangesList.tsx` |
| AI engineer | `aiRoutes.ts`, `server/ai/aiReport.ts` (`PROMPT_VERSION`), `dbAiReportStore.ts` | `shared/types/aiReport.ts` | `src/utils/aiReportPayload.ts`, `replay/analysis/AIReportTab.tsx` |
| Settings & scans | `systemRoutes.ts` (`/status`, `/scan`, `/scan/status`, `/cache/clear`), `/replays/cache`, `/replays/upgrade` | | `components/settings/` (`SettingsPanel` panel + `FeedbackMessage`, `settingsFormat` numbers/plurals/bytes/dates with fallbacks, `aiKey` (clean and redact the Gemini key), `labelStyles.ts` (`READOUT_LABEL` / `FIELD_LABEL` shared label classes), `shared/domain/folderPath.ts` (`normalizeFolderPath` / `folderPathProblem`, used by the form and by `POST /scan`, which answers 400 `{error, field}`), `useSettingsScrollspy` TOC highlight, `PathField`, `OverviewCard` (the one status card: folders, sessions, replays, AI state, database size, telemetry files count, last sync, plus the scoped Clear parsed sessions action; section order is Overview, Reference Benchmarks, AI reports, AI history, Cached Replays, Folder Paths; `resolveSectionId` validates `?section=`), `ReferenceLaptimesCard` + `ReferenceChangesList` (purpose, pace categories, one status line, collapsed update history), `controls/InlineConfirm` + `useInlineConfirm` (focus returns to the trigger or the section heading), `hooks/` (`useAiSettings`, `useDeepLinkAlign`), `replays/` (cached-replay list model, `useReplayCache`, filters, table, progress; the table draws 200 rows at a time with "Show N more"; `replayView` / `replayFilter` / `replaySort` params beside `?section=`); `/replays/upgrade` also reports `currentVersion`, the version an on-disk replay must be at) |

Client routes (`src/App.tsx`): `/dashboard`, `/tracks`, `/track/:trackName`, `/leaderboard`, `/session/:sessionId`,
`/telemetry`, `/settings` (`/compare` redirects). Pages load on demand from `src/routePages.ts` (the current route's
page with the session data, the rest when idle; never import a page from the components barrel in `App.tsx`, and keep
recharts out of the entry: chunk groups in `vite.config.ts`). All server calls go through `src/api/apiClient.ts` (local-package geometry/display via `src/api/trackGeometryApi.ts`).

Types: canonical in `shared/types/` (`index.ts` is the barrel; `session.ts` laps/drivers/sessions, `reference.ts` benchmarks, `status.ts` scan/system, `replay.ts` replay; `leaderboard.ts`, `pitStops.ts`, `raceTraffic.ts`, `aiReport.ts`).
Server, client and shared code import these contracts directly from their defining modules or `shared/types/index.ts`.
DuckDB reader contracts stay in `server/telemetry/duckdbTypes.ts`.
Compact session views share `SessionCard` (`shared/types/sessionSummaries.ts`); views that also accept
full lap histories use an explicit `SessionCard | DetailedSession` union. Track aggregation derives its
minimal input from canonical session and driver contracts. Dashboard trends use `shared/types/dashboard.ts`
directly, and chart progression uses `SessionProgressionPoint` from `shared/types/session.ts`.
Replay samples use `ReplayTrajectoryPoint`, weather summaries use `WeatherCondition`, and timing gates
use the geometry-owned `TimingGateGeometry` / `TrackTimingGates` contracts.
One name per fact, in TypeScript and SQL (the table is in [the archived type refactoring plan](plans/archive/TYPE_REFACTORING_PLAN.md)):
`lapNumber` (`lap_number`; URL parameters `lapNumber` / `compareLapNumber`), `bestLapNumber`, `isOutLap`, `isPitStop`,
`carType` (replay and telemetry metadata included), `avgLapTime`, `top3Average`, `paceCategory` / `pacePercentage`,
`timeString` (the full session label; `sessionDay` is the day), `mtimeMs` / `fileSizeBytes` (`file_mtime_ms` / `file_size_bytes`).
`lapsCount` and `pitStopsCount` are counted from laps; the XML-declared figures are `declaredLapsCount` /
`declaredPitStopsCount`. `driverLapsCount` (`shared/domain/formatters.ts`) reads a player's laps from a card or a detailed driver.
`DriverData.name` is the one driver name; there is no `driver_name` column on `session_drivers`.
The app has no compatibility reads for retired names: a database written by an older build is rewritten once by an
offline script before the renamed app opens it, and `test/domain/retiredNames.test.ts` keeps retired property names out of `shared/types`.

Comparison PB badges (`comparisonQueries.ts`, both leaderboard and telemetry picker) rank matching
history once for the distinct drivers on the requested page, instead of running one history query per
driver. Layout/class/driver/session scope and valid positive lap rules are preserved; exact lap locators
and pagination do not narrow PB history. Ties keep lap time, timestamp, session rowid, driver ordinal
and lap ordinal order. Empty pages skip the PB query. This is request-time SQL with no extra cache or migration.

Track geometry: `shared/types/trackGeometry.ts` defines local-meter map polygons, station-indexed nullable physical
profiles, quality flags and independent geometry/projection revisions. `shared/domain/trackGeometry.ts` validates
bounded payloads, samples profiles cyclically, and computes asymmetric road-edge distances (+lateral offset is left, as OpenDRIVE t).
`server/tracks/trackGeometryStore.ts` caches validated definitions, indexes centerline projection, and tracks geometry/projection revisions across file replacements.
Unavailable measurements remain null; road and kerb geometry do not determine penalty validity.
Optional `leftKerbType`/`rightKerbType` profile columns carry the kerb surface category (`flat`, `sawtooth`, `other`, null
without a kerb); samples take the nearer station's type, and `server/tracks/serverTrackSync.ts` copies kerb width, height
and type onto each projected lap point.

Track detail keeps successful data keyed to its requested track, shows loading when switching back to a previously visited track, and offers an inline retry warning when a same-track refresh fails. Route sort values are validated. Circuit information uses the body-portaled focus/scroll isolation hook `src/components/common/useModalFocus.ts`. Progression view and series controls expose their pressed state and support keyboard operation.

Every dropdown uses `src/components/common/dropdown/` (2026-10-13, [plan](plans/archive/DROPDOWN_STANDARDIZATION.md)): `Select.tsx` is the one single-choice control (a select-only combobox with typed string/number values, groups, disabled options, a trailing `detail`, typeahead and `data-value` for tests via `test/helpers/selectControl.ts`); there are no native `<select>` elements. Its list mounts fixed-position inside the open modal layer (a dialog or the expanded map) or the body through `useAnchoredPanel.ts`, so clipped toolbars and scroll rows cannot cut it off; `useOutsidePress` is the shared capture-phase dismissal. Checkbox lists, preset menus, the resolution popover and the Info/Beaten disclosures keep their own semantics and share `dropdownStyles.ts`. `SortDropdown.tsx` lives there too.

Session cards (`session-list/SessionGridCard.tsx`) show bundled track SVGs to the left of session details,
resolved directly by venue, course, replay name and track length, with visible benchmark pace percentages. Unknown layouts
and unavailable SVGs omit the thumbnail without fetching metric geometry.
Card headers keep the outline at the left and stack the session badge and replay control at the right;
layout names allow two lines before an ellipsis. Track-scoped cards replace the repeated circuit name and outline
with a car identity heading and larger manufacturer logo above the date, and omit the duplicate car identity in the footer.
Best-lap and pace readouts align above a shared row
with laps and finishing position grouped on the left and, on the dashboard, car identity on the right. The full-card link keeps its keyboard outline
visible, with replay controls independently focusable beneath the session badge.
`TrackCircuitLayout.tsx` uses lightweight white `/track-outlines/<layoutKey>.svg` outlines at every size,
falling back to an inline SVG fitted to the active centerline if an asset is unavailable. It never renders
detailed map surfaces; the information modal still loads physical profiles independently. Only basic
SVG outlines are served statically from public/dist by `server/index.ts`; metric geometry and display
assets are validated local-package resources served through `/api/data-plugin/tracks/:layoutKey`.
`src/api/trackGeometryApi.ts` loads/validates display assets against layout identity and `geometryRevision`;
stale assets are ignored while generation replaces files. The optional display contract is `TrackMapDisplay`
in `shared/types/trackGeometry.ts`, validated by `parseTrackMapDisplay` in `shared/domain/trackGeometry.ts`.
Leaderboard navigation resolves missing or `All` classes from the selected layout's last-driven class (or first available class), while preserving a valid specific class deep link.
The page's `rivals/useRival.ts` owns standings and rival state together: `/leaderboard?includeRival=true`
returns `LeaderboardWithRival`, computing the board once; the separate `board/useLeaderboard.ts` hook is removed.
Replay personal-best reads still request the plain board. The page supplies its track list to `CompareLaps`,
so the comparison does not request `/leaderboard/layouts` again. Standalone comparisons retain their own loader.
Leaderboard SQL starts from layout-scoped sessions before drivers, and reuses materialized eligible contributions.
Session schema initialization drops the legacy `idx_session_drivers_class` index. Track summaries materialize
their compact base to reuse class checks across aggregate expressions. Read-only warm measurements on
992 sessions: LMGT3 tracks about 46 → 14 ms, Hypercar tracks 104–153 → 32 ms, Road Atlanta LMGT3
standings 43 → 1.5 ms and player history 6.6 → 0.2 ms. These exclude HTTP and browser rendering.

### Live dashboard (page)

The fullscreen `#/live` page (plan: `docs/plans/LIVE_RACE_DASHBOARD.md`; contracts: `shared/types/live.ts`).
`App.tsx` branches early on `/live`: no navbar, column, loading gate or analysis polling. `src/api/liveStream.ts`
(`useLiveStream`) owns the one `EventSource('/api/live/stream')`: snapshot in state, pedal batches through an
`onPedals` ref callback (never state), `connecting | live | disconnected` (error, or silence of 2.5 heartbeats);
it also holds `fetchLiveSettings` / `saveLiveSettings`. `src/components/live/`: `LivePage` composes `LiveFrame`
(fixed 2560x1440 stage scaled to the window), `LiveSessionBar` (class through the existing `CarClassBadge`, zoomed;
class from `mapVehicleIdToClass(vehicleName, vehicleClass)` in `liveScreens.ts`), `LiveStateScreen` (the lifecycle
screens, built by `liveScreen(snapshot)`), and `LivePedalTrace` (canvas, redrawn by rAF from the `PedalBuffer`
ring in `pedalBuffer.ts`). `src/api/useAppEvents.ts` is the app-wide `GET /api/events` listener used by
`useAppData` (scan-started restarts scan polling, scan-finished reloads data). Settings card:
`settings/LiveDashboardCard.tsx` (`autoOpen`). Tests use `test/helpers/fakeEventSource.ts` and `test/helpers/liveSnapshot.ts`.
Step 2 (identity and timing): the 5 Hz `timing` event goes into `LiveTimingStore` (returned by `useLiveStream` as
`timing`, read with `useLiveTiming` / `useSyncExternalStore`), so only the timing parts render, not the page. The
driving content is `LiveDriving` by session kind: `LiveRaceView` (delta row + `LiveLastLapRow`, placeholder primary
area for later pit advice), `LiveQualiView` (push lap delta, optional tyre average), `LivePracticeView` (also warmup
and unknown) with `LivePracticeHistory`. `LiveSessionBar` carries laps left, PR and track temperature. `LiveDelta` and
`liveFormat.ts` hold the signed-delta (real minus sign, gain/loss tokens), sector and lap formatting.

### Live dashboard (server)

`server/live/` reads the rF2 shared memory plugin (`$rFactor2SMMP_Scoring$`, `$rFactor2SMMP_Telemetry$`) in a worker
thread. `rf2Layout.ts` derives every byte offset from field lists that mirror `tools/telemetry-recorder/Rf2Structs.cs`
(its test asserts the plugin's struct sizes: a shifted field fails there); `rf2Decode.ts` holds the pure decoders and the
coherent read (begin counter, copy, end counter, 3 attempts, unchanged frames skipped); `sharedMemory.ts` is the only
Windows part (koffi `OpenFileMappingW` / `MapViewOfFile`); `liveReader.ts` is the worker's loop (3 s open retry, 50 Hz in
realtime and 1 Hz otherwise, game-exit check: counters still for 5 s, then one `GET 127.0.0.1:6397/navigation/state`: refused = gone,
timeout = busy, `NAV_MAIN_MENU` = menu (the buffer keeps the last session in the menu); a refusal only counts once LMU has answered,
or after a 3 min start-up grace),
started by `liveReaderWorker.ts` through `liveReaderWorkerBootstrap.mjs`. The main thread side: `liveService.ts` (snapshot,
SSE clients, 40 ms pedal batches only on track, heartbeat, slow clients drop batches, `session-loaded` / `lifecycle`
events), `liveSettings.ts` (`live_auto_open` in
cache_metadata), `sse.ts`. The lifecycle rules are deterministic in `shared/domain/live/liveLifecycle.ts`. Routes:
`routes/liveRoutes.ts` (`/api/live/stream`, `/api/live/settings`, `/api/events`; auto-open is the `game-started` app
event when the lifecycle leaves offline, setting on and no dashboard page connected: the open app navigates itself to
`#/live`, the server never opens a browser).
Session identity and timing (step 2): the scoring decode also carries the player's and the leader's lap fields, track
temperature, rain and wetness; the telemetry decode adds the mean tyre surface temperature (`tyreSurfaceAvgC`).
Deterministic models in `shared/domain/live/`: `liveLapTiming.ts` (laps, validity, session best, reference trace, delta,
sector deltas), `liveLapsLeft.ts` (exact in lap races, estimated from the leader in timed ones), `liveWeather.ts`
(whole-degree temperature, 5 min trend, 0.05 steps), `liveIdentity.ts` (layout via `getCircuitSpecification`, class,
PR lookup), tied together by `liveSessionTracker.ts`. Server: `lmuNavigation.ts` (the only LMU REST read:
`GET 127.0.0.1:6397/navigation/state`, 2 s timeout, never throws) and `liveIdentityResolver.ts` (once per loaded session,
then every 30 s, 30 s back-off, one request at a time); the PR comes from `queryLivePersonalBest`
(`server/core/sessionSummaries/contextQueries.ts`), injected from `server/index.ts`. `timing` events go out at most every
~200 ms; snapshots only on a content change.

**Scan hold:** `index.ts` wires `session-loaded` to `ServerContext.setLiveSessionLoaded`. While a session is loaded the
session / replay / telemetry scans and the replay upgrade do not start (they set `pendingSessionRefresh`; a running
upgrade is stopped); when it ends the pending refresh runs. `ScanStatus.heldForLiveSession` reports it. `ServerContext.events`
(`TypedEmitter` in `core/typedEmitter.ts`) emits `scan-started` / `scan-finished` on idle/busy transitions for `GET /api/events`.
A scan already running when the session loads is not interrupted (only its follow-up steps are held).

## 5. Cache versions: what to bump

| Constant | File | Bump when | Effect |
|---|---|---|---|
| `DB_PARSER_VERSION` | `server/core/dbSessionSync.ts` (exported const) | a parser/lap classification rule changes | every stored session re-parsed from XML |
| `SESSION_SUMMARY_PROJECTION_VERSION` | `shared/types/sessionSummaries.ts` | persisted summary or lap-fact rules change (now 4: derived facts on the row tables) | bounded rebuild from the stored rows, without XML reads |
| `REPLAY_MATCHING_PROJECTION_VERSION` | `server/core/replay/dbReplayMatchingStore.ts` | persisted replay matching facts change | one-time rebuild from retained metadata, without VCR reads |
| `REPLAY_CACHE_VERSION` | `server/core/dbCache.ts` | decoded replay rows change | on-disk replays decoded again in the background (deleted ones kept as they are) |
| `DUCKDB_TELEMETRY_CACHE_VERSION` | `server/core/dbCache.ts` | DuckDB lap cache shape changes | lap cache rebuilt |
| `RACE_POSITIONS_VERSION` | `server/traffic/racePositions.ts` | race positions index changes | index rebuilt on demand |
| `TELEMETRY_LINK_RULE` | `server/telemetry/telemetryLinks.ts` | DuckDB-to-session linking changes | links decided again |
| `PROMPT_VERSION` | `server/ai/aiReport.ts` | AI prompt changes | new reports, old ones kept |

Anything computed per request (pit stop details, telemetry links, everything in `src/`) needs no bump.

## 6. Recipes

- **New lap/driver fact from the XML**: raw shape in `sessionXmlTypes.ts` → read it in `parser.ts` (`parseLap` / `parseDriver` /
  `parseStreamEvents`) → field on `LapData`/`DriverData` in `shared/types/session.ts` → bump `DB_PARSER_VERSION` → test in
  `test/server/sessions/` (`parserStream.test.ts` builds XML inline).
- **New fact from the linked replay on a session**: follow `server/sessions/sessionPitStops.ts`: read the replay tables with
  `dbReplayLapStore.ts`, keep the pure maths in `shared/domain/`, attach in `GET /session/:id`. Test with an in-memory
  `SessionDatabase(':memory:')` and `replaceReplayWideFacts` / `replaceReplayDriverLapFacts` (see `test/server/sessions/sessionPitStops.test.ts`).
- **New line in the expanded lap row**: `src/components/session-detail/table/lapDetailSections.ts` (add to the context in `lapPlaces.ts`
  when it needs other laps); tests in `test/components/session-detail/lapDetailSections.test.ts`. `SessionLapTableRow.tsx` renders the timing row, including separate best/optimal deltas; keep it under 300 lines.
- **New session scalar or driver/lap column**: declare it in `server/core/sessionRows/specs.ts` (driver name, car and team use dictionaries), update the writer/reader and round-trip tests, and migrate existing tables as needed. For a derived fact, update the projection (`shared/domain/sessionSummaries/`), the derived column definitions and `writer.ts`, bump `SESSION_SUMMARY_PROJECTION_VERSION`, and update `cards.ts` if shown on cards.
- **New endpoint**: `server/routes/<domain>Routes.ts` (query helpers `queryParams.ts`) → mount in `server/index.ts` only for a new router →
  supertest in `test/server/routes/` → client loader in `src/api/`.
- **New table/store**: DDL in `dbSchema.ts` → functions taking the `better-sqlite3` `Database` in `server/core/db<Name>Store.ts`
  (pattern: `dbRivalStore.ts`) → callers pass `sessionDb.getDb()`; add a `SessionDatabase` method in `db.ts` only when many callers need it.
- **New circuit/layout**: `shared/domain/circuitDefinitions.ts` + basic SVG in `public/track-outlines/`; detailed geometry and display files belong in an external local package.
- **New car**: `shared/domain/vehicleMapping.ts`; exact aliases and footprints belong in the local vehicle catalog; class defaults stay in `vehicleDimensions.ts`.
- **New session list filter**: add the control to the `narrow` slot of both toolbars (`DashboardFilterBar.tsx`, `TrackSessionsToolbar.tsx`), clear it in the one-write resets (`resetFilters` in `Dashboard.tsx`, `resetSessionFilters` in `useTrackDetailState.ts`; separate `updateSearchParams` calls overwrite each other) and count it in their "is filtered" checks.
- **Navigation control**: a React Router `Link` with a real `to` (middle/modifier clicks open a new tab); when a plain
  click needs an in-app handler, pass `linkClickHandler` from `src/utils/linkClick.ts` (session replay URLs:
  `session-list/sessionReplayUrl.ts`).
- **New signed vehicle channel**: ISO 8855 (positive left, as steering, yaw rate, lateral G, sideslip and lateral offset);
  native positions and rotations retain LMU's x/z horizontal, y-up frame. The map uses ISO signed
  dynamics with a documented screen projection; its arrow depicts inertial load transfer.
  Zero heading is valid; path-only map acceleration evaluates tangents over the same time interval
  as the yaw derivative. Coordinate details and estimation limits are in `TELEMETRY_FORMAT.md`.
  convert LMU's sign at ingestion (`replayTrajectory.ts`, `duckdbReader.ts`), see `docs/TELEMETRY_FORMAT.md`.
- **Color in the UI**: use the semantic `lmu-*` roles in `tailwind.config.js` (`text-lmu-gain`, `bg-lmu-warn-strong/20`,
  `text-lmu-faint`), never raw Tailwind hues; charts and SVG take `src/utils/themeColors.ts`. Roles, steps and contrast rules
  (no `opacity-*` on text) are in `DESIGN.md`, Colors; a new role goes in the config and `DESIGN.md` together.

## 7. Tests and checks

- `npm test` (all), `npx vitest run <path>` (one file), `npm run build` (types + bundle, zero warnings).
- `npm run benchmark:endpoints`: real local HTTP through production routers on a temporary SQLite snapshot,
  fixed request cohort, ranked first/warm median/p95 timings and local JSON/Markdown history. New GETs and unclassified
  mutation routes fail inventory coverage. HTTP failures preserve status and error text even for HTML error pages.
  `endpointValidation.ts` rejects empty/malformed board, track and comparison collections; local history retains result counts.
  The fixed cohort uses exact stored `GT3` identity; the legacy `LMGT3` cohort's empty-result timings are invalid.
  Player PB requests preserve the cohort's saved telemetry driver ordinal rather than depending on raw XML player flags.
  Tools live in `tools/benchmarks/`, tests in `test/tools/benchmarks/`.
  Run before/after API-affecting features and optimizations; weekly check uses the same runner. See [ENDPOINT_BENCHMARKS.md](ENDPOINT_BENCHMARKS.md).
- Tests mirror the source tree: `test/server/<domain>/`, `test/domain/`, `test/utils/`, `test/components/<feature>/`.
- Fixtures: `test/fixtures/{results,replays,telemetry}`; synthetic VCR with `test/utils/mockVcr.ts`; leaderboard fixtures `test/domain/leaderboardFixtures.ts`.
- The user runs the dev server (UI 5173, API 3001). Session JSON: `GET http://localhost:3001/api/session/<id>`.

## 8. Other docs

Start with [docs/README.md](README.md) for the documentation guide and [plans/README.md](plans/README.md)
for active proposals, remaining work and completed-plan history. Archived plans preserve historical
measurements and schemas; they are not current execution instructions.

`docs/XML_FORMAT.md`, `docs/VCR_FORMAT.md` (incl. pit event codes), `docs/VCR_ANALYSIS.md`, `docs/TELEMETRY_FORMAT.md`
(incl. the sign conventions: ISO 8855 vehicle axes, so steering, yaw rate, lateral G and lateral offset are positive left;
LMU's swapped `G Force Lat`/`Long` labels; unmarked cached rows flipped on read),
`docs/LMU_REST_API.md` (+ `swagger-schema.json`; probe gently, ≤1 Hz), `docs/plans/`.

---

## 9. Smells that need attention

**UI follow-ups**

- Session standings emphasize class position while sorting and gains use overall results. Reconcile
  the intended meaning and cover differing class/overall gains in `SessionRaceStandings.tsx` and `SessionRaceStandingsRow.tsx`.
- Complete real-recording keyboard navigation, focus containment/restoration and nested Escape
  validation for session detail and the fullscreen map at the normal desktop viewport. 200% browser
  zoom validation is deferred by user decision (2026-10-10), not a current completion gate.
  HUD/friction separation and menu bounds are implemented. The fullscreen turn selector was removed by user request;
  keyboard pan remains. Entry points: `SessionRulesModal.tsx`, `useMapFullscreenFocus.ts` and `ReplayShortcutHelp.tsx`.
- Main's corner comparisons still depend on the primary speed trace and sample baseline speed at
  its apex. The separate `corner-map` branch has mapped/hybrid implementations and open acceptance
  gates; see [the current handoff summary](plans/CORNER_COMPARISON_REWORK.md). Do not restart its completed phases.

Remove an item when it is fixed; add new ones as they are noticed. Current follow-ups are in
[plans/README.md](plans/README.md). [SMELLS_CLEANUP.md](plans/archive/SMELLS_CLEANUP.md) records
the completed 2026-09-29 cleanup and does not describe all remaining findings.

**Size limits close to the edge**
- Largest source files (checked 2026-10-10): `shared/domain/circuitDefinitions.ts` (774, a data file: one entry per layout)
  and `server/telemetry/duckdbReader.ts` (773); both remain below the 1,000-line limit.
- Folders near 20 files (direct files, checked 2026-10-10): `shared/domain/`, `src/components/settings/`, `test/domain/` (19 each);
  `src/components/common/`, `src/utils/`, `test/utils/`, `test/components/replay/telemetry/` (18 each);
  `src/components/replay/inspector/` (17; comparison picker split into `compare/`).
- Components near the 300-line limit (rechecked 2026-10-13): `ReplayInspectorContent.tsx` (291),
  `ReplayInspectorModalBody.tsx` (289), `Dashboard.tsx` (279), `TelemetryPresetModal.tsx` (273), `ReplayInspectorSidebar.tsx` (270).
  `GpsTrackMapScene.tsx` was split to 191 lines (2026-10-13) into the `scene/useGpsScene*.ts` hooks.

**Logic in the wrong place / duplicated**
- Personal-best meanings (decided 2026-10-13): the gold badge is the class best (any car, any condition); "vs your best" is the best representative lap in the class (any car, revised 2026-10-13); the Compare page `playerBestLap` is the clean dry best. Keep these distinct and labelled; do not merge them.
- [Completed frontend simplification audit](plans/archive/SRC_SIMPLIFICATION_AUDIT.md) (2026-10-12): removed 23 frontend export barrels, consolidated six wheel-channel SVG renderers and rules-dialog focus handling, extended the canonical progression type, removed a route forwarder, parsed dashboard dates once per session, and accumulated wheel-chart extrema in one pass per lap. Follow-up commits also reuse geometry-owned display payloads and remove remaining named re-exports, the phase-card barrel, and the map forwarder. Reviewed candidates retained by design and their constraints are recorded in the archived audit.
- [Server repeated-work audit](plans/archive/SERVER_SMELLS_AUDIT.md): the 2026-10-12 passes fixed XML event ownership, moved superseded analytics to test helpers, centralized pace bands/read-time ratings, and rechecked replay work after ingestion optimization. Replay fixes cover worker coordination, bounded neighbor objects, one metadata snapshot, shared DuckDB preparation and batch weather reads. GPS boundary scanning now stays inside DuckDB with lap-scoped result transfer. Further whole-blob changes are out of scope.
- Comparison queries now mark page PBs with one window query for the visible drivers (`markPagePersonalBests`), rather than one query per driver. The older 2026-10-10 ~127 ms all-driver measurement predates that implementation and was not rerun in this audit; profile current query plans before optimizing further.

**Known data limits (not code bugs)**
- Pit repairs are a guess: neither the VCR nor the XML has repair or damage state. Validating against the LMU REST API is deferred.

---

## Keeping this file current

Update this file in the same commit when you:
- add, move or rename a module named here, or add a folder;
- add an endpoint, a table, a client route or a cache version;
- fix or find a smell (section 9).

Refresh the "Last checked" line when you re-verify the numbers.

GPS car-size preview: `shared/domain/vehicleDimensions.ts` defines approximate class fallback
envelopes (metres), including a neutral unknown-class default. Replay roster identity reaches the
map through `ReplayInspectorSidebar.tsx` and `ReplayMapContainer.tsx`; a baseline from another
replay retains the unknown fallback until its own class identity is supplied. These are visual
estimates, not measured model footprints. `GpsSceneCarMarkers.tsx` renders each car independently;
`GpsTrackMapScene.tsx` supplies map scale and replay body yaw (native forward -Z), interpolated
on the shortest arc (the baseline's at the primary's distance station, from `scene/useGpsSceneDynamics.ts`). The scene
composes three hooks: `useGpsSceneProjection.ts` (track package, shared bounds, SVG projections and boundary paths),
`useGpsSceneDynamics.ts` (playback cursor, distance-aligned comparisons, live delta, baseline ghost, line gap) and
`useGpsSceneCameraFocus.ts` (refit on layout change, zoom to the selected corner). Missing yaw keeps a dot. Local package loading in `server/plugins/` is implemented; model outlines
use model shapes when available, with approximate placement until a replay-origin offset is established.


## Local data packages

`server/plugins/dataPlugin.ts` loads one validated startup snapshot from backend-only
`LMU_PLUGIN_ROOT`; `trackPackage.ts` verifies canonical revisions and the allowlist,
rejects degenerate closed routes, and checks declared length against the measured route within 0.01 m.
`server/routes/dataPluginRoutes.ts` exposes tracks (geometry/display pair)
and optional manufacturer logos (`GET /api/data-plugin/vehicles/logos`; a malformed logo
entry is skipped, not fatal), with the same server access behavior as the rest of the API. There is no static package mount.
`resolveCarManufacturer` (`shared/domain/vehicleMapping.ts`) matches car names against a word-bounded rule table.
The client loads logos via `src/api/vehicleLogosApi.ts` (one shared request; a failure is cached for
`LOGO_RETRY_COOLDOWN_MS` before retrying) and renders manufacturer SVG badges via `src/components/vehicle/CarLogo.tsx` across car views (dashboard hero and cars card, session lists, session details, standings, track details, leaderboard, and rivals). Rows that name a car use `src/components/vehicle/CarIdentity.tsx` (logo, name and class badge with one spacing and tooltip; the logo is decorative next to the visible name).
`serverTrackSync.ts` and `TrackGeometryStore` use this provider for projection and
surface enrichment. Missing geometry clears old road annotations and marks odometer stations;
`shared/domain/trackGeometry.ts` provides `hasCompatibleTrackStations` to require explicit `track` station sources and nonempty matching geometry revisions; missing metadata and odometer stations are rejected. `ReplayInspectorContent`, replay corner consistency, session debrief and leaderboard debrief gate geometry-dependent corner results with this check; recorded-channel analysis remains available without compatible track geometry. Metric map caches
include package revision. Basic SVG layouts remain bundled and thumbnail helpers can use them
without loading any metric data.

Replay metadata and trajectory services resolve each selected driver's own vehicle record.
`GpsSceneCarMarkers` uses available model dimensions/outlines independently of origin calibration.
Known replay offsets are applied; absent offsets preserve the model origin and label placement
as approximate. Class estimates are used only when model dimensions are missing. Cloud AI remains available with or without a package and uses the existing summarized evidence contract; missing geometry reduces available detail.
`tools/release/checkLocalData.mjs` runs before and after builds to reject detailed static
assets and generated catalogs. Synthetic provider/footprint tests are always available;
personal geometry/recording regressions require private roots (see [PLUGINS.md](PLUGINS.md)).
