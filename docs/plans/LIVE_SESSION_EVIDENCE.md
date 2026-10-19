# Live session evidence and learning — remaining work

Reviewed 2026-10-18. Capture, XML attachment, aligned evidence, diagnostics, consolidated audit,
learning readiness and automatic correction lifecycle are implemented.
See [Live capture reference](../LIVE_CAPTURE_FORMAT.md) for the current pipeline and contracts;
[the archived foundation](archive/LIVE_SESSION_EVIDENCE_FOUNDATION.md) preserves the original design.

## Capture completion audit

Scope audit, 2026-10-18: the accepted core and all four additions in
[channel analysis §9.1](LIVE_CHANNEL_ANALYSIS.md#91-new-findings-that-change-the-proposal) are implemented.
The capture coding scope is complete before live testing; acceptance below remains outstanding.

| Added data | Delivered storage | Verification |
|---|---|---|
| Four-wheel tyre vertical deflection | Four typed metre values; normalization version 3 has 34 scalars | Saved wheel frame passes decoder → service → real writer → DuckDB; nonfinite/zero handling tested |
| Impact magnitude | Sparse native magnitude and source impact time, separate receipt time | Distinct times survive equal magnitudes; transient state transported between car checkpoints; real DuckDB persistence tested |
| Four-wheel terrain material names | Initial/change events referencing a file-scoped raw-name dictionary | Truncation/empty handling, unchanged-state suppression and dictionary reuse after writer restart tested |
| Player car upgrade pack | Initial/change configuration with exact raw 16-byte hex | Player selection, zero bytes, deduplication and DuckDB persistence tested |

Fuel capacity is already saved in car-condition observations. Body/suspension damage, pit estimates
and selections, tyre inventory/selection, consumption estimates, service timing rules, forecast
rain/sky/temperature/humidity/wind and average/maximum path wetness have capture paths.
Conditional extras (angular acceleration, duplicate higher-rate G, brake condition and detailed
detachable-part state) still require distinct usefulness/coverage evidence; they are not silently
included in the delivered core. Damage/weather learning consumers remain separate future work.

## Remaining acceptance

1. Validate a complete race weekend: frame-time overhead, dashboard readability, session transitions,
   interruption/restart, writer failures, XML attachment and usefulness of transient-error diagnostics.
2. Collect eligible sessions and run `npm run learning:evaluate`. Verify exact cohort isolation,
   prospective acceptance, current-run XML patch trust, withdrawal and actual prediction improvement.
   Historical holdouts alone do not establish real-world improvement.
3. Verify new normalization-version-3 recordings against saved wheel evidence: all 28 wheel fields,
   corrected vehicle axes and finite/unavailable values. Implementation and worker round-trip tests
   are complete; live acceptance remains. Confirm terrain transitions, source-timed impacts and player
   upgrade-pack configuration. Damage/weather learning requires separate deterministic targets.
4. Keep diagnostic-sidecar deletion manual until live stability is established. Automatic retention
   is deferred; permanent session evidence and compact learning facts have separate ownership rules.

## Latest verification

Accepted capture completion / normalization version 3, 2026-10-18: 3,250 tests passed, 56 skipped;
production build passed without warnings. Regressions cover 34-value persistence, source-timed impact
magnitudes, exact player upgrade bytes, terrain dictionary reuse across writer restart, change-only
transport between car checkpoints and isolation/readability of version-1/2 files. The main capture
scope has no remaining coding omissions; real-game overhead and fresh-session learning acceptance
remain unverified. See [endpoint benchmarks](../ENDPOINT_BENCHMARKS.md) for the API timing checks.

Wheel capture / normalization version 2, 2026-10-18: 3,243 tests passed, 56 skipped; final production
build passed without warnings. Saved wheel values round-trip through the real writer worker and
DuckDB. Regressions cover source handedness, all four corners, scalar signs, nonfinite/zero values,
old-file normalization/provenance and recording-version isolation. Focused reader tests passed after
the final stored-version integrity check. Matching-snapshot API sweeps found no threshold regressions;
this does not validate in-game overhead or replace a new live recording.

2026-10-18: 3,214 tests passed, 56 skipped; production build passed without warnings.
The suite covers capture/recovery, strict ownership, evidence reads, diagnostic routing and automatic
learning gates. Real-race acceptance remains outstanding. Earlier endpoint performance results are in
[endpoint benchmarks](../ENDPOINT_BENCHMARKS.md); this documentation/log-routing cleanup changes no API work.
