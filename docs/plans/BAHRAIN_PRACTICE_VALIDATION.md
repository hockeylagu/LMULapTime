# Bahrain Outer practice evidence assessment

Reviewed 2026-10-19 after the driver confirmed the estimate and out-lap clock work normally.
This is a read-only assessment of saved practice evidence, not full race-weekend acceptance.

## Recording identity and ownership

- Recording: `3aab3c88-3a2e-4f63-bc1a-70824819bdf0`.
- XML: `2026_10_19_12_25_25-93P1.xml`; exact layout `bahrain_outer`, BMW M4 GT3, dry Medium tyres.
- SQLite attachment is verified; XML patch is `1.42`. The native recording spans five linked DuckDB files.
- Supplemental capture is finalized, normalization version 3, 30,945,280 bytes (29.51 MiB).
- The verified recording reader accepts identity, schema, channel catalog and persisted clock anchors.
- XML contains 30 lap entries, 17 classified clean; best completed lap is 73.2623 s.
- No ingest error is recorded for this recording or XML. The `unresolved_` filename prefix is historical;
  verified ownership is stored in the index and must not be inferred from the filename.

## Observed checks

| Check | Recorded evidence | Assessment |
|---|---|---|
| Stored numeric channels | 68,234 samples; all 34 channels present, finite and varying in every sample | Pass: six vehicle channels and all 28 wheel channels are populated, not constant placeholders |
| Sequence and clocks | Unique contiguous sample indices, no duplicate/regressing timestamps, zero recorder-reported drops | Pass for this attempt; this does not assert continuous 100 Hz capture |
| Sampling cadence | Median and p99 interval 40 ms; both 20/40 ms intervals occur | Observed source cadence, not a game-performance benchmark |
| Longer gaps | Four gaps: 40.523, 13.163, 10.123 and 6.063 s | All bracket garage-return/redeparture states and native recording boundaries; no unexplained longer driving gap identified |
| Native clock alignment | 68,215 supplemental samples match native timestamps; maximum nearest-sample offset 2.5 ms | Pass over common coverage; remaining 19 points lie outside common native intervals |
| Speed agreement | Live velocity magnitude vs native Ground Speed, converted from km/h: MAE 0.01549 m/s, p95 0.07853 m/s | Strong consistency across five files; native data stays unchanged |
| Turn-direction consistency | Correlation of live forward speed × yaw / gravity with canonical native lateral G: 0.9669 over 38,493 selected moving/turning points | Supports sign/dynamics consistency; not proof of every wheel-local physical convention |
| Straight wheel ground velocity | 26,117 selected points; four longitudinal wheel/vehicle speed ratios average 0.999991–1.000007 | Supports scale/longitudinal sign; not an independent camber/toe calibration |
| Live clock output | 1,969 timing diagnostics; non-out-lap elapsed time agrees with session minus lap-start clock within 0.5 ms rounding | Pass for sampled outputs and driver confirmation |
| Estimate response | 1,494 distance estimates; delta range −1.128 to +10.765 s | Changing estimate confirmed; no quantified HUD error bound claimed |
| Terrain | 11 file-local raw names, 3,100 changes; no unresolved dictionary references or consecutive unchanged duplicates per corner | Pass for initial/change storage and dictionary integrity |
| Impacts and damage | Nine distinct source-timed impacts; 19 car-condition frames with nonzero dents | Actual impact/dent capture exercised; repair benefit and every damage category remain unverified |
| Upgrade bytes | One initial 16-byte value, including preserved zero bytes | Initial persistence exercised; configuration changes not exercised |
| Diagnostics | Gzipped sidecar closes with zero dropped records and a two-minute post-session tail | Supports real post-session investigation |

Selection limits: straight points use forward speed >20 m/s, absolute yaw <0.02 rad/s and absolute
lateral speed <0.5 m/s. Turning consistency uses speed >15 m/s, absolute lateral speed <3 m/s,
absolute yaw <1.2 rad/s and absolute native lateral G >0.1. These consistency tests do not replace
producer-contract checks or controlled setup comparisons. Wheel extrema include impacts/spins and
must not be treated as steady-state alignment values.

## Actual transient REST evidence

At session exit, saved diagnostics retain a 404 from `/rest/garage/getPlayerGarageData` and a 500
`Invalid state` from `/rest/garage/PitMenu/receivePitMenu`. Request times, durations, garage mode,
recording identity and ignored parser disposition are present. Repeated failures are deduplicated
with suppression counts. Navigation subsequently records a timeout and connection refusals as
LMU becomes unavailable. Two failure observations are retained in DuckDB. This is useful captured
exit-state evidence; it does not establish that every possible mid-race failure is diagnosable.

## Learning evidence

- Projection is `ready` without an error: 16 eligible fuel and 16 eligible VE examples.
- Every retained learning lap is XML-clean. The first clean lap (2) has no retained outcome;
  retained examples cover laps 3–9, 12–14, 18–20, 23, 25 and 28.
- All retained forecasts precede their corresponding crossing outcomes.
- This session's baseline forecast MAE: 0.01802 L fuel and 0.03361 VE percentage points per lap.
  These are descriptive baseline errors, not evidence of improvement from a learned correction.
- Current global readiness: 50 eligible examples, no active or validating correction, insufficient
  compatible-cohort training/holdout evidence. The global chronological split has three training
  sessions and one held-out session, but these must not be combined across cars/layouts/contexts.
- No wet audit state occurs. All 1,969 timing outputs have one subscriber, so this session does not
  exercise recording with the dashboard closed.

## Still required

1. Independent wheel units/frame/corner comparisons, especially camber/toe and controlled setup changes.
   Populated columns and correlations alone do not close physical-definition acceptance.
2. A normal practice → qualifying → race sequence, genuine pit service/refuel/tyre changes and replay
   playback isolation. Garage returns here are not proof of a completed pit service.
3. Capture with the dashboard closed/reconnected, controlled backend recovery and writer-failure checks.
4. Measured game frame-time/CPU/disk comparisons; zero reported drops is not a performance guarantee.
5. Wet/changeable conditions and further compatible sessions for held-out/prospective learning gates.

Analysis artifacts (local, ignored): `.cache/live-validation/latest-bahrain-analysis.json`,
`analyzeLatestBahrain.mjs` and `compareLatestBahrain.mjs`. Source databases were opened read-only;
no recordings, learning models or stored session data were altered for this assessment.
