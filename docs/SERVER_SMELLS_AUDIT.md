# Server repeated-work and code-smells audit

Reviewed 2026-10-11 against the current working tree after the shared-domain cleanup.
Initial status: findings only. Existing uncommitted replay, traffic, test and Vite changes
were preserved and included as current source where relevant.

First implementation pass, 2026-10-12: findings 1, 6 and 7 are fixed. Replay-related findings
2–5 and 8 are deferred at the user's request while replay ingestion is optimized separately.
Their evidence below describes the original audit snapshot, not a fresh review of that concurrent
work. This pass changes XML event identity, production analytics ownership and canonical pace
bands; it does not edit replay code, DuckDB preparation, traffic or replay-weather handling.

Scope: inventory of 112 server TypeScript files, with focused call-path review of session
ingestion/classification, normalized storage and summary queries, replay serving/scans/upgrades,
DuckDB preparation, and traffic workers. This is not exhaustive runtime profiling.
No server TypeScript file exceeds 1,000 lines; the largest is `duckdbReader.ts` at 773.

## Priorities

| Order | Finding | Main benefit | Evidence |
|---|---|---|---|
| 1 | Fixed: XML stream identity requires a unique exact normalized name | Safer | Regression and parser-version migration tests |
| 2 | Replay request, scan and upgrade decodes have separate lifecycles | Safer, less duplicate work | Source-confirmed coordination and file-check differences |
| 3 | Boundary samples require full neighboring-lap reads | Faster | Synthetic query/materialization counts |
| 4 | One trajectory request repeatedly reads and normalizes replay metadata | Simpler, faster | Source-confirmed three warm-path reads |
| 5 | Cold DuckDB lap preparation repeats session-wide work | Faster | Source-confirmed duplicate lap-list and full-channel reads |
| 6 | Fixed: superseded analytics moved to test parity helpers | Simpler | Production caller search and parity suites |
| 7 | Fixed: benchmark-impact SQL consumes canonical pace bands | Safer | SQL/JavaScript cutoff parity tests |
| 8 | Conditions classification loads the same replay weather twice | Simpler, faster | Synthetic SQL count |

## 1. XML event identity can select the wrong driver

Fixed 2026-10-12: a roster-scoped name map rejects empty, partial and duplicate normalized
names, and applies the existing stream-decoration/case normalization. All four event types have
regressions. Parser version `2.23_exact_stream_event_identity` reparses available XMLs; a
migration regression verifies repaired ownership and preservation of deleted-source sessions.
The original finding and reproduction follow.

`server/sessions/sessionXmlStream.ts:33` uses `find` with an OR of exact and bidirectional
substring matches. An earlier partial match wins over a later exact match. The same matcher
attributes incidents, damage, track limits and penalties, which feed lap classification.

Reproduction using `parseStreamEvents`, a roster ordered `Ann Smithson`, `Ann Smith`, and a
track-limit event whose `@_Driver` is `Ann Smith`:

```json
[{"name":"Ann Smithson","trackLimits":1},{"name":"Ann Smith","trackLimits":0}]
```

Build one normalized-name index for the roster and accept only a unique exact identity after
removing the documented stream decorations. Leave ambiguous/unmatched events unattributed;
do not resolve them by roster order. Test prefix names, duplicate normalized names, empty names,
and decorated names. Changing stored event ownership/classification requires a
`DB_PARSER_VERSION` bump and the existing versioned reparse path; preserve deleted-source sessions.

## 2. Replay decode orchestration is duplicated and its safety checks differ

The request path (`replayRecordingService.ts:137`), background scan
(`dbReplaySync.ts:371`, `:418`) and upgrade (`dbReplayUpgrade.ts:141`) each start workers,
consume progress, persist lap sets and record failures. The request service's `pendingDecodes`
only shares work with other requests through that service. Scans and upgrades bypass it.

Consequently, opening an uncached driver while its scan/upgrade is running can start another
full decode and write of the same driver. The upgrade checks file identity again after decoding
(`dbReplayUpgrade.ts:153`); request and async-scan paths persist under their earlier mtime/size
without that check. `SessionDatabase.replaceReplayDriverLaps` itself does not reject a stale
completion. With overlapping old/new file jobs, a late old result can replace newer lap rows;
filename-collision handling at metadata ingestion does not guard that later completion.

Use one substantive decode-job owner shared by these entry points, keyed by source path,
recording identity/version, parser version and resolved driver slot. Keep progress and caller
scheduling policies, but centralize in-flight sharing, failure handling and commit eligibility.
Validate identity at the actual write boundary, including after a progress yield. A stopped or
superseded job must not repopulate cleared/replaced rows.

Acceptance: a request plus scan for one driver starts one worker; a file replacement or cache
clear during decoding cannot accept the old completion. These concurrency cases were identified
from source, not reproduced against a live changing recording.

## 3. Lap edges trigger full neighboring-lap hydration

`ReplayRecordingService.withLapEdges` (`:177`) only needs up to two seconds on either side of
the selected lap. `getAdjacentLapTrajectories` (`dbReplayTrajectoryStore.ts:171`) fetches the
selected compressed blob again just to check its version, then fully decodes both neighbors.
Each neighbor also runs garage/compatibility handling and reloads/reclassifies the driver's
entire lap-summary list through `readTrajectoryRow` (`:30`).

An in-memory synthetic check with three contiguous 6,000-point laps measured:

| Work for serving the middle lap and edges | Count |
|---|---:|
| Points decoded into objects | 18,000 |
| Neighbor points retained as edges | 200 |
| Queries selecting trajectory blobs | 4 |
| Driver lap-fact queries | 3 |

First read only identity columns for the selected row and skip summary reconstruction for
neighbors. Then provide a boundary-specific decoder that materializes the required channel
samples only, retaining compatibility/sign conversion and all four-wheel channels.
The current compressed format still requires decompression/JSON parsing of a neighbor blob;
avoiding that cost needs a deliberately designed retained boundary representation, not a claim
that slicing point objects solves all of it. Preserve deleted recordings and timing-line cuts.

## 4. Replay metadata is repeatedly loaded within one request

On a warm on-disk trajectory request, metadata is read by slot resolution
(`replayRecordingService.ts:42`), explicit-slot validation (`:93`), and response composition
(`replayTrajectoryService.ts:57`). Each read performs filesystem checks, SQL/blob decoding,
vehicle resolution and ownership handling.

The store additionally resolves roster vehicles in both `readMetadataRow` and
`applyConfiguredPlayer` when a player name is provided. `getReplayMetadataCache` and
`getStoredReplayMetadata` stringify the metadata even when no player name was supplied;
with a player name, they stringify again to detect changes and may write during a read.
The startup identity reconciliation already supplies a natural ownership-update boundary.

Load one versioned metadata snapshot per trajectory operation and use it for unique slot
resolution, validation and composition. Normalize vehicles once, and make ownership changes
explicit at ingestion/configuration boundaries where possible. Retain configured-player behavior
and collision checks; do not add an unversioned process-wide metadata cache.

## 5. DuckDB preparation repeats work before extracting one lap

`ReplayTelemetryService.readLap` (`:48`) calls `reader.getLapList`, then
`reader.getLapTelemetry`, which calls `getLapList` again (`duckdbReader.ts:240`). If the numbered
pass fails, the duration fallback opens the files again. Concurrent cold requests have no
telemetry-specific in-flight sharing.

`getLapTelemetry` reads the entire `GPS Time` channel (`:278`) to find one lap's sample bounds,
and `percentScale` (`:231`) scans whole pedal/wear channels. Thus selecting one lap still does
work proportional to the recording, even though most output channel reads are lap-scoped.
`getLapList` also filters the entire sector-event list separately for every lap.

Within an open reader, reuse the resolved lap list, channel descriptors and percent scales.
Pass the selected lap summary into extraction rather than selecting it again. Profile a bounded
GPS sample-window strategy while preserving the existing index/frequency alignment, boundary
padding and event-channel state before the lap. Share cold extraction by session/file version
and requested lap, with results still persisted to SQLite. Preserve multi-file precedence and
deleted-file fallback; do not infer ownership from a lap-time match alone.

## 6. Test-only legacy implementations duplicate the live query paths

Fixed 2026-10-12: the four legacy implementations live in
`test/helpers/legacySessionAnalytics.ts` and `test/helpers/legacyBenchmarkImpact.ts`.
Existing tests and compact-query parity checks import those helpers directly. Production retains
the live average/DTO functions, the comparison result contract and compact benchmark-impact
queries. The original caller analysis follows.

Repository-wide caller searches found no production consumers for:

- `computeProgression` and `extractComparableLaps` in `sessionAnalytics.ts:116` / `:178`.
- `computeBenchmarkItemImpact` and `enrichBenchmarkDiffWithImpact` in `benchmarkImpact.ts:28` / `:99`.

The live implementations are compact SQL queries. Tests still exercise or use the older
implementations as parity oracles, leaving two definitions of filtering, identity, PB scope,
progression and benchmark impact in shipped server modules.

Keep useful independent parity oracles under test helpers, or replace them with explicit contract
fixtures. Remove the superseded production exports and their imports. Retain the live
`computeAverageLapTime`, `toComparableLap` and required contracts; this is not a proposal to
delete the whole analytics module or discard coverage.

## 7. SQL pace categories copy a shared-domain rule

Fixed 2026-10-12: `PACE_CATEGORY_BANDS` in `shared/domain/paceCategory.ts` owns the ordered
cutoffs and categories. JavaScript classification and SQL CASE generation consume that data.
Tests cover inclusive cutoffs, values just above/below, NaN and infinities, plus compact SQL
impact parity. Category semantics are unchanged, so `BENCHMARK_IMPACT_RULE` stays at 4.
The original finding follows.

`benchmarkImpact.ts:170` hardcodes the five percentage thresholds and all category names in
`paceCategorySql`, duplicating `shared/domain/paceCategory.ts:5`. They agree today, but a domain
change can silently leave stored benchmark history following the old rule. The current
in-memory impact oracle does call the shared function, so preserve that independent verification.

Define the category bands once in the shared domain and derive both classification and the SQL
CASE from them, or use another measured approach that directly consumes the canonical rule.
Avoid loading detailed sessions to eliminate this duplication. Test equality and just-above cases
at every threshold. A change to historical impact semantics also needs `BENCHMARK_IMPACT_RULE`
review and the existing recomputation path.

## 8. Replay rain is loaded twice per classification

`classifySessionConditions` (`dbSessionConditions.ts:56`) loads conditions through
`replayRainOverLap`, then loads them again through `applyStoredReplayWeather`.
An in-memory check with a stored rainy span recorded two `replay_conditions` reads for one call.
For each lap, the returned rain function also starts scanning the rainy spans from the beginning.

Load the ordered condition snapshot once and derive both session peak and per-lap rain from it.
Reuse it across sessions linked to the same replay in one reclassification batch. Preserve the
distinction between missing replay conditions and explicitly dry conditions. Only optimize span
search further if measurements justify it; do not add a second persistent weather cache.

## Smaller follow-ups and deliberate exclusions

- `server/core/types.ts` remains a pass-through barrel, already recorded in CODE_MAP. Direct
  imports are an inexpensive later cleanup, not the main performance opportunity.
- Parser pace rating runs in the worker and again at the synchronous ingestion write boundary.
  The second pass intentionally prevents an old worker snapshot restoring stale benchmarks.
  Remove the worker pass only with a clear raw-parse contract and standalone-parser coverage.
- Ordinary per-call maps, retained-data compatibility adapters and geometry cloning are not
  redundant merely because they repeat work. They preserve ownership and deleted recordings.
- Background decoding scans the replay stream separately for each driver. A batched decode may
  reduce I/O, but requires memory/progress/retry measurements before expanding this audit into a
  decoder rewrite, particularly with the current uncommitted stream-boundary changes.
- The old CODE_MAP statement about one PB query per visible driver is outdated:
  `markPagePersonalBests` now uses one page-scoped window query. Its query-plan cost still needs
  measurement; the old timing is not evidence for the current implementation.

## Verification and suggested delivery order

### First implementation pass — 2026-10-12

Luna moved the legacy implementations and consolidated the pace bands; the parent independently
reviewed that diff, removed SQL threshold rounding and requested one canonical fallback category
and comparison contract. Luna independently reviewed the parent's XML identity fix and migration
regression. Focused checks passed for all eight affected suites (86 tests).

The production build passed with zero warnings/errors when run separately. An earlier build
overlapping full tests emitted a plugin callback timing warning; the separate rerun was clean.
Full tests outside the restricted sandbox reported 2,531 passed, 56 skipped and one failure across
301 suites. The sole failure is the replay-ingestion progress assertion at
`test/server/core/db.test.ts:415`, expecting `Primary driver: Decoding telemetry and events`
while the concurrent replay implementation emits its revised stages. It was left unchanged to
respect the user's explicit replay exclusion. An initial sandbox run also failed local HTTP and
filesystem tests; those restrictions were resolved by the subsequent unsandboxed verification.
The full output is local-only in `.cache/non-replay-full-tests.log`.

No endpoint queries, response contracts or payload shapes changed, and no endpoint-performance
claim is made for this pass; the endpoint benchmark was not rerun. The parser version bump is
applied through the normal next-scan reparse path, not a manual rewrite of the user's database.
Remaining findings 2–5 and 8 stay deferred while replay work proceeds separately.

### Original read-only audit — 2026-10-11

Eight selected suites passed: 77 tests, zero warnings/errors. Covered recording and trajectory
services, trajectory storage, replay upgrades, benchmark impact, session conditions, compact
comparison queries and XML stream parsing. The first attempt failed before test collection due
to a Vite temporary-file ENOENT; rerunning with workspace-local TEMP/TMP succeeded.

The wrong-driver and lap-edge/condition SQL-count checks ran directly through current modules
with synthetic inputs and in-memory SQLite. They did not read or modify the user's database.
No production endpoint timing, full test run, coverage run, build or live-game validation was
performed for this documentation-only review. Synthetic counts are not latency measurements.

Suggested changes: fix event identity first; unify decode commit safety next; remove superseded
production code and duplicated pace rules; then measure and optimize edges, metadata and DuckDB.
For API-performance changes run the endpoint benchmark before and after on the same cohort,
plus focused correctness tests, full tests and build. Keep each change independently reviewable.
