# Race review log

Written by the `race-review` skill (`.claude/skills/race-review/SKILL.md`). Newest first. Error = predicted − actual,
in % of the lap's actual use; negative = underprediction (car runs short).

## 2026-11-25 — three races: Spa GP (LMP3), Sebring (GT3 with LMP2), Portimão (GT3)

**Sessions** (all dry, no stop planned, model version 23):
- Spa `96R1`: Ginetta G61 LMP3, 20 min, fuel, grid 13 → P10, 10 laps (qualifying 132.929, pole 130.398).
- Sebring `10R1`: BMW M4 LMGT3, 30 min with 15 LMP2s, VE, class grid 15 → class P11 (overall 30 → 23), 14 laps,
  one repair stop.
- Portimão `73R1`: McLaren 720S LMGT3 Evo, 15 min, VE, grid 16 → P11, 9 laps.

**Scorecard** (Spa / Sebring / Portimão):

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +0.8 % fuel / −0.1 % VE / +0.1 % VE; worst eligible lap −3.0 % (Sebring lap 9, alone) |
| 2 | Laps | Miss (mechanism), Spa: total 9 on laps 0–1, then 10 (10 run); the leader's game estimate stood until its second lap, slower than its 130.9 s laps, while the garage (pole) planned 10. Sebring: 15 → 14 at the repair stop (right), then 13 on laps 6–9 and 14 again for the 14 run: a 3 s edge (the player crossed at 1991.7, the leader's flag about 1994.6), cause not provable without the leader in the capture. Portimão: OK, 9 from the green. No pit call from a total change |
| 3 | Start load | OK: Spa 0.60 lap at the flag (reserve 0.34); Sebring 5.4 laps (a lap lost in the crash, 71 % set vs 67 % asked); Portimão 1.46 laps against 0.42 + 0.5 by choice (35 % set vs 32 % asked) |
| 4 | Formation lap | OK: fuel 0.08 / 0.08 / 0.10 lap, VE unchanged |
| 5 | Stops | Sebring only: unplanned repair stop on lap 3, stopped 90 s against the game's 87 s (damage 78.7 + tyres 4.5); FL and RL changed, no VE; laps left held through the lane. Spa, Portimão n/a |
| 6 | Tyre wear | OK: Spa worst 0.918 vs 0.947 planned (−2.9 points); Portimão 0.898 vs 0.922; Sebring n/a (two tyres changed at the stop; RR 0.846 after 14 laps against 0.851 planned) |
| 7 | Incidents | Miss (mechanism), Sebring: the lap 3 crash (impacts up to 7.7k, FL and RL flat, about 230 s and 4 places) took 7 points off RR; from two laps of the stint the wear rate was their mean (0.040 a lap) and read "Tyres won't reach the flag" on lap 4 for tyres that ended at 85 %. Spa lap 6 lockup (FR −97 %, +3.5 s) and lap 7 contact (+6.5 s S2); Portimão lap 3 contact (+3 s) |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: captures, native DuckDB and replays (Spa R1 45, Sebring R1 18, Portimão R1 23) linked; one empty recording before Sebring qualifying. The capture has no leader state, so box 2 could not be traced (also Le Mans 11-24) |
| 10 | Learning | OK: processed; the new cohorts gated (one session each) |
| 11 | Result | Spa P13 → P12 (lap 1) → P10 (lap 3) → P9 (lap 5) → P10 (lap 6 lockup); Sebring overall 30 → 26 (lap 1) → 30 (crash) → 23 by passes and retirements; Portimão P16 → P15 (lap 1) → P12 (lap 5) → P11 (lap 7) |
| 12 | Traffic | OK: Spa laps 2–3 (+0.3–1 s); lap 6 flagged traffic is the lockup (ahead 3.0 s). Sebring laps 2, 6–8, 13 (+0.6–2.6 s, LMP2s passing); Portimão lap 2 |
| 13 | Driving | Clean median off the class winner: Spa +2.9 s (S2 +1.75, S3 +0.96), Sebring +1.55 s (S3 +0.72, S1 +0.64), Portimão +1.67 s (even). Best laps 132.866 / 123.063 / 105.731 against qualifying 132.929 / 123.328 / 105.911; consistency 99.7. Takeaways: Spa S2; the lap 6 Spa lockup |
| 14 | App output | OK: Portimão lap 9 has no time (invalid last lap, as Barcelona 11-24); Sebring lap 5 and Portimão laps 4, 8 inferred (invalid laps) |
| 15 | Deployment | n/a: no battery |
| 16 | Last change (v23) | OK: garage laps right in all three; save-to-finish not needed (all had spare) |
| 17 | Radio | Miss, Sebring: 20 traffic calls in 23 s (11 late) while the damaged car crawled to the pits, "Two/Three/Four P2s behind" regrouped each second; the false tyre call above. Puncture calls right. Spa and Portimão OK |

**Changed** (LIVE_MODEL_VERSION 24):
- Tyre wear per lap from two laps of a stint takes the smaller lap, not their mean (`LiveTyreTracker`): the Sebring
  RR reads 0.0066 on lap 4, then 0.008 (median of three).
- Race audit checkpoints record the overall and class leaders' laps-left inputs (`race` in `LiveAuditRecord`), and a
  laps-left change is a checkpoint; `traceLiveAdvice.ts` prints the leader (`ldr`).
- The leader is taken to make only the player's planned fuel/VE stops (`stopsMade` from `LiveSessionTracker`), not a
  repair stop with none planned: after the Sebring repair the leader's flag kept a stop's lane loss it never paid.
- Radio (radio session, box 17): no behind calls while the player crawls (under half the field's speed at that spot),
  one call per train until it passes; the behind call is the car alone, 3 s or less before the pass.

**Watch list** (recheck at every review):
- v24: no tyre warning from an incident lap; `ldr` in the trace for every race checkpoint. Use it to settle the
  laps-left items below.
- v23 save-to-finish not yet exercised: a short finish reads SAVE TO FINISH, no box calls; check the 10 % limit.
- Leader estimate before its second lap (Spa 11-25: one lap short on laps 0–1; Le Mans 11-24 similar; Barcelona
  11-12 the other way): candidate min(estimate, pole) as the garage, once the `ldr` data shows it.
- v24 repair stops: the leader's flag after a repair stop carries no stop of its own (check with `ldr`).
- Laps left near a lap edge (Sebring 11-22, Le Mans 11-24, Sebring 11-25: 3 s, 4 laps one short): hysteresis does not
  cover a steady miss; own pace median with traffic laps is the other input.
- Radio: traffic calls while crawling and regrouped train calls fixed (11-25, radio session); check the next multiclass
  race. Same call queued many times a second (save calls), bursts, clears right after their warnings (11-22,
  11-24); radio code is another session's work (told).
- Garage laps (v21): held in four more races (Barcelona 11-24, today's three).
- Race tyre wear planned from a few qualifying laps and the used set (11-21: 0.77 planned, 0.935 at the flag on new
  tyres); see "race vs qualifying tyre wear" below.
- Own pace median takes the start lap and incident laps (11-17 race 2: 13–14 left on laps 3–4 for 15–16; Barcelona
  11-24: 18 → 19 → 18 on lap 2).
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, 11-12, 11-17 races 2 and 3, 11-21 and 11-22 after the flag; 11-24 from the
  switching total; 11-25 Spa and Portimão after the flag): asked the driver whether deliberate.
- Start load against plan by choice (Le Mans 11-05: +5–6 L; Barcelona 11-12 +1–2 L; Sebring 11-17 −2 to −4 %; Bahrain
  11-21 −2 L; Sebring 11-22 second event −2 %; Le Mans 11-24 +6 %, which saved the race; Sebring 11-25 +4 %, Portimão
  11-25 +3 %).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05,
  Bahrain 11-21 and all three races 11-25).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11, again 11-24); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s; Sebring starts (11-17 race 3 and 11-22: 10 places on lap 1;
  11-22 second event: 2 places on laps 1–4) and contact (11-17 race 2); Bahrain lap 6 spin; Sebring 11-25 lap 3 crash;
  Spa 11-25 S2 +1.75 s and a lap 6 lockup.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.
- Qualifying split into several recordings at its start (Barcelona 11-24: 4 in 17 s, one empty; Sebring 11-25 one
  empty); the slip tool did not crash on 11-25.

## 2026-11-24 (second event) — GT3, Barcelona GP (barcelona_gp), single class (Ferrari 296 LMGT3)

**Sessions**: qualifying `14Q1` (104.267), race `38R1` (30 min, dry, 31 cars, grid 11 → P10, 18 laps). VE, no stop,
Mediums. Model version 23.

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +0.3 % VE (12 eligible), worst lap +2.0 % (lap 8) |
| 2 | Laps | OK: 18 planned (garage and green), 18 run; one blip 18 → 19 → 18 on lap 2 (own pace from the start laps) |
| 3 | Start load | OK: 0.91 lap of VE at the flag against 0.42 + 0.5; 59 % set, 57 % asked |
| 4 | Formation lap | OK: fuel 0.17 lap, VE unchanged |
| 5 | Stops | n/a: no stop, none called |
| 6 | Tyre wear | OK: worst (FL) 0.82 planned, 0.827 at the flag |
| 7 | Incidents | None: 0.62 s of RR wheelspin on laps 0–1 |
| 8 | Weather | n/a: dry |
| 9 | Data | Miss: race capture, native DuckDB and replay (R1 2) linked, but qualifying split into 4 recordings in 17 s, one empty (no `capture_manifest`; `listWheelSlipEvents.ts` crashes on it) |
| 10 | Learning | OK: processed; barcelona_gp Ferrari cohorts gated (one training session) |
| 11 | Result | P11 → P14 on lap 1, P11 by lap 3, P10 from lap 5 to the flag |
| 12 | Traffic | OK: laps 4–5 flagged, +0.9 and +0.6 s; clear from lap 7 |
| 13 | Driving | Best 103.843 (qualifying 104.267), theoretical 103.636, clean pace ~1.3 s off the winner (S2 +0.68, S3 +0.52, S1 +0.39), consistency 99.7; takeaways: 3 places lost on lap 1, S2 |
| 14 | App output | OK: lap 18 has no time (invalid last lap: the XML writes `--.----` and no next lap start to infer from); standings use the declared 18 laps. Filling it from `FinishTime` judged not worth a parser bump |
| 15 | Deployment | n/a: no battery |
| 16 | Last change (v23) | OK: garage right; save-to-finish not needed (0.9 lap spare) |
| 17 | Radio | OK: 8 calls, all relevant; "Green, sector" follow-ups |

**Changed**: nothing.

**Watch list** (recheck at every review):
- v23 (garage and laps left held at Barcelona 11-24; save-to-finish not yet exercised) at the next race: laps left steady from lap 2; garage plans the laps run (with and without a qualifying session);
  a short finish reads SAVE TO FINISH, no box calls; check the 10 % limit against what the driver saves.
- Laps left near a lap edge: hold a change until it lasts (hysteresis) if v23 still flickers (Sebring 11-22, Le Mans 11-24).
- Radio (11-22, 11-24): same call queued many times a second (save calls), box calls from a switching total, bursts,
  clears right after their warnings; radio code is another session's work.
- Garage laps (v21): check the next single-class garage plans the laps run.
- Race tyre wear planned from a few qualifying laps and the used set (11-21: 0.77 planned, 0.935 at the flag on new
  tyres); see "race vs qualifying tyre wear" below.
- Own pace median takes the start lap and incident laps (11-17 race 2: 13–14 left on laps 3–4 for 15–16; Barcelona
  11-24: 18 → 19 → 18 on lap 2).
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, 11-12, 11-17 races 2 and 3, 11-21 and 11-22 after the flag; 11-24 from the switching total): asked the driver whether deliberate.
- Start load against plan by choice (Le Mans 11-05: +5–6 L; Barcelona 11-12 +1–2 L; Sebring 11-17 −2 to −4 %; Bahrain
  11-21 −2 L; Sebring 11-22 second event −2 %; Le Mans 11-24 +6 %, which saved the race).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05 and Bahrain 11-21).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11, again 11-24); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s; Sebring starts (11-17 race 3 and 11-22: 10 places on lap 1;
  11-22 second event: 2 places on laps 1–4) and contact (11-17 race 2); Bahrain lap 6 spin.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.
- Qualifying split into several recordings at its start (Barcelona 11-24: 4 in 17 s, one empty); the slip tool
  crashes on the empty one.

## 2026-11-24 — GT3, Le Mans (Sarthe), Lexus RC F LMGT3

**Sessions**: qualifying (pole 238.29), race `83R1` (20 min, dry, grid 10 → P4, 6 laps). VE, no stop. Model version 21.

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +0.8 % VE (3 eligible); lap 2 −3.8 % on the game estimate; lap 5 +4.6 % is the driver's lift and coast (3.9 % saved), lap 6 ~9 % saved |
| 2 | Laps | Miss, mechanism: 5 from the green to lap 4 for the 6 run, then 5 ↔ 6 to the end |
| 3 | Start load | Miss, mechanism: the garage asked 49 % for 5 laps; 55 % loaded covered 6 (0.54 % = 0.06 lap at the flag) |
| 4 | Formation lap | OK: VE unchanged |
| 5 | Stops | n/a: no stop, but the dashboard called one ("PIT L5, need 12" and the pit request toggling) |
| 6 | Tyre wear | OK: worst (FL) 0.956 planned for 5 laps, 0.933 after 6 (0.947 for 6 at the plan's rate); wear 0.0106/lap live against ~0.0088 planned, first race of this car here (too few laps for the model) |
| 7 | Incidents | None: no wheel slip; lap 4 traffic |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: live capture verified to the race, native DuckDB and replay (R1 54) linked; all 6 laps timed |
| 10 | Learning | OK: processed; sarthe_full Lexus cohorts gated insufficient-evidence (one session) |
| 11 | Result | P10 → P4 |
| 12 | Traffic | OK: lap 4 flagged, +0.4 s against the clean median (241.8 s); lap 6 +2 s is the lift and coast |
| 13 | Driving | Best 241.64, about 4 s a lap off the leader |
| 14 | App output | Miss: a stop called when none was needed |
| 15 | Deployment | n/a: no battery |
| 16 | Last change (v21) | n/a: no grid-rounding edge here |
| 17 | Radio | Miss: "Box next lap", then "Box this lap. Energy 12 percent" twice from the switching total; "Save 4/5 percent to skip the stop" queued ~70 times in 20 s (expired, one spoken) |

**Mechanism** (boxes 2, 3, 5, 14, 17): the online game estimate for the leader (about 241–244 s, the class estimate on
the grid) does not follow its pace (236.5–238.3 s). The clock (1200 s from the green) sat on the edge: 1200 / 241 =
4.98 → 5 laps, while the real leader started its 6th lap 7 s before the clock end. In the race the leader's last lap
was used only when slower than its estimate, so laps left read one short until lap 4, then switched 5 ↔ 6 each time
the estimate moved. Same cause as Sebring 11-22 (second event) laps 7–10. The game's "5.9" the driver saw was the VE
range (55 % / 9.3 %), not race laps.

**Changed** (LIVE_MODEL_VERSION 23, one bump from 21 for the three changes below; 22 was never released):
- `leaderLapSeconds` (`shared/domain/live/liveLapsLeft.ts`): from the leader's second lap, its last lap counts when
  faster than its estimate too (still within ×1.1). Test: laps left 2 on the last lap edge, 1 before.
- Race garage (`liveStrategyTracker.ts` `garagePlan`): the leader is planned at the faster of its estimate and the
  event's qualifying pole lap (the qualifying leader's best). Test: 7 planned with the formation lap, 6 before.
- Driver's request: short of the flag by a saving up to 10 % (`SAVE_TO_FINISH_MAX_PERCENT` in `racePlanMode.ts`, was
  5 %), the plan is to save, not stop: the dashboard reads SAVE TO FINISH n %, the radio "Save n percent to finish.", and
  no stop is planned for laps left, nor for the leader (`liveSessionTracker.ts`). The stop planned on a 2–6 % shortfall
  made the leader stop too, moved the flag and fed the 5 ↔ 6 switching (found by the radio session). 10 % is the
  driver's call, close to what they saved on the last lap with lift and coast (8.5 % VE against 9.33 %, about 2 s; lap
  5 saved 3.9 %). Test: laps left 2 with a 4.2 % saving, 1 with a stop planned.

**Watch list** (recheck at every review):
- v23 at the next race: laps left steady from lap 2; garage plans the laps run (with and without a qualifying session);
  a short finish reads SAVE TO FINISH, no box calls; check the 10 % limit against what the driver saves.
- Laps left near a lap edge: hold a change until it lasts (hysteresis) if v23 still flickers (Sebring 11-22, Le Mans 11-24).
- Radio (11-22, 11-24): same call queued many times a second (save calls), box calls from a switching total, bursts,
  clears right after their warnings; radio code is another session's work.
- Garage laps (v21): check the next single-class garage plans the laps run.
- Race tyre wear planned from a few qualifying laps and the used set (11-21: 0.77 planned, 0.935 at the flag on new
  tyres); see "race vs qualifying tyre wear" below.
- Own pace median takes the start lap and incident laps (11-17 race 2: 13–14 left on laps 3–4 for 15–16).
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, 11-12, 11-17 races 2 and 3, 11-21 and 11-22 after the flag; 11-24 from the switching total): asked the driver whether deliberate.
- Start load against plan by choice (Le Mans 11-05: +5–6 L; Barcelona 11-12 +1–2 L; Sebring 11-17 −2 to −4 %; Bahrain
  11-21 −2 L; Sebring 11-22 second event −2 %; Le Mans 11-24 +6 %, which saved the race).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05 and Bahrain 11-21).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11, again 11-24); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s; Sebring starts (11-17 race 3 and 11-22: 10 places on lap 1;
  11-22 second event: 2 places on laps 1–4) and contact (11-17 race 2); Bahrain lap 6 spin.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.

## 2026-11-22 (second event) — GT3, Sebring School (sebring_school), single class (BMW M4 LMGT3)

**Sessions**: race `62R1` (20 min, dry, grid 2 → P4). VE, no stop, Mediums. Model version 20; diagnostic file with the
grid leader (`leader` / `classLeader` in `strategy` records, removed once read).

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +0.9 % fuel, +1.2 % VE (11 eligible) |
| 2 | Laps | Miss, mechanism: 20 planned, 19 run (±1); the race total switched 19 ↔ 20 four times on laps 7–10 (leader's fixed 64.70 s estimate against its ~63.8 s laps, the flag near a lap edge of the player's pace) |
| 3 | Start load | Miss (small): 1.50 laps of VE at the flag against 0.7 + 0.5; set 45 % against 47 % asked |
| 4 | Formation lap | OK: VE unchanged, fuel 0.19 lap |
| 5 | Stops | n/a: no stop |
| 6 | Tyre wear | OK: 0.894 at the flag against 0.886 from the model |
| 7 | Incidents | None: clean race, 0.14 s of wheelspin |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: complete recording; the grid leader read GT3, 64.69926 s, the class leader the same car |
| 10 | Learning | OK |
| 11 | Result | P2 → P3 on lap 1, P5 by lap 4, P4 from lap 16 to the flag |
| 12 | Traffic | OK: laps 2, 4, 5, 8, 13, 14 +0.3 to +0.7 s |
| 13 | Driving | Best 64.065, theoretical 63.838, clean pace ~0.3 s off the winner, consistency 99.6; takeaway: two places lost on laps 1–4 |
| 14 | App output | Miss: garage 21 laps with the formation for 20 run |
| 15 | Deployment | n/a: no battery |
| 16 | Last change | Miss: v20 never acted; its premise (no leader estimate on the grid) was wrong |
| 17 | Radio | Miss: 18 calls, 5 interrupted; last lap "Last lap" then the same slow car and its clear twice in 5 s; clears 0.6–1.4 s after their warnings (laps 7, 11); "Green, sector" follow-ups |

**Mechanism** (boxes 14, 16, and the earlier "no leader pace"): the grid leader had an estimate, the same 64.69926 s
as the player's. The garage rounds its own pace to the millisecond (64.699) and keeps the leader's raw: the flag at
19 × 64.69926 s fell 0.005 s past the player's 19th crossing and added a lap. Raw/raw or rounded/rounded plan 20. The
same edge most likely made Bahrain 11-21 and the three Sebring 11-17 garages a lap long (their garage pace looks like
the leader's estimate, rounded); `traceLiveAdvice.ts` could not tell it from the no-leader fallback.

**Change** (applied, uncommitted; `LIVE_MODEL_VERSION` 21): `sessionLaps` (`liveResourcePlan.ts`) counts a crossing
within 0.001 lap of the flag as the flag lap; the v20 rule and its test are reverted. Test "keeps the flag lap when the
leader runs our pace, its estimate unrounded" (`test/domain/live/liveResourcePlan.test.ts`).

**Watch list** (recheck at every review):
- Garage laps (v21): check the next single-class garage plans the laps run.
- Laps left near a lap edge (11-22 second event: 19 ↔ 20 on laps 7–10, leader estimate 64.70 s fixed, its laps ~63.8 s).
- Radio (11-22 both events): bursts, interrupted calls, a clear within seconds of its warning, the same incident called
  twice, "Green" follow-ups; waiting for the driver's remarks (radio code is another session's work).
- Race tyre wear planned from a few qualifying laps and the used set (11-21: 0.77 planned, 0.935 at the flag on new
  tyres); see "race vs qualifying tyre wear" below.
- Own pace median takes the start lap and incident laps (11-17 race 2: 13–14 left on laps 3–4 for 15–16).
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, 11-12, 11-17 races 2 and 3, 11-21 and 11-22 after the flag): asked the driver whether deliberate.
- Start load against plan by choice (Le Mans 11-05: +5–6 L; Barcelona 11-12 +1–2 L; Sebring 11-17 −2 to −4 %; Bahrain
  11-21 −2 L; Sebring 11-22 second event −2 %; since Sebring against a garage a lap long).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05 and Bahrain 11-21).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s; Sebring starts (11-17 race 3 and 11-22: 10 places on lap 1;
  11-22 second event: 2 places on laps 1–4) and contact (11-17 race 2); Bahrain lap 6 spin.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.

## 2026-11-22 — GT3, Sebring School (sebring_school), single class (BMW M4 LMGT3)

**Sessions**: practice `12P1`, qualifying `43Q1` (63.854), race `40R1` (20 min, dry, 20 cars, grid 5 → P8). VE, no stop,
Mediums. Model version 20. First review with the radio (box 17).

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +1.1 % fuel and VE (10 eligible), no run under −2 % |
| 2 | Laps | OK: 19 at the green, 19 run, race total held (no `!` line); garage 21 with the formation for 20 (box 16) |
| 3 | Start load | Miss, mechanism: about 2.2 laps of VE at the flag (13.7 % at lap 15 less four laps at 2.21 %) against 0.69 + 0.5; 47 % set as asked by a garage a lap long |
| 4 | Formation lap | OK: VE unchanged, fuel 0.11 lap |
| 5 | Stops | n/a: no stop |
| 6 | Tyre wear | OK: worst tread 0.875 against 0.883 from the model |
| 7 | Incidents | Lap 1 92.8 s (S3 +18 s), P5 → P15; lap 18 S1 +1.0 s (offPace) |
| 8 | Weather | n/a: dry |
| 9 | Data | Miss, data (outside the app): another session closed the app server at 20:31:16 mid-lap 16, back at 20:37 after the flag; laps 16–19, their radio and the session end not recorded, capture `interrupted`; laps 2–15 reached the learning |
| 10 | Learning | OK: 10 eligible laps, bias about +1 % |
| 11 | Result | P15 after lap 1, P11 by lap 7, passes to P8 by lap 16 |
| 12 | Traffic | OK: laps 2, 3, 5, 6, 16 +0.1 to +1.0 s against the clean median 64.4 |
| 13 | Driving | Best 64.196 against qualifying 63.854, theoretical 64.055, consistency 99.8, clean pace ~0.5 s off the winner; takeaway: the start (10 places, as 11-17 race 3) |
| 14 | App output | Miss: garage 21 laps with the formation for 20 run (box 16) |
| 15 | Deployment | n/a: no battery |
| 16 | Last change | Miss: v20 did not act; the garage still took the latest flag. Either no leader on the grid or its class did not match the player's; the recording keeps no leader reading, so not known |
| 17 | Radio | Miss: 20 calls to lap 16 (19 incidents, "Ten minutes"); lap 7 burst of six calls in 3 s (597.98–600.98), three interrupted, "Yellow, sector 1" with "Turn 1 clear" in the same second; lap 2 clear 0.6 s after its own warning; "Green, sector n" after each clear |

**Change**: nothing in code. Memory: no session stops the app server while LMU runs. Skill: box 17 (radio calls) added.

**Watch list** (recheck at every review):
- Garage leader pace (v20 did not act on 11-22): record the grid leader's class and estimate in the garage audit, then
  fix the rule from what it shows. Driver's call.
- Radio (11-22, first race): bursts and interrupted calls, a clear within seconds of its warning, "Green" follow-ups;
  waiting for the driver's remarks before tuning (radio code is another session's work).
- Race tyre wear planned from a few qualifying laps and the used set (11-21: 0.77 planned, 0.935 at the flag on new
  tyres); see "race vs qualifying tyre wear" below.
- Own pace median takes the start lap and incident laps (11-17 race 2: 13–14 left on laps 3–4 for 15–16).
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, 11-12, 11-17 races 2 and 3, 11-21 after the flag): asked the driver whether deliberate.
- Start load against plan by choice (Le Mans 11-05: +5–6 L; Barcelona 11-12 +1–2 L; Sebring 11-17 −2 to −4 %; Bahrain
  11-21 −2 L; since Sebring against a garage a lap long; 11-22 set as asked).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05 and Bahrain 11-21).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s; Sebring starts (11-17 race 3 and 11-22: 10 places on lap 1)
  and contact (11-17 race 2); Bahrain lap 6 spin.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.

## 2026-11-21 — LMP3, Bahrain Paddock (bahrain_paddock), single class (Ginetta G61-LT-P325 Evo)

**Sessions**: practice `82P1`, qualifying `78Q1` (79.475), race `64R1` (20 min, dry, 20 cars, grid 11 → P7). Fuel only,
no stop, new Mediums. Model version 19.

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +0.7 % (6 eligible), no run under −2 %; meter 1.89–1.94 L |
| 2 | Laps | OK: 16 at the green, 16 run, race total held (no `!` line); garage 18 with the formation for 17 (box 14) |
| 3 | Start load | Miss, mechanism (small): 2.22 L (1.17 laps) at the flag against 0.56 + 0.5; driver set 33 L, the garage's last ask 35 L |
| 4 | Formation lap | OK: 0.37 L (0.19 lap) |
| 5 | Stops | n/a: no stop |
| 6 | Tyre wear | Miss, mechanism (safe side): worst tread 0.935 (RL) against 0.771 planned; the plan took the used set (0.92) and the qualifying rate (~0.009 a lap), the driver fitted the new set, ~0.004 a lap |
| 7 | Incidents | Lap 6 four-wheel lockup and spin, S3 +11.5 s (+12.5 s), P4 → P9; lap 15 S1 +3.4 s (offPace); both excluded from learning |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: forecasts stored, native telemetry linked; garage inputs: no leader estimate on the grid → latest flag (box 14) |
| 10 | Learning | OK: first event of this car at the layout, insufficient evidence, baseline bias +0.15 % |
| 11 | Result | P11 → P6 on lap 1 (two DNFs at the start, passes), P4 by lap 5, P9 after the lap 6 spin, P7 at the flag |
| 12 | Traffic | OK: flagged laps +0.4 to +1.2 s against the clean median 78.60; lap 3 (81.06, 0.5 s behind) was a pass for P5, not flagged |
| 13 | Driving | Clean median ~1.0 s off the winner; best 78.345 against qualifying 79.475, theoretical 78.14, consistency 99.7; takeaways: lap 6 spin (~3 places at the flag), S1 spread 27.3–28.0 |
| 14 | App output | Miss, mechanism: the race garage asked 18 laps with the formation while its race strategy planned 16 racing laps (right); session page not opened |
| 15 | Deployment | n/a: no battery |
| 16 | Last change | OK: v19 removed the lap 1–2 extra lap; the race total held from the green |

**Mechanism** (boxes 3, 14): on the grid the leader has no estimate, so the garage planned the latest flag, one of the
player's laps past the clock. Fourth single-class race in a row a lap long (Sebring School ×3, Bahrain). Replayed:
leader pace 77.3–79.2 s gives 17 with the formation (17 run with the formation), none gives 18.

**Change** (applied, uncommitted; `LIVE_MODEL_VERSION` 20): a grid leader of the player's class without an estimate
takes the class pace the garage plans with; another class keeps the latest flag (Barcelona multiclass)
(`liveStrategyTracker.ts` `garagePlan`); test "takes the class pace for a grid leader of the same class without an
estimate" (`test/domain/live/liveStrategyTracker.test.ts`).

**Watch list** (recheck at every review):
- Garage leader pace (changed in v20): check the next single-class garage plans the laps run, and a multiclass one
  still plans the latest flag.
- Race tyre wear planned from a few qualifying laps and the used set (11-21: 0.77 planned, 0.935 at the flag on new
  tyres); see "race vs qualifying tyre wear" below.
- Own pace median takes the start lap and incident laps (11-17 race 2: 13–14 left on laps 3–4 for 15–16).
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, 11-12, 11-17 races 2 and 3, 11-21 after the flag): asked the driver whether deliberate.
- Start load against plan by choice (Le Mans 11-05: +5–6 L; Barcelona 11-12 +1–2 L; Sebring 11-17 −2 to −4 %; Bahrain
  11-21 −2 L; since Sebring against a garage a lap long).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05 and Bahrain 11-21).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s; Sebring starts (race 3 lost 10 places) and contact (race 2);
  Bahrain lap 6 spin.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.

## 2026-11-17 — GT3, Sebring School (sebring_school), three races (Ford Mustang LMGT3 ×2, BMW M4 LMGT3)

**Sessions**: race 1 `47R1` (Mustang, grid 13 → P6), race 2 `26R1` (Mustang, grid 5 → P7), race 3 `99R1` (BMW, grid 6
→ P4), each after its practice and qualifying. 20 min, dry, single class, VE, no stop, Mediums. Model version 18.

**Scorecard** (race 1 / 2 / 3):

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median error +0.9 / +1.7 / +0.1 % |
| 2 | Laps | OK (±1): 19 at green, 19 run in all three; the garage planned 20 racing laps each time (box 3) |
| 3 | Start load | Noise / OK / Miss, mechanism: 0.67 lap left against a 0.68 reserve (driver loaded 42 for 44 asked), 0.80 lap; 1.95 laps against at most 1.2, loaded as asked (garage one lap long) |
| 4 | Formation lap | OK: 0.16 / 0.17 / 0.10 lap of fuel, VE unchanged |
| 5 | Stops | n/a: no stop |
| 6 | Tyre wear | Not held out / Miss, incident / OK: race 2 0.817 against 0.870 (contacts laps 2, 3, 5, 17, lap 2 lockups 5.6 s); race 3 0.884 against 0.887 |
| 7 | Incidents | Race 1 lap 16 track limits (+0.25); race 2 lap 3 contact (83.1 s, P3 → P14), lap 18 traffic (+7 s); race 3 start (lap 1 83.2 s, P6 → P16), lap 6 contact |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: forecasts stored, native telemetry linked (replay link not checked) |
| 10 | Learning | OK: BMW cohort insufficient evidence; Mustang measured model rejected (no gain on a good baseline) |
| 11 | Result | Race 1 gains over laps 1–17; race 2 lost its places at the lap 3 contact, back to P7; race 3 P16 after lap 1 to P4 |
| 12 | Traffic | OK: flagged laps match the gaps |
| 13 | Driving | Clean median +1.48 / +1.35 / +0.68 s on the fastest (7th of 15, 6th of 19, 6th of 18); race 3 best 64.195 against qualifying 63.894, sectors +0.23 each; takeaways: race 3 start, race 2 contact |
| 14 | App output | Miss: laps left one too many through lap 2 in all three; "PIT L19, need 40/4" for that lap in races 1 and 2 |
| 15 | Deployment | n/a: no battery |

**Mechanism** (box 14): the v18 rule took the leader's standing-start lap (69.0–70.7 s against about 64 s, within the
10 % window) as its pace until its second lap ended, which moved the projected flag a lap later. Replayed at race 1,
201.7 s: 19 with the start lap, 18 without (19 run).

**Garage** (box 3): the leader's estimate was missing in the race garage in all three races, so the plan fell back to
the latest flag, one of the player's laps past the clock: 21 laps with the formation for 20 (any leader pace 63.6–64.6 s
gives 20). The fallback guards a faster multiclass leader (Barcelona was a lap short); left as the driver's call.

**Change** (applied, uncommitted; `LIVE_MODEL_VERSION` 19): the leader's last lap counts only from its second lap
(`liveLapsLeft.ts` `leaderLapSeconds`); test "keeps the leader on its estimate after its start lap"
(`test/domain/live/liveLapsLeft.test.ts`).

**Watch list** (recheck at every review):
- Garage with no leader estimate (11-17, three races): one lap long by design; own pace as the leader's would fit a
  single-class race but risks multiclass (Barcelona short). Driver's call.
- Own pace median takes the start lap and incident laps (11-17 race 2: 13–14 left on laps 3–4 for 15–16).
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, 11-12, and 11-17 races 2 and 3 at the flag): asked the driver whether deliberate.
- Start load against plan by choice (Le Mans 11-05: +5–6 L; Barcelona 11-12 +1–2 L; Sebring 11-17 −2 to −4 % against a
  garage one lap long, finishing at the reserve).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s; Sebring starts (race 3 lost 10 places) and contact (race 2).
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.

## 2026-11-12 — LMP3, Barcelona (barcelona_gp), multiclass with LMP2 (Ginetta G61-LT-P325 Evo)

**Sessions**: practice `57P1`, qualifying `93Q1` (97.777, class P13), race `08R1` (30 min, dry, LMP2 leads overall).
Fuel only, no stop, Mediums. Model version 17.

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median −1.1 % (7 eligible), no run under −2 %; 2.19 → 2.24 L a lap over the race |
| 2 | Laps | OK (±1): 19 planned, 20 run; laps left one short all race (box 3) |
| 3 | Start load | Miss, mechanism: 0.60 L (0.27 lap) at the flag against 0.45; the plan was for 19 laps, the driver's 45 L covered the 20th |
| 4 | Formation lap | OK: 0.31 L (0.14 lap) |
| 5 | Stops | n/a: no stop |
| 6 | Tyre wear | OK: worst tread 0.882 at the flag against 0.864 planned (+1.8 points) |
| 7 | Incidents | OK: laps 3, 4 and 9 invalid, track limits +0.25 on laps 4 and 9; none fed a plan |
| 8 | Weather | n/a: dry |
| 9 | Data | OK: forecasts stored, native telemetry linked, nothing pending (replay link not checked) |
| 10 | Learning | OK: insufficient evidence (first race of this car at the layout) |
| 11 | Result | Class grid 13 → class P4 (P19 overall): five cars without a lap (grid 1, 6, 10, 19, 20), grid 8 stopped, the rest on track |
| 12 | Traffic | OK: lap 2 (+0.9 s) and lap 11 (~+10 s) against the clean median |
| 13 | Driving | Clean median 97.59, 5th of class, +1.57 s on the class winner; best 96.482 against qualifying 97.777 and class best 95.522; sector gaps S1 +0.13, S2 +0.45, S3 +0.33; slip 4.0 s |
| 14 | App output | Miss: laps left one short (box 3). Lap counts match the XML (the class winner's 19 is completed laps, its 20th untimed) |
| 15 | Deployment | n/a: no battery |

**Mechanism**: the clock ended at 1944 s; the LMP2 leader crossed at 1939.8 and took the flag at about 2029.4, the
player crossed 1.1 s before it (2028.3) and ran lap 20. Laps left projects the flag from the leader's game estimate,
about 88.6 s (its early laps and best 88.58), while its late laps were 89.6 s; two laps at the estimate put the flag
at about 2027.5, ahead of the crossing, so lap 18 read 1 left instead of 2. The leader's 97.6 s start lap did the same
from the green (19 shown).

**Change** (applied, uncommitted; `LIVE_MODEL_VERSION` 18): the leader's lap for the flag is its last lap when slower
than the estimate and within 10 % of it (`liveLapsLeft.ts` `leaderLapSeconds`); at 1930.4 the flag moves to 2029.5 and
reads 2 (`test/domain/live/liveLapsLeft.test.ts`). In-race only: the garage still projects from the estimates.

**Watch list** (recheck at every review):
- Leader pace in multiclass laps left (11-12): check that the in-race count holds; garage flag without the leader's
  slow start lap (+8.5 s at Barcelona) and the crossing margin to the flag are candidates if a garage plan is short again.
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles (11-10, 11-11, and 11-12 from 1997.6 s on the last laps): asked the driver whether deliberate.
- Start load above plan by choice (Le Mans 11-05: +5–6 L both races; Barcelona 11-12 +1–2 L, which covered the short plan).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11; Barcelona S2 +0.45 s to the class best.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.

## 2026-11-11 — LMP2, Le Mans (sarthe_full), wet start drying (Oreca 07)

**Sessions**: practice `80P1`, qualifying `19Q1` (wet, 236.5 s, P4), race `17R1` (60 min, rain to ~1410 s, path
wetness 0.4 → 0.6 → 0.05). Fuel only, one stop, wets all race. Model version 16 (pit-lane load fix live).

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median +0.2 %; lap 7 −3.0 % alone (traffic) |
| 2 | Laps | Miss, weather: garage 18 laps from the dry estimate (218.7 s), 16 run; second race (11-10 too). The 75 L cap is the event's setting: without it the garage asked ~15 L too many |
| 3 | Start load | OK: 2.26 L (0.37 lap) at the flag against 0.19 |
| 4 | Formation lap | OK: 0.71 L (0.12 lap) |
| 5 | Stops | OK: lap 11 as planned, stationary 16.2 s for 15.6 estimated; load needed held at 33 L from entry over the line to the box (fix confirmed), driver set 33 |
| 6 | Tyre wear | n/a: wets |
| 7 | Incidents | Lap 4 contact (1216 N, ~3.5 s), lap 5 wall (≤588 N, +13 s), lap 12 out-lap contact (1136 N), laps 14–15 +7 s in S1 each (199 N contact, post), lap 16 wall 6128 N with suspension damage (+27 s, P7 → P9) |
| 8 | Weather | OK: forecast "dry @1420" for rain gone by 1411; no slicks advice, right: late laps on wets 230.1 s against 235.3 s on Mediums |
| 9 | Data | OK: 21 settings checkpoints (tread rounding held), native telemetry and recording linked, 6 of 12 forecasts eligible |
| 10 | Learning | OK: Oreca wet cohort here not calibrated yet (two races) |
| 11 | Result | Grid P4 → P5 lap 1 → P4 laps 2–3 → P5 (lap 4 contact) → P6 (lap 5 wall) → P7 (lap 7 traffic) → P8 after the stop → P6 lap 13 → P7 (lap 14 off) → P9 (lap 16 crash) |
| 12 | Traffic | OK: laps 2 and 7 flagged |
| 13 | Driving | Clean median laps 8–10 234.6 s, 5th of 16, +3.9 s on the fastest, mostly S3 (106.5 against 103.0); best 228.535 (class 224.77); consistency 98.6; slip 34.6 s, double 11-10 (front lockups FR 34, FL 28) |
| 14 | App output | OK: the live plan agreed with the race. Session page not opened |
| 15 | Deployment | n/a: no battery |

**Change** (applied, uncommitted; `LIVE_MODEL_VERSION` 17): on a wet track the garage plans from the event's own laps
(kept since the last wet/dry change), and slows the leader's estimate by the same factor; the game's estimates are dry
pace (`liveStrategyTracker.ts` `garagePlan`). 11-11: 236.5 s from the wet qualifying lap, 17 laps with the formation
(16 run) for 18 (`test/domain/live/liveStrategyTracker.test.ts`). 11-10 had no wet qualifying lap, so it would still
have used the dry estimate.

**Watch list** (recheck at every review):
- Wet garage with no wet lap in the event (11-10): still the dry estimate; layout wet history would cover it.
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, below the reserve; 11-11 held).
- Late pit request toggles on laps 14–15 (11-10 and 11-11): asked the driver whether deliberate.
- Start load above plan by choice (Le Mans 11-05: +5–6 L both races).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 on 11-10, S3 on 11-11); incident laps (11-05, 11-11 last-lap wall);
  front lockups doubled on 11-11.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.
- Closed: pit-lane load after a line ahead of the box (held at 33 L on 11-11); wet garage from a dry estimate when the
  event has a wet lap (fixed).

## 2026-11-10 — LMP2, Le Mans (sarthe_full), wet start drying (Oreca 07)

**Sessions**: qualifying `08Q1` (no time), race `83R1` (60 min, 25 LMP2, rain to ~1430 s, path wetness 0.4 → 0.6 →
0.05). Fuel only, one stop, wets all race. Model version 15.

**Scorecard**:

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK: median −0.4 %; use rose with the drying track (5.86 → 6.19 L), the last 8 forecasts all slightly under |
| 2 | Laps | Miss, weather: garage 18 racing laps from a dry lap time (217 s), 16 run; green 17 within ±1; same one stop either way |
| 3 | Start load | Miss, mechanism: 1.08 L (0.18 lap) at the flag against 0.21; the last stint used 6.23 L a lap for 6.10 planned |
| 4 | Formation lap | OK: 0.46 L (0.08 lap) |
| 5 | Stops | Miss, mechanism: stop on the planned lap, service 14.6 s as estimated, MFD 26 L is the fill-to level (26.0 L after); the load needed fell 26 → 20 L once the line (ahead of the box) was crossed in the lane |
| 6 | Tyre wear | n/a: wets, no wear model |
| 7 | Incidents | Clean: one 133 N touch (lap 9), 13 track-limit reviews without action; laps 2 and 7 lost 8–12 s in S3 to traffic |
| 8 | Weather | OK: forecast "dry @1421" for rain gone by 1432; no slicks advice at 0.05–0.15, right: the three LMP2 cars on Mediums were 8–15 s a lap slower than the wets; driver set No Change at 1643 s |
| 9 | Data | OK: garage checkpoint, recording and native telemetry linked; 8 of 12 forecasts eligible (4 traffic). Replay link not checked |
| 10 | Learning | OK: Oreca wet cohort insufficient (8 laps, one session) |
| 11 | Result | Grid P17 → P9 lap 1 → P12 lap 2, then pace and 9 retirements; P3 during others' stops, P5 after the own stop |
| 12 | Traffic | OK: laps 2, 3, 4, 7 flagged |
| 13 | Driving | Clean median laps 8–11 235.6 s, 5th of 12, +4.3 s on the fastest (S1 +0.8, S2 +2.1, S3 +0.7); best 226.149 on the last lap (class 225.02); consistency 98.1; slip 15.4 s, mostly front lockups |
| 14 | App output | Miss, mechanism: the box-5 load drop. Session page not opened |
| 15 | Deployment | n/a: no battery |

**Change** (applied, uncommitted; `LIVE_MODEL_VERSION` 16): in the pit lane (`entering`/`stopped`) the stop loads
for the laps still to drive, `lapsLeft − lapFraction` plus the reserve, wherever the line falls in the lane
(`liveResourcePlan.ts` `inPitLane`). Le Mans 11-05 race 1 52 → 45 L and 11-10 26 → 20 L both hold now (52, 26)
(`test/domain/live/liveResourcePlan.test.ts`).

**Watch list** (recheck at every review):
- Fuel use rising as the track dries: the meter lags it (11-10: +2 % on the last stint, 0.5 L, below the reserve).
  Driver asked whether the late pit requests (laps 14–15) were for a splash.
- Garage plan of a wet race from a dry lap time (11-10: 18 planned, 16 run).
- Start load above plan by choice (Le Mans 11-05: +5–6 L both races).
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans 11-05).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front (S2 the largest part in the wet); lap 1 and late-race contacts on 11-05.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.
- Closed: load needed in the pit lane after a line ahead of the box (two Le Mans races, fixed); wets held at 0.05
  (Damp = wet, confirmed against the class on Mediums).

## 2026-11-05 — LMP2, Le Mans (sarthe_full), two races (Oreca 07)

**Sessions**: qualifying `42Q1`, `07Q1`; race 1 `90R1` (30 min, 38 LMP2, pit lane start), race 2 `44R1` (30 min, 34
LMP2). Dry, fuel only. First Oreca event at Le Mans; both races on model version 15 (the Daytona fixes live).

**Scorecard** (race 1 / race 2):

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK / OK: median −0.5 % / +1.0 %; race 1 lap 3 from the game estimate (qualifying gave game data only) |
| 2 | Laps | OK / OK: 8 held steady; 9 planned, 9 run |
| 3 | Start load | Miss, driving (choice) / same: 9.1 L (1.44 laps) and 9.7 L (1.53 laps) at the flag against 0.21 lap; loaded 66 L (plan 59–60) plus 5 L at the stop, and 67 L (plan 61, which leaves ~0.58 lap) |
| 4 | Formation lap | n/a (pit lane start) / OK: 0.58 L (0.09 lap) |
| 5 | Stops | OK / n/a: unplanned repair stop on lap 1 (27 s standing); laps left held at 8 from lane entry to the line (pit-lane fix confirmed) |
| 6 | Tyre wear | OK / OK: garage projection 0.885, actual 0.881 (race 2 held out); FR slightly under (−0.004) |
| 7 | Incidents | Race 1: lap 1 post (294 N) and wall (3456 N, suspension) → repair stop; race 2: lap 1 contacts (Delmanson 1044 N), lap 8 Buttier and wall (2907 N, suspension), lap 9 several contacts (225.7 s) |
| 8 | Weather | n/a / n/a: dry |
| 9 | Data | Miss, data / Miss, mechanism: recording from 263 s (late pit lane start, realtime only), no race garage; 109 grid checkpoints from unrounded tread (0.9999997), grid forecast "none @64" |
| 10 | Learning | OK / OK: Oreca Le Mans cohorts insufficient (first event) |
| 11 | Result | Race 1: pit lane start ~77 s down, P47 after lap 1, class P22 of 38 (13 DNF); race 2: grid P15, P10 lap 1, P13 by lap 7 on pace, P13 of 34 (10 DNF) |
| 12 | Traffic | OK / OK |
| 13 | Driving | Clean median 212.46 (14th of 25, field 212.25, +4.2 s on the leader) / 213.38 (16th of 26, +4.3 s, damage after lap 8); best 211.018 / 212.389 against PB 210.434, theoretical 210.83 / 210.48, consistency 99.7 / 99.8; slip 11.8 / 10.8 s, mostly front lockups |
| 14 | App output | Miss, app / OK: the lap 1 repair stop was hidden (stops 0, lap 2 with the stop read off pace). Session pages not opened |
| 15 | Deployment | n/a / n/a: LMP2, no battery |

**Changes** (applied, uncommitted):
- Parser 2.26: a timeless lap 1 pit flag counts as a stop when the declared `<Pitstops>` exceed the later pit flags
  (27 of 112 such drivers in the stored race XMLs had one stop hidden). Race 1: lap 1 stop (inferred 328.9 s), lap 2 out-lap
  (`test/server/sessions/parserStream.test.ts`). Needs the reparse the version bump starts.
- Grid tread rounded to 0.1 % in `garageTyres` (Daytona race 1: 165 checkpoints, Le Mans race 2: 109); the jitter also
  read a new set as used (`test/domain/live/liveStrategyTracker.test.ts`). Checkpoints only, no model version bump.

**Watch list** (recheck at every review):
- Start load above plan by choice (+5–6 L both races): check the plan's load before changing anything.
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Game session-start placeholder estimate feeding the game-forecast learning (Daytona race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (Daytona race 2 lap 20, game behaviour); a warning could help.
- Grid forecast read against the session length before the start ("rain in 47 s" Daytona, "none @64" Le Mans race 2).
- Wets on forecast rain: forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (Daytona); check the earlier advice at the next hybrid race.
- Driving: Le Mans pace ~4 s off the class front; lap 1 and late-race contacts (two suspension hits); Daytona S1 and S3.
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone); race vs qualifying tyre wear;
  "lowest 2 of 5" meter; race plan from the leader's pace; damage pace after impact.
- Closed: formation-lap checkpoint flood (rounded); laps left in the pit lane held (Le Mans race 1); no race garage on a
  pit lane start (race 1, driver confirmed; the last garage snapshot is now the recording's first checkpoint).

## 2026-11-05 — Hypercar, Daytona road course, two races (Genesis GMR-001)

**Sessions**: practice `90P1`, `14P1`, qualifying `07Q1`, `43Q1`; race 1 `02R1` (60 min, 53 cars, game crash on lap 2,
two recordings), race 2 `32R1` (60 min, 62 cars, one recording). Both VE-limited, rain from about 60 % of the race.
First Genesis event at Daytona.

**Scorecard** (race 1 / race 2):

| # | Box | Result |
|---|---|---|
| 1 | Fuel/VE per lap | OK / OK: median +1.1 / +0.3 % (race 1), +0.5 / +0.7 % (race 2); wet laps over-forecast 4–7 % (slower laps use less) |
| 2 | Laps | Miss, weather + incident / same: 38 planned, 30 run (crash ~280 s, repair ~210 s, leader 36); 39 planned, 34 run (repair ~155 s, leader 35) |
| 3 | Start load | Miss, incident / same: 33 % (7.3 laps) and 21 % (4.7 laps) at the flag after the repair stops and wet pace; the dry stop loads were right |
| 4 | Formation lap | OK / OK: fuel 0.47 L and 0.41 L (0.14 lap), VE unchanged |
| 5 | Stops | Miss, incident / Miss, mechanism: both planned stops made on plan; unplanned repair stops (race 1 lap 25, ~300 s standing; race 2 lap 22, 182 s). Race 2: the box read 81 % needed for 76 % (laps left +1 in the pit lane) |
| 6 | Tyre wear | n/a / n/a: no Genesis model yet, compounds changed at the stops |
| 7 | Incidents | Race 1: crash at 437 s (rejoin 582 s), lap 6 contact, laps 12–14 damage, lap 25 impact; race 2: lap 22 out-lap wall hit on Mediums in light rain (2876 N, flat FR, parts off), lap 30 cone |
| 8 | Weather | Miss, app / Miss, app: "slicks now" on freshly fitted wets while rain fell on a dry path (17 s, 13 s); race 2 forecast "dry, 100 %" at 2251 s for rain that stayed to the flag. Slightly wet = 0.125 confirmed (snapshots round it to 0.15) |
| 9 | Data | Miss, data / OK: race 1 split in two recordings by the crash, native linked to the second only, 165 formation-lap checkpoints from unrounded grid tread; race 2 clean |
| 10 | Learning | OK / OK: Daytona Genesis cohorts insufficient (first event); race 1 lap 3 game forecast +65 % from the session-start placeholder |
| 11 | Result | Race 1: class P17 → P18 (crash to 51st overall, back to 38th by lap 23, repair lost two); race 2: P21 → P9 (P5 by lap 20 with 18 Hyper DNFs, P12 after the repair, 6th-fastest of 14 on wets) |
| 12 | Traffic | OK / OK: flagged where the gaps say so |
| 13 | Driving | Race 1 best 1:35.832 (+1.59 s on the class); race 2 new PB 1:35.153 (+0.79 s on the class best, qualifying 1:35.45), dry median 11th of 21, sector gaps S1 0.40, S2 0.13, S3 0.40 s; consistency 98.8 / 99.1 % |
| 14 | App output | Miss, app / OK: race 1 garage showed no fuel ratio and "fuel short 6.9 laps" (game placeholder 4.74 L, ratio 1.05 beyond the 0.72 maximum); race 2 recommended 0.67 (set 0.68). Session pages not opened |

**Mechanism / app findings and changes** (applied, uncommitted; `LIVE_MODEL_VERSION` 15, a regression test from these
races with each):
- Laps left gained a lap in the pit lane: the planned stop stopped counting on lane entry before the lost time showed
  (both races; race 2 18 laps in the box for 17). `liveSessionTracker.ts` counts what is left of the stop in progress
  (`test/domain/live/liveSessionTracker.test.ts`).
- "Slicks now" while raining on a path still dry (both races). `liveTyreCrossover.ts` holds wets while rain falls.
- Forecast "dry, 100 %" for early rain under dry nodes with a rain node at the finish (race 2; race 1 hit it just after
  the dry node's window). `liveForecast.ts` reads rain with no rain node behind as the next rain node arriving
  (`test/domain/live/liveCarCondition.test.ts`).
- Race garage ratio: a game estimate beyond every setting now recommends the highest setting, with no fuel bias
  (`liveInsights.ts`); a measured lap beyond them still gives none.
- Deployment advice half a lap late: the lap average lags the charge by half a lap; it is carried forward by half the
  lap's change (`deploymentGuidance.ts`). Replayed over both races and Spa practice: race 1 drain advice lap 3 for 4,
  race 2 wet charge advice at 70 % in the lap for 80 %; one extra advice in race 2 just before the stop; Spa unchanged.
  The lap low/high point instead advised up to a lap earlier but fired on swings that turned by themselves (rejected).
- Not applied (user): history keyed by car model; after the race 1 crash the plan used the Peugeot 9x8's Daytona VE
  history (3.54 %/lap for 4.66 measured), pit lap 27 for 21, "save 20.6 %" on laps 2–3.

**Watch list** (recheck at every review):
- History by class, not car (not applied): recheck when a car's first race at a layout follows another car's there.
- Game crash clears the event meters ('offline' reset); with the history above it fell to the other car's history.
- Formation-lap checkpoint flood from unrounded grid tread (race 1: 165; race 2 none).
- Game session-start placeholder estimate (4.7 L) feeding the game-forecast learning (race 1 lap 3, +65 %).
- Tyres picked in the MFD after service starts are not fitted (race 2 lap 20, game behaviour); a warning could help.
- Grid forecast "rain in 47 s" for 45 s while the session length read 63 s (before the start).
- Wets on forecast rain (race 1 fitted at lap 20 on a dry path): forecast term needs several races. Grip 0 and 1 unconfirmed.
- Deployment: driver changes several laps after the advice (race 1 lap 4 → 9, race 2 lap 26 → 29); check the earlier advice.
- Driving: Daytona S1 and S3 (+0.40 s each); out-lap on cold Mediums in light rain (race 2 wall hit).
- Carried: start load bias (Silverstone); laps left mid-race 30 vs 29 (Silverstone; the pit-lane fix is a different
  case); race vs qualifying tyre wear; "lowest 2 of 5" meter; race plan from the leader's pace (Daytona: garage and plan
  card agreed, 38/39 and 39/40); damage pace after impact.
- Closed: Slightly wet = 0.125 (Daytona, both races).

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
