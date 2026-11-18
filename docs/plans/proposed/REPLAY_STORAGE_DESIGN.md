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

## One pattern for a car over time (2026-11-18)

The driver's concern: one kind of information (a car's channels over time) is kept in three patterns, each with its own
codec, key and idea of where the car is on the track:

| Today | Holds | Pattern |
|---|---|---|
| `replay_trajectories` | every car, every lap, full replay rate (source of truth) | binary columns (`LMTB`, [format](../../REPLAY_CACHE_FORMAT.md)) per car and lap |
| `telemetry_lap_cache` | the player's native laps, read from the DuckDB files | Brotli JSON per lap (`dbCache.ts`) |
| `replay_race_positions` | every car's distance along the centre line, 5 Hz | one Brotli JSON per replay (`racePositions.ts`, `RACE_POSITIONS_VERSION`) |
| race poses (memory) | every car resampled to 10 Hz | 60 s windows, rebuilt from the laps (`racePoses.ts`) |

Proposed direction (not measured yet):

- **Sources keep one shape: car × lap × columns, in the `LMTB` codec.** The replay laps stay as they are. The native lap
  cache uses the same codec and key shape, its channels named as the replay's where they mean the same; the DuckDB files
  stay its source.
- **Everything else is derived from those laps on demand**, in the worker that already decodes them, and held in memory:
  the 10 Hz race poses, the centre-line distance of every sample (the shared track reference the
  [corner insight](CORNER_INSIGHT.md) plan needs; the race positions index already computes it, at 5 Hz) and the corner
  passes.
- **A derived result is stored only when measured too slow**, keyed by a version key (rule version, geometry revision,
  parser version), built at ingestion, rebuilt offline when the key changes and never a source of truth. The first one,
  the [corner insight](CORNER_INSIGHT.md) passes, is SQL rows keyed like `replay_laps` (driver, 2026-11-18). The race
  positions index is retired after the passes work (its spells and live gaps come from the pass builder, corner insight
  step 5); the native lap cache moves to the one pattern later.
- No further full copies of the samples (below); the distance channel is one column per lap, and only if stored.

Measured 2026-11-18 (read-only scratch scripts, one thread, idle machine; the second round ran slower under 2.8 GB of
memory). Le Mans `R1 52`: 63 cars, 723 laps, 12.65 M samples, 150 MB of blobs:

| Work over the whole race | Time |
|---|---|
| Read the 723 rows | 0.14-0.27 s |
| Brotli decompression alone (965 MB out) | 2.1 s |
| Decode every column / only time, position, speed, pedals, steering, pit state | 14.9-18.8 s / 9.6 s |
| Centre-line distance of every sample at full rate | 36-37 s |
| Pass extraction once the distance is known (28,609 passes, stand-in rule) | 0.12 s |
| Today's race positions index build (5 Hz) | 7.7-19 s |
| Today's race poses resample, every lap (10 Hz) | 13-16 s |

- Deriving a long race on demand is not viable: decoding plus the distance is about 45 s before anything shows. A derived
  result is therefore built once on a worker and kept as the disposable cache above (the positions index already is, for
  this reason); a version bump rebuilds it in the background.
- The cost is the column decode into JS arrays (about 0.75 µs a sample), not Brotli (2 s of it), and the centre-line
  projection (about 2.9 µs a sample). The pass rule itself is cheap. Decoding into typed arrays and projecting each lap
  once, keeping its distance column in the derived cache, are the levers.
- The native lap cache (148 laps, 1.59 M points) in `LMTB` instead of points-as-objects JSON: 94.1 MB → 35.0 MB, all
  laps read in 14.0 s → 1.7 s (about 95 → 11 ms a lap). Moving it to the replay's codec wins on both size and read.

Storage impact, measured the same day on 120 random laps each of Le Mans `R1 52` and Daytona `R1 12` (25 segments a lap,
the card's fields), scaled to today's 5.05 GB of lap blobs (71,313 laps):

| Derived result | Measured | Whole database |
|---|---|---|
| Centre-line distance column, full rate (cm) | 2.2-2.6% of the lap blobs | +110-130 MB |
| Centre-line distance column, 10 Hz | 0.8-1.0% | +40-50 MB |
| Corner passes as SQL rows (text replay key) | 124-143 bytes a pass | +220-260 MB (~1.8 M passes) |
| Corner passes as one `LMTB` blob per session | 3.6-5.2 bytes a pass | +7-9 MB |
| Native lap cache JSON → `LMTB` | 94.1 → 35.0 MB | −59 MB |
| Race positions index, replaced by the distance column | 15.2 MB today (12 replays) | −15 MB |

Columnar passes with a 10 Hz distance column come out about even with today's database; passes as SQL rows add about
4% (5.4 GB today).

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
