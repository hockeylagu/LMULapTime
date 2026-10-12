# VCR import performance analysis

## Commit-preparation review — 2026-10-12

Documentation links and recorded timing arithmetic were checked against the local
reports. Historical prototype recommendations are separated from current behavior;
the storage redesign remains a rejected POC, not an implemented migration.
Architecture and reproduction instructions now include the repository benchmark
scripts instead of requiring ignored scratch harnesses.

The review fixed preservation of the stored default driver when an upgrade runs
with a different configured player, counts committed drivers when cancellation
precedes the final batch summary, and isolates an unavailable primary slot from
other requested drivers. Regression tests cover the in-memory and file-backed
worker paths. The full workspace test run passed 2,541 tests (56 skipped), and
the production build passed without warnings. Other concurrent changes were
present in that workspace; this review focuses on the replay ingestion change.

The repository harness was smoke-tested in raw-handoff, direct-save and one-scan
modes on the real recording's player: 33 laps / 185,101 points. Decompressed blobs,
normalized rows and final database sizes matched across all three; cached response
hashes matched between direct-save and one-scan modes. These
smoke runs validate reproduction and review fixes; they do not replace or extend
the two full-field performance pairs below. The earlier endpoint sweep was not
rerun during this review because the fixes concern upgrade coordination.

## One source scan with the existing storage schema — 2026-10-12

Background ingestion and upgrades now route all pending drivers during one replay
frame-stream traversal. The worker copies pose payloads and their channel-state
snapshots into bounded, losslessly compressed temporary chunks. After the scan,
it consumes one driver's chunks, runs the canonical lap finalizer once, encodes
each lap immediately and commits that driver through the existing writer. No
full-field decoded object graph or full-object worker handoff is needed.

The production schema, quality-6 Brotli compression, stored sample precision,
normalized facts and default pointers are unchanged. There is no migration,
parser-version bump or additional persisted representation. Existing cached
reads keep their current preparation logic. Single-driver on-demand extraction
keeps its direct path, without temporary packet staging.

### Full-field measurements

The workload is the same 945,797,856-byte Daytona recording: 61 drivers, 1,348
laps and 10,872,492 points. The control uses a fresh direct-save worker and a
source traversal per driver; the integrated mode uses one worker and one frame
traversal. Both use the canonical decoder/writer and new isolated WAL databases.
Timings include worker startup, scanning, temporary staging, lap finalization,
compression and commits. They exclude initial metadata discovery and subsequent
verification. Filesystem reads are warm, and the scratch databases contain no
linked XML sessions to reclassify. Each mode ran twice, sequentially, with one
scan followed by the sequential control in each pair. These are local
measurements of one recording, not a general performance guarantee.

| Measurement | Sequential direct saves | One scan | One scan repeat |
|---|---:|---:|---:|
| Complete ingestion | 117.73 s | 99.49 s | 88.10 s |
| Peak process RSS | 580 MiB | 775 MiB | 762 MiB |
| Temporary SQLite allocation | 0 | 421 MiB | 421 MiB |
| Final SQLite database | 165,998,592 B | 165,998,592 B | 165,998,592 B |
| Trajectory blobs | 162,005,898 B | 162,005,898 B | 162,005,898 B |

The sequential repeat took 115.52 seconds (562 MiB peak RSS), again producing a
165,998,592-byte database. The two paired savings were **18.24 seconds (15.5%)**
and **27.43 seconds (23.7%)**. Average import time fell from **116.63 to 93.79
seconds: 22.83 seconds saved (19.6%)**. Logical source traversals drop from 61 to
one, but compression and per-driver finalization remain substantial work.

### Costs and correctness

The working-space tradeoff is explicit: 441,024,512 bytes of allocated SQLite
TEMP pages in this recording, outside the application database. Chunks are
deleted as drivers are consumed; SQLite releases the temporary file on worker
close or termination. It does not shrink the allocated file after every driver.
Peak RSS increased by about 195 MiB in the first comparison. Packet staging is
bounded per driver, but finalization still materializes one driver's samples.

The repeat finished its stream scan at 15.34 seconds and committed the first
driver at 16.97 seconds. Sequential background ingestion had its first driver
saved at 2.36 seconds. The whole field finishes sooner, while automatic first
availability is later. Uncached interactive requests retain the direct
single-driver worker path; concurrent interactive/import latency was not timed.

All 1,348 decompressed trajectory JSON hashes match within both fresh pairs
and against the earlier pre-staging control. All normalized lap, condition, driver-event,
running-order, replay-wide fact, default-pointer and ingest rows match after
excluding write timestamps. SQLite integrity checks pass. The final databases
are exactly the same size, including tables and indexes.

Ten alternating warm cached reads returned identical response hashes for the
player default, another driver's default and player lap 2. Medians were
14.35 / 13.50 ms, 12.27 / 10.64 ms and 12.24 / 13.24 ms (control / one scan).
These small differences are noise, not evidence of a read-path improvement.

At measurement time the full suite passed: 2,535 tests, 56 skipped; production build passed without
warnings. Regression checks cover source-buffer reuse, channel changes across
chunks, absent timing packets, late weather/pit events, unavailable slots,
per-driver rollback, cancellation/resume and committed data surviving a later
worker failure.

The production HTTP endpoint sweep also passed with 20 warm samples per case on
the same dataset/cohort as the earlier worker-persistence sweep, with no flagged
regression. It serves existing caches and does not measure simultaneous ingestion
and interactive requests. See [endpoint history](ENDPOINT_BENCHMARKS.md).

Original local results and scratch harnesses are retained under `.tmp/vcr-deep/`
(ignored by Git, not available from a fresh checkout):
`ingestion-direct-full.json`, `ingestion-direct-repeat.json`,
`ingestion-packets-full.json`, `ingestion-packets-repeat.json`,
`ingestion-cached-reads.json` and the corresponding
`compare-*.json`. Scratch databases are removed after verification.

```powershell
node tools/benchmarks/replayIngestion/run.mjs direct '<VCR path>' .tmp/replay-ingestion/before 61
node tools/benchmarks/replayIngestion/run.mjs once '<VCR path>' .tmp/replay-ingestion/after 61
node tools/benchmarks/replayIngestion/compare.mjs .tmp/replay-ingestion/before .tmp/replay-ingestion/after
node tools/benchmarks/replayIngestion/reads.mjs .tmp/replay-ingestion/before .tmp/replay-ingestion/after
```

The repository harness requires a unique player; supply a player name after the
driver count if local profile detection cannot identify one. It refuses existing
output prefixes and never opens the application's cache. It reports checkpointed
database size after timing. Its cached-read cases use the primary default, an
available rival and the primary's first stored lap; the historical fixed lap-2
measurements above came from the original scratch harness. Remove generated
`.db`, `.db-wal` and `.db-shm` files after comparing, keeping the JSON reports.

The next performance investigation should profile post-scan sample decoding,
lap building, columnar/JSON encoding, Brotli compression and saving separately.
A bounded compression pool is a candidate only if profiling justifies it;
no additional speedup has been measured. Retain quality 6 and the current format
unless a separately validated change improves the storage/read priorities.

## Direct worker persistence — 2026-10-12

Production imports now decode, encode and save each driver inside the worker. The
worker opens its own connection to the existing WAL database and acknowledges
completion only after closing it following commit. The main thread receives only
the resolved driver slot and default lap; on-demand requests then read their lap
from SQLite. Background ingestion and version upgrades use the same path.

The canonical `dbReplayDriverStore.ts` prepares lossless quality-6 Brotli blobs
before acquiring the writer lock. One immediate transaction replaces the driver's
laps, stores normalized facts, reclassifies linked sessions, updates defaults and
records completion. Before writing, it verifies the replay's size/mtime and the
metadata row's source identity. Failed transactions roll back; storage and source
changes remain retryable interruptions. Private `:memory:` test databases retain
main-thread persistence because their connections cannot be shared with workers.

A new paired full-field run used the same Daytona recording and isolated caches.
Both modes used the same decoder and canonical writer, with a fresh worker per
driver. The control transferred full trajectory objects and saved on the main
thread; the integrated path saved directly inside the worker. Each mode ran once,
sequentially, with warm file reads. The measurements include startup, decode,
handoff and save, excluding metadata discovery and later verification. The empty
scratch caches had no linked XML sessions to reclassify.

| Measurement | Object handoff / main save | Direct worker save |
|---|---:|---:|
| Complete 61-driver pipeline | 161.29 s | 126.63 s |
| Peak process RSS, including workers | 1,199 MiB | 592 MiB |
| Largest delay beyond a 10 ms event-loop timer | 1,425 ms | 17.65 ms |
| Stored trajectory bytes | 162,005,898 | 162,005,898 |

This run saved **34.66 s (21.5%)** and roughly **51% peak RSS**. The timer is a
responsiveness probe, not an HTTP latency benchmark. Absolute times differ from
the earlier prototype measurements below; compare within each experiment.

Every decompressed trajectory JSON hash matched across all 1,348 laps and
10,872,492 points. Defaults, lap facts, conditions, driver events, running order,
replay-wide facts and ingest markers matched after excluding write timestamps.
Both databases passed SQLite integrity checks. Three cached-lap read cases also
returned identical responses; their medians remained approximately 10–14 ms.

The full test suite passed (2,512 tests; 56 skipped), and the production build
passed without warnings. Worker tests cover real file-backed ingestion, upgrades,
on-demand reads, rollback and stale source identities.

Local artifacts: `.tmp/vcr-deep/direct-control.json`, `direct-worker.json`,
`compare-direct-control-direct-worker.json` and `direct-cached-reads.json`.
The repository harness can reproduce the two modes with new output prefixes:

```powershell
node tools/benchmarks/replayIngestion/run.mjs raw '<VCR path>' .tmp/replay-ingestion/object-handoff 61
node tools/benchmarks/replayIngestion/run.mjs direct '<VCR path>' .tmp/replay-ingestion/worker-save 61
node tools/benchmarks/replayIngestion/compare.mjs .tmp/replay-ingestion/object-handoff .tmp/replay-ingestion/worker-save
```

## Earlier prototype analysis — 2026-10-11

The following sections preserve the original prototype evidence and recommendations.
They describe the pre-integration pipeline, not current production stage costs.
The quality-1 variant was not adopted because permanent storage size has priority.

Transferring compressed cache payloads from the worker was a worthwhile improvement.
It reduced a complete 61-driver import by **26% without changing compression or
stored data**. Combining it with four-driver scans and Brotli quality 1 reduced
the import by **54%**, with **17% larger trajectory blobs**.

### Historical workload and method

- Daytona International Speedway Road Course R1 7.Vcr: 945,797,856 bytes,
  approximately 66 minutes, 61 drivers.
- All drivers, all 1,348 laps, full resolution: 10,872,492 stored points.
- Current optimized decoder, fresh worker per driver or batch, sequential work.
- Actual `SessionDatabase.replaceReplayDriverLaps` transactions against new,
  isolated file-backed SQLite databases with production WAL / NORMAL settings.
- Each full-field variant ran once. Three-driver pilots confirmed the ranking.
  This establishes a large effect on this recording, not a general performance SLA.
- Timings include worker startup/imports, decoding, result handoff and persistence.
  Output hashing, database integrity checks and later cache comparisons are excluded.
  Directory discovery and linked-session reclassification were not exercised: the
  scratch databases contain replay data, not the user's existing sessions.
- File-system reads were warm. Logical bytes read are not physical disk traffic.

The experimental implementations are confined to `.tmp/vcr-deep`. Production code
was not changed for this analysis. The shared-scan prototype retains the existing
packet decoder and per-driver lap builders, collecting only the requested slots.
The compressed-handoff prototype sends canonical columnar Brotli blobs through
transferable buffers, plus compact per-lap spans and replay-wide facts. It uses the
existing fact writer and transaction path with a benchmark-only pre-encoded blob
insert. It does not decompress the full trajectories on the main thread.

### Historical full-field results

| Variant | Import time | Saved | Trajectory blobs |
| --- | ---: | ---: | ---: |
| Current pipeline: one scan per driver, object handoff, Brotli 6 | 133.25 s | — | 162.01 MB |
| Shared scans: four drivers per scan, object handoff, Brotli 6 | 110.48 s | 22.77 s / 17.1% | 162.01 MB |
| One scan per driver, compressed-buffer handoff, Brotli 6 | 99.01 s | 34.24 s / 25.7% | 162.01 MB |
| Four drivers per scan, compressed-buffer handoff, Brotli 1 | 60.71 s | 72.54 s / 54.4% | 189.27 MB |

The combined case is 2.19 times as fast. Its additional blob storage is 27.27 MB,
or 16.8%. Both compression levels remain lossless and readable by the existing
Brotli decoder. A different compression level does not require a cache version bump.

Shared scans reduced traversals from 61 to 16 and logical reads from 57.81 GB to
15.16 GB. Their benefit is limited by work still needed for every driver's samples,
and object transfer remains expensive when the result shape is unchanged.

### Where the pre-integration pipeline spent time

| Stage | Total across 61 drivers |
| --- | ---: |
| Worker startup and imports | 6.42 s |
| Decode and lap finalization | 53.61 s |
| Result serialization, transfer and deserialization | 33.09 s |
| Main-thread persistence | 40.13 s |

File reads consume 6.55 s **inside** decoding. Inside persistence, instrumentation
measured 20.18 s in Brotli compression, 8.14 s in JSON serialization and 1.74 s in
SQL statement execution. The remaining approximately 10.06 s includes columnar
conversion, UTF-8 buffers, fact preparation, statement preparation and transaction
overhead. Optimizing SQL alone would address a small part of the total.

With compressed handoff at the unchanged quality 6, transfer fell to 0.78 s and
main-thread persistence to 1.71 s. Columnar conversion and compression moved into
the worker; they were not eliminated or omitted from the measured import time.
This also removes substantial synchronous work from the HTTP server's thread.

Separate eight-driver runs disabled in-loop output hashing for a cleaner memory
comparison. The current pipeline peaked at 1,105 MiB RSS; compressed handoff at
quality 6 peaked at 607 MiB, a 45% reduction. Import time was 18.89 s versus
14.49 s, confirming the speed benefit without the verification workload. The
full-field runs' RSS values include verification and are diagnostic, not clean
production memory estimates. Large batches still need an explicit memory budget.

An isolated player-lap compression comparison measured quality 1 at 72 ms,
quality 4 at 256 ms and quality 6 at 518 ms. Their payload sizes were respectively
4.71 MB, 4.28 MB and 4.05 MB. Quality 4 is a possible storage/speed compromise,
but a full-field quality-4 run was not performed.

### Historical correctness and cached reads

Every experimental database passed SQLite `integrity_check`. All 1,348 trajectory
blobs were decompressed and hashed against the baseline: the full columnar JSON
was identical, including point counts and lap identities. All normalized lap,
condition, incident, running-order, ingest and default-pointer rows matched after
excluding write timestamps. These checks cover all 10.87 million stored points.

Ten alternating warm cached reads per case also returned identical results:

| Cached request | Current quality 6 | Combined quality 1 |
| --- | ---: | ---: |
| Player default lap | 11.95 ms | 12.30 ms |
| Another driver's default lap | 9.19 ms | 9.43 ms |
| Player lap 2 | 11.49 ms | 11.81 ms |

These small read differences do not suggest a material cached-read penalty, but
the sample is limited to three requests. Faster ingestion does not imply faster
already-cached endpoints.

### Original recommendations and current disposition

1. Remove full-object worker handoff while keeping compression quality 6. This is
   now implemented through direct worker persistence, as described above, without
   a cache-format migration or disk-size tradeoff.
2. Bounded multi-driver scanning is now implemented with temporary packet chunks,
   as measured above. Fixed groups of four were only the earlier prototype setting.
3. Lower Brotli quality was not adopted: it increased retained storage. Quality 6
   remains the production setting; quality 4 has no full-field acceptance evidence.
4. Preserve per-driver failures, atomic driver-lap replacement, primary-driver
   availability, file identity checks and cancellation when integrating the new
   worker protocol. The successful-recording prototype does not replace these tests.

In the historical workload, worker reuse alone could remove at most the measured 6.42 s of startup overhead
before accounting for possible JIT effects. More parallel workers and a native
decoder are lower priorities than removing the expensive object handoff.

Raw measurements, comparison hashes and harnesses are retained under
`.tmp/vcr-deep/`: `field-single.json`, `field-batch4.json`, `field-packed6.json`,
`field-packed1-batch4.json`, `compare-*.json`, `memory-*.json`, and
`cached-reads.json`. Scratch SQLite databases were removed after validation.

The following are the original prototype commands, using the pre-integration
store implementation. Their pre-encoded upsert override is incompatible with the
new canonical driver writer; use the direct-persistence harness above for current
code. Each label named a new scratch database; no production cache was opened.

```powershell
node .tmp/vcr-deep/generate-prototype.mjs
node .tmp/vcr-deep/run.mjs '<VCR path>' field-single 1 61
node .tmp/vcr-deep/run.mjs '<VCR path>' field-batch4 4 61
node .tmp/vcr-deep/run.mjs '<VCR path>' field-packed6 1 61 6
node .tmp/vcr-deep/run.mjs '<VCR path>' field-packed1-batch4 4 61 1
node .tmp/vcr-deep/compare.mjs field-single field-batch4
node .tmp/vcr-deep/compare.mjs field-single field-packed6
node .tmp/vcr-deep/compare.mjs field-single field-packed1-batch4
node .tmp/vcr-deep/read-cache.mjs field-single field-packed1-batch4
```
