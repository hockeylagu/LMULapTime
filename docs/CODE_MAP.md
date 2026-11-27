# Code Map: Where Things Live and How They Flow

A fast index: find the right file without searching. `AGENTS.md` holds the rules, the format docs hold the
data contracts, and module header comments hold each module's design rules; this file only says **who owns
what**. Keep it current (section 9).

- Contracts: `shared/types/` (`index.ts` is the only barrel). Own-module contracts, imported directly to avoid
  cycles: `server/telemetry/duckdbTypes.ts`, `server/core/replay/replayStorageTypes.ts`,
  `server/replay/decode/replayTrajectoryTypes.ts`, `src/components/replay/telemetry/telemetryChartTypes.ts`,
  `src/components/replay/map/gpsTrackMapTypes.ts`.
- Circuit navigation: `track=<full display layout name>` on every page (`URLSearchParams`, no JSON identities,
  no venue/course split); layout matching only in `getCircuitSpecification`.

---

## 1. Data Sources and Ingest

| Source | Files on disk | Ingest entry | Stored in (SQLite `server/lmu_cache.db`) |
|---|---|---|---|
| XML results log | `UserData/LOG/Results/*.xml` | `server/core/dbSessionSync.ts` → `LmuParser.parseSessionXml` (`server/sessions/parser.ts`) | `sessions` + `session_recordings`, `session_drivers`, `session_laps`, `session_lap_passes`, `session_events`; dictionaries `drivers`, `vehicles`, `teams` |
| Binary replay | `UserData/Replays/*.Vcr` | `server/core/replay/dbReplaySync.ts` → `server/replay/worker/replayTrajectoryWorker*.ts` → `replayTrajectory.ts` → `replayFacts.ts` | `replay_metadata`, `replay_trajectories`, `replay_facts`, `replay_laps`, `replay_conditions`, `replay_driver_events`, `replay_running_order`, `replay_corner_passes`, `replay_sequence_passes`, `corner_sequence_maps` |
| App live capture | `server/live-captures/*.live.duckdb` | `server/live/capture/controller.ts` → recording worker; XML reconciliation | Raw streams in DuckDB; SQLite holds attachments and learning projections |
| Native 100 Hz telemetry | `UserData/Telemetry/*.duckdb` | `server/telemetry/telemetryCatalog.ts` → `duckdbReader.ts` | `telemetry_metadata`, `telemetry_lap_cache` |

### SQLite storage
- **DDL**: `server/core/dbSchema.ts`; projections `server/core/sessionSummaries/schema.ts`; replay matching
  `server/core/replay/replayMatchingSchema.ts`; cache versions and compression `server/core/dbCache.ts`.
- **Session rows** (`server/core/sessionRows/`): `specs.ts`/`fields.ts` column contracts, `schema.ts` DDL and
  indexes, `writer.ts` (`writeSessionRows`, `updateDerivedColumns`), `reader.ts` (`readSession`), `access.ts`
  (`loadSessions`, `readStoredLinkState`), `targeted.ts` (link/name/telemetry/condition updates),
  `replayContext.ts` (roster, link, official timing). Round-trip fixtures in `test/server/core/sessionRows/`.
  Drivers match on `drivers.normalized_name`, cars on `vehicles.car_model`; trim/lowercase the argument once in
  JS, never `LOWER(TRIM())` per row.
- **Summaries**: `sessionSummaries/store.ts`, `aggregateStore.ts`, `buildSessionSummaryProjection.ts`;
  `cards.ts` (`readSessionCards`); class finish/grid/gain in `shared/domain/classResult.ts`.
  `server/routes/summaryReadiness.ts` returns 503 while summaries rebuild.
- **Comparison queries**: `sessionSummaries/comparisonQueries.ts` (`queryTelemetryComparableLaps`,
  `markPagePersonalBests`); scopes in `shared/domain/compareLapScope.ts`; replay lap availability from
  `replay_driver_roster` (`server/core/replay/replayLapAvailability.ts`, primary-key lookups only).
- **Benchmarks**: `createBenchmarkLookup` / `calculateBenchmarkPace` (`shared/domain/paceCategory.ts`),
  `createPaceCalculator` (`server/benchmarks/referenceLaptimes.ts`).
- **Shared session helpers**: `shared/domain/timing/` (`timeFormat.ts`, `lapTimes.ts`),
  `shared/domain/sessions/` (`sessionOrder.ts`, `sessionLaps.ts`, `weekendSessions.ts`, `trackDisplayName.ts`),
  `shared/domain/vehicles/steering.ts`.

### Background work
- `server/core/serverContext.ts` (`ServerContext`) owns scans (`backgroundScan.ts`), the telemetry catalog and
  replay links; `setLiveSessionLoaded` holds scans during a live session.
- Workers: `server/core/ingest/fileIngestWorker*.ts` (XML + replay metadata), replay decode, corner passes,
  race poses. Every worker client filters with `isWorkerMessage` (`server/core/workerThreads.ts`).
- Main-thread loops yield every 5 ms (`server/core/yieldSlice.ts`). Decode queue and attempts:
  `dbReplayIngestStore.ts`. Telemetry ownership: `server/telemetry/telemetryLinks.ts`, `telemetryMatcher.ts`.
- Client: `src/api/useRequest.ts` (data/error/loading bound to one request), `src/api/useAppData.ts`
  (scan polling, `dataRevision`, quiet retry while the dev server restarts).

---

## 2. Life of a Session (XML → Screen)

```
Results XML ──> LmuParser ──> dbSessionSync ──> Normalized SQLite Rows
                                                       │
                                      GET /api/session/:id (ratings + pit stops)
                                                       ▼
                                         SessionDetail (React UI)
```

1. **Parse** (`server/sessions/`): `parser.ts` with `sessionXmlTypes.ts`, `sessionXmlStream.ts`;
   `sessionLapTiming.ts` (`applyLapTiming`: inferred laps, out-laps, pit loss); `shared/domain/raceTraffic.ts`;
   `sessionLapClassification.ts` (`lapConditions.ts`, `lapRepresentativeness.ts`); `resolveVehicle`
   (`shared/domain/vehicleMapping.ts`); `replayMatching.ts`.
2. **Store**: `dbSessionSync.ts` (`DB_PARSER_VERSION`) → `sessionRows/writer.ts` + `aggregateStore.ts`.
   Replay rain reclassifies laps in `server/core/dbSessionConditions.ts`.
3. **Serve**: `server/routes/sessionRoutes.ts` (`rateSessionDetail`, `querySessionContext`, pit stops via
   `sessionPitStops.ts` + `shared/domain/pitStops.ts`).
4. **Client** (`src/components/session-detail/`, `useSessionDetailData.ts`, `SessionDetail.tsx`):
   - `overview/`, `standings/`, `chart/`.
   - `table/`: `SessionLapTableRow.tsx`, `SessionLapDetailsRow.tsx`, `lapDetailSections.ts`, `pitStopText.ts`;
     class ranks via `shared/domain/lapPlaces.ts`.
   - `debrief/` (`SessionDebriefSection.tsx`): `DrivingHabitsCard.tsx` (`useDrivingHabits.ts`,
     `drivingHabits.ts`, `habitText.ts`; corner analysis, section 3), `SessionStrategyCard.tsx` +
     `StrategyPlanVsActual.tsx` (`GET /api/session/:id/strategy`, `server/sessions/sessionStrategy.ts`,
     `shared/domain/strategy/sessionStrategy.ts`; read from native DuckDB, never stored),
     `SessionRadioCard.tsx` (`GET /api/session/:id/radio`).

---

## 3. Life of a Replay Lap (VCR → Telemetry Studio)

```
Binary .Vcr ──> Worker Decode ──> Facts & Trajectory Blobs (SQLite) ──> Corner passes (worker)
                                                 │
                               GET /api/session/:id/telemetry, /race, /corner-passes
                                                 ▼
                                     ReplayInspectorPage (React UI)
```

### Decode and storage
- `server/replay/decode/`: `replayParser.ts` (header, index, slices), `replayTrajectory.ts` (opcodes,
  [VCR format](VCR_FORMAT.md)), `scene/replayPose.ts`, `replayTrajectoryFinalizer.ts`, `replayPitCodes.ts`,
  `replayLapBuilder.ts`, `replayLapPoints.ts`, `garageState.ts`, `replayLapClassification.ts`.
  `isCleanReplayLap` in `shared/domain/lapComparison.ts`.
- Worker: `worker/replayTrajectoryWorkerClient.ts`, `replayDriverSamples.ts` (TEMP staging); commit in
  `server/core/replay/dbReplayDriverStore.ts` (`resolveReplayPrimarySlot`).
- Rows: `dbReplayLapStore.ts` (facts), `dbReplayTrajectoryStore.ts` + `replayTrajectoryCodec.ts` +
  `lapColumnsCodec.ts` ([replay cache format](REPLAY_CACHE_FORMAT.md)), `trajectoryDownsampler.ts`,
  `dbReplayLapRows.ts`. Rows hold served values; rule changes rewrite rows offline.

### Corners (`server/corners/`, `shared/domain/cornerAnalysis/`, `shared/domain/cornerSequences/`)
Design rules are in the module comments (`turnLists.ts`, `cornerPasses.ts`, `sequenceMapService.ts`,
`sequenceMap.ts`, `habitFocus.ts`, `cornerTrends.ts`, `cornerInsight.ts`). Types: `shared/types/corners/`.

| Piece | Owners |
|---|---|
| Turn passes | `onReplayStored` → `refreshReplayCorners` (`sequenceMapService.ts`) → `cornerPassService.ts` → worker `cornerPassWorkerClient.ts` → `cornerPassBuild.ts`, `cornerPasses.ts`; turns placed by `shared/domain/circuitTurns/placeTurns.ts`; rows `server/core/replay/dbCornerPassStore.ts` (`replay_corner_passes` + builds) |
| Turn sequences | `sequenceMapService.ts`, `sequenceLaps.ts`, `shared/domain/cornerSequences/` (`speedTurningPoints.ts`, `sequenceMap.ts`, `sequenceLabel.ts`); rows `dbSequenceMapStore.ts`; work serialized by `queueCornerWork`; client invalidation `sequenceMapsChanged` (`src/api/cornerApi.ts`); Settings `src/components/settings/sequences/` |
| Analysis engine | `analyzeCorners.ts`, `habitRules.ts`, `turnUsual.ts`, `habitFocus.ts`, `paceGoal.ts`; server `cornerAnalysisService.ts` + `server/core/replay/dbCornerAnalysisStore.ts`; pins `server/core/dbHabitFocusStore.ts` (`habit_focus_pins`) |
| Corner trends (track page) | `cornerTrends.ts`, `server/core/replay/dbCornerTrendStore.ts`; UI `src/components/track-detail/corner-trends/` (`CornerTrendsSection.tsx`, `cornerTrendRows.ts`, `CornerHabitLine.tsx`, `cornerHabitText.ts`) |
| Lap view corners | `GET /api/corners` (`layoutCorners`) → `loadLayoutCorners` → `src/components/replay/inspector/useLapSegments.ts` → `computeLapSegmentComparisons`; conclusion `src/components/replay/analysis/conclusion/` (`cornerLapDifference.ts`, `cornerConclusion.ts`) |
| Corner card | `src/components/replay/cornerCard/` (`cornerInsight.ts`, `useCornerInsightIndex.ts`, `cornerCardShown.ts`) |
| Consistency panel | `useCornerConsistency.ts`, `src/utils/cornerConsistency.ts`, `analysis/consistencySegments.ts` |
| Shared UI | `src/components/common/HabitTags.tsx`, `CostSparkline.tsx` |
| Offline tools | `tools/analysis/buildCornerPasses.ts` (rebuilds, app stopped), `buildSequenceMaps.ts`, `cornerAnalysis.ts`, `habitOutcomeCheck.ts` |

Routes (`server/routes/cornerRoutes.ts`, summary readiness gated): `/api/session/:id/corner-analysis`,
`/api/session/:id/corner-passes[?segments=sequences&driverOrdinal=]` (`sessionCornerPasses.ts`),
`/api/corners`, `/api/corner-trends`, `/api/corner-sequences/maps[/regenerate]`, `/api/habit-focus/pin|unpin`.

### Serving
- `server/telemetry/telemetryFusion.ts` (DuckDB + replay channels); `server/tracks/` (`lapLineCut.ts`,
  `trackProjection.ts`, `stationGlitches.ts`).
- `GET /api/session/:id/telemetry` (`replayRoutes.ts`, `ReplayTrajectoryService` / `ReplayTelemetryService`).
- Race replay (`server/traffic/`): `raceReplayService.ts` (`/race`, `/race/poses?window=N`), `racePoses.ts` +
  `racePosesWorkerClient.ts`, `raceDistances.ts` (`/race/distances`); `shared/domain/raceReplay/`
  (`raceEvents.ts`, `poseWindow.ts`). Built on demand, in-memory LRU only.

### Replay Inspector UI (`src/components/replay/`, route `/telemetry`)
- Page and data: `ReplayInspectorPage.tsx`, `telemetryVisit.ts`, `useReplayInspectorData.ts`,
  `replayPlaybackCursor.ts`, `useReplayPersonalBest.ts`, `useReferenceLapSuggestion.ts`.
- Header and layout: `ReplayHeaderShell.tsx`, `ReplayInspectorTitle.tsx`, `inspector/PanelResizeHandle.tsx`,
  `ReplayInspectorSidebar.tsx`.
- Keys: `src/utils/replayShortcuts.ts` (`useReplayKeys`, scopes, pointer vs keyboard focus).
- `map/`: `replayMapUtils.ts` (heatmaps, cull box), `scene/` (segments, surfaces, `markerPlacement.ts`,
  `cornerRibbonClearance.ts`, `startFinishPlacement.ts`, `GpsCornerLayer.tsx`), `display/`
  (`mapLayers.ts`, `useTrackMarkerPlacement.ts`, `liveSectorSplit.ts`), `GpsSceneCarMarkers.tsx`,
  `ghostSync.ts` + `inspector/ghostSyncContext.ts`, `useGpsMapShortcuts.ts`, `telemetry/` fullscreen dock
  (`GpsMapTelemetryDock.tsx`, `GpsMapPlaybackStrip.tsx`, `GpsMapLapTimingPanel.tsx`, `GpsMapCompactTrace.tsx`).
- `telemetry/`: strip charts, `telemetryViewport.ts`, `TelemetryScrubCursor.tsx`, `TelemetryDeltaMarker.tsx`
  (marker A), `presets/`, `telemetryChartPathBuilders.ts`.
- `analysis/`: phase cards, consistency, conclusion; handling balance `src/utils/handlingBalance/evidence.ts`.
- `race/` (URL `mode=race`, `t`, `car`): `RaceReplayView.tsx`, `RaceReplayHeader.tsx`, `raceModeContext.ts`,
  `raceClock.ts`, `racePoseCache.ts`, `RaceMapScene.tsx`, `RaceCarMarkers.tsx`, `RaceStandingsTower.tsx` +
  `raceStandings.ts`, `RaceLapTiming.tsx` + `raceLaps.ts`, `RacePlaybackBar.tsx`, `RaceIncidentSelect.tsx`,
  `useRaceReplayControls.ts`, `Race3DView.tsx`, `RaceMinimap.tsx`.

---

## 4. 3D Replay (`src/components/replay/view3d/`)

Package contract (what each value means): [PLUGINS.md](PLUGINS.md#3d-scenery-and-vehicle-bodies-package-schema-12).
Open work: [3D plan](plans/proposed/REPLAY_3D.md), [night release](plans/proposed/NIGHT_RELEASE.md).

| Folder / file | Owns |
|---|---|
| `scene/sceneShell.ts`, `sceneShells.ts` | Renderer, stream, ground, sky, exposure, reflection, cameras, draw loop; one shell per layout kept across lap ↔ race (`SceneContent` plugs in); `shownMatrices.ts`, `dayLight.ts`, `timeOfDay.ts`, `pointerSurface.ts`, `useSceneHost.ts`, `Scene3DFrame.tsx`, `loadProgress.ts`, `Replay3DLoading.tsx`; native→render handedness in `scene/replayPose.ts` |
| `scenery/` | `residency.ts`, `sceneryStream.ts`, `chunkLoader.ts` (+ `cachedKtx2Loader.ts`), `streamView.ts`, `sceneryGround.ts` (BVH contact and camera rays; `roadHeightAt` first), `sceneryBatches.ts`, `lampSize.ts`, `realRoad.ts`, `sceneWarmup.ts`, `geometryWarmup.ts`, `textureFocus.ts`, `materials/` |
| `batching/batchedParts.ts` | The one `BatchedMesh` toolkit for scenery and cars |
| `cars/` | `carParts.ts`, `carBatching.ts`, `carMotion.ts`, `drawnCar.ts`, `keptCar.ts`, `carTemplates.ts`, `carModels.ts`, `farCars.ts`, `farGlows.ts`, `wheelGeometry.ts`, `wheelAnimation.ts`, `wheelMotion.ts`, `carObject.ts`, `ghostFade.ts` |
| `car/` | Materials and per-car effects: `carMaterials.ts`, `carPaint.ts`, `paintLayers.ts`, `carContactShadow.ts`, `underCarBake.ts`, `carReflection.ts`, `overheadMap.ts`, `cockpitOcclusion.ts`, `carLamps.ts`, `lampStates.ts`, `numberPlateGlow.ts`, `readoutDraw.ts`, `readoutCanvas.ts` |
| `laps/` | Lap view: `replayScene.ts`, `useReplayScene.ts`, `lapLayer.ts`, `racingLine.ts`, `drivingMarks.ts`, `useCornerFocus.ts`, `CornerFocusBar.tsx`, `Replay3DView.tsx` |
| `race/` | Race view: `raceScene.ts`, `raceField.ts` (near/far tiers), `standInCars.ts`, `blobShadows.ts`, `racePosePoints.ts`, `raceBeams.ts`, `carPick.ts`, `RaceCarHover.tsx`, `useRaceScene.ts` |
| `camera/` | `cameraRig.ts`, `cameraModes.tsx` (modes, keys, `shadowCascadeSet`, `exposureType`), `cameraTracking.ts`, `cameraNavigation.ts`, `driverCameras.ts`, `tracksideCameras.ts`, `cornerFraming.ts` |
| `sceneEnvironment.ts`, `atmosphere/` | Sun and weather (`setSun`), `skyDome.ts`, `hosekSky.ts`, `timeOfDay.ts`, `haze.ts`, `clouds.ts`, `sunMeter.ts`, `cloudLayer.ts`, venue probe |
| `night/` | `skyBodies.ts`, `nightLight.ts`, `nightMoment.ts`, `nightDome.ts`, `trackLights.ts` (each chunk vertex's track light sum at load), `trackLightProgram.ts`, `carSpots.ts`, `cockpitLight.ts`, `nightSwitch.ts` |
| `shadows/` | `shadowCascades.ts`, `cascadeShadows.ts`, `cascadeSampling.ts` (`patchCascadeShadow`), `shadowCasterPass.ts` |
| `autoExposure.ts`, `bloom.ts` | GPU metering, white balance, tone curve, bloom, output encode |

Loaders: `src/api/sceneryApi.ts` (layouts, chunks, cloud maps, road height grid via
`shared/domain/scenery/cloudMaps.ts`, `roadHeight.ts`), `src/api/vehicles/bodyApi.ts`, `bodyStore.ts`.
2D/3D switch: `ReplayMapContainer`; Line menu in `GpsMapModeBar.tsx`.

---

## 5. Features

| Feature | Server | Shared domain | Client |
|---|---|---|---|
| Dashboard | `/api/dashboard` (`sessionSummaries/dashboardQueries.ts`) | `trackSummaryUtils.ts`, `paceCategory.ts` | `components/dashboard/` |
| Session list | `/api/dashboard` (`pageQueries.ts`, `cards.ts`) | | `components/session-list/` |
| Tracks | `/api/tracks`, `/api/track/:trackName` (`trackQueries.ts`) | `circuitSpecs.ts`, `circuitDefinitions.ts` | `components/track-summaries/`, `track-detail/` |
| Leaderboard & rivals | `leaderboardRoutes.ts`, `dbRivalStore.ts` | `leaderboard.ts`, `rivals.ts`, `sessions/sessionRivals.ts` | `src/api/leaderboardApi.ts`, `components/leaderboard/` |
| Lap comparison | `/api/compare/laps` (`comparisonQueries.ts`, `comparisonLapRows.ts`) | `lapComparison.ts`, `compareLapScope.ts` | `components/leaderboard/`, `useCompareLapsData.ts`, `src/utils/telemetryCompareLink.ts` |
| Rival debrief | | `rankDebriefCorners` (`src/utils/sessionDebrief.ts`) | `components/leaderboard/debrief/loadLapDebrief.ts` |
| Benchmarks | `referenceRoutes.ts`, `server/benchmarks/`, `dbReferenceLaptimeStore.ts` | `paceCategory.ts` | `src/api/referenceApi.ts`, `common/BenchmarkLadder.tsx` |
| Settings & scans | `systemRoutes.ts` (`/settings/folders`, `/scan`, `/sessions/clear`), `/replays/cache` | `folderPath.ts` | `components/settings/` |
| Track geometry & logos | `dataPluginRoutes.ts` (`/api/data-plugin/...`), `server/tracks/trackGeometryStore.ts` | `trackGeometry.ts` (`hasCompatibleTrackStations`), `resolveCarManufacturer` | `src/api/vehicles/vehicleLogosApi.ts`, `CarLogo.tsx`, `CarIdentity.tsx` |

### Cross-cutting
- Routing and code splitting: `src/App.tsx`, `src/routePages.ts` (custom preload, idle prefetch in production).
- Dropdowns: `src/components/common/dropdown/Select.tsx` is the only single-choice control.
- Session cards draw bundled `/track-outlines/<layoutKey>.svg`, never metric geometry.
- Baseline identity = session id + driver ordinal + lap ordinal.

### Data packages (`server/plugins/`)
`dataPlugin.ts` (manifest, catalogs, lazy track files from `LMU_PLUGIN_ROOT`), `scenePackage.ts`,
`bodyPackage.ts`. `shared/packageContract/` is generated by the pipeline (`sync-contract`): never edit, not
linted. Contract: [PLUGINS.md](PLUGINS.md#contract).

### Live Race Dashboard
- Client: `src/api/liveStream.ts` (SSE), `LiveTimingStore` (5 Hz), views `LiveRaceView`, `LivePracticeView`,
  `LiveRacePlan.tsx` (`raceColumns.ts`, `raceAction.ts`), `LiveRaceStrategy.tsx`, `LiveGarageChecklist.tsx`,
  `LiveDamageRow.tsx`, `LiveSessionReview.tsx`, `liveScreens.ts`, `LivePedalTrace`.
- Demo: `demo/LiveDemoPage.tsx` (`#/live?demo=1`, `demoScenarios.ts`, `demoGarage.ts`, `demoDeployment.ts`)
  runs the real page on sample data. Anonymization: `src/api/anonymizeData.ts` (URL flags only).
- Server (`server/live/`): `rf2Layout.ts`, `rf2Decode.ts`, `sharedMemory.ts`, `liveReader.ts`, `gameProcess.ts`,
  `livePitPoller.ts` + `lmuHttp.ts` ([REST reference](LMU_REST_API.md)), `lmuNavigation.ts`,
  `liveIdentityResolver.ts`; recorder tool `tools/telemetryRecorder.ts`.
- Strategy engines (`shared/domain/live/`, `shared/domain/strategy/`): `liveLapTiming.ts`, `liveLapsLeft.ts`,
  `liveResourcePlan.ts`, `livePitTime.ts`, `raceStrategy.ts`, `strategyHistory.ts` (+ `readStrategyHistory`),
  `liveCarCondition.ts`, `liveWeather.ts`, `liveInsights.ts`, `liveTyreCrossover.ts`, `livePitLane.ts`
  (+ `dbPitLaneStore.ts`), `liveAudit.ts`; race plan saved by `server/core/live/dbRacePlanStore.ts`.
- Deployment advice: `shared/domain/live/energy/` (`deploymentGuidance.ts`, `deploymentTracker.ts`),
  `src/components/live/race/deploymentReadout.ts`.
- Tyre wear: `server/sessions/sessionTyreWear.ts`, `shared/domain/strategy/tyreWear.ts`; wheel slip
  `shared/domain/live/wheelSlip.ts`, `replayWheelSlip.ts`.

### Radio calls ([plan](plans/proposed/LIVE_VOICE_CALLS.md))
| Step | Owners |
|---|---|
| Propose | `shared/domain/live/radio/liveCalls.ts`, `racePlanMode.ts`; field calls `shared/domain/live/radio/field/` (`fieldCalls.ts`, `fieldTrack.ts`, `spokenCar.ts`), `server/live/radio/layoutTurns.ts`, `layoutPitLane.ts`, `decodeField` (`shared/types/liveField.ts`) |
| Schedule and log | `server/live/radio/radioScheduler.ts`, `server/core/live/dbRadioLogStore.ts` (`live_radio_calls`); SSE `call`, `POST /api/live/calls/:id/outcome`, `/calls/ready` |
| Speak | `src/components/live/display/radioPlayer.ts`, `LiveRadio.tsx`; `src/components/live/voice/` (`clipVoice.ts`, `callPieces.ts`, `browserVoice.ts`, `kokoroWorker.ts`, `kokoroVoice.ts`, `audioOutput.ts`); `settings/RadioOutputSetting.tsx` |
| Clips | `shared/domain/live/radio/radioSentences.ts`, `tools/dev/prepareVoiceClips.ts` → uncommitted `public/voice/george/` |
| Demo | `demo/LiveStrategySpeech.tsx`, `useStrategyRadio.ts`, `DemoRadioSampler.tsx`, `demoRadio.ts` |

### Live capture and learning ([format](LIVE_CAPTURE_FORMAT.md), [open checks](plans/README.md#live-dashboard-and-learning))
| Owner | Responsibility |
|---|---|
| `server/live/capture/controller.ts`, `recordingWorker.ts`, `recordingStore.ts` | Player capture, worker-owned DuckDB writes, recovery |
| `capture/decode.ts`, `channels.ts`, `terrain.ts`, `readRecording.ts` | Channel catalog, terrain dictionary, version normalisation on read |
| `capture/diagnostics.ts`, `liveReaderWorker.ts` | Session diagnostics |
| `server/core/live/dbLiveCaptureStore.ts`, `capture/reconcile.ts` | Attachment index and XML ownership |
| `capture/evidenceService.ts`, `evidenceReader.ts`; `shared/domain/live/liveTelemetryFusion.ts`, `src/api/liveEvidenceApi.ts` | Read-only lap evidence and its use |
| `shared/domain/learning/` (`capture.ts`, `examples.ts`, `evaluate.ts`, `calibration.ts`, `automatic.ts`) | Frozen forecasts, examples, acceptance gates |
| `server/live/learning/` (`service.ts`, `runtime.ts`, `automaticWorker.ts`, `readiness.ts`) | Projection refresh, model lifecycle, readiness (`settings/learning/LearningReadinessPanel.tsx`) |
| `server/core/live/dbLiveLearningStore.ts`, `dbLearningModelStore.ts` | Learning facts and models |
| `tools/analysis/evaluateLiveLearning.ts`, `listLearningErrors.ts`, `evaluateTyreWear.ts`, `listWheelSlipEvents.ts`, `.claude/skills/race-review/` | Post-race review ([log](evidence/RACE_REVIEW_LOG.md)) |

Vite and the dev watcher ignore `server/live-captures/` (active recordings are locked on Windows).
Allocation check: `tools/benchmarks/livePerformance/allocations.mjs`.

### Peripherals ([setup](PLUGINS.md#peripheral-plugins-separate-from-data-packages), [acceptance](plans/README.md#peripheral-acceptance))
`server/peripherals/` (`peripheralHost.ts`, `pluginRegistry.ts` + `REGISTERED_PERIPHERALS`,
`sessionLoadDetector.ts`, `presetSwitchRunner.ts`), `server/core/peripherals/peripheralStore.ts`,
`server/routes/peripherals/peripheralRoutes.ts`, `shared/types/peripherals/`, `shared/domain/peripherals/`,
`src/api/peripheralsApi.ts`, `src/components/settings/peripherals/`; `PeripheralStatusChip.tsx` only in
`LiveConnectedPage` (`LivePage.tsx`). The package lives in `../SimagicWheelDeamon`.

### Windows desktop (`server/desktop/`)
`systemTray.ts` runs `bin/systemTray-win32-x64.exe` (`systemTray.c`, `monitorBrowser.c`, `npm run build:tray`;
`LMU_TRAY=0` disables). Browser monitor setting: `browserSettings.ts`, `/api/desktop/browser`,
`BrowserMonitorSetting.tsx`; auto-open consumed once by `useAppEvents`. Tray Exit → graceful shutdown;
`tools/dev/runServer.mjs` owns the dev watcher and exit signal.

---

## 6. Cache Versions: What to Bump

| Constant | File | Bump when | Effect |
|---|---|---|---|
| `DB_PARSER_VERSION` | `server/core/dbSessionSync.ts` | XML parser or lap classification rules change | Every session reparsed from XML |
| `SESSION_SUMMARY_PROJECTION_VERSION` | `shared/types/sessionSummaries.ts` | Summary facts or derived column rules change | Rebuild from stored rows |
| `REPLAY_MATCHING_PROJECTION_VERSION` | `server/core/replay/dbReplayMatchingStore.ts` | Replay matching criteria change | Rebuild from retained metadata |
| `REPLAY_CACHE_VERSION` | `server/core/dbCache.ts` | Replay decoding or blob format changes | Offline migration: re-decode on-disk replays, rewrite rows of deleted ones |
| `DUCKDB_TELEMETRY_CACHE_VERSION` | `server/core/dbCache.ts` | DuckDB lap cache schema changes | Lap cache rebuilt |
| `CORNER_PASS_VERSION` | `server/corners/cornerPasses.ts` | Pass rules or rows change | Offline `tools/analysis/buildCornerPasses.ts`, app stopped |
| `SEQUENCE_MAP_VERSION` | `shared/domain/cornerSequences/sequenceMap.ts` | Sequence map rules change | Maps then sequence passes rebuilt offline (same tool) |
| `TELEMETRY_LINK_RULE` | `server/telemetry/telemetryLinks.ts` | DuckDB linking changes | Links re-evaluated |
| `LIVE_MODEL_VERSION` | `shared/domain/live/liveAudit.ts` | Live plan behaviour changes | New audit cohort |
| `LIVE_BASELINE_MODEL_VERSION` | `shared/domain/live/liveAudit.ts` | Uncorrected fuel/VE formula changes | Learning cohorts restart |
| `CALIBRATION_POLICY.version` | `shared/domain/learning/calibration.ts` | Learning gates change | Models re-evaluated |
| `LIVE_CAPTURE_NORMALIZATION_VERSION` | `shared/types/liveCapture.ts` | Recorded channels or units change | New recordings only; old stay readable |

---

## 7. Recipes

- **XML lap/driver fact**: `sessionXmlTypes.ts` → `parser.ts` → `LapData`/`DriverData` (`shared/types/session.ts`)
  → bump `DB_PARSER_VERSION` → test in `test/server/sessions/`.
- **Fact from a linked replay**: read via `dbReplayLapStore.ts` → pure logic in `shared/domain/` → attach in
  `sessionRoutes.ts`.
- **Expanded lap row line**: `table/lapDetailSections.ts` (+ `lapPlaces.ts`) → test
  `test/components/session-detail/lapDetailSections.test.ts`.
- **Session/driver/lap column**: `sessionRows/specs.ts` → `writer.ts`/`reader.ts` + round-trip tests; if derived,
  `shared/domain/sessionSummaries/` + bump `SESSION_SUMMARY_PROJECTION_VERSION` (+ `cards.ts`).
- **API endpoint**: `server/routes/<domain>Routes.ts` (mount in `server/index.ts`) → supertest in
  `test/server/routes/` → fetcher in `src/api/`.
- **SQLite table**: DDL in `dbSchema.ts` → `server/core/db<Name>Store.ts` taking `Database`.
- **Circuit layout**: `shared/domain/circuitDefinitions.ts` + basic SVG in `public/track-outlines/`.
- **Vehicle**: `VEHICLE_MODELS` row in `shared/domain/vehicleMapping.ts`, then
  `node tools/release/updateVehicleKeys.mjs <getAllVehicles.json> <.veh folder>`; dimensions in
  `vehicleDimensions.ts`.
- **Session list filter**: `DashboardFilterBar.tsx` + `TrackSessionsToolbar.tsx`; reset in `resetFilters`
  (`Dashboard.tsx`) and `resetSessionFilters` (`useTrackDetailState.ts`).
- **Navigation link**: `Link` with a concrete `to`; custom clicks via `src/utils/linkClick.ts`.
- **Dynamics channel**: ISO 8855 (positive left), converted once at ingest (`replayTrajectory.ts`,
  `duckdbReader.ts`); handling calibration `shared/domain/vehicles/handling.ts` → `computeUnderOversteer`.
- **Colours**: `lmu-*` roles (`tailwind.config.js`); chart colours `src/utils/themeColors.ts`.

Tests: commands in `AGENTS.md`; fixtures `test/fixtures/{results,replays,telemetry}`, synthetic VCR
`test/utils/mockVcr.ts`. Other docs: [docs index](README.md).

---

## 8. Smells That Need Attention

### UI
- **Standings sorting vs class position**: standings emphasize class position while sorting and gains use
  overall results (`SessionRaceStandings.tsx`, `SessionRaceStandingsRow.tsx`).
- **Keyboard navigation**: focus containment and Escape restoration for session detail dialogs and the
  fullscreen replay map (`SessionRulesModal.tsx`, `useMapFullscreenFocus.ts`, `ReplayShortcutHelp.tsx`).
- **Focus speed cue**: `habitSpeedLine` (`debrief/habitText.ts`) reads "Apex 91 → 89 km/h" even where the
  driver is already quicker, under a "Brake later" headline.
- **Goal sentence not shown**: `DebriefGoal.line` (`debrief/drivingHabits.ts`) is built and tested, but the
  card draws the goal from `level`, `next` and `title`.
- **Corner comparison apex sampling**: `computeLapSegmentComparisons` reads the baseline's minimum speed at the
  primary lap's slowest point (`segmentComparisons.ts`); `baselineMinDistM` already finds the baseline's own.
- **Race pick sizes**: `race/raceScene.ts` pick projects with the canvas client size while
  `RaceCarHover.tsx` measures the pointer against the host rect.

### File size watchlist (counted 2026-11-15)
- Near 1,000 lines: `tools/telemetryRecorder.ts` (968), `server/telemetry/duckdbReader.ts` (871),
  `shared/domain/circuitDefinitions.ts` (774), `server/live/capture/recordingStore.ts` (759); tests
  `serverContext.test.ts` (907), `db.test.ts` (819), `liveService.test.ts` (800).
- Directories over 20 files (not linted): `test/utils/` (21). At 20: `src/components/settings/`,
  `view3d/scenery/materials/`, `shared/types/`, `shared/domain/live/`.
- Components near 300 lines: `ReplayInspectorModalBody.tsx` (299), `ReplayInspectorContent.tsx` (289),
  `ReplayInspectorSidebar.tsx` (283), `TelemetryPresetModal.tsx` (273), `GpsSceneMarkers.tsx` (272),
  `DrivingHabitsCard.tsx` (272).

### Settled, not smells (do not re-flag)
- **Corner sequences (2026-11-19)**: no guard for an empty fresh map in a recheck; a pass-worker run with no
  map to read; offline `buildCornerPasses.ts` needing a second run on a new database; race replay `act(...)`
  warnings (never reproduced).
- **Night (2026-11-26)**: `scenery/lampSize.ts` reading unscaled Float32 positions; bloom level count and the
  dome below turbidity 1.2 (outside package ranges); the day/night button inert without a session clock; the
  dusk light step waiting for a 0.25° sun step (planned in `NIGHT_RELEASE.md`); working-tree CRLF on LF files.

---

## 9. Keeping This File Current

Update this file in the same commit when you add, move or rename a module or directory, or change an API
endpoint, SQLite table, client route or cache version. Fixed smells leave section 8; review findings are fixed,
not parked here. Behaviour and design rules go in the module's header comment, not here.

Refactoring boundaries: keep coupled replay selection/swap/retry transitions together unless explicit
transition tests cover an extraction. Corner analysis and corner consistency read the same passes but keep
their own lap and traffic eligibility. Scalar telemetry channels share rendering, not a broad config schema.
