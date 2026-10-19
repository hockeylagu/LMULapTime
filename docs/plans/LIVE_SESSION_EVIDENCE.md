# Live session evidence and learning — remaining work

Reviewed 2026-10-18. Capture, XML attachment, aligned evidence, diagnostics, consolidated audit,
learning readiness and automatic correction lifecycle are implemented.
See [Live capture reference](../LIVE_CAPTURE_FORMAT.md) for the current pipeline and contracts;
[the archived foundation](archive/LIVE_SESSION_EVIDENCE_FOUNDATION.md) preserves the original design.

## Remaining capture implementation

Scope audit, 2026-10-18: the original 30-scalar core is implemented, but the additions in
[channel analysis §9.1](LIVE_CHANNEL_ANALYSIS.md#91-new-findings-that-change-the-proposal) are not all captured.
Do not describe the whole accepted capture plan as coding-complete until these gaps are addressed:

| Missing data | Intended storage | Current gap |
|---|---|---|
| Four-wheel tyre vertical deflection | Typed dynamic values in metres; expands the core to 34 scalars | `verticalTireDeflection` exists in the layout/diagnostic JSONL, but not the supplemental decoder or DuckDB sample schema |
| Impact magnitude | Sparse impact event with source session time | `lastImpactEt` is recorded, but `lastImpactMagnitude` is not decoded into the live car/capture contract |
| Four-wheel terrain material names | Initial state and per-wheel changes, preserving truncated raw names | Only the layout/diagnostic recorder reads `terrainName`; app capture does not retain it |
| Player car upgrade pack | Configuration snapshot, raw 16-byte hex | Present in scoring layout/diagnostic JSONL, absent from the app's live scoring/capture contract |

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
3. Verify new normalization-version-2 recordings against saved wheel evidence: all 24 wheel fields,
   corrected vehicle axes and finite/unavailable values. Implementation and worker round-trip tests
   are complete; live acceptance remains. Damage/weather learning requires separate deterministic targets.
4. Keep diagnostic-sidecar deletion manual until live stability is established. Automatic retention
   is deferred; permanent session evidence and compact learning facts have separate ownership rules.

## Latest verification

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
