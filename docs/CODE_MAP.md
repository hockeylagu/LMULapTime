# Code Map: where things live and how they flow

A fast index for new sessions: find the right file without searching. `AGENTS.md` holds the rules;
this file holds the **routes through the code**. Keep it current (see "Keeping this file current" at the end).

Last checked 2026-10-10: 494 TypeScript source files in src/server/shared, 287 test files,
2498 tests (2442 passed, 56 skipped). Production build passes. Coverage: 94.30% lines, 91.99% statements,
92.26% functions and 83.20% branches (two workers).

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
`server/core/replay/dbReplayMatchingStore.ts`.
Normalized session rows (`server/core/sessionRows/`, completed plan [NORMALIZED_SESSION_STORAGE](plans/NORMALIZED_SESSION_STORAGE.md)) are the
stored session. JSON columns, temporary conversion tools, verification backfill and its startup gate have been removed.
`specs.ts` declares every stored column once (`fields.ts` helpers); `schema.ts` holds the DDL, extra session scalars and derived-column lists.
`writer.ts` (`writeSessionRows`, `updateDerivedColumns`) writes or updates rows with their projection; `dictionaries.ts` resolves driver names, vehicles and teams.
`reader.ts` (`readSession`, `sessionScalars`, `driverScalars`, `recordingLink`) assembles the `DetailedSession`;
`access.ts` exposes `loadSession`, `readStoredLinkState` (link and DuckDB file from two small row reads), and `sameReplayLink`.
`targeted.ts` implements granular replay link, rename, telemetry and conditions updates. Ingestion writes rows transactionally with the source and aggregates;
write failures propagate so the transaction rolls back. `canonical.ts` defines round-trip expectations for regression tests and the shared
`sessionTelemetry` / `withSessionTelemetry` attachment helpers; `stub.ts` inserts a bare session for tests and tools.
Future table schema changes receive a migration when needed; there is no row-version rebuild from deleted JSON.

**Dictionaries**: `drivers` is keyed by the exact name (never merged by case or spacing; player and human flags belong to the session's driver row),
`vehicles` by raw XML car type and class, `teams` by name; an absent value is a NULL id. They are emptied with the session cache and never pruned.
**Derived columns** live on `session_drivers` (human/player/class flags, completed/clean laps, driving time, pits, speed, best lap, averages,
consistency, wet best-lap flag) and `session_laps` (condition group, clean/representative/human/leaderboard flags, with partial indexes).
Raw columns retain XML values such as declared `laps_count`, `lap_num`, and `is_pit_stop`.
**DuckDB file**: the main attachment lives on `sessions` (`has_duckdb_telemetry`, `duckdb_filename`); the reader mirrors it onto the replay link.
`sessionTelemetry` accepts the attachment on either input object. A driver's events are stored once: a lap event references the matching driver event
(`lap_ordinal`, `lap_seq`); `lists_mask` distinguishes an empty event array from an absent one.

The telemetry comparison picker requests `telemetryOnly=true` on `/api/compare/laps`: linked replay and flying-lap filters run before pagination.
Inspector state, comparison selection and reference suggestions use session IDs exclusively; recording filenames never substitute for session identity.
`ReplayTrajectoryService` accepts a session plus driver/lap ordinals and resolves its recording internally; legacy filename/slot request parameters and unused request types are removed.
Map geometry and session thumbnails resolve from canonical layout/venue/course without filename hints.
Session views no longer display recording filenames, and improvement-chart rows no longer carry them.
`/scan/status.sessionReplayJobs` maps ingestion/upgrade work to stored session owners on the server;
launch buttons and indicators use only session IDs. File-based diagnostics remain in Settings.
AI evidence and `ai_reports` identify both laps by session ID and driver/lap ordinals. The schema migration
preserves older reports with null locators and removes their filename columns; history labels these as previous reports.
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
Dashboard metrics/trends scan these rows, not card JSON or detailed lap history; track queries
reuse the stored timestamp/sectors/length and progression reads the stored date. Benchmarks remain
current-target calculations. Failed projections retain a zero-player fact row for session counts.
The layout, session kind, primary driver ordinal,
empty flag, source/projection revisions and projection version live on `sessions`. Rebuild old rows
through `loadSession` in bounded batches (`backfillSessionSummaries`); never load full history to backfill.
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
Historical JSON columns (`data_json`, `metadata_json`, `summary_json`) were dropped in Phase 3b/3c. Converted caches may retain the unused `normalized_version` column; fresh databases omit it.

**Replays are the source of truth once cached**: LMU deletes old `.Vcr` files, and their rows are the only copy. Never write
code that drops replay rows because the file is gone.

DuckDB ownership (`server/telemetry/telemetryLinks.ts`, `TELEMETRY_LINK_RULE = session-span-v2`) uses
session spans. Restarted offline races can share their XML start timestamp; ties go to the earliest
session still running when recording begins, before end-time slack, so the empty attempt does not
claim the restarted race's files. Changing this rule recalculates stored links once, retaining telemetry caches.

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
`server/core/ingest/fileIngestWorker*.ts` parses XML and replay metadata in a reused worker. XML receives a benchmark snapshot from the main thread and never opens SQLite in the worker. A worker that dies fails only the file it was reading (XML is then read on the main thread) and the next file starts a new worker.
Every worker client (ingest, replay decode, race positions) reads its port through `isWorkerMessage` (`replayTrajectoryWorkerClient.ts`): under `npm run dev`
(`node --watch`) tsx posts `{ 'watch:import': [...] }` on every worker port, which was once read as an empty answer and lost new sessions and replays.
XML publishes ten-session transactions before proceeding; cached sessions whose XML is gone survive.
Results XMLs are assumed write-once at their paths (`XML_FORMAT.md`): ordinary scans skip stored
successful paths before stat/parsing. A new file that changed while it was read is not stored and is retried
as a failed read. A reparse keeps the stored replay link and DuckDB file (`restoreStoredSessionLinks`). Parser upgrades, explicit force reparses and failed reads
are the exceptions. Replay matching reads stored XML mtimes from SQLite; missing values fall back
to disk and failed reads retry. Validation runs during reconciliation without a per-session memo.
Each batch rates pace against the current main-thread benchmarks immediately before persistence,
then reapplies lap conditions, so delayed worker results cannot restore obsolete or wet-best ratings.
Replay discovery finishes and reconciles links in ten-session batches, yielding with
`setImmediate` and keeping `/scan/status` incomplete through replay-link and DuckDB ownership
reconciliation, before decoding associated recordings. Reconciliation is bounded by change stamps
(`server/core/dbReconciliationStore.ts`): replay links re-check sessions written, or near replays stored,
since `replay_links_reconciled_at`; DuckDB ownership loads only the sessions and replays in each new file's
time window and stores the owner's main file on its row and card. A replay sync asked for while links reconcile
runs once they finish; per-replay
jobs expose queued/processing/ready/failed states and whether a failed decode still has a playable primary trajectory. Launch actions remain available for playable cached data or DuckDB telemetry and report partial failures.
Async replay scans and upgrades use `server/core/replay/replayFileProgress.ts` to report one file percentage
across all pending drivers, reserving storage work before 100%; worker percentages never reset the file progress.
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
   - raw XML shapes: `sessionXmlTypes.ts`; streaming events (incidents, track limits, penalties, damage): `sessionXmlStream.ts` / `parseStreamEvents`;
   - `parseDriver` → per lap `parseLap`; then `applyLapTiming` (`sessionLapTiming.ts`), in one ordered pass: missing lap times inferred
     (`isInferred`), out-laps marked (`isOutLap`, rule `isCompletedPitStop` in `shared/domain/lapComparison.ts`), pit loss on the in-lap
     (`pitStopDuration`, spans in-lap + out-lap);
   - `annotateLapTraffic` (`shared/domain/raceTraffic.ts`): who was around the car on each lap;
   - `rateDriversPace` (`server/sessions/sessionPaceRating.ts`): each valid lap and the best lap against the cached benchmark targets;
   - `classifySessionLaps` (`server/sessions/sessionLapClassification.ts`): conditions (`shared/domain/lapConditions.ts`), non-representative
     laps (`shared/domain/lapRepresentativeness.ts`), clean-lap average, best-lap benchmark rating (a wet best lap is
     `bestLapWet` and unrated: the targets are dry laps);
   - car class: `shared/domain/vehicleMapping.ts` (`resolveDriverCarClass`, `mapVehicleIdToClass`); layout: `getCircuitSpecification`;
   - replay match: `findMatchingReplay` (`server/sessions/replayMatching.ts`).
2. **Store**: `dbSessionSync.ts` (holds `DB_PARSER_VERSION`; bumping it re-parses every stored session) → `dbSessionStore.ts`.
3. **Re-classify with rain**: `server/core/dbSessionConditions.ts` runs `classifySessionLaps` again with the replay's rain when a
   session gets its replay or the replay's conditions are stored, and sets the link's peak rain and weather from every stored
   condition (the header scan samples 30 windows and can miss the peak).
   Pace is rated during XML parsing; startup benchmark refresh no longer rewrites all detailed session JSON.
4. **Serve**: `GET /api/session/:id` (`server/routes/sessionRoutes.ts`) adds, per request and not stored:
   - telemetry links from stored ownership (`context.enrichSessionsWithTelemetry`);
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
  (`extractReplayTrajectory`) → laps sliced by `replayLapBuilder.ts` / `replayLapPoints.ts` → garage/pit state `garageState.ts`.
- Always on a worker: `worker/replayTrajectoryWorkerClient.ts` (bootstrap `.mjs`), used by `ReplayRecordingService` (`replayRecordingService.ts`).
- Driver selection prefers exact normalized names and rejects ambiguous partial matches.
  Native replay trajectories retain their session clock and timing-loop lap start; DuckDB fusion explicitly
  converts that clock to lap time, including early race laps. Older retained rows use their first sample.
  `decode/replayLapClassification.ts` recovers pit flags from retained lap spans, pit events and samples on read;
  matched XML classification takes precedence in `replayTransforms.ts`. Replay consistency uses
  `isCleanReplayLap` (`shared/domain/lapComparison.ts`) to exclude pit, out, invalid and non-representative laps.
  These read-time corrections preserve deleted recordings and require no cache version bump.
- Normalised facts (pure): `replayFacts.ts` → written by `server/core/replay/dbReplayLapStore.ts`
  (`replaceReplayDriverLapFacts`, `replaceReplayWideFacts`; read with `getReplayLaps`, `getReplayConditions`, `getLapConditions`).
- Trajectory blobs: `dbReplayTrajectoryStore.ts` + codec `replayTrajectoryCodec.ts`; downsampling `trajectoryDownsampler.ts`.
- Serving: `GET /api/session/:id/telemetry?driverOrdinal=&lapOrdinal=` (`replayRoutes.ts`) resolves one retained session and follows its stored replay link → `ReplayTrajectoryService` → `ReplayTelemetryService`
  (DuckDB reads only `TelemetryLinks.filesForSession`; replay-owned/unmatched recordings never serve a session request)
  (fuses DuckDB channels, `server/telemetry/telemetryFusion.ts`; native status/weather values take precedence,
  otherwise the current recorded VCR frame supplies discrete flags and weather. This prevents fused laps
  losing known on-track status after the timing-line sample. Fusion runs on request, without changing stored cache shapes)
  → `server/tracks/` (line cut `lapLineCut.ts`, projection
  `trackProjection.ts`, glitches `stationGlitches.ts`, geometry `serverTrackSync.ts`, store `trackGeometryStore.ts`).
- Replay serving is session-addressed; filename-based replay list/metadata/trajectory routes are removed.
  Settings retains `/api/replays/cache` and `/api/replays/upgrade` for recording maintenance.
- Traffic: `GET /api/session/:id/traffic` resolves the session's stored replay link → `server/traffic/raceTrafficService.ts` → race positions index
  (`racePositions.ts`, built on a worker by `racePositionsWorkerClient.ts`, stored by `dbRacePositionStore.ts`) → `trafficSpells.ts`.
- Client: `src/api/replayApi.ts` → `src/components/replay/ReplayInspectorPage.tsx` (route `/telemetry?sessionId=&driverOrdinal=&lapOrdinal=`):
  `inspector/` (data hook `useReplayInspectorData.ts`, `replayPlaybackCursor.ts` publishes frame-by-frame visual interpolation to the charts and map without rerendering the whole inspector between recorded samples; telemetry readouts remain on real samples, `useReplayPersonalBest.ts` (canonical same-layout/class leaderboard identity for the gold lap time), sidebar, timeline, `compare/` (Compare button, comparison lap picker and its rows); HUD assist labels reserve height so TC/ABS toggles do not resize the map), `map/` (GPS map; the SVG scene pieces are in `map/scene/`, racing lines share one non-scaling 28px hit stroke (44px on touch) per continuous section for nearest-sample selection; selected-corner ranges stay stable during playback to avoid rebuilding static paths, boundaries via
  `useTrackBoundaryGeometry.ts` from `/api/data-plugin/tracks/:layoutKey`; optional `mapSurfaces` road/kerb/runoff (plus optional apron, gravel and grass) polygons are drawn by
  `scene/GpsTrackSurfaceLayers.tsx` as compound paths preserving holes. Coordinates are local x/z meters; these
  display layers leave centerline projection and timing gates unchanged. `map/display/` owns persistent Layers
  preferences, optional revision-matched `/tracks-display/<layoutKey>.json` assets, quiet active-route backgrounds,
  fitting controls, a metric scale bar and `GpsBrakeMarkers.tsx` for optional world-position braking boards (faded by
  zoom level; boards without a station fall back to their order along the lap). Their
  labels report printed board distances; unknown distances use a generic brake label.
  `useStableCullViewBox.ts` (rule `nextCullViewBox` in `replayMapUtils.ts`) keeps the culling view box unchanged while
  the live view stays inside its margin, so the memoised `TrackPathLayers` in `scene/GpsTrackSegments.tsx` skip
  re-rendering during pans; `useGpsMapShortcuts.ts` acts only on the focused or expanded map, never on chart keys. Active road and kerbs are the defaults; runoff (one toggle for paved runoff, apron, gravel, grass and other circuit roads, with a colour key for the kinds present), pits,
  road edges and the centerline guide are opt-ins. Legacy files use a seam-free measured ribbon and measured kerb
  clipping; unavailable pit/outer-road controls are disabled. Layer toggles preserve camera and playback. Maps without
  surfaces retain the road ribbon),
  `telemetry/` (strip charts; `TelemetryScrubCursor.tsx` snaps the shared scrub line to physical pixels for stable thickness; channels by subsystem; `presets/`),
  `ReplayShortcutHelp.tsx` lists chart/map shortcuts. `src/utils/replayShortcuts.ts` excludes native controls, typing,
  browser modifiers and modal dialogs. Chart interaction supports Shift-wheel pointer-anchored zoom, Shift-drag range
  selection, Alt-drag pan, sample arrows / 0.5 s Shift-arrows, Home/End, +/− and 0 reset; distance windows and wheel
  normalization live in `telemetry/telemetryViewport.ts`, with viewport updates coalesced per animation frame.
  Space toggles playback from a chart/map; manual cursor selection pauses it. Map C centers once at the existing zoom,
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
| Session list (dashboard + track detail) | `/api/sessions` (list entries: no drivers, and the player's laps without traffic or steward records, `toSessionListEntry` in `sessionRoutes.ts`); `/api/track/:trackName` returns the server page consumed by the same list | | `components/session-list/` (`SessionList.tsx`; 25 per page via `useSessionPage.ts` + `SessionPagination.tsx`, `?page=` reset by `updateSearchParams` on any other filter change; `SessionFilterParts.tsx` two-row toolbar with Clear filters, used by `dashboard/DashboardFilterBar.tsx` and `track-detail/TrackSessionsToolbar.tsx`; row chips in `SessionRowParts.tsx`) |
| Tracks | `/api/tracks`; `/api/track/:trackName` (scoped history aggregate, compact filter options, server-paged cards, explicit `progressionPage` points and full-history position averages via `sessionSummaries/trackQueries.ts`) | `circuitSpecs.ts`, `circuitDefinitions.ts` | `components/track-summaries/` (native card links preserve class context; benchmark status/retry, unavailable pace sorting, explicit missing-record states; session-style PaceBadge and Last driven date), `components/track-detail/` (`useTrackDetailState.ts` drives server filters/pages; `TrackSurfaceProfiles.tsx` local road elevation/grade/bank traces) |
| Leaderboard & rivals | `leaderboardRoutes.ts` (`/leaderboard/layouts`, `/leaderboard`, `/rivals`, `/rivals/pin`), `dbRivalStore.ts` | `leaderboard.ts`, `rivals.ts`, `sessionRivals.ts` | `src/api/leaderboardApi.ts`, `components/leaderboard/` (`board/`, `ribbon/`, `rivals/`, `debrief/`, 2-lap compare; DTO telemetry availability is boolean and navigation uses session+ordinal locators; `picker/` pages compact lap candidates and fetches exact deep-linked laps separately) |
| Lap comparison | `/api/compare/laps` (`sessionSummaries/comparisonQueries.ts`: compact fact paging/aggregates and session+driver+lap ordinal hydration) | `lapComparison.ts` | `src/components/leaderboard/` (50-row numbered pages, one-row exact deep-link fetch, picker); `src/utils/telemetryCompareLink.ts` (session-scoped telemetry locators) |
| Benchmarks | `referenceRoutes.ts`, `server/benchmarks/referenceLaptimes.ts`, `server/benchmarks/benchmarkImpact.ts` (player laps only; `BENCHMARK_IMPACT_RULE` stamped on each diff, stored diffs from an older rule are recounted by `context.refreshBenchmarkDiffImpacts` after the startup refresh and on read; the status reads the latest update from its history row), `dbReferenceLaptimeStore.ts` (`benchmark_diff_history`) | `paceCategory.ts` | `src/api/referenceApi.ts`, `common/BenchmarkLadder.tsx` (the one benchmark display, session and track header cards), `settings/ReferenceChangesList.tsx` |
| AI engineer | `aiRoutes.ts`, `server/ai/aiReport.ts` (`PROMPT_VERSION`), `dbAiReportStore.ts` | `shared/types/aiReport.ts` | `src/utils/aiReportPayload.ts`, `replay/analysis/AIReportTab.tsx` |
| Settings & scans | `systemRoutes.ts` (`/status`, `/scan`, `/scan/status`, `/cache/clear`), `/replays/cache`, `/replays/upgrade` | | `components/settings/` (`SettingsPanel` panel + `FeedbackMessage`, `settingsFormat` numbers/plurals/bytes/dates with fallbacks, `aiKey` (clean and redact the Gemini key), `labelStyles.ts` (`READOUT_LABEL` / `FIELD_LABEL` shared label classes), `shared/domain/folderPath.ts` (`normalizeFolderPath` / `folderPathProblem`, used by the form and by `POST /scan`, which answers 400 `{error, field}`), `useSettingsScrollspy` TOC highlight, `PathField`, `OverviewCard` (the one status card: folders, sessions, replays, AI state, database size, telemetry files count, last sync, plus the scoped Clear parsed sessions action; section order is Overview, Reference Benchmarks, AI reports, AI history, Cached Replays, Folder Paths; `resolveSectionId` validates `?section=`), `ReferenceLaptimesCard` + `ReferenceChangesList` (purpose, pace categories, one status line, collapsed update history), `controls/InlineConfirm` + `useInlineConfirm` (focus returns to the trigger or the section heading), `hooks/` (`useAiSettings`, `useDeepLinkAlign`), `replays/` (cached-replay list model, `useReplayCache`, filters, table, progress; the table draws 200 rows at a time with "Show N more"; `replayView` / `replayFilter` / `replaySort` params beside `?section=`); `/replays/upgrade` also reports `currentVersion`, the version an on-disk replay must be at) |

Client routes (`src/App.tsx`): `/dashboard`, `/tracks`, `/track/:trackName`, `/leaderboard`, `/session/:sessionId`,
`/telemetry`, `/settings` (`/compare` redirects). Pages load on demand from `src/routePages.ts` (the current route's
page with the session data, the rest when idle; never import a page from the components barrel in `App.tsx`, and keep
recharts out of the entry: chunk groups in `vite.config.ts`). All server calls go through `src/api/apiClient.ts` (static track JSON via `src/api/trackGeometryApi.ts`).

Types: canonical in `shared/types/` (`index.ts` is the barrel; `session.ts` laps/drivers/sessions, `reference.ts` benchmarks, `status.ts` scan/system, `replay.ts` replay; `leaderboard.ts`, `pitStops.ts`, `raceTraffic.ts`, `aiReport.ts`).
`server/core/types.ts` re-exports them for server code; client and shared code import from `shared/types/index.ts`.

Track geometry: `shared/types/trackGeometry.ts` defines local-meter map polygons, station-indexed nullable physical
profiles, quality flags and independent geometry/projection revisions. `shared/domain/trackGeometry.ts` validates
bounded payloads, samples profiles cyclically, and computes asymmetric road-edge distances (+lateral offset is left, as OpenDRIVE t).
`server/tracks/trackGeometryStore.ts` caches validated definitions, indexes centerline projection, and tracks geometry/projection revisions across file replacements.
Unavailable measurements remain null; road and kerb geometry do not determine penalty validity.
Optional `leftKerbType`/`rightKerbType` profile columns carry the kerb surface category (`flat`, `sawtooth`, `other`, null
without a kerb); samples take the nearer station's type, and `server/tracks/serverTrackSync.ts` copies kerb width, height
and type onto each projected lap point.

Track detail keeps successful data keyed to its requested track, shows loading when switching back to a previously visited track, and offers an inline retry warning when a same-track refresh fails. Route sort values are validated. Circuit information uses the body-portaled focus/scroll isolation hook `src/components/common/useModalFocus.ts`. Progression view and series controls expose their pressed state and support keyboard operation.

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
detailed map surfaces; the information modal still loads physical profiles independently. Static geometry,
display assets and outlines are served from their public directories (or dist equivalents) by `server/index.ts`.
`src/api/trackGeometryApi.ts` loads/validates display assets against layout identity and `geometryRevision`;
stale assets are ignored while generation replaces files. The optional display contract is `TrackMapDisplay`
in `shared/types/trackGeometry.ts`, validated by `parseTrackMapDisplay` in `shared/domain/trackGeometry.ts`.
Leaderboard navigation resolves missing or `All` classes from the selected layout's last-driven class (or first available class), while preserving a valid specific class deep link.

## 5. Cache versions: what to bump

| Constant | File | Bump when | Effect |
|---|---|---|---|
| `DB_PARSER_VERSION` | `server/core/dbSessionSync.ts` (exported const) | a parser/lap classification rule changes | every stored session re-parsed from XML |
| `SESSION_SUMMARY_PROJECTION_VERSION` | `shared/types/sessionSummaries.ts` | persisted summary or lap-fact rules change (now 4: derived facts on the row tables) | bounded rebuild from the stored rows, without XML reads |
| `REPLAY_MATCHING_PROJECTION_VERSION` | `server/core/replay/dbReplayMatchingStore.ts` | persisted replay matching facts change | one-time rebuild from retained metadata, without VCR reads |
| `REPLAY_CACHE_VERSION` | `server/core/dbSchema.ts` | decoded replay rows change | on-disk replays decoded again in the background (deleted ones kept as they are) |
| `DUCKDB_TELEMETRY_CACHE_VERSION` | `server/core/dbSchema.ts` | DuckDB lap cache shape changes | lap cache rebuilt |
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
- Tests mirror the source tree: `test/server/<domain>/`, `test/domain/`, `test/utils/`, `test/components/<feature>/`.
- Fixtures: `test/fixtures/{results,replays,telemetry}`; synthetic VCR with `test/utils/mockVcr.ts`; leaderboard fixtures `test/domain/leaderboardFixtures.ts`.
- The user runs the dev server (UI 5173, API 3001). Session JSON: `GET http://localhost:3001/api/session/<id>`.

## 8. Other docs

`docs/XML_FORMAT.md`, `docs/VCR_FORMAT.md` (incl. pit event codes), `docs/VCR_ANALYSIS.md`, `docs/TELEMETRY_FORMAT.md`
(incl. the sign conventions: ISO 8855 vehicle axes, so steering, yaw rate, lateral G and lateral offset are positive left;
LMU's swapped `G Force Lat`/`Long` labels; unmarked cached rows flipped on read),
`docs/LMU_REST_API.md` (+ `swagger-schema.json`; probe gently, ≤1 Hz), `docs/plans/`.

---

## 9. Smells that need attention

UI color cleanup: component SVG colors and handling bands consume `src/utils/themeColors.ts`, including the racing-line speed gradient stops and brake-board tick colors. Scrollbars resolve the existing `lmu` Tailwind palette, and telemetry cursor badges share `shadow-marker-lift` in `src/index.css`; color opacity remains separate from SVG fill tokens.

Fullscreen GPS map hardening: `map/useMapFullscreenFocus.ts` isolates the in-place expanded map, locks scrolling and restores focus while allowing body-portaled shortcut help. W/A/S/D pan the camera without scrubbing. The fullscreen turn picker was removed at the user's request because turn selection exits fullscreen; map corner markers remain. `map/display/telemetryReadouts.ts` keeps absent/non-finite channels unavailable, preserves neutral/reverse gears and avoids assuming pit speed or penalty validity. `GpsMapExpandedOverlays.tsx` separates fullscreen controls/readouts from the track scene. Line-fade and HUD-collapse states are exposed; the friction panel suppresses unavailable acceleration and honors explicitly missing aligned baselines. HUD/marker annotations meet the 10px floor, assist badges occupy the caption row, and numeric readouts use tabular figures and the established Consolas family. Primary/Baseline labels identify the inspected and reference laps without assuming player/rival identity; fade controls name their action and delta help distinguishes time difference from racing-line separation. Overlay surfaces, labels and signals use semantic tokens; shortcut help shares the red focus ring. Below 1536px the friction panel sits above the HUD, and the layers menu scrolls within a viewport-relative height limit. Audit findings 1, 3–8 and 10 are addressed; finding 2 retains keyboard pan but no fullscreen keyboard turn picker. Broader constrained desktop layout/zoom validation remains a follow-up. Evidence and priorities are in [fullscreen-gps-map-audit.md](fullscreen-gps-map-audit.md).

Session-detail accessibility hardening: `SessionRulesModal` portals into the body, isolates background content with `inert`, traps focus and restores the trigger and scrolling on close. Circuit navigation is a React Router link; chart legend visibility uses native toggle buttons. Debrief status/errors are announced through status/alert regions. See `session-detail-audit.md` for the remaining findings.

Found while writing this map. Remove an item when it is fixed; add new ones as they are noticed. The fix plan is `docs/plans/SMELLS_CLEANUP.md`.

**Size limits close to the edge**
- Files near the 1,000-line limit: `shared/domain/circuitDefinitions.ts` (775, a data file: one entry per layout).
- Folders near 20 files: `src/components/common/` (19 with `index.ts`; the replay action already lives in `common/replay/`), `test/utils/` (17);
  `src/components/replay/inspector/` is at 17 (comparison picker split into `compare/`) and `test/components/replay/telemetry/` at 17.
- Components near the 300-line limit: `DashboardHero.tsx` (282), `ReplayInspectorContent.tsx` (280), `SessionTelemetryChart.tsx` (271).

**Logic in the wrong place / duplicated**
- `GET /session/:id` mutates the cached session object that `getAllSessions` also hands out; the pit details are recomputed on every request.
- Version constants are spread across five files; the table in section 5 is the index.
- `lapClassPosition` (`shared/domain/lapPlaces.ts`) matches car classes by lowercased name instead of `mapVehicleIdToClass`.
- The improvement chart keeps its own `SessionProgressionPoint` (`improvementChartTypes.ts`), a copy of the shared one plus the
  benchmark pace fields.

**Rule exceptions**
- `server/core/types.ts` is a re-export barrel: server code imports types through it, so the same types have two import paths.

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
on the shortest arc. Missing yaw keeps a dot. Local package loading in `server/plugins/` is implemented; model outlines
use model shapes when available, with approximate placement until a replay-origin offset is established.


## Local data packages

`server/plugins/dataPlugin.ts` loads one validated startup snapshot from backend-only
`LMU_PLUGIN_ROOT`; `trackPackage.ts` verifies canonical revisions and the allowlist,
rejects degenerate closed routes, and checks declared length against the measured route within 0.01 m.
`server/routes/dataPluginRoutes.ts` exposes status, tracks (geometry/display pair),
vehicles (without logos), and optional manufacturer logos (`GET /api/data-plugin/vehicles/logos`; a malformed logo
entry is skipped, not fatal), with the same server access behavior as the rest of the API. There is no static package mount.
`resolveCarManufacturer` (`shared/domain/vehicleMapping.ts`) matches car names against a word-bounded rule table.
The client loads logos via `src/api/vehicleLogosApi.ts` (one shared request; a failure is cached for
`LOGO_RETRY_COOLDOWN_MS` before retrying) and renders manufacturer SVG badges via `src/components/vehicle/CarLogo.tsx` across car views (dashboard hero and cars card, session lists, session details, standings, track details, leaderboard, and rivals). Rows that name a car use `src/components/vehicle/CarIdentity.tsx` (logo, name and class badge with one spacing and tooltip; the logo is decorative next to the visible name).
`serverTrackSync.ts` and `TrackGeometryStore` use this provider for projection and
surface enrichment. Missing geometry clears old road annotations and marks odometer stations;
`shared/domain/trackGeometry.ts` provides `hasCompatibleTrackStations` to reject odometer stations and require matching station sources and geometry revisions. `ReplayInspectorContent`, replay corner consistency, session debrief and leaderboard debrief gate geometry-dependent corner results with this check; recorded-channel analysis remains available without compatible track geometry. Metric map caches
include package revision. Basic SVG layouts remain bundled and thumbnail helpers can use them
without loading any metric data.

Replay metadata and trajectory services resolve each selected driver's own vehicle record.
`GpsSceneCarMarkers` uses available model dimensions/outlines independently of origin calibration.
Known replay offsets are applied; absent offsets preserve the model origin and label placement
as approximate. Class estimates are used only when model dimensions are missing. Cloud AI remains available with or without a package and uses the existing summarized evidence contract; missing geometry reduces available detail.
`tools/release/checkLocalData.mjs` runs before and after builds to reject detailed static
assets and generated catalogs. Synthetic provider/footprint tests are always available;
personal geometry/recording regressions require private roots (see [PLUGINS.md](PLUGINS.md)).
