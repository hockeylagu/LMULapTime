# Further replay preparation

Status: unstarted proposal; binary lap storage is delivered. Current contract:
[replay cache format](../../REPLAY_CACHE_FORMAT.md). Review date: 2026-10-25, without new benchmarks.

## Requirement and next decision

Priority is total retained storage, then app read response, then ingestion time. Correctness and
retained-source safety are constraints. Keep the current representation unless a measured alternative
wins. Do not persist several complete copies of the same samples merely to remove read transforms.

Next: profile representative native/full/2 m, reference-pair, 400-point, traffic and fused reads.
Then prototype one smaller grouped/prepared representation on an isolated cache copy; measure
end-to-end time until usable and full DB/WAL/temp costs, with numeric/semantic parity. Include long,
partial and empty laps, four-corner values, late events and retained rows whose VCR no longer exists.

## Prior results

The 2026-10-12 POC (107 laps/554,733 samples) used 14.00 MiB for then-current columnar JSON,
15.68 MiB for plain lossless Float64 columns and 73.70 MiB for source columns plus exact prepared
views. Both replacements were rejected on size. Those are historical candidates, not the later
scaled/delta binary codec. Do not repeat them without a new size argument.

## Constraints before implementation

- Preserve one authoritative known-source representation, boundary context and discarded-field limits.
  New projections should rebuild from retained rows; do not require unavailable original VCRs.
- Filters/dynamics currently run after resolution selection. Full-resolution preparation plus point
  selection can change results; validate that explicitly or retain resolution-specific corrections.
  Arbitrary requested budgets/spacings still need an honest fallback/readiness contract.
- Fused native DuckDB and VCR data have different clocks/densities. Avoid another full sample copy;
  keep source identity, exact layouts, line-cut interpolation and four-wheel channels intact.
- Separate encoding/decoder semantics from derived geometry/display/fusion revisions. Rebuild derived
  projections without forcing a VCR reparse; atomically publish complete generations while old ones serve.
- Keep decoding/preparation in workers, bounded in memory, with source-identity checks and per-driver
  atomic commits. Traffic may remain independently lazy/rebuildable.

Do not start a migration before measuring these tradeoffs and choosing an accepted retained-data contract.
