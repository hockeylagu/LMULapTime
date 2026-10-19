# Code Map: Where Things Live and How They Flow

A fast index for development: find the right file without searching. `AGENTS.md` holds the rules;
this file holds the **routes through the code**. Keep it current (see "Keeping this file current" at the end).

Canonical domain contracts live in `shared/types/`; `shared/types/index.ts` is the approved barrel.
Import server telemetry reader contracts directly from `server/telemetry/duckdbTypes.ts`.
Local contracts have independent owners: replay storage facts in `server/core/replay/replayStorageTypes.ts`,
decode options in `server/replay/decode/replayTrajectoryTypes.ts`, telemetry chart results in
`src/components/replay/telemetry/telemetryChartTypes.ts`, and map markers in
`src/components/replay/map/gpsTrackMapTypes.ts`. Import these directly to avoid cycles through consumers.

Verification baseline: 3,256 tests passed, 56 intentionally skipped; production build clean (zero warnings, zero errors).

---

## Live Capture and Learning

`capture/decode.ts` and `capture/channels.ts` own the 34-value normalization-version-3 catalog.
It retains corrected vehicle-vector signs and records all 28 wheel values, including tyre deflection.
`capture/terrain.ts` interns terrain names into sparse dictionary definitions/change events in the writer;
the controller also retains source-timed impact magnitudes and opaque player upgrade-pack configuration.
Version-1 files remain unchanged; `readRecording.ts` normalizes their motion signs on read and
reports the source version. See [wheel evidence and mappings](plans/WHEEL_CAPTURE_EVIDENCE.md).

Contracts and pipeline specifications: [Live capture reference](LIVE_CAPTURE_FORMAT.md) and [Live session evidence plan](plans/LIVE_SESSION_EVIDENCE.md).

| Owner | Responsibility |
|---|---|
| `server/live/capture/controller.ts`, `recordingWorker.ts`, `recordingStore.ts` | Bounded player capture, worker-owned DuckDB writes and recovery |
| `server/live/capture/diagnostics.ts`, `livePitPoller.ts`, `liveReaderWorker.ts` | Disposable session diagnostics and request provenance |
| `server/core/live/dbLiveCaptureStore.ts`, `server/live/capture/reconcile.ts` | SQLite attachment index and strict XML ownership |
| `server/live/capture/evidenceService.ts`, `evidenceReader.ts`, `readRecording.ts` | Verified, off-track lap evidence reads |
| `shared/domain/live/liveTelemetryFusion.ts`, `src/api/liveEvidenceApi.ts` | Aligned evidence consumption and coverage |
| `shared/domain/live/liveAudit.ts` | Consolidated live strategy audit (checkpoints during capture) |
| `shared/domain/learning/capture.ts`, `examples.ts`, `evaluate.ts`, `calibration.ts`, `automatic.ts` | Frozen forecasts, examples, evaluation and correction gates |
| `server/live/learning/service.ts`, `runtime.ts`, `automaticWorker.ts` | Projection refresh, persisted model lifecycle and exact live lookup |
| `server/live/learning/readiness.ts`, `readinessReader.ts`, `server/routes/liveRoutes.ts` | Manual Settings evidence check |
| `server/core/live/dbLiveLearningStore.ts`, `dbLearningModelStore.ts` | Compact learning facts and correction models |

---

## 1. The Four Data Sources and Ingest Pipelines

| Source | Files on disk | Ingest entry | Stored in (SQLite, `server/lmu_cache.db`) |
|---|---|---|---|
| XML results log | `UserData/LOG/Results/*.xml` | `server/core/dbSessionSync.ts` → `LmuParser.parseSessionXml` (`server/sessions/parser.ts`) | `sessions` (58 scalar columns) and row tables: `session_recordings`, `session_drivers`, `session_laps`, `session_lap_passes`, `session_events`, with dictionaries `drivers`, `vehicles`, `teams` |
| Binary replay | `UserData/Replays/*.Vcr` | `server/core/replay/dbReplaySync.ts` → worker (`server/replay/worker/replayTrajectoryWorker*.ts`) → `replayTrajectory.ts` → `replayFacts.ts` | `replay_metadata`, `replay_trajectories`, `replay_facts`, `replay_laps`, `replay_conditions`, `replay_driver_events`, `replay_running_order`, `replay_race_positions` |
| App live capture | `server/live-captures/*.live.duckdb` | `server/live/capture/controller.ts` → recording worker; strict XML reconciliation | Raw streams in DuckDB; SQLite holds attachments and compact learning projections |
| Native DuckDB 100 Hz telemetry | `UserData/Telemetry/*.duckdb` | `server/telemetry/telemetryCatalog.ts` → `duckdbReader.ts` | `telemetry_metadata`, `telemetry_lap_cache` |

### SQLite Storage & Normalized Rows
- **DDL coordination**: `server/core/dbSchema.ts`. Additive projections live in `server/core/sessionSummaries/schema.ts` and `aggregateStore.ts`. Replay matching schema is in `server/core/replay/replayMatchingSchema.ts`. Cache versions and compression helpers live in `server/core/dbCache.ts`.
- **Normalized session storage** (`server/core/sessionRows/`):
  - `specs.ts` / `fields.ts`: declares stored column contracts.
  - `schema.ts`: DDL, table constraints, derived-column definitions, and index rules.
  - `writer.ts` (`writeSessionRows`, `updateDerivedColumns`): writes rows transactionally with their projection.
  - `reader.ts` (`readSession`, `sessionScalars`, `driverScalars`, `recordingLink`): assembles `DetailedSession` from normalized rows.
  - `access.ts`: exposes `loadSessions` (ordered reads), `readStoredLinkState` (link and DuckDB file), and `sameReplayLink`.
  - `targeted.ts`: granular updates for replay links, names, telemetry, and conditions.
  - `canonical.ts`: defines round-trip expectations for regression tests and attachment helpers (`sessionTelemetry`, `withSessionTelemetry`).
  - `stub.ts`: bare session fixture generator for tests and tools.
- **Dictionaries**: `drivers` (keyed by exact name; player/human flags belong to session driver row), `vehicles` (raw XML car type and class), `teams` (name). Emptied with session cache; never pruned.
- **Derived columns**: stored on `session_drivers` (`is_human`, `driver_class`, `clean_laps_count`, `driving_time_seconds`, `max_top_speed`, `best_lap_ordinal`, `top3_average`, `consistency_score`, etc.) and `session_laps` (`condition_group`, clean/representative/human/leaderboard flags). Raw columns retain original XML values (`lap_number`, `is_pit_stop`).

### Benchmark Rating & Comparison Queries
- **Benchmark lookup**: `createBenchmarkLookup` (`shared/domain/paceCategory.ts`) resolves benchmark targets once per batch; `createPaceCalculator` (`server/benchmarks/referenceLaptimes.ts`) reuses target matches within a read. `calculateBenchmarkPace` owns percentage/delta rounding and category selection.
- **Telemetry comparison queries** (`server/core/sessionSummaries/comparisonQueries.ts`):
  - `queryTelemetryComparableLaps`: direct SQL reads of matching rows for pagination without hydrating full sessions.
  - Scopes: `sort` (`lap`, `recent`, `driver`), `sessionKind` (`practice`/`quali`/`race`), `condition` (`Dry`/`Wet`/`Dynamic Weather`) defined in `shared/domain/compareLapScope.ts`.
  - Personal-best badges: Gold = class best across any car and condition; Blue = session best. Ranked with a single window query (`markPagePersonalBests`) across the page's drivers.
  - Compare page (`useCompareLapsData.ts`): `playerBestLap` (clean dry PB) and `overallTrackBestLap` come strictly from exact server bests.
  - Replay inspector reference suggestion: `useReferenceLapSuggestion.ts` (`pageSize=1`, `carType`, `driverExact=true`, `excludeLap`).
  - Replay session context: `server/core/sessionRows/replayContext.ts` reads roster, replay link, and official timing (`ReplaySessionContext`, `ReplayContextDriver`, `ReplayTimingLap` in `replayServiceTypes.ts`).
- **Session summary facts**: `server/core/sessionSummaries/store.ts` and `aggregateStore.ts` maintain `session_summary_facts` and `session_driver_condition_summaries` transactionally with ingestion. Cards are constructed directly from columns by `cards.ts` (`readSessionCards`).
- **Aggregation engine**: `buildSessionSummaryProjection.ts` selects clean laps once per driver, reuses selections for consistency and top-N metrics, and checks membership with a Set.
- **Summary readiness gate**: `server/routes/summaryReadiness.ts` returns 503 on history endpoints while summaries rebuild (`isSessionSummaryReady` checks covering index `idx_sessions_ready`).

### Replay & Telemetry Ingestion Invariants
- **Replay permanence**: Replays are the source of truth once cached. LMU deletes older `.Vcr` files; cached SQLite rows are retained and must never be deleted just because the source file is gone.
- **DuckDB telemetry ownership** (`server/telemetry/telemetryLinks.ts`, `TELEMETRY_LINK_RULE = session-span-exact-identity-player-v5`):
  - Matches DuckDB files to sessions via session time spans and player identity.
  - Venue-only matching: official venue names without layout are layout-unspecified; explicit layout names must match the owner layout (`server/telemetry/telemetryMatcher.ts`).
- **Background orchestration**:
  - `src/api/useAppData.ts` coordinates client polling during active scans and upgrades. `/scan/status` exposes monotonic `dataRevision`. `/status` includes server instance identity and plugin revision.
  - Ingestion worker: `server/core/ingest/fileIngestWorker*.ts` parses XML and replay metadata in worker threads, returning unrated facts.
  - Worker port safety: every worker client checks messages with `isWorkerMessage` (`server/core/workerThreads.ts`) to ignore dev-mode watcher traffic (`watch:import`).
  - Result XML write-once: completed XMLs skipped unless forced or parser version bumped.
  - Replay decode queue & errors: `dbReplayIngestStore.ts`, `failed` vs `interrupted`, settles after `MAX_DECODE_ATTEMPTS`.
  - `ServerContext` (`server/core/serverContext.ts`) manages background scan jobs (`backgroundScan.ts`), telemetry catalog, replay links (`SessionReplayLinks`), and upgrade runner (`ReplayUpgradeRunner`).

---

## 2. Life of a Session (XML → Screen)

```
Results XML ──> LmuParser ──> dbSessionSync ──> Normalized SQLite Rows
                                                       │
                                      GET /api/session/:id (with rateSessionDetail + pit stops)
                                                       │
                                                       ▼
                                         SessionDetail (React UI)
```

1. **Parse** (`server/sessions/parser.ts`, `parseSessionXml`):
   - Ingests raw XML shapes (`sessionXmlTypes.ts`) and streaming events (`sessionXmlStream.ts` / `parseStreamEvents`).
   - `applyLapTiming` (`sessionLapTiming.ts`): infers missing lap times (`isInferred`), flags out-laps (`isOutLap`), computes pit stop loss (`pitStopDuration`).
   - `annotateLapTraffic` (`shared/domain/raceTraffic.ts`): determines nearby cars and pressure per lap.
   - `classifySessionLaps` (`server/sessions/sessionLapClassification.ts`): assigns lap conditions (`lapConditions.ts`), flags non-representative laps (`lapRepresentativeness.ts`), and computes clean-lap averages (`bestLapWet`).
   - Resolves car class (`vehicleMapping.ts`) and circuit specification (`circuitSpecs.ts`).
   - Matches replay candidate (`server/sessions/replayMatching.ts`).
2. **Store**: `dbSessionSync.ts` (coordinates `DB_PARSER_VERSION`) → writes normalized rows via `server/core/sessionRows/writer.ts` and projection facts via `aggregateStore.ts`.
3. **Re-classify with rain**: `server/core/dbSessionConditions.ts` updates lap conditions using replay rain data when a linked replay is attached or decoded.
4. **Serve**: `GET /api/session/:id` (`server/routes/sessionRoutes.ts`) decorates session rows with read-time benchmark ratings (`rateSessionDetail`), bounded history context (`querySessionContext`), per-driver personal best (`querySessionPersonalBestById`), and replay pit stops (`attachPitServices`, `sessionPitStops.ts`, `shared/domain/pitStops.ts`).
5. **Client fetch**: `src/components/session-detail/useSessionDetailData.ts` fetches `/api/session/:id`.
6. **Render** (`src/components/session-detail/SessionDetail.tsx`):
   - `overview/`: session header, `DriverPerformancePanel`, `BestLapBlock`, `BenchmarkLadder`, and conditions.
   - `standings/`: classification, fuel, race result, safety statistics (`DriverSafetySummary.tsx`).
   - `table/`: lap timing rows (`SessionLapTableRow.tsx`), stewards' event lines (`table/SessionLapStewardsLine`), and expandable event debriefs (`SessionLapDetailsRow.tsx`, `lapDetailSections.ts`, `pitStopText.ts`, `src/utils/lapTrafficText.ts`). Memoizes class ranks via `shared/domain/lapPlaces.ts`.
   - `debrief/`: on-demand debrief (`loadSessionDebrief.ts`, `src/utils/sessionDebrief.ts`, hook `useSessionDebrief.ts`).
   - `chart/`: session telemetry overview.

---

## 3. Life of a Replay Lap (VCR → Telemetry Studio)

```
Binary .Vcr ──> Worker Decode ──> Normalized Facts & Trajectory Blobs (SQLite)
                                                 │
                               GET /api/session/:id/telemetry
                                                 │
                                                 ▼
                              Telemetry Fusion + Track Projection
                                                 │
                                                 ▼
                                     ReplayInspectorPage (React UI)
```

1. **Decode pipeline** (`server/replay/decode/`):
   - `replayParser.ts`: reads header, driver index, and slice markers (`docs/VCR_FORMAT.md`).
   - `replayTrajectory.ts` (`extractReplayTrajectory`, `extractReplayDriverTrajectories`): extracts trajectory points via `replayPose.ts` and `replayTrajectoryFinalizer.ts`.
   - `replayLapBuilder.ts` / `replayLapPoints.ts`: slices samples into discrete laps; `garageState.ts` handles pit and garage transitions.
   - Pit flag recovery: `replayLapClassification.ts`; clean replay lap validation: `isCleanReplayLap` (`shared/domain/lapComparison.ts`). Missed laps return `ReplayLapNotRecordedError` (404).
2. **Worker ingestion**:
   - `worker/replayTrajectoryWorkerClient.ts`: executes in worker threads; stages pose chunks in worker SQLite TEMP storage (`replayDriverSamples.ts`).
   - Atomic commits of trajectory blobs, facts, and ingest markers via `server/core/replay/dbReplayDriverStore.ts`. Primary slot promotion via `resolveReplayPrimarySlot`.
3. **Persisted replay facts**:
   - Facts: `replayFacts.ts` → stored via `server/core/replay/dbReplayLapStore.ts` (`replaceReplayDriverLapFacts`, `replaceReplayWideFacts`).
   - Columnar trajectory blobs: stored via `dbReplayTrajectoryStore.ts` using `replayTrajectoryCodec.ts`. Downsampler `trajectoryDownsampler.ts` preserves apex speed minimums, straight maximums, and braking onsets.
4. **Telemetry fusion & track projection**:
   - `server/telemetry/telemetryFusion.ts`: fuses high-rate DuckDB channels with replay telemetry. Native status/weather take precedence; VCR supplies discrete flags and weather.
   - `server/tracks/`: interpolates timing line crossings (`lapLineCut.ts`), centerline projection (`trackProjection.ts`, reusing candidate segments during search), and glitch repair (`stationGlitches.ts`).
5. **Serving**:
   - `GET /api/session/:id/telemetry` (`replayRoutes.ts`): session-addressed via `ReplayTrajectoryService` / `ReplayTelemetryService`.
   - `GET /api/session/:id/traffic`: reads race position index (`racePositions.ts`, `racePositionsWorkerClient.ts`, `dbRacePositionStore.ts`) to produce traffic spells (`trafficSpells.ts`).
6. **Replay Inspector UI** (`src/components/replay/ReplayInspectorPage.tsx`, route `/telemetry`):
   - **Data & cursor**: `useReplayInspectorData.ts` (remaps scrub index across reloads using `getDistancesInReferenceFrame`), `replayPlaybackCursor.ts` (rAF frame interpolation without full rerenders), `useReplayPersonalBest.ts`.
   - **Inspector title**: `ReplayInspectorTitle.tsx` (weather, rain intensity, air/track temps; lap conditions take precedence over replay metadata).
   - **GPS Map** (`map/`):
     - Heatmap modes: Delta (cumulative gap) and Gain / Loss (local change in s/s over ±0.3s window, 0.015 s/s deadband, 0.16 s/s saturation via `computeGainLossByIdx` in `replayMapUtils.ts`).
     - Scene layers: `scene/GpsTrackSegments.tsx` (racing lines with non-scaling hit stroke), surface layers `scene/GpsTrackSurfaceLayers.tsx` (road/kerb/runoff compound paths with holes).
     - Culling view box: `useStableCullViewBox.ts` (`nextCullViewBox` in `replayMapUtils.ts`) skips re-rendering track paths during pan.
     - Marker layout: `scene/markerPlacement.ts` coordinates collision checks across brake boards, START, sectors, turns, APEX, and pedal badges using spatial road index `scene/cornerRibbonClearance.ts`. Start badge placed by `scene/startFinishPlacement.ts`. Turn badges placed by `placeCornerBadges`.
     - Car markers & dynamics: `GpsSceneCarMarkers.tsx` renders primary and ghost with model dimensions or `defaultVehicleSize` (`vehicleDimensions.ts`), replay body yaw (`replayBodyHeading`, native -Z forward). Composes hooks `useGpsSceneProjection.ts`, `useGpsSceneDynamics.ts`, and `useGpsSceneCameraFocus.ts`.
     - Map controls & layers: `display/mapLayers.ts`, `MapLayersControl.tsx`, brake boards `GpsBrakeMarkers.tsx`, shortcuts `useGpsMapShortcuts.ts` (M toggles fullscreen, T toggles trace, Space toggles play, C centers, F toggles follow).
   - **Fullscreen Telemetry Dock** (`map/telemetry/GpsMapTelemetryDock.tsx`):
     - 112px trace dock, quick Speed, Delta, and Throttle + Brake buttons.
     - `GpsMapPlaybackStrip.tsx` (playback controls and cursor), `GpsMapTelemetryHud.tsx` (inline readouts and live delta).
     - `GpsMapLapTimingPanel.tsx` (recorded lap/sector times, baseline deltas, live sector split via `display/liveSectorSplit.ts`).
     - `GpsMapCompactTrace.tsx` (renders Speed, Pedals, Delta with 56px scale gutter).
   - **Telemetry strip charts** (`telemetry/`):
     - Multi-channel charts, `TelemetryScrubCursor.tsx` (sub-pixel snapping), channel presets (`presets/`).
     - Channel scaling: Gear G1-G7 (`gearTraceY` in `telemetryChartPathBuilders.ts`), steering symmetric lap-wide fit (±25/50/100%).
     - Viewport & gestures: `telemetry/telemetryViewport.ts` (Shift-wheel zoom, Shift-drag range, Alt-drag pan, keyboard navigation via `src/utils/replayShortcuts.ts`).
   - **Analysis** (`analysis/`):
     - Corner phase breakdown cards, consistency tab, AI engineer tab (`AIReportTab.tsx`).
     - Steering handling balance: `src/utils/handlingBalance/evidence.ts` (requires sustained response deficit or rear slide, not just Ackermann residual; with baseline, requires ≥0.10s delta growth and sustained speed deficit).

---

## 4. Features Overview

| Feature | Server | Shared Domain | Client |
|---|---|---|---|
| Dashboard | `/api/dashboard` (`sessionSummaries/dashboardQueries.ts`) | `trackSummaryUtils.ts`, `paceCategory.ts` | `components/dashboard/` (`useDashboardData.ts`, `Dashboard.tsx`) |
| Session list | `/api/sessions` (`sessionSummaries/pageQueries.ts`, `cards.ts`) | | `components/session-list/` (`SessionList.tsx`, `SessionGridCard.tsx`) |
| Tracks | `/api/tracks`, `/api/track/:trackName` (`sessionSummaries/trackQueries.ts`) | `circuitSpecs.ts`, `circuitDefinitions.ts` | `components/track-summaries/`, `components/track-detail/` |
| Leaderboard & rivals | `leaderboardRoutes.ts`, `dbRivalStore.ts` | `leaderboard.ts`, `rivals.ts`, `sessionRivals.ts` | `src/api/leaderboardApi.ts`, `components/leaderboard/` (`rivals/useRival.ts` with `includeRival=true`) |
| Lap comparison | `/api/compare/laps` (`comparisonQueries.ts`, `comparisonLapRows.ts`) | `lapComparison.ts`, `compareLapScope.ts` | `components/leaderboard/`, `src/utils/telemetryCompareLink.ts` |
| Benchmarks | `referenceRoutes.ts`, `server/benchmarks/` (`referenceLaptimes.ts`, `benchmarkImpact.ts`), `dbReferenceLaptimeStore.ts` | `paceCategory.ts` | `src/api/referenceApi.ts`, `common/BenchmarkLadder.tsx`, `settings/ReferenceChangesList.tsx` |
| AI engineer | `aiRoutes.ts`, `server/ai/aiReport.ts`, `dbAiReportStore.ts` | `shared/types/aiReport.ts` | `src/utils/aiReportPayload.ts`, `replay/analysis/AIReportTab.tsx` |
| Settings & scans | `systemRoutes.ts`, `/replays/cache`, `/replays/upgrade` | `shared/domain/folderPath.ts` | `components/settings/` (`SettingsPanel.tsx`, `OverviewCard.tsx`, `replays/`) |

### Cross-Cutting Architecture
- **Dashboard benchmark pace**: `averageQualifiedBenchmarkPace` in `paceCategory.ts` averages each eligible group's lowest percentage (minimum 3 sessions) with equal group weighting.
- **Client routing & code splitting** (`src/App.tsx`, `src/routePages.ts`): Pages load on demand via custom preload wrapper without `React.lazy` reveal-throttling. Recharts is excluded from the initial bundle (`vite.config.ts`).
- **Canonical contracts**: Centralized in `shared/types/` (`session.ts`, `reference.ts`, `replay.ts`, `leaderboard.ts`, `live.ts`, `trackGeometry.ts`, `dashboard.ts`, `status.ts`).
- **Track geometry & surfaces**: `shared/types/trackGeometry.ts` defines map polygons, elevation/grade profiles, and revisions. Validated by `shared/domain/trackGeometry.ts`, stored in `server/tracks/trackGeometryStore.ts`, and served via `/api/data-plugin/tracks/:layoutKey`.
- **Standardized dropdowns**: `src/components/common/dropdown/` (`Select.tsx`) is the sole single-choice selection control; it anchors fixed-position panels via `useAnchoredPanel.ts` and dismisses via `useOutsidePress`.
- **Session cards**: `session-list/SessionGridCard.tsx` renders bundled SVG outlines from `/track-outlines/<layoutKey>.svg` without fetching heavy metric geometry.

### Live Race Dashboard
- **Client** (`#/live`, contracts in `shared/types/live.ts`, `liveStrategy.ts`):
  - `src/api/liveStream.ts` (`useLiveStream`): manages SSE stream (`/api/live/stream`) with reconnect backoff.
  - `LiveTimingStore`: separate `useSyncExternalStore` subscription for high-frequency (5 Hz) timing updates.
  - `LiveEstimatedLap`: distinguishes out-laps from active line projections based on running deltas.
  - UI modes: `LiveRaceView`, `LiveQualiView`, `LivePracticeView`, `LivePracticeHistory`, `LivePedalTrace` (canvas rAF from `PedalBuffer` ring), `LiveRacePlan.tsx` (`raceColumns.ts`, `raceAction.ts`), `LiveGarageChecklist.tsx`, `LiveDamageRow.tsx`, and `LiveSessionReview.tsx`.
  - Offline demo mode: `demo/LiveDemoPage.tsx` (`#/live?demo=1`, scenarios in `demo/demoScenarios.ts`).
- **Server** (`server/live/`):
  - Shared memory reader: `rf2Layout.ts` defines rF2/LMU v3.x layout offsets; `rf2Decode.ts` performs coherent 3-attempt buffer reads, resolving overall and class leaders independently (`knownCarClass`). `sharedMemory.ts` accesses Windows file mappings via koffi. Tooling: `tools/telemetryRecorder.ts`.
  - Process lifecycle: `gameProcess.ts` monitors `Le Mans Ultimate.exe` via Windows Toolhelp handles.
  - REST poller: `livePitPoller.ts` queries LMU REST endpoints (`lmuHttp.ts`) at safe intervals, pausing sensitive reads (e.g. `getVehicleCondition`) in replays. `lmuNavigation.ts` probes state; `liveIdentityResolver.ts` resolves session layouts.
  - Deterministic engines: `liveLapTiming.ts`, `liveLapsLeft.ts` (`computeLapsLeft`, `projectRaceFlagSeconds`, `raceClockRunning`), `liveResourcePlan.ts` (`planRace`, `neededStopNow`, `planGarage`), `liveCarCondition.ts`, `liveWeather.ts`, `liveInsights.ts`, and `liveAudit.ts` (`LiveAuditTracker`).
  - Scan hold: `ServerContext.setLiveSessionLoaded` queues background scans while a live session is running (`holdForLiveSession`, `runHeldScans`).

### Local Data Packages (`server/plugins/`)
- `dataPlugin.ts` loads external track geometry, physical profiles, and manufacturer assets from backend-only `LMU_PLUGIN_ROOT`.
- `trackPackage.ts` validates geometry revisions and route lengths within 0.01m. Routes in `dataPluginRoutes.ts` serve geometry and vehicle logos (`/api/data-plugin/vehicles/logos`).
- Geometry validation: `hasCompatibleTrackStations` (`shared/domain/trackGeometry.ts`) requires matching geometry revisions before computing geometry-dependent corner analysis; missing geometry leaves recorded-channel analysis available.
- Vehicle logos: `resolveCarManufacturer` (`shared/domain/vehicleMapping.ts`) matches names against a word-bounded rule table. Client loads logos via `src/api/vehicleLogosApi.ts` and renders `CarLogo.tsx` and `CarIdentity.tsx`.

---

## 5. Cache Versions: What to Bump

| Constant | File | Bump when | Effect |
|---|---|---|---|
| `DB_PARSER_VERSION` | `server/core/dbSessionSync.ts` | XML parser or lap classification rules change | Every stored session is reparsed from XML |
| `SESSION_SUMMARY_PROJECTION_VERSION` | `shared/types/sessionSummaries.ts` | Persisted summary facts or derived column rules change | Bounded rebuild from stored rows without XML rereads |
| `REPLAY_MATCHING_PROJECTION_VERSION` | `server/core/replay/dbReplayMatchingStore.ts` | Replay matching criteria change | One-time rebuild from retained metadata |
| `REPLAY_CACHE_VERSION` | `server/core/dbCache.ts` | Replay decoding or trajectory blob format changes | Replays re-decoded in background (deleted files preserved) |
| `DUCKDB_TELEMETRY_CACHE_VERSION` | `server/core/dbCache.ts` | DuckDB lap cache schema changes | DuckDB lap cache rebuilt |
| `RACE_POSITIONS_VERSION` | `server/traffic/racePositions.ts` | Race positions indexing algorithm changes | Index rebuilt on demand |
| `TELEMETRY_LINK_RULE` | `server/telemetry/telemetryLinks.ts` | DuckDB-to-session linking logic changes | Session-to-DuckDB links re-evaluated |
| `PROMPT_VERSION` | `server/ai/aiReport.ts` | AI coaching prompt changes | New reports generated; prior reports retained |

---

## 6. Recipes

- **New lap/driver fact from XML**: Declare raw shape in `sessionXmlTypes.ts` → parse in `parser.ts` (`parseLap`/`parseDriver`/`parseStreamEvents`) → add field to `LapData`/`DriverData` in `shared/types/session.ts` → bump `DB_PARSER_VERSION` → add unit test in `test/server/sessions/`.
- **New fact from linked replay**: Read replay tables with `dbReplayLapStore.ts` → implement pure logic in `shared/domain/` → attach in `GET /api/session/:id` (`sessionRoutes.ts`).
- **New line in expanded lap row**: Add section in `src/components/session-detail/table/lapDetailSections.ts` → update context in `lapPlaces.ts` if needed → test in `test/components/session-detail/lapDetailSections.test.ts`. Keep `SessionLapTableRow.tsx` under 300 lines.
- **New session scalar or driver/lap column**: Declare in `server/core/sessionRows/specs.ts` → update `writer.ts`/`reader.ts` and round-trip tests. If derived, update `shared/domain/sessionSummaries/`, bump `SESSION_SUMMARY_PROJECTION_VERSION`, and update `cards.ts` if displayed on cards.
- **New API endpoint**: Add handler in `server/routes/<domain>Routes.ts` → mount in `server/index.ts` if creating a new router → add supertest in `test/server/routes/` → add typed client fetcher in `src/api/`.
- **New SQLite table/store**: Add DDL in `dbSchema.ts` → create prepared statement functions taking `Database` in `server/core/db<Name>Store.ts` → call via `sessionDb.getDb()`.
- **New circuit layout**: Add layout definition and targets to `shared/domain/circuitDefinitions.ts` → add basic SVG to `public/track-outlines/`. Detailed metric geometry belongs in external local packages.
- **New vehicle mapping**: Add vehicle pattern to `shared/domain/vehicleMapping.ts`. Class dimensions belong in `vehicleDimensions.ts`.
- **New session list filter**: Add control to `narrow` slot of `DashboardFilterBar.tsx` and `TrackSessionsToolbar.tsx` → clear in filter resets (`resetFilters` in `Dashboard.tsx`, `resetSessionFilters` in `useTrackDetailState.ts`).
- **Navigation link**: Use React Router `Link` with a concrete `to` prop. For custom click handling, pass `linkClickHandler` from `src/utils/linkClick.ts`.
- **Vehicle dynamics channel**: Follow ISO 8855 (positive left for steering, yaw rate, lateral G, lateral offset). Convert LMU coordinate signs during ingestion (`replayTrajectory.ts`, `duckdbReader.ts`).
- **UI colors**: Use semantic `lmu-*` roles from `tailwind.config.js` (`text-lmu-gain`, `bg-lmu-warn-strong/20`). Chart colors come from `src/utils/themeColors.ts`.

---

## 7. Tests and Quality Verification

- **Full test suite**: `npm test`
- **Single test file**: `npx vitest run <path>`
- **Typecheck & production build**: `npm run build` (enforces zero warnings and zero errors standard).
- **Endpoint performance benchmarks**: `npm run benchmark:endpoints` (runs HTTP benchmarks against fixed cohort; see `docs/ENDPOINT_BENCHMARKS.md`).
- **Test placement**: Mirrors source layout (`test/server/`, `test/domain/`, `test/utils/`, `test/components/`).
- **Fixtures**: `test/fixtures/{results,replays,telemetry}`; synthetic VCR in `test/utils/mockVcr.ts`.

---

## 8. Reference Documents

- Documentation index: [`docs/README.md`](README.md).
- Active proposals and design plans: [`docs/plans/README.md`](plans/README.md).
- Data format specifications: [`docs/XML_FORMAT.md`](XML_FORMAT.md), [`docs/VCR_FORMAT.md`](VCR_FORMAT.md), [`docs/TELEMETRY_FORMAT.md`](TELEMETRY_FORMAT.md), [`docs/LMU_REST_API.md`](LMU_REST_API.md), [`docs/LIVE_CAPTURE_FORMAT.md`](LIVE_CAPTURE_FORMAT.md).
- Replay performance notes: [`docs/VCR_PERFORMANCE_ANALYSIS.md`](VCR_PERFORMANCE_ANALYSIS.md).

---

## 9. Smells That Need Attention

### UI Follow-ups
- **Standings sorting vs class position**: Session standings emphasize class position while sorting and gains currently use overall results. Reconcile intended behavior in `SessionRaceStandings.tsx` and `SessionRaceStandingsRow.tsx`.
- **Keyboard navigation**: Complete keyboard focus containment and Escape restoration for session detail dialogs and fullscreen replay map (`SessionRulesModal.tsx`, `useMapFullscreenFocus.ts`, `ReplayShortcutHelp.tsx`).
- **Corner comparison apex sampling**: Main's corner comparison samples baseline speed at apex. The separate `corner-map` branch contains mapped/hybrid implementations; see [`docs/plans/CORNER_COMPARISON_REWORK.md`](plans/CORNER_COMPARISON_REWORK.md).

### File Size Limits Watchlist
- **Source files near 1,000 lines**: `shared/domain/circuitDefinitions.ts` (~774 lines), `server/telemetry/duckdbReader.ts` (~773 lines).
- **Directories near 20 files**: `shared/domain/` (19), `src/components/settings/` (19), `test/domain/` (19), `src/components/common/` (18), `src/utils/` (18).
- **Components near 300 lines**: `ReplayInspectorContent.tsx` (291), `ReplayInspectorModalBody.tsx` (289), `Dashboard.tsx` (279), `TelemetryPresetModal.tsx` (273), `ReplayInspectorSidebar.tsx` (270).

### Known Data Limits
- VCR/XML logs do not prove in-session repairs. Live capture records vehicle condition and REST repair estimates, but inferred completed repairs retain uncertainty.

---

## 10. Keeping This File Current

Update this file in the same commit when you:
1. Add, move, or rename a module, or create a new directory.
2. Add or modify an API endpoint, SQLite table, client route, or cache version.
3. Fix or discover an architectural smell (Section 9).
4. Verify tests and build numbers (update the verification baseline at the top).
