# Live session evidence and learning — remaining work

Reviewed 2026-10-18 on `codex/live-session-evidence`. Capture and the first offline learning
foundation are implemented. Historical prediction corrections remain disabled.

The delivered design and verification record is archived in
[Live session evidence foundation](archive/LIVE_SESSION_EVIDENCE_FOUNDATION.md).
The current storage, channel and operational contract is [Live capture format](../LIVE_CAPTURE_FORMAT.md).

### Delivery checkpoint

| Area | Current state |
|---|---|
| Capture | Player-only supplemental DuckDB recording independent of dashboard clients; ISO 8855 normalization, bounded worker writes and interrupted-session recovery implemented |
| Attachment | Strict XML identity and completed-lap anchors; XML game patch inheritance; ambiguous ownership rejected |
| Consumers | Aligned evidence API and yaw/body-slip chart fusion; native G preserved; computed fallback disclosed |
| Diagnostics | Bounded response/error sidecars, post-session tail and deferred gzip; manual cleanup |
| Audit consolidation | Full checkpoints in session DuckDB independent of dashboard; worker-paged JSON/CSV plus read-only legacy history; no new SQLite audit writes |
| Learning | Frozen fuel/VE forecasts and measured outcomes, compact SQLite examples, chronological baseline and bounded offline correction candidate evaluation implemented |
| Review fixes | Deferred recovery while layout is unresolved, consistent six-slot batch capacity and exact lap revalidation implemented |
| Acceptance | Real-game performance and race-weekend validation deferred by user; correction activation and learning UI pending |

## Next implementation and acceptance work

1. Collect new eligible recordings across several sessions. Check game/frame-time overhead,
   session transitions, interruption/restart, writer failures, XML attachment and diagnostic usefulness
   through a complete race weekend. Old captures without forecast events cannot supply invented predictions.
2. Run `npm run learning:evaluate` and inspect eligibility/exclusion counts, exact compatibility
   cohorts and whole-session chronological holdouts. Fuel and VE use separate units and metrics.
   Require sufficient independent sessions before interpreting changes as improvement.
3. Audit consolidation is coded: new full checkpoints live in DuckDB, JSON/CSV read recordings off
   track through bounded workers, and existing SQLite rows remain read-only for compatibility.
   No automatic migration, pruning or deletion runs. Verify a real race export after in-game validation.
4. Expose learning readiness and exclusion reasons in the app. The CLI now screens a deterministic
   session-median residual correction with shrinkage, minimum evidence and a 10% adjustment bound.
   Review compatible real cohorts and validate the fixed policy on fresh sessions before activation.
   Define runtime fallback/rollback and promotion controls separately; no correction is enabled.
5. Verify additional wheel channels against new source evidence before populating their reserved columns.
   Broader damage/weather learning consumers require separate deterministic targets and validation.

There is no automatic disk quota or eviction. Raw session files and closed diagnostic sidecars are
manually removable; compact learning facts have separate ownership and invalidation rules.

## Verification recorded for the delivered foundation

2026-10-18: 3,182 tests passed, 56 intentionally skipped; production build passed without warnings.
Matching-dataset endpoint sweeps found no regressions above the project's threshold; details are in
[endpoint benchmarks](../ENDPOINT_BENCHMARKS.md). These checks do not replace real-game acceptance.

Offline candidate addition, 2026-10-18: 3,195 tests passed, 56 intentionally skipped; production
build passed without warnings. Focused regressions cover future-data leakage, session weighting,
exact cohort/resource isolation, minimum evidence, bounded adjustments, worsening shortfall,
stale projection exclusion and read-only report generation. No real-game validation was performed.

Audit consolidation, 2026-10-18: 3,201 tests passed, 56 intentionally skipped; production build
passed without warnings. Real DuckDB worker tests cover complete/paged exports, byte-bounded pages,
stable sequence IDs across tracker resets, concurrent reader limits, identity/ownership failures,
legacy compatibility and loaded-session/writer-handle gates. Matching-snapshot endpoint sweeps
found no regressions above the project threshold. In-game validation remains deferred.
