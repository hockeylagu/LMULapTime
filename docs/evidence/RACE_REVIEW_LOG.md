# Race review log

Written by the `race-review` skill (`.claude/skills/race-review/SKILL.md`). Newest first. Error = predicted − actual,
in % of the lap's actual use; negative = underprediction (car runs short).

## 2026-10-27 — changing-weather observations (offline, not race acceptance)

Driver observations at Silverstone: light rain reached Damp and stayed there for 13+ minutes after rain;
heavy rain reached Extremely wet, fell to Very wet within 14 s of rain ending, to Wet 11 minutes later,
and still did not reach Dry in the following 10 minutes. `minPathWetness` stayed 0 even in full rain,
so it does not establish a dry line. Wetness labels and forecast-window evidence are in the REST notes.
Wets do not consume dry tyre allocation; returning to slicks uses a new or used dry set. The driver's
classes have slicks and wets, no intermediates (driver, 2026-10-26).

The first crossover rule deliberately waits for exactly Dry before returning to slicks, even if late.
Open: confirm Slightly wet = 0.125 and compare the game's tyre message, the first displayed advice,
actual stop/compound and lap times either side in the next wet race. No wet race acceptance is claimed.

## 2026-10-24 — LMP3 sprint, Portimão (Ginetta G61-LT-P325 Evo)

**Sessions**: qualifying `52Q1`, race `73R1` (fuel only). First race on the forecast rule from 2026-10-23
(model 4, last 5 laps less the lowest).

**Buckets**: noise 2 (qualifying, race forecasts), data 1 (race learning exclusion).
- Qualifying: one lap on the game estimate, −2.2 %. Noise.
- Race: 7 forecasts, all within ±2.3 %, median +0.9 % (over, the safe side), worst under −0.8 % (lap 6).
  Earlier Portimão race (`75R1`, old rule) was −1.1 % median; no steady bias.
- **Data**: all 7 race laps excluded as `capture-drops`, so the race taught the learning nothing. The recording
  lost 26 of 42,721 samples in a single 0.84 s gap at 21.8 s, on lap 0 before the start (recording worker
  start-up). No measured lap was touched. The exclusion is per recording (`manifest.droppedSamples > 0`,
  `shared/domain/learning/examples.ts`), while forecasts and outcomes come from the strategy tracker, not the
  samples; a lost forecast event is already caught by `missing-forecast`.

**Automatic learning**: 0 active, 0 validating; 25 cohorts insufficient evidence (expected: model 4 cohorts
started 2026-10-23).

**Applied (uncommitted)**: recording-wide `capture-drops` exclusion removed; a gap inside a lap is still excluded
per lap (`capture-gap`, `shared/domain/learning/capture.ts`). `LEARNING_EXAMPLE_RULES_VERSION` 2 is part of the
projection signature (`server/live/learning/inputs.ts`), so stored projections rebuild on the next off-track refresh
(4 recordings per pass). Dry run on the race: 4 of 7 laps now eligible (laps 3, 8, 9, 11; the other 3 not clean).
Regression test in `test/domain/learning/examples.test.ts`.

**Open**: start-up drops are new (none in the 30 earlier recordings); watch whether they repeat.

**Beyond fuel per lap** (from the race's strategy audit and standings):
- Laps: 12 forecast from the green, 12 run. The 2026-10-23 laps-left fixes (`2ff511ae`) held.
- Formation lap fuel: 32.16 → 31.76 L (0.4 L, ~17 % of a lap; Le Mans 2026-10-22 was ~13 %). The plan keeps a
  full lap for it, so the car finished with 4.3 L (1.9 laps) against a 0.45-lap reserve: about 2 L carried for
  nothing. Applied (`dc67cbbb`): fuel `formationLapUse` 0.25 lap, `LIVE_MODEL_VERSION` 8; the Portimão plan now
  sets 30 L instead of 32 L (regression test in `test/domain/live/liveResourcePlan.test.ts`).
- Tyres: garage plan 0.806 tread at the flag, actual 0.944. The plan used the qualifying wear (0.012–0.015 per lap:
  out-lap and push laps); the race wore 0.0044–0.0053 per lap. Race started at tread 1.0, not the used 0.952.
  Tyre wear is not in the learning (fuel and VE only). The driver: qualifying was an outlier (spins, lockups);
  clean qualifying wear would have been close. So qualifying wear stays; slip-heavy laps must not set the wear.
  Next: tyre wear learning that leaves slip-heavy laps out (design proposed to the user).
- Wear against slip, all 24 recordings with wheel channels (229 laps): the live worst-tyre reading lags one lap (race lap 10's
  5.9 s of lockup/spin, the impact at 1059 s, shows as 0.017 lost at the next crossing; the first racing lap reads
  1.0). Pairing each lap's slip with the next crossing's loss: Ginetta r 0.87 (clean 0.0032/lap, +0.0021 per slip
  second), Lexus r 0.73, Peugeot r 0.36; BMW and Ferrari have almost no slip laps. Big events (5–6 s) cost
  0.015–0.020, four to five laps of wear. The driver suggested wear = clean wear + cost per slip second × the
  driver's usual race slip: for this race 0.0032 + 0.0021 × ~0.5 s ≈ 0.0043/lap against 0.0044–0.0053 actual
  (the plan used 0.012).
- Per wheel: the live recordings keep only the worst tyre (0.001 steps). The native telemetry ("Tyres Wear", four
  wheels, full precision, ~11 Hz) has no lag: the lap 9 event cost RL 1.74 %, RR 1.23 %, FR 0.80 %, FL 0.45 % in
  that lap, against normal laps of RL 0.41, RR 0.37, FL 0.27, FR 0.15 %. The driver asked for tyre wear per wheel.
- Native slip fallback checked against the shared-memory slip on this race: native "Wheel Speed" (m/s, 100 Hz) follows
  the ground speed through a 76 % RL lockup (25.1 against 24.8 m/s at 1074.8 s); it is the hub's ground speed, not
  the tyre surface speed. Native found 0 s of slip where shared memory found 6.86 s, so slip has no native fallback.
- Applied: formation lap fuel committed `dc67cbbb`.
  Wheel slip (`listWheelSlipEvents.ts`) backs it: qualifying 57 lockup/wheelspin events, 20.5 s over 6 laps
  (~3.4 s a lap, the driver reported spins and lockups); race 18 events, 6.9 s over 13 laps (~0.5 s a lap).

## 2026-10-23 — first review (kick-start)

**Data**: 29 verified captures, 252 lap examples, 185 eligible (63 not clean/representative, 10 damage).
Sessions 2026-10-18 → 2026-10-23: COTA (Lexus, Ferrari), Bahrain Outer (Lexus, BMW), Portimão (Ginetta), Le Mans (9x8).

**Buckets** (session × fuel/VE pairs with eligible laps): noise 48, mechanism 2, steady bias 0, data 0.
- Le Mans race 10-22 (`99R1`), fuel −2.3 % / VE −1.5 % median, lap 15 −5.7 %: mechanism, below.
- Le Mans race 10-23 (`46R1`), lap 14 −1.8 % after the low lap 11: same mechanism, milder (counted as noise).
- COTA Lexus practice 10-20 (+9.6 % VE) and Bahrain BMW practice 10-21 (−3.1 % VE): one to three laps on the
  game estimate; noise.
- Baseline on the newest sessions: fuel MAE 0.12 L/lap, VE MAE 0.10 %/lap (≈1.5 %).

**Automatic learning**: 0 models active, 0 validating; all 24 cohorts "insufficient evidence". Two causes:
1. The holdout split is global (newest 25 % of all sessions). Each event is one car/track, so the newest sessions
   are always a cohort with no training sessions, and older cohorts never get test sessions. No cohort can pass,
   and `advanceAutomaticLearning` only creates candidates from cohorts that pass.
2. The cohort key splits one car/track/compound by `predictionSource` (game vs measured), which halves the data.

The biases it would learn so far are small (Bahrain BMW fuel +0.1 %, COTA Ferrari +0.5 %), so the gain from
fixing it is small today; it matters once a car/track has a real bias.

**Mechanism found**: the live meter forecasts from the mean of the last 3 measured laps (`USAGE_WINDOW`,
`shared/domain/live/liveUsage.ts`). Traffic/slow laps that are not pit or caution laps still count, so a run of
low-use laps (Le Mans 10-22 laps 10–12: 6.39, 6.17, 6.22 L) pulls the forecast down and the next normal lap
(6.64 L) is underpredicted by 5.7 %.

Replayed over the 55 eligible measured laps whose earlier laps reproduce the live forecast:

| Rule | MAE | p95 | Worst under | Laps under by > 2 % |
|---|---|---|---|---|
| Mean of last 3 (current) | 0.89 % | 2.67 % | −5.67 % | 3 |
| Median of last 3 | 0.85 % | 2.76 % | −6.30 % | 4 |
| Median of last 5 | 0.77 % | 2.82 % | −4.00 % | 3 |
| Mean of last 5, lowest dropped | 0.75 % | 2.13 % | −2.42 % | 1 |

**Applied (uncommitted)**:
1. Meter: mean of the last 5 laps, lowest left out from three laps (`USAGE_WINDOW` 5, label "LAST 5");
   `LIVE_MODEL_VERSION` 7, `LIVE_BASELINE_MODEL_VERSION` 4, so new forecasts start their own learning cohorts.
2. Calibration: each cohort holds out its own newest sessions, at least `minTestSessions`
   (`CALIBRATION_POLICY` version 3). On today's data Bahrain BMW and COTA Ferrari now get 4 training and 2 test
   sessions; they stop only on too few laps, and the corrections they would make change MAE by 2–3 %, below the 5 % gate.
   Nothing to learn yet, which is the right answer.

Regression tests: Le Mans 10-22 laps in `test/domain/live/liveResourcePlan.test.ts`, per-cohort split in
`test/domain/learning/calibration.test.ts`.

**Open**: small sample (55 replayable laps, mostly Le Mans); check lap-15-style misses after the next races. The
model version bump means learning examples restart at version 4.
