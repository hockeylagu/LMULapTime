# Habit focus (proposal)

Proposed 2026-11-20 from the debrief redesign, reviewed the same day against the code and the driver's history,
with the driver's answers to the review's questions.
Nothing here is built beyond the current debrief ("Keep an eye on", "Improving") and the track page's corner trends.

## Outcome

The driver's lap time improves over time without opening telemetry to find where and how time is lost. The app picks
the two corners that cost the most, says what to change there, and shows after each session how they moved. It is a game
with a finish line that moves with the driver: the next pace level of the Reference Benchmarks above the session's
true pace (a Midpack session aims for Good, a Good one for Competitive).

Deterministic throughout (AGENTS.md §3C): measured gaps and costs, fixed rules, no AI.

## Decisions (driver, 2026-11-20)

- **Target:** the layout's fastest in the class, the same for every session in a series, for the habits (the goal
  has its own reference, below). Today each session is measured against its own reference, which changes from session to session, so the costs
  cannot be compared over time. The fastest in the driver's own car was considered and not taken (it exists on 63 of
  71 layout-cars and is 0.45% slower, median).
- **The engine is reworked first.** Rules that fail the outcome check below get a new measure or go, with a small blind
  hand-analysis round on the reworked engine, before the focus is built on them.
- **The advice names the cause and always shows the minimum speed,** the driver's and the target's. The live dashboard
  could then show the km/h to aim for at each apex of a focus corner.
- **No driver-wide line for now.** The feature stays per layout and class (merged across cars in the same class, 2026-11-21: across 33 cross-car transitions, top-2 corner overlap matched same-car at 0.88 vs 0.90/2 and cross-car habits passed the outcome check at 87% down / 23% wider; same-car checks and gear comparisons remain per car).
- **A new fastest is rare and accepted.** When one arrives, the whole history is measured against it again.
- **Goal:** the next pace level of the Reference Benchmarks, measured on the benchmark target. Driver, 2026-11-21,
  on the first build (which measured against the target driver): "the goal is for the overall laptime (the benchmark
  target) not a percent of the best lap we have in our db"; then, on the fixed 101%: "the goal percent should be
  removed or re phrased to be more like 0.76s to find for the next benchmark, so a midpack the next is good and good
  the next is competitive the midpack will never be able to go directly to alien pace". There is no percent to set.
- **True pace, not the best lap,** so one lucky lap does not reach the goal. A qualifying lap is not a lucky lap: a
  qualifying session counts with the laps it has.
- **Qualifying, practice and race sessions share one series.** The same habits show in each, even when the lap times
  differ.
- **Two focus corners, and the focus must be stable.** If it changes every session, it is not a focus.
- **Default = most impact, kept stable.** Without pins, the focus is the 2 corners whose habits cost the most.
- **Good enough = not the costliest.** There is no bar to pass and a habit is never "fixed". A corner leaves focus when
  another clearly costs more, and stays tracked in Progress.
- **Every corner shows its progress** on corner trends, focus or not, and the driver can make any of them a focus
  (a pin).
- **Pins sit inside the 2 slots** and last until the driver removes them. Two pins leave no automatic pick.
- **Corners with no clear cause** can be pinned but are never picked automatically: only named habits come with advice.
- **Layout first, backend after.** The debrief layout ships first on today's data, mocked 2026-11-20.

## Terms

All of these belong to one layout and one class (across cars in the class; same-car checks and gear comparisons remain per car model via `carModel` in `cornerAnalysisService.ts`). On Track Detail → Corner Trends, selecting a specific car model filters the habit history to that car.

- **Analysed session:** a session of the driver with counted passes of the current build. Counted laps are dry only
  (`dbCornerAnalysisStore.ts`), so a wet session is never in a series and needs no rule.
- **True pace:** the average of the 3 fastest clean dry laps (`session_driver_condition_summaries`,
  `fastest_three_time_sum / fastest_three_count`). A practice or race session with fewer than 3 has none. A qualifying
  session uses the 1 or 2 laps it has.
- **Target:** one session of another human driver in the class: the best true pace over 3 laps, among those with
  counted passes over at least `minTrendPasses` laps (ties: the lower session id). The habits compare with its usual
  passes. A turn the target has no usual through takes the fastest usual there (today's
  `cornerReference`). Without any such driver there is no target: the card says so, as it does today.
- **Corner:** a sequence of the class's map (`placedLayoutCorners`): one or several official turns driven as one, or
  an official turn alone where the class has no map. It is the unit of a corner trends row and of the corner card.
- **Corner cost:** the driver's usual time through the whole corner minus the target's, in s/lap
  (`corners[].lossSec`, which `analyzeCorners` already returns). It can be negative.
- **Corner habit:** the named habit with the highest priority among the corner's turns
  (`priority = loss × repeatability × confidence`); it names its turn. None when no rule explains the loss.
- **Gap:** the habit's own measure at that turn, the driver's usual against the target's, in the rule's unit (m,
  km/h, s, gear). It comes from `cueMeasure` in `habitHistory.ts`, which already compares two usuals for the driver's
  own cue. It is computed in every session that measured the turn, whether or not the rule held there, so the series
  has no holes.
- **Score:** the mean of the corner habit's priority over the last 5 analysed sessions that measured the corner
  (`HISTORY_SESSIONS`), this one included; 0 for a session with no named habit there.

**A focus is a corner (a sequence), not a single turn and not a rule.** 57% of the corners hold several turns, with
77% of the official turns and 66% of the lost time. Inside one, closing the minimum speed gap at a turn made that turn
quicker in 85% of cases and the whole corner in 73%: about 1 gain in 6 is given back at the corner's other turns. So
the cost, the progress and the slipping tag are measured over the whole corner, and the advice points at a turn inside
it, with that turn's minimum speed. The corner's top habit moves to another of its turns in 27% of next sessions, and
the same loss is often named two ways (the same rule showed again in 69% of cases), so the row shows the corner's
current habit. The focus is as stable on a turn as on a corner (18% of sessions with the rules below).

## Engine rework (before the focus)

**Outcome check.** A measure is dependable when the driver closing it makes the turn quicker. For a turn where the
measure is present in one session, take the same turn in the next session: the gap closed or widened by at least one
step (3 m, 1.5 km/h, 0.15 s, 10 brake points), and the turn's cost went down or not. Both groups come from the same
selection, so the difference between them is the measure's doing. **A measure may headline a focus only when the cost
went down in at least 65% of the closed cases and at most 40% of the widened ones, with 15 cases or more in each.**
The check becomes a kept read-only tool (`tools/analysis/`), rerun whenever a rule or the target changes.

Today's rules, each on the turns where it was named (class target, 2026-11-20):

| Rule | Cost down when the gap closed | Cost down when it widened | Verdict |
|---|---|---|---|
| Over-slowing (minimum speed) | 80% of 567 | 20% of 283 | pass |
| Brake early | 74% of 57 | 20% of 41 | pass |
| Brakes where the target lifts | 100% of 12 | 80% of 5 | passes, few cases |
| Part throttle | 61% of 314 | 43% of 177 | weak |
| Coast | 60% of 343 | 53% of 105 | no link |
| Drag brake | 56% of 80 | 63% of 27 | no link |
| Apex early | 57% of 49 | 51% of 57 | no link |
| In fast, out slow | 28% of 64 | 70% of 20 | backwards |

Candidate measures, on every turn losing time in that half unless noted:

| Measure | Cost down when closed | When widened | Verdict |
|---|---|---|---|
| Minimum speed lower | 82% of 505 | 22% of 293 | pass |
| Exit speed lower | 84% of 606 | 25% of 377 | pass |
| Entry speed lower (over-slowing turns) | 76% of 297 | 38% of 138 | pass |
| Brake point earlier (over-slowing turns) | 65% of 198 | 45% of 113 | weak |
| Braking longer (over-slowing turns) | 68% of 184 | 52% of 77 | weak |
| Throttle point later | 66% of 361 | 48% of 141 | weak |
| Part throttle longer | 60% of 885 | 48% of 445 | no link |
| Coasting longer | 57% of 329 | 54% of 81 | no link |
| Slowest point earlier | 59% of 645 | 47% of 295 | no link |
| Turn-in earlier (over-slowing turns) | 48% of 135 | 67% of 78 | backwards |

The speeds carry the time; the pedal timings barely do. The same holds against an own-car target. On the turns named
drag brake, coast, apex early and part throttle, the minimum or the exit speed passes where the rule's own measure
does not: they are the same losses under a weaker name. A speed is partly the turn's time by another name, so a pass
says the number is a faithful score, not that it is easy to act on; the causes are there for that.

### The line (driver's question, 2026-11-20)

The driver asked whether the engine uses the turn-in point, the steering wheel and the road used, and how to put a
number on the line so the map shows how the faster car carries more speed. Measured with `lineCheck.mts` on 2,195
stored laps (63 layout-cars, 354 sessions). The stored laps hold the car's position and steering at full rate, and all
34 layouts driven have road edges.

At any point of a corner, speed² = sideways g × the radius of the arc the car is on. That is geometry, not a model, so
a minimum speed gap splits exactly in two: the driver is on a **tighter arc** (the line), or on the same arc with
**less sideways g** (the grip used). Per counted pass: the arc radius at the slowest point (the circle through the
car's positions 0.5 s before, at and after it), the sideways g there, and the road position at the apex (the most
inside point). The road positions at turn-in and at the exit (the widest point after the slowest) were measured too
and are no longer stored: no kind of loss followed them, and nothing reads them.

| Measure | Lap-to-lap spread | Usual gap to the target | Cost down when closed | When widened | Verdict |
|---|---|---|---|---|---|
| Arc tighter at the slowest point | 3.8 m | 8.6 m | 66% of 765 | 35% of 340 | pass |
| Less sideways g at the slowest point | 0.04 g | 0.09 g | 67% of 785 | 39% of 376 | pass |
| Lower peak sideways g in the turn | 0.03 g | 0.11 g | 72% of 761 | 27% of 463 | pass |
| Apex further from the inside | 0.3 m | 0.5 m | 60% of 685 | 42% of 246 | weak |
| Turn-in less wide | 0.3 m | 0.8 m | 57% of 400 | 50% of 179 | no link |
| Exit less wide | 0.35 m | 0.65 m | 56% of 597 | 49% of 215 | no link |
| More steering at the slowest point | 0.02 | 0.05 | 53% of 624 | 50% of 318 | no link |

- **The line can be measured:** every value is steady lap to lap at about half the usual gap to the target.
- **Of 2,952 over-slowing turns, 47% are mostly a tighter arc, 38% mostly less sideways g, 15% both** (54 / 36 / 10
  where the target drives the same car). The split helps a little to say which change pays: on tighter-arc turns the
  cost fell in 67% of 513 cases where the arc widened and 61% of 163 where only the g rose; on less-g turns, 68% of 457
  against 55% of 232.
- **Road position alone does not carry the time.** Turning in wider, a closer apex or a wider exit, each on its own,
  moved the corner time no better than chance. The same holds for the amount of steering, and the turn-in point was
  backwards above. They are how an arc is made, so they belong on the picture, not in the advice.
- **Limits.** The arc and the g rise with the minimum speed by construction, so they describe how the speed is
  carried; they are no second proof. The sideways g also depends on the car, and the class target drives another car
  in 2 cases of 3: "less grip used" is firm in the same car and softer otherwise.
- **Road edges:** 21 of the 34 layouts have no odd turn; the other 13 have 1 or 2 turns where the target's apex sits 5
  to 13 m from the edge (Bahrain, Fuji, Sebring, Road Atlanta, Portimão), so the edge there is not the white line of
  the corner. The position against the target's needs no edge and works everywhere.

Real example, Spa GT3, Malmedy: 128 km/h against 134, arc 86 m against 87 m, 1.53 g against 1.63 g. The same line;
the target leans on the car harder.

### Other channels checked (driver's question, 2026-11-20)

The stored laps also hold measured forward and sideways g, sideways velocity and each tyre's slide speed, which the
engine never reads. They exist on 39% of the measured turns (1,792 of 4,551; older cached laps lack them). Same check,
the step being the measure's lap-to-lap spread:

| Measure | Cost down when closed | When widened | Verdict |
|---|---|---|---|
| Less grip used on the way out (mean g, slowest point to the end) | 74% of 315 | 32% of 183 | pass |
| Less rear tyre slide on the way out | 71% of 359 | 37% of 251 | pass |
| Less grip used on the way in (brake point to slowest point) | 68% of 325 | 46% of 185 | weak |
| Less front tyre slide on the way in | 63% of 343 | 38% of 204 | weak |
| Softer peak braking (g) | 52% of 231 | 54% of 122 | no link |
| Less, or more, braking while turning | 57% / 47% | 58% / 57% | no link |
| Less slip angle on the way in | 55% of 357 | 51% of 270 | no link |

- **The theme is under-driving, mostly on the way out.** The driver slides the rear tyres less than the target at 81%
  of turns and uses less grip on the way out at 61%. Candidate cause under "exit speed lower": "the target uses 0.08 g
  more on the way out". Same car caveat as the line.
- **Mistakes (one lap against the driver's own usual).** Road position does stand out here: a missed apex (1 m) shows
  in 27% of mistake passes against 8% of normal ones, an arc 15% tighter in 26% against 9%, a wide exit in 20% against
  10%. Slides are rare (2%) but sharp: a slip angle 3° over the usual is a mistake nearly half the time (base 12%).
  Candidate mistake causes: "missed the apex by 1.2 m", "ran wide at the exit", "a slide". They would name part of
  today's "slow in the middle" and "nothing measured stands out".
- **Time already in the driver's own laps.** Per session, the usual time through each turn minus the driver's own
  better passes (lower quartile) adds up to 0.52 s a lap at the median, 29% of what those turns lose to the target.
  It needs no target and no other car. Candidate for the goal line: "0.97 s to find · 0.5 s of it is in your own laps".
- **Not tested yet:** the gearing check in the same car (rpm is stored), a corner's cost growing with tyre age inside
  a stint, and wet laps (the engine is dry only).

None of this is in the steps below until the driver picks.

### Advice must be actionable (driver, 2026-11-20)

"This info can help identify but the advice given must be actionable by the driver." So the engine has two layers:

- **Identify, never the advice line:** the cost, the speeds, the arc, the grip used, the slide. They pick the corner,
  rank it and name the kind of loss.
- **Advice, what the row says:** only what the driver does or sees. A brake point named by its board (the track data
  has brake boards on all 21 layouts driven), a shorter or harder brake, a speed to hit at the apex, a later turn-in, a
  place on the road (the inside kerb, the exit edge), a throttle point, a gear.

Each action was checked inside each kind of loss. "When widened" is the base rate here: a turn picked for being slow
tends to get quicker anyway, about half the time.

| Kind of loss | Action gap | Cost down when closed | When widened |
|---|---|---|---|
| Same arc, less grip (1,122 turns) | Entry speed lower | 83% of 310 | 21% of 171 |
| | Brake point earlier | 75% of 80 | 50% of 40 |
| | Braking longer | 73% of 62 | 55% of 29 |
| Tighter arc (1,378 turns) | Entry speed lower | 74% of 291 | 38% of 164 |
| | Turn-in later | 73% of 110 | 57% of 23 |
| | Exit less wide | 64% of 245 | 46% of 68 |
| | Brake point earlier | 63% of 197 | 42% of 106 |
| | Apex further from the inside | 62% of 269 | 41% of 87 |
| Slower at the exit only (604 turns) | Entry speed lower | 62% of 61 | 25% of 67 |
| | Throttle point later | 45% of 138 | 27% of 49 |

- **No single hand or foot action is a dependable lever by itself.** The best ones beat the base rate by about 20
  points; a speed beats it by 40 to 60. Peak brake pedal, coasting, part throttle, turn-in width and an earlier turn-in
  add nothing inside any kind.
- **So an advice line is a speed to hit plus one action to try**, the action being the largest gap among those of the
  corner's kind: brake later or shorter for "same arc, less grip"; turn in later, use the exit or reach the inside for
  "tighter arc". "Brake at the 100 board, 11 m later · aim for 103 km/h at the apex (you: 96)".
- **The app then says whether the try worked at that corner:** next session the Progress row shows whether the action
  moved and whether the cost followed ("you braked 8 m later, T5 is 0.06 s quicker" or "you braked later and T5 is no
  quicker: try the exit"). The corner's own result replaces a promise the data cannot make.
- **"Slower at the exit only" has no action that holds.** Its row shows the exit speed to hit and says no action is
  measured; it is never picked as a focus automatically.
- **Tested and not taken: the action from the driver's own quicker passes** (the quickest third at the turn, against
  the usual). They exist on 32% of session-turns (6 passes needed), are only 0.07 s quicker, and point the same way as
  the target 62% of the time. Moving towards them paid no better than moving towards the target: the action a row would
  show beat the base rate by 11 points against 14. The target stays the source of the action. One thing to keep in
  mind: for road position (turn-in width, apex) the own passes did better (28 points against 11 to 19, on about 40
  cases each).

**Proposed shape** (to build, then confirm with the check and the blind round):

- **Headlines, the only lines a focus can carry:** minimum speed lower (today's over-slowing), exit speed lower (new:
  it replaces "in fast, out slow" and headlines the turns now named part throttle or apex early), brake early, and
  brakes where the target lifts.
- **Causes, a second line under a headline, never a focus alone:** entry speed lower (it names the turn before, where
  the speed was lost), brake point earlier, braking longer or softer, coasting, throttle point later, part throttle
  longer, and the gear in the same car. A cause shows when its gap is at least one step.
- **The line names the kind of loss under "minimum speed lower", it is not the advice:** "tighter arc" when the arc
  holds at least two thirds of the gap, "same arc, less grip" when the sideways g does, both otherwise. The kind picks
  the action the row gives (see "Advice must be actionable"); the arc and the g show in the row's detail and on the
  map. Steering is never shown as advice.
- **Removed:** the "give up speed in the middle" advice, apex early and turn-in advice, and drag brake and coast as
  headlines.
- **Every focus row shows the minimum speed,** the driver's and the target's, whatever its headline:
  "Carry 7 km/h more through T5 · apex 96, target 103 · you brake 11 m earlier and 0.4 s longer".
- `habitRules.ts` says exit speed is diluted at the segment's end; as a headline it passed here, so that note is
  rechecked in the blind round.

**Blind round.** After the rework: a fresh held-out set of 8 sessions no round has used, the class target, hand
analyses blind to the engine. The reworked engine must score no worse than today's engine on the same set (top 3 by
turn and reason). Kept small on purpose. Run on 2026-11-21: see "Blind round" under the driver's answers.

## Focus rules

The focus is derived on each read by walking every analysed session, oldest first, up to the session shown. Only pins
are stored. The same history always gives the same focus, and there is no focus state to migrate.

**Score.** A corner's score in a session is its whole cost × its habit's repeatability × its confidence; 0 without a
named habit to pick, and 0 when the corner costs nothing. The focus reads the mean of it over the corner's last 5
sessions. (Until 2026-11-21 it was the habit's own priority at its turn, so a turn's loss given back in the same
corner still scored.)

1. **Start.** The first session's focus is its 2 highest scores.
2. **Entry.** A corner can enter with a named habit in at least 2 of its last 5 sessions (1 while the history has one
   session), so a one-off never picks the focus.
3. **Carry over.** The next session starts with the previous session's focus.
4. **Clear challenger.** Another corner takes a slot when its score is at least 20% above that focus corner's score in
   2 sessions running. It takes the slot of the lower-scoring focus corner it beats. A free slot is filled first: a
   challenger only ever takes a slot that is held.
5. **Nothing left.** A focus corner whose score is 0 (no named habit, or no cost, in its last 5 sessions) gives its
   slot back. A corner the history holds also needs a measured cost in the session shown to be shown as a focus.
6. **Pins win.** A pinned corner holds a slot until it is unpinned, and the rules fill only the other. Unpinning hands
   the slot back to the rules at the next read. Pins are today's choice: they apply to whichever session is shown.
7. **Leaving is not fixing.** A corner that left focus within the last 5 sessions keeps a row under "No longer in
   your top 2".

A qualifying session with 2 counted laps counts like any other; the engine's confidence already scales with the laps.

## Progress and slipping

Progress covers the focus corners and the corners that left focus within the last 5 sessions: the cost and the
habit's gap, then → now, the oldest of the last 5 sessions that measured the corner against this one. A gap that closed
while the cost did not move is visible; that is the check that the advice worked. On the card it is not a list of its
own (it was, until 2026-11-21): a focus row carries its cost then → now with a line of the last 5 sessions' costs, and
its gap under Details; the corners that left have their own short list.

**Slipping:** the corner's cost is at least 0.10 s above the median of the window's earlier sessions, in the latest 2
sessions running. One shared constant in `shared/domain/cornerAnalysis/`; a cost moves by 0.06 s between two ordinary
sessions, so a 0.05 s level tags normal scatter.

## Goal

- **Reference:** the benchmark target of the session's layout and class: the 100% lap time of the Reference
  Benchmarks, the one the pace badges rate against (`benchmarkTargetSec`, `server/benchmarks/referenceLaptimes.ts`).
  It does not depend on who is in the database. A layout and class without a benchmark has no goal.
- **Level:** the session's true pace ÷ the benchmark target, rated with the pace badges' levels
  (`PACE_CATEGORY_BANDS`: Alien up to 100.5%, Competitive 101.5%, Good 103.5%, Midpack 105.5%, Tail-ender 107%).
- **Goal:** the level above. **To find:** the true pace minus the lap time where that level starts, in seconds. The
  top level has nothing above. Computed on read (`paceGoal.ts`), so an updated benchmark applies to past sessions too,
  with no note. There is no setting.
- **Card:** one line above the focus, in the debrief only: the pace badge of the level now, an arrow, the badge of
  the level above and "0.76 s to find"; at the top level the badge and "top level". (First written as a sentence,
  "0.76 s to find for Competitive pace · Good now".) The percent, the benchmark's lap time and where the next level
  starts are in the line's tooltip. No line without a true pace. The habit costs are measured on usual passes against the target driver
  and the goal on the 3 best laps against the benchmark, so the card never shows the habits as a share of what is
  left.
- **Not drawn on the track page's chart:** the first build drew a fixed 101% line there. A goal that moves with each
  session has no single line, and the chart's dots already carry the pace level's colour.

## Measured on the driver's history (2026-11-20, read-only)

539 analysed sessions, 76 layout and car groups; 20 groups have 10 or more sessions, 28 have fewer than 3.

- **Fixed target:** a session's top habits showed again in the next compared session 69% of the time (qualifying →
  race of one event) and 72% (race → next race). Against each session's own reference, as today: 38% and 42%.
- **Session type:** a habit costs 0.02 s more in the race than in the qualifying of the same event. Qualifying →
  qualifying is the least steady pair (59%): 2 counted laps against 9 in a race.
- **Stability:** the top 2 of each session alone changed in 86% of sessions. The mean of the last 5: 36%. With carry
  over and the 20% for 2 sessions rule: 15%, a replaced focus lasting 3 sessions (median). A minimum stay of 3 sessions
  changed nothing and is left out. 30% for 2 sessions, or 20% for 3: 12%.
- **Slipping:** 0.05 s above the median tagged 26% of focus rows; 0.10 s: 19%; 0.10 s in 2 sessions running: 4%.
- **Read cost:** analysing a 20-session history against one target took 11 ms once the passes are read, so the walk
  covers the whole history.
- **New fastest:** in 13% of sessions after a layout's third; the typical move is 0.42% of the lap.
- **Where the driver stands** (against the database's fastest, the goal's reference at the time): latest true pace
  within 101% on 3 of 33 layouts with 5 or more sessions, 101 to 102% on 12, above on 18. Only 79 of 225 dry qualifying sessions have 3 clean laps.

- **The target:** a median of 6 counted laps, under 5 on 29% of layouts; 13 of 34 come from a qualifying session;
  none is older than 180 days against the driver's latest session there. It drives another car than the driver in 70%
  of sessions; the same-car check marked almost none of the cost as the car, because the driver loses to the quickest
  in their own car at the same turns.
- **Where the time is:** the turn costs add up to the usual lap gap (101%, median), so the turns hold all of it. 91% is
  at a turn with a named habit, 6% at one with no clear cause. The 2 costliest turns hold 30% of it: a focus moves on.
- **The driver's habits everywhere:** over-slowing is 47% of the named cost and shows on 60 of 63 layout-cars, coast
  19%, part throttle 16%.
- **Today's reference against the target:** the top 3 habits of a session keep the same rule at the same turn in 56%
  of cases, so the old blind validation does not carry over.
- **The score follows real progress:** on layouts with 8 or more sessions, the time lost in turns went down on 13 of
  17 (median 0.96 s/lap) and the percent of the target's true pace closed by 0.39 points.

The first run (stability, slipping, session types) used the quickest driver through every turn as its target, left the
same-car check off, and summed a turn's half losses as its cost. The engine check used the plan's target with the
same-car check on. Both scripts are kept outside Git in `docs/local/habit-focus-check/`.

## Steps

Built, not committed (2026-11-21): steps 1 to 8 and the docs of step 11; what stands and what is uncertain is under
"Implementation status" below. Steps 9 and 10 wait for the driver's go. On the 10 latest sessions the fixed target gave
one driver for all 8 Sebring School sessions where the old reference gave 5.

1. **Debrief layout on today's data.** Rename "Keep an eye on" to "Focus next session" and show 2 rows, each with the
   habit's `detail` line (the driver's value against the reference's) in the row itself. Rename "Improving" to
   "Progress · last 5 sessions" and keep what it measures today (the driver's own cue and corner time). Drop "fixed"
   and the per-row "since" (`WatchNextSessionCard.tsx`, `watchNextSession.ts`). Gap and cost against the target arrive
   with step 4: no comparable cost exists before the target does.
2. **Target and corner series.** Pick the target in `dbCornerAnalysisStore.ts` and read its passes and each car's best
   (the same-car check keeps working); today's wider shortlist goes. `analyzeCorners` takes the target: the
   same-session preference, `sameSession` and `OTHER_SESSION_CONFIDENCE` go, and every caller moves over (debrief,
   corner trends, `tools/analysis/cornerAnalysis.ts`). The service returns each analysed session's corners with cost,
   habit (and its turn), priority and gap. Update the comment in `habitHistory.ts` that says losses are never compared across
   sessions. Run `npm run benchmark:endpoints` before and after. The rules are unchanged but the driver they compare
   with is not, and the blind validation used the old reference: list the top 3 under both for the 10 latest sessions
   and have the driver read the differences.
3. **Engine rework.** Move the outcome check into `tools/analysis/` and build the proposed shape in `habitRules.ts`
   and `analyzeCorners.ts` (headlines, causes, the minimum speed on every line), with tests. The pass builder
   (`server/corners/cornerPasses.ts`) records the arc radius at the slowest point and the road position at the
   apex; the sideways g follows from the radius and the minimum speed. That bumps `CORNER_PASS_VERSION` and
   rebuilds the passes from the stored laps. Rerun the check: every headline passes. Then the blind round. The debrief
   and corner trends move to the new lines in the same change.
4. **Focus walk.** A pure function in `shared/domain/cornerAnalysis/habitFocus.ts` with a test per rule, plus the
   Progress rows and the slipping tag. The debrief reads the focus from it instead of ranking one session; `recurrence`
   and `improving` leave the response once nothing reads them.
5. **Goal.** The pace level and "to find" in the corner analysis response, and the card line. (First built as a
   percent setting with a Settings card and a chart line; all three were removed on 2026-11-21.)
6. **Pins.** A table `habit_focus_pins` keyed on layout, class, car model and a turn of the corner (its first), with
   `set_at`; user state, never cleared (the `rival_targets` precedent, store beside `dbRivalStore.ts`). A pin follows
   the sequence that holds its turn, so it survives a regenerated class map. `POST` pin and unpin routes like
   `/rivals/pin`; a third pin is refused with "Unpin one first". A focus row can unpin. A pinned corner with no named
   habit in its last 5 sessions says so and still shows its cost.
7. **Corner trends.** The "focus" marker comes from the same walk for the page's car, replacing `focusCornerIds`.
   Every opened row shows its corner's habit with the gap and cost series, and a "Make focus" or "Unpin" control.
   `CornerHabitTrend.fixed` and its line go (`CornerHabitLine.tsx`, `CornerTrendsSection.tsx`). The "vs class" column
   stays the best anyone did through the corner; the cost is against the target, and each is labelled.
8. **Check on the driver's history.** Rerun the read-only checks on the built code: the focus changes in about 15% of
   sessions, slipping tags about 4% of rows, the read cost holds, and every headline still passes the outcome check.
   Tune the 20% and the 0.10 s only if they are far off.
9. **The line on the map (a mock first, then the driver's go).** For a focus corner, the driver's usual lap and the
   target's drawn together between the white lines, each coloured by speed, with the slowest point of each marked with
   its km/h and each arc drawn through it with its radius. Small markers for turn-in, apex and exit, with the distance
   between the two cars there. A wider arc, or the same arc at a higher speed, reads at a glance. It opens from the
   focus row; the 2D map already draws two laps (Compare).
10. **Live dashboard (later, waits for the driver's go).** The live corner speed panel's REF at each turn of a focus
   corner is the target's minimum speed there, so the driver sees the km/h to aim for at the apex.
11. **Docs.** Update the CODE_MAP, the work queue, and DESIGN.md where it describes the debrief. Delete this plan and
   the local check once delivered; the rules and their numbers then live in the module comments.

## Implementation status (2026-11-21, steps 1 to 8 built, not committed)

Built, with tests: the reworked rules, kinds of loss, actions and causes (`habitRules.ts`, `analyzeCorners.ts`); the arc
and the road position in the pass builder and store, and the main stop as a corner's braking
(`CORNER_PASS_VERSION` 21); the focus walk, progress and slipping
(`habitFocus.ts`); the goal as the next pace level (`paceGoal.ts`); pins (table, store, routes); the debrief card;
the corner trends rows; the outcome check as a tool (`tools/analysis/habitOutcomeCheck.ts`). `npm run lint`,
`npm run build` and `npm test` pass with no warning. CODE_MAP, DESIGN.md and the plans index are updated.

**The app's database is at pass version 21** since 2026-11-21 (driver's go, twice that day: version 20, then 21 for
the brake point): rebuilt with `npx tsx --env-file-if-exists=.env.local tools/analysis/buildCornerPasses.ts`, the app
stopped (540 replays, 934,401 passes, 6 minutes). The exit's road position column was dropped from it with a one-off
script. The step 8 numbers below were measured on a copy at version 20, before the driver's answers; the numbers
after them are under "The driver's answers", and those at version 21 under "The brake point".

### Step 8 on the driver's history (rebuilt copy, 366 analysed sessions, 71 layouts and cars)

- **Focus stability:** over the 23 layouts and cars with 6 or more sessions (222 steps), a focus corner changed in 15%
  of sessions and both in 1%. 97% of sessions have 2 focus corners, 3% none. The 20% margin stays.
- **Slipping:** 3% of 708 focus rows. The 0.10 s level stays.
- **Outcome check** (the turn got quicker when the gap closed / when it widened): over-slowing 82% / 22% (853 and 459
  cases), exit speed 83% / 20% (383, 251), early braking 67% / 29% (113, 76): all pass. "Brakes where the target
  lifts" has 3 closed and 5 widened cases: too few to pass or fail.
- **Actions to try**, the same check, to see and not to pass: turn in earlier 78% / 32% (58, 19), brake later 70% / 42%
  (248, 136), come off the brake sooner 67% / 41% (78, 34), closer to the inside at the apex 67% / 43% (206, 49), more
  road at the exit 62% / 53% (186, 47).
- **What a focus row holds:** over-slowing 64%, exit speed 23%, early braking 12%, lift 1%. The arc is measured on 79%.
  Kind of loss: tighter arc 32%, arc and grip 16%, less grip 15%, exit only 8%, none 29%. 30% of focus rows have no
  action to try.
- **Tries:** 29% of the 735 progress rows read a try the driver made; the corner got quicker on 57% of them. The cost
  then to now went down on 62% of progress rows (median 0.05 s).
- **Goal** (against the benchmark target, after the correction below): every analysed session has a benchmark target
  and 87% of those a true pace. Median 103.2% of the benchmark target, best 101.3%; no session is at or under 101%
  yet. The latest session of each layout and car: median 103.3%.
- **Read cost:** a debrief read (analysis, focus walk over the history, goal) takes 24 ms median, 53 ms at the 95th
  percentile, 114 ms at worst (Daytona GT3, the 13th session of its car). Corner trends habits: 18 ms median, 49 ms at
  worst. `npm run benchmark:endpoints` on the copy against the run before the change (median): corner analysis
  14.9 → 15.9 ms, corner trends 43.7 → 41.6 ms and 45.6 → 46.3 ms. The chart's goal costs no request of its own beyond
  the settings read.

Goal corrected on 2026-11-21 (driver: the benchmark target, not a percent of the best lap in the database). The first
build measured the goal against the target driver's true pace (median 102.1%, 6% of sessions at or under 101%), named
that driver on the card, said when a quicker one arrived and served the chart's line from `GET /api/habit-focus/goal`.
All of that is gone: the goal reads the benchmark target, the note and the route are removed with the store query
behind them, and the track page works the line out from the benchmarks it already loads. The habits still compare
with the target driver. Checked in a browser on the copy: Sebring School GT3 race, "102.2% of the benchmark target ·
goal 101% · 0.77 s to find" against a benchmark of 1:02.860; the chart's line and the Pace Goal card.

Corrected against the text above: the turn-in action is "turn in earlier" (the measured gap is the driver turning in
later than the target).

Checked in a browser on the rebuilt copy (the benchmark's server on the copy, the UI pointed at it): the debrief's goal
line, progress rows and focus rows on Sebring School GT3; the track page's goal line and corner trends rows, with a pin
set and removed; the Pace Goal card saving a new percent. Found and fixed there: a habit's headline said the median gap
of the laps where the rule held while its detail, the series and the progress row said the usual against the usual
("Carry 4 km/h more" over "Apex 78 km/h, target 79"); the two numbers differed on 20% of focus rows. The headline now
says the usual gap whenever the rule holds on it (2% of focus rows still differ: short sessions where half the laps
hold and the usual does not).

### Driver's review of the built pages (2026-11-21)

- **Unused measures dropped:** every pass measure was checked against its readers. Only the road position at turn-in
  had none (no rule, action, cause, mistake or page), so it left the builder, the tables and the types. The pedal
  timings stay: they are the "Also measured" lines and the mistake causes.
- **The target is not named:** the detail line, the cost's tooltip and the corner trends link say "target" where they
  named the driver. Who it is does not change what to do.
- **Road position in words:** "Get a little closer / closer / much closer to the inside at the apex", "Use a little
  more / more / much more road at the exit" (under 1 m, 1 to 2 m, 2 m or more: half a car's width and a car's width).
  The metres are in the line's tooltip. The same words say what a try did.
- **A try's result is not progress by itself:** the row said "You got 0.4 m closer … and the corner is no quicker"
  under Progress. It now reads "Last try: you got a little closer to the inside at the apex at T16 · no gain in the
  corner yet", or "· the corner is 0.06 s quicker" when the cost followed.
- **Entry speed:** "N km/h slower on the way in" read as something from the lap before. It is the speed at the
  corner's start, lost at the corner or straight before, and now reads "arriving N km/h slower (lost before this
  corner)". It is left out when the driver brakes earlier than the target by 3 m or more: the brake point can start
  before the corner's start, and then it is the brake point that lowers that speed.

### The driver's answers to the open points (2026-11-21)

Asked one by one with a recommendation; these replace the list of uncertain points.

Changed:

- **"More road at the exit" is gone** (no link on the check, 62% / 53%). With no reader left, the exit's road position
  left the pass builder, the tables and the types, like the turn-in's.
- **A habit needs the driver's usual lap.** A rule that holds on half the laps of a short session while the usual is
  level with the target names nothing; the loss stays in "no clear cause".
- **After a try that gave no gain, the next thing to try.** Driver: "if the corner is still the most impact of time,
  we keep it as focus", and its Try line then offers the habit's next action (the next largest gap of the kind), the
  first again once every one was tried. A try that paid keeps its action. The walk is in `cornerAdvice`
  (`habitFocus.ts`), from the first session, so the same history always advises the same; the corner trends show the
  same action. Each habit carries its other actions (`otherActions`).
- **A try "worked" from 0.05 s** (`FOLLOWED_SEC`, was 0.02): about the 0.06 s a cost moves between two ordinary
  sessions.
- **The goal is the next pace level** (see "Goal"): the percent setting, its Settings card, its routes and the chart's
  goal line are removed.

Kept as built:

- A focus row with no action to try shows the speed to hit only.
- A brake point is said in metres ("Brake 11 m later"), not by its board.
- "Lift, don't brake" stays, though too rare to check (26 pairs).
- A new habit needs 2 sessions before it is a focus, so a slot can stay empty for a session (3% of sessions).
- A focus row's cost is the whole corner's, the number the progress row and the corner trends follow.
- "Last try" compares the last two sessions; "then → now" spans up to 5.
- Pinning is on the track page only; the debrief can unpin.
- A corner the rules picked that a pin pushed out gets no progress row.
- The goal line is in the debrief only, and uses the true pace, so it reads slower than the best lap's badge.
- A benchmark update changes past goal lines with no note.
- The smallest gaps worth a line (0.4 m of road, 3 m of brake point, 1.5 km/h, 0.15 s) and the road words (under 1 m
  "a little", from 2 m "much").
- No next part for now (the line on the map, the live apex speed, own potential): drive with it first.

Measured after these changes on the app's database (366 analysed sessions, 71 layouts and cars, `shippedCheck.mts`):

- **Focus:** a focus corner changed in 17% of sessions; 97% of sessions have 2 focus corners, 3% none; slipping 3% of
  708 focus rows.
- **What a focus row holds:** over-slowing 63%, exit speed 23%, early braking 13%, lift 1%. Thing to try: none 39%
  (it was 30% with the exit road), brake later 28%, closer to the inside 19%, off the brake sooner 7%, turn in earlier
  6%, lift 1%.
- **Tries:** 24% of the 745 progress rows read a try the driver made; the corner got at least 0.05 s quicker on 50% of
  them. The cost then to now went down on 62% of rows (median 0.05 s).
- **Goal:** a benchmark target and a true pace on 87% of sessions. Levels: Good 58%, Midpack 31%, Offline 6%,
  Tail-ender 4%, Competitive 1%. To find for the next level: 1.05 s at the median.
- **Read cost:** a debrief read 15 ms median, 43 ms at worst; corner trends habits 13 ms median, 43 ms at worst.

### Blind round (2026-11-21)

8 sessions the pages were never reviewed on (Spa GT3, GTE and LMP2, Le Mans Hypercar, LMP2 and LMP3, Silverstone
International GT3, Fuji GTE), each analysed by hand from its measured passes alone (every counted lap of the driver
and the target through every turn), blind to the engine; then compared by turn and reason
(`docs/local/habit-focus-check/blindDump.mts` writes both sides).

- **9 of the hand's 24 top-3 habits are in the engine's top 3 by turn and reason, 14 by turn.** In the engine's top 5:
  13 and 19. The round before the rework scored 10 of 24 by turn and reason, on other sessions.
- **The engine's top line is at a turn of the hand's top 3 in 7 sessions of 8.** 23 of the engine's 24 top-3 lines
  are at a turn the hand named, in its top 3 or its runners-up; the hand set the last one aside as traffic.
- **One loss named two ways** on 5 of the 14 shared turns: the hand's exit speed or early brake against the engine's
  early brake or slower slowest point, with the same thing to try in most ("brake later").
- **A loss carried on** into the next turns: the hand counts it where it starts, the engine ranks each turn, so it
  can name the turn after (3 sessions). The focus works on the corner, which holds those turns together.
- **2 of the hand's top-3 habits sit in the engine's "no clear cause"** (Le Mans LMP3, second Mulsanne chicane,
  0.35 s; Fuji GTE, T13, 0.20 s), both early braking the engine does not name. At the chicane the pass holds only
  the last touch of the brake (see the brake point below). At Fuji the driver brakes 43 m before the target, over the
  40 m above which two brake points are not read as the same braking (`POINT_GAP_MAX_M`).

Limits: the old engine no longer runs, so "no worse on the same set" was not tested; the two rounds used different
sessions. The hand read the measured passes, so the round checks the naming and the ranking, not the measuring. The
two exit speed headlines the hand named were both named early braking by the engine: too few to recheck the note on
exit speed. No habit rule was changed from the round; the brake point's measuring was (below).

### The brake point (pass version 21, 2026-11-21)

7 of the 8 hand analyses saw brake rows that could not be right: no brake point beside 1.4 s at full brake, or 0.1 s
at 13% while the car shed 90 km/h. The stored pedal samples are complete (`brakeLapCheck.mts`: the brake is on
through every hard stop of every lap). The fault was one rule of the pass builder: a corner's braking was the **last**
brake application still on within 2 s of the slowest point.

- **A long roll after the stop gave no brake point.** Stowe: the target brakes from 246 km/h, then rolls 2 s; no
  brake point on 7 laps of 8.
- **A light touch after the stop hid it.** The touch was the last application, so the pass held its place, its 0.1 s
  and its 13% (2 of the driver's 5 laps at Stowe; the two Mulsanne chicanes the same way).
- **"Lift, don't brake" fired on it.** A target whose stop was hidden looked like a lift. Forest Esses, Le Mans LMP2:
  the target read as "a touch at 287 m, 20%"; it brakes from 208 m at 98% for over 1 s. The hand analysis, reading
  the same rows, made the same call.

**Now** (driver: "Fix it now"): a corner's braking is the application that sheds the most speed among those that
start after the previous corner's slowest point and by this one's, however long the car rolls on; one after which the
car gains 10 km/h or more again was for an earlier corner (`brakingShed`, `cornerPasses.ts`).

Measured on the app's database, version 20 → 21:

- Passes that shed 60 km/h or more with under 0.3 s of brake: 24,477 → 1,503 of 347,206 (7% → 0.4%). Passes with
  1 s of brake or more and no brake point: 13% → 5% (`brakeCueCheck.mts`).
- **Outcome check:** "brake later" as a thing to try now passes (72% quicker when the gap closed, 35% when it
  widened, 861 pairs; it was weak at 69% / 42%, 674). Early braking as a headline 70% / 26% over 413 pairs (68% /
  28%, 345). "Come off the brake sooner" stays weak (70% / 48%). The speeds are unchanged. "Lift, don't brake" is
  down to 4 pairs from 25.
- **Focus rows:** early braking 19% of headlines (13%), over-slowing 61%, exit speed 20%, lift 0%. Thing to try:
  brake later 39% (28%), none 33% (39%), closer to the inside 15%, off the brake sooner 7%, turn in earlier 5%.
  A focus corner changed in 14% of sessions (17%); slipping 3%.
- **Tries:** read on 26% of 722 progress rows, paid on 55% (50%); the cost then to now went down on 64% (62%).
- **The blind round's sessions again:** the same 9 and 14 of 24 in the engine's top 3; 14 and 20 in its top 5 (13
  and 19). Fuji T13's early braking is now named. The hand analyses read the version 20 rows, so its two "lift,
  don't brake" calls rest on the hidden stops.

**A brake point is read up to 60 m before the target** (`BRAKE_GAP_MAX_M`, was the 40 m of every point; driver:
"check with the 40m limit"). The outcome check by size of the brake gap, every turn of every session whether or not a
habit was named (`brakeGapBands.mts`):

| Brake gap | Gap closed: turn quicker | Gap wider: turn quicker |
|---|---|---|
| 3 to 20 m | 64% of 357 | 34% of 331 |
| 20 to 40 m | 77% of 148 | 31% of 61 |
| 40 to 60 m | 76% of 42 | 58% of 12 |
| 60 to 80 m | 50% of 12 | 25% of 8 |
| over 80 m | 14 of 18 | 1 case |

40 to 60 m closes as well as 20 to 40 m; beyond 60 m the cases are too few to say. The turn-in point keeps 40 m: with
60 m for every point its try got quicker in 55% of the widened cases (42% at 40 m). With 60 m for the brake point
alone the check reads: early braking 69% / 25% over 432 pairs, "brake later" 73% / 36% over 909, "come off the brake
sooner" 70% / 40% (passes), the rest unchanged. Focus rows: brake later 40% of things to try, a try paid on 57%.

**No "no action is measured" under a brake point** (2026-11-21): a turn slower at the exit only said so under every
habit there, the early braking's too ("Brake 14 m later" over "no action is measured for a slower exit alone": 247 of
518 early-braking habits, 60 of 130 focus rows). The brake point is its own action, and it was always kept; only the
line under it was wrong (`habitDetail`).

Still open after it:

- **"Lift, don't brake"** almost never fires now (4 pairs): too rare to check, kept on the driver's answer.
- **A focus row whose corner costs nothing** (`zeroCostFocus.mts`, `zeroCostFocusNext.mts`). The focus follows a
  mean over the corner's last 5 sessions, and a corner leaves only when another beats it clearly 2 sessions running,
  so a corner stays the session its cost drops. Mostly right: of such rows with a next session, the cost was back to
  0.10 s or more in 8 of 12. The bad case was Spa GT3's Bus Stop: 0.35 s, then 0.00, −0.30 and −0.19 s (quicker than
  the target) as a focus for 3 sessions, because the score read the T18 habit (0.08 s lost into T18, given back in
  T19) while the row showed the corner's cost. With the score on the corner's cost (see "Advice and presentation
  pass") it leaves after the one session at 0.00 s; 15 of 705 focus rows are still under 0.05 s.

### Advice and presentation pass (2026-11-21, after the brake point)

Made in another session the same day, then checked here on the app's database and in the browser.

Engine:

- **Focus score on the corner's cost** (see "Focus rules"), so a corner of several turns is not rated on one turn.
- **"Brake later" is also offered under a tighter arc**, competing with the line actions by its gap in steps.
  "Come off the brake sooner" stays off it (it dropped to no link there).
- **A change of action brings back the cause the first action said:** when the Try line moves from "brake later" to
  another action, "braking 15 m earlier" returns under "Also measured" (`withAction`).
- A corner the history holds needs a measured cost in the session shown to be shown as a focus (1% of sessions now
  show one focus corner).

Debrief card (`WatchNextSessionCard.tsx`, `watchNextSession.ts`):

- **One row per focus corner** in place of a Progress list above a Focus list: the corner's name, then the advice as
  the link to telemetry; on the right the cost then → now with a line of the last 5 sessions' costs, green when it
  came down by 0.05 s or more, red when it went up by as much. Without earlier sessions: the cost alone.
- **Second line:** "Try: …", the speed as "Apex 96 → 100 km/h" (the driver's, then the target's), Slipping, "Your
  pick" with Unpin, and a Details toggle.
- **Details** hold what identifies the loss and is not the advice: the kind of loss (arc, grip), the habit's gap then
  → now, "Also measured", the habit's name with its share of laps, and "Compare vs" the earlier session.
- **A single-turn corner's advice drops the turn** ("Bruxelles (T8) · Brake 10 m later", not "… into T8").
- **Goal line** as pace badges (see "Goal"). **"No longer in your top 2"** lists the corners that left, each with its
  cost line. A first session in the car says the next one will show the trend.

Track page (`CornerFocusSummary.tsx`): a "Focus corners" strip above the corner trends table with the 1 or 2 focus
corners: cost, advice, the speed, the last costs, "Compare in telemetry" and the pin.

Measured after it (366 analysed sessions, `habitOutcomeCheck.ts`, `shippedCheck.mts`):

- **Outcome check:** "brake later" 73% / 35% over 1,323 pairs (909 before the tighter arc), "turn in earlier" now
  passes (80% / 35%, 78 pairs), "come off the brake sooner" 67% / 40% (passes), "closer to the inside" 63% / 41%
  (weak). Headlines: early braking 70% / 25%, exit speed 84% / 20%, over-slowing 82% / 23%.
- **Focus:** a focus corner changed in 10% of sessions (14%); slipping 3% of 705 focus rows. Headlines: over-slowing
  59%, exit speed 26%, early braking 15%. Thing to try: brake later 46%, none 34%, closer to the inside 10%, off the
  brake sooner 6%, turn in earlier 4%.
- **Tries:** read on 29% of 662 progress rows, paid on 63% (57%); the cost then to now went down on 64% (median
  0.08 s).
- **Read cost:** a debrief read 16 ms median, 47 ms at worst.
- **Pages:** Sebring School GT3 (17 November race) and Spa GT3 (17 August, last race) debriefs, and the Spa GT3 track
  page: rows, Details, sparklines, the left list and the strip read as above, no console error.

**In the lap view (2026-11-21, asked by the driver):** the corner detail of the Corners tab ends with the engine's
conclusion for that corner (`CornerConclusionBlock.tsx`): "Your session vs target", the corner's cost, the habit, the
Try line and the speed, the kind of loss, "Also measured", the habit's name with its share of laps, and "This lap"
with what the shown lap lost there against the driver's usual and why. The cards above it compare two laps; the block
compares the session's usual with the target, so the two can differ. Only on the driver's own laps.

**The two laps of a comparison (2026-11-21, asked by the driver: "only what differs between these 2 lap"):** with a
baseline lap the block opens with "This lap vs baseline" (`LapDifferenceSection.tsx`). `compareLapTurn`
(`analyzeCorners.ts`) runs the habits' own measures on one pass of each lap, both ways, through each turn of the
corner: where either lap loses 0.05 s or more in a half of a turn, the first headline measure that differs the losing
way (braked where the other lifts, slower at the slowest point, braked earlier, slower at the turn's end), the kind
of loss and the other measures. The slower lap is the subject of each line ("This lap braked 29 m earlier", "The
baseline was 4 km/h slower at the slowest point"); the time is signed for the shown lap.

- **A description, never advice:** no action, no "Try:", no share of laps. The outcome check covers habits over
  sessions, not one lap against another.
- **The limits are the habits' (3 m, 1.5 km/h, 0.15 s), with a 0.05 s floor on the time lost.** One lap differs from
  the next by more than that by chance (`lapNoise.mts`, 1,861 session-turns of the driver: two single laps differ by
  about 7 m on the brake point, 4 km/h at the slowest point, 3 km/h at the turn's end, 0.11 s through the turn, half
  the time). That is why nothing here is called a habit; it is still what these two laps did.
- **Traffic and ABS only on the lap that loses time there:** "had a car close ahead" and "had ABS working 0.4 s
  longer". Longer ABS is a lockup against the driver's own lap; against another driver it may be how they brake, so
  it is said as measured.
- **Same class only**, gears in the same car only; both laps need stored turn passes. Otherwise the part says why.
- The exit speed is read at the turn's end, further down the road than the phase cards' exit, so the two numbers
  differ: the line says "at the turn's end".

Seen on the pages, not changed:

- **"Apex 91 → 89 km/h" under "Brake 10 m later"** (Bruxelles, Spa): the driver is already quicker at the apex, and
  the arrow reads as "slow down to 89". The same arrow means then → now in the cost beside it. The driver asked
  whether too much apex speed costs the exit there. At Bruxelles the exit is 5 km/h slower with 1.3 s more part
  throttle, and that shape is common: 73 of 683 focus rows have the apex quicker than the target (71 under early
  braking), the exit slower on 43 of them. But over the history (`fasterApexOutcome.mts`, 191 early-braking pairs
  with the apex quicker and the exit slower) the turn got quicker in 38% of the 88 cases where the apex speed came
  down, in 79% of the 61 where the brake point moved later and in 72% of the 60 where the exit speed gap closed. So
  "brake later" stands and the apex is not a speed to come down to; the exit speed is the one to show there. (A
  slower session lowers the apex and raises the cost together, so the 38% is no proof that more apex speed helps.)
- The track page's strip keeps the turn in the advice ("Brake 14 m later into T8") where the debrief row drops it.
- `focusSpeedLine` (debrief) and `cornerSpeedCue` (corner trends) are the same function twice.

Still open (engine details nobody asked about):

- **Exit-only habits** are shown but score 0 and are never picked. A corner already in focus can still show one as its
  habit of the session (2% of focus rows).
- **Kind per turn, headline per half.** The arc is null when the slowest point sits on a segment end, when positions
  are missing around it, or above a 1,500 m radius (21% of focus rows).
- **Brake point under "tighter arc"** (`brakeLater`) is offered alongside the line actions (competing by gap in
  steps); `brakeShorter` stays off `tighterArc` (adding it dropped its outcome check to no link). With no measured
  arc both pedal actions still stand.
- **Focus score** uses the whole corner's cost weighted by the habit's repeatability and confidence
  (`costSec × repeatability × confidence`), so split and multi-turn corners are not diluted against single non-split
  turns.
- Verified on real rows: with 1 or 2 counted laps the true pace is the average of those laps (2,037 one-lap rows equal
  the best lap), so a qualifying session's pace is what the plan says.

Not built: the line on the map (step 9), the live dashboard's apex speed (step 10), own potential on the goal line, an
exit grip cause, new mistake causes. The local scripts `engineCheck.mts`, `lineCheck.mts`, `habitFocusCheck.mts` and
`top3.mts` replicate the engine from before the rework and no longer match it; `shippedCheck.mts` beside them and
`tools/analysis/habitOutcomeCheck.ts` are the checks of the built code.

## Open questions

- The target counts only sessions with 3 clean laps, so a fast driver's one-lap qualifying is left out and the target
  can be slightly slow. Proposed: accept; only the habits read the target now, not the goal.
- Two pins on corners that stopped costing time hide the automatic pick. Proposed: accept; corner trends still shows
  every corner's cost.
- A target with 2 or 3 counted laps gives a noisier usual to compare with. Proposed: keep it (a qualifying lap is not
  a lucky lap) and look at it again if a focus corner's gap jumps when the target changes.
- The 13 layouts with an odd road edge at 1 or 2 turns: the map shows "m from the white line" only where the target's
  apex sits within 5 m of the edge, and the distance to the target's line everywhere. Proposed: accept; the edges are
  fixed in the track pipeline when a turn matters.
- "Less grip used" against a target in another car. Proposed: show it, and name the same-car driver's g beside it when
  the same-car check has one.
- "Entry speed lower" points at the turn before. Inside a sequence that turn is part of the focus already; at a
  sequence's first turn it is the corner before. Proposed: the cause line names it; whether the focus should move there
  is settled in the rework with the check.
