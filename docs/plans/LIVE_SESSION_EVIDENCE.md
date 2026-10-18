# Live session evidence and learning — remaining work

Reviewed 2026-10-18. Capture, XML attachment, aligned evidence, diagnostics, consolidated audit,
learning readiness and automatic correction lifecycle are implemented.
See [Live capture reference](../LIVE_CAPTURE_FORMAT.md) for the current pipeline and contracts;
[the archived foundation](archive/LIVE_SESSION_EVIDENCE_FOUNDATION.md) preserves the original design.

## Remaining acceptance

1. Validate a complete race weekend: frame-time overhead, dashboard readability, session transitions,
   interruption/restart, writer failures, XML attachment and usefulness of transient-error diagnostics.
2. Collect eligible sessions and run `npm run learning:evaluate`. Verify exact cohort isolation,
   prospective acceptance, current-run XML patch trust, withdrawal and actual prediction improvement.
   Historical holdouts alone do not establish real-world improvement.
3. Verify additional wheel channels before populating reserved columns. Damage/weather learning
   requires separate deterministic targets and validation.
4. Keep diagnostic-sidecar deletion manual until live stability is established. Automatic retention
   is deferred; permanent session evidence and compact learning facts have separate ownership rules.

## Latest verification

2026-10-18: 3,214 tests passed, 56 skipped; production build passed without warnings.
The suite covers capture/recovery, strict ownership, evidence reads, diagnostic routing and automatic
learning gates. Real-race acceptance remains outstanding. Earlier endpoint performance results are in
[endpoint benchmarks](../ENDPOINT_BENCHMARKS.md); this documentation/log-routing cleanup changes no API work.
