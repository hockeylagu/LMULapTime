# Code Map: where things live and how they flow

A fast index for new sessions: find the right file without searching. `AGENTS.md` holds the rules;
this file holds the **routes through the code**. Keep it current (see "Keeping this file current" at the end).

Last checked against branch `colorize-tokens` (2026-09-29): 376 source files, 213 test files, 1773 tests.

---

## 1. The three data sources and where each enters

| Source | Files on disk | Ingest entry | Stored in (SQLite, `server/lmu_cache.db`) |
|---|---|---|---|
| XML results log | `UserData/LOG/Results/*.xml` | `server/core/dbSessionSync.ts` → `LmuParser.parseSessionXml` (`server/sessions/parser.ts`) | `sessions` (one compressed `DetailedSession` per file) |
| Binary replay | `UserData/Replays/*.Vcr` | `server/core/replay/dbReplaySync.ts` → worker (`server/replay/worker/replayTrajectoryWorker*.ts`) → `replayTrajectory.ts` → `replayFacts.ts` | `replay_metadata`, `replay_trajectories`, `replay_facts`, `replay_laps`, `replay_conditions`, `replay_driver_events`, `replay_running_order`, `replay_race_positions` |
| DuckDB 100 Hz telemetry | `UserData/Telemetry/*.duckdb` | `server/telemetry/telemetryCatalog.ts` → `duckdbReader.ts` | `telemetry_metadata`, `telemetry_lap_cache` |

Other tables: `reference_laptimes` (benchmarks), `ai_reports`, `rival_targets` (user state, never cleared),
`cache_metadata`, `ingest_errors`, `replay_ingest_drivers`, `rejected_replay_links`, `replay_trajectory_defaults`.
All DDL is in `server/core/dbSchema.ts`.

**Replays are the source of truth once cached**: LMU deletes old `.Vcr` files, and their rows are the only copy. Never write
code that drops replay rows because the file is gone.

### Background orchestration
`server/index.ts` builds one `ServerContext` (`server/core/serverContext.ts`), which owns:
- the scan jobs (`runInitialSessionSyncInBackground`, `runReplaySyncInBackground`, `runSessionSyncInBackground`), pumped one step per
  event-loop turn by `server/core/backgroundScan.ts`;
- `loadSessions()`: cached sessions + telemetry links (`enrichSessionsWithTelemetry`), memoised on its inputs;
- replay links through `SessionReplayLinks` (`server/sessions/sessionReplayLinks.ts`, rules in `replayMatching.ts`);
- the low-priority replay re-decode (`ReplayUpgradeRunner`).

---

## 2. Life of a session (XML → screen)

1. **Parse** (`server/sessions/parser.ts`, `parseSessionXml`), in order:
   - raw XML shapes: `sessionXmlTypes.ts`; streaming events (incidents, track limits, penalties, damage): `sessionXmlStream.ts` / `parseStreamEvents`;
   - `parseDriver` → per lap `parseLap`; then `applyLapTiming` (`sessionLapTiming.ts`), in one ordered pass: missing lap times inferred
     (`isInferred`), out-laps marked (`isOutLap`, rule `isCompletedPitStop` in `shared/domain/lapComparison.ts`), pit loss on the in-lap
     (`pitStopDuration`, spans in-lap + out-lap);
   - `annotateLapTraffic` (`shared/domain/raceTraffic.ts`): who was around the car on each lap;
   - `classifySessionLaps` (`server/sessions/sessionLapClassification.ts`): conditions (`shared/domain/lapConditions.ts`), non-representative
     laps (`shared/domain/lapRepresentativeness.ts`), clean-lap average, best-lap benchmark rating (a wet best lap is
     `bestLapWet` and unrated: the targets are dry laps);
   - car class: `shared/domain/vehicleMapping.ts` (`resolveDriverCarClass`, `mapVehicleIdToClass`); layout: `getCircuitSpecification`;
   - replay match: `findMatchingReplay` (`server/sessions/replayMatching.ts`).
2. **Store**: `dbSessionSync.ts` (holds `DB_PARSER_VERSION`; bumping it re-parses every stored session) → `dbSessionStore.ts`.
3. **Re-classify with rain**: `server/core/dbSessionConditions.ts` runs `classifySessionLaps` again with the replay's rain when a
   session gets its replay or the replay's conditions are stored, and sets the link's peak rain and weather from every stored
   condition (the header scan samples 30 windows and can miss the peak).
4. **Serve**: `GET /api/session/:id` (`server/routes/sessionRoutes.ts`) adds, per request and not stored:
   - telemetry links (`context.enrichSessionsWithTelemetry`);
   - pit stop details from replay events (`attachPitServices`, `server/sessions/sessionPitStops.ts`, maths in `shared/domain/pitStops.ts`).
5. **Load in the client**: `src/components/session-detail/useSessionDetailData.ts` (`fetchJson('/api/session/…')`).
6. **Show**: `src/components/session-detail/SessionDetail.tsx`, then:
   - `overview/` (header, session summary: `DriverPerformancePanel` = `BestLapBlock` + `SummaryStat` rows + sectors; the header card holds the `BenchmarkLadder`, conditions), `standings/` (race result row, classification, fuel, rules); the stewards' tally sits under the lap table's heading (`table/SessionLapStewardsLine`), the events themselves on each lap's expanded row;
   - `table/`: the lap table memoizes class ranks and expanded-event sections per session/driver; `shared/domain/lapPlaces.ts` indexes rival lap positions once, and sorting/expansion reuse the prepared entries. The expanded row text comes from `lapDetailSections.ts` (sections), `lapPlaces.ts`
     (class places, the stop a lap belongs to), `SessionLapDetailsRow.tsx` (grouped event debrief, semantic colors and recorded lap/session clocks), `pitStopText.ts` (pit lines per lap), `src/utils/lapTrafficText.ts` (traffic and
     "left out of average" wording);
   - `debrief/`: the auto debrief (`loadSessionDebrief.ts` → `/api/compare/laps` + replay trajectories/traffic; ranking in `src/utils/sessionDebrief.ts`);
   - `chart/`: the session telemetry chart.
   - `standings/DriverSafetySummary.tsx`: independent contact, track-limit severity and penalty badges in classification, with the full event tooltip preserved.

## 3. Life of a replay lap (VCR → telemetry studio)

- Decode (all in `server/replay/decode/`): `replayParser.ts` (header, driver index, slices; format in `docs/VCR_FORMAT.md`) → `replayTrajectory.ts`
  (`extractReplayTrajectory`) → laps sliced by `replayLapBuilder.ts` / `replayLapPoints.ts` → garage/pit state `garageState.ts`.
- Always on a worker: `worker/replayTrajectoryWorkerClient.ts` (bootstrap `.mjs`), used by `ReplayCacheService` (`replayCacheService.ts`).
- Normalised facts (pure): `replayFacts.ts` → written by `server/core/replay/dbReplayLapStore.ts`
  (`replaceReplayDriverLapFacts`, `replaceReplayWideFacts`; read with `getReplayLaps`, `getReplayConditions`, `getLapConditions`).
- Trajectory blobs: `dbReplayTrajectoryStore.ts` + codec `replayTrajectoryCodec.ts`; downsampling `trajectoryDownsampler.ts`.
- Serving: `GET /api/replays/:name/trajectory` (`replayRoutes.ts`) → `ReplayTrajectoryService` → `ReplayTelemetryService`
  (fuses DuckDB channels, `server/telemetry/telemetryFusion.ts`) → `server/tracks/` (line cut `lapLineCut.ts`, projection
  `trackProjection.ts`, glitches `stationGlitches.ts`, geometry `serverTrackSync.ts`).
- Traffic: `GET /api/replays/:name/traffic` → `server/traffic/raceTrafficService.ts` → race positions index
  (`racePositions.ts`, built on a worker by `racePositionsWorkerClient.ts`, stored by `dbRacePositionStore.ts`) → `trafficSpells.ts`.
- Client: `src/api/replayApi.ts` → `src/components/replay/ReplayInspectorPage.tsx` (route `/telemetry`):
  `inspector/` (data hook `useReplayInspectorData.ts`, `replayPlaybackCursor.ts` publishes frame-by-frame visual interpolation to the charts and map without rerendering the whole inspector between recorded samples; telemetry readouts remain on real samples, `useReplayPersonalBest.ts` (canonical same-layout/class leaderboard identity for the gold lap time), sidebar, timeline, `compare/` (Compare button, comparison lap picker and its rows); HUD assist labels reserve height so TC/ABS toggles do not resize the map), `map/` (GPS map; the SVG scene pieces are in `map/scene/`, racing lines share one non-scaling 28px hit stroke (44px on touch) per continuous section for nearest-sample selection; selected-corner ranges stay stable during playback to avoid rebuilding static paths, boundaries via
  `useTrackBoundaryGeometry.ts` from `public/tracks/`), `telemetry/` (strip charts; `TelemetryScrubCursor.tsx` snaps the shared scrub line to physical pixels for stable thickness; channels by subsystem; `presets/`),
  `ReplayShortcutHelp.tsx` lists chart/map shortcuts. `src/utils/replayShortcuts.ts` excludes native controls, typing,
  browser modifiers and modal dialogs. Chart interaction supports Shift-wheel pointer-anchored zoom, Shift-drag range
  selection, Alt-drag pan, sample arrows / 0.5 s Shift-arrows, Home/End, +/− and 0 reset; distance windows and wheel
  normalization live in `telemetry/telemetryViewport.ts`, with viewport updates coalesced per animation frame.
  Space toggles playback from a chart/map; manual cursor selection pauses it. Map C centers once at the existing zoom,
  F toggles following while preserving the current camera when stopped, and the center button labels itself when the car
  is off-screen. Zoomed scrubbing resumes following unless the driver explicitly pans or disables it.
  `analysis/` (corner phase cards, consistency, AI tab). Algorithms in `src/utils/` (`cornerAnalysis/` (types, helpers, segmentComparisons), `lapAlignment.ts`,
  `replayComparison.ts`, `computedTelemetry.ts`, `handlingBalanceDetection.ts`, `telemetryPostProcessing.ts`).
  Steering handling warnings use `src/utils/handlingBalance/evidence.ts`: a sustained response deficit or rear slide is required,
  not just the fixed-ratio Ackermann residual. With aligned comparison samples, events also need at least 0.10 s of local
  delta growth and a sustained speed deficit. Badge tooltips show evidence and a driving experiment; badges display time
  loss only when available. The local delta is observed during the event, not attributed entirely to it.
  The inspector header uses the chart baseline color for its comparison driver. Driver/lap requests, baseline requests and
  comparison candidates have separate loading/error recovery; canceled or superseded requests cannot replace the selection,
  and an old baseline is cleared before loading its replacement.
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
| Dashboard | `/api/sessions`, `/api/progression` | `trackSummaryUtils.ts`, `paceCategory.ts` | `components/dashboard/` (`useDashboardMetrics.ts`, `useDashboardTrends.ts`) |
| Session list (dashboard + track detail) | `/api/sessions` (list entries: no drivers, and the player's laps without traffic or steward records, `toSessionListEntry` in `sessionRoutes.ts`) | | `components/session-list/` (`SessionList.tsx`; 25 per page via `useSessionPage.ts` + `SessionPagination.tsx`, `?page=` reset by `updateSearchParams` on any other filter change; `SessionFilterParts.tsx` two-row toolbar with Clear filters, used by `dashboard/DashboardFilterBar.tsx` and `track-detail/TrackSessionsToolbar.tsx`; row chips in `SessionRowParts.tsx`) |
| Tracks | `/api/track/:trackName` | `circuitSpecs.ts`, `circuitDefinitions.ts` | `components/track-summaries/` (native card links preserve class context; benchmark status/retry, unavailable pace sorting, explicit missing-record states; session-style PaceBadge and Last driven date), `components/track-detail/` |
| Leaderboard & rivals | `leaderboardRoutes.ts` (`/leaderboard/layouts`, `/leaderboard`, `/rivals`, `/rivals/pin`), `dbRivalStore.ts` | `leaderboard.ts`, `rivals.ts`, `sessionRivals.ts` | `src/api/leaderboardApi.ts`, `components/leaderboard/` (`board/`, `ribbon/`, `rivals/`, `debrief/`, 2-lap compare) |
| Lap comparison | `/api/compare/laps` (`sessionAnalytics.ts`) | `lapComparison.ts` | `src/utils/referenceLaps.ts`, `src/utils/telemetryCompareLink.ts` |
| Benchmarks | `referenceRoutes.ts`, `server/benchmarks/referenceLaptimes.ts`, `dbReferenceLaptimeStore.ts` | `paceCategory.ts` | `src/api/referenceApi.ts`, `common/BenchmarkLadder.tsx` (the one benchmark display, session and track header cards) |
| AI engineer | `aiRoutes.ts`, `server/ai/aiReport.ts` (`PROMPT_VERSION`), `dbAiReportStore.ts` | `shared/types/aiReport.ts` | `src/utils/aiReportPayload.ts`, `replay/analysis/AIReportTab.tsx` |
| Settings & scans | `systemRoutes.ts` (`/status`, `/scan`, `/scan/status`, `/cache/clear`), `/replays/cache`, `/replays/upgrade` | | `components/settings/` |

Client routes (`src/App.tsx`): `/dashboard`, `/tracks`, `/track/:trackName`, `/leaderboard`, `/session/:sessionId`,
`/telemetry`, `/settings` (`/compare` redirects). Pages load on demand from `src/routePages.ts` (the current route's
page with the session data, the rest when idle; never import a page from the components barrel in `App.tsx`, and keep
recharts out of the entry: chunk groups in `vite.config.ts`). All server calls go through `src/api/apiClient.ts` (static track JSON via `src/api/trackGeometryApi.ts`).

Types: canonical in `shared/types/` (`index.ts` is the barrel; `session.ts` laps/drivers/sessions, `reference.ts` benchmarks, `status.ts` scan/system, `replay.ts` replay; `leaderboard.ts`, `pitStops.ts`, `raceTraffic.ts`, `aiReport.ts`).
`server/core/types.ts` re-exports them for server code; client and shared code import from `shared/types/index.ts`.

Track detail load failures show the API message with retry and clear stale track data; route sort values are validated. Circuit information uses the body-portaled focus/scroll isolation hook `src/components/common/useModalFocus.ts`. Progression view and series controls expose their pressed state and support keyboard operation.

## 5. Cache versions: what to bump

| Constant | File | Bump when | Effect |
|---|---|---|---|
| `DB_PARSER_VERSION` | `server/core/dbSessionSync.ts` (exported const) | a parser/lap classification rule changes | every stored session re-parsed from XML |
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
- **New endpoint**: `server/routes/<domain>Routes.ts` (query helpers `queryParams.ts`) → mount in `server/index.ts` only for a new router →
  supertest in `test/server/routes/` → client loader in `src/api/`.
- **New table/store**: DDL in `dbSchema.ts` → functions taking the `better-sqlite3` `Database` in `server/core/db<Name>Store.ts`
  (pattern: `dbRivalStore.ts`) → callers pass `sessionDb.getDb()`; add a `SessionDatabase` method in `db.ts` only when many callers need it.
- **New car**: `shared/domain/vehicleMapping.ts`; `vehicleCatalog.ts` is generated by `tools/analysis/buildVehicleCatalog.ts`.
- **New session list filter**: add the control to the `narrow` slot of both toolbars (`DashboardFilterBar.tsx`, `TrackSessionsToolbar.tsx`), clear it in the one-write resets (`resetFilters` in `Dashboard.tsx`, `resetSessionFilters` in `useTrackDetailState.ts`; separate `updateSearchParams` calls overwrite each other) and count it in their "is filtered" checks.
- **Color in the UI**: use the semantic `lmu-*` roles in `tailwind.config.js` (`text-lmu-gain`, `bg-lmu-warn-strong/20`,
  `text-lmu-faint`), never raw Tailwind hues; charts and SVG take `src/utils/themeColors.ts`. Roles, steps and contrast rules
  (no `opacity-*` on text) are in `DESIGN.md`, Colors; a new role goes in the config and `DESIGN.md` together.

## 7. Tests and checks

- `npm test` (all), `npx vitest run <path>` (one file), `npm run build` (types + bundle, zero warnings).
- Tests mirror the source tree: `test/server/<domain>/`, `test/domain/`, `test/utils/`, `test/components/<feature>/`.
- Fixtures: `test/fixtures/{results,replays,telemetry}`; synthetic VCR with `test/utils/mockVcr.ts`; leaderboard fixtures `test/domain/leaderboardFixtures.ts`.
- The user runs the dev server (UI 5173, API 3001). Session JSON: `GET http://localhost:3001/api/session/<id>`.

## 8. Other docs

`docs/XML_FORMAT.md`, `docs/VCR_FORMAT.md` (incl. pit event codes), `docs/VCR_ANALYSIS.md`, `docs/TELEMETRY_FORMAT.md`,

---

## 9. Smells that need attention

Session-detail accessibility hardening: `SessionRulesModal` portals into the body, isolates background content with `inert`, traps focus and restores the trigger and scrolling on close. Circuit navigation is a React Router link; chart legend visibility uses native toggle buttons. Debrief status/errors are announced through status/alert regions. See `session-detail-audit.md` for the remaining findings.

Found while writing this map. Remove an item when it is fixed; add new ones as they are noticed. The fix plan is `docs/plans/SMELLS_CLEANUP.md`.

**Size limits close to the edge**
- Files near the 1,000-line limit, both left as they are: `shared/domain/circuitDefinitions.ts` (873, a data file: one entry per layout)
- Folders near 20 files (17 files each; no obvious semantic group to split off): `src/components/common/`, `test/utils/`;
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
