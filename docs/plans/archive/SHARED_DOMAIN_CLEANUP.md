# Shared domain cleanup

Status: Completed. Reviewed: 2026-10-11.

The user authorized Luna to implement the shared-domain audit fixes and the parent agent to review the completed patch.

## Scope and sequence

1. Remove the session-summary pass-through barrel, circuit-definition re-exports and trivial layout resolver wrapper. Update every caller to the defining module or canonical resolver.
2. Reuse one clean-lap selection per driver for projection metrics, use constant-time membership, append condition times without growing-array copies, and assemble projection arrays once. Preserve lap exclusions, condition grouping, rounding and stored projection values.
3. Compute class-rival fallback only when same-car rivals are absent. Consolidate lap-position rules without introducing repeated full-index computation.
4. Traverse weekend candidates once, supporting one-shot iterables. Honor the empty-venue option after class filtering. Require explicit canonical station metadata for geometry-dependent comparisons.
5. Add regressions for changed behavior, update affected fixtures and document the final architecture. Preserve unrelated working-tree edits.
6. Parent agent independently reviews the final diff, checks consumers and edge cases, requests corrections from Luna where needed, and verifies the final result.

## Dependencies and acceptance criteria

- Follow AGENTS.md. Circuit layouts never mix; lap classification remains parser-owned; deterministic metrics retain their formulas.
- No new trivial forwarding APIs, pass-through barrels, explicit `any`, oversized files or directories.
- Missing station metadata fails compatibility checks; explicit matching canonical metadata passes.
- Generator and array weekend inputs yield the same links, preserving order and tie behavior.
- Excluded-class tracks disappear when empty venues are disabled and remain when enabled.
- Existing projection, consistency and position behavior is preserved except the explicitly corrected edge cases.
- Run endpoint benchmarks before and after API performance changes, full tests and production build. Record actual outcomes and any environmental limits.
- Review must find no unresolved actionable defects in the final patch.

## Completion evidence

Before implementation, the audit passed 337 focused tests in 27 files. Direct probes reproduced generator exhaustion, unwanted empty tracks and acceptance of missing station metadata.

Luna implemented all eight findings. Independent parent review caught and corrected an initial import rewrite error, forwarding metric APIs, and unnecessary repeated mean/condition/key calculations. The final source/import review and `git diff --check` passed with no unresolved actionable findings.

- Full `npm test`: 289 files passed, 5 skipped; 2,494 tests passed, 56 skipped. Loopback integration tests required execution outside the network-restricted sandbox. No warnings in the successful run.
- `npm run build`: passed TypeScript, Vite and both local-data guards with no warnings.
- Independent seeded comparison: 1,500 session cases exactly preserved full projections, scalar/indexed class positions, rival comparisons, array weekend links and retained-empty track summaries. Generator weekend inputs now match array results.
- Permanent regressions cover generator exhaustion, class filtering with empty venues disabled, missing canonical station metadata, no-clean-lap projections and lone completed start-numbered laps. Synthetic geometry fixtures now explicitly declare canonical sources/revisions without weakening their assertions.
- Before/after endpoint benchmarks: 32 successful scenarios, 5 warm samples each; identical dataset and cohort hashes, no changed result counts and no regression flags under the runner's >20% and >5 ms median threshold. The database contained 996 sessions, 16,860 drivers and 81,546 laps. These short runs validate endpoint behavior and flag large changes; they do not establish a broad latency improvement.

The original-code baseline was reconstructed in an ignored directory from HEAD server/shared sources with identical current benchmark tooling. The first sandbox run could not fetch localhost; the successful baseline and final runs used loopback access. Local reports are `.cache/shared-domain-benchmarks/history/2026-10-12T01-39-11.478Z.{json,md}` and `2026-10-12T01-44-46.152Z.{json,md}`. The latter emitted a Git CRLF normalization notice while hashing the diff; tests and production build had no warnings.

No parser or persisted projection version bump was needed: classification and stored projection values are unchanged. Unrelated working-tree edits were preserved. No remaining work within this audit's scope; other code-map backlog items remain separate.

## Ranking and weekend follow-up (2026-10-11)

The two smaller costs identified after the original audit are now removed. Leaderboard sector/top-three rankings
build a value-to-first-rank map instead of repeating `indexOf` scans; competition ties, nulls and existing NaN behavior
are preserved. Weekend searches derive the current session's canonical layout, event identity and timing once,
derive each relevant candidate once, and retain only the nearest candidate per type during one traversal.
All circuit resolution still calls `getCircuitSpecification` directly. Public pair matching shares the same rules.

- Focused regressions: 22 tests passed, including rank gaps after ties, missing values, first-candidate tie selection,
  unknown-layout exact matching and separation of layouts at the same facility.
- Full suite: 290 files passed, 5 skipped; 2,503 tests passed, 56 skipped. Production build passed. Neither emitted warnings.
- Independent comparison against the original implementation: 1,500 seeded session cases also preserve leaderboard
  results, and 5,000 additional weekend pairs preserve layout/event/class/ID/timestamp behavior.
- Endpoint report `2026-10-12T01-55-39.527Z` compared with the prior completed cleanup report
  `2026-10-12T01-44-46.152Z`: identical dataset/cohort, all 32 scenarios successful, unchanged result counts.
  Replay telemetry triggered the runner's median flag (112.87 to 157.19 ms); its samples ranged from 98.75 to
  456.57 ms. Source tracing found no call to either changed domain path on this endpoint: server weekend lookup
  is used by session context queries, and the in-memory leaderboard builder has no server consumer.
  The short benchmark therefore does not establish an overall latency improvement or explain the telemetry variance.

Final source review and whitespace checks found no unresolved actionable defects in these two changes.
