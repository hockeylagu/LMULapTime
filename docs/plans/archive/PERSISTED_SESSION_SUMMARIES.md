# Persisted session summaries and bounded history reads

> Archived completed plan. Reviewed 2026-10-10. The steps, paths, schema snapshots and measurements
> below are historical; do not rerun them as a migration guide. See the [current work queue](../README.md)
> and [code map](../../CODE_MAP.md) for current status.

Status: **completed**, 2026-10-10. Subsequent normalized-row storage supersedes the JSON-backed design below; see [NORMALIZED_SESSION_STORAGE.md](NORMALIZED_SESSION_STORAGE.md). Verification recorded at delivery: Full suite: 2375 passed, 56 skipped;
production build passes without warnings. Coverage passes unchanged thresholds with two workers:
94.00% lines, 91.64% statements, 91.84% functions and 82.81% branches. The default parallel
coverage run exceeded an existing track-enrichment timing assertion; reducing worker contention
passed the unchanged assertion. No end-to-end startup or cold/warm latency distribution was measured.

User decisions during review: normal application navigation and requests are session-first.
Old replay URLs may break; no bookmark compatibility, redirects or legacy endpoint shim is needed.
DuckDB files follow the same ownership model: a session owns its recording and all attached DuckDB
files. Normal application requests never identify or discover a session by a telemetry filename.
DuckDB enhances a native replay trajectory; it is not a standalone driving-line source. The current
reader emits placeholder x/z coordinates, and fusion takes position/orientation from native replay
samples. Full spatial telemetry requires retained or decodable replay trajectory data for that lap.

## Objective and decisions

Make startup and ordinary reads independent of materializing the complete detailed session history.
Compute deterministic per-session facts at ingestion, persist them in SQLite, and query compact rows.
Remove `allSessionsCache` only after every production consumer has a bounded replacement, including
background jobs and the frontend's global history payload.

Use per-session contributions plus SQL aggregation. Do not introduce global lifetime counters,
another in-memory cache, a general event bus, triggers containing domain rules, or a persistent
leaderboard table initially. Replacing one session's contributions is easier to verify than
subtracting its old contribution from every track/driver/day total.

Keep original detailed session JSON for drill-down and rebuilds. Keep existing replay/telemetry
storage, identity protection and worker decoding. Results XMLs remain write-once at their paths.
Normal app DTOs, route state, comparison selections and telemetry requests carry session IDs and
session-scoped driver/lap locators, never replay IDs/names as identity. Recording identity remains
an internal ingestion/storage concern; display filenames may still appear in diagnostics.
Pair-dependent telemetry alignment, corner comparisons and AI narrative remain on demand: their
inputs depend on the selected laps and geometry, so precomputing every possible pair is out of scope.

This needs compact lap facts as well as summaries: arbitrary lap comparison and benchmark-impact
history cannot be reconstructed from a count and average alone. Summary rows are small; the lap
index grows with lap count. Measure its space/index cost rather than promising negligible storage.

## Current dependencies verified in code

| Area | Current full-history dependency | Replacement |
|---|---|---|
| Session lists | `sessionRoutes.filterSessions` and `toSessionListEntry` load all sessions and retain player laps | Indexed paginated session/card queries with explicit summary DTOs |
| Application shell | `useAppData` downloads `/session-snapshot`; `App` passes sessions/progression through routes | Global status/revision only; route-specific data loaders |
| Dashboard | `useDashboardMetrics`/`useDashboardTrends` walk all player laps and history | SQL totals/grouping plus stored driver/session metrics and bounded recent outings |
| Track pages | Track summaries and `/track/:trackName` filter complete history | Canonical-layout queries, aggregate summary and paginated sessions |
| Progression | `computeProgression` recomputes clean average/top-N/consistency | Stored per-driver session metrics, filtered/date-bounded progression queries |
| Leaderboards/rivals | `buildLeaderboard`, `listLeaderboardLayouts`, `playerSessionBests` traverse every driver/lap | Group scoped summary contributions by layout/class/car and driver |
| Comparisons | `extractComparableLaps` loads all matching session details | Filter/page compact lap index; hydrate only selected session/lap details |
| Telemetry requests | `replayRoutes`/`ReplayTrajectoryService` search sessions by replay name | Session-ID requests resolve the session's stored recording relationship directly; no reverse search |
| Ingestion completion | Replay metadata and telemetry completion call `loadSessions`/enrich the entire history | Link candidates and affected-session queries; update only affected owners |
| Status/manual scan | `systemRoutes` calls `loadSessions` for counts/track lists | Scalar counts/distinct layout queries; scan scheduling separated from reading |
| Benchmarks | Refresh/impact reads every session; manual refresh also forces XML reparse | Current-target rating on compact facts, impact queries, no benchmark-triggered XML reparse |

Existing `metadata_json` still contains the nested player driver/laps. New card DTOs must be built
from scalar/summary columns, rather than assuming that reusing this JSON makes list reads bounded.

## Proposed storage

Extend the existing `sessions` row with canonical `layout_key`, normalized session kind,
primary-driver ordinal, emptiness flag and a stored internal recording relationship. Keep existing list identity,
timestamp and source file columns. Resolve layouts with `getCircuitSpecification` at projection
time; never use display names as joins. Unknown layouts stay unknown and unranked across facilities.

Add integer source/projection revisions and projection-rule version to support bounded rebuilds.
Do not use filesystem mtime or millisecond wall-clock timestamps as the change revision.

| Table | Key | Stored facts |
|---|---|---|
| `session_summary_facts` | `session_id` | One compact current-player contribution per session: classified lap counts, distance/time/pits, speed/position/pace inputs, date/layout; reused by dashboard and shared summary reads (projection version 3) |
| `session_driver_summaries` | `(session_id, driver_ordinal)` | Exact driver identity/display name, normalized search identity, player/human flags, canonical class/car; positions; completed/clean lap counts; driving-time sum; pit count; speed maximum; best lap locator/time and sector minima; current progression top-N and consistency outputs; best-lap wet flag and classification state |
| `session_driver_condition_summaries` | `(session_id, driver_ordinal, condition_group)` | Dry/wet clean counts and unrounded timing moments; representative best-lap locator and sector minima; fastest three eligible times/count; enough facts for dry boards and condition-aware queries |
| `session_lap_index` | `(session_id, driver_ordinal, lap_ordinal)` | Original lap number, lap time/sectors, condition, validity/inferred/pit/out flags, domain-computed clean/leaderboard eligibility and non-representative reason; original ordinal gives an unambiguous detail locator |

Use driver/lap ordinals because names and lap numbers are not guaranteed unique within a source.
Preserve current leaderboard driver identity semantics; do not silently merge differently cased
names while adding a normalized search column. Preserve source order for unresolved exact ties.

Start with indexes for session timestamp/ID, layout/class/car/time, driver search, dry/human eligible
board rows, and internal recording ownership for ingestion updates. Verify EXPLAIN QUERY PLAN before adding more. SQL statements remain
parameterized. Avoid copying full detail JSON, incident lists or telemetry into projection tables.
Keep multi-file DuckDB ownership in existing telemetry tables. The canonical ownership is
`telemetry_metadata.matched_session_id`; a session can own zero or many DuckDB files, and an attached
file has one session owner. A replay filename must not be an alternative ownership key at request
time. Preserve or backfill unambiguous existing ownership using the established session-span rules;
leave ambiguous files unattached. Never flatten a session's files into one filename column.

Build projection payloads in a pure deterministic module, using the existing classification,
selection and consistency functions. Store modules own persistence/querying; `db.ts` coordinates.
Suggested boundaries: `shared/domain/sessionSummaries/`, `server/core/sessionSummaries/`, and
matching test folders. Split new schema DDL into a focused module called by `initDbSchema` to
respect file/folder limits. Final filenames can follow the implementation's cohesive boundaries.

## Metric semantics that must stay exact

- Use parser flags and `classifySessionLaps`; never infer out-laps or clean eligibility in SQL.
- Overall average remains every clean lap's average, including dry/wet together. Counts/sums
  combine with weighting; never average session averages. Keep rounding at existing DTO boundaries.
- Preserve progression's top-N behavior with fewer than three eligible laps. Leaderboard top-3
  requires three representative dry laps in one session, then chooses the best such session average.
  It is not the fastest three laps across a driver's entire history.
- Preserve condition-aware consistency: groups with at least three laps, and existing fallback
  to the largest group/dry tie preference. Persist the existing deterministic score for progression;
  retain moments for explicitly defined aggregate queries. Do not average scores into a new metric.
- Boards include real humans, dry representative laps and exactly one layout/class/car scope.
  Best sectors can come from different eligible laps; preserve lap-time/date tie rules and ranks.
- Some comparison records and benchmark-impact counts use a broader valid-lap predicate than
  leaderboard eligibility. Store separate facts; do not apply one universal clean-lap filter.
- Preserve partial/inferred laps, empty-session rules, AI exclusion, primary-driver fallback and
  duplicate names. Freeze expected outputs in differential tests before changing the data path.
- Preserve existing time units/precision. Do not migrate floating-point timings to rounded
  milliseconds as a side effect. Keep missing values NULL rather than zero.

## Write/update lifecycle

Introduce one explicit persistence operation for a classified session plus its projections. Replace
that session's projection rows transactionally with the source update; bump a durable data revision
once the write is complete. Reject stale asynchronous projection results by source revision.

| Trigger | Affected scope | Action |
|---|---|---|
| New XML / successful retry | One session | Parse in worker, finalize current rules on main thread, write source and all contributions atomically |
| Explicit reparse / parser upgrade | Selected sessions still on disk | Replace contributions, never increment historical totals blindly; preserve deleted XML history |
| Replay link added/withdrawn/replaced | Linked/candidate sessions | Persist owner link; reclassify rain-dependent metrics for affected sessions; replace their contributions |
| Replay conditions arrive or upgrade | Sessions linked to that recording | Apply existing condition classifier then replace affected summary/lap rows |
| DuckDB catalog/ownership changes | Affected sessions/files | Match during ingestion, persist session ownership and update affected availability revisions; do not recompute driving metrics unnecessarily |
| Summary/domain rule version changes | Outdated projections | Rebuild from retained detailed JSON in bounded batches; do not require original XML/VCR |
| Session deletion / parsed-cache clear | Removed session IDs | Remove associated projection rows in the same transaction; preserve replay archives and rival user state |
| Benchmark refresh | Matching layout/classes and history impacts | Update targets/revision; compute dependent ratings/impacts from compact rows, without reparsing XML |

Linking must also scale: select candidates using canonical layout, session code and time-window
fields, then run existing matching rules on the small candidate set. Preserve rejected links,
one-session-per-replay enforcement and archive identities. Persist enough driver/timing facts for
DuckDB matching, including XML end mtime. Remove request-time whole-history enrichment.

Matching runs during ingestion/reconciliation, never to rediscover a session on a normal telemetry
request. Unmatched recordings remain internally retained but do not create a replay-centric browse
or telemetry route. Session IDs do not replace recording identity in archival storage: filename
collisions and rejected/withdrawn links still need independent recording identity. Linking a new
recording updates the relationship; it must not change the session's identity.

Apply the same boundary to DuckDB: discover/version-check/match files during ingestion, then persist
their session attachments. A session telemetry request enumerates its attached files and selects
the file containing the requested lap's timestamp range, preserving multi-stint ownership. It does
not fall back to replay-owned files, filename matching or a whole-library search. Unmatched files
remain internally discoverable for later reconciliation, without a separate telemetry-file route
for normal navigation. Internal file identity and mtime/size checks still protect growing or replaced
DuckDB sources. Missing disk files may still serve retained lap data under their existing ownership.
Ownership and capability are separate: a DuckDB file can be attached before its replay is available,
but it cannot enable the spatial telemetry studio alone. A retained SQLite replay trajectory is
sufficient even after LMU deletes the VCR file. Never render DuckDB placeholder coordinates as a
driving line or substitute a circuit centerline for the recorded path. A channels-only viewer would
be a separate future feature and is not part of this migration.

Do not make every source update rebuild every leaderboard. SQL grouping of compact per-session
rows handles removing former bests, replacing classifications and changing filters correctly.

## Benchmark-dependent values

Keep physical lap facts independent of benchmark versions. Prefer joining current targets and
applying the shared deterministic rating helper to selected DTOs/compact aggregates. Session detail
can rate the one requested session at read time; it must ignore stale ratings embedded in historical
JSON and preserve the wet-best suppression rule without inventing a second classifier.

Remove full-history JSON rewrites and `loadSessions(true, true)` from benchmark refresh after parity
is proven. Historical diff impacts compare each diff's old/new targets against indexed player lap
facts using the current impact rule; preserve counts, exact sample ordering and the stored sample
limit. Formula reuse/parity tests are required if arithmetic is expressed in SQL.

## API/client changes

- `/api/status` and `/scan/status`: counts, persistent revision and rebuild progress only.
- `/api/sessions`: filters, validated sort, page/pageSize, total count and bounded card DTOs. Retain
  numbered URL pages (25 rows) initially; OFFSET at 10k sessions is reasonable with a suitable index.
  Do not introduce cursor navigation unless measured deep-page cost warrants it.
- Add focused dashboard/track-summary endpoints with grouped totals and bounded recent data.
  Return filter options from small DISTINCT queries so dropdowns no longer depend on all sessions.
- `/api/progression`: stored metrics for explicit layout/class/driver/date scope; bounded raw points.
  Large ranges require an explicit bucketed contract preserving extrema, not silently dropping data.
- `/api/leaderboard`/rivals: same visible contract, queries over scoped compact contributions.
  Rank the complete scoped board before paginating it; persist only rival choices, not request ranks.
- `/api/compare/laps`: filter/page lap-index rows and return separate exact best/sector aggregates.
  Hydrate full ComparableLap fields only for the bounded result page/selected laps, with one detail
  read per distinct selected session. Add indexes if page hydration remains a bottleneck.
- `/api/session/:id`: load one retained JSON row and attach read-time pit/availability details to
  that request's object. Session-scoped telemetry endpoints (for example
  `/api/session/:id/telemetry` and `/api/session/:id/telemetry/metadata`) resolve the stored recording
  and session-owned DuckDB attachments directly. Driver locators map to native replay slots
  internally; DuckDB lap reads select among the same session's attached files by timestamp coverage.
  Native VCR data can serve on its own; valid attached player DuckDB data enhances its channels.
  If no correctly linked retained/decodable native trajectory exists for the requested driver/lap,
  spatial telemetry is unavailable even when DuckDB files exist. It never searches for a different
  session/recording/file while serving the request. Launch availability follows these capabilities,
  rather than treating the presence of a DuckDB attachment as sufficient.
- Remove replay IDs/names from client telemetry URLs, comparison candidate identity, navigation
  helpers and normal API request parameters/DTOs. A comparison carries both session IDs and their
  driver/lap locators. Preserve filename text only where it is useful diagnostic information.
  Remove old replay-centric endpoints/URL parsers without redirects or backward compatibility.
  Recording maintenance endpoints may remain internal to Settings, without driving app navigation.
- Replace `/session-snapshot` and global sessions/progression state. `useAppData` keeps status,
  scan polling and revisions; each route loads what it displays and refreshes only its mounted data.
  `App`, dashboard, tracks, session navigation, pickers and debrief loaders must migrate together.

Read each response's counts/data/revision in one short SQLite read transaction. Requests that span
multiple endpoints include revision stamps; the client retries obsolete combinations and preserves
current selections/page on refresh. Never hold a transaction across worker/network awaits.

## Backfill and recovery

Additive schema first. Backfill retained session JSON one session or a small configurable batch at a
time, yielding between batches. Start with a conservative 10-session batch and tune to measured
event-loop delay. Memory is bounded by the current batch, not 10k details. Persist per-session
projection version/source revision atomically; restart queries select missing/stale rows.

Normal ingestion and backfill share the same write operation. A source update wins over stale
backfill work. Deleted XMLs/VCRs are supported from retained JSON/facts. Failed batches retain old
valid rows and a retryable failure; do not advance completion markers after failed writes.

The first launch after this migration rebuilds projections from retained JSON in ten-session batches.
While a required rebuild is incomplete, history aggregate endpoints return 503 with an explicit
preparation message and scan status exposes progress; single-session detail remains available.
Subsequent normal startups serve ready summaries immediately while discovery continues. Incompatible
projection versions are rebuilt rather than served together. End-to-end first-launch duration has
not been measured.

## Implementation verification

The focused scalability fixture uses an in-memory SQLite database and synthetic data only. It inserts
10,000 sessions for one driver with 20 lap facts each (200,000 laps), then exercises the production
session page, dashboard, leaderboard, layout-list and track-summary query functions. Returned session
cards and leaderboard DTOs contain no lap-history arrays. The measurements below are an observational
single run on the implementation host, not performance guarantees:

| Query | Time | Serialized payload |
|---|---:|---:|
| First 25 session cards | 5.4 ms | 21,874 B |
| Dashboard (25 cards plus metrics) | 304.1 ms | 24,696 B |
| LMH leaderboard | 74.9 ms | 1,180 B |
| Leaderboard layout list | 26.2 ms | Not measured |
| Monza track summary | 171.2 ms | Not measured |
| Comparison page 2 (5 laps) | 396.5 ms | 5,614 B |

The in-memory database occupied 130,129,920 B after detailed source rows, and 174,034,944 B after
adding projections and indexes: a 43,905,024 B (about 4.4 KB/session, including lap facts) increment
for this fixture. `EXPLAIN QUERY PLAN` confirmed `idx_sessions_layout_timestamp` for the session
page and the session timestamp index plus the condition-summary primary-key index for the grouped
leaderboard query. The comparison page returned five laps and hydrated one distinct session, within
the page-size-plus-three-best-locators bound. Its count/special-best work still scans broad candidate
lap facts and remains a follow-up optimization target. Best-lap and sector aggregates use condition
summaries; page-local personal-best lookups use partial lap indexes. Dashboard and comparison timing exceed the proposed 200 ms
target; grouped leaderboard and track-summary reads fall below it in this run. These are
single-run optimization signals, not latency guarantees. Query tests assert bounded result shape
and query-plan paths, not timing thresholds.

A follow-up statement profile on the same synthetic fixture measured 313 ms dashboard and
388 ms comparison totals. Dashboard costs included repeated distance aggregates (88 ms combined),
benchmark totals/ranking (82 ms), recent pace selection (43 ms), and latest/day selection (70 ms).
These repeatedly join session summaries, extract JSON scalars, and order or group historical rows.
Comparison spent 142 ms finding page-driver personal bests, 110 ms finding the overall valid best,
and 65 ms counting candidate laps. Fetching the five page rows itself took 0.17 ms. Only one
detailed session was hydrated. The priority is reducing repeated history-wide scans/sorts and
moving frequently filtered JSON fields to indexed scalar columns, rather than caching full histories.

Differential tests compare leaderboard entries, sector/top-three ranks, layout summaries and
player-session bests against the deterministic shared-domain builders, including competition-rank
ties and same-name driver stints. Dashboard metrics are compared against existing dashboard
builders, and benchmark-impact/dashboard fixture regressions are covered by focused tests.

## Delivery sequence and review gates

### Shared session aggregates (2026-10-10)

Projection version 3 adds `session_summary_facts`, one compact row for each session with its current
player's contributions. It reuses the existing driver and lap projections at ingestion time: completed
and declared laps, clean laps, driving seconds, pit count, maximum speed, position gain, best-lap and
sector inputs, consistency, distance and session date/layout. This table deliberately stays separate
from large source/card JSON rows so history scans read only scalar facts. Sessions without a player
contribute zero driver figures. A failed projection retains a zero-player row for session counts.

`persistSessionProjection` publishes source revisions, cards, driver/lap rows and shared facts in the
same transaction. Reparses and replay rain reclassification replace the affected row; no additive
counter can double-count a session. The existing bounded backfill rebuilds version-two rows from
retained source JSON, without disk XML reads. Formula changes bump the projection version again.
Benchmark percentages remain read-time calculations against current targets.

Dashboard global totals, per-track/car totals, latest/day selection, recent pace and recent lap counts
read shared facts. Track queries use the stored event timestamp, sectors and length; progression uses
the persisted date while retaining per-driver aggregates for explicit alternate-driver selection.
Distance now uses a stored REAL value, correcting the previous SQL integer-division truncation of
fractional kilometres. Existing unknown-length estimates remain 5 km/lap for totals and 4.5 km/lap
for the activity card; neither estimate represents measured distance.

On the existing synthetic 10,000-session / 200,000-lap fixture, a single observational run measured
49.5 ms for the dashboard (previously 304–313 ms), 7.2 ms for 25 session cards, 162.6 ms for a track
summary and 419.4 ms for comparison candidates. Only the dashboard storage/read path is materially
changed; comparison still needs separate work. These are query timings, not end-to-end browser
latencies or guarantees. Optional `LMU_PROFILE_SUMMARIES=<output-json-path>` writes the scale test's
timing report for repeatable local measurements. Regression tests cover player identity, missing
track lengths/dates, bounded migration, rollback and replay-condition updates.

Verified after this change: 2400 tests passed, 56 skipped; clean production build. Unchanged coverage
thresholds pass with two workers: 94.12% lines, 91.77% statements, 91.94% functions, 82.97% branches.

1. **Baseline and parity fixtures.** Enumerate all current metrics/DTO/filter rules and every
   `getAllSessions`/`loadSessions` caller; record 1k/10k read latency, memory, payload and DB sizes.
   Use synthetic data and read-only personal measurements, never mutate the user's library.
2. **Pure builders, additive tables, transactional writes.** Wire every session mutation path;
   differential-test projection metrics against current functions and backfill bounded batches.
3. **Compact reads first.** Migrate status, session-scoped recording access, counts, filters, session cards,
   progression, dashboard and track summaries. Check query plans and payloads. Serve new and old
   computations side-by-side in tests only, not as a permanent compatibility layer.
4. **Leaderboard/rivals/comparison.** Preserve exact eligibility, top-3 and tie semantics; query
   compact facts, rank before paging, hydrate only selected details.
5. **Ingestion linking and benchmarks.** Eliminate remaining background full-history reads,
   enrichment and pace rewrites. Test arrival order, withdrawals, archives and stale workers.
6. **Client cutover and cache removal.** Switch route loaders and remove global history payload,
   `allSessionsCache`, identity-based enrichment/ribbon memoization, and side-effecting `loadSessions`.
   Remove client replay identity and reverse session finding, and delete old replay URL/API contracts.
   Remove full-history production helper exports or restrict explicit offline tooling to a streamed
   iterator. Separate scheduling scans from reading data. No legacy shim remains at completion.
7. **Scale/recovery validation and documentation.** Verify fresh/migrated/deleted-source databases,
   interrupted rebuild recovery, 10k-session workloads and startup behavior. Update CODE_MAP,
   cache audit and cache/version recipes. Run full tests/build with zero warnings at each code gate.

## Acceptance criteria

- Routine status/list/dashboard/board reads do not select session `data_json` or invoke the legacy
  whole-history loader. A single detail read loads one source JSON; compare hydration is page-bounded.
- Normal navigation/telemetry/comparison requests identify sessions, never recordings or DuckDB files. No request
  performs replay-to-session discovery. Source matching and archive identity remain confined to
  ingestion/storage; old replay URLs are deliberately unsupported.
- DuckDB ownership is session-first and one-to-many. Reads never resolve ownership through a replay
  name; multi-file lap timestamp selection and retained telemetry for missing disk files remain intact.
- DuckDB-only attachments never enable a fabricated driving line. Spatial telemetry works with a
  correctly linked native trajectory retained in SQLite even if the original VCR has been deleted.
- Routine startup does not materialize all detailed sessions. Backfill memory is batch-bounded;
  route memory/payload is proportional to page/result size, rather than total history.
- All existing deterministic results match fixtures, including rounding, ties, condition transitions,
  AI exclusion, layouts, incomplete laps and deleted-source retention.
- Repeating sync/rebuild produces identical rows/counts. Failed transactions and out-of-order workers
  cannot double-count or publish stale summaries. Source and projections share a revision boundary.
- 10k synthetic sessions cover realistic driver/lap counts and empty/long/multistint sessions, not
  just 10k tiny metadata records. Record added DB space and index cost per session/lap.
- Proposed local performance budgets (validate on the same machine): warmed status under 50 ms,
  first 25-row list under 100 ms, scoped dashboard/board under 200 ms at 10k sessions. Report cold
  and warm p50/p95 and memory separately; tune from evidence, not as guaranteed hardware-independent SLAs.
- Benchmarks changing no longer force XML reparsing or rewrite every detailed session JSON.
- Tests/build pass; source/component/folder limits hold. No full-detail memory cache is reintroduced
  to mask an unbounded query. Small lookup indexes and in-flight work sharing remain allowed.
