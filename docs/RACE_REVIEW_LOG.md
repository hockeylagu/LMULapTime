# Race review log

Written by the `race-review` skill (`.claude/skills/race-review/SKILL.md`). Newest first. Error = predicted − actual,
in % of the lap's actual use; negative = underprediction (car runs short).

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
