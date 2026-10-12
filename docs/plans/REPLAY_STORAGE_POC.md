# Replay storage POC results

Reviewed: 2026-10-12. Status: **complete; both tested replacement layouts rejected on size**.
No production data, replay schema, decoder or endpoint was changed for this POC.

## Decision and priorities

The user priority is **storage size first, app read response time second, ingestion time third**.
Keep the current compact lap storage. These results do not justify a migration to either tested replacement.
Read-time transformations are acceptable when eliminating them would require substantially more retained data.
Binary storage in general is not ruled out: this POC tests one straightforward lossless Float64 column encoding, not an optimized delta/integer codec.

## Cohort and method

- Real Daytona Road Course replay, 945,797,856 bytes; player slot 45 and opponents 0 and 1.
- 107 laps, 554,733 samples; real installed detailed geometry and matching session XML timing context.
- Three fresh worker runs per candidate, alternating order. Report median elapsed decode-to-stored/prepared time.
- All candidates use the same decoder and three per-driver source scans. The later one-scan importer is **not** tested by this storage POC; its separate measurements are in [VCR performance analysis](../VCR_PERFORMANCE_ANALYSIS.md).
- Current storage uses the canonical driver writer, normalized facts, constant-column elimination, columnar JSON and Brotli quality 6.
- Binary candidate uses compressed lossless column buffers, presence/null masks, constant columns, shared driver metadata and normalized facts. It still prepares app responses on read.
- Prepared candidate retains those source columns once and stores references plus changed/derived values for full, 2 m, 4 m and 400-point views. It does not store four complete copies of original samples.
- Preparation uses the actual app's garage/classification, official validation, adjacent boundary context, geometry/line cutting, feature downsampling and browser filtering/dynamics algorithms. Resolution-specific processing order is preserved.
- Size is the actual isolated SQLite file after WAL checkpoint/truncation, including schema, facts, indexes and candidate tables. It is not just compressed payload length.
- Reads exercise those production algorithms directly, including browser post-processing in Node. They are not live HTTP or browser rendering measurements.

## Storage and ingestion

| Candidate | Total DB | Relative size | Median ingestion/preparation |
|---|---:|---:|---:|
| Current columnar JSON | 14.00 MiB | 1.00x | 5.20 s |
| Binary source columns | 15.68 MiB | 1.12x | 5.56 s |
| Binary + prepared views | 73.70 MiB | 5.26x | 31.01 s |

Raw file sizes: 14,684,160 / 16,441,344 / 77,279,232 bytes respectively.
Current compressed sample payload: 12,367,455 bytes; binary source payload: 14,128,656 bytes.
Prepared references/corrections/annotations add **60,457,521 bytes**:

| Prepared view | Compressed bytes |
|---|---:|
| Full | 29,536,723 |
| 2 m | 18,022,353 |
| 4 m | 9,689,008 |
| 400 points | 3,209,437 |

Example prepared run: 2.73 s decoding, 0.31 s canonicalization, 9.08 s preparation, 17.89 s encoding/compression and 1.00 s writes/facts. Reducing repeated read work moves substantial CPU and storage into ingestion.
These figures exclude worker/module/track-package startup and final integrity/validation checks. They include usable preparation for every supported POC view, not just packet scanning.

## App read preparation

One flying lap per driver, ten alternating warm measurements per candidate/view after parity warm-up.
Values below are the median of the three driver-specific medians. They include DB access, decoding, app transformations where applicable and browser signal processing; JSON response serialization is shown separately.

| View | Current | Binary source | Prepared views |
|---|---:|---:|---:|
| 2 m, default inspector/debrief | 98.45 ms | 68.38 ms | 32.39 ms |
| 4 m | 92.84 ms | 65.93 ms | 16.59 ms |
| Full resolution | 98.94 ms | 71.29 ms | 52.86 ms |
| 400-point consistency lap | 92.21 ms | 63.59 ms | 6.67 ms |

Including JSON serialization, default 2 m reads were 117.08 / 89.58 / 44.05 ms.
The prepared default read saves about 66 ms of preparation, or 73 ms including serialization, at **5.26x database size**. That tradeoff fails the user's primary requirement.
The binary candidate improves default preparation by about 30 ms but costs 12% more total storage, so it also fails the current priority.
No new per-sample rounding or lossy quantization was used to obtain these comparisons.

## Validation

- SQLite integrity checks passed for all nine measured databases.
- Every one of the 107 retained source laps matched current stored samples at the JSON/API value contract; the binary format additionally retains signed zero that current JSON storage normalizes.
- All 428 prepared lap/view responses matched the current algorithm chain, including timing, geometry and four-wheel channels.
- Twenty-four additional timed-case binary/prepared comparisons matched the current outputs.
- Codec checks cover scalar precision, signed zero, booleans, missing/null values, strings, four-element arrays, source references and synthetic endpoints.
- A synthetic start/finish station-origin correction rebuilt three laps from the candidate database only, without reading the VCR. The canonical results matched and both crossing endpoints actually moved.

| Driver | Old start | Rebuilt start | Old end | Rebuilt end | Rebuild read + projection |
|---|---:|---:|---:|---:|---:|
| 45 | 544.413 s | 544.428 s | 653.166 s | 653.182 s | 91.49 ms |
| 0 | 477.883 s | 477.897 s | 573.736 s | 573.749 s | 75.48 ms |
| 1 | 471.921 s | 471.934 s | 567.995 s | 568.008 s | 81.12 ms |

The correction rotates the actual centreline's station origin by one vertex while preserving the route shape. It demonstrates retained-data recutting, not a complete track-package migration/publication implementation.

## Limits and next direction

- One layout and three drivers; not a whole-field or multi-layout acceptance benchmark.
- Native VCR only. DuckDB fusion, arbitrary resolutions, live HTTP latency, UI rendering and physical disk-cold reads are not measured.
- Background invalidation, atomic prepared-generation publication and migration recovery are not implemented.
- Worker RSS fields in the raw report are process-wide cumulative high-water marks; the workers share a process, so those values cannot establish per-candidate memory savings. WAL observations are sampled at driver boundaries, not precise transient peaks.
- Production code is unchanged. Script syntax checks and the executed POC validations passed; no full app test/build or endpoint sweep was run for these isolated benchmark scripts.

Prioritize compactness: examine existing channel/metadata redundancy and lossless delta/scaled-integer encoding before adding derived columns. Measure app reads as the second criterion, ingestion as the third. Do not migrate on these POC results or persist all resolution-specific views.

## Reproduction

From the repository root, with the installed data package configured in `.env.local`:

```powershell
node tools/benchmarks/replayIngestion/run.mjs direct '<Daytona VCR path>' .tmp/replay-storage-source 3
node --env-file-if-exists=.env.local tools/benchmarks/replayStoragePoc/run.mjs --source .tmp/replay-storage-source.db --app-db server/lmu_cache.db --drivers 3 --repeats 3 --read-samples 10 --out .tmp/replay-storage-poc-new
```

The source DB supplies the recording locator and roster; the VCR must exist for fresh ingestion. The app DB is opened read-only for official session context. Output databases are isolated and existing output databases are never overwritten.
The original source cohort was `.tmp/vcr-deep/rolling-control.db`, a local benchmark fixture, not committed replay data. The first command regenerates the three-driver source cohort without that ignored fixture. The runner currently prioritizes slot 45 to reproduce this Daytona cohort; generalizing cohort selection is outside this POC. These reproduction commands require the same real recording, installed geometry and matching official session context; they are not fixture-free app tests.
Machine-readable results are in `.tmp/replay-storage-poc-main/result.json`, with run details in `ingests.json`. Generated benchmark databases are disposable and removed after verification to avoid retaining hundreds of MiB of test copies.
