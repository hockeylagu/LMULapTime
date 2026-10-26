# Performance checks

Use fresh measurements on the current implementation. Old per-change reports and cached test totals
are in Git history; they are not current rankings. Runtime reports belong in ignored `.cache/`.

## Endpoints

Run `npm run benchmark:endpoints` before and after API performance changes. The runner uses isolated
production routers and stores the cohort, dataset metadata and reports in `.cache/endpoint-benchmarks/`.
Compare identical dataset/cohort hashes and response counts; keep cold/warm behavior distinct. The
runner flags median regressions only when both 20% and 5 ms are exceeded. A short sweep identifies
candidates, not sustained-load or browser performance. Do not time AI/vendor errors as successful
application work or allow a benchmark to write hardware settings.

Implementation: `tools/benchmarks/benchmarkEndpoints.ts`, `endpointHarness.ts`, `endpointInventory.ts`,
`endpointCases.ts`, `endpointReport.ts` and `endpointValidation.ts`.

## History query costs

The remaining candidate is broad count/special-best work in
`server/core/sessionSummaries/comparisonQueries.ts`. Profile SQL fetch, hydration and domain work
separately and preserve query plans. Different history consumers have different lap eligibility;
a single universal clean-lap filter is not an optimization. Preserve bounded page hydration.
A historical 10,000-session/200,000-lap synthetic sweep left comparison around 419 ms after dashboard
aggregation improved; this only motivates remeasurement, not a current target or latency claim.

## Replay ingestion

Measure end-to-end time until usable, not just packet scanning. Include worker/module startup,
finalization, compression, source validation, SQLite commits and dependent preparation. Record
peak memory, main-loop delay, total database size, WAL/temp peak and first-driver availability.
Use paired runs on the same source and compare decoded output/database parity. Current storage is
specified in [replay cache format](../REPLAY_CACHE_FORMAT.md); speculative prepared views are
[separate work](../plans/proposed/REPLAY_STORAGE_DESIGN.md).

## Live overhead

The isolated [live benchmark harness](../../tools/benchmarks/livePerformance/README.md) covers
reader/decoder/worker/SSE/React/canvas behavior with synthetic inputs. It does not measure LMU's
producer, actual REST cost, game CPU/frame pacing or Windows mapping cost where excluded by the
scenario. A separate matched in-game comparison is required for those claims. Preserve queue bounds,
worker-owned buffers and recording ownership when optimizing allocations. Do not tune cadence or
retention from old synthetic timing alone.
