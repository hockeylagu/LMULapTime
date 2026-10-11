# Endpoint performance history

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

Implementation: `tools/benchmarks/{benchmarkEndpoints,endpointHarness,endpointInventory,endpointCases,endpointReport}.ts`.
Tests: `test/tools/benchmarks/endpointBenchmarks.test.ts`. The benchmark tools are included in the
TypeScript build; runtime reports and private identifiers are not committed.
