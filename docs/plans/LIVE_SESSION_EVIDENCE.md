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
| Learning | Frozen fuel/VE forecasts and measured outcomes, compact SQLite examples and chronological baseline evaluation implemented |
| Review fixes | Deferred recovery while layout is unresolved, consistent six-slot batch capacity and exact lap revalidation implemented |
| Acceptance | Real-game performance and race-weekend validation pending; calibration fitting, activation and learning UI pending |

## Next implementation and acceptance work

1. Collect new eligible recordings across several sessions. Check game/frame-time overhead,
   session transitions, interruption/restart, writer failures, XML attachment and diagnostic usefulness
   through a complete race weekend. Old captures without forecast events cannot supply invented predictions.
2. Run `npm run learning:evaluate` and inspect eligibility/exclusion counts, exact compatibility
   cohorts and whole-session chronological holdouts. Fuel and VE use separate units and metrics.
   Require sufficient independent sessions before interpreting changes as improvement.
3. Consolidate the older dashboard-dependent SQLite strategy audit/CSV history with the recorded
   evidence workflow. Define migration or explicit disposal of its few historical runs; keep useful
   debugging coverage and remove redundant persistence only after parity is checked.
4. Expose learning readiness and exclusion reasons in the app. Then evaluate a deterministic correction
   candidate against the frozen rolling-estimator baseline. Define minimum evidence, bounded corrections,
   fallback and rollback before activation. Training and activation are separate gates.
5. Verify additional wheel channels against new source evidence before populating their reserved columns.
   Broader damage/weather learning consumers require separate deterministic targets and validation.

There is no automatic disk quota or eviction. Raw session files and closed diagnostic sidecars are
manually removable; compact learning facts have separate ownership and invalidation rules.

## Verification recorded for the delivered foundation

2026-10-18: 3,182 tests passed, 56 intentionally skipped; production build passed without warnings.
Matching-dataset endpoint sweeps found no regressions above the project's threshold; details are in
[endpoint benchmarks](../ENDPOINT_BENCHMARKS.md). These checks do not replace real-game acceptance.
