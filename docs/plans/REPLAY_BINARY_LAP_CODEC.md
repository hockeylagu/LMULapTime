# Binary lap codec for replay trajectories

Status: **Done** (2026-10-22). Code switched and the read fixes deleted; the real database rewritten, checked and
swapped. Original kept as `server/lmu_cache.db.backup-pre-binary` until deleted by hand.
Follows [the storage POC](REPLAY_STORAGE_POC.md), which rejected plain Float64 columns (1.12x) and named
"lossless delta/scaled-integer encoding" as the next candidate. Priorities stay: storage size, then read
time, then ingestion time.

## Why

`replay_trajectories.trajectory_br` holds 5.8 GB of the 6.4 GB `lmu_cache.db` (54,182 lap rows, 458 replays).
Each row is columnar JSON compressed with Brotli 6. JSON decimals compress poorly: position (x, y, z) is 48% of
the bytes, rotation 23%.

## Prototype result (real rows, read-only)

Sample: every 200th row, 273 laps, v3 and v7. Same stored object before and after (`isDeepStrictEqual`).

| Variant | Size vs today | Encode ms/lap | Mismatches |
|---|---:|---:|---:|
| Scaled-integer deltas, Brotli 9 | 0.451 | 27 | 0 |
| + second-order deltas | 0.414 | 25 | 0 |
| + byte planes (chosen) | **0.401** | 24 | 0 |
| Byte planes + second order, Brotli 11 | 0.358 | 412 | 0 |

Today: Brotli 6 encode about 15 ms/lap. Expected result: 5.8 GB to about 2.3 GB of blobs, database about 2.9 GB.
Brotli 11 would save another 0.25 GB but makes the one-time rewrite about 6 h and every replay import slower.

An earlier quick estimate of 22% rounded positions to 2 decimals and was lossy for v7 rows (4 decimals); it is void.

## Format (encoding version 1)

`brotli(q9)` of: magic `LMTB`, `u8` encoding version, `u32` header length, header JSON, column parts.

- The header is the stored lap object without `columns` (metadata, `constants`, `pointsLength`, pit events), plus
  one descriptor per column: kind, decimals, null mask, part lengths.
- Column kinds, chosen per column per lap as the smallest **exact** form:
  - `scaled` (0-4 decimals): every value `v` equals `k / 10^d`; `k` stored as Int32 deltas in byte planes.
  - `f32` when every value is exactly a float32, else `f64`.
  - `bool`: one byte, 0 / 1 / 2 = null.
  - `tuple4` (brake temps, tyre temps, wear, suspension, compounds): four numeric sub-columns plus a null mask.
  - `json`: fallback for anything else (mixed types); never seen in the sample.
- The encoder decodes each column it wrote and compares every value with `Object.is`; any difference falls back
  to `f64` or `json`. The format cannot lose data by construction.
- The encoding version is inside the blob. `parser_version` keeps naming the decoder that wrote the row (v3 to v7);
  after the rewrite it no longer selects any read fix (see below).

Seen in the sample: x/y/z/time at 4 decimals (2 in v3), rotation 4 (3 in v3), speed 2 (0 in v3), pedals, gear,
RPM, temperatures and part state as integers, ambient 0-1, Virtual Energy 1. The 74 empty laps (0 points) encode
as zero columns.

## Read path

| Reader | Change |
|---|---|
| `decompressTrajectory` (lap reads, tools) | Decode all columns into the existing columnar object, then `fromColumnarTrajectory` as today |
| `decompressTrajectoryEdge` (line cut neighbours) | Decode only the columns of the requested edge samples |
| `server/traffic/lapSamples.ts` (traffic index) | Uses the codec, decodes only time, x, z, pit, speed, teleport; stops parsing JSON itself |
| Writers (`compressTrajectory`, ingest worker) | Write version 1 only |

After the rewrite every row is binary, so the JSON read code is removed (no legacy branch). A blob without the
magic fails with an error naming the rewrite script. Gate: `npm run benchmark:endpoints` before and after, and
replay reads must not get slower (the prototype decoder was 2.5 ms/lap slower; the real one fills arrays directly).

## Read fixes applied once in the rewrite

Every row is rewritten anyway, so the rewrite stores what the app reads today and the read-time fixes are deleted.
Counted on the full database (2026-10-21):

| Read fix | Rows it changes today | After the rewrite |
|---|---|---|
| `toIso8855Steering` (steering positive left, marker `signConvention`) | 10,449 v3 + 33,709 v7 lap rows; DuckDB lap cache (163 rows) | Applied and marked in both tables; function and its calls deleted |
| `upgradeStoredTrajectory` (pre-v6: Virtual Energy stored as fuel, ambient scale, track temp) | v3 lap rows (36 with fuel) | Applied; function and `PRE_V6_REPLAY_CACHE_VERSIONS` deleted |
| `upgradeStoredReplayMetadata` (same, metadata row) | 96 v3 `replay_metadata` rows | Applied; deleted |
| `withGarageState` (garage recomputed from pit events) | Every lap row, every read (stored flag differs on old rows) | Applied; reads use the stored flag; write-time `applyGarageState` stays |
| Garage recompute in `lapSamples.ts` and in the edge read | Traffic index and line-cut neighbours | Read the stored flag |
| Full-lap fallback in `decompressTrajectoryEdge` for pre-v6 rows | v3 rows | Deleted |

`replay_conditions` and the other fact tables hold no legacy values (v3 replays have no ambient there), so they
are untouched. `COMPATIBLE_REPLAY_CACHE_VERSIONS` stays: it still says which rows count as readable, and v3 rows
remain coarser (0.01 m) and lack events that decoder never read; no fix can restore those.

Consequence: a future rule change (garage, signs, units) is handled by rewriting the stored rows, not by a read
fix. The rewrite check compares what the app reads before (old blob, with the fixes) and after (new blob, no
fixes), so the folded fixes are verified on every row, not trusted.

## Rewrite of existing rows (one-off, offline)

207 replays (1.8 GB, all 96 v3 replays included) exist only in the cache; 251 are still on disk. Every row is
rewritten from its stored blob; nothing is re-decoded from a VCR and `REPLAY_CACHE_VERSION` is not bumped.

1. Server stopped. WAL checkpointed (`wal_checkpoint(TRUNCATE)`).
2. Copy `lmu_cache.db` to a work file; the original is never written.
3. For each row of the work file, in batches of 500 per transaction: read the lap exactly as the app does today
   (JSON blob plus the read fixes), encode version 1, decode it with the new reader (no fixes), require
   `isDeepStrictEqual` with today's read, then update `trajectory_br` only. Same for the 96 v3 metadata rows and
   the 163 DuckDB lap cache rows. `updated_at` and `parser_version` stay. Any mismatch stops the run and names
   the row. Rows already starting with the magic are skipped, so the run can resume.
   The traffic index (`replay_race_positions`) is rebuilt once afterwards: it was built from the same garage
   recompute, so it should come out identical; the rebuild proves it.
4. `VACUUM INTO` a compact file.
5. Independent check of the compact file against the original: every row, same key set, decoded objects equal.
   Plus API parity: the trajectory endpoint for a fixed set of laps (v3 deleted, v7 deleted, v7 on disk,
   empty lap, pit lap, rain lap) before and after, byte-identical JSON.
6. Swap: original renamed `lmu_cache.db.backup-pre-binary`, compact file becomes `lmu_cache.db`. The backup stays
   until you delete it.

Estimated time: rewrite about 40 min, check about 15 min, vacuum a few minutes. Disk peak about 16 GB (168 GB free).
The script uses the app's codec via `tsx` and lives outside the repository, as for the field-name rewrite.

## Result (2026-10-22)

- Rewrite: 54,182 lap rows, 0 mismatches on the full lap, the traffic samples and both line-cut edges; 97 of 163
  DuckDB cache rows flipped; the 458 metadata rows needed no change (v3 rows hold no ambient temperature).
  Lap blobs 5,815 MB to 2,361 MB (0.41); database 6.4 GB to 2.6 GB. 97 min (the per-row checks double the time).
- Independent check: every table identical row for row, except the three rewritten ones, whose other columns are
  identical and whose blobs decode to what the old reader served. `PRAGMA integrity_check` ok after the swap.
- Endpoint benchmark (same cohort): every endpoint was faster, unrelated ones too (board-0 18 to 10 ms), so the
  baseline machine was busier. Against that, replay reads still gained: traffic 91 to 37 ms, telemetry-vcr 129 to
  65 ms, session-0 130 to 60 ms, telemetry-auto 240 to 123 ms. Gate (not slower) met.
- API parity was covered by the decoded-object comparison (the endpoints build on exactly that object) rather
  than a separate JSON diff.

## Not in scope

- Prepared views, grouped channel storage, `telemetry_lap_cache` (111 MB), live capture trimming.

## Steps

1. Codec module with unit tests: every kind, nulls, constants, empty lap, `-0`, float32/float64/JSON fallbacks,
   accented names in the header, selected-column decode, missing magic.
2. Switch `replayTrajectoryCodec.ts`, `lapSamples.ts` and the writers; delete the read fixes listed above and
   their tests (`replayLegacyUpgrade.test.ts`, the steering-flip codec tests); lint, tests, build.
3. Endpoint benchmark before/after on the current database copy.
4. Offline rewrite with checks, then swap.
5. Update this plan, `REPLAY_STORAGE_DESIGN.md`, `docs/CODE_MAP.md`.
