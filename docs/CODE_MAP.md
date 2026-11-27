# Code Map: Where Things Live and How They Flow

A fast index for development: find the right file without searching. `AGENTS.md` holds the rules;
this file holds the **routes through the code**. Keep it current (see "Keeping this file current" at the end).

Canonical domain contracts live in `shared/types/`; `shared/types/index.ts` is the approved barrel.
Circuit navigation uses `track=<full display layout name>` in query parameters on every page,
including circuit detail links. Dashboard options use that same string directly; browser URLs
do not encode JSON identities or separate `trackVenue`/`trackCourse` filters. Query strings are
serialized with `URLSearchParams`. Layout matching remains in `getCircuitSpecification`.
Import server telemetry reader contracts directly from `server/telemetry/duckdbTypes.ts`.
Local contracts have independent owners: replay storage facts in `server/core/replay/replayStorageTypes.ts`,
decode options in `server/replay/decode/replayTrajectoryTypes.ts`, telemetry chart results in
`src/components/replay/telemetry/telemetryChartTypes.ts`, and map markers in
`src/components/replay/map/gpsTrackMapTypes.ts`. Import these directly to avoid cycles through consumers.

Verification baseline (2026-11-15): 4,601 tests passed, 56 intentionally skipped; lint and production build clean. The optional Simagic package separately passes six fake-server contract tests and its build/typecheck.

Peripheral integrations: `server/peripherals/peripheralHost.ts` owns the optional Simagic package,
health checks, lifecycle and guarded selection. `pluginRegistry.ts` dynamically loads contract v1;
`sessionLoadDetector.ts` consumes one initial-garage opportunity per event, and
`presetSwitchRunner.ts` performs active-preset comparison, wheel selection (the base is never switched) and
one confirmation read without retries. `LiveService` publishes typed `snapshot` events even when
no browser is connected. `stop()` unsubscribes and aborts outstanding plugin work.
The host exposes the resolved wheel target and current load/skip status; selection results keep
before/after UUIDs. Settings requests a deduplicated read-only health refresh on opening and renders
the details in `PeripheralSelectionStatus.tsx`. `LoadedPresets.tsx` polls the read-only
`/api/peripherals/:id/loaded-presets` observation endpoint while Settings is visible, showing actual
base and wheel profiles independently of session assignments; session history stays collapsed.
`REGISTERED_PERIPHERALS` declares allowed packages
and `loadPeripheralPlugin` validates each configured factory against the versioned contract.
`server/core/peripherals/peripheralStore.ts` stores catalog snapshots and mappings; plugin settings
use SQLite metadata. DDL stays in `dbSchema.ts`. DTOs live in
`shared/types/peripherals/peripherals.ts`; pure resolution, Suggest and display status live in
`shared/domain/peripherals/`. Canonical car aliases remain in `vehicleMapping.ts`; `presetNames`
affects suggestions only and never changes LMU identity resolution.
`server/routes/peripherals/peripheralRoutes.ts` serves `/api/peripherals`; client calls use
`src/api/peripheralsApi.ts`. `src/components/settings/peripherals/` renders device selection,
catalog freshness, preview/save suggestions and guarded Apply. `PeripheralStatusChip.tsx` is
injected only by `LiveConnectedPage`, so dashboard demos remain offline. The separately owned
`../SimagicWheelDeamon` repository builds `lmu-peripheral-simagic` with no analyzer source imports.
See [plugin setup](PLUGINS.md) and [remaining hardware acceptance](plans/README.md#peripheral-acceptance).

Windows desktop integration: `server/desktop/systemTray.ts` starts the bundled native Win32
helper `bin/systemTray-win32-x64.exe` at below-normal CPU priority after HTTP listening succeeds.
`systemTray.c` owns the hidden window, notification icon, Explorer restart recovery and lifetime
pipe reader. `systemTray.rc` embeds `systemTray.ico`; `npm run build:tray` rebuilds the executable
using Visual Studio C++ tools and the Windows SDK. Normal startup never compiles or loads PowerShell/.NET.
Its tray menu and double-click open the frontend (`LMU_UI_ORIGIN`, otherwise `LMU_UI_PORT` / 5173).
`monitorBrowser.c` enumerates displays, saves the desktop-local preference in HKCU, and places a
new supported browser window maximized on that monitor. `SetWindowPlacement` queues the monitor's
work area and maximized state together, with workspace coordinate conversion for taskbar offsets.
A bounded startup check requires one second of stable maximization and retries delayed browser
restores, keeping browser controls visible. Native hidden checks cover display placement and the
maximize/restore/maximize startup sequence without opening a browser.
The app's `BrowserMonitorSetting.tsx` edits it via
`GET/POST /api/desktop/browser` and `server/desktop/browserSettings.ts`; the tray reads it on every
open, with no chooser. Initial `/api/events` game status includes the auto-open decision, consumed
once per mounted page by `useAppEvents` so an already-running LMU redirects on first load without
redirecting again after stream reconnects.
Closing the server's stdin
pipe disposes the icon, including on crashes and watch restarts; `LMU_TRAY=0` disables it.
Tray **Exit** sends `exit-requested` over stdout to the server's idempotent graceful shutdown.
`tools/dev/runServer.mjs` owns the development watcher and a private temporary exit signal; the server
writes that signal only after live capture stops. The launcher then stops its watcher, and
concurrently's `--kill-others` stops the paired frontend, including the npm-based debugger launch.

---

## Live Capture and Learning

`capture/decode.ts` and `capture/channels.ts` own the 11-value normalization-version-3 catalog
(forward/left velocity, yaw rate, longitudinal patch/ground wheel velocities); dropped channels are listed in the format doc.
`capture/terrain.ts` interns terrain names into sparse dictionary definitions/change events in the writer;
the controller also retains source-timed impact magnitudes and opaque player upgrade-pack configuration.
Version-1 files remain unchanged; `readRecording.ts` normalizes their motion signs on read and
reports the source version. See [channel conventions and provenance](LIVE_CAPTURE_FORMAT.md).

Contracts: [Live capture reference](LIVE_CAPTURE_FORMAT.md). Remaining checks: [work queue](plans/README.md#live-dashboard-and-learning).

Shared-memory polling: `sharedMemory.ts` owns private native views and bounded `readInto` copies;
`rf2Decode.ts` reuses per-mapping scratch buffers and decodes only coherent copies. `liveReader.ts`
gates car-condition decoding to its 500 ms publication cadence and packs capture rows into
`LiveCaptureRows` (`capture/decode.ts`), posted as transferred `capture` batches before each scoring
change or notice; terrain/impact are compared on raw source values. Allocation/GC reproduction: `tools/benchmarks/livePerformance/allocations.mjs`.

Vite and the TSX development watcher exclude `server/live-captures/`, including DuckDB WAL files,
because active recordings can be exclusively locked on Windows.

| Owner | Responsibility |
|---|---|
| `server/live/capture/controller.ts`, `recordingWorker.ts`, `recordingStore.ts` | Bounded player capture, worker-owned DuckDB writes and recovery |
| `server/live/capture/diagnostics.ts`, `livePitPoller.ts`, `liveReaderWorker.ts` | Disposable session diagnostics and request provenance |
| `server/core/live/dbLiveCaptureStore.ts`, `server/live/capture/reconcile.ts` | SQLite attachment index and strict XML ownership |
| `server/live/capture/evidenceService.ts`, `evidenceReader.ts`, `readRecording.ts` | Verified, off-track lap evidence reads |
| `shared/domain/live/liveTelemetryFusion.ts`, `src/api/liveEvidenceApi.ts` | Aligned evidence consumption and coverage |
| `shared/domain/live/wheelSlip.ts`, `shared/domain/live/replayWheelSlip.ts`, `tools/analysis/listWheelSlipEvents.ts` | Measured wheel slip ratio (live patch, or replay wheel speed against its free-rolling radius), lockup/wheelspin events, calibration rerun |
| `server/sessions/sessionTyreWear.ts`, `shared/domain/strategy/tyreWear.ts`, `tools/analysis/evaluateTyreWear.ts` | Closed verified live slip + shared native lap-end states, deterministic per-wheel fit by exact layout/model/driver/dry compound; garage-only cached profiles, independent evaluation and compact regression extraction |
| `shared/domain/live/radio/liveCalls.ts`, `racePlanMode.ts`, `server/live/radio/radioScheduler.ts`, `server/core/live/dbRadioLogStore.ts`, `src/components/live/display/radioPlayer.ts`, `LiveRadio.tsx`, `src/components/live/voice/browserVoice.ts`, `clipVoice.ts`, `shared/domain/live/radio/radioSentences.ts` | Radio voice: `liveCalls` proposes every strategy/damage/deployment/clock/penalty call for a snapshot, most important first (on `racePlanMode`, shared with the race plan view); `radio/field/` `FieldWatch` turns every car of the scoring buffer (`decodeField`, `shared/types/liveField.ts`) and the sector flags into incident, yellow, traffic and rejoin calls (`FieldTrack` progress speeds and field speed profile, `spokenCar` names, turns from `server/live/radio/layoutTurns.ts`, the pit lane's ends and side from the track package in `layoutPitLane.ts`: cars off on that side by its ends are pit traffic), merged by `RadioScheduler.observeField` (traffic said at once; none in a private qualifying or practice, read by the pit poller from `GET /rest/sessions`, `parsePrivateSessions`); the live service's `RadioScheduler` picks when it is said (P1 at once, P2/P3 on a straight, only incidents in the first 4 s after the line, P3 budget, expiry, once a run) on the pedal clock, logs every call (`live_radio_calls`) and sends SSE `call` events; the page's `RadioPlayer` says them in George's prepared clips joined by sentence on the radio output (`voice/clipVoice.ts`; `radioSentences` lists every sentence a clip can cover, read by `tools/dev/prepareVoiceClips.ts`), and in the browser voice when a sentence of the call has no clip (`voice/browserVoice.ts`); a P1 cuts a P2/P3 and waits for a P1, a call that never starts or ends fails on a time limit; it reports the outcome (`POST /api/live/calls/:id/outcome`), which the scheduler reads too (`observeOutcome`: a call failed or cut is proposed once more while it applies; a P2/P3 waits for its slot until the page has finished the call before it; a call said at once lives its `waitSeconds` on the page, then is dropped `late`; calls no page could say, `no-client` or `locked`, come again when a page connects or says its radio can speak, `POST /api/live/calls/ready` → `observeListener`); Settings voice switch, volume and radio output device (`LiveSettings.voice`, `voiceVolume`, `voiceOutput`; `settings/RadioOutputSetting.tsx`, routing in `live/voice/audioOutput.ts` for the Web Audio voices only); the debrief lists a session's calls (`GET /api/session/:id/radio`, `session-detail/debrief/SessionRadioCard.tsx`); the demo's own controls and page-side scheduling are `demo/LiveStrategySpeech.tsx` + `demo/useStrategyRadio.ts`, and its radio sampler (`demo/DemoRadioSampler.tsx`, wordings in `demo/demoRadio.ts`) plays one example of every call through `RadioPlayer` at the Settings volume, or in a Kokoro neural voice (`live/voice/`: `kokoroWorker.ts` runs kokoro-js q8 on the CPU in a worker, the ONNX runtime served by the app, model and voices fetched once from Hugging Face; `kokoroVoice.ts` plays it through Web Audio) with a pace choice, or George's prepared clips whole or joined by sentence (`clipVoice.ts`, `callPieces.ts`; clips from `tools/dev/prepareVoiceClips.ts` into the uncommitted `public/voice/george/`) ([plan](plans/proposed/LIVE_VOICE_CALLS.md)) |
| `shared/domain/live/energy/deploymentGuidance.ts`, `deploymentTracker.ts`, `src/components/live/race/deploymentReadout.ts` | Hypercar deployment advice (`strategy.deployment`): continuous controller over a one-lap-of-track window (rate, lap-average level, time to the 20/80% edge), its per-reading feed from `LiveStrategyTracker` (pit lane excluded, plugin `deploymentKw` or map positions), the readout shared by the race plan and the practice view; hybrid decode confirmed in the Spa practice, kW per map still open ([checklist](plans/README.md#live-dashboard-and-learning)) |
| `shared/domain/live/liveAudit.ts` | Consolidated live strategy audit (checkpoints during capture) |
| `shared/domain/learning/capture.ts`, `examples.ts`, `evaluate.ts`, `calibration.ts`, `automatic.ts` | Frozen forecasts, examples, evaluation and correction gates |
| `server/live/learning/service.ts`, `runtime.ts`, `automaticWorker.ts` | Projection refresh, persisted model lifecycle and exact live lookup |
| `server/live/learning/readiness.ts`, `readinessReader.ts`, `server/routes/liveRoutes.ts` (`/live/learning/readiness`), `settings/learning/LearningReadinessPanel.tsx` | Manual Settings evidence check |
| `tools/analysis/evaluateLiveLearning.ts`, `listLearningErrors.ts`, `.claude/skills/race-review/` | Post-race review: calibration report, per-lap forecast errors, findings in `docs/evidence/RACE_REVIEW_LOG.md` |
| `server/core/live/dbLiveLearningStore.ts`, `dbLearningModelStore.ts` | Compact learning facts and correction models |
| `shared/domain/live/livePitLane.ts`, `server/core/live/dbPitLaneStore.ts` | Pit lane loss per race stop (in-lap + out-lap - 2 x pace - time stopped), stored per layout and class (`live_pit_lane_losses`) |

---

## 1. The Four Data Sources and Ingest Pipelines

| Source | Files on disk | Ingest entry | Stored in (SQLite, `server/lmu_cache.db`) |
|---|---|---|---|
| XML results log | `UserData/LOG/Results/*.xml` | `server/core/dbSessionSync.ts` → `LmuParser.parseSessionXml` (`server/sessions/parser.ts`) | `sessions` (58 scalar columns) and row tables: `session_recordings`, `session_drivers`, `session_laps`, `session_lap_passes`, `session_events`, with dictionaries `drivers`, `vehicles`, `teams` |
| Binary replay | `UserData/Replays/*.Vcr` | `server/core/replay/dbReplaySync.ts` → worker (`server/replay/worker/replayTrajectoryWorker*.ts`) → `replayTrajectory.ts` → `replayFacts.ts` | `replay_metadata`, `replay_trajectories`, `replay_facts`, `replay_laps`, `replay_conditions`, `replay_driver_events`, `replay_running_order`, `replay_corner_passes`, `replay_sequence_passes`, `corner_sequence_maps` |
| App live capture | `server/live-captures/*.live.duckdb` | `server/live/capture/controller.ts` → recording worker; strict XML reconciliation | Raw streams in DuckDB; SQLite holds attachments and compact learning projections |
| Native DuckDB 100 Hz telemetry | `UserData/Telemetry/*.duckdb` | `server/telemetry/telemetryCatalog.ts` → `duckdbReader.ts` | `telemetry_metadata`, `telemetry_lap_cache` |

### SQLite Storage & Normalized Rows
- **DDL coordination**: `server/core/dbSchema.ts`. Additive projections live in `server/core/sessionSummaries/schema.ts` and `aggregateStore.ts`. Replay matching schema is in `server/core/replay/replayMatchingSchema.ts`. Cache versions and compression helpers live in `server/core/dbCache.ts`.
- **Normalized session storage** (`server/core/sessionRows/`):
  - `specs.ts` / `fields.ts`: declares stored column contracts.
  - `schema.ts`: DDL, table constraints, derived-column definitions, and index rules.
  - Name and car matching: drivers match on `drivers.normalized_name` (trimmed, lowercased; the replay roster's `driver_name` key), car filters on `vehicles.car_model` (generated `lower(trim(car_type))`), with the argument trimmed and lowercased once in JS. Compare the columns as they are: `LOWER(TRIM())` per row cost the compare page about a quarter of its time.
  - `writer.ts` (`writeSessionRows`, `updateDerivedColumns`): writes rows transactionally with their projection.
  - `reader.ts` (`readSession`, `sessionScalars`, `driverScalars`): assembles `DetailedSession` from normalized rows.
  - `access.ts`: exposes `loadSessions` (ordered reads), `readStoredLinkState` (link and DuckDB file), and `sameReplayLink`.
  - `targeted.ts`: granular updates for replay links, names, telemetry, and conditions.
  - Round-trip expectations (`canonicalSession`) and the bare `sessions` row fixture live with the tests in `test/server/core/sessionRows/`.
- **Dictionaries**: `drivers` (keyed by exact name; player/human flags belong to session driver row), `vehicles` (raw XML car type and class), `teams` (name). Emptied with session cache; never pruned.
- **Shared session and lap helpers** (used by the server and the client): lap time text (`formatTime`, `formatElapsedSeconds`, `parseTimeStringToSeconds`, `formatPitStopDuration` in `shared/domain/timing/timeFormat.ts`), the theoretical best and the best lap (`shared/domain/timing/lapTimes.ts`), session order and the list sort options (`compareSessions`, `compareSessionsBySortOption` in `shared/domain/sessions/sessionOrder.ts`), empty sessions (`shared/domain/sessions/sessionLaps.ts`), the same weekend's other sessions (`findWeekendSessions`, `shared/domain/sessions/weekendSessions.ts`), the track name shown (`getDisplayTrackName`, `shared/domain/sessions/trackDisplayName.ts`) and the steering wheel angle and percent (`shared/domain/vehicles/steering.ts`).
- **Derived columns**: stored on `session_drivers` (`is_human`, `driver_class`, `clean_laps_count`, `driving_time_seconds`, `max_top_speed`, `best_lap_ordinal`, `top3_average`, `consistency_score`, etc.) and `session_laps` (`condition_group`, clean/representative/human/leaderboard flags). Raw columns retain original XML values (`lap_number`, `is_pit_stop`).

### Benchmark Rating & Comparison Queries
- **Benchmark lookup**: `createBenchmarkLookup` (`shared/domain/paceCategory.ts`) resolves benchmark targets once per batch; `createPaceCalculator` (`server/benchmarks/referenceLaptimes.ts`) reuses target matches within a read. `calculateBenchmarkPace` owns percentage/delta rounding and category selection.
- **Telemetry comparison queries** (`server/core/sessionSummaries/comparisonQueries.ts`):
  - `queryTelemetryComparableLaps`: direct SQL reads of matching rows for pagination without hydrating full sessions.
  - `server/core/replay/replayLapAvailability.ts`: unique normalized driver names and replay slots are persisted in `replay_driver_roster` transactionally with replay metadata. A versioned startup backfill projects retained metadata, including deleted VCRs, outside schema initialization. Availability uses primary-key lookups into the roster and `replay_trajectories` with `points_count>0`; request paths do not decompress metadata/trajectories, inspect source files or decode replays. Laps become selectable after their data is cached; writes/deletions take effect immediately. Metadata rename/delete triggers maintain roster keys. The picker filters before counts, car options and pagination; compare and board preserve official results and disable unavailable telemetry.
  - Scopes: `sort` (`lap`, `recent`, `driver`), `sessionKind` (`practice`/`quali`/`race`), `condition` (`Dry`/`Wet`/`Dynamic Weather`) defined in `shared/domain/compareLapScope.ts`.
  - Personal-best badges: Gold = class best across any car and condition; Blue = session best. Ranked with a single window query (`markPagePersonalBests`) across the page's drivers.
  - Compare page (`useCompareLapsData.ts`): `playerBestLap` (clean dry PB) and `overallTrackBestLap` come strictly from exact server bests.
  - Replay inspector reference suggestion: `useReferenceLapSuggestion.ts` (`pageSize=1`, `carType`, `driverExact=true`, `excludeLap`).
  - Replay session context: `server/core/sessionRows/replayContext.ts` reads roster, replay link, and official timing (`ReplaySessionContext`, `ReplayContextDriver`, `ReplayTimingLap` in `replayServiceTypes.ts`).
- **Session summary facts**: `server/core/sessionSummaries/store.ts` and `aggregateStore.ts` maintain `session_summary_facts` and `session_driver_condition_summaries` transactionally with ingestion. Cards are constructed directly from columns by `cards.ts` (`readSessionCards`). The dashboard and session list show the finish, grid and places gained within the player's class (`shared/domain/classResult.ts`); the facts' `position` and `position_gain` hold the same class figures.
- **Aggregation engine**: `buildSessionSummaryProjection.ts` selects clean laps once per driver, reuses selections for consistency and top-N metrics, and checks membership with a Set.
- **Summary readiness gate**: `server/routes/summaryReadiness.ts` returns 503 on history endpoints while summaries rebuild (`isSessionSummaryReady` checks covering index `idx_sessions_ready`).

### Replay & Telemetry Ingestion Invariants
- **Replay permanence**: Replays are the source of truth once cached. LMU deletes older `.Vcr` files; cached SQLite rows are retained and must never be deleted just because the source file is gone.
- **DuckDB telemetry ownership** (`server/telemetry/telemetryLinks.ts`, `TELEMETRY_LINK_RULE = session-span-exact-identity-player-v5`):
  - Matches DuckDB files to sessions via session time spans and player identity.
  - Venue-only matching: official venue names without layout are layout-unspecified; explicit layout names must match the owner layout (`server/telemetry/telemetryMatcher.ts`).
- **Background orchestration**:
  - Cached replay discovery uses asynchronous directory/stat reads; metadata and driver-cache checks yield between recordings so a warm startup does not monopolize the HTTP event loop. SQLite coordination still runs on the main thread; parsing and decoding run in workers.
  - Native telemetry discovery also uses asynchronous directory/stat reads and yields while publishing cached files. `TelemetryCatalog` finalizes SQLite metadata in batches of ten, checking scan generation after each yield so a superseded refresh cannot publish or prune newer state. App-owned live capture discovery remains in the recording worker and is held while recording.
  - Startup XML discovery reads the directory asynchronously. Parser upgrades reclassify retained sessions in transactions of ten and yield through the scan pump; the parser version advances only after all batches commit. Main-thread loops over cached work (replay discovery and cache checks, telemetry links and owners, the DuckDB catalog) give the event loop a turn once a 5 ms slice is used up (`server/core/yieldSlice.ts`).
  - Live XML reconciliation checks the compact capture index in one synchronous pass and publishes the one-to-one links in a transaction. File discovery and DuckDB reads remain in the recording worker. Withdrawal counting uses a map rather than repeatedly searching the capture list.
  - `src/api/useRequest.ts` loads data for a request and stores the answer with it: data, error and loading always belong to the current request (compared as JSON), so a changed request never shows another's answer. Fetch hooks build the request and call it instead of keying loading state by hand.
  - `src/api/useAppData.ts` coordinates client polling during active scans; while the server is unreachable (no answer, or the dev proxy's 502/504) it retries every second for up to 30 s with no error shown, since the dev watcher restarts the server on every change. `/scan/status` exposes monotonic `dataRevision`. `/status` includes server instance identity and plugin revision.
  - Ingestion worker: `server/core/ingest/fileIngestWorker*.ts` parses XML and replay metadata in worker threads, returning unrated facts.
  - Worker port safety: every worker client checks messages with `isWorkerMessage` (`server/core/workerThreads.ts`) to ignore dev-mode watcher traffic (`watch:import`).
  - Result XML write-once: completed XMLs skipped unless forced or parser version bumped.
  - Replay decode queue & errors: `dbReplayIngestStore.ts`, `failed` vs `interrupted`, settles after `MAX_DECODE_ATTEMPTS`.
  - `ServerContext` (`server/core/serverContext.ts`) manages background scan jobs (`backgroundScan.ts`), telemetry catalog, replay links (`SessionReplayLinks`).

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
   - Resolves the car (`resolveVehicle` in `vehicleMapping.ts`) and circuit specification (`circuitSpecs.ts`).
   - Matches replay candidate (`server/sessions/replayMatching.ts`).
2. **Store**: `dbSessionSync.ts` (coordinates `DB_PARSER_VERSION`) → writes normalized rows via `server/core/sessionRows/writer.ts` and projection facts via `aggregateStore.ts`.
3. **Re-classify with rain**: `server/core/dbSessionConditions.ts` updates lap conditions using replay rain data when a linked replay is attached or decoded.
4. **Serve**: `GET /api/session/:id` (`server/routes/sessionRoutes.ts`) decorates session rows with read-time benchmark ratings (`rateSessionDetail`), bounded history context (`querySessionContext`), per-driver personal best (`querySessionPersonalBestById`), and replay pit stops (`attachPitServices`, `sessionPitStops.ts`, `shared/domain/pitStops.ts`).
5. **Client fetch**: `src/components/session-detail/useSessionDetailData.ts` fetches `/api/session/:id`.
6. **Render** (`src/components/session-detail/SessionDetail.tsx`):
   - `overview/`: session header, `DriverPerformancePanel`, `BestLapBlock`, `BenchmarkLadder`, and conditions.
   - `standings/`: classification, fuel, race result, safety statistics (`DriverSafetySummary.tsx`).
   - `table/`: lap timing rows (`SessionLapTableRow.tsx`), stewards' event lines (`table/SessionLapStewardsLine`), and expandable event debriefs (`SessionLapDetailsRow.tsx`, `lapDetailSections.ts`, `pitStopText.ts`, `src/utils/lapTrafficText.ts`). Memoizes class ranks via `shared/domain/lapPlaces.ts`.
   - `debrief/`: the player's debrief in one collapsed section, read when opened (`SessionDebriefSection.tsx`): driving habits (`DrivingHabitsCard.tsx`, hook `useDrivingHabits.ts`, model `drivingHabits.ts`, words `habitText.ts`: from `GET /api/session/:id/corner-analysis`, the goal line (`GoalLine`: the pace badge now, the badge of the level above and the seconds to find; the percent of the benchmark target on hover), the 2 focus corners, one row each (`FocusRow`: the corner's name and the advice, shortened for a single-turn corner by `focusLine`; the cost last session → this one (`FocusProgress.since`, the span "Last try" reads) with `CostSparkline` over the last 5 sessions' costs (`FocusProgress.costs`); one "Try:" line with a road position in words ("a little closer", "closer", "much closer") and its metres on hover; the speed as "Apex 96 → 100 km/h", the driver's then the target's, with "Exit a → b km/h" after it when the exit is slower too (`habitSpeedLine`, `debrief/habitText.ts`, shared with the corner trends and the lap view's conclusion); the result of the last try ("Last try: you … · no gain in the corner yet"); under a Details toggle the kind of loss (`focusDiagnosis`), the habit's gap then against now, what else was measured, the habit's name with its share of laps and the compare link; the driver compared with is "target", never a name; a pinned corner says "Your pick" with an Unpin button, `unpinHabitFocus`), "No longer in your top 2" (a neutral heading: leaving is not fixing) for the corners that left, and the biggest one-off the driver caused; each opens the lap view at the corner, a habit as the driver's usual lap against the reference's, a mistake as that lap against the driver's usual; it replaced the best-lap "where the time goes" ranking, 2026-11-20), the race strategy debrief (`SessionStrategyCard.tsx`, `GET /api/session/:id/strategy`: `server/sessions/sessionStrategy.ts` reads `DuckDbReader.getLapEndStates` from the player's linked native files, `shared/domain/strategy/sessionStrategy.ts` measures it; never stored, online XMLs have no fuel, VE or wear), with plan vs actual (`StrategyPlanVsActual.tsx`; the same measurements of the newest 5 races on a layout and class feed the live race plan before event laps, `readStrategyHistory` + `shared/domain/strategy/strategyHistory.ts`; the plan shown before the start, saved with the race recording by `server/core/live/dbRacePlanStore.ts`, `live_race_plans`), and the radio calls of a live-recorded session (`SessionRadioCard.tsx`, `GET /api/session/:id/radio`: every call by lap and what became of it).
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
   - `replayTrajectory.ts` (`extractReplayTrajectory`, `extractReplayDriverTrajectories`): matches events by opcode (`docs/VCR_FORMAT.md` §3.3) and extracts trajectory points via `scene/replayPose.ts` and `replayTrajectoryFinalizer.ts`; `replayPitCodes.ts` names the pit state codes.
   - `replayLapBuilder.ts` / `replayLapPoints.ts`: slices samples into discrete laps; `garageState.ts` handles pit and garage transitions.
   - Pit flag recovery: `replayLapClassification.ts`; clean replay lap validation: `isCleanReplayLap` (`shared/domain/lapComparison.ts`). Missed laps return `ReplayLapNotRecordedError` (404).
2. **Worker ingestion**:
   - `worker/replayTrajectoryWorkerClient.ts`: executes in worker threads; stages pose chunks in worker SQLite TEMP storage (`replayDriverSamples.ts`).
   - Atomic commits of trajectory blobs, facts, and ingest markers via `server/core/replay/dbReplayDriverStore.ts`. Primary slot promotion via `resolveReplayPrimarySlot`.
3. **Persisted replay facts**:
   - Facts: `replayFacts.ts` → stored via `server/core/replay/dbReplayLapStore.ts` (`replaceReplayDriverLapFacts`, `replaceReplayWideFacts`).
   - Columnar trajectory blobs: stored via `dbReplayTrajectoryStore.ts` using `replayTrajectoryCodec.ts`, in the lossless binary lap format of `lapColumnsCodec.ts` ([current storage contract](REPLAY_CACHE_FORMAT.md); selected-column decode for `server/traffic/lapSamples.ts`). Rows already hold what the app serves (garage state, ISO 8855 steering, Virtual Energy): no read-time fixes; a rule change rewrites rows offline. Downsampler `trajectoryDownsampler.ts` preserves apex speed minimums, straight maximums, and braking onsets.
   - Corner passes (`server/corners/`): after a replay's laps commit, the replay sync's `onReplayStored` (`serverContext.ts`) calls `refreshReplayCorners` (`sequenceMapService.ts`), whose `refreshReplayCornerPasses` (`cornerPassService.ts`) which places the layout's official turns on its centre line (`shared/domain/circuitTurns/placeTurns.ts`) and builds on a worker (`cornerPassWorkerClient.ts` → `cornerPassBuild.ts`: driving samples projected at full rate, pit/garage/teleport/far-off-track samples left out) one pass per car, lap and turn segment (`cornerPasses.ts`: entry, slowest point and exit times and speeds, brake onset, turn-in, throttle back on after the lift, drive cues: gear at the slowest point, peak brake, time braking, part throttle out of the slowest point, ABS time, coasting between the braking and the throttle; the line: the signed arc radius at the slowest point (the circle through the positions 0.5 s before, at and after it; none above 1,500 m or when the slowest sample ends the segment) and the car's place across the road at the apex (the most inside point), positive left (the places at turn-in and at the exit are not kept: nothing reads them); closest car ahead within 2 s by slot and gap, none in a private session (the replay header's flag: LMU's private qualifying and practice); pedals arrive in percent and are read as 0–1 in `cornerPassBuild.ts`). The corner analysis engine (`shared/domain/cornerAnalysis/`: `analyzeCorners.ts` habits against the layout's target (the best true pace in the class, the same driver for every session) and mistakes against the driver's own usual, `habitRules.ts` the 4 headlines in checking order (`brakesWhereLift`, `overSlowing`, `brakeEarly`, `exitSpeed`: the measures that pass the outcome check), the kind of loss at a turn (`lossKind`: a tighter arc, less grip used or both, from speed² = sideways g × arc radius; or slower at the exit only), the actions to try (`habitActions`: the largest gap in steps among the actions of the kind first; the first is offered, the rest are `otherActions`) and the causes said under a headline (`habitCauses`), `turnUsual.ts` the medians, `habitFocus.ts` the focus (`walkFocus`: 2 corners by the mean score over the last 5 measuring sessions, a session's score being the corner's whole cost × its habit's repeatability × confidence, 0 without a habit to pick or without a cost; entered after 2 sessions with a habit, kept until a challenger leads by 20% for 2 sessions running, free slots filled first; `habitFocus`: the session's focus with the driver's pins first and the progress rows, slipping = cost 0.10 s above its recent level 2 sessions running, a try read with `actionDone`; `cornerFocusTrends`: the same per corner for the track page), `paceGoal.ts` the goal (the true pace rated against the benchmark target like a pace badge, and the seconds to find for the pace level above))) reads them through `server/corners/cornerAnalysisService.ts` (`layoutAnalyser`: one read of the player's passes, then one of the target candidates, picked by true pace in SQL (the leaderboard's 3-lap average): the 3 best overall and the best in each car for the same-car check; `readSessionCornerAnalysis` analyses the driver's sessions at the layout in the class up to the one shown and adds `focus` and `goal` (the true pace against the benchmark target the caller's lookup gives: the route passes `benchmarkTargetSec` of `server/benchmarks/referenceLaptimes.ts`, a script its own read-only benchmarks), `readCornerHabitTrends` the corner trends' habits over the class (or a picked car model) and their target, `pinnedCornerTurns` what the pin routes check) and `server/core/replay/dbCornerAnalysisStore.ts`; served by `GET /api/session/:id/corner-analysis` (`cornerRoutes.ts`, behind the summary readiness gate; read by the session debrief and by the lap view's corner detail). The lap view's corner conclusion (`src/components/replay/analysis/conclusion/`, `CornerConclusionBlock.tsx` under the phase cards of the Corners tab) has two parts. With a baseline lap, `LapDifferenceSection.tsx` says what differs between the two laps: `useCornerLapDifference.ts` reads each lap's turn passes (`GET /api/session/:id/corner-passes?driverOrdinal=`) and the lap view's corners, and `cornerLapDifference.ts` runs `compareLapTurn` (`analyzeCorners.ts`: the habit rules, the kind of loss and the causes on one pass each, both ways, a half told from 0.05 s; a description of two laps, no action) through the corner's turns, the slower lap the subject of each line, with a car close ahead or much longer ABS noted on the lap that loses; same class only (`areComparableCarClasses`), gears in the same car only. Then `SessionHabitSection.tsx`, through `useSessionCornerAnalysis.ts`, where `cornerConclusion.ts` gives the corner's habit over the session against the target as the debrief says it (`cornerHabit`, else a loss no rule explains) and the shown lap's biggest loss there against the driver's usual; on the session player's laps only. The goal has no setting: it is the pace level above the session's own. Pins are the driver's own focus corners per layout and class, stored on the corner's first turn (`habit_focus_pins`, `server/core/dbHabitFocusStore.ts`; `POST /api/habit-focus/pin` refuses a third corner with 409, `POST /api/habit-focus/unpin` removes every pin on the corner). Offline, read only: `tools/analysis/cornerAnalysis.ts` (one session's analysis and the lap-to-lap noise of each measure) and `tools/analysis/habitOutcomeCheck.ts` (the outcome check a headline must pass: over the driver's history, the turn got quicker in at least 65% of the cases where the habit's gap closed and in at most 40% of those where it widened). Rows in `replay_corner_passes` (lean integers, `WITHOUT ROWID`) with their build key in `replay_corner_pass_builds` (`server/core/replay/dbCornerPassStore.ts`). Stored replays and version changes: `tools/analysis/buildCornerPasses.ts`, offline. Read by `GET /api/session/:id/corner-passes` (`sessionCornerPasses.ts`: turns labelled by `shared/domain/circuitTurns/turnLabel.ts`, cars, passes, each car's laps with their counting flags and wetness, the replay's contact events; not served when the build key differs), which the Consistency panel (`useCornerConsistency.ts`, `src/utils/cornerConsistency.ts`) uses on the Turns side of its switch; the corner insight card and the panel's default side read the sequence passes instead (turn sequences, below). The card (`src/components/replay/cornerCard/`: `cornerInsight.ts` the pure model, usual = median of the counted passes; time, minimum speed, and the gain to the class's fastest usual split at the slowest point; with a compare lap, the lap view's card switches (Usual / Compare) to that lap's pass through the same turn of the same layout, from its own session's passes; `RaceCornerCard` / `LapCornerCard` per view; `useCornerInsightIndex.ts` keeps the last two sessions' answers and shares a request in flight between cards that mount together; a strip cell opens its lap with the cursor at the turn's entry (`landingIndex`, dropped if another lap or driver loads instead); shown state, K and the compare switch in `cornerCardShown.ts`) sits under the minimap of the race 2D/3D views, the lap 3D view and the lap view's fullscreen 2D map. Types: `shared/types/corners/`. Design rules sit in the module comments (`turnLists.ts`, `cornerPasses.ts`, `cornerInsight.ts`, `sequenceMapService.ts`, `sequenceMap.ts`).
   - Turn sequences (layer 2, `server/corners/sequenceMapService.ts`): one map per layout and class in `corner_sequence_maps` (+ `_sequences`, `_laps`; `server/core/replay/dbSequenceMapStore.ts`), built from the class's 10 fastest dry laps passing every turn (one per driver first; the parser's clean dry laps of the matched session, else the replay's own flags: `listSequenceCandidateLaps`), grown at ingestion until it has 10, then fixed; checked against the driver's own 5 fastest. The rule is shared: `shared/domain/cornerSequences/` (`speedTurningPoints.ts`, also the lap-versus-lap corners; `sequenceMap.ts`: joins, start, slowest point, exit turns; a sequence starting before the previous one's slowest point joins it; the map key names its laps and its corners, so a regeneration that changes the corners rebuilds the passes); laps read on the pass worker (`readSequenceLaps`, `server/corners/sequenceLaps.ts`). Each replay's sequence passes come from the same pass build (`CornerPassInput.sequences`: each car its class's sequences as segments, the last across the line) into `replay_sequence_passes` / `replay_sequence_pass_builds` (`PassKind` 'sequences' in `dbCornerPassStore.ts`; segment = the sequence's first turn id; build key names the maps read). A map that changes rebuilds its layout's stale sequence passes (only the stale kind is built). Ingestion's corner work and a regeneration run one at a time (`queueCornerWork`). When a scan or a regeneration finishes, `sequenceMapsChanged` (`src/api/cornerApi.ts`) drops the client's layout corners and the corner card's kept passes; a failed regeneration shows as one (`SequenceMapsResponse.failed`). A full map is rechecked once 3 laps new to the class's fastest 10 are stored (`recheckSequenceMap`, `compareSequenceMaps`: same grouping, starts within 10 m): the result goes to `corner_sequence_map_checks` and the laps read as the `fresh` role of `corner_sequence_map_laps`, the map itself untouched. Settings → Corner Sequences (`src/components/settings/sequences/`, `server/routes/cornerRoutes.ts`: `GET /api/corner-sequences/maps`, `POST /api/corner-sequences/maps/regenerate`, one at a time, refused during a replay scan) lists the maps, flags one whose check differs and regenerates it with its layout's sequence passes. Offline: `tools/analysis/buildCornerPasses.ts` (maps first, `--remap --layout --class`), `tools/analysis/buildSequenceMaps.ts` (audit report and pictures, native telemetry check). Served by `GET /api/session/:id/corner-passes?segments=sequences` (`readSessionCornerPasses` kind 'sequences': the build key checked through `planSequencePasses`, each class's sequences as `CornerTurn`s with `sequence: {carClass, turnIds}`, labelled by their turns without the exit turns). One car's (`driverOrdinal`) carries its own class's sequences only. The Consistency panel reads them by default (Sequences / Turns switch, `src/components/replay/analysis/consistencySegments.ts`, remembered). The lap view's corners (Compare list, strip, map badges) are the class's sequences placed on the lap: `GET /api/corners?layoutKey&carClass` (`layoutCorners`: the current map, else the official turns) → `loadLayoutCorners` (`src/api/cornerApi.ts`, one fetch per layout and class) → `src/components/replay/inspector/useLapSegments.ts` and the rival debrief (`src/components/leaderboard/debrief/loadLapDebrief.ts`; `rankDebriefCorners` keeps the corner's label) → `computeLapSegmentComparisons(..., corners)` (`lapCornerWindows`: start to next start, the lap's slowest point inside; labels via `cornerName` in `cornerAnalysis/helpers.ts`; a sequence is labelled SQ1, SQ2… in lap order by `sequenceTurns` in `sessionCornerPasses.ts`, its turns in the title with their familiar names, `sequenceTurnsText` in `shared/domain/cornerSequences/sequenceLabel.ts` over `shared/domain/circuitTurns/familiarNames.ts`); without the layout's corners there are no segments. The debrief's Watch next session numbers its corners in the same layout order (`cornerNumbering`, `drivingHabits.ts`). Speed-dip detection (`findSpeedTurningPoints`) only builds the maps (`server/corners/sequenceLaps.ts`); tests window laps on their dips with `test/utils/cornerAnalysis/dipWindows.ts`. Read by the corner card (`fetchSessionSequencePasses`; the index looks a pass's sequence up by the car's class, the class gap stays within the class, compare needs a sequence holding the same turns).
   - Corner trends (track page): `GET /api/corner-trends?layoutKey&carClass[&carType]` (`cornerRoutes.ts`, behind the summary readiness gate) → `readCornerTrends` (`server/corners/cornerTrends.ts`): the class's corners at the layout (`placedLayoutCorners`: its current map, else the official turns), and per corner one point per player session of at least 3 counted dry passes (2 on a layout of 10 km and more, `minTrendPasses`; 1 in qualifying, not for the reference) (the card's `lapCounts` rule in SQL; usual = median, and best) plus as the reference the habits' target (`readCornerHabitTrends` returns it; the route reads it first) timed the same way, else the class's fastest usual by another human driver, among the analysis's lap-time shortlist (`REFERENCE_OVERALL` and `REFERENCE_PER_CAR` from `dbCornerAnalysisStore.ts`; change both stores together). Rows from `server/core/replay/dbCornerTrendStore.ts`: sessions matched to their replay's cars by name in the roster, only builds whose key starts with the layout's `layoutPassKey` and (sequences) names the class's current map; sessions without a point are counted as no replay, waiting for a rebuild or too few passes. Counted laps are filtered before the passes are joined (once per lap: 57 ms at Le Mans, 2026-11-19). Shown under the Improvement chart by `src/components/track-detail/corner-trends/CornerTrendsSection.tsx` (the page's class, on All classes a note to pick one; the picked car model): a row per corner (label, `name`, a grey sparkline of the usual per session (quicker higher, topped by the target's line on one seconds scale shared by every row: `graphTopSec`, `sharedGraphSpanSec`), its latest mark in the row's trend colour (`cornerTrendRow`: the Theil–Sen trend through the last 5 sessions' usuals (median pairwise slope times the span), so one odd session neither makes nor hides it; `cornerTrendTone`: green quicker, red slower, grey within 0.05 s or below 3 sessions), marks shaped by session type (race filled, qualifying diamond, practice hollow; latest larger) and the target's line dashed; columns latest usual, the last-5 change in the trend colour, the gap to target in text ink; the 2 focus corners carry a left accent bar and a pill beside their name (`FocusTag`: Focus for a corner the rules picked, Pinned for the driver's pick; non-focus slipping corners show a Slipping pill); `cornerTrendRows.ts`), sortable from the header (`CornerTrendsHeader.tsx`, `sortCornerRows`: lap order, or latest, last 5 or vs class, biggest first, missing values last, ties in lap order); clicking a row (or its turns button from the keyboard) opens `CornerHabitLine.tsx` (`cornerHabitText.ts`) under it: the corner's habit in its latest analysed session (or that none is named), its cost against the target, a Slipping tag (`src/components/common/HabitTags.tsx`, shared with the debrief and the lap view), a "Compare in telemetry" link (the lap view at the corner, numbered in lap order: the latest session's usual lap against the reference's, `CornerHabitTrend.view`), the thing to try with the speed cue (`habitSpeedLine`), an inline cost sparkline (`src/components/common/CostSparkline.tsx`, shared with `DrivingHabitsCard.tsx`) with start → latest cost and the habit's gap series, and the pin control (Make focus / Keep as focus / Unpin, `pinHabitFocus` and `unpinHabitFocus` for the layout and class; a refusal shows on the row), which the route adds (`readCornerHabitTrends`; `readCornerTrends` leaves them null), closed by default to keep the table short; rows without a habit trend have no toggle (an opened corner with turn-by-turn advice and road usage was built and removed, 2026-11-19, to make way for a per-lap analysis engine); loaded by `useCornerTrends` (`fetchCornerTrends` in `src/api/cornerApi.ts`; refetched on new sessions and map changes, rows kept meanwhile).
4. **Telemetry fusion & track projection**:
   - `server/telemetry/telemetryFusion.ts`: fuses high-rate DuckDB channels with replay telemetry. Native status/weather take precedence; VCR supplies discrete flags and weather.
   - `server/tracks/`: interpolates timing line crossings (`lapLineCut.ts`), centerline projection (`trackProjection.ts`, reusing candidate segments during search), and glitch repair (`stationGlitches.ts`).
5. **Serving**:
   - `GET /api/session/:id/telemetry` (`replayRoutes.ts`): session-addressed via `ReplayTrajectoryService` / `ReplayTelemetryService`.
   - `GET /api/session/:id/race` and `/race/poses?window=N` (`server/traffic/raceReplayService.ts`): the race replay. The overview holds the cars (session drivers matched by name), every car's lap spans, the game's running order and the timeline events (`shared/domain/raceReplay/raceEvents.ts`: pit stops entry to exit, contacts merged per pair, penalties, from `replay_driver_events`); poses come in 60 s windows of every car at 10 Hz (`racePoses.ts`, resampled on a worker by `racePosesWorkerClient.ts`, encoded by `shared/domain/raceReplay/poseWindow.ts`: position, attitude, speed, pit state, steering, brake, a lamp bitmask, the four suspension deflections and wheel spins, and the telemetry bar's throttle, gear, G and driver aids, NaN off the track; the bar over the timeline, `RaceCarHud.tsx`, reads the followed car's); overview cars carry their steering calibration (`handling`). Built on demand from the stored laps; resampled laps stay in a bounded in-memory LRU, nothing is written to SQLite. Stored laps are read through `server/core/replay/dbReplayLapRows.ts`. `/race/distances` (`server/traffic/raceDistances.ts`) puts every car's track distance on a 1 Hz grid from the corner passes (linear between each pass's entry, slowest point and exit; empty in the pit lane and garage), for the tower's live gaps; 404 until the replay's passes are built.
6. **Replay Inspector UI** (`src/components/replay/ReplayInspectorPage.tsx`, route `/telemetry`):
   - **Data & cursor**: `useReplayInspectorData.ts` (remaps scrub index across reloads using `getDistancesInReferenceFrame`), `replayPlaybackCursor.ts` (rAF frame interpolation without full rerenders), `useReplayPersonalBest.ts`.
   - **Map panel width**: `inspector/PanelResizeHandle.tsx` is the divider on the right-hand panel's edge (drag, arrow keys, double-click reset); the breakpoint widths in `ReplayInspectorSidebar.tsx` stay the minimum, the charts keep 560 px, and the width is remembered per layout (map only, map beside analysis).
   - **Inspector title**: `ReplayInspectorTitle.tsx` (weather, rain intensity, air/track temps; lap conditions take precedence over replay metadata); `actions` beside Info). `ReplayHeaderShell.tsx` is the header both views share: title, Info and mode switch at the left, the driver picker at the right edge (switching views moves none of them); the lap view's lap and compare controls take the centre, empty in the race replay. Playback sits with the timeline it moves: the lap view's telemetry toolbar and fullscreen trace (`GpsMapPlaybackStrip`, reading `ReplayFullscreenControlsContext`), the race's `RacePlaybackBar`.
   - **GPS Map** (`map/`):
     - Heatmap modes: Delta (cumulative gap) and Gain / Loss (local change in s/s over ±0.3s window, 0.015 s/s deadband, 0.16 s/s saturation via `computeGainLossByIdx` in `replayMapUtils.ts`).
     - Scene layers: `scene/GpsTrackSegments.tsx` (racing lines with non-scaling hit stroke), surface layers `scene/GpsTrackSurfaceLayers.tsx` (road/kerb/runoff compound paths with holes).
     - Culling view box: `useStableCullViewBox.ts` (`nextCullViewBox` in `replayMapUtils.ts`) skips re-rendering track paths during pan.
     - Marker layout: `scene/markerPlacement.ts` coordinates collision checks across brake boards, START, sectors, turns, APEX, and pedal badges using spatial road index `scene/cornerRibbonClearance.ts`. Start badge placed by `scene/startFinishPlacement.ts`. `display/useTrackMarkerPlacement.ts` places the brake boards, START and sector lines together (lap and race maps). Turn badges placed by `placeCornerBadges`.
     - Car markers & dynamics: `GpsSceneCarMarkers.tsx` renders primary and ghost with model dimensions or `defaultVehicleSize` (`vehicleDimensions.ts`), replay body yaw (`replayBodyHeading`, native -Z forward). Composes hooks `useGpsSceneProjection.ts`, `useGpsSceneDynamics.ts`, and `useGpsSceneCameraFocus.ts`.
     - Ghost sync (`ghostSync.ts`, shared with the 3D scene): Distance (same lap distance), Time (same elapsed lap time; HUD shows the on-track gap in metres) or From A (together up to telemetry marker A, then on time since each passed it; HUD delta counts from A). Mode in the URL (`sync`), cycled by one chip in the mode bar or with V (From A only while marker A is set; without it the page reads From A as Distance); mode and marker A are shared through `inspector/ghostSyncContext.ts`, where `placeGhostMarker` switches to From A when A is set and back to Distance when it is cleared (X on the map, 3D view or trace, Alt-click, or the Set A button).
     - Map controls & layers: `display/mapLayers.ts`, `MapLayersControl.tsx` (one Corners layer, switched between the class's sequences and the official turns by `cornerLayerKind`, never both; `scene/GpsCornerLayer.tsx` draws the official turns, the race map's class sequences from `loadLayoutCorners` and the lap's sequence start ticks), brake boards `GpsBrakeMarkers.tsx`, shortcuts `useGpsMapShortcuts.ts` (M toggles fullscreen, T toggles trace, Space toggles play, C centers, F toggles follow, V cycles ghost sync).
   - **Fullscreen Telemetry Dock** (`map/telemetry/GpsMapTelemetryDock.tsx`):
     - 112px trace dock, quick Speed, Delta, and Throttle + Brake buttons.
     - `GpsMapPlaybackStrip.tsx` (step, play, speed, and the cursor's lap time and distance; also in the telemetry column's toolbar), `telemetry/ChartZoomControls.tsx` (Zoom range toggle, Full lap while zoomed; both charts), `GpsMapTelemetryHud.tsx` (inline readouts for both laps, the live lap delta between them, and a status only for limiter, pit lane or wet), `GpsMapTraceCursorChips.tsx` (value, baseline and difference at the fullscreen trace cursor).
     - `GpsMapLapTimingPanel.tsx` (recorded lap/sector times, baseline deltas, live sector split via `display/liveSectorSplit.ts`).
     - `GpsMapCompactTrace.tsx` (renders Speed, Pedals, Delta with 56px scale gutter).
   - **Race mode** (`race/`, the pace car left out by the `/race` route, URL `mode=race`, `t` replay seconds, `car` followed slot; the lap view's Session button opens it on the shown lap at the cursor's moment through `race/raceModeContext.ts`; both modes share the URL's `view` (2D map or 3D)): `RaceReplayView.tsx` + `RaceReplayHeader.tsx` (the shared header without lap and compare: the driver picker follows a car, playback runs the session clock, Lap view opens the followed car's lap with the cursor at the clock's moment (`lapAt` in `raceLaps.ts`, the lap view's `initialLapSec`); opens with the lap view's last metadata so it does not blank out; Back returns to the lap view when that opened the race, which reopens on the lap it last showed (`resumeShownLap` in `useReplayInspectorData`) without loading it again, and leaves the page like the lap view's Back when the page opened on the race; `ReplayInspectorPage`'s `TelemetryVisit` (`telemetryVisit.ts`, session storage by history entry) keeps the entry the page opened on across a hot or page reload, so Back always leaves for the page before), `raceClock.ts` (one session clock, 1–16x), `racePoseCache.ts` (window under the clock, next one past half way), `RaceMapScene.tsx` / `RaceCarMarkers.tsx` (the lap map's toolbar `GpsMapControls` with layers and the race shortcuts help; its brake boards, start/finish and sector lines through `map/display/useTrackMarkerPlacement.ts`, shared with the lap map; every car in its class colour, the followed one white, ringed only while cars are dots; click to follow; hovering a car or a standings row shows its timing line in `RaceCarTooltip.tsx`), `RaceStandingsTower.tsx` + `raceStandings.ts` (your row in the leaderboard's accent tint with the You chip; 10 refreshes per replay second; the Gap header switches to the interval to the car ahead in the class; a double click follows the car on the map; race gaps live from the progress grid: now less when the class leader passed the car's place on the same lap, else at the last line crossing; running order, class places, road gaps; best laps outside races; cars in the pits (the pose windows' `inPit` channel, set even while a car stopped in its box is not drawn) are dimmed here and on the map; a car the results give as DNF/DQ/DNS goes dimmed to the bottom with its status from the end of its last counted lap), `RaceLapTiming.tsx` + `raceLaps.ts` (the lap map's timing panel top left for the followed car: session time, its lap of the race's (results' lap count), the lap and sectors running, the current sector highlighted), `RacePlaybackBar.tsx` (the followed car's lap starts ticked and numbered on the timeline; in a race, Skip to start jumps past the wait on the grid to the frame the followed car starts moving, `findRaceStartSec` in `racePoseCache.ts` over `firstMovingSec`) + `RaceIncidentSelect.tsx` + `raceEventText.ts` (the followed car's incidents in a dropdown: what, who, when; a pick seeks 5 s before), `useRaceReplayControls.ts` (Space, arrows 5 s / Shift 30 s / Ctrl 1 s, Home/End, `,`/`.` speed, the lap map's zoom/centre/follow/pan keys from anywhere on the page, URL while paused). `Race3DView.tsx` (lazy) is the race in 3D behind the map's 2D/3D button, laid out as the lap view's 3D page: `RaceMinimap.tsx` top left (every car a dot in its class colour, the followed one the lap view's car marker) the controls as a horizontal strip top right with the lap view's camera modes and the followed car's timing under them ([plan](plans/proposed/REPLAY_3D.md)).
   - **Telemetry strip charts** (`telemetry/`):
     - Multi-channel charts, `TelemetryScrubCursor.tsx` (sub-pixel snapping), channel presets (`presets/`).
     - Channel scaling: Gear G1-G7 (`gearTraceY` in `telemetryChartPathBuilders.ts`), steering symmetric lap-wide fit (±25/50/100%).
     - Viewport & gestures: `telemetry/telemetryViewport.ts` (Shift-wheel zoom, Shift-drag range, Alt-drag pan, keyboard navigation via `src/utils/replayShortcuts.ts`, whose `useReplayKeys` registers a view's keys with one rule set: typing, browser commands and dialogs keep their keys, then a scope (`page`, `replay`: a chart or map, nothing focused, the fullscreen map, a clicked button; or one element) says where they work. Every replay key goes through it, the map's (`useGpsMapShortcuts`) and the chart's (`useTelemetryStripInteraction`) included: with nothing focused, or after a mouse click outside the charts and maps (a button, a dropdown pick: on a page with replay keys (`replayKeysOn`), a closed `Select` focused by the mouse leaves keys alone), the keys the two share go to the chart and the map takes its own; a button the mouse focused does not hold the keys, so Space plays instead of pressing it again, while one focus reached by a key (Tab, or given back when Escape closes a dialog) keeps them; a clicked chart or map is marked `data-pointer-focus` so `SURFACE_FOCUS_RING` shows only for keyboard focus).
     - Measure marker: X (at the cursor; again on the same spot clears), Alt-click or the Set A button drops marker A (kept as a distance, shared by both strips, the fullscreen trace and the map's From A ghost, Esc or double-click clears; double-click resets zoom only without a marker; Backspace jumps back to A and plays); `TelemetryDeltaMarker.tsx` shows distance, time, baseline time and delta change from A to the cursor on the marker line (pinned to the view edge, with the shaded span, while zoomed past A).
   - **Analysis** (`analysis/`):
     - Corner phase breakdown cards, consistency tab.
     - Steering handling balance: `src/utils/handlingBalance/evidence.ts` (requires sustained response deficit or rear slide, not just Ackermann residual; with baseline, requires ≥0.10s delta growth and sustained speed deficit).

---

## 4. Features Overview

| Feature | Server | Shared Domain | Client |
|---|---|---|---|
| Dashboard | `/api/dashboard` (`sessionSummaries/dashboardQueries.ts`) | `trackSummaryUtils.ts`, `paceCategory.ts` | `components/dashboard/` (`useDashboardData.ts`, `Dashboard.tsx`) |
| Session list | `/api/dashboard` (its `sessions` page: `sessionSummaries/pageQueries.ts`, `cards.ts`) | | `components/session-list/` (`SessionList.tsx`, `SessionGridCard.tsx`) |
| Tracks | `/api/tracks`, `/api/track/:trackName` (`sessionSummaries/trackQueries.ts`) | `circuitSpecs.ts`, `circuitDefinitions.ts` | `components/track-summaries/`, `components/track-detail/` |
| Leaderboard & rivals | `leaderboardRoutes.ts`, `dbRivalStore.ts` | `leaderboard.ts`, `rivals.ts`, `sessions/sessionRivals.ts` | `src/api/leaderboardApi.ts`, `components/leaderboard/` (`rivals/useRival.ts` with `includeRival=true`) |
| Lap comparison | `/api/compare/laps` (`comparisonQueries.ts`, `comparisonLapRows.ts`) | `lapComparison.ts`, `compareLapScope.ts` | `components/leaderboard/`, `src/utils/telemetryCompareLink.ts` |
| Benchmarks | `referenceRoutes.ts`, `server/benchmarks/` (`referenceLaptimes.ts`, `benchmarkImpact.ts`), `dbReferenceLaptimeStore.ts` | `paceCategory.ts` | `src/api/referenceApi.ts`, `common/BenchmarkLadder.tsx`, `settings/ReferenceChangesList.tsx` |
| Settings & scans | `systemRoutes.ts` (`/settings/folders` saves the folders, `/scan` scans, `/sessions/clear`), `/replays/cache` | `shared/domain/folderPath.ts` | `components/settings/` (`SettingsPanel.tsx`, `OverviewCard.tsx`, `replays/`) |

### Cross-Cutting Architecture
- **Baseline identity**: The replay comparison picker identifies the selected baseline by session ID, driver ordinal, and lap ordinal; display lap numbers and optional driver names do not determine baseline status.
- **Dashboard benchmark pace**: `averageQualifiedBenchmarkPace` in `paceCategory.ts` averages each eligible group's lowest percentage (minimum 3 sessions) with equal group weighting.
- **Client routing & code splitting** (`src/App.tsx`, `src/routePages.ts`): Pages load on demand via custom preload wrapper without `React.lazy` reveal-throttling. Development loads visited pages only; production prefetches the remaining pages while idle. Vite warms the entry point and dashboard during dev startup. Recharts is excluded from the initial bundle (`vite.config.ts`).
- **Canonical contracts**: Centralized in `shared/types/` (`session.ts`, `reference.ts`, `replay.ts`, `leaderboard.ts`, `live.ts`, `trackGeometry.ts`, `dashboard.ts`, `status.ts`).
- **Track geometry & surfaces**: `shared/types/trackGeometry.ts` defines map polygons, elevation/grade profiles, and revisions. Validated by `shared/domain/trackGeometry.ts`, stored in `server/tracks/trackGeometryStore.ts`, and served via `/api/data-plugin/tracks/:layoutKey`.
- **Standardized dropdowns**: `src/components/common/dropdown/` (`Select.tsx`) is the sole single-choice selection control; it anchors fixed-position panels via `useAnchoredPanel.ts` and dismisses via `useOutsidePress`. On a replay page a closed trigger picked with the mouse leaves its keys to the replay until Tab brings focus back; elsewhere it keeps them.
- **Session cards**: `session-list/SessionGridCard.tsx` renders bundled SVG outlines from `/track-outlines/<layoutKey>.svg` without fetching heavy metric geometry.

### Live Race Dashboard
- **Tyre crossover**: `shared/domain/live/liveTyreCrossover.ts` supplies optional `LiveStrategy.crossover`
  (`shared/types/liveStrategy.ts`) through `LiveStrategyTracker`. Races on track only: slicks switch at path wetness
  >= 0.125, wets switch at exactly Dry, Damp holds either. A resource stop within three laps takes the change;
  otherwise pit this lap; silent in the last two laps (`CROSSOVER_LAST_LAPS`). The tracker remembers the event's last dry compound. `race/raceAction.ts` gives the tyre
  advice/MFD mismatch priority over tread advice; `liveScreens.ts` checks starting tyres in the race garage.
  Demo scenarios `crossover-wets` and `crossover-slicks` exercise both directions. Crossover action/compound/timing/
  reason changes trigger strategy audit checkpoints for race reviews; continuous wetness changes alone do not.
- **Client** (`#/live`, contracts in `shared/types/live.ts`, `liveStrategy.ts`):
  - `src/api/liveStream.ts` (`useLiveStream`): manages SSE stream (`/api/live/stream`) with reconnect backoff.
  - `LiveTimingStore`: separate `useSyncExternalStore` subscription for high-frequency (5 Hz) timing updates.
  - `LiveEstimatedLap`: distinguishes out-laps from active line projections based on running deltas.
  - UI modes: `LiveRaceView`, `LivePracticeView` (practice, qualifying, warmup; its timing row uses the race columns and `PlanReadoutView` cells), `LivePracticeHistory`, `LivePedalTrace` (canvas rAF from `PedalBuffer` ring), `LiveRacePlan.tsx` (`raceColumns.ts`, `raceAction.ts`; the mid-stint deployment cell replaces the fuel-ratio column for hybrids), `LiveGarageChecklist.tsx`, `LiveDamageRow.tsx`, and `LiveSessionReview.tsx`.
  - Offline demo mode: `demo/LiveDemoPage.tsx` (`#/live?demo=1`, scenarios in `demo/demoScenarios.ts`): the real dashboard page (`LiveDashboardView`) with sample data, to validate it off the car; the garage and grid strategy come from the real `LiveStrategyTracker` fed sample LMU answers and earlier races (`demo/demoGarage.ts`). Only the "Tentative previews" group tries ideas not built yet. With the Hypercar class, race, practice and qualifying scenarios on track carry deployment advice in kW from `demo/demoDeployment.ts` sample laps run through the real controller; the "Hypercar · deployment change" scenario shows the advised step.
  - API anonymization (`src/api/anonymizeData.ts`) is scoped to explicit `demo`/`anonymize` URL flags; browser storage cannot enable it. `useAppData` refreshes status on mode changes, and demo scans never save masked configuration.
- **Server** (`server/live/`):
  - Shared memory reader: `rf2Layout.ts` defines rF2/LMU v3.x layout offsets (vehicle records per LMU's `InternalsPlugin.hpp`; VE, pit state, penalties and tread are read here instead of the standings call); `rf2Decode.ts` performs coherent 3-attempt buffer reads, resolving overall and class leaders independently (`knownCarClass`). `sharedMemory.ts` accesses Windows file mappings via koffi. Tooling: `tools/telemetryRecorder.ts`.
  - Process lifecycle: `gameProcess.ts` monitors `Le Mans Ultimate.exe` via Windows Toolhelp handles.
  - REST poller: `livePitPoller.ts` queries LMU REST endpoints (`lmuHttp.ts`) at safe intervals, pausing sensitive reads (e.g. `getVehicleCondition`) in replays. `lmuNavigation.ts` probes state; `liveIdentityResolver.ts` resolves session layouts.
  - Deterministic engines: `liveLapTiming.ts`, `liveLapsLeft.ts` (`computeLapsLeft`, `projectRaceFlagSeconds`, `raceClockRunning`), `liveResourcePlan.ts` (`planRace`, `neededStopNow`, `planGarage`; a practice garage plans the scheduled qualifying), `livePitTime.ts` (planned stop service from the pit entry amount), `shared/domain/strategy/raceStrategy.ts` (`planRaceStrategies`: the race plan in any garage before it, shown by `LiveRaceStrategy.tsx`),  `liveCarCondition.ts` (with the raw `hybrid` fields), `liveWeather.ts`, `liveInsights.ts`, and `liveAudit.ts` (`LiveAuditTracker`).
  - Scan hold: `ServerContext.setLiveSessionLoaded` queues background scans while a live session is running (`holdForLiveSession`, `runHeldScans`).

### Local Data Packages (`server/plugins/`)
- `dataPlugin.ts` loads external track geometry, physical profiles, and manufacturer assets from backend-only `LMU_PLUGIN_ROOT`.
- Manifest schema 12 is the only supported package format ([contract](PLUGINS.md#contract)). The file shapes, fixed paths and parsers are the
  pipeline-owned contract module, copied verbatim into `shared/packageContract/` (generated by the pipeline's `npm run package -- sync-contract`,
  never edited here, excluded from lint). The pipeline validates the whole package before it publishes, so the loader only parses what it serves: `scenePackage.ts` expands the scenery catalog with the
  rendering profiles, and `bodyPackage.ts` indexes the vehicle bodies by id and folder (their descriptors are served unread, checked by the pipeline); `dataPlugin.ts` parses the manifest
  (exactly schema, id, version) and the catalogs, wires them, and reads each track file on first use (`trackGeometry`). `dataPluginRoutes.ts` serves `/scenery/:layoutKey`, `/scenery/files/...`, `/vehicles/:identity/body`,
  `/vehicles/files/...` and `/rendering/files/...`; `src/api/sceneryApi.ts` fetches the cloud map files a layout names and `shared/domain/scenery/cloudMaps.ts`
  slices them into mips; it also fetches the layout's road height grid, which `shared/domain/scenery/roadHeight.ts` reads into a lookup
  (`roadHeightAt` on the layout resource).
  `src/components/replay/view3d/` owns the lazy Three.js viewer, cameras and
  discontinuity-safe XYZ/quaternion attitude sampling in `scene/replayPose.ts`, preserving recorded body
  height and available pitch/roll. `scene/replayPose.ts` (`nativeToScene`) owns native-to-render handedness.
  `scenery/` streams the track: `residency.ts` is the pure resident-set rule (lap-distance window, free-camera radius, hysteresis),
  `sceneryStream.ts` loads the whole circuit in order around a view with bounded concurrency and keeps it (a chunk outside the window is hidden; nothing unloads before the scene goes, so textures, shared materials, batches and ray trees are freed all at once), `chunkLoader.ts`
  parses chunk GLBs (Meshopt, KTX2 through `cachedKtx2Loader.ts`), and `streamView.ts` turns the replay position and camera mode into
  a stream view. `sceneryGround.ts` builds one `three-mesh-bvh` ray tree per resident chunk (in the library's worker) that answers both
  wheel/line contact heights and camera ground/obstruction checks, each triangle tagged with the queries it serves; contact heights read
  the road height grid first and cast rays only off it or for another deck. Its
  native-coordinate position-only geometry is chunk-owned and never exported. `sceneryBatches.ts` draws each opaque material once
  across chunks: one `BatchedMesh` per package material key (`lmuMaterial`) and shadow flags, sized once from the layout's
  material totals; a chunk's instances show while the chunk does and, for the car-following cameras, within their node's `lmuLod` draw
  distance (the batch leaves the scene with no instance in range), and a material's batches drop their CPU arrays once its last chunk is uploaded.
  `scenery/lampSize.ts` keeps far lamps a size on screen at night: before batching, each glowing part's vertices get their lamp's centre and negated radius (`_lmu_lamp`, faces joined at shared points); the luminous program grows a lamp under 1.5 px in radius to that size about its centre and dims its emission by the square of the growth (`vSurfaceLampShare`), so a bulb smaller than a pixel no longer blinks as the raster catches and misses it.
  `scenery/realRoad.ts` draws the track surface state on the road and kerbs (docs/SCENE_PACKAGE.md#realroad-elements in the pipeline): road and kerb vertices carry a venue point id (`_lmu_realroad`), the layout's point table (fetched with the layout by `src/api/sceneryApi.ts`) maps it to a surface element, and the element states are gathered through the table into each vertex's two-byte `surfaceRealRoad` attribute (rubber, loose material) before the chunk is batched (`prepare`): no texture unit, which would push the roads with the most maps out of their batches. `materials/roadSurface.ts` mixes the groove, dust and marbles as the game's road and kerb shaders do (a track-average groove reads the median rubber). The state drawn is the assumed one, `ASSUMED_RUBBER` (51 of 255, the look accepted with freeze-v18) on every element: the replay's own (`docs/VCR_FORMAT.md` §4.21; a decoder for it was removed unused, 7fdc0455 has it) waits for a replay cache step, not planned now.
  `scene/sceneShell.ts` is the 3D view without its content: renderer, scenery stream, ground, batches, sky and environment, auto
  exposure, the car reflection, cameras, warm-up, the draw loop and resize/hidden handling; content plugs in as a `SceneContent`
  (root, the car the reflection probe renders, a per-frame hook, re-drape, dispose); each frame updates only the shown, unfrozen
  nodes' matrices (`scene/shownMatrices.ts`); `scene/dayLight.ts` holds the scene's day share (`dayShare`: the package's `shading.ambient` level from the sun's green, set by `sceneEnvironment.ts` with the sun), by which screens glow between their night and day strengths and night-only glows light. One shell serves both views on a circuit:
  `scene/sceneShells.ts` keeps it per layout, geometry and package revision (`acquire`; a broken shell is replaced, one whose first
  view failed before it started is dropped), the replay inspector page providing it (`SceneShellsContext`); a view attaches its
  element (`attach`: only the canvas and its resize observer move), starts the shell or shows its content in place of the last
  view's (`show`, the camera placed afresh by `rig.unplace`), and leaving detaches and disposes only its own content, so a
  race ↔ lap switch keeps one WebGL context, the scenery, textures, shadows and parsed bodies; on a started shell the race shows at once,
  its followed car a stand-in until `follow` builds it. `laps/replayScene.ts` is the shell with the lap
  layer (the lap view; `ReplaySceneHandle`), `race/raceScene.ts` the shell with every car of a session (the race replay; the
  followed car the field's full model of it, lent to it (`RaceField.near` builds its body's full models first when they are not,
  ahead of every other load: its body's far models and the other bodies' start after; `lend`/`reclaim`), with its cabin added for the driver cameras; `race/raceField.ts` draws every other car by tier:
  near (the nearest 6 in view inside the body's far-model distance `far.fromM`, entering at 0.85 of it) as its full model with
  wheels, lamps and shadows, interior parts dropped; a body's full models are built together (one body at a time) the first time
  one of its cars turns near, batched with the others of the body, and kept (driving back through the grid builds nothing); far as the body's far model
  (`cars/farCars.ts`: one parse per far file, each livery's paint and retextured materials from the textures' start files, the paint
  through the full paint's layers so a car swapping models keeps its colour (`car/paintLayers.ts`: region map, AO mask, carbon, what the diffuse light loses to the coats and the lacquer; both coats reflect three's sky environment, not the car's own probe), every other primitive with the metalness, roughness and occlusion its vertices carry (`_LMU_SURFACE`; a far file without it is refused; a primitive its material marks `glass` adds its reflections at whole strength, as `glassSurface` does), only the
  triangles of the option parts its appearance shows), batched with every other car of the body (glass and blended pieces too, sorted in their batch), still, casting and taking the sun's shadow as a full model does, its paint's normal shadow influence for the whole shell (`casters` lists every drawn car, so a car turning near or far keeps its shadow; a far car and a stand-in lie on the full models' contact shadow, sized to its bounds: `race/blobShadows.ts`, one instanced draw, the quad from `car/carContactShadow.ts`), its brake and head lamps lit for the 16 nearest in view within 300 m (`cars/farGlows.ts`: the lamp glow meshes the far model carries beside its car primitives, read with it by `farCars.ts` and split by option part, one instanced draw per lamp, option part and state frame of a body (the off frame too, which the game draws dark), textures from their start files, never sharpened; no full body is parsed for them); out of
  view hidden; every car of a body loads its far model at once (two bodies at a time, nearest the followed car first); a
  car still loading draws as a grey stand-in (`race/standInCars.ts`: the far model of the first car of its class loaded, merged
  to one geometry, one instanced draw per class, its lowest point on the road under the pose; a class without one yet borrows
  the first loaded, nothing draws before any; a car without a body stays a stand-in); the lap layer loader parses each body
  once per scene and loader (keyed by folder and file hashes) for all its liveries; `race/racePosePoints.ts` gives a car's samples of a
  pose window as its wheels' and lamps' track; the scenery streams ahead of the followed car by its track station from the race progress grid (`trackStation`, around the camera without it); chase look-ahead and trackside spots run along the followed car's samples of the current pose window; a followed car still in its garage box places the camera on its nearest pose, else the first car on track; a follow switch moves the camera at once, the field drawing the car until its cabin, compiled against the probe's prefiltered cube (`CarReflection.share`), is added and the field lends it the model; a driver camera waits for the cabin) and `race/useRaceScene.ts` drives it from the race clock, the pose windows and the followed car. `race/RaceCarHover.tsx` shows the 2D race map's car tooltip beside the pointer over a car of the 3D view: the scene's `pick` takes the cars whose box's outline on screen holds the pointer (`race/carPick.ts`, nearest first; each box is the car's body bounds, the field's far model, the fixed box for a grey stand-in, or for the followed model, drawn large, each of its parts' boxes without its contact shadow (`envelopeParts`: a roof aerial does not widen the roof), set on the road under the pose by `placeOnRoad`, since a pose is the body's centre above the road) and of those, right after a frame (`SceneShell.afterFrame`: between frames the clock has moved the cars, whose parts follow at the next frame), the car whose surface the frame draws under the pointer (`carSpans`: where the pointer's ray passes through each car's parts; `scene/pointerSurface.ts` draws that one pixel with the scene's materials, so glass and fence cut-outs hide nothing, and asks the GPU with occlusion queries which stretch holds the drawn depth: answered a frame or two later without reading a pixel back, which stalled a frame for as long as the GPU was behind).
  `cars/` is the car renderer both views share: `carParts.ts` a car's flat part table (anchors: the body, wheel, steer and spin
  nodes and the steering wheel; each part a fixed matrix to its anchor; the car out of three's matrix walk, `sync` placing what
  moved once a frame; cockpit view and camera-distance levels, which a car's tables share: a cabin's table holds only its own
  parts), `carBatching.ts` one batching system (one `BatchedMesh` per
  material and shadow flags; a single car's batches ride in the car, a body's far cars share batches in the parent frame; a batch
  draws only while one of its parts shows; until `ready`, after the warm-up, a batch is in `UNSEEN_LAYER`, which no pass draws,
  as is a cabin until shown), `carMotion.ts` the wheels and lamps along a track, built and refitted only once the car
  is drawn, `drawnCar.ts` every full-model car of a scene (`createCarSets`: `build` the one path for every car, the lap's (a set of
  one with its own materials) and a body's near cars (one set sharing the body's materials), every level kept, the parts marked
  interior dropped; glass and decals sorted in their batch; `cabin` adds the body's cabin to the car the cameras ride on (the lap's,
  the race's followed field car): its own part table and batches riding in the car, each part under a hidden holder until shown, at
  the car's distance 0 its full level shows; `driven` the car the cameras ride on built on its own with its cabin (the lap's car, the
  race's first followed car); `ghost` the lap's ghost part by part. `keptCar.ts`: the shell's `keptCar`, the driven car the last view
  or lap let go, which the next one driving the same entry takes as it is (lap ↔ race shows the car at once, nothing rebuilt; one car
  at most). `createDrawnCars` under it: part
  tables, motion, batches shared by the set, solid parts casting from one shadow-only batch on `SHADOW_ONLY_LAYER`),
  `carTemplates.ts` the scene's parsed bodies (the shell's `carTemplates`: the exterior GLB for every car, its parts marked interior
  included at their distance levels, the cabin seen through the windows; `cabin` the interior GLB's chassis parts at their full level,
  each naming the car node it hangs under;
  a parse shared by the builds asking while it is pending, then dropped, unless held: the race holds the exteriors of the bodies with cars near the camera, so following one parses only its interior; the car the cameras ride on (the last `cabin`) keeps its exterior and interior parses, so a lap ↔ race switch builds it without a parse), `carModels.ts` each livery's model, or cabin, from them (materials by content, lamps and glow, textures from start files;
  `shareMaterials` for cars drawn many at once, whose dropped models leave the shared materials), plus the wheel files
  (`wheelGeometry.ts`, `wheelAnimation.ts`, `wheelMotion.ts`: each wheel turns by the replay's recorded angular speed, else the
  car's travel over the wheel radius) and `carObject.ts` (`makeCar`). `src/api/vehicles/bodyStore.ts`
  fetches each body once per VEH id and package revision for a view (the lap view keeps the last four, the race every livery); the liveries of a body share one read of its descriptor and cabin volumes.
  `batching/batchedParts.ts` is the one batching toolkit of scenery and cars: a sized `BatchedMesh`, hidden instances, bounds before
  the CPU copies go, the release on upload, and shown counts (a batch draws only while one of its owners shows instances).
  `scene/useSceneHost.ts` is the 3D views' shared lifecycle (one scene per key, abort, progress and error state, disposal) and
  `scene/Scene3DFrame.tsx` their shared frame (host, camera controls, loading and streaming cards, slots for each view's panels);
  both views stay loaded behind 2D once opened (the scene stops drawing while hidden).
  `camera/cameraRig.ts` owns the cameras, OrbitControls and how each mode follows the car (`RigCar`: the model, its game cameras, the
  samples around it for the chase look-ahead), and
  `scenery/sceneWarmup.ts` compiles and uploads each chunk (with the batches it created) before it joins, then sharpens reduced textures: the car's first, then the chunk nearest the camera, the largest first within it. A sharpened texture comes into focus over 0.4 s instead of in one frame (`scenery/textureFocus.ts`: the scenery surface program, car paint and three-drawn car parts sample it no finer than the levels it drew without, easing to none; the scene draws frames until the last fade ends). The compile skips meshes in no camera layer (batch stand-ins; three would link a program for each), and while the scene shows, uploads go in per-frame slices of time and bytes, one byte budget a frame shared by the sharpening and every warm-up (`scenery/geometryWarmup.ts` takes the slice).
  `laps/useReplayScene.ts` retains the scene for a layout/geometry/package revision; selecting
  either lap replaces only `laps/lapLayer.ts` cars, wheel animation and racing lines, preserving
  the camera and scenery. Cancelled or superseded builds are discarded and retired lap buffers released.
  `scene/loadProgress.ts` weighs the load steps `laps/replayScene.ts` reports for `scene/Replay3DLoading.tsx`: the loading card (the shared
  `LoadingState` with its rings tilted) and, after the first frame, the corner note counting scenery chunks and textures still sharpening.
  The 3D toolbar's Line menu (`GpsMapModeBar.tsx`) hides the racing lines or picks their colouring.
  Canvas resizes repaint before the browser paints, avoiding a black frame when embedded toolbars change height.
  `sceneEnvironment.ts` (its sun and weather set once at creation and again by `setSun`, which `scene/sceneShell.ts` `setDaylight` calls with a replay clock's moment once the sun has moved `SUN_STEP_DEG`: the lap view with its lap's clock on attach and on a lap change, the race view with `raceDaylightClock` (the race overview's `daylight`: race start and sampled weather, built at the race clock's time) on attach and at most once a second as the clock moves; the exposure follows with `autoExposure.ts` `setSun`) owns the sky dome (`atmosphere/skyDome.ts`: the package's Hosek-Wilkie sky cooked by `atmosphere/hosekSky.ts`, its colour looks
  by sun strength (`atmosphere/timeOfDay.ts`, shared with the exposure profiles), turbidity and haze model, each view direction turned by the package's sky box, the only reader of `sky`), the haze (`atmosphere/haze.ts`: three's fog chunks with the scene's height and sun terms; its colour from the
  sky above the horizon toward the view), the clouds' hold on the sun (`atmosphere/clouds.ts`: the package's cloud field placed from the replay's
  cell codes and layer drifts around the LMU local origin, its coverage and the sun visibility from the camera, measured again a few rows a frame by `atmosphere/sunMeter.ts` as the camera moves and shown by `setSunVisibility` without new shadows or venue capture; the loader parses it with the contract's `parseRenderingIndex`), the drawn clouds (`atmosphere/cloudLayer.ts`: one mesh per placed sheet, fixed in the world, lit by the package's cloud lighting), the first PMREM environment, the venue capture at the layout's
  `environmentProbe` that replaces it, and the car-following shadow sun. The night is one continuous scene in `night/`: `night/skyBodies.ts`
  (the sky middleware's refracted sun and moon), `night/nightLight.ts` (twilight, moonlight, the mapped ambient, fog, the sun's direct
  share and the track lights' light level, from the package's `sky.night`), `night/nightMoment.ts` (one replay moment's night facts at
  the replay's own night scene: which body lights, the night and track-light switches, the dome weight); `night/nightDome.ts` is the
  game's Perez night sky, which `atmosphere/skyDome.ts` mixes into its day sky by the dome weight. `night/trackLights.ts` works out each
  chunk vertex's track light sum as the chunk loads (its light list, else every light in reach through a grid) into four RGBE bytes in
  place of the light-list id; `night/trackLightProgram.ts` adds it to the scenery's diffuse, and on every car program sums the lights
  nearest the camera per vertex (picked each frame), under one shared switch. `night/carSpots.ts` adds the cars' headlight beams (the
  body's GEN spots) per pixel in the same programs: the 20 nearest the camera, from the cars the content reports with their headlight
  bit on (`SceneContent.headlights`: the lap's car, or every placed race car through `race/raceBeams.ts`). `night/cockpitLight.ts` is
  the cabin rule: a material with a cockpit mode drops the track light and the beams ('on') or scales them by its emissive alpha
  ('emissiveAlpha'), and at night adds its own `cockpitLight` placed in the lap car's frame (glass takes no beams and no cockpit light).
  `night/nightSwitch.ts` shows a switched node (`extras.lmuVisibility` day / night / lightsOn) in its state; such nodes keep their own
  draws (out of the shared batches), and every state warms with its chunk before the switch takes it, so a switch uploads nothing.
  Cars come from the `cars` catalog: `car/carMaterials.ts` builds materials from the
  descriptor (standard, tyre, screen, glass and windscreen kinds on the scenery's surface program; surfaces in the app's names, version 4, every value filled: `finish` per material, paint `regions` / `uvScale`; blended parts draw in the game's `sortOffset` order as three's `renderOrder` (`carPartOrder`, set in `cars/carModels.ts` and carried by each batch; far parts take it from their glTF extras, far glows from their lamp material): the outside windscreen, 5, over the lamp glows, which on many bodies covers the tail lights; a mirror the package flags `rearView` draws as dark glass, without the game's live rear view; `car/carPaint.ts`: regional car paint from the package's paint description, its layer rules in `car/paintLayers.ts` (shared with the far models' paint); `car/carContactShadow.ts`: the under-car shadow, analytic until `car/underCarBake.ts` bakes the body's shade once, for all its liveries (its close exterior, copied as positions when the first car of the body is built since the batching takes the parts' vertices before the first draw, drawn from below into a height map, then a horizon occlusion pass; the shell flushes one body a frame);
  `car/carReflection.ts`: the cube-map reflection probe at the car (with each face's eye; three faces a frame, a conversion step riding each frame; the faces draw only the resident scenery nodes the package flags `lmuReflect`, within the layout's `reflection.observedClipM`: `sceneryBatches.ts` splits batches by that flag and hides the others while the faces render); `car/overheadMap.ts`: the scenery around the car seen from straight above and from straight below as depth (the shadow caster pass from the zenith and the nadir, redrawn when the car leaves its middle; from below only undersides show; its shader test is shared), which car paint, glass, lamps and trim test their rising reflected rays against, from the car and from the face's eye, to replace what the probe could not see (a bridge's or tree's underside as the probe saw it, or the sky) between probes; `car/cockpitOcclusion.ts`: the cockpit reflection occlusion, each occluded material marching its reflected ray through the body's cabin volume (a 3D texture `bodyApi.ts` fetches with the body) and dimming the probe's reflection where the cabin closes it; `car/carLamps.ts`: the unlit glow of headlight and brake lamps; `car/readoutDraw.ts`: the game's wheel/dash readout draw rules (each element's replay input, value and quad; elements the replay has no input for are not drawn); `car/readoutCanvas.ts`: the readout canvas, a render target the lap's car paints once a frame (`readoutPainter.flush` in `scene/sceneShell.ts`) and its screen materials show in place of their albedo (`cars/carModels.ts`, the lap view's own-material cars only)), `shadows/` the sun's one shadow, the package's cascades (`shadowCascades.ts` layout, centres and sun axes; `cascadeShadows.ts` the atlas pass, its cached far cascades redrawn one a frame when they drift, the cars drawn each frame over the live cascades and the far ones whose slice holds a car with its full model; `cascadeSampling.ts` the uniforms and GLSL, `patchCascadeShadow` multiplying the sun in three's light loop for scenery and car materials by each material's `normalShadowInfluence` (no three shadow map); `sceneEnvironment.ts` draws the set `camera/cameraModes.tsx` `shadowCascadeSet` picks (cockpit: cockpit; trackside: tv; every other view, overhead included: chase) with the car-mounted view's game camera keys over it (`shadowCameraOf`); `shadowCasterPass.ts` the caster draw with each cascade's depth bias as polygon offset (opaque single-sided casters draw their visible side, alpha-cut ones the other, foliage both), in plain depth while the scene itself draws into a reversed float depth buffer (`laps/replayScene.ts`, `autoExposure.ts`: a banner 1 cm in front of its wall stays in front at any distance)), `autoExposure.ts` meters on the GPU every fourth frame at 60 Hz and adapts every frame (a 1 × 1 float state the canvas pass and the racing line read, `exposureUniforms`; the state comes back to the CPU only on quiet frames, which the shell marks, to tell when to stop drawing; each tap of a 128 × 72 grid over the type's window through the exposure and tone curve, averaged, its Rec. 709 luminance read through the curve's exponential alone, −ln(1 − y), as the middle grey is: a glint counts at most one tap), white-balances, tone-maps and encodes with the scenery catalog's `camera` type for the view (`camera/cameraModes.tsx` `exposureType`), `cars/wheelGeometry.ts` reads the four wheel rigs, `cars/wheelAnimation.ts` fits the model origin to the lap median and drives
  roll/steer/travel per corner (travel from the telemetry's ride height, else the replay's suspension deflection, each corner's
  rest fitted to the road as the scenery streams in; else the road under the tyre) plus the steering wheel, `camera/driverCameras.ts` places the Cockpit/Hood/Roof views on the descriptor's game
  cameras, and `cars/carObject.ts` makes the car and styles ghosts; `cars/ghostFade.ts` fades the lap's ghost out within 1 m
  of the camera and hides it with the camera inside its body (a driver camera on a car the ghost overlaps). Brake boards are part of the scenery GLBs.
  `laps/racingLine.ts` drapes the 2D-coloured line ribbons and re-drapes them as chunks stream in; `camera/tracksideCameras.ts` places the fixed trackside spots.
  Corner focus: `laps/useCornerFocus.ts` (the picked corner's stretch, `cornerFocusRange`, looped through the playback cursor's
  `setLoop`), `laps/CornerFocusBar.tsx` (loop, slow, Corner view, leave), `camera/cornerFraming.ts` (the orbit eye outside the turn)
  and `laps/drivingMarks.ts` (each lap's brake, turn-in, slowest point and throttle-on stripes, through `racingLine.ts`'s `makeDataMesh`).
  `camera/cameraNavigation.ts` owns projection-aware keyboard pan/zoom. The 3D view shares
  `useGpsMapShortcuts.ts` with 2D; OrbitControls handles pointer input without consuming replay arrows.
  `camera/cameraModes.tsx` owns mode labels/keys and `camera/cameraTracking.ts` provides velocity-blended target
  yaw with rotational/vertical damping for Chase mode while preserving user camera/focus offsets
  during Follow/Chase updates; manual camera movement does not change the selected mode.
  `laps/racingLine.ts` drapes depth-tested racing lines on the nearby native road layer; measured
  coordinates and analytics stay native. `ReplayMapContainer` switches 2D/3D (the 3D view, once opened, stays loaded and hidden behind 2D until the page changes), and `src/api/sceneryApi.ts` and `src/api/vehicles/bodyApi.ts`
  load layouts, chunks and cars through the API client (a body's GLBs only through `LoadedBody.files()`, read for the parse and not held after it; the loader stores each part's box as `userData.footprint`, which the contact shadow reads instead of the vertices). The existing replay cursor owns time in both views.
- `parseTrackLayout` (`shared/packageContract/tracks.ts`) is the pipeline's layout check (route lengths within 0.01 m); the app does not run it at startup. Routes in `dataPluginRoutes.ts` serve geometry and vehicle logos (`/api/data-plugin/vehicles/logos`).
- Geometry validation: `hasCompatibleTrackStations` (`shared/domain/trackGeometry.ts`) requires matching geometry revisions before computing geometry-dependent corner analysis; missing geometry leaves recorded-channel analysis available.
- Vehicle logos: `resolveCarManufacturer` (`shared/domain/vehicleMapping.ts`) matches names against a word-bounded rule table. Client loads logos via `src/api/vehicles/vehicleLogosApi.ts` and renders `CarLogo.tsx` and `CarIdentity.tsx`.

---

## 5. Cache Versions: What to Bump

| Constant | File | Bump when | Effect |
|---|---|---|---|
| `DB_PARSER_VERSION` | `server/core/dbSessionSync.ts` | XML parser or lap classification rules change | Every stored session is reparsed from XML |
| `SESSION_SUMMARY_PROJECTION_VERSION` | `shared/types/sessionSummaries.ts` | Persisted summary facts or derived column rules change | Bounded rebuild from stored rows without XML rereads |
| `REPLAY_MATCHING_PROJECTION_VERSION` | `server/core/replay/dbReplayMatchingStore.ts` | Replay matching criteria change | One-time rebuild from retained metadata |
| `REPLAY_CACHE_VERSION` | `server/core/dbCache.ts` | Replay decoding or trajectory blob format changes | One-time offline migration: re-decode on-disk replays, rewrite or relabel rows of deleted ones |
| `DUCKDB_TELEMETRY_CACHE_VERSION` | `server/core/dbCache.ts` | DuckDB lap cache schema changes | DuckDB lap cache rebuilt |
| `CORNER_PASS_VERSION` | `server/corners/cornerPasses.ts` | Corner pass rule or row changes (also keyed by the turn lists' and placement versions, the centre line revision and the stored laps) | Offline rebuild with `tools/analysis/buildCornerPasses.ts`, app stopped; never on open |
| `SEQUENCE_MAP_VERSION` | `shared/domain/cornerSequences/sequenceMap.ts` | Sequence map rule changes (also keyed by the turn placing) | Every map rebuilt from its laps, then the sequence passes, offline with `tools/analysis/buildCornerPasses.ts` |
| `TELEMETRY_LINK_RULE` | `server/telemetry/telemetryLinks.ts` | DuckDB-to-session linking logic changes | Session-to-DuckDB links re-evaluated |
| `LIVE_MODEL_VERSION` | `shared/domain/live/liveAudit.ts` | Live plan behaviour changes (laps left, garage load, stops) | New audit records carry it; old and new plans never share a cohort |
| `LIVE_BASELINE_MODEL_VERSION` | `shared/domain/live/liveAudit.ts` | Uncorrected fuel/VE forecast formula changes | Learning cohorts restart on the new version |
| `CALIBRATION_POLICY.version` | `shared/domain/learning/calibration.ts` | Learning gates or holdout rules change | Models re-evaluated under the new policy |
| `LIVE_CAPTURE_NORMALIZATION_VERSION` | `shared/types/liveCapture.ts` | Recorded live channels or units change | New recordings use it; older versions stay readable |

---

## 6. Recipes

- **New lap/driver fact from XML**: Declare raw shape in `sessionXmlTypes.ts` → parse in `parser.ts` (`parseLap`/`parseDriver`/`parseStreamEvents`) → add field to `LapData`/`DriverData` in `shared/types/session.ts` → bump `DB_PARSER_VERSION` → add unit test in `test/server/sessions/`.
- **New fact from linked replay**: Read replay tables with `dbReplayLapStore.ts` → implement pure logic in `shared/domain/` → attach in `GET /api/session/:id` (`sessionRoutes.ts`).
- **New line in expanded lap row**: Add section in `src/components/session-detail/table/lapDetailSections.ts` → update context in `lapPlaces.ts` if needed → test in `test/components/session-detail/lapDetailSections.test.ts`. Keep `SessionLapTableRow.tsx` under 300 lines.
- **New session scalar or driver/lap column**: Declare in `server/core/sessionRows/specs.ts` → update `writer.ts`/`reader.ts` and round-trip tests. If derived, update `shared/domain/sessionSummaries/`, bump `SESSION_SUMMARY_PROJECTION_VERSION`, and update `cards.ts` if displayed on cards.
- **New API endpoint**: Add handler in `server/routes/<domain>Routes.ts` → mount in `server/index.ts` if creating a new router → add supertest in `test/server/routes/` → add typed client fetcher in `src/api/`.
- **New SQLite table/store**: Add DDL in `dbSchema.ts` → create prepared statement functions taking `Database` in `server/core/db<Name>Store.ts` → call via `sessionDb.getDb()`.
- **New circuit layout**: Add layout definition and targets to `shared/domain/circuitDefinitions.ts` → add basic SVG to `public/track-outlines/`. Detailed metric geometry belongs in external local packages.
- **New vehicle mapping**: A new car is a `VEHICLE_MODELS` row in `shared/domain/vehicleMapping.ts` (class, LMU car name from `Classes`, public model). Then run `node tools/release/updateVehicleKeys.mjs <getAllVehicles.json> <.veh folder>` to add its vehicle files and entry names to the generated `VEHICLE_KEYS` block (keys are only added, so older game versions keep resolving). Class dimensions belong in `vehicleDimensions.ts`.
- **New session list filter**: Add control to `narrow` slot of `DashboardFilterBar.tsx` and `TrackSessionsToolbar.tsx` → clear in filter resets (`resetFilters` in `Dashboard.tsx`, `resetSessionFilters` in `useTrackDetailState.ts`).
- **Navigation link**: Use React Router `Link` with a concrete `to` prop. For custom click handling, pass `linkClickHandler` from `src/utils/linkClick.ts`.
- **Vehicle dynamics channel**: Follow ISO 8855 (positive left for steering, yaw rate, lateral G, lateral offset). Convert LMU coordinate signs during ingestion (`replayTrajectory.ts`, `duckdbReader.ts`). Handling calibration resolves selected-car plugin physics or historical approximate defaults in `shared/domain/vehicles/handling.ts`; `telemetryPostProcessing.ts` passes it to the canonical `computeUnderOversteer` implementation for both DuckDB and VCR.
- **UI colors**: Use semantic `lmu-*` roles from `tailwind.config.js` (`text-lmu-gain`, `bg-lmu-warn-strong/20`). Chart colors come from `src/utils/themeColors.ts`.

---

## 7. Tests and Quality Verification

- **Full test suite**: `npm test`
- **Single test file**: `npx vitest run <path>`
- **Typecheck & production build**: `npm run build` (enforces zero warnings and zero errors standard).
- **Endpoint performance benchmarks**: `npm run benchmark:endpoints` (runs HTTP benchmarks against fixed cohort; see `docs/performance/ENDPOINT_BENCHMARKS.md`).
- **Test placement**: Mirrors source layout (`test/server/`, `test/domain/`, `test/utils/`, `test/components/`).
- **Fixtures**: `test/fixtures/{results,replays,telemetry}`; synthetic VCR in `test/utils/mockVcr.ts`.

---

## 8. Reference Documents

- Documentation index: [`docs/README.md`](README.md).
- Active proposals and design plans: [`docs/plans/README.md`](plans/README.md).
- Data format specifications: [`docs/XML_FORMAT.md`](XML_FORMAT.md), [`docs/VCR_FORMAT.md`](VCR_FORMAT.md), [`docs/TELEMETRY_FORMAT.md`](TELEMETRY_FORMAT.md), [`docs/LMU_REST_API.md`](LMU_REST_API.md), [`docs/LIVE_CAPTURE_FORMAT.md`](LIVE_CAPTURE_FORMAT.md).
- Performance checks: [benchmark guidance](performance/ENDPOINT_BENCHMARKS.md).

---

## 9. Smells That Need Attention

### UI Follow-ups
- **Standings sorting vs class position**: Session standings emphasize class position while sorting and gains currently use overall results. Reconcile intended behavior in `SessionRaceStandings.tsx` and `SessionRaceStandingsRow.tsx`.
- **Keyboard navigation**: Complete keyboard focus containment and Escape restoration for session detail dialogs and fullscreen replay map (`SessionRulesModal.tsx`, `useMapFullscreenFocus.ts`: the map fills the screen under the replay header, following its height while open, `ReplayShortcutHelp.tsx`).
- **Focus speed cue**: `habitSpeedLine` (`debrief/habitText.ts`) reads "Apex 91 → 89 km/h" (the driver's, then the target's) even where the driver is already quicker, under a "Brake later" headline.
- **Goal sentence not shown**: `DebriefGoal.line` (`debrief/drivingHabits.ts`, "0.76 s to find for Competitive pace · Good now") is built and tested, but the card now draws the goal from `level`, `next` and `title`.
- **Corner comparison apex sampling**: `computeLapSegmentComparisons` reads the baseline's minimum speed at the primary lap's slowest point (`segmentComparisons.ts`), at or above the baseline's own minimum; `baselineMinDistM` already finds the baseline's own slowest point.

### File Size Limits Watchlist
Counted 2026-11-15.
- **Source files near 1,000 lines**: `tools/telemetryRecorder.ts` (968), `server/telemetry/duckdbReader.ts` (871), `shared/domain/circuitDefinitions.ts` (774), `server/live/capture/recordingStore.ts` (759); tests `test/server/core/serverContext.test.ts` (907), `db.test.ts` (819), `test/server/live/liveService.test.ts` (800).
- **Directories over 20 files** (the rule is not linted): `test/utils/` (21). **At 20**: `src/components/settings/`, `src/components/replay/view3d/scenery/materials/`, `shared/types/`, `shared/domain/live/`. **At 19**: `server/core/`, `src/utils/`, `src/components/replay/race/`, `replay/map/scene/`, `replay/map/display/`, `replay/inspector/`.
- **Components near 300 lines**: `ReplayInspectorModalBody.tsx` (299), `ReplayInspectorContent.tsx` (289), `ReplayInspectorSidebar.tsx` (283), `TelemetryPresetModal.tsx` (273), `GpsSceneMarkers.tsx` (272), `DrivingHabitsCard.tsx` (272, counted 2026-11-21).

### 3D replay (code review 2026-11-15)
- **Race pick sizes**: `race/raceScene.ts` pick projects with the canvas client size while `RaceCarHover.tsx` measures the pointer against the host rect.

### Settled, not smells
- **Corner sequences (review 2026-11-19, driver)**: no guard for an empty fresh map in a recheck (laps that drive every turn always make a sequence); a pass-worker run with no map to read (once per replay, when its "no map" key is first stored); the offline `buildCornerPasses.ts` needing a second run on a new database (ingestion builds turn passes, then maps, in one go); `act(...)` warnings once reported in the race replay view's tests (never reproduced). Do not re-flag.

### Known Data Limits
- VCR/XML logs do not prove in-session repairs. Live capture records vehicle condition and REST repair estimates, but inferred completed repairs retain uncertainty.

---

## 10. Keeping This File Current

Update this file in the same commit when you:
1. Add, move, or rename a module, or create a new directory.
2. Add or modify an API endpoint, SQLite table, client route, or cache version.
3. Fix or discover an architectural smell (Section 9).
4. Verify tests and build numbers (update the verification baseline at the top).

### Refactoring boundaries

Keep coupled replay selection/swap/retry transitions together unless an extraction preserves them
with explicit transition tests. The corner analysis engine and corner consistency both read the corner passes but keep their own lap and
traffic eligibility rules. Similar variance arithmetic does not make lap and corner consistency the same domain metric.
Scalar telemetry channels have different ranges, overlays and empty states; share identical rendering
responsibilities without hiding those differences in a broad configuration schema.
