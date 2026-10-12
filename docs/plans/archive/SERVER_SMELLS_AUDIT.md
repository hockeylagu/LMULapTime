# Server repeated-work and code-smells audit

Completed scoped cleanup, 2026-10-12. Findings 1, 2, 4–8 are addressed; finding 3's
bounded hydration improvement is retained, while further neighboring-blob/storage work is
explicitly out of scope. Final verification passed; this record is archived.
Primary follow-up: unique player identity is now resolved from metadata before decoding; a current
cached driver is promoted transactionally without another scan. Missing/ambiguous matches stay
unresolved. The earlier native-header limitation description was incorrect and is corrected below.
DuckDB still scans GPS timestamps internally, but only
lap-local timestamps cross into JavaScript. These limits are documented below.

Reviewed 2026-10-11 against the current working tree after the shared-domain cleanup.
Initial status: findings only. Existing uncommitted replay, traffic, test and Vite changes
were preserved and included as current source where relevant.

First implementation pass, 2026-10-12: findings 1, 6 and 7 are fixed. Replay-related findings
2–5 and 8 are deferred at the user's request while replay ingestion is optimized separately.
Their evidence below describes the original audit snapshot, not a fresh review of that concurrent
work. This pass changes XML event identity, production analytics ownership and canonical pace
bands; it does not edit replay code, DuckDB preparation, traffic or replay-weather handling.

Replay recheck, 2026-10-12, after `a1c59459`: worker persistence already validates the source
and metadata identity inside its immediate transaction. The original stale-save finding is
superseded. This pass fixes overlapping worker coordination and redundant edge, metadata,
lap-list and rain preparation. The original observations below remain historical evidence;
see the replay recheck notes for current limitations.

Scope: inventory of 112 server TypeScript files, with focused call-path review of session
ingestion/classification, normalized storage and summary queries, replay serving/scans/upgrades,
DuckDB preparation, and traffic workers. This is not exhaustive runtime profiling.
At the initial audit, no server TypeScript file exceeded 1,000 lines; the largest was
`duckdbReader.ts` at 773.

## Priorities

| Order | Finding | Main benefit | Evidence |
|---|---|---|---|
| 1 | Fixed: XML stream identity requires a unique exact normalized name | Safer | Regression and parser-version migration tests |
| 2 | Fixed: replay saves coordinate overlapping requests, scans and upgrades | Safer, less duplicate work | Worker overlap, failure handoff and cancellation regressions; primary-selection limit below |
| 3 | Bounded hydration implemented; further blob/storage changes out of scope | Faster | Synthetic query/materialization counts and compatibility regressions |
| 4 | Fixed: trajectory requests use one replay metadata snapshot | Simpler, faster | Snapshot, ownership and source-identity regressions |
| 5 | Fixed: DuckDB preparation is shared and timestamp transfer is lap-scoped | Faster | Real DuckDB fixtures and identical real-recording output hashes |
| 6 | Fixed: superseded analytics moved to test parity helpers | Simpler | Production caller search and parity suites |
| 7 | Fixed: benchmark-impact SQL consumes canonical pace bands | Safer | SQL/JavaScript cutoff parity tests |
| 8 | Fixed: one batch-local replay conditions snapshot | Simpler, faster | SQL-count and dry/missing-weather regressions |

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

Rechecked: save eligibility is already enforced by `dbReplayDriverStore.ts`. The worker client
now serializes file-backed saves by database, source path, filename, file tuple and parser version.
After waiting, callers reuse committed driver rows or the preceding failure rather than spawning
the same worker again. Cancellation releases queued/granted leases. Caller progress and retry
policies remain separate. Tests cover request/batch overlap, cancellation and failed owners.
Primary follow-up: `resolveReplayPrimarySlot` selects only a unique configured-name match or,
without a supplied name, one marked player. Requests, scans and decoding consume this rule;
upgrades retain an existing resolved primary. A source/version-validated transaction publishes
the alias to an already cached current driver without rewriting lap blobs or decoding again.
An unknown primary does not launch a default decode or keep explicit-driver ingestion queued.
The previous description of native-header selection was incorrect: no such identity is decoded
later in the stream. Coordination remains process-local; SQLite enforces commit eligibility.
No schema or cache-version change is needed.
The old suggestion about clearing replay rows does not apply to the current session-only cache clear.

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

Fixed for current columnar blobs: `getReplayLapEdges` reads the selected row's identity columns
and materializes only neighboring boundary samples, without reconstructing neighbor lap facts.
The same synthetic case now creates 6,200 point objects, selects three trajectory blobs and
loads driver lap facts once. Garage phase still uses the full time/speed/pit columns. Brotli/JSON
parsing remains whole-blob work; legacy formats still fully decode for compatibility semantics.
Deleted recordings, source-version checks, missing-time barriers and wheel channels are preserved.

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

Fixed: trajectory operations share one request-local metadata snapshot through resolution,
validation and response composition. A changed live source rejects the snapshot before decode.
Vehicle normalization runs once per metadata read; ownership changes are detected from fields
instead of serializing entire metadata twice. Configured-player updates and retained records remain
supported, including persistence when ownership changes. There is no process-wide metadata cache.

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

Fixed preparation duplication: an open reader shares its lap-list promise across selection/extraction,
invalidates it on close and permits retry after a failed query. Ordered sector lookup advances through
lap windows, preserving overlapping 50 ms boundaries, first transitions and missing-sector behavior.
Numbered selection and duration fallback reuse readers, closing all opened connections in `finally`.
Simultaneous cold reads share one operation keyed by session, ordered file paths/versions, requested
lap/time and reader cache version; completed/missing/failed operations leave the in-flight map.
The shared operation persists a successful lap once; each response still gets independent fused points.
Multi-file precedence and deleted-file fallback remain unchanged. Tables already have connection-scoped
caching; channel descriptors and percent-scale queries already run once per extraction. GPS boundary
indices are now computed inside DuckDB, and only the selected inclusive timeline window becomes JS
objects. The database still scans its GPS column; sample order/alignment and fallback semantics remain
unchanged. Six first/middle/last laps across two real recordings produced identical complete-output hashes.

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

Fixed: one ordered snapshot supplies lap rain and session peak, reused by replay within a single
reclassification batch. Dry conditions need one query as well; absent conditions stay undefined.
Regression tests cover both distinctions and batch read counts. No persistent weather cache added.

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
- Fixed in the second pass: XML parsing and persistence both return/store unrated facts. Benchmark
  pace is composed at read time, so a delayed worker result cannot restore obsolete ratings. XML
  workers no longer receive benchmark snapshots; standalone parsing shares the unrated contract.
  `calculateBenchmarkPace` owns the JavaScript percentage, delta and category calculation, including
  dashboard trends. The dashboard's SQL history selection/ranking remains unchanged.
- Ordinary per-call maps, retained-data compatibility adapters and geometry cloning are not
  redundant merely because they repeat work. They preserve ownership and deleted recordings.
- The initial per-driver stream scan observation was superseded by `a1c59459`, which batches
  ingestion drivers in one scan. This cleanup coordinates overlapping callers around that work;
  it does not introduce another decoder or storage rewrite.
- The old CODE_MAP statement about one PB query per visible driver is outdated:
  `markPagePersonalBests` now uses one page-scoped window query. Its query-plan cost still needs
  measurement; the old timing is not evidence for the current implementation.

## Verification and suggested delivery order

### Primary-driver follow-up — 2026-10-12

Primary identity now resolves before decoding. A request's completed driver can become primary
through an immediate source/version-checked transaction that updates only the alias and ingest
state. Missing/duplicate player matches remain unresolved while explicit drivers are ingested.
Upgrades preserve an existing resolved primary. Final review also found and fixed settled alias
state blocking a configured-player change: the validity check now compares the resolved slot,
and retry policy consults that driver's outcome. Regressions cover cached reuse, player switching,
failure sharing, source/metadata replacement, decoder versions and transactional rollback.
The endpoint baseline and two follow-ups used identical dataset/cohort; an initial session-detail
timing flag did not reproduce. See the active endpoint history for measurement limits.
The final full suite passed: 2,583 tests, 56 skipped across 303 suites; the production build
completed with zero warnings/errors. Independent review confirmed the alias-switch correction.

### Final review and closeout — 2026-10-12

Final review fixed failure propagation through three or more queued callers, including an
intervening caller canceled after receiving its lease. Failure handoff now lives in the lease
release path. Regressions verify later callers receive the original failure without decoding
the failed slot again. Metadata ownership, source snapshots and persisted formats were rechecked.
Full tests passed: 2,572 tests, 56 skipped across 303 suites. The separate production build
completed with zero warnings/errors. Endpoint before/after measurements and their limits are
recorded below and in the active performance history. The Vite watcher excludes temporary
DuckDB test directories to avoid locked-file watcher failures on Windows.

All in-scope findings are complete. Further neighboring-blob/storage work remains excluded;
missing/ambiguous primary identity remains unresolved, and cross-process coordination retains
the constraints in finding 2. The historical notes below preserve earlier verification results.

### DuckDB preparation follow-up — 2026-10-12

Sector lookup, connection reuse across selection passes and version-scoped cold-read sharing
are implemented. Tests preserve sector overlap/first-transition/missing-sector behavior, multi-file
numbered precedence and deleted-source fallback, and verify connection cleanup, retry, file-version
isolation and one cache write for simultaneous successful requests. Full tests passed: 2,563 tests,
56 skipped across 303 suites; the production build passed without warnings/errors.
The before/after endpoint runs used identical dataset/cohort with five warm samples and showed no
regression above the harness threshold. These retained-cache requests do not measure cold DuckDB
extraction, so no latency claim is made for the new preparation path. The subsequent GPS profiling
pass below addresses timeline result transfer. Finding 3 is out of scope at the user's request.

### GPS timeline transfer follow-up — 2026-10-12

The former full-channel transfer spent 187–234 ms per tested lap returning roughly 378,000 GPS rows.
The replacement aggregates first qualifying insertion indices inside DuckDB and returns only the
selected lap's inclusive timestamps. It preserves the former first-match behavior even for duplicate,
regressing, null or NaN timestamps; it does not estimate indices from time/frequency or physical row IDs.
Declared-frequency fallback, missing boundary behavior, four-wheel/multi-rate offsets and preceding
event states have regression coverage. No stored-format/cache-version change is needed.

A one-off read-only sweep of six laps (first/middle/last across two Road Atlanta race recordings)
produced identical complete-output hashes. GPS rows crossing into JavaScript fell from 2,271,537 to
83,129 (including bounds/first-time rows). GPS query times fell to 14–28 ms; total extraction across
the sweep fell from 3,152 to 1,878 ms. This is one sequential sweep, not a sustained or cold-disk
benchmark. The bounds aggregate still scans inside DuckDB. Local scripts/results are under
`.cache/profile-gps.mjs` and `.cache/gps-profile-{before,after}.json`; the source recordings and
application database were opened read-only. Full verification passed: 2,570 tests, 56 skipped,
and a warning-free production build.

### Replay recheck implementation — 2026-10-12

Independent Luna review checked bounded edges, legacy/garage behavior, metadata ownership,
DuckDB preparation and worker overlap. Parent review added cancellation cleanup and failure
sharing regressions, removed non-transactional alias repair, and added live-source snapshot
validation. Metadata failure remains fatal before an uncached decode, because loading identity
is required to preserve recordings when filenames are reused. Cached/retained explicit slots
continue to work. No parser/cache version or persisted format changes were needed.

Full verification passed: 2,554 tests, 56 skipped across 303 suites, and a warning-free production
build. The final ownership regression additionally confirms repeated configured/unconfigured
metadata reads do not rewrite unchanged ownership. Endpoint runs used the same dataset/cohort;
the isolated final repeat showed no regression over the harness threshold. See
[endpoint measurements](../../ENDPOINT_BENCHMARKS.md) for timing limits and synthetic work counts.
Unrelated traffic, frontend and Vite edits were preserved; this checkout was not clean at the
start and concurrent work added further changes during verification.

### Second implementation pass — benchmark pace at read time

XML parsing and persistence no longer calculate transient benchmark pace; standalone and worker
parsing return the same unrated facts. Worker benchmark snapshot transport and its setter are
removed. Lap classification marks best-lap conditions without copying benchmark ratings.
JavaScript ratings share `calculateBenchmarkPace` for percentage/delta rounding and categories;
the test-only single-call calculator forwarder is removed. Current-target lookup stays scoped to
each read. No parser-version bump is required because parsed facts and stored fields are unchanged.

Dashboard SQL history ranking/aggregation is unchanged. New regressions cover best percentage
selection across classes (including a slower raw lap winning), layout isolation, deterministic ties,
wet exclusion, percentage/category boundaries, average rounding, and target refresh without XML
reparsing. Detail/card/trend pace, missing-target clearing and standalone/worker parity are covered.
The full suite passed: 2,541 tests, 56 skipped across 302 suites; the production build was clean.
An independent Luna review checked the removal points and dashboard invariants before verification.

The endpoint benchmark completed with five samples on an isolated database snapshot; results
are local-only in `.cache/pace-benchmark-after/latest.md`. The attempted before run failed local
HTTP requests in the restricted sandbox, so there is no valid before/after latency comparison and
no endpoint speed claim. The successful run used local HTTP access. Replay ingestion files were
left to the concurrent optimization work; XML-only branches of the shared file-ingest worker changed.

Independent final review identified a pre-existing rounding difference: SQLite `round` can yield
105.50% where JavaScript `toFixed` yields 105.51% (105.505 seconds against 100 seconds). A boundary
regression deliberately preserves both results. The user specifically requested unchanged dashboard
best-pace behavior, so this pass centralizes JavaScript display ratings but retains SQL history
aggregation and its existing rounding. Unifying those execution paths would be a separate behavior change.

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
