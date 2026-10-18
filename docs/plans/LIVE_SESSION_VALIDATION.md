# Next live-session validation runbook

Prepared 2026-10-18. Companion to [remaining acceptance](LIVE_SESSION_EVIDENCE.md) and
the [current capture contract](../LIVE_CAPTURE_FORMAT.md). This is a checklist, not recorded acceptance.

## What the next session can establish

- The normal app records six verified motion channels, sparse damage/pit/weather observations,
  audit checkpoints and fuel/VE learning evidence into session DuckDB.
- The 24 supplemental wheel columns are still NULL. A normal app recording cannot verify their
  values. Use the existing C# diagnostic recorder for a short, controlled raw-memory probe.
- After analysing that probe, implement only verified wheel mappings and their regression tests.
  A subsequent live capture must confirm that the enabled columns contain the expected data.
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

For the short wheel probe, run from the repository root:

```powershell
npm run telemetry:record -- --out .cache/live-validation/wheel-probe --seconds 900
```

This separate diagnostic command records raw shared-memory JSONL, including the six pending fields
for every wheel. It does not enable supplemental DuckDB wheel columns. Stop earlier with Ctrl+C
if the sequence is complete. Preserve this small probe until mapping verification is finished;
the app's regular historical JSON/CSV exports remain removed.

## 2. Wheel probe sequence and acceptance

Perform the sequence on a known dry layout, with one car and compound. Note each segment's time.
Keep the setup fixed except for the explicitly separate setup comparison. Avoid combining a
surface change, tyre change and setup change in the same comparison.

| Segment | Pending fields / reference | Evidence required before enabling capture |
|---|---|---|
| Stationary, steering centred; then steering left/right | All fields; known car motion and steering | Finite plausible values, stable wheel indexing and confirmed behaviour when stopped; constants/zero-filled unsupported fields are not accepted as measurements |
| Straight, steady forward speed at two speeds | `lateralGroundVel`, `longitudinalGroundVel`; native speed, wheel speed and vehicle velocity | Establish units, scale and wheel-local reference frame; longitudinal response follows speed, with small lateral response on a straight. Do not assume a vehicle-axis sign mapping applies to wheel axes |
| Straight acceleration and braking | `lateralPatchVel`, `longitudinalPatchVel`; wheel rotation, native slip channels if present, throttle/brake | Distinguish contact-patch slip from ground speed; verify sign and response under traction/braking. Include a clearly marked controlled lock/spin only if achievable in private practice; do not invent evidence from ABS/TC-limited driving |
| Sustained left and right corners, then straight | Both lateral velocities, camber/toe; steering, yaw and native wheel channels | Distinguish turn-direction response, steerable front-wheel frame and axle/corner ordering; repeat both directions. Correlation alone does not establish the physical definition |
| Separate stationary/setup comparison | `camber`, `toe`; known setup values and source field definitions | Establish radians versus degrees, per-corner sign, static versus dynamic meaning and whether steering is included. Record before/after setup values. If the available setup does not expose a controllable comparison, keep that field unverified |

For all four corners, confirm structure offsets/order against the producer contract and independent
channel evidence where available. Read C# `Rf2Wheel`, TS `WHEEL` and the actual sampled values together;
matching struct layouts alone does not prove physical meaning. Document the conversion to the
app's ISO 8855 wheel convention explicitly. Preserve raw probe values as the source evidence.
Mark each field/corner **verified**, **unsupported**, or **unresolved**, with the reason.

After analysis: update `server/live/capture/channels.ts` and `decode.ts` only for verified fields,
test ordering/units/signs and unknown handling, and confirm a new DuckDB recording matches the
probe. Unresolved columns remain NULL. Complete this coding step before calling wheel capture done.

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
learning gates pass. Track unresolved wheel mappings explicitly; do not call them recorded until
their implementation and follow-up recording have been checked.
