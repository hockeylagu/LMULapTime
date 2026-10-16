# Cockpit dashboard placement study

Standalone mock pages; no game connection, calculations or changes to the app routes.
All numbers, advice and traces are illustrative. Most live sources are now verified
(`docs/plans/LIVE_DATA_SOURCES.md`); the MFD values themselves are not. This prototype is excluded from the Vite production entry.
The plain car/class header is a mock placeholder. Real implementation must reuse
the site's existing car identity/type pattern and assets at a cockpit-readable size.

With the Vite development server running, open any URL below, or switch patterns from the header dropdown:

- Race: `/docs/prototypes/live-dashboard/index.html?session=race`
- Race with damage: `/docs/prototypes/live-dashboard/index.html?session=race&condition=damage`
- Puncture: `/docs/prototypes/live-dashboard/index.html?session=race&condition=flat`
- Practice: `/docs/prototypes/live-dashboard/index.html?session=practice`
- Qualifying: `/docs/prototypes/live-dashboard/index.html?session=quali`
- Sprint race, no stop/damage: `/docs/prototypes/live-dashboard/index.html?session=race&scenario=sprint`
- Fuel-class race example: `/docs/prototypes/live-dashboard/index.html?session=race&class=LMP2`
- Mid-stint race: `/docs/prototypes/live-dashboard/index.html?session=race&scenario=stint` (add `&class=LMP2` for fuel)
- Weather forecast: add `&weather=coming` (rain forecast) or `&weather=easing` (rain ending) to a race URL
- Lifecycle: `state=offline` (game closed), `state=menu`, `state=between&next=quali` / `next=race` (garage between sessions; add `&class=LMP2` for fuel), `session=race&state=starting`, `session=race&state=finished`

The mid-stint variant (accepted 2026-10-16) is for stint management between corners: the primary readout is
resource use averaged over the last three clean laps (one lap with traffic or a yellow
would flip it), with the margin against the per-lap target that reaches the planned pit
lap underneath (`VE / LAP · LAST 3 3.9 %`, `0.2 % SPARE / LAP`; green when spare, red
when over). The pit countdown moves to the right panel at reduced size
(`PIT IN 6 LAPS`), beside `TYRES TO PIT OK` (projected from wear per lap against the
pit lap; raw wear % said nothing about lasting), and returns to the primary position
two laps out, which the plain race preview shows. Projected resource at the pit was
dropped: it repeats the per-lap margin. With rain coming, `RAIN · 60% ~LAP 23` sits
beside the pit countdown so rain landing before the stop is obvious; no compound is
suggested. The support strip is the same as the sprint.
Old race variants remain for comparison.

Tyres and temperature (mock only): the pit-imminent race view stacks the tyre
outcome under the resource target at hero size: `NEW MEDIUM`, `NEW WET` or `NO CHANGE`,
labelled `TYRES · MFD`, with the compound word in the sim's compound colour (soft
red, medium yellow, hard white, wet blue); `NO CHANGE` stays white. The race-starting `TYRES` figure uses the
same colouring. It is what the MFD is set to
(a REST read to verify), so the driver checks the MFD rather than reading advice; it
recommends no compound. Steady weather shows `NEW MEDIUM`, rain coming `NEW WET`,
drying on wets `NO CHANGE`. The resource follows the same rule when the MFD adds none:
The resource shows only what the stop needs, from the plan, labelled like the tyre call
(`VE · MFD 70%`, `FUEL · MFD 48 L`: the value to set); the damage example is a repair
stop needing none (`NO CHANGE`).
Reading the MFD's own value to flag a mismatch waits for the pit-menu REST read. Any tyre-change time stays an estimate until LMU service
overlap is verified. Race headers show laps left, counting the current lap (`5 LAPS LEFT`): the game HUD
shows lap 22/26 and the driver should not have to subtract. Timed races would show it as
an estimate (`~5`). All race patterns are one 26-lap race with its stop on lap 24:
stint at lap 18, pit-in-2 and its damage/rain variants at lap 22. No session clock. Every header shows `TRACK 34° ↓` (track temperature
and trend); air temperature is left out, and rain would appear only when present.
Wear (remaining fraction), compound, track temperature and rain read live from shared memory.

Changing weather (mock only): the header's single weather slot replaces track
temperature. Forecasts are in laps only (minutes converted with the current lap time)
and shown in one place: a forecast chance, never a certainty. Where the main panel
carries rain coming (pit view: `RAIN ~LAP 25 · 60%` under the tyre call; stint view:
beside the pit countdown) the header keeps track temperature; elsewhere the header
shows `RAIN ~LAP 20 · 60%`. `weather=easing` shows current rain and track wetness with
trends (`RAIN 20% ↓ WET 45% ↓`) and `RAIN ENDS ~LAP 25 · 70%` under the tyre call.
The live source is LMU's `GET /rest/sessions/weather` (verified safe and read live; nodes at
start, 25/50/75 % and finish), with the forecast time
converted to a lap using the same projection as the pit countdown. No forecast is shown
when that read fails.

Lifecycle states (mock only) replace the driving regions with one state screen.
Game closed (`WAITING FOR LMU`) and in menu (`IN MENU`) clear the header down to the
logo, since no session exists. Between sessions of one event (back in the garage monitor)
the screen is about what to load for the next session: `NEXT · QUALIFYING` shows the quali
length and the laps it allows (`QUALI · 15 MIN`, 8 laps: out lap plus laps started before the
flag), VE or fuel per lap measured on clean laps of the earlier sessions (the note says which
and how many), a one-lap reserve and `VE NEEDED 37 %` (`FUEL NEEDED 27 L`). `NEXT · RACE`
shows the race length, the same per-lap figure, the plan and `VE NEEDED 100 %` (`FUEL
NEEDED 75 L`): more than a tank to finish, so a full tank and one stop around lap 24. The
needed figure is the one in amber. Race starting (`RACE STARTING`, formation lap) shows the
plan (stops, pit lap, the first-stint target `TARGET VE / LAP 4.1 %` or fuel per lap,
tyres; the start load was set from the garage screen) and keeps the pedal trace in its usual
place for an input check on the grid. Race finished leads with the class
position (`FINISHED P3`, then `IN GT3 · P11 OVERALL · STARTED P7`), then the battle at
the flag (places gained, gap to the class cars ahead and behind, stops) and pace (best,
best vs PR, clean average, laps), and points to the app debrief. Live selection uses both sources, each validating
the other: shared memory (no mapping = game closed, no session = menu, session phase:
back in the monitor with a next session = between, grid/formation = starting, session over =
finished) and the LMU REST API (game/session
state reads, within the allowlisted, rate-limited reads in `docs/LMU_REST_API.md`).
When they disagree, show the state as unknown rather than guess. Semantics unverified.

The HTML also works directly from disk. Enter browser fullscreen before driving.
Use a 2560 x 1440 viewport at 100% browser zoom, then assess from at least 50 inches.
The design scales as a single passive screen. For quick review, the header's mock badge is
a dropdown listing every pattern below (it replaces the `MOCK DATA` label and keeps
`&motion=off`); it is review-only and has no counterpart in the live page. A future live implementation
would select it automatically from game state. `&motion=off` freezes the mock trace
for screenshots; reduced-motion preferences also freeze it.

Shared anchors: session bar, primary advice, supporting figures, lap/sector information,
full-width 20-second pedal trace (kept in every session). Race keeps both timing rows:
current lap against best with completed sector deltas, then the last lap with its real
sector times and vs previous. In pit views the resource and tyre call stack at 120px so
both rows fit. Practice foregrounds last lap, session best, best possible
and a three-lap sector table closed by a BEST row (best lap and best S1/S2/S3, which sum
to best possible); the latest lap's largest sector loss is tinted as the place to improve.
It has no fuel usage/range figures. Qualifying's hero is the live delta against best
(`PUSH LAP · VS BEST −0.184`); the projected lap was dropped as a repeat of it, and no
valid flag is shown (the game shows it). Race foregrounds pit timing and service decisions.
Qualifying's support row keeps the next attempt and average tyre surface temperature (for
the out lap), not an unverified readiness judgment; fuel and VE were dropped (set in the garage). Sprint race shows `TYRES TO FINISH OK` (the spare per lap
already covers the resource at the finish) and current-lap pace and sector deltas in place of repair estimates when no stop or repair
is needed. Completed sectors show signed deltas; the unfinished sector shows ACTIVE
and no fabricated completed split. Practice keeps last completed lap time largest,
with current-lap delta versus best underneath.
Race health and stop requirements are independent: normal planned-stop races and
sprints both show the pace strip when healthy. `&condition=damage` keeps the sector
deltas and replaces the last-lap row (red top rule), steady in place, never alternating
(a glance would land on the wrong half). Damage is common, so the row appears only when
it matters: measured loss of at least 0.3 s/lap over two clean laps since the impact,
or a repair estimate of at least 30 s (`pitstop-estimate.damage`: 30 s for a side hit,
113 s with suspension damage, which shared memory does not show). A flat (`Wheel.Flat`,
seen live) shows `PIT NOW`. It shows measured figures, never a repair call: `PACE LOSS · MEASURED +0.8 s/lap` (clean
laps since the impact against before it), laps since impact, the cost to the finish
(`+4.0 s` over 5 laps) and `REPAIR TIME` from `pitstop-estimate.damage` (shown as `—` in the mock), so the driver
weighs repair against loss. `&condition=flat` (a flat or detached wheel in shared
memory) overrides every plan with `PIT NOW` and `FLAT · REAR LEFT`. Live state
selection would be automatic.
Race and the garage screen show one class-relevant resource, never both: only GT3 and Hypercar use VE;
every other class uses fuel. `&class=LMP2` selects a fuel-class placement preview.
This is mock scenario selection; live class identity uses canonical app definitions,
and live channel availability remains to be validated.
The main race readout is what the driver acts on: `PIT IN 2 LAPS` (the pit lap itself
is dropped; the countdown says when), or in a sprint the spare resource per lap to the
finish (`SPARE / LAP 0.8 %` from 7 % at finish less the 3 % reserve over 5 laps;
`0.28 L` for fuel) with `NO PIT STOP`; laps left sit in the header.

Review: readability from the cockpit, primary advice visibility within a glance,
space occupied by optional lap splits, and pedal history height.

At the 1440p target, practice history uses 80px lap times and sector values.
Three recent laps remain visible. Generic smaller-viewport scaling is only for preview
convenience; it does not establish cockpit readability on a smaller display.
After cockpit feedback, all variants use short labels (typically 48px) and larger
readouts (80–236px), with paragraph-length supporting text removed. Practice's stint
average/spread summary is removed. The priority is quick glances between corners;
the user's actual seated readability check takes precedence over screenshot review.
Signed timing deltas use green for gains, red for losses and white within +/-0.010 s.
Signs and comparison labels remain visible; lap and sector times stay white.
Every view includes an illustrative PR (personal record) reference at label size in the
session bar: it is read once per session, so it takes no primary space. Real
implementation uses the site's canonical player-best
lookup for the exact circuit layout and class, separate from session best.
The trace has no title, legend, numeric axis labels or current pedal percentages;
only curves and grid remain, retaining the 20-second history and fixed 0–100% scale.
Practice's history heading and qualifying's session-timing
heading are removed. The trace allocation is 294px at the target viewport.

[Driver review](DRIVER_REVIEW.md) challenges session coverage and records the next
mock states to validate before live integration.

Verification on 2026-10-15: browser inspection and captures at 2560 x 1440 found no
clipped text, document scrolling or dashboard controls in the reviewed mock states.
The existing app build passed without warnings; tests passed (311 suites, 2684
tests; 5 suites/56 tests skipped). The first sandbox run failed on temporary-file
and local-socket access; rerunning with required access passed. Physical readability
from the driver's seat and live-game data remain unverified.
