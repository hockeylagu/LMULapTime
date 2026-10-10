# Smells cleanup — execution plan

> Archived completed plan. Reviewed 2026-10-10. The steps, paths, schema snapshots and measurements
> below are historical; do not rerun them as a migration guide. See the [current work queue](../README.md)
> and [code map](../../CODE_MAP.md) for current status.

Status: **completed** on 2026-09-29. Skipped: 5.3 (no obvious semantic group for the 17-file folders); 3.5 kept near-limit files under observation. This records the smells present at that date; it is not the current backlog for CODE_MAP section 9. Branch/push notes and execution instructions below are historical.

## Ground rules (read first)

- Create a new branch off `main` called `smells-cleanup`. Work on the branch, or in a worktree. Do not touch the
  `debrief-first` worktree. Do not push.
- Make one step per commit. Use a conventional message (`refactor: …`, `fix: …`), and end every commit with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- After **every** step, run `npm test` and `npm run build`. Both must finish with zero errors and zero warnings.
  Also check that no `.ts`/`.tsx` file is over 1,000 lines, that no component under `src/components/` is over
  300 lines, and that no non-`tracks/` folder has more than 20 files. Do not commit a red step.
- **Behaviour does not change** unless a step says it does. This is a refactor, so a test that has to change its
  expected values is a warning sign: stop and re-read the step.
- **No shims.** When you move something, update every importer to the new path (`grep -rn` for the old path in
  `src/ server/ shared/ test/ tools/`). Do not leave a re-export at the old place. The one allowed barrel is
  `shared/types/index.ts` (step 3.1).
- No `any`. Use `.js` extensions on relative imports under `server/`, `shared/` and `test/`, like the code around it.
- Test files mirror the source tree: a module that moves to `shared/domain/x.ts` gets its tests in `test/domain/x.test.ts`.
- In the same commit as each fix, remove that item from `docs/CODE_MAP.md` section 9, and update every path in
  CODE_MAP (and in the folder table in AGENTS.md section 3) that the step moved.
- If a step turns out to be much bigger than described, or needs a behaviour change, stop and write down why under
  "Notes from the run" at the end of this file, then continue with the next step.

### Parser golden check (used by steps 1.4 and 2.2)

Before changing `server/sessions/parser.ts`, record what it outputs for every fixture, then compare after the change:

1. Create `tmp_probe/` at the project root (tsx fails when run from the system temp folder). Add a
   `tmp_probe/dump.ts` that, for each `test/fixtures/results/*.xml`, runs
   `new LmuParser(replaysDir, resultsDir).parseSessionXml(file)` and writes the result as JSON with sorted keys to
   `tmp_probe/<label>/<name>.json`. For `replaysDir`, use an empty folder such as `tmp_probe/replays`, and for
   `resultsDir`, use `test/fixtures/results`. Check the constructor and method signatures in `parser.ts` before
   writing the script.
2. Run `npx tsx tmp_probe/dump.ts before` on the unchanged code, and `npx tsx tmp_probe/dump.ts after` once the
   change is made.
3. `git diff --no-index tmp_probe/before tmp_probe/after` must be empty. If it is not, either the change has a bug
   or it changes behaviour. A behaviour change means bumping `DB_PARSER_VERSION` (see step 1.3) and explaining it in
   the commit message.
4. Delete `tmp_probe/` before committing. It must never be committed.

---

## Phase 1 — correctness and small fixes

### 1.1 `attachPitServices` leaves stale data (bug fix)

In `server/sessions/sessionPitStops.ts`, `attachPitServices(db, session)` returns early when the session has no
`matchingReplayFile`, or when the replay has no pit events (`byName.size === 0`). Before it returns, it does not
clear `lap.pitService` from an earlier call. Session objects are cached (`getSessionById` returns an object from
`allSessionsCache` in `server/core/db.ts`), so when a replay link is withdrawn, the old pit details stay on the laps.

- Clear the old values at the top of the function: `delete lap.pitService` on every lap of every driver (and on
  `playerDriver`, if it is a separate object and not one of `drivers`), before any early return.
- Add a test to `test/server/sessions/sessionPitStops.test.ts`:
  1. attach once with the replay, so the in-lap has `pitService`;
  2. remove `matchingReplayFile` and attach again;
  3. check that no lap has `pitService`.
- Commit: `fix: pit details are cleared when a session loses its replay`.

### 1.2 One helper for the read-time session details

In `server/routes/sessionRoutes.ts` (about lines 80–101), the `GET /session/:id` handler calls
`context.enrichSessionsWithTelemetry([s]); attachPitServices(context.sessionDb.getDb(), s);` twice: once in the
cached branch and once in the freshly parsed branch.

- Move those two calls into one function in the same file, `withReadTimeDetails(session)`, and call it once, after
  the branches.
- Leave the mutation of the cached object alone. Step 1.1 makes it safe to repeat the call. Copying the session on
  every request is a separate decision, so do not do it here.
- The route tests in `test/server/routes/` must pass unchanged.
- In the CODE_MAP smell, remove the "repeats … in two branches" part. Keep a short line saying that the pit details
  are recomputed on every request, on the cached object.
- Commit: `refactor: the session route adds its read-time details in one place`.

### 1.3 Export `DB_PARSER_VERSION`

`server/core/dbSessionSync.ts` line ~44 declares `const DB_PARSER_VERSION = '…'` inside `syncSessionsFromDir`.

- Move it to module level as `export const DB_PARSER_VERSION = '…'` and keep the value exactly the same.
- Do not merge the other version constants into one file. CODE_MAP section 5 is the index of where each one lives.
  Make sure the entry there names the new location.
- Update the "version constants" smell so it only mentions the spread across files, and says the table in section 5
  is the answer. If nothing is left to fix, remove the smell.
- Commit: `refactor: DB_PARSER_VERSION is exported at module level`.

### 1.4 Stale parser comment

`server/sessions/parser.ts` around line 248 points to `sessionConditions.ts`. The file is
`server/core/dbSessionConditions.ts`. Fix the comment. Only a comment changes, so the golden check is not needed.

- Commit: `docs: parser comment names dbSessionConditions.ts`.

### 1.5 Remove the unused client type barrel

`src/types.ts` only contains `export * from '../shared/types/index.js';`, and nothing imports it.

- Confirm with `grep -rn "src/types\|from '\.\./types'\|from '\./types'" src test`. Watch out for the similar
  local `types.ts` files in subfolders: only imports that resolve to `src/types.ts` count. Then delete the file.
- Keep `server/core/types.ts`, which has over 130 importers. In CODE_MAP, say that server code imports types
  through `server/core/types.ts`, and client and shared code imports them from `shared/types/index.ts`.
- Commit: `refactor: remove the unused src/types.ts barrel`.

### 1.6 Move the track geometry fetch into `src/api/`

`src/components/replay/map/useTrackBoundaryGeometry.ts` calls raw `fetch` for `/tracks/*.json`.

- Create `src/api/trackGeometryApi.ts` with a loader such as `loadTrackBoundaryGeometry(fileName, signal?)` that
  calls `fetchJson` from `src/api/apiClient.ts`. `fetchJson` accepts any relative path.
- The hook keeps its behaviour: the LRU cache, sharing a request that is already in flight, and ignoring
  `isAbortError`. Put the cache and the in-flight sharing in the loader if that is simpler, the way other `src/api`
  loaders share data. Otherwise keep them in the hook.
- A 404 or bad JSON now rejects with `ApiError`. Keep what the hook shows today (no geometry, no crash), and make
  sure it does not start showing a new error state.
- Update `test/components/replay/map/useTrackBoundaryGeometry.test.ts`. It may mock `fetch` directly, and it must
  still pass without `act(...)` warnings. Add `test/api/trackGeometryApi.test.ts` if the other `src/api` loaders
  have tests there (check `test/` for their location first).
- Commit: `refactor: track geometry is loaded through src/api`.

---

## Phase 2 — logic placement

### 2.1 Move race maths out of the UI folder

- `lapLosses(inLap, outLap?)` in `src/components/session-detail/table/pitStopText.ts` (~line 69) splits a stop's
  time between the in-lap and the out-lap. Move it to `shared/domain/pitStops.ts` as an exported
  `pitLossPerLap(inLap, outLap?)`, keeping the same maths:
  - with no out-lap time, the in-lap gets the whole stop;
  - otherwise `average = (in + out − total) / 2`, and each lap's loss is its time minus `average`.
- `lapClassPosition` in `src/components/session-detail/table/lapPlaces.ts` is used by `SessionLapTableRow.tsx`
  (~line 96). Move it (and any private helper it needs) to a new `shared/domain/lapPlaces.ts`, or to
  `shared/domain/lapComparison.ts` if it fits there better. If `lapPlaces.ts` still has UI-only code left, keep that
  code where it is. If the file ends up empty, delete it.
- Move the tests:
  - `test/components/session-detail/lapPlaces.test.ts` goes to `test/domain/`, with the imports updated;
  - add `pitLossPerLap` cases to `test/domain/pitStops.test.ts`. Use the Daytona numbers from
    `test/components/session-detail/lapDetailSections.test.ts`: in-lap 122.366, out-lap 210.933, stop 113.1, which
    gives losses of +12.3 and +100.8.
- `lapDetailSections.test.ts` must pass unchanged.
- Commit: `refactor: pit loss split and class position per lap live in shared/domain`.

### 2.2 One lap timing pass in the parser

`server/sessions/parser.ts` computes the clean-lap average three times:

1. `const avgLapTime = computeAverageLapTime(laps)` (~line 525), before laps are inferred and out-laps are marked.
   It is written to the output (~line 691), and `classifySessionLaps(drivers)` then overwrites it (~line 251).
2. `refLapTime = computeAverageLapTime(laps) || bestLapTime` (~line 586), after marking, used as the reference for
   the pit loss.
3. Inside `classifySessionLaps`.

Steps:

- Run the golden check's `before` dump.
- Remove the first computation (1). Check that nothing reads `avgLapTime` between line ~525 and the
  `classifySessionLaps` call. If something does, stop and note it here.
- Move the per-driver lap timing steps (inferring missing lap times, marking out-laps, computing the pit loss with
  `refLapTime`) into a new `server/sessions/sessionLapTiming.ts`, as one exported function that the parser calls.
  Keep the order of the steps exactly the same. This also takes `parser.ts` well under 1,000 lines.
  - `server/sessions/` must stay at or under 20 files.
  - Add `test/server/sessions/sessionLapTiming.test.ts` with a few direct cases: an inferred lap, an out-lap after a
    completed stop, and a pit loss.
- Run the `after` dump. The diff must be empty, so no `DB_PARSER_VERSION` bump is needed. Delete `tmp_probe/`.
- Update CODE_MAP section 2 (life of a session) to name `sessionLapTiming.ts`. Add it to the AGENTS.md folder table
  only if that table lists files, which it should not.
- Commit: `refactor: the parser's lap timing steps run in one ordered pass`.

---

## Phase 3 — files near 1,000 lines

Each split is a pure move: same code, new files, importers updated. Keep every new file clearly under the limit, and
keep each folder at or under 20 files.

### 3.1 `shared/types/index.ts` (859 lines)

Split it by domain into `shared/types/`:

- `reference.ts`: reference / benchmark types (~lines 15–79);
- `session.ts`: lap, driver and session types (~79–352), plus the comparable lap types (~482);
- `status.ts`: scan / status / system types (~368–470);
- `replay.ts`: replay types (~537–859).

`index.ts` becomes `export * from './session.js';` and so on. It is the canonical barrel (importers keep
`shared/types/index.js`), so this is not a shim. Fix any cross-imports between the new files with `import type`.

- Commit: `refactor: shared types are split by domain`.

### 3.2 `src/utils/cornerAnalysis.ts` (891 lines)

Split it into a `src/utils/cornerAnalysis/` folder:

- `types.ts`: types and constants (~lines 1–245);
- `helpers.ts`: the helper functions;
- `segmentComparisons.ts`: `computeLapSegmentComparisons` and what only it uses (from ~407).
- `index.ts` re-exports the public API only if more than a handful of importers use it. Otherwise update the
  importers to the precise files.

This also takes `src/utils/` from 17 files to 17 files and 1 folder. Tests move from `test/utils/` to
`test/utils/cornerAnalysis/` only if a test file is split. Otherwise update their imports.

- Commit: `refactor: corner analysis is split into types, helpers and segment comparisons`.

### 3.3 `telemetryChartPaths.ts` (803 lines)

`src/components/replay/telemetry/telemetryChartPaths.ts` is mostly one function of about 670 lines, starting at
~131. Break it into named helpers, one per channel group or per path kind, following its existing sections. The
channel folders under `telemetry/channels/` show the grouping. The helpers can live in a sibling file, such as
`telemetryChartPathBuilders.ts`.

- The output for the same input must be identical. If there is no test that builds paths for a full lap, add one
  before the split: build paths from a small synthetic lap and snapshot the result with `toMatchSnapshot()` or
  explicit values.
- Commit: `refactor: telemetry chart paths are built by one helper per channel group`.

### 3.4 Large test files

- `test/components/replay/map/GpsTrackMap.test.tsx` (961 lines): split by concern (rendering, pan/zoom, markers,
  boundaries, …) into several files in the same folder. Keep the folder at or under 20 files; if that fails, create
  a `GpsTrackMap/` subfolder.
- `test/server/replay/replayParserExtended.test.ts` (901 lines): split it
  by concern (header, driver index, slice packets, …).
- The test count before and after must match. Compare the `Tests` line of `npm test`.
- Commit: `test: large map and replay parser suites are split by concern`.

### 3.5 Optional, low priority

`shared/domain/circuitDefinitions.ts` (873 lines) is a data map of the 32 layouts, and
`buildTrackSourceGeometry` at ~282). Only split them if the earlier phases went smoothly:

- `circuitDefinitions.ts`: split the data by region or by manufacturer group into `shared/domain/circuits/*.ts`,
  merged into the same exported map. Do not change any key, and do not add a lookup.

Otherwise leave them, and change the CODE_MAP smell to "data file / offline tool, watched".

---

## Phase 4 — components near 300 lines

For each component below, extract a hook (`useX.ts`) or a subcomponent in the **same folder**, so the file drops to
about 250 lines or fewer. Keep the props and the rendered output the same. Its tests must pass unchanged, with no
`act(...)` warnings. Do one commit per component, in this order (most urgent first):

1. `SessionLapTableRow.tsx` (300): pull out the cell groups (the timing cells, and the status / detail cells) as
   subcomponents.
2. `CornerSpeedGraph.tsx` (298)
3. `ReplayInspectorModalBody.tsx` (295)
4. `TelemetryPresetModal.tsx` (295)
5. `ReplayInspectorSidebar.tsx` (292)
6. `ImprovementChart.tsx` (291)
7. `GpsSceneMarkers.tsx` (290): do this after step 5.1, because the file moves.
8. `TelemetrySteerChannel.tsx` (287)

Check each folder's file count before adding a file. `src/components/replay/map/` is at 19, so do step 5.1 first if
you need to add a file there.

Commit example: `refactor: SessionLapTableRow renders its cell groups as subcomponents`.

---

## Phase 5 — folders near 20 files

### 5.1 `src/components/replay/map/` (19 files)

Create a `scene/` subfolder for the SVG scene pieces: `GpsTrackMapScene.tsx`, `GpsSceneCarMarkers.tsx`,
`GpsSceneHudOverlay.tsx`, `GpsSceneMarkers.tsx`, `GpsStartFinishLine.tsx`, `GpsTrackRoadRibbon.tsx` and
`GpsTrackSegments.tsx`.

- Keep `index.ts` as the folder's public entry, and update its exports.
- Mirror the move in `test/components/replay/map/`.
- Commit: `refactor: replay map scene pieces live in map/scene`.

### 5.2 `server/replay/` (18 files, including `replayTrajectoryWorkerBootstrap.mjs`)

Split the folder by role:

- `server/replay/decode/`: `replayParser.ts`, `replayTrajectory.ts`, `replayTransforms.ts`, `replayLapBuilder.ts`,
  `replayLapPoints.ts`, `garageState.ts`, `trajectoryDownsampler.ts`, `replayFacts.ts`;
- `server/replay/worker/`: `replayTrajectoryWorker.ts`, `replayTrajectoryWorkerBootstrap.mjs`,
  `replayTrajectoryWorkerClient.ts`;
- the services stay in `server/replay/`: `replayRecordingService.ts`, `replayMetadataService.ts`,
  `replayTelemetryService.ts`, `replayTrajectoryService.ts`, `replayServiceTypes.ts`, `replayProgress.ts`,
  `replayUpgradeRunner.ts`.

**Care:** the worker is started from a file path. `replayTrajectoryWorkerClient.ts` (~line 50) calls
`findWorkerBootstrap(import.meta.url, ['replay', 'replayTrajectoryWorkerBootstrap.mjs'])`, and other workers (such as the traffic index) may use the same helper. Update those paths, and check the worker still starts:

- run the replay worker tests;
- run `npx tsx -e` with a small script that decodes one fixture through the worker client, if one exists;
- check `vitest.config.ts` and `package.json` for paths that point into `server/replay/`.

Mirror the move in `test/server/replay/`, and update AGENTS.md section 4 (it names
`server/replay/replayTrajectoryWorker.ts` and other files) and CODE_MAP.

- Commit: `refactor: server/replay is split into decode, worker and services`.

### 5.3 Folders at 17 files (`src/components/common/`, `src/utils/`, `test/utils/`)

Only act if a semantic group is obvious (for example the lap alignment utilities, or the corner files already moved
in 3.2). Otherwise leave them and keep the smell line with the current counts.

---

## Final step — refresh the map

- Re-measure every number in CODE_MAP section 9. Use `wc -l` on the listed files, count the files in each folder,
  and run a quick scan for any other file over 900 lines or component over 270 lines.
- Remove the fixed smells, keep the ones that are still open, and set the "Last checked" line to the date of the run.
- Check every path in CODE_MAP and in the AGENTS.md folder table exists (`ls` each one).
- Set this plan's status line to done, listing any steps that were skipped and why.
- Commit: `docs: code map smells refreshed after the cleanup`.

## Notes from the run

(Record here anything that went differently from the plan.)

- Commits carry the trailer `Co-Authored-By: Claude Sonnet 5.5`, the model that ran the plan, not the Opus trailer named in the ground rules.
- `src/types.ts` was deleted; the types in `useTrackBoundaryGeometry` stay where they are.
- Step 5.3 was skipped: no semantic group was obvious, so `src/components/common/` and `test/utils/` stay at 17 files (`src/utils/` fell to 16 on its own).
- Phase 4 components were split by extracting a subcomponent or helper each (`cornerSpeedProfile.ts`, `ReplayInspectorTelemetryColumn`, `TelemetryPresetToolbar`, `ReplayInspectorSidebarTabs`, `improvementChartRows.ts`, `GpsScenePedalMarker`, `TelemetrySteerOverlayToggles`); props and output unchanged.
