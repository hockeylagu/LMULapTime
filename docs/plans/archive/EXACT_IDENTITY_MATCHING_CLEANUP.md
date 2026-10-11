# Exact identity matching cleanup

- **Status:** Completed; independently reviewed, validated and committed with the implementation.
- **Reviewed:** 2026-10-11, after canonical car classes commit `2d69c57a` and subsequent schema/Fuji cleanup through `d479be23`.
- **Scope:** Remove ambiguous identity matching, repeated internal normalization and trivial matching wrappers found in the follow-up audit.
- **Dependencies:** Existing canonical circuit definitions, normalized session storage, driver ordinals, replay slots and persisted telemetry ownership. Preserve subsequent work on those systems.
- **Next step:** Optional live browser/game acceptance; automated validation is complete.
- **Completion gate:** Exact identities determine all affected lookups; missing or ambiguous identities never select another entity; meaningful domain constraints remain; stored associations are reconciled; tests and build finish without warnings or errors.

## Objective and limits

Use canonical values directly inside the application. Convert external representations once where
they enter the system. A function should remain only when it implements a real domain decision,
such as selecting session participants, enforcing layout/time constraints or resolving ownership.

The canonical car class work is already committed. Do not reopen aliases, add route compatibility,
infer a class from a car model or add another normalization layer. Existing routes should receive
the canonical values produced by the application. This plan addresses the additional audit findings.

Do not replace the removed functions with a generic matcher, alias registry, pass-through adapter
or new circuit lookup wrapper. Call `getCircuitSpecification` directly wherever resolution is needed.
Do not change lap classification, timing, replay binary decoding mechanics or detailed geometry.

## Findings and intended decisions

| Finding | Evidence from the audit | Intended result |
|---|---|---|
| Session ID aliases can select another row | In-memory reproduction: `target` resolves to `other-session` when its filename is `target.xml`, despite an exact `target` ID existing | Only `sessions.id` identifies a session; filenames remain file metadata |
| Track substring matching accepts absent or partial identity | Reproduction: `matchesTrack('Custom Ring', '', '')` returns true; unknown-track SQL uses bidirectional substring matching | Known layouts compare canonical layout keys; unknown layouts compare complete explicit identity |
| Session name overrides an authoritative type | Reproduction: Practice with name `Race preparation` matches Race | Canonical session type controls internal filtering and grouping |
| Driver name substrings can select a different person | Source review: parser, telemetry owner selection, PB fallback and replay slot selection accept partial names; replay decoder can choose the first driver | Use source IDs/ordinals/slots internally and a unique exact mapping across sources; unresolved requests remain unresolved |
| Telemetry wrappers add no behavior | `matchDuckDbToSession` and `matchDuckDbToReplay` only unwrap `find...` results; callers are tests | Remove wrappers and test the production entry points |
| Car model equality is duplicated | `sameCar` exists in leaderboard and reference-lap logic | Review source guarantees first; use direct equality only where model identity is proven canonical |

The first three examples were reproduced during the audit. Driver findings are source-reviewed
failure paths, not claims that a particular user's recording has already been misattributed.

## Identity contracts to establish before editing consumers

| Entity | Internal identity | Boundary handling | Missing/ambiguous behavior |
|---|---|---|---|
| Session | Exact stored session ID | Parse route structure without rewriting the ID | Existing not-found response; no filename lookup or extension stripping |
| Known track layout | Canonical `layoutKey` | Resolve raw venue/course/recorded scene directly through circuit specifications | No substitution of another layout at the same facility |
| Unknown track layout | Exact venue and course pair | Preserve explicit source fields; do not concatenate into an ambiguous display label | Empty venue is not an identity; a missing course must not stand for every course |
| Session type | Existing Practice / Qualifying / Race / Unknown contract, with warmup policy made explicit | Convert external XML nodes and recording codes once | Unknown stays unknown; display name cannot override a known type |
| Session driver | Session ID plus driver ordinal; dictionary identity where applicable | Resolve configured/raw names uniquely against the source roster | No substring, first-row or empty-name match |
| Replay driver | Replay identity plus recorded slot | Explicit, unique roster mapping from the requested session driver | Do not substitute player or another slot for an unresolved explicit request |
| Car class | Existing canonical class string | Existing ingestion conversion only | Preserve existing deliberate unknown-class policy |

An unknown track pair with an explicitly empty course may match the same exact pair, provided its
venue is present. It must not match a pair with a different or populated course. Known and unknown
identities must not be joined by a fuzzy name fallback. User-facing labels are presentation values.

Driver names are not globally unique IDs. If an external file provides only a name, allow only the
minimal boundary cleanup justified by actual source formatting, followed by an exact, unique roster
match. Do not collapse distinct dictionary entries through a new global normalized name key.

## Phase 1 — Exact session IDs

**Files:** `server/core/dbSessionStore.ts`, `server/routes/sessionRoutes.ts`,
`server/routes/replayRoutes.ts`, `server/core/sessionRows/replayContext.ts` and their callers.

1. Inventory `resolveSessionId` callers and confirm application links already carry stored IDs.
2. Replace the OR query across IDs and filenames with exact `sessions.id = ?` lookup.
3. Remove `resolveSessionId` if it becomes a trivial forwarder; callers should use the appropriate
   existing store read or direct exact query rather than adding a replacement wrapper.
4. Remove `.xml` stripping/addition and filename route aliases. A literal stored ID ending in
   `.xml` is still valid and must be looked up verbatim.
5. Preserve current endpoint response shapes and not-found handling.

**Regression coverage:** Extend `test/server/core/sessionRows/rowReads.test.ts` and route tests.
Cover the filename collision in both insertion orders, exact IDs containing `.xml`, missing IDs,
and rejection of `a.xml` when only ID `a` exists. Update the old alias expectation explicitly.

**Done when:** Exact lookup always wins because it is the only identity lookup; normal navigation
works and legacy filename URLs return not found. No data migration is needed for this phase.

## Phase 2 — Canonical session types

**Files:** `shared/domain/formatters.ts`, `shared/domain/weekendSessions.ts`,
`shared/types/session.ts`, `server/sessions/parser.ts`, summary projection/dashboard queries,
`src/components/leaderboard/picker/lapPickerModel.ts` and `ReplayCompareLapPicker.tsx`.

1. Inventory type producers and every `matchesSessionType`, `getSessionTypeWeight`,
   `getSessionTypeSortRank`, `detectRaceType` and `matchesRaceType` consumer.
2. Document existing XML and replay/DuckDB warmup/test behavior. Keep source session code and
   ordinal (for example P1 versus P2) separate from the broad Practice category.
3. Make producer contracts explicit using the existing canonical session type union where possible.
   Decide the warmup representation at the boundary; preserve deliberate display/order behavior
   without repeatedly inferring type from names. Unknown must not become Practice by default.
4. Replace internal name/type guesses with equality or explicit category/order mappings. Remove
   `matchesSessionType` and the trivial picker wrapper after migrating their callers.
5. Keep meaningful sorting logic if it combines type order and session ordinal. Derive it from
   authoritative fields rather than a second free-text classifier.
6. Align persisted summary kinds, weekend grouping, dashboard counts and both lap pickers.

**Regression coverage:** Extend formatters, parser, picker and summary tests; add weekend tests in
the mirrored domain location if needed. Cover Practice named `Race preparation`, Practice named
`Qualifying preparation`, unknown types, warmup/test policy, P1/P2 ordering and Race/Qualifying
dashboard counts. Session names remain visible but do not change canonical type.

**Done when:** All internal type consumers agree without name inference. External session-code
conversion remains at ingestion/matching boundaries and retains ordinals needed for ownership.

## Phase 3 — Exact layout scope in memory and SQL

**Files:** `shared/domain/paceCategory.ts`, `shared/domain/weekendSessions.ts`,
`server/core/sessionSummaries/comparisonQueries.ts`, `trackQueries.ts`,
`server/sessions/sessionAnalytics.ts`, `replayMatching.ts`,
`server/telemetry/telemetryMatcher.ts`, `server/benchmarks/benchmarkImpact.ts`, dashboard/progression consumers.

1. Inventory `matchesTrack` and `matchingTrackEntries` consumers and distinguish explicit user
   search from identity filtering. Keep the All sentinel at the filter boundary only.
2. Carry canonical layout keys through internal contracts that already know the selected layout.
   Carry venue/course separately for unknown layouts. Update route producers and consumers together;
   do not preserve old display-label parameters through fallback parsing.
3. Replace fuzzy layout comparison with key equality. For raw records, resolve directly with
   `getCircuitSpecification`; compare unknown venue/course pairs exactly when neither resolves.
4. Remove bidirectional substring matching and punctuation squashing from unknown-track identity.
   Remove `normalizedSql` if no remaining legitimate consumer needs it. Use parameterized equality
   in comparison and track aggregates, with identical scope to the in-memory implementation.
5. Remove custom-track display-label aliases in `customTrackScope`; labels must not broaden scope
   to every course at a venue. Retain a SQL fragment helper only if it adds meaningful query logic.
6. Make benchmark entry selection exact; unknown or missing track identity must not choose the
   first, longest or otherwise convenient benchmark entry.
7. Preserve replay recorded-scene precedence over replay filename labels. Keep strict timestamps
   and layout constraints; remove fallback substring venue/course guesses.
8. Handle venue-only telemetry explicitly: a venue cannot prove a layout. Resolve ownership only
   when other trusted constraints identify one layout unambiguously; otherwise leave it unmatched.
   Do not resolve a venue to its default layout and treat that as recorded evidence.
9. Remove `matchesTrack` if its remaining purpose is only equality; keep weekend/replay predicates
   where they still combine real domain constraints. Do not add a circuit resolution shim.

**Regression coverage:** Extend pace category, comparison SQL, track queries, analytics, benchmark,
replay and telemetry tests. Test every multi-layout facility in the definitions with representative
cross-layout pairs, including Fuji variants; exact unknown pairs; empty fields; partial names;
punctuation collisions; known-versus-unknown identities; and SQL/in-memory parity.
Add a venue-only telemetry case with two otherwise plausible layouts and require no attachment.

**Done when:** Track records, PBs, benchmarks, trajectories and candidate counts never cross layouts.
Exact unknown identities remain usable without fuzzy alias support. Real text search still works.

## Phase 4 — Exact driver selection and explicit unresolved state

**Files:** `server/sessions/parser.ts`, `server/telemetry/telemetryMatcher.ts`,
`server/replay/replayRecordingService.ts`, `replayTrajectoryService.ts`,
`server/replay/decode/replayTrajectory.ts`, and `src/components/session-detail/useSessionDetailData.ts`.

1. Inventory every name match used for player selection, telemetry ownership, PB selection and
   replay slot selection. Keep session ordinals and replay slots as distinct identity spaces.
2. In the XML parser, use a unique trustworthy source player flag, then a unique exact configured
   name when source evidence is absent. Conflicting or duplicate source candidates stay unresolved.
   Assign the selected driver's player flag by ordinal/reference, not by name equality.
3. Remove first-driver substitution when no player is identified. Audit `playerDriver`, primary
   driver and UI contracts together: an explicitly displayed primary participant may remain useful,
   but it must not silently become the configured player's PB or telemetry owner.
4. Map external telemetry names exactly and uniquely within the roster. Empty names and substrings
   such as Ann/Joann must not establish ownership. Preserve span windows and multi-file sessions.
5. Resolve replay slots uniquely. Explicit slot/name requests must return the existing unavailable
   or error result when unresolved; never fall through to player, first roster entry or first points.
6. Allow default replay-player selection only when no explicit driver was requested and a trustworthy
   unique player identity exists. Keep empty trajectories empty when that driver has no points.
7. Audit cache keys and primary trajectory reads so a failed slot resolution cannot reuse another
   driver's cached trajectory. Test service, worker result and cache behavior together.
8. Inventory the initial-progression PB branch in `useSessionDetailData.ts`. Prefer removing the
   duplicate PB algorithm and using the existing server PB endpoint keyed by session/driver ordinal.
   If a retained caller needs preloaded data, give it the same authoritative result contract rather
   than preserving a name-based fallback. Update props/callers together.

**Regression coverage:** Parser and telemetry tests plus replay service/worker tests and session
detail data tests. Cover Ann/Joann in both roster orders, an exact name after a partial name,
duplicate exact names, conflicting player flags, absent configured player, blank names, invalid slot,
requested driver with no points, multiple replay slots and cached primary data for a different driver.
Verify valid explicit driver requests and multi-file telemetry still work.

**Done when:** An unresolved identity produces an honest unavailable state. A request for one driver
cannot return another driver's lap, PB, metadata or trajectory. Worker-thread decoding remains intact.

## Phase 5 — Delete redundant wrappers and review remaining equality

1. Remove `matchDuckDbToSession` and `matchDuckDbToReplay` from
   `server/telemetry/telemetryMatcher.ts`. Migrate their tests to `findDuckDbForSession` and
   `findDuckDbForReplay`, asserting file, timing delta and unmatched behavior where meaningful.
2. Verify removed matching helpers have no remaining exports, imports, tests or documentation
   recommending them. Do not retain a test-only compatibility export.
3. Review `sameCar` in `shared/domain/leaderboard.ts` and `src/utils/referenceLaps.ts` against all
   model producers. If all relevant values already share an exact identity, replace with equality.
   If source formatting differs, handle that once at the real source boundary in a separate focused
   change; do not invent model aliases or bundle a speculative vehicle registry into this cleanup.
4. Record a deliberate retain/remove decision for each audited helper in the completion notes.

**Keep deliberately:** `matchesSessionCarClass` while it implements player/participant/All selection;
external car class conversion; time-window and ownership decisions; canonical circuit resolution;
and explicit unknown-class comparability policy in `areComparableCarClasses`.
Keep substring matching used for actual user text search. Keep external session-code conversion
where different source representations need it. Removing every function named match is not a goal.

## Phase 6 — Reconcile persisted data and derived results

Implement each necessary invalidation with the phase that changes its semantics, so intermediate
commits cannot ship new rules while continuing to serve stale ownership or projections.

| Stored result | Required action |
|---|---|
| Parsed session/player/type fields | Bump the current `DB_PARSER_VERSION` when those rules change; reuse the existing one-time reparse path |
| Session summary kinds/layout/player facts | Bump `SESSION_SUMMARY_PROJECTION_VERSION` when derived meaning changes; verify bounded rebuild behavior |
| Telemetry ownership | Bump `TELEMETRY_LINK_RULE`; clear/redecide through the existing reset lifecycle and invalidate affected derived link state |
| Session-to-replay links | Re-evaluate existing links under strict layout/driver/time rules; withdraw invalid links through `dbReplayLinkStore.ts` and preserve withdrawal reasons |
| Replay matching projection | Bump `REPLAY_MATCHING_PROJECTION_VERSION` only if persisted projected fields/meaning change; this alone does not reconcile existing links |
| Replay trajectories/metadata | Inspect slot-keyed versus primary/default entries; invalidate affected wrong-owner cache entries, avoiding a full binary re-decode unless cached semantics require it |
| Benchmark impact history | Bump `BENCHMARK_IMPACT_RULE` if exact track scope changes stored impact results; reuse existing history/latest refresh |

Version values listed in source are a baseline, not reserved next values. Read current versions when
implementing and coordinate increments across the change. Do not undo the newer Fuji/schema work.
Do not add compatibility migrations for old route parameters or revive deleted legacy cache schemas.

Use isolated SQLite fixtures for lifecycle tests. Verify a stale incorrect link is removed, a valid
link survives or is deterministically restored, repeated startup is idempotent and an ambiguous
candidate remains unmatched. Standard scans must continue to skip already stored immutable XMLs;
do not add per-read reparsing or fingerprint checks. Do not clear the user's real cache to test this.

## Delivery order and verification

Use separate reviewable commits, in this order: exact session IDs; canonical session types; exact
track scope; exact driver selection; residual wrapper cleanup. Pair persisted invalidation and
regression tests with each relevant commit. Phase 5 can accompany an owning phase when the diff
remains small. Review the integrated reconciliation behavior before declaring completion.

Before API-affecting implementation, run `npm run benchmark:endpoints` and retain the baseline.
Run focused existing test files while editing; add regressions for wrong-entity selection and
ambiguity, rather than tests that merely reproduce helper implementation details.

Final checks:

- Run `npm test` and `npm run build`, with zero warnings/errors. Run coverage where shared domain
  changes affect enforced coverage; never lower thresholds.
- Run `npm run benchmark:endpoints` again on the same dataset/configuration and review results
  in `docs/ENDPOINT_BENCHMARKS.md`; investigate material regressions and confirm changed counts
  reflect the intended scope correction rather than missing valid data.
- Search for removed helper names and identity-related substring/name-inference paths; inspect
  remaining hits and document why real text search or boundary conversion remains justified.
- Verify normal session navigation, track filters, both lap pickers, session PBs, weekend links and
  explicit replay-driver selection. Use real recordings when available; label missing live validation.
- Check source/component line limits, directory counts, strict types and direct imports.
- Update current contracts in `docs/CODE_MAP.md` and applicable format/API docs. Record actual
  results here, archive the completed plan and update the plans index.

## Implementation handoff — 2026-10-11

The source changes and focused regressions are in the shared working tree, uncommitted for parent
review. Exact session IDs, canonical session-type filtering, exact known-layout/unknown venue-course
identity, ordinal-based driver selection, unique cross-roster replay/telemetry ownership, and the
redundant DuckDB matching wrappers have been addressed. Player-only telemetry with a named file now
requires an exact unique trusted player identity on the session or replay; a present blank name is
unmatched. Unknown custom courses are carried as separate venue/course values through dashboard,
progression and comparison filters.

Persisted effects are covered by versioned reconciliation: telemetry ownership uses the new rule
version, replay links are fully rechecked under the new predicates, replay default pointers and
literal `driver_slot = -1` trajectories are invalidated while explicit slots remain, and cached
replay metadata is repaired only when exact configured-player ownership changes. The parser and
summary projection versions were reviewed against their stored meanings; no broad binary replay
re-decode was added.

Focused verification run by the implementation agent: 146 tests passed across 13 telemetry,
layout, replay-link, summary-query, dashboard, pace and session-detail suites. An earlier focused
run exposed three hook-test mocks that treated the personal-best endpoint as the session endpoint;
those mocks now match the exact session URL. `npx tsc --noEmit` passed after the corrections.
Parent independent review, full `npm test`, `npm run build`, and the after
endpoint benchmark remain pending. No live browser/game validation was performed, and no real cache
was cleared. The previously captured benchmark is baseline-only until an equivalent after run is
reviewed.

The audited `sameCar` comparisons remain in leaderboard/reference-lap code because this cleanup did
not establish that all incoming car-model strings share a canonical exact representation. This is
an explicit follow-up contract question; no additional model normalizer or alias table was added.

## Independent validation and outcome — 2026-10-11

Luna implemented the cleanup. Parent review additionally repaired every track-summary/session-header
navigation path to retain the exact custom venue/course tuple, removed the session writer's first-name
fallback, removed a dead replay-slot fallback, and added startup/configuration reconciliation for all
retained replay metadata. The reconciliation updates ownership only when the configured identity
changes, clears stale player lap summaries, and preserves explicit-slot recordings. Its regression
tests cover duplicate names, configuration changes and idempotence without source VCR reads.
Replay matching projection version 2 rebuilds old compact facts with the custom tuple. The final
telemetry rule is `session-span-exact-identity-player-v5`; uniqueness is checked in the matcher once.

- Final `npm test`: 287 files passed, 5 skipped; **2,484 tests passed, 56 skipped**, zero warnings/errors.
- Final `npm run build`: passed, zero warnings/errors; strict TypeScript checks passed.
- `npm run test:coverage`: passed all thresholds: **94.84% lines, 92.53% statements,
  92.78% functions, 83.66% branches**. That full run passed 2,482 tests; the two subsequent
  custom-course navigation and benchmark-readiness regressions passed in the final ordinary suite.
- Final focused regression run after removing redundant candidate-side name validation: 44 passed.
- `git diff --check`, changed source/component line limits and touched-directory file limits passed.
- Removed helpers have no source callers: `resolveSessionId`, `matchesSessionType`,
  `matchDuckDbToSession`, `matchDuckDbToReplay`, and `matchCarClass`.
- `matchesSessionCarClass` remains because it implements participant/player/All scope. Track matching
  retains canonical layout resolution and exact custom tuples. Name/filename substring search remains
  only where the caller deliberately requests a text filter. Car-model `sameCar` stays deferred as above.

Endpoint evidence: baseline `2026-10-11T05-22-40.838Z.json`, final
`2026-10-11T06-11-12.384Z.json`,
20 warm samples, identical dataset hash `329dd3acf8ea923c8bc2ae0270715675d77579077b9c8ed1d07d815a2741d9df`
and fixed cohort. All measured requests succeeded, with no skipped cases or material regressions.
Representative medians: dashboard 12.61 → 12.16 ms, tracks 9.36 → 8.73 ms,
comparison player/all 20.35/21.20 → 19.42/20.48 ms, session detail
85.70/70.91 → 81.26/62.99 ms, automatic telemetry 162.91 → 168.99 ms.
Dashboard/track payloads grow because they now carry identity fields; cached telemetry point counts,
comparison and session-detail payload sizes remain unchanged.

The initial after attempt exposed stale summary versions in the benchmark harness (503 readiness
responses). The harness now rebuilds only its isolated copy before timing and stops on rebuild errors;
an isolated-file regression confirms the source remains unchanged. A second timing run overlapped
the full test suite and was discarded for performance comparison; the final repeat ran without tests.
The implementation agent's earlier manual dev-server baseline attempt refreshed 996 existing XML
rows (no additions), as reported during the task. The benchmark comparisons above use the resulting
identical baseline/final snapshot; no real cache was cleared. No live browser/game validation was run.
