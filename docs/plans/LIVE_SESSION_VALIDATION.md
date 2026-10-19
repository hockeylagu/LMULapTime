# Next live-session validation runbook

Prepared 2026-10-18. Companion to [remaining acceptance](LIVE_SESSION_EVIDENCE.md) and
the [current capture contract](../LIVE_CAPTURE_FORMAT.md). This is a checklist, not recorded acceptance.

## First practice findings — 2026-10-18

The COTA GT3 practice recording `27ceca18-dba6-4553-8122-99de87593d1d` exposed a brief
load-to-garage menu label, a running lap clock that advanced then snapped backward, and game-timed
laps presented as invalid. Source observations contain completed times of 135.027893 and 133.075745
seconds as well as genuine unavailable completed times (`-1`); the current-lap flag alone does not
identify the validity of the preceding completed lap.

Implemented follow-ups: explicit loading overrides a stale main-menu label; an empty initializing
session stays loading; session confirmation releases a held coherent garage frame without waiting
for another scoring-counter update. The displayed lap clock now follows received game time without
wall-clock run-on in the initial fix. A positive completed flying-lap time is independent of trace completeness and
transient current-lap flags; out/in laps and untimed laps remain excluded from clean pace. Incomplete
traces never become delta references. Estimated lap uses session best plus its matching delta, or a
marked `~` game projection when that trace is unavailable in the initial fix; these clock/projection
choices are superseded by the second-practice changes below. An out lap still reads `OUT LAP`.

Regression suite: 3,256 passed, 56 skipped. The next session must verify these behaviors live.
The driver's report of LMU itself briefly pausing after 100% loading is not yet explained or resolved.
This practice does not complete race-weekend, performance or multi-session learning acceptance.

## Second practice and approved layout — 2026-10-18

The driver confirmed that the menu label did not recur and loading-to-garage was quick on this run.
The clock no longer jumped backward, but its raw 5 Hz steps were distracting. The game pace projection
could remain fixed; it must not substitute for a live estimate. The HUD delta itself has not been
established as inaccurate or exposed through the fields currently consumed by the app.

Delivered changes:

- The original hero and history table remain. Only the last completed lap has a second row of 64 px
  sector deltas: green gains, red losses, neutral times. Each compares with the same session-best lap,
  whose actual sector times appear in the `BEST` footer. The temporary layout-preview scenarios were removed.
- The display clock advances between updates, clamps same-lap corrections against backward movement,
  freezes on pause, and stops run-on after 250 ms of unchanged game time. It never supplies analytics.
- A complete best-lap distance/time trace supplies the app's continuous delta and estimated finish time.
  A position/time wrap just before the completed-lap counter advances no longer discards that trace.
  Without a complete trace, the latest matching completed split supplies an estimate; no fixed game-pace
  fallback or redundant `~` prefix is displayed. The source remains available in tooltip/metadata.
- Invalid-lap durations are recovered from consecutive lap-start timestamps when exactly one lap has
  completed. They stay gray, carry computed provenance, and cannot establish a valid record or reference.
  Missing/unchanged anchors and skipped lap counters leave the duration unknown. Late-settling anchors are handled.

Verification: 3,262 tests passed, 56 skipped; production build passed without warnings. The next drive
must compare the app's delta with the HUD after one complete valid reference lap, verify smooth clock
behavior through pauses and crossings, and check a naturally invalidated lap's recovered duration.
The split-based estimate updates at sector crossings, not continuously. Race-weekend overhead and
multi-session learning acceptance remain outstanding.

## Third practice estimate investigation — 2026-10-18

The driver confirmed that current-lap `VS BEST` changed while `ESTIMATED LAP` stayed at the best.
Replaying saved REST inputs from recording `41cdc2d9-c498-43d7-9526-331dd1736876` produced
changing local deltas and estimates; the original timing events were not recorded, so the exact
live failure has not been reproduced or established as resolved.

The backend now publishes `lapEstimate` with its seconds, reference seconds, delta and source in
one timing event. Practice, qualifying and race views display that value directly rather than
combining a timing event with a separately delivered snapshot reference. Tests cover changing
positive/negative deltas, reference changes, split fallback and out-lap/missing states. The invalid
lap text has been removed; gray styling and computed-time provenance remain.

Opt-in diagnostics now retain a `lap-timing` output sample at most once per second, including the
coherent estimate and the raw source clocks/distance. This adds no game polling. It records producer
output, not browser receipt; next-drive acceptance still requires checking that the hero follows the
current delta after a complete valid reference lap, including gains and losses. Restart the backend
and reload the dashboard together so both use the updated timing contract.

Verification: 3,263 tests passed, 56 skipped; production build passed without warnings.

## Elapsed-clock correction — 2026-10-19

Bahrain Outer recording `226abfa6-f2df-46b0-9109-30f5cde6b580` confirms the source clock mistake:
`timeIntoLap` is estimated progress, not elapsed seconds. Of 485 timing outputs, 324 usable deltas
on laps 3–7 ranged only from −0.005 to +0.002 s. One actual pit-departure game second advanced
that field by only 0.082 s. Atomic delivery alone did not resolve this source error.

Running lap time, live delta and reference-trace timestamps now use `currentEt - lapStartEt`.
Out-laps use game seconds since the first observed movement over 0.5 m; this departure anchor has
scoring-sample precision and never supplies a reference lap. Garage returns clear it. Pause readings
hold timing; missing/future anchors remain unknown; a new lap waits for a newer anchor. Late-settling
anchors shift all trace timestamps consistently. Timing-line wrap preserves the previous trace/clock.

A sanitized fixture retains 485 raw clock/position samples. Reconstructing completed durations from
consecutive line anchors yields 324 deltas from −1.035 to +4.481 s. At lap 5, position 2987.882 m,
elapsed time is 62.342 s, delta +0.655 s and estimate 74.674 s. This verifies the offline algorithm,
not HUD acceptance. Tests also cover fixed engine progress, stopping, gains/losses, pit-speed timing,
pause/garage transitions and stale/future anchors.

Verification: 3,267 tests passed, 56 skipped; production build passed without warnings.
Live confirmation — 2026-10-19: after a new session, the driver reported that the estimate looked
good and explicitly confirmed that the out-lap clock advances at a normal rate. Both reported
symptoms pass driver-observed live validation. This confirmation does not establish a quantified
HUD delta error bound or validate every pause, garage-return and timing-line edge case. Exact
sector/HUD comparisons, race-weekend overhead and the other runbook gates remain separate.

## Saved Bahrain practice assessment — 2026-10-19

The [recorded assessment](BAHRAIN_PRACTICE_VALIDATION.md) identifies passed checks and limits for the
latest BMW M4 GT3 practice. Use its remaining-check list to avoid repeating already captured evidence.
Numeric presence is confirmed for all wheel fields; independent physical calibration remains separate.

## What the next session can establish

- The normal app records six vehicle motion and 28 wheel channels, sparse impact/terrain/configuration/damage/pit/weather observations,
  audit checkpoints and fuel/VE learning evidence into session DuckDB.
- Wheel mappings and tests use the existing C# JSONL evidence; new attempts use normalization
  version 3. See the [recorded evidence assessment](WHEEL_CAPTURE_EVIDENCE.md). The next live
  capture must confirm those values and corrected vehicle-axis signs. A fresh probe is needed only
  for a specific unresolved comparison. Older version-1 wheel columns remain unavailable.
- One race cannot complete learning acceptance: screening needs multiple independent compatible
  sessions, then fixed candidates need genuinely new sessions before activation.
- Damage recording is implemented. Learning damage-related pace loss or repair benefit is a
  separate future feature, not an acceptance gate for the current fuel/VE learner.

## 1. Prepare and identify the evidence

Use private practice for controlled manoeuvres and recovery checks. Reserve the real race for
normal operation. Record app commit, car, driver, exact layout, tyre compound, setup, session kind
and approximate wall-clock times for each manoeuvre. The matched results XML supplies the game patch.
Keep the XML, native telemetry DuckDB, replay, supplemental DuckDB and its diagnostic sidecar together.
Confirm LMU's native telemetry actually enables the comparison channels in `channelsList`.

Let the app record normally with the dashboard closed first, then open it. Verify capture continues
in both cases. Do not assume the older `C:\Documents\lmu-live-captures` location is active: inspect
the configured capture directory (`LMU_LIVE_CAPTURE_DIR`, default `server/live-captures`).

Only if the saved recordings leave a specific verification gap, run a short wheel probe from the repository root:

```powershell
npm run telemetry:record -- --out .cache/live-validation/wheel-probe --seconds 900
```

This separate diagnostic command records raw shared-memory JSONL, including the seven wheel fields
for every wheel. Normal version-3 app capture independently writes normalized DuckDB values. Stop earlier with Ctrl+C
if the sequence is complete. Preserve this small probe until mapping verification is finished;
the app's regular historical JSON/CSV exports remain removed.

## 2. Wheel probe sequence and acceptance

First find these segments in the saved JSONL. Perform only missing comparisons in a new private
practice on a known dry layout, with one car and compound. Note each segment's time.
Keep the setup fixed except for the explicitly separate setup comparison. Avoid combining a
surface change, tyre change and setup change in the same comparison.

| Segment | Fields / reference | Live acceptance evidence |
|---|---|---|
| Stationary, steering centred; then steering left/right | All fields; known car motion and steering | Finite plausible values, stable wheel indexing and confirmed behaviour when stopped; constants/zero-filled unsupported fields are not accepted as measurements |
| Straight, steady forward speed at two speeds | `lateralGroundVel`, `longitudinalGroundVel`; native speed, wheel speed and vehicle velocity | Establish units, scale and wheel-local reference frame; longitudinal response follows speed, with small lateral response on a straight. Do not assume a vehicle-axis sign mapping applies to wheel axes |
| Straight acceleration and braking | `lateralPatchVel`, `longitudinalPatchVel`; wheel rotation, native slip channels if present, throttle/brake | Distinguish contact-patch slip from ground speed; verify sign and response under traction/braking. Include a clearly marked controlled lock/spin only if achievable in private practice; do not invent evidence from ABS/TC-limited driving |
| Sustained left and right corners, then straight | Both lateral velocities, camber/toe; steering, yaw and native wheel channels | Distinguish turn-direction response, steerable front-wheel frame and axle/corner ordering; repeat both directions. Correlation alone does not establish the physical definition |
| Separate stationary/setup comparison | `camber`, `toe`; known setup values and source field definitions | Establish radians versus degrees, per-corner sign, static versus dynamic meaning and whether steering is included. Record before/after setup values. If the available setup does not expose a controllable comparison, keep that field unverified |
| Straight, braking and a safe kerb crossing | `verticalTireDeflection` at FL/FR/RL/RR | Compare raw metre values with the four stored deflection columns; distinguish compression from suspension travel and check finite zero/unsupported values |

Also inspect the recording's sparse observations during private practice:

- Move between road and a safe alternate surface. Resolve each `terrain-change.materialId` through
  `terrain-material` definitions; confirm corner order, initial state, change times, preserved truncated
  names and no repeated unchanged entries. Empty names should reference NULL, not an invented surface.
- Compare any naturally occurring impact with `lastImpactET`/`lastImpactMagnitude`. The impact event
  uses source impact time; receipt time stays separate. Repeated last-impact memory should not produce
  duplicates. Do not create a collision during a race just for validation.
- Check `upgrade-pack.rawHex` against the player's 16 scoring bytes, including zero bytes. It should
  persist initially and on configuration changes without assigning unsupported upgrade meanings.
- After a controlled recording restart, verify dictionary IDs remain valid and material names are
  defined once per file. Verify version-1/2 attempts are kept separate from version-3 attempts.

For all four corners, confirm structure offsets/order against the producer contract and independent
channel evidence where available. Read C# `Rf2Wheel`, TS `WHEEL` and the actual sampled values together;
matching struct layouts alone does not prove physical meaning. Document the conversion to the
app's ISO 8855 wheel convention explicitly. Preserve raw probe values as the source evidence.
Mark each field/corner **verified**, **unsupported**, or **unresolved**, with the reason.

The mappings in `channels.ts` and `decode.ts` and their worker tests are implemented. Confirm a new
DuckDB recording matches the saved-frame expectations, inspect its version-2 catalog and preserve
discrepancies as acceptance failures. Nonfinite measurements remain NULL.

## 3. Normal capture, clocks and ownership

| Check | Pass evidence |
|---|---|
| Ordinary clean laps, both turn directions and braking | Six supplemental motion traces align with native telemetry/replay using the existing clock alignment; ISO signs are correct; native G is preserved and computed fallbacks are disclosed |
| Dashboard closed/open/reconnected | Recording continues independently; disconnecting a client introduces no capture reset or ownership change |
| Garage → track → pit → track; practice → qualifying → race | Correct files/recording IDs and boundaries; no stale samples, pit state or prior-session learning forecasts leak into the next session |
| Finish and leave session; allow result ingestion | Unique correct XML/layout/driver/car attachment, completed-lap clock anchors and XML patch; no guessed link when evidence is ambiguous |
| Replay playback after leaving live driving | Replay frames do not enter live capture or learning |
| Backend interruption/restart in private practice | Existing committed data remains readable; resume only with exact identity/layout/clock continuity, otherwise a separate attempt; gaps stay explicit |
| Deliberate writer failure in an isolated disposable test setup | Failure is visible, queues stay bounded, game/live stream remains responsive, partial recording is identifiable; no destructive disk-full exercise during a race |

Inspect file sizes, sample counts, dropped samples, observation coverage and ingest errors after the
session. Correlate any capture gap with the segment log. A readable file alone is insufficient.

## 4. Damage, service and weather observations

Use private practice for deliberate damage and repair; do not jeopardize a race to manufacture data.

- Record a clean baseline, a timestamped light impact if appropriate, and the resulting shared-memory
  dents/detachment/impact time, REST body/suspension condition, repair estimate and audit snapshot.
  If a damage category never occurs, mark it **not exercised** rather than verified absent.
- Make a pit visit with a known repair choice. Check before/after observations and actual service
  duration. Preserve measured damage separately from inferred pace loss or repair benefit; do not
  label those estimates as validated solely because a REST response exists.
- Check compound/tyre-set changes, fuel/VE increases and pit transitions. Those laps must not become
  clean consumption-learning examples.
- When practical, use a separate wet or drying practice to compare rain/path wetness, forecasts and
  tyre choice. Confirm condition changes remain isolated in learning and clear stale consumption
  context. Mark weather states not encountered as untested.
- For any naturally occurring transient REST failure, retain the session DuckDB plus diagnostic
  sidecar. Confirm the request/response/error timing, originating recording and app context explain
  the failure after the session. Check the post-session tail and deferred compression. A race with
  no failure does not validate a failure case; controlled fault injection belongs in the test harness.

## 5. Performance comparison

Measure frame-time median, p95/p99, stutter counts, app/game CPU and disk activity across repeated
comparable private-practice segments: app stopped, backend capture with dashboard closed, then
dashboard open. Keep graphics, car, layout, AI/traffic and driving conditions comparable; repeat
the control segment to estimate ordinary variation. Exclude the separate JSONL diagnostic probe
from the production-overhead comparison.

Pass when repeated measurements show no attributable frame-time/stutter regression beyond the
control variation, no unbounded queue growth and no unexplained capture drops. Save the actual
measurements and environment; browser/synthetic benchmarks alone cannot establish game overhead.
If the comparison is inconclusive, repeat it rather than claiming a numeric performance guarantee.

## 6. Automatic learning acceptance across sessions

No training button is required. Normal recording, XML reconciliation, projection, fitting, fresh-session
validation and withdrawal happen automatically off track. Settings → Learning manually refreshes status.
`npm run learning:evaluate` provides the more detailed read-only report after ingestion finishes.

1. Verify lap-start forecasts exist before independently measured outcomes. Forecasts must retain
   the uncorrected baseline even when the dashboard uses a learned correction. Check invalid/start,
   pit/refuel, damaged, changing-context and missing-coverage laps are excluded appropriately.
2. Check resource/cohort isolation: fuel litres and VE percentage points never mix; layout, car,
   driver, XML patch, weather, compound and baseline version/source must match exactly.
3. Accumulate enough independent sessions **within a compatible cohort**. Screening requires at
   least three training sessions/30 examples and two chronological held-out sessions/20 examples;
   the automatic 25% split may require more sessions to satisfy both. A long race cannot replace
   independent sessions. Separate game versus measured estimator cohorts can be sparse.
4. A passing fixed candidate must remain **validating** until at least two sessions/20 examples
   that started after its creation pass the same error gates. Historical/backfilled sessions do not
   count as fresh acceptance. Verify parameters stay fixed during that validation.
5. Before actual use, check current-run XML patch trust: complete/import a matching recorded session
   during this observed continuous LMU run. Until that proof exists after game/app restart, ordinary
   estimation must remain in use even if validated models are stored.
6. In a later compatible session, inspect corrected advice/audits: the baseline and adjustment are
   disclosed, adjustment is bounded to ±10%, and the learned source label appears where applicable.
   Compare baseline versus corrected errors on independent measured outcomes. Require at least 5%
   MAE improvement with no p95 error, underprediction-count or mean-shortfall regression; record
   actual cohort metrics rather than relying solely on a passing status label.
7. Verify ordinary-estimator fallback for a changed/unknown identity or patch, game restart without
   new XML proof and `LMU_LIVE_LEARNING=0` at backend startup. Use isolated fixtures/harness checks
   for support invalidation, later regression, cancelled workers and write/read failures; do not edit
   production learning history just to provoke rollback.

## Acceptance record

For every row/step, record **pass**, **fail**, **not exercised**, or **inconclusive**, with recording ID,
file path, timestamps and the observation/metric supporting it. Keep failures and missing coverage
visible. Close the current learning/capture plan only after normal race-weekend and prospective
learning gates pass. Track wheel mapping discrepancies explicitly; implementation is complete,
but a new recording must still establish live acceptance.
