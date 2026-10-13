# Endpoint performance history

## Class personal-best badge review — 2026-10-13

A five-sample endpoint sweep passed after expanding gold-badge history to all cars and
recordings within the selected layout and class. Picker medians were 21.35 ms for the
player and 27.01 ms for all drivers. No matching baseline was captured for this review,
so no latency delta is claimed. The full ranking is retained in
`.cache/pb-scope-review/latest.md`.

## Session telemetry lap locators — 2026-10-13

Session telemetry now lists the selected driver's session laps, excluding replay-only segments
that have no session locator while retaining invalid session laps. Five-sample endpoint sweeps
completed before and after the change. The database snapshot hashes differed, so no latency
delta is claimed. After-change medians were 175.40 ms for automatic telemetry and 84.69 ms
for native replay telemetry; telemetry remained among the slower endpoints in the ranking.
Reports are retained in `.cache/lap-locator-benchmark-before/latest.md` and
`.cache/lap-locator-benchmark-after/latest.md`.

## Comparison personal-best scope — 2026-10-12

Session locators no longer narrow the history used for personal-best badges. A five-sample
endpoint sweep completed with picker medians of 14.68 ms (player) and 14.48 ms (all drivers).
The attempted before sweep failed on sandbox loopback access, so no before/after latency claim
is made. The successful report is retained in `.cache/selector-pb-benchmark/latest.md`.

## Primary-driver resolution and cached promotion — 2026-10-12

Five-sample before/after sweeps used the same dataset (`fd7875490434`) and cohort. The first
after run flagged one session-detail median (+20.4%, +17.94 ms); a second isolated sweep did
not reproduce any regression against the original baseline above the >20% and >5 ms threshold.
These cached endpoints do not exercise missing-primary ingestion. Worker regressions verify
that an existing explicit driver is promoted to primary without another stream scan or lap-blob
rewrite, including a configured-player change. No cached-endpoint latency improvement is claimed.
Local baseline and both follow-ups are retained in `.cache/primary-before/history/`.

## GPS timeline result transfer — 2026-10-12

Five-sample before/after endpoint sweeps used identical dataset/cohort and showed no regression
above the >20% and >5 ms threshold. These cached requests do not exercise the changed cold reader.
A separate read-only six-lap extraction sweep across two real recordings returned identical complete
output hashes, with GPS rows transferred into JavaScript falling from 2,271,537 to 83,129 and total
extraction from 3,152 to 1,878 ms. This single sequential sweep is not a cold-disk or sustained-load
measurement. DuckDB still scans GPS internally for insertion-order boundary indices; only the lap
timestamp window is returned. See [reader details and verification](plans/archive/SERVER_SMELLS_AUDIT.md).
Local outputs are `.cache/gps-endpoints-{before,after}/` and `.cache/gps-profile-{before,after}.json`.

## DuckDB preparation cleanup — 2026-10-12

Before/after sweeps used the same snapshot/cohort with five warm samples per case. No endpoint
crossed the >20% and >5 ms regression threshold. Fused telemetry was effectively unchanged
(172.03 → 172.13 ms median). These requests serve retained lap caches and do not exercise cold
DuckDB extraction, so they cannot measure the benefit of sector lookup, reader reuse or shared
cold operations. Correctness tests cover those paths and one cache write for simultaneous reads.
Local results are `.cache/duckdb-cleanup-before/` and `.cache/duckdb-cleanup-after/`.

## Replay repeated-work recheck — 2026-10-12

The before run used five warm samples; the final after run used 20, with identical cohort
and database snapshot (`fd7875490434`). No endpoint crossed the >20% and >5 ms regression
threshold in the final run. Native replay telemetry median was 88.89 ms versus 93.96 ms;
fused telemetry was 170.41 ms versus 187.83 ms. Replay-cache listing was effectively unchanged
(219.51 ms versus 220.20 ms). Small sample counts and unrelated concurrent checkout edits
limit attribution; these timings do not measure live ingestion or cold DuckDB reads.

An initial five-sample after run showed slower comparison endpoints; an isolated 20-sample
repeat returned 23.24/28.35 ms versus the original 23.60/27.72 ms, so that regression did not
reproduce. Local outputs are `.cache/replay-smells-before/` and `.cache/replay-smells-after/`.
Synthetic edge tests independently verify fewer point objects (18,000 → 6,200), blob selects
(four → three) and lap-fact reads (three → one), with compatibility semantics preserved.

## One replay source scan, unchanged storage — 2026-10-12

The endpoint sweep passed with 20 warm samples per case on the same fixed cohort
and snapshot (`fd7875490434`) as the earlier direct-worker run. No case crossed
the harness's regression threshold (>20% and >5 ms). Replay telemetry was 93.47 ms
median versus 90.15 ms previously; replay-cache listing was 225.44 ms versus
223.34 ms. These are cached HTTP requests and do not exercise live ingestion.
Concurrent unrelated working-tree changes are also present, so small timing
differences should not be attributed to this ingestion change. The controlled
lap-cache comparison returned identical responses with roughly 11–14 ms medians.
See [the complete ingestion measurements](VCR_PERFORMANCE_ANALYSIS.md) for the
separate import benefit, identical database sizes and temporary-space tradeoff.

## Direct replay worker persistence — 2026-10-12

The production endpoint sweep completed successfully with 20 warm samples per
case after integration. The fixed cohort was retained, but the database snapshot
changed (`fd7875490434`), so the harness correctly withheld comparisons against
the previous run. This sweep serves retained recordings and does not time live
VCR imports. The slowest warm cases were replay-cache listing (223 ms median),
native telemetry (158 ms) and traffic (151 ms); replay telemetry was 90 ms.
Direct worker writes target import time and main-thread responsiveness, rather
than these existing cached-read costs. See [the paired replay import measurements](VCR_PERFORMANCE_ANALYSIS.md)
for the controlled before/after result and full data-equivalence checks.

## Fixed class identity correction — 2026-10-11

The fixed Spa/Fuji cohort's class was explicitly updated from legacy `LMGT3` to the stored `GT3`
identity, preserving its layouts, session IDs and telemetry locator. This changes the cohort fingerprint;
the first corrected run is a new baseline and must not claim a speed change against the old requests.
Legacy-cohort leaderboard, track and comparison timings after exact class matching was introduced
were measuring empty results, including the corresponding rows in the identity-cleanup table below.
Do not use those rows as performance evidence. Other request timings are unaffected by this correction.

Representative board, track and comparison cases now require non-empty `entries`, `sessions` or
`laps` in every response. Missing, malformed or empty collections fail the case rather than report a
fast success. JSON history records the first response's result count. When an identity changes again,
review and explicitly edit the fixed cohort; do not silently normalize API classes or rediscover a faster cohort.
The player PB request uses the saved telemetry driver ordinal, so missing raw XML `isPlayer` flags
do not silently remove that case from subsequent sweeps.

## Exact identity cleanup — 2026-10-11

Baseline `2026-10-11T05-22-40.838Z.json` and final `2026-10-11T06-11-12.384Z.json`
use the same source snapshot hash (`329dd3acf8ea923c8bc2ae0270715675d77579077b9c8ed1d07d815a2741d9df`),
fixed cohort, runtime/plugins and 20 warm samples. The isolated snapshot's versioned summaries are
rebuilt before timing. All measured requests succeeded, none were skipped, and no material
regression met the harness threshold. An intermediate run overlapping the full test suite was
excluded from the comparison.

| Request | Baseline median (ms) | Final median (ms) |
|---|---:|---:|
| Dashboard | 12.61 | 12.16 |
| Track summaries | 9.36 | 8.73 |
| Comparison, player / all | 20.35 / 21.20 | 19.42 / 20.48 |
| Telemetry picker, player / all | 5.39 / 5.15 | 5.17 / 5.17 |
| Large session details | 85.70 / 70.91 | 81.26 / 62.99 |
| Automatic telemetry | 162.91 | 168.99 |
| Replay telemetry | 95.55 | 87.92 |
| Traffic | 162.08 | 146.10 |

Track/dashboard payloads now include explicit venue/course identity; comparison, session-detail and
telemetry payload sizes are unchanged. These are cached-data HTTP timings, not live-game/browser
or concurrent-ingestion measurements. Full reports remain in the ignored local history folder.

Run `npm run benchmark:endpoints` before and after features or optimizations that affect API queries,
processing or payloads. The purpose is to identify the slowest responses and detect when new work
makes an existing endpoint slower. The weekly Codex check uses the same command (Sunday, 9 a.m.
America/Toronto) and reports actionable regressions, request failures and inventory gaps.

## Run and compare

```powershell
npm run benchmark:endpoints
```

The command uses the actual Express routers and services over loopback HTTP. A running dev server
is not required. It takes a consistent SQLite backup, including committed WAL data, and starts an
isolated server with scans and external refreshes disabled. Requests are sequential; timing includes
Express processing, serialization and receipt of the entire response body, with a fresh HTTP connection
for each sample. JSON parsing by the benchmark client and browser rendering are excluded.

The first request is recorded separately, followed by 20 warm samples (median, nearest-rank p95,
minimum and maximum). The first request is not a cold disk/OS-cache measurement, and earlier cases
can have warmed shared state. Optional requests without matching data are explicitly skipped;
failed HTTP requests are errors, not successful timing samples. Traffic's first request can build a
worker-based index. The snapshot allows ordinary GET-side cache writes and rival updates without
changing the user's records. Telemetry serves retained recordings, without decoding live VCR files.
This is a controlled cached-data benchmark, not a measurement under ingestion or concurrent load.

Versioned session summaries are rebuilt on the isolated copy before timing ready-state responses;
rebuild failures stop the run instead of recording misleading 503 timings.

The source database is opened read-only; snapshot creation is outside the timed requests. Allow
temporary free disk space approximately equal to the database size. The snapshot and its journal
files are deleted on normal completion or handled errors. If the process is forcibly terminated,
a `snapshot-*` directory may remain under the output folder and can be removed when no run is active.

Results stay local in the ignored `.cache/endpoint-benchmarks/` directory:

- `latest.md`: endpoints ranked by warm median, first-request and p95 times, response sizes, failures/skips and changes.
- `history/<timestamp>.json`: every timing sample, exact URLs, status/bytes, telemetry source/point count,
  dataset fingerprint/counts, fixed-cohort fingerprint, machine/runtime/plugin identity, Git revision and working-tree diff fingerprint.
- `history/<timestamp>.md`: an immutable report for each run.
- `cohort.json`: the fixed boards, large sessions and cached telemetry lap selected on the first run.

The report compares with the previous run only when dataset SHA-256, cohort, sample count,
machine/runtime and geometry package match. Dataset changes can explain slower responses without a
code regression; their deltas are withheld. The Git revision/diff fingerprint identifies the tested code,
including uncommitted work. Compare the two saved reports after making a feature change. Median
increases exceeding **both 20% and 5 ms** are flagged; rerun without other heavy work to confirm them.
p95 is shown for tail latency, but 20 samples are a diagnostic, not a statistical performance guarantee.
The CLI exits nonzero for request/coverage failures. A regression flag needs investigation, not an
automatic assertion that the feature is at fault.

Use the same sample count and dataset for before/after work:

```powershell
npm run benchmark:endpoints -- --samples 50
npm run benchmark:endpoints -- --db C:\path\to\retained-cache.db
```

If the fixed cohort is no longer available, deliberately choose a new one with
`npm run benchmark:endpoints -- --refresh-cohort`. This starts a different comparison cohort;
the old results remain in history. `--output <directory>` selects a separate history/cohort directory.
Preserve the baseline history; do not refresh the cohort to hide a slow case.

## Endpoint coverage

`endpointInventory.ts` discovers literal routes in every `server/routes/*Routes.ts` file.
Both the command and its unit test fail if a GET route has no benchmark case, a case refers to a
removed route, or a new mutation has no explicit classification. If a router is mounted under a new
prefix, update the inventory's prefix mapping too. When adding a GET, add its real successful request
to `endpointCases.ts`, including any necessary fixed-cohort locator. Keep explicit skip reasons for
optional private data; never use a fast 404 as the success benchmark for a feature.

The sweep covers all API GET route patterns, with extra scenarios for pagination, two commonly used
layout/class boards, large session details, current/opponent personal bests, telemetry's native/fused
paths, the leaderboard comparator and telemetry lap picker. Static Vite bundles, images, and browser
rendering are outside the API inventory. GETs that refresh derived data are allowed only in the snapshot.

Every POST is listed with its exclusion reason: cache clear, scan, benchmark refresh,
rival pin, AI configuration and AI generation. Repeating these changes the workload or calls external
services, so they do not produce comparable site-read response times. AI generation needs a separate
controlled model/network/cost benchmark rather than a fake validation-error timing.

Implementation: `tools/benchmarks/{benchmarkEndpoints,endpointHarness,endpointInventory,endpointCases,endpointReport,endpointValidation}.ts`.
Tests: `test/tools/benchmarks/endpointBenchmarks.test.ts`. The benchmark tools are included in the
TypeScript build; runtime reports and private identifiers are not committed.
