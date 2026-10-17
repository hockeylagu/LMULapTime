# Preventive live pipeline performance audit

Audit date: 2026-10-16, America/Toronto. Application revision: `2f549d1583153b75ed8a255add9090287f35cba1`. No production behavior was changed.

## Assessment

The measured application pipeline has substantial CPU headroom, and three dashboard connections did not increase p95 pedal draw age. The first preventive change should address REST request settlement/deadlines, followed by coordinated polling and latency observability. There is no evidence here that replacing SSE or rewriting the canvas is necessary.

LMU was unavailable (`127.0.0.1:6397` refused connections). Consequently, **true game-to-screen latency, game REST execution cost, game CPU impact, and Windows mapping/Koffi costs were not measured**. These results cover an isolated synthetic source through real application decoding, worker messaging, service processing, SSE, production React components, and Chromium canvas commands.

## Measured application pipeline

Environment: Windows, AMD Ryzen 7 5700X3D, 16 logical processors, Node 24.21.0, headless Edge Chromium 155.0.4283.45. Production dashboard bundle, 2560 × 1440, DPR 1; 64-car scoring fixture. Every measured dashboard had a full 30-second trace after 32 seconds of warmup. Browser phases lasted 20 seconds; the no-dashboard phase lasted 10 seconds. The isolated database used WAL and the production audit writer.

| Measurement | One dashboard | Three dashboards |
|---|---:|---:|
| Node process CPU, % of one core | 0.62% | 0.86% |
| Renderer main-thread task time, per page | 0.80% | 0.79–0.81% |
| Worker post → main thread, p95 | 1 ms | 1 ms |
| Latest source sample → main thread, p95 | 16 ms | 16 ms |
| Latest sample → browser event, p95 | 48 ms | 48 ms per page |
| Latest sample → canvas commands, p95 | 48 ms | 48 ms per page |
| Latest sample → canvas commands, maximum | 57 ms | 49 ms |
| Canvas command duration, p95 | 0.1 ms | 0.1–0.2 ms |
| Browser tasks over 50 ms | 0 | 0 |
| Pedal batches per second, per page | 21.6 | 21.6 |
| Timing events per second, per page | 6.65 | 6.4 |
| Full snapshots in measured window | 5 | 4 per page |

Node CPU includes the reader worker and synthetic producer, but excludes Chromium. Renderer task duration is a workload proxy, not total browser CPU: compositor, raster, GPU and browser-process costs are excluded. Percentages use **one core = 100%**; Task Manager's aggregate machine CPU scale is different. Short Windows CPU samples are noisy: the no-dashboard phase measured 1.09%, higher than the dashboard phases, so these numbers establish low absolute load rather than precise incremental scaling.

Worker frames arrived at approximately **32.4 Hz**, below the 50 Hz target. The reader recursively schedules 20 ms timeouts and the worker's synthetic producer schedules 10 ms intervals; observed Windows timer quantization reduced rates. Pedal batches were approximately 21.6 Hz versus the nominal 25 Hz flush target. This is a scheduling result from this environment, not proof of decoder saturation. LMU itself may change timer resolution. Measure actual rates with the game running before changing timers.

The server's event-loop histogram had p95 around 16.1 ms for all phases with a 10 ms monitor resolution; the same baseline occurred without dashboards. One-dashboard maximum was 31.9 ms and three-dashboard maximum 16.7 ms. Do not interpret the approximately 16 ms baseline as 16 ms spent processing each event. Audit inserts totaled 0.25 ms across two writes with one dashboard and 0.20 ms across two writes with three; this does not model slow storage or large history checkpoints. RSS includes the harness's in-process Vite build and is not a production-server footprint measurement.

The browser observer adds an extra pedal JSON parse and canvas wrappers. Draw age ends at command submission, **not physical screen presentation**. Latencies use the newest sample of each batch: older samples in the same batch are older by their sampling offsets. The fixture exercises changing VE snapshots but fixed lap counts; completed laps, long race histories, lifecycle transitions and every strategy branch are outside the timed phases.

Raw evidence: [pipeline results](live-results.json), [polling schedule](live-schedule.json), [REST failure probe](live-rest-failure.json). Reproduction and measurement definitions: [benchmark README](../../tools/benchmarks/livePerformance/README.md).

## Paths and intentional latency

```text
Plugin scoring/telemetry buffers
  → worker LiveReader: version checks, coherent bounded copies, decoder
  → worker postMessage
  → LiveService: deterministic tracking / snapshot comparison / optional audit
  → SSE: immediate snapshots, buffered pedals, throttled timing
  → EventSource / JSON.parse
  → React snapshot state OR small timing external store OR bounded pedal buffer
  → requestAnimationFrame → canvas commands → browser display pipeline

Game REST → LivePitPoller / LiveIdentityResolver / worker navigation probe
  → parsed updates → strategy / identity → snapshot SSE → React
```

The principal files are `server/live/liveReader.ts`, `rf2Decode.ts`, `liveService.ts`, `livePitPoller.ts`, `liveIdentityResolver.ts`, `lmuPitRest.ts`, `liveReaderWorker.ts`, `src/api/liveStream.ts`, and `src/components/live/LivePedalTrace.tsx` / `pedalBuffer.ts`.

Pedals have intentional reader scheduling (20 ms target), batch waiting (40 ms target) and an animation-frame wait. With ideal timer scheduling, those stages alone can add up to approximately 76 ms at 60 Hz before network and display processing; this is a budget illustration, not a guaranteed upper bound. Scoring freshness additionally depends on the plugin's approximately 200 ms publication period. Timing dispatch waits for the next flush and enforces a 100 ms minimum event interval, which rounds to 120 ms on an ideal 40 ms flush grid. Car/condition posting is limited to once per 500 ms; REST freshness is measured in seconds. A browser stream being healthy does not imply every REST-derived value is fresh.

Timing events can exceed the documented approximately 5 Hz because car updates also call `applyReading` and replace `pendingTiming`. The measured 6.4–6.65 Hz is consistent with this path; the implementation is still capped by `TIMING_MIN_INTERVAL_MS` and flush scheduling.

## REST polling freshness

The actual poller was simulated for ten minutes per mode with instantaneous successful replies and the production scheduling algorithm. Steady-state rates exclude the first two minutes. These are **scheduler measurements, not LMU HTTP response measurements**. Real response duration, failed reads, slow-answer backoff and mode transitions increase age.

| Request | Track average / maximum period | Garage average / maximum period |
|---|---:|---:|
| Navigation/replay state | 7.27 / 10 s | 10 / 10 s |
| Standings / VE | 3.23 / 4 s | — |
| Pit estimate | 11.07 / 14 s | — |
| Pit menu | 11.07 / 14 s | 10 / 10 s |
| Vehicle condition | 10.98 / 14 s | — |
| Tyre management | 32.86 / 37 s | 20 / 20 s |
| Weather | 61.43 / 64 s | 60 / 60 s |
| Repair/refuel timings | 121.67 / 122 s | — |
| Garage settings | — | 5 / 5 s |
| Event schedule | — | 60 / 60 s |

The pit poller averaged 0.775 requests/s on track and 0.483 requests/s in the garage. Initial successful population took up to 8 seconds on track and 6 seconds in the garage. These are deliberate low-rate settings; instant HTTP replies would not make these values instantaneous. Unsafe replay reads retain their dedicated preceding state check.

Separate identity polling adds approximately one navigation request per 30 seconds while a session is loaded, even without a dashboard. The worker also probes navigation after five seconds without changes, during startup, and approximately every second while loading (subject to its idle tick and one in-flight probe). These callers do not share the pit poller's gate, so app-wide requests can overlap. More dashboard clients share the same server poller rather than multiplying game requests.

## Prioritized preventive findings

1. **P1 — REST requests need guaranteed settlement and an absolute deadline.** `lmuPitRest.ts:20–30` sets a socket inactivity timeout, collects an unbounded body, and listens only for response `data`/`end` and request errors. The isolated slow-body probe sent bytes every 100 ms and returned success after **1516 ms**, beyond the stated 1000 ms limit. The interrupted-body probe did not settle after **2215 ms** while an observer consumed the response error to keep the diagnostic process alive. In normal operation this path risks an unhandled response error or a pending promise keeping `LivePitPoller.inFlight` true indefinitely. The worker navigation probe has the same incomplete-body pattern and can retain `probing`. Add an absolute deadline, bounded body size, response error/aborted/premature-close handling, and single-settlement cleanup. Preserve replay safety and failure backoff. This is the highest-value hardening work; no production fix was applied in this analysis.

2. **P2 — The one-request rule is local, not app-wide.** Identity reads and worker probes can overlap the pit poller. Coordinate ownership/budgeting of navigation requests if the intention is to bound total LMU REST pressure. Keep the immediate state check required before replay-unsafe reads; do not optimize that check away. Game-side CPU must be measured with LMU running before claiming the extra requests are expensive.

3. **P2 — Production messages lack complete latency/freshness instrumentation.** Pedal `t` is a game-session timestamp; snapshot `receivedAt` is assigned at server publication. They do not expose producer wall time, mapping-read time, worker arrival, REST request age and browser draw/presentation. Add opt-in diagnostics with consistent clock anchors, sequence/rate/drop counts, REST age and p50/p95/p99 stage latency. Otherwise a healthy heartbeat can conceal stale strategy data. Exact physical presentation requires a browser presentation trace or external measurement.

4. **P3 — Avoid speculative hot-path rewrites.** On every scoring/car/REST update, the service recomputes derived state and serializes `contentKey`; changed snapshots serialize again for the key and once per writable client for SSE. Canvas draws traverse the full bounded window twice, and dimensions are read on every draw. These are sensible future targets if measured load grows: serialize each broadcast once, cache canvas dimensions/grid, and separate car-only derivations where correctness permits. Current measurements do not justify the added complexity. Timing events also notify subscribers even when structurally equal, and the silence timeout is recreated for every event; both were small at measured rates.

## Existing safeguards and remaining runtime work

Coherent version checks skip unchanged shared memory and retry torn frames at most three times. Only relevant scoring vehicles and the player's telemetry slot are decoded; slot hints reduce scanning. Pedal storage is bounded on both server and browser. Pedal updates bypass React state; timing uses a selective external store. The canvas coalesces notifications into one pending animation frame. Backpressure stops writes to a full sink and drops intermediate events until drain, then sends the current snapshot; existing tests exercise this behavior. The flush timers and pit polling stop when the final dashboard disconnects. File scans are held while a live session is loaded.

Remaining runtime validation should capture a busy multiclass race with LMU running, including start/finish transitions, at least one lap boundary, pit entry, a hidden tab, and a deliberately slow client. Measure game and app process CPU, actual producer/read/output rates, HTTP response percentiles and per-field age, then browser renderer/compositor cost at the intended display resolution/DPR. This audit did not test a hidden tab, physical presentation, slow SSE network behavior under load, or endurance-history growth.

Validation completed: `npm test` — **346 suites passed, 5 skipped; 3017 tests passed, 56 skipped**. `npm run build` and the final `npx tsc --noEmit` passed without warnings/errors. The initial sandboxed focused test run had temporary-file module-loading failures; the complete unsandboxed run passed. The general endpoint benchmark was not run because production endpoints were unchanged and that benchmark does not measure this SSE pipeline.
