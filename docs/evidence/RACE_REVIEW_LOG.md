# Race review log

Written by the `race-review` skill (`.claude/skills/race-review/SKILL.md`). Newest first. Error = predicted − actual,
in % of the lap's actual use; negative = underprediction (car runs short).

## 2026-10-29 — GT3 sprint, Silverstone International (Aston Martin Vantage AMR LMGT3)

**Sessions**: practice `80P1`, qualifying `60Q1`, race `74R1` (30 min, 29 laps, Medium, dry, multi-make GT3 field of 30).

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +0.2 % fuel, +0.3 % VE; lap 11 −2.7 % and lap 16 −2.4 % VE alone; laps 23–27 over by 3–5 % (following Gensch, then Duggan) |
| 2 | Laps | OK: garage 29 racing laps, 29 run (the race plan card said 28, below) |
| 3 | Start load | Miss, noise: VE 3.0 % (1.51 laps) at the flag against reserve 0.7 + 0.5; race 1.997 %/lap against 2.04 from qualifying (+0.6 lap), 60.6 rounded to 61 (+0.2 lap) |
| 4 | Formation lap | OK: fuel 55.51 → 55.10 L (0.23 lap), VE 61 % unchanged |
| 5 | Stops | n/a: no stop planned or made |
| 6 | Tyre wear | Miss, incident: plan 0.843, actual 0.805 (RL); 0.859 projected before the last lap, whose contact cost RL 5.8, RR 4.0, FL 1.7 points; clean laps 0.3–0.5 a lap |
| 7 | Incidents | OK: lap 6 contact with Heberle (impact 599, no dents, ~+1.5 s, P8 → P9); lap 29 contact with Duggan (1349, 0.10 s behind) then Bonanno: +19 s, P6 → P10, 1.5 s RL wheelspin (436 %), one minor dent; neither fed a plan |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: telemetry and replay linked; forecasts 0.1–0.6 s after the line (10 s on laps 1–2, no measured use); 8 laps lost their game time (track limits), no measurement |
| 10 | Learning | OK: v5 Silverstone cohort `insufficient-training-*` after the version bump |
| 11 | Result | OK: grid 8 → P10 (−2): P9 at the start, P8 lap 3, P9 at the lap 6 contact, P6 by lap 13 (Lima Junior, Antunes, Savko out); last lap lost to Bonanno, Nyland, Buntsma, Winkler |
| 12 | Traffic | OK: laps 2–5, 9, 24–27 flagged (cars 0.2–0.9 s), ~7.0 s against the clean median 1:03.160 |
| 13 | Driving | Best 1:02.754 (lap 16) against qualifying 1:02.662 (new PB, −0.43 s), theoretical 1:02.664; clean median 9th of 29, +0.32 s on Heberle's; class-best sector gaps S1 +0.30, S2 +0.13, S3 +0.11 s; 99.6 % consistency; 12 track limit events (7 warnings, 2.75 points) |
| 14 | App output | Miss, app: the debrief's plan vs actual read VE at the start 59 % against 61 % and ~28 laps against 29 (below) |

**Mechanism / app finding**: the garage plan projects the flag from the leader's estimated lap (`planGarage`,
`raceLeaderLapSeconds`) and asked for 61 % for 29 racing laps; the race plan (`planRaceStrategies`) took the player's
64.495 s as the leader's pace, so the flag fell at 28 laps and the "NO STOP" card and debrief said 59 %. Loaded at 59 %,
the car would have finished with 0.55 lap, under the 0.7 reserve. 10-28 and Portimão agreed by chance (both paces on
the same side of a lap). Applied (uncommitted): the race plan takes the leader's pace (`raceStrategy.ts`,
`liveStrategyTracker.ts`), `LIVE_MODEL_VERSION` 14; regression test from this race in
`test/domain/strategy/raceStrategy.test.ts` (28 laps / 59 % at our pace, 29 / 61 % at the leader's 1:02.6). The leader's
pace is not in the audit snapshots, so earlier races cannot be replayed.

**Watch list** (recheck at every review):
- Start load: Silverstone left 1.14 (10-28) and 1.51 laps (10-29); race VE ~2 % under the qualifying measure. Third race decides.
- Laps left mid-race: laps 8–18 read 30 total (29 run), VE at the flag shown 0.4–1.1 % against 3.0 % actual; cause not
  visible in the snapshots, recheck next race.
- Tyre wear, qualifying vs race: second Silverstone race agrees (race RL 0.0044 against the learned 0.0052, −15 %);
  Portimão did not. Open.
- Meter: a third tow-lap run (Le Mans 10-22, Silverstone 10-28) decides "lowest 2 of 5"; none here (laps 23–27 over-forecast).
- Race plan from the leader's pace (applied 10-29): the next race's plan card and garage should agree on laps and load.
- Wet: confirm Slightly wet = 0.125 and the crossover advice in the next wet race; grip 0 and 1 unconfirmed.
- Driving: Silverstone S1 (+0.30 s, was +0.61); track limits (8 laps without a time); Portimão S2 (+0.81 s).
- Damage pace waits 3 laps after the impact (10-28): only dent came on the last lap; check the next one.
- Closed: grid tyre plan from the car (held, 0.988); lap estimate from a lap that lost its time (qualifying estimate
  from lap 3); lap 1 tyre cost (one clean lap here, Portimão one).

## 2026-10-29 — GT3 sprint, Portimão (Aston Martin Vantage AMR LMGT3)

**Sessions**: qualifying `02Q1`, race `18R1` (20 min, 12 laps, Medium, dry, grip 4 = Saturated, VE-limited).
First Aston event at Portimão.

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median −0.8 % fuel and VE; lap 6 −3.0 / −3.1 % alone (first fast clean lap after the slow traffic laps 4–5) |
| 2 | Laps | OK: 12 planned, 12 run |
| 3 | Start load | OK: VE 1.75 % (0.52 lap) at the flag against a 0.42-lap reserve; fuel 3.1 L (1.1 laps) |
| 4 | Formation lap | OK: fuel 36.96 → 36.63 L (0.12 lap), VE 42 % unchanged |
| 5 | Stops | n/a: no stop planned or made |
| 6 | Tyre wear | OK: plan 0.908 (0.878 after the grid switch, below), actual worst 0.903 (RR); clean laps 0.0059–0.0077 a lap, as planned |
| 7 | Incidents | OK: contact with Yoo Hyunwon at 1208 s, ~1 s before the end of lap 10: P5 → P6, then lap 11 spin (6.3 s of four-wheel spin, 450–500 %), +8.4 s against the clean median, RR tread −2.0 points (0.7 clean), no damage (impact 354, no dents); lap 11 lost its time, fed no plan |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: no drops, telemetry and replay linked, forecasts 0.2–0.6 s after the line; laps 3 and 11 lost their game time (track limits), so no measurement and the 10 s freeze |
| 10 | Learning | OK: new Portimão Aston cohort, `insufficient-*` gates |
| 11 | Result | OK: grid 13 → P6 (+7): one pass at the start; Dankert, Simoes, Schmidt retired; Idris and Mister Donut stopped; Scholz drive-through; lost to Gendron (lap 7, recovering from P16) and to Yoo at the contact |
| 12 | Traffic | OK: laps 2, 5, 7 flagged, 4.4 s against the clean median 1:46.33 |
| 13 | Driving | Best 1:46.086 (lap 8) against qualifying 1:47.565, GT3 PB 1:45.770 (BMW), theoretical 1:45.755; clean median 8th of 18, +1.73 s on the class leader; class-best sector gaps S1 +0.38, S2 +0.81, S3 +0.59 s; 99.3 % consistency; 11 track limit events (2 warnings, 1.25 points) |
| 14 | App output | Miss, app: classification gaps one lap stale (below); "11 track limits · warnings" with 2 warnings |

**App finding**: the classification took a driver's finish from the last lap's `et`, which since parser 2.24 is that
lap's start. Every gap was the gap a lap earlier: P9 Scholz +42.900 above P8 Leger +48.120 (tied in the XML), the
player +38.520 against +39.41, the winner's time 21:25.5 against 21:05.3. Applied (uncommitted, the driver's choice):
the parser keeps `<FinishTime>` (`session_drivers.finish_time`, column added offline), `DB_PARSER_VERSION` 2.25, all
sessions reparsed; the standings use it (`standings/raceFinish.ts`), and without it (25 races whose XML has none) the
end of the last lap. Verified on the page: 21:05.3, +39.405 s, Leger and Scholz both +50.880 s.

**Mechanism, three races (Portimão 10-24, Silverstone 10-28, Portimão 10-29)**: when the new set is fitted on the
grid (new sets 1 → 0) the garage selection still shows the used qualifying set (95–97 %) while the car has 100 %, so
the plan read "USED MEDIUM" (today 0.908 → 0.878, the debrief's "planned 88 %"). Applied (uncommitted): before the
green, with the car out of the pits, the garage plan takes the tread on the car (`liveStrategyTracker.ts`
`garageTyres`), `LIVE_MODEL_VERSION` 13; regression test from this race.

**Lap estimate** (from the sidecar's `lap-timing`): no estimate on race lap 2 (lap 1 from the grid counts as an
out lap) nor on qualifying laps 2–3 (out lap, then a lap that lost its time). Applied (uncommitted): a whole lap
that lost its game time, timed from the lap-start clocks, is the estimate's reference until a valid lap exists
(`liveLapTiming.ts`); session best and delta stay on valid laps. Qualifying would have had an estimate from lap 3.
No estimate on race lap 2 for now (driver, 2026-10-29; open to revisit): the standing-start lap as the reference
would read 2–3 s off for the whole lap, and lap 3 has a proper one. A later fix: restart the lap at the green's
lap-start time, with a better reference than lap 1 (e.g. history). Open: a first-flying-lap estimate from history (design first).

**Applied (uncommitted), app output**: the summary shows the track limit warnings apart ("11 · 2 warnings").

**Diagnostics**: `mFuelFraction` is the fuel tank (79 → 16 of 255 for 37 → 7.5 L of 120 L) and 0 for every remote
car online; dropped from the `field` record. The sidecar's `track-surface` record duplicated the recording's and was
removed.

**Watch list** (recheck at every review):
- Meter: a third tow-lap run (Le Mans 10-22, Silverstone 10-28) decides "lowest 2 of 5"; Portimão had one low lap, no run.
- Tyre wear, qualifying vs race: Silverstone's gap (qualifying 0.45–0.60 %, race 0.29–0.40 %) not seen at Portimão
  (qualifying 0.73 %, race 0.59–0.77 %); one race so far.
- Tyre wear, lap 1: Silverstone's formation and start cost about four clean laps; Portimão one. Open.
- Grid tyre plan from the car (applied 10-29): the next race's plan should hold the new set's tread.
- Lap estimate from a lap that lost its time (applied 10-29): check the sidecar's `lap-timing` in the next qualifying.
- Wet: confirm Slightly wet = 0.125 and the crossover advice in the next wet race; grip 0 and 1 unconfirmed.
- Driving: Silverstone S1 slow corner (~780 m), recheck at the next Silverstone race; Portimão S2 (+0.81 s).
- Damage pace waits 3 laps after the impact (10-28): no real damage at Portimão; check the next one.
- Closed: forecast freeze (held at Portimão); capture start-up drops (none in two races).

## 2026-10-28 — GT3 sprint, Silverstone International (Aston Martin Vantage AMR LMGT3)

**Sessions**: Interlagos practice `78P1`; Silverstone practice `90P1`, qualifying `10Q1`, race `92R1` (Medium, dry).
Earlier test sessions (2026-10-25 to 10-27) not reviewed here.

**Buckets** (session × fuel/VE): noise 6, mechanism 2 (race fuel and VE), steady bias 0, data 0.
- Practice/qualifying: medians −0.4 to +0.8 %, worst −2.8 % VE on the first measured lap. Noise.
- Race: median −0.9 % fuel and VE; laps 16–19 short by up to −3.4 % fuel / −3.5 % VE (lap 19).

**Mechanism**: laps 13–15 were tow laps 0.2–0.4 s behind another GT3 (one contact), 1.72–1.74 L against
~1.81 L clean. Three of the five meter laps were low and "drop the lowest" leaves out only one.
Same pattern as Le Mans 2026-10-22, milder.

**Data finding**: stored forecasts were one lap old. The forecast froze within 2 s of the line, before the meter had
measured the lap just ended (it needs a sample after the line), so every stored measured forecast left that lap out;
the live display already counted it. The replay of the meter over stored examples reproduces 94/97 fuel forecasts.

| Rule (fuel / VE, measured laps) | MAE | p95 | Worst under | Under > 2 % |
|---|---|---|---|---|
| Stored (one lap old) | 1.30 / 1.26 % | 4.11 / 3.70 % | −5.6 / −3.8 % | 9 / 10 |
| Lap just ended counted | 1.18 / 1.22 % | 3.56 / 3.56 % | −3.5 / −2.9 % | 8 / 8 |
| Same, lowest 2 of 5 left out | 1.25 / 1.21 % | 3.84 / 3.67 % | −3.5 / −2.9 % | 3 / 3 |

**Automatic learning**: 0 active, 0 validating. Silverstone International measured cohort has evidence but the
correction fails `mae-not-improved` / `p95-regressed`: no bias to learn, the right answer.

**Formation lap**: fuel 53.36 → 53.02 L from formation to green (0.19 lap of 1.78 L), VE held 58 %. The driver confirmed
in game: the formation lap takes fuel, not VE. Measured 0.135–0.19 lap over three races; `formationLapUse` (VE 0,
fuel 0.25 lap) stays.

**Applied (uncommitted), app output**: an inferred lap now runs from its own `et` to the next lap's
(`server/sessions/sessionLapTiming.ts`; all 32,854 stored consecutive lap pairs agree that `et` is the lap start; the
last lap stays without a time), `DB_PARSER_VERSION` 2.24, all 1,089 sessions reparsed. The lap table shows an inferred
lap faster than the best with a minus (`SessionLapTableRow.tsx`). Three parser fixtures that had `et` as the lap end
were corrected; regression tests from race laps 5–7 and 26.

**Applied (uncommitted)**: the forecast freezes once the lap just ended is measured, at most `FORECAST_WAIT_SECONDS`
(12 s; laps with no measured use freeze from 10 s), `shared/domain/learning/capture.ts`; the example check allows the
same window. `LIVE_BASELINE_MODEL_VERSION` 5, so learning cohorts restart. Regression test from race lap 19 in
`test/domain/learning/capture.test.ts`. Meter rule unchanged.

**Tyre wear** (`evaluateTyreWear.ts`, race held out, 4 training sessions):
- The last new set was fitted on the grid (new sets 1 → 0). The garage plan showed ~88 % at the flag for 29 laps; the
  worst tyre, rear left, finished at 84.4 %.
- Clean race laps wore FL 0.0037, FR 0.0029, RL 0.0040, RR 0.0039 per lap, so the plan (about 0.0040 per lap) was right
  for clean laps. Qualifying push laps wore 0.0045–0.0060.
- Lap 5 (contact, 82 s, 3.2 s of rear wheelspin) cost FL 3.4 %, RL 3.4 %, RR 1.8 %: about eight clean laps in one lap,
  3 of the 3.6 points the plan missed. Lap 1 (formation and start) cost 1.5–1.6 % a wheel, about 1.2 points more
  than a clean lap.
- The held-out model (0.859) and the old rule (0.840) bracket the actual. No slip slope was learned (no slip laps in
  the Aston training). Bucket: incident, nothing to change.

**Scorecard** (first review with the checklist; `reviewRaceStrategy.ts` added):

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | Miss, mechanism: tow laps 13–15 in the meter window, −3.4 % on laps 18–19 |
| 2 | Laps | OK: 28 planned, 28 run |
| 3 | Start load | OK: VE 2.3 % (1.14 laps) and fuel 2.85 L (1.59 laps) at the flag, reserve 0.7 lap |
| 4 | Formation lap | OK: fuel 0.19 lap, VE unchanged (driver confirmed in game) |
| 5 | Stops | n/a: no stop planned or made |
| 6 | Tyre wear | Miss, incident: plan ~88 %, actual 84.4 % (RL); lap 5 contact cost 3 points, clean laps as planned |
| 7 | Incidents | OK: lap 5 contact (+18 s, 3.4 % tread FL/RL, 3.2 s rear wheelspin); lap 13 contact in the tow run |
| 8 | Weather | n/a: dry |
| 9 | Data | Miss, data: stored forecasts one lap old (fixed) |
| 10 | Learning | OK: Silverstone cohort gated on `mae-not-improved` / `p95-regressed`, no bias to learn |
| 11 | Result | OK: grid P16, peak P12, P14 on lap 4; lap 5 contact (+18.8 s) dropped to P31; recovered to P19 (−3), lapped |
| 12 | Traffic | OK: laps 3, 8, 10, 11, 14, 15 flagged (cars within 0.2–1.8 s), about 5.4 s against the clean median 63.63 s; plus lap 13 contact in the tow (+1.3 s) |
| 13 | Driving | Best 1:03.274 (lap 25) against qualifying/PB 1:03.096 and theoretical 1:03.201; clean median 26th of 33 in GT3, +1.17 s on the class median leader; sector gaps to the class bests S1 +0.61, S2 +0.50, S3 +0.27 s; 9 track limits, 6 incidents, 7.4 s of lockup/wheelspin (laps 4–5) |
| 14 | App output | Miss, app (fixed): inferred laps took the previous lap's time (lap 6 showed ~1:22.360, the lap 5 contact; now ~1:04.200); lap 26 showed `+-0.014s` |

**Damage** (recording `impact` / `car-condition`, strategy snapshots): nine impacts, three minor body dents (parts 0, 3, 4,
level 1), no suspension damage, nothing detached; body 0.02 after lap 5, 0.06 after lap 16. No pace cost: clean laps
before (lap 9 1:03.511, lap 12 1:03.689) match those after (median 1:03.59, best 1:03.274 on lap 25 with all dents),
top speed unchanged (248.8–249.3 km/h). **Mechanism found**: at the start of lap 9 the dashboard showed damage costing
8 s a lap (168 s to the flag) for one lap: `LiveDamageTracker` measures from 2 laps after the impact (`PACE_LAPS`), and
the median of 2 is their mean, so the lap 5 contact (1:22.36) and lap 6 (1:04.20) read as 73.3 s against 65.3 s before.
The same flag made the learning exclude lap 9 as `damage`. Applied (uncommitted): the pace after the impact waits for 3
laps (`PACE_WINDOW`, `shared/domain/live/liveCarCondition.ts`), so the median drops one slow lap; on this race it reads
0 from lap 8. Real damage shows one lap later. `LIVE_MODEL_VERSION` 12; regression test from race laps 2–7.

**S1 corner by corner** (replay traces at 5 m, best race lap 1:03.274 against Dom Wah's S1-best lap, Enzo Syl's best,
VVV GG's best and the qualifying best): of the 0.49–0.66 s lost in S1, 0.36–0.46 s is the slow corner at ~780 m before
the S1 line: 85 km/h minimum against 88 (Enzo Syl) and 93 (Dom Wah), braking ~12 m earlier (651 against 663 m) and full
throttle ~29 m later (815 against 786 m). The fast corner at ~290 m costs 0.10 s (183 against 192 km/h, braking 13 m
earlier). VVV GG, at your pace, gains 0.21 s at the same slow corner. Race S1 matches qualifying (−0.06 s), so it is a
habit, not tyres or damage.

**Watch list** (recheck at every review):
- Meter: a third tow-lap run (Le Mans 10-22, Silverstone 10-28) decides "lowest 2 of 5".
- Forecast freeze: stored forecasts 1–2 s after lap start, including the lap just ended (fixed 10-28).
- Tyre wear, qualifying vs race: qualifying laps wore 0.45–0.60 %, clean race laps 0.29–0.40 %; a second race with the
  same gap means weighting race laps when planning a race.
- Tyre wear, lap 1: formation and start cost about four clean laps a wheel (1.5–1.6 %); the plan counts two.
- Capture start-up drops (Portimão 10-24): none at Silverstone.
- Wet: confirm Slightly wet = 0.125 and the crossover advice in the next wet race.
- Driving: S1's slow corner at ~780 m (85 km/h, brake ~12 m early, throttle ~29 m late) costs 0.36–0.46 s a lap;
  recheck at the next Silverstone race.
- Damage pace now waits for 3 laps after the impact (fixed 10-28): check the next real damage still shows its cost.

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
