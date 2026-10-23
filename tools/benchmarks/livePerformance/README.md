# Live performance audit harness

This is an isolated synthetic benchmark, not a recorder or a game REST load test. It uses the real binary layouts, coherent decoder, `LiveReader` in a worker, `LiveService`, SSE serializer, browser hook, React dashboard, pedal buffer and canvas. It does not access the application database or LMU. The source is a 64-car in-memory fixture; Windows mapping/Koffi and the game producer are excluded.

## Reader allocation benchmark

Run `node --expose-gc --import tsx tools/benchmarks/livePerformance/allocations.mjs` from the repository root.
This separate synchronous workload uses private synthetic Windows mappings and the production
`openMapping`/coherent decoders (ordinary buffers off Windows). It never opens the game's mappings,
REST endpoints or application database. No browser or running backend is required.

It warms 10,000 ticks, collects garbage, then measures 200,000 ticks: 50 Hz telemetry with capture,
5 Hz scoring for 64 cars and a 2 Hz car-condition decode request. Set `LIVE_ALLOCATION_TICKS` to
change the measured count. The original decoder ignores the car-cadence argument and decodes it
at 50 Hz. A checksum consumes both streams. Minor collection counts/durations come from Node's
GC performance observer; mapping read counters distinguish allocating copies from reused copies.

On 2026-10-22, one before/after run on this Windows host (Node v24.21.0) produced:

| Measurement | Before | After |
|---|---:|---:|
| Decode/FFI elapsed time | 2,553.83 ms | 1,011.47 ms |
| Minor collections | 270 | 93 |
| Minor collection duration | 23.27 ms | 7.87 ms |
| Allocating mapping reads | 240,000 | 0 |
| Bytes copied by allocating mapping reads | 1,136,320,000 | 0 |
| Bytes copied into reused storage | 0 | 1,136,320,000 |
| Checksum (warmup included) | 189,000 | 189,000 |

This is about 60% less elapsed time and 66% fewer minor collections in the isolated workload.
These counters exclude the original scoring `Buffer.concat` allocation and do not mean the whole
pipeline is allocation-free. Independent decoded samples and worker/SSE transport still allocate.
The loop compresses 4,000 seconds of nominal polling into a burst: GC heap sizing, wall-clock
cadence, producer races, disk writes and browser behavior differ during an actual LMU session.
It does not measure the reader's JSON suppression or navigation/cadence scheduling changes.

## Dashboard harness

From the repository root, run `npx tsx tools/benchmarks/livePerformance/harness.ts`. This builds a small production frontend and serves it on `127.0.0.1:3099`; its isolated WAL database and output live under `.cache/live-performance/`.

In another PowerShell terminal:

```powershell
$env:LIVE_PERF_NODE_MODULES = 'absolute/path/to/node_modules-containing-playwright'
# Defaults to installed Edge; set LIVE_PERF_BROWSER to another installed Playwright channel if needed.
node tools/benchmarks/livePerformance/run.mjs
node tools/benchmarks/livePerformance/schedule.mjs
node tools/benchmarks/livePerformance/restFailure.mjs
```

Stop the harness with Ctrl+C after capturing results. The runner warms every dashboard for 32 seconds before its measured phase. Each measured browser phase lasts 20 seconds at 2560 × 1440, DPR 1. Close other heavy work before running. No dependencies are installed by these scripts.

`results.json` contains server process CPU (including the synthetic producer/worker), worker transport and sample age, event-loop delay, browser delivery/draw age, canvas command duration, and Chromium renderer task duration. CPU percentages use **one logical core = 100%**, not total machine capacity. Renderer task time is a main-thread workload proxy, not total browser process/GPU CPU. The browser observer adds one extra JSON parse per pedal batch and wraps canvas methods. Draw age ends at canvas command submission, not GPU completion or physical display presentation. Quantiles use integer wall-clock sample timestamps; sub-millisecond transport cannot be resolved.

The producer targets 100 Hz telemetry and 5 Hz scoring; Windows timer granularity can reduce actual rates. The reader retains production scheduling (20 ms recursive timeout); inspect measured frame counts instead of assuming 50 Hz. Stable fixed laps do not exercise lap crossings, long race histories, cold identity lookups, slow disks or all strategy branches. Mock REST success/failure bodies exercise stream integration but do not measure game REST processing.

`schedule.json` advances the actual poller's injected clock/interval for ten minutes per mode, excludes the first two minutes from steady-state request rates, and uses instantaneous successful mock replies. Periods are therefore optimistic. `rest-failure.json` fault-injects slow trickled and truncated bodies against an ephemeral localhost server. It redirects only this probe process's HTTP calls, never binds or contacts LMU's port. Its response error observer prevents an unhandled error from terminating the diagnostic process; it does not settle the application's pending promise.
