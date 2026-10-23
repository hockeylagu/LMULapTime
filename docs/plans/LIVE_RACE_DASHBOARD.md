# Live race dashboard

Design and delivery record. Current capture, diagnostics and learning behavior is maintained in
[Live capture reference](../LIVE_CAPTURE_FORMAT.md); remaining evidence/learning validation is in
[the active plan](LIVE_SESSION_EVIDENCE.md). Dated implementation notes below are historical.

Status: built on `live-dashboard` (the `#/live` page; see "Built" under Delivery and acceptance), checked against
the mock at 2560 x 1440 and on a GT3 offline and LMP3 online session; not yet raced with the strategy views.
Updated: 2026-10-16. Evidence: shared memory and the safe REST reads validated live (offline
practice, damage test, online LMP3 qualifying and race; see [LIVE_DATA_SOURCES.md](LIVE_DATA_SOURCES.md)).
Still to validate on a race weekend: the race plan in a real race, the fuel-class MFD line, the race-garage tyre
read, wetness on a wet track, the online forecast, cockpit readability from the seat and the effect on LMU's frame
pacing. Production components and regression tests are the current reference; historical placement decisions remain under `docs/prototypes/live-dashboard/`.

## Race strategy in the garage (2026-10-22)

Every garage before the race (practice, qualifying, the race's own) shows the race strategy under a compact
checklist, the session length and laps folded into the title (`planRaceStrategies`, `LiveRaceStrategy`). Inputs:
the event's race length (`GetSessionsInfoForEvent`), the event lap time, the VE or fuel per lap, the reserve, the
new sets (one kept for qualifying before it), the selected set, the event's measured wear of the most worn tyre
and the game's four-tyre time (`FourTireChange`, read with the pit rules on track). The race runs to the leader's
first crossing after the clock at the event lap time, every car making the same stops: their time (the stored pit
lane loss and the refuel at the game's fill rate) comes off the clock. The formation lap costs no VE
(`formationLapUse`: VE held at 100 % to the green at Le Mans on 2026-10-22 and 2026-10-23; fuel keeps a lap until
measured on a fuel class). Le Mans race 2026-10-23: the old rule (a lap past the clock, no stop time, a lap of VE on
the formation lap) planned 19 laps, the stop on lap 10 and 78 % after it; 17 were run, the stop on lap 12 with 49 %
left 12 % at the flag. The new rule plans 17 laps, lap 11 and 54 %.

- VE: the fewest stops, full at the start when there is one, the finish's need at the last stop (VE TO FINISH),
  or only the race's need without a stop.
- Tyres: keep the starting set to the flag, or a new set at every stop (+ the four-tyre time, which adds to the
  refuel). The chosen plan is the quickest whose tread stays above the floor at every change and at the flag; the
  next best is said on one line by what it changes and its cost, with its tread when it would not last.
- Unknown wear shows the tread as unknown and keeps the set; an unknown change time drops the gap.
- Not modelled yet: the pace of fresh tyres or a lighter car (no FULL VE alternative to a sprint's load), two-tyre
  changes, an extra stop to save VE, LICO, the set qualifying takes (demo only), plan changes in the race (demo).

Before the event has a lap: the use per lap and the wear come from the player's newest races (up to 5) on the exact
layout in the exact class that have a native telemetry recording (`readStrategyHistory` → `estimateFromHistory`,
read once when the layout and class resolve): the median use of the races on the same resource (two clean laps at
least), the median wear of the races on the same compound. The use is the dashboard's own (`perLapSource`
`history`): the garage load (FROM YOUR RACES HERE), the race strategy and the race plan until the first measured lap
(· YOUR RACES). The event's own measured use and wear replace them; the game's estimate (with its learned
correction) is the last fallback for the use, and the learning always keeps the game baseline, never the history.
Not used in the wet (the races do not say their conditions). The strategy title says the source: FROM YOUR LAST 3
RACES, USE FROM…, WEAR FROM…, GAME ESTIMATE.

Plan vs actual: the last plan the garage or grid showed before the race clock ran is saved once with the race's
live recording (`live_race_plans`, keyed by recording id; it waits for the recording when that begins only at the
green; qualifying plans are never saved). The session's strategy debrief reads it through the capture's session
link and shows it beside what the native telemetry measured: stops and pit lap, the start load, the load leaving
the last stop, the tyres at each stop, the racing laps and the tread at the flag. No verdict is drawn yet.

## Next-stop MFD preview in the demo (2026-10-23)

Demo only: mid-stint (`race`) and three laps out (`pit-three`) show the next VE/fuel target beneath
the pit countdown and the tyre call beneath current tread. At fewer than three laps, the existing
pit view expands to the resource target versus the current MFD setting, fuel ratio where applicable,
tyres and estimated service time. `pit-soon`, `pit-one` and `pit-this-lap` preview that transition.
Plan-change previews use the same VE target in the countdown and the change strip.

## Strategy voice proof of concept (2026-10-22)

A proof of concept in the demo only (not in the real dashboard, user 2026-10-22): the tentative
plan-change scenarios (`strategy-changed`, `strategy-changed-ve`) have optional browser TTS controls.
Enable strategy voice; it starts muted on each page visit. Read strategy repeats the current call.

Calls add a decision or consequence to the figures: an insufficient pit setting, saving that could skip
a stop, tyre coverage conflicting with “No Change”, fuel running out before energy, or whether repairs
alone exceed projected damage loss. A lower repair estimate still needs pit-lane time adding; it does
not prove a stop pays back. They use the existing deterministic `racePlanView` and strategy evidence.
Routine countdowns and finish coverage stay silent. The box call says the whole stop as the MFD should
read (“Box this lap. Energy 38 percent, new medium.”); it and a lost wheel are urgent and speak at once.
Every other call waits for a straight: one second flat out (throttle ≥ 98 %, brake ≤ 5 %) in the pedal
buffer, so nothing lands in a braking zone; the pedals are watched only while the voice is on. A plan
change from the strategy engine is a call of its own (demo: “Plan change. Using less energy. Box lap 21,
energy 58 percent, no tyre change.”), spoken on the straight where the strip shows; urgent calls go first.
Automatic calls require a change in implication; lap completion and moving numeric estimates alone stay
silent. A 60-second per-call cooldown suppresses bouncing estimates, while new urgent calls still
interrupt. Read strategy explicitly bypasses suppression. Ordinary pit entry stays silent.
Calculating, non-race, paused, non-driving and
disconnected states suppress calls and cancel pending audio. Muting or leaving cancels audio too.
Browser speech synthesis requires no new package or API key; voice availability and audio behavior
depend on the browser and installed voices. Unsupported browsers show an unavailable state; speech
errors offer a manual retry. This POC does not persist preferences or provide voice selection.
Voice selection is left to the browser, with the original English (`en-GB`) language setting.

## Confirmed brief

- Dedicated second monitor connected to the same PC as LMU: 27-inch, 2560 x 1440,
  viewed from at least 50 inches (approximately 1.27 m).
- Solo driving; races are always timed (never lap-limited), so every horizon converts the clock to laps. GT3 is the primary use, with all classes
  supported according to their available telemetry and resource rules.
- Advice only. The driver manually enters pit settings in the game's MFD.
- The live dashboard is one passive page: no interaction while racing, no tabs,
  alternate views, menus, hover-only information or required acknowledgments.
- Primary answers: which lap to pit, which fuel/energy settings to enter, and after damage
  the measured pace loss beside the repair time. The driver weighs repair against loss;
  the dashboard makes no repair call.
- Scrolling throttle/brake trace spans the screen width. No reference comparison
  required for the initial version.
- Last completed lap time and its real sector splits stay on every driving view; they must
  not reduce the readability of pit advice or the pedal trace.
- Session-aware practice, qualifying and race presentations, selected automatically
  from game state in a future implementation. Separate URLs select mock states for review.
- Practice keeps last completed lap time as its largest readout. Current-lap feedback
  remains secondary. Healthy races use current-lap pace and sector deltas in the
  support strip; the pit/finish countdown remains primary.
- All session views show the PR (personal record) small in the session bar (read once,
  not a primary readout), separate
  from session best. Real implementation reuses the site's canonical player-best
  lookup for the exact circuit layout and class; do not derive it from visible
  mock/history rows or mix layouts. Show unavailable records as absent/unknown.
- Car health is independent of race duration and stop requirements. A healthy
  planned-stop race uses the same pace/sector support strip as a healthy sprint.
  The mock's `condition=damage` and `condition=flat` states show the damage row and `PIT NOW`;
  the real implementation selects them automatically, never through race-time controls.
- Real implementation must reuse the site's existing car identity/type presentation
  and assets, with cockpit-readable sizing. The mock's plain `GT3` text is a placeholder,
  not a new vehicle identity pattern.
- Race and the garage screen display exactly one class-relevant resource: VE or fuel, never both.
  This applies to pit targets, finish projections and resource warnings. Keep the
  same position and change the label/unit with the class. **Only GT3 and Hypercar
  use VE; every other class uses fuel.** Resolve class identity through the existing
  canonical vehicle definitions, including the site's GT3/LMGT3 naming convention.
  Validate live channel availability separately; it does not change this display rule.

## Decisions for the first branch (2026-10-16)

- **Page:** the `#/live` route inside the app (one build, shared components and API client).
- **First branch:** pipe and lifecycle only. Live contracts in `shared/types`, the
  `server/live/` shared memory worker, game detection and auto-open, the live stream with
  heartbeat, the app event stream, scans held while a session is loaded, and the `#/live`
  page with the lifecycle states and the real pedal trace. No pit maths, damage or MFD figures.
- **Per-lap target:** clean laps of the current event; until there are enough, the driver's
  past laps on the same layout, class and conditions, labelled as such.
- **Reserve:** half a lap of VE or fuel by default, configurable in Settings.
- **`· MFD` values:** show what is needed; switch to the MFD's own meaning (target after the
  stop or amount to add) once the garage reads verify it.
- **Qualifying:** keeps next attempt and tyre surface temperature; fuel and VE cells dropped.
- **Reuse the app's components.** The mock's plain text stands in for existing pieces: the
  class in the header is `CarClassBadge` (`src/components/common/`), the car is `CarIdentity`
  / `CarLogo` (`src/components/vehicle/`), sector splits follow `SectorSplitsRow`, colours come
  from `src/utils/themeColors.ts` (`TELEMETRY_COLORS` for the pedals), lap times use the app's
  lap time formatting, and the PR uses the existing player-best lookup. Where a component
  exists, the live page uses it at cockpit size (a size prop or wrapper), never a copy.
- **Mid-stint:** accepted. From the second lap of a stint until two laps before the stop, the
  primary is `VE / LAP · LAST 3` (or fuel) with the spare per lap against the target that
  reaches the planned pit lap (green when spare, red when over), so the driver knows whether
  to save more or less; `PIT IN n LAPS` sits beside it and returns to primary two laps out.

## Mock placement previews

The [archived placement notes](../prototypes/live-dashboard/README.md) record the original
layout and wording decisions. The standalone mock and temporary review gallery were removed
after implementation; production components and regression tests are the current reference.
The [driver-centered review](../prototypes/live-dashboard/DRIVER_REVIEW.md) holds the earlier
critique. The placement brief, at 2560 x 1440, read in glances:

- **Every driving view:** session bar (session, track and class, laps left in races, PR,
  one weather slot), the 30-second full-width pedal trace (curves and grid only), no
  paragraph text; labels about 48 px, supporting readouts 80-96 px, primary values larger.
- **Practice:** the estimated lap (session best plus the running delta) largest, the live `DELTA` and session best,
  then the history table: the current-lap row followed by two completed laps (the latest with its sector deltas
  against the best sectors) and a `BEST` row (best lap time, best individual sectors); no fuel figures.
  S1 and S2 fill from the game's cumulative timing fields at each crossing (S2 = cumulative S2 minus S1),
  independently of whether a session best exists, beside the lap number and the running lap clock. Uncrossed
  sectors remain unknown; at the finish the row becomes the top completed lap (S3 = lap time minus cumulative S2)
  and a new current row starts. Out laps have no current splits.
- **Qualifying (2026-10-20):** the practice layout with `LAPS LEFT` in place of session best (the `BEST` row has it);
  no position, no tyre temperature, no fuel or VE, no valid flag (the HUD has it).
- **Race, pit coming:** `PIT IN 2 LAPS` (then `PIT THIS LAP`), `VE · MFD` or `FUEL · MFD`
  and `TYRES · MFD` (`NEW MEDIUM`, `NEW WET`, `NO CHANGE`, compound coloured, forecast note
  under it); then the history table as in practice.
- **Race, mid-stint (accepted):** `VE / LAP · LAST 3` with spare per lap, `PIT IN 6 LAPS`, `TYRES TO
  PIT OK`, rain lap when forecast. **No stop needed (sprint, most races):** the estimated lap
  leads, with the projected resource at the finish and the tyres secondary. Every race mode is
  followed by the practice history table (2026-10-20); the place sits in the session bar.
- **Damage:** a red alert row takes the session bar's place: `PACE LOSS · MEASURED` (median of laps either side),
  `SINCE IMPACT`, `TO FINISH`, `REPAIR TIME`, with the data status at its right end; the plan stays and the history
  keeps one completed lap; the resource can read `NO CHANGE`. **Flat or detached
  wheel:** `PIT NOW`, with the VE or fuel to set for a stop this lap (more than the planned later stop's).
- **Lifecycle:** game closed, in menu, loading, garage between sessions (the checklist: VE or fuel to set and the
  tyre set against the garage; in practice a load short of the session only reads as the laps it holds, since a
  light car for qualifying runs is a choice), race starting (pedal check; on the grid before the formation lap the
  garage checklist stays under the phase title, as the driver can still go back in), finished (`SESSION OVER`; class place, battle at the
  flag, pace and a debrief pointer are not built). The session counts as finished for the driver only once they
  take the flag: after the leader's flag the race view stays up for their last lap.

Only GT3 and Hypercar show VE; other classes show fuel in the same place.

## Proposed screen

Add a dedicated `#/live` route with a fullscreen cockpit presentation. Preserve
the current history dashboard. Inherit the app's dark palette and channel colors;
use a separate scale and composition for viewing at distance.

At 2560 x 1440, start with these design targets, then test from the actual seat:

| Region | Content | Initial scale / allocation |
|---|---|---|
| Main action | `PIT IN 2 LAPS`, `FINISH IN 5 LAPS`, `PIT THIS LAP`, or `CALCULATING` | 236 px count, 100 px event label at 100% browser zoom |
| MFD recommendation | VE or fuel needed and the tyre change, labelled `· MFD`; the MFD's own value once its read is verified | 120-154 px values, 48 px labels |
| Damage row | Measured pace loss, laps since impact, loss to the finish, repair time | 88 px values, 48 px labels |
| Supporting status | Race laps left (counting the current lap; `~` when timed), PR, one weather slot (track temp or rain/forecast), data status; no session clock | 48 px |
| Timing rows | Current lap vs best with sector deltas, then last lap with real S1/S2/S3 | 88 px values |
| Bottom trace | Last 30 seconds; throttle and brake on one fixed 0-100% scale | Full width, 294 px (about 20%); no redundant header or legend |

These are starting sizes, not confirmed readable sizes. Browser zoom, OS scaling,
window chrome and distance affect the rendered result. Configure size, reserves,
race overrides and optional fallback values in the existing app Settings before
driving. The window opens by itself when LMU starts (see Proposed architecture). The live page itself has
no controls or scrolling. A pre-race preview checks readability.

Practice, qualifying and the race share the history table: the current lap with its running delta,
the completed laps (the last one shown whether valid or not, greyed when invalid) and the `BEST` row.
S1/S2/S3 in a lap row come from that same lap; do not mix current-lap and
previous-lap sectors. Show unavailable splits as absent, never zero. The rows keep
their position so each lap update does not move the main content.

Use thick throttle/brake lines (initially 5-7 px) and a subtle grid. Omit the legend,
title, numeric axis labels and current percentages. The history remains 30 seconds
on a fixed 0–100% scale. Retain colors from `TELEMETRY_COLORS`.
Keep timestamps on a monotonic axis and break traces on gaps. Do not interpolate
through dropped data. Avoid per-sample animations or layout shifts.

Keep all required information on this one page, with no modal or alternate mode.
Keep panel positions stable across driving, pit approach and service. Change the
main action text without moving its location. Show predicted times before the stop
and measured elapsed time during it. Data loss must visibly replace live advice.

## Existing foundation and gaps

Field-by-field source map and the validation run: [LIVE_DATA_SOURCES.md](LIVE_DATA_SOURCES.md).

| Capability | Repository evidence | Remaining validation |
|---|---|---|
| Physical fuel and capacity | `tools/telemetryRecorder.ts` and `server/live/rf2Layout.ts` | Correct units/values during live driving and refuelling, across classes |
| Pedal inputs | Recorder exposes filtered and unfiltered throttle/brake | Choose driver-input channels; verify update rate and latency |
| Session timing and pit state | Scoring structs (elapsed/end time, max laps, pit flags); lifecycle seen live online (phases 0, 3, 5, 8; `navigation/state`, `GetGameState`) | Displayed lap numbering, timed-race finish rule, phase 4 |
| Damage indicators | Dents, impacts, `Flat` seen live (side hit, suspension hit) | Dent slot per body area, detached parts, overheating, pace loss |
| Virtual energy | `/rest/watch/standings` `veFraction` (player only online) | Hypercar check |
| Repair/service settings | Pit-menu GET endpoints in the retained schema | MFD values, repair options and tyre sets: the garage reads |
| Stop estimate / usage | `pitstop-estimate` (seconds per service part, `damage` = repair time) and `usage` (per-lap fuel, VE, tyres) read live | Service overlap when several parts run |
| Historic pit service | `shared/domain/pitStops.ts` separates service and lane timing | Use only matching-layout/car/condition evidence; unexplained stop time is not measured repair |

Physical fuel, virtual energy and hybrid battery charge remain distinct quantities.
Never substitute battery percentage for virtual energy or infer VE from litres
without a validated car-specific relationship. Partial class support must be visible.

The official LMU guide describes VE for Hypercar and LMGT3:
[What is Virtual Energy?](https://guide.lemansultimate.com/hc/en-gb/articles/13152376674191-What-is-Virtual-Energy-NRG).
The MFD exposes fuel/VE and pit settings:
[Understanding the MFD](https://guide.lemansultimate.com/hc/en-gb/articles/13202210967055-Understanding-the-MFD-Multi-Function-Display).

## Fuel, energy and pit-lap engine

1. Establish player, car, exact layout, session instance, race type and live state.
   Call `getCircuitSpecification` directly. Ambiguous layout identity cannot select
   a historical strategy profile. Reject replay playback as live driving.
2. Measure consumption between equivalent lap crossings, accounting for resets,
   refills and missing samples. Learn from representative laps of matching conditions;
   keep caution/pit periods separate. Use canonical clean-lap rules where applicable.
   Any live eligibility logic needs one owner, rather than ad hoc view classification.
3. Start with a robust recent-lap consumption estimate and a configurable reserve (half a
   lap by default; before enough laps, the driver's past laps on the same layout, class and
   conditions, labelled).
   Label the learning state until enough evidence exists. Explicitly show any manual
   fallback estimate. Estimate consumption from the current position to the actual pit box,
   including the pit approach, rather than assuming a full tank lasts an integer lap count.
3b. Live findings for the engine (2026-10-16, `LMU_REST_API.md` §4.3): sample per-lap VE and
   fuel from `standings.veFraction` / `fuelFraction` at each line crossing (`strategy/usage` is
   stored in 1/255 steps); before any lap, use `TireManagement.expectedUsage`; the start
   amounts set in the garage come from `getPlayerGarageData`; the MFD from `receivePitMenu`.
   `pitstop-estimate` shows only the penalty while one is pending, so keep the repair estimate
   separately, and add the random delays (`pitStopTimes`) as a range.
4. Races are always timed (LMU reports a lap limit of 2^32 - 1, confirmed 2026-10-15), so
   the remaining time is converted to laps, including the unfinished current lap: leader
   progress, the finish rule (the leader's first crossing after the clock ends), expected
   pace and uncertainty; never only `ceil(time / own lap time)`. Laps left in the header
   already does this (`shared/domain/live/liveLapsLeft.ts`).
5. Compare each applicable resource horizon. The earliest limiting resource constrains
   the latest safe pit opportunity. Include mandatory stops, windows and penalties only
   when known; otherwise label the recommendation's scope.
6. Initially recommend a feasible fuel/energy pit lap, with a stable countdown and
   hysteresis against noisy changes. Do not claim an optimal traffic/undercut strategy.
   If the finish is reachable, show the spare per lap and `NO PIT STOP`. The reserve is kept at pit entry and in
   what a stop loads, never at the flag (2026-10-22: a last-lap stop was called with 11 % VE for a 7.8 % lap).
7. Compute the required departure resource target for the next planned stint or finish.
   If it exceeds capacity, schedule another stop rather than silently clipping the target.
   Recalculate after refuelling, condition changes and significant consumption changes.
8. **Fuel ratio for VE cars (to do, 2026-10-16).** Hypercar and GT3 carry fuel as well as VE, and the fuel
   ratio decides how much: if it is too low the car runs dry before the VE runs out, and if it is too high
   it carries extra weight. **Goal: the lowest ratio that still lasts the VE**, to carry no fuel that is never
   used. Show that ratio beside the VE target in the garage checklist and the pit-stop cells.
   - **Lowest safe ratio** = the highest per-lap `fuel ÷ VE` over the measured laps (not the mean, so it holds
     on the thirstiest lap), rounded **up** to the 0.01 step. No extra margin on top: the VE reserve already
     covers the fuel, because the fuel loaded scales with the VE set. Before enough laps, use the game's
     estimate and say so.
   - **What it saves.** Each 0.01 of ratio is 0.01 L per % of VE: at 50 % VE that is 0.5 L (about 0.37 kg at
     0.74 kg/L). The default 0.86 against the 0.84 the estimates give carried about 1 L more than needed.
   - **Same conditions.** Fuel ÷ VE can differ between dry and wet, or with traffic and lift-and-coast;
     measure it per condition, like the per-lap use, and recalculate when it moves.
   What is available (Bahrain Outer, GT3, offline capture in `lmu-live-captures/2026-10-16-…`):
   - **What the ratio means.** `getPlayerGarageData` `VM_FUEL_LEVEL` "0.86" with `VM_VIRTUAL_ENERGY` 50 % gave
     `VM_FUEL_CAPACITY` "43.0L (19.7 laps)", so litres = VE % × ratio (50 × 0.86 = 43.0). The ratio steps run
     0.01–1.17 (117 options), and 1.17 × 100 % = the 117 L tank, so the ratio is litres per 1 % of VE.
     This comes from one capture; confirm it on a second car.
   - **Fuel per lap.** Telemetry `fuel` / `fuelCapacity` (litres, already read every 500 ms for fuel classes,
     and present for VE cars too); `standings.fuelFraction`; `getVehicleCondition.fuel`; before any lap,
     `TireManagement.expectedUsage.fuelConsumption` (2.128 L) and `fuelFractionPerLap`.
   - **VE per lap.** Already measured by `LiveUsageMeter` (`standings.veFraction`); before any lap,
     `expectedUsage.virtualEnergyFractionPerLap` (2.533 %).
   - **Where it is set.** The garage (`VM_FUEL_LEVEL`) and the MFD `FUEL RATIO:` line in `receivePitMenu`
     (its settings list is the 0.01–1.17 steps; the index read in the garage was 49 = 0.50 while the setup
     held 0.86, so read the MFD value only once the car has left the garage). `RepairAndRefuel.fuelInfo`
     gives the tank in litres and VE in joules (`maxFuel` 117, `maxVirtualEnergy` 675 MJ).
   - **Check.** From the game's estimates, 2.128 L ÷ 2.533 % = 0.84 L per %, just under the 0.86 that was
     set. Measure fuel per lap with a second `LiveUsageMeter` fed by the telemetry fuel at the same crossings
     as VE; once measured laps exist, they replace the estimate.

MFD guidance must name the actual field and its verified semantics. Distinguish
`TARGET AFTER STOP` from `AMOUNT TO ADD`. Calculate the latter from projected resource
at the box, not resource now. Where LMU uses VE and fuel ratio, show those fields.
Do not expose an unsupported conversion as a precise instruction.

Use the game's displayed racing-lap convention consistently. `PIT THIS LAP` means
the next reachable pit entry on the current racing lap. Explicitly handle pit entry
after it has been passed and timing lines located inside the pit lane.

## Damage and repair decisions

Display three distinct time concepts, each labeled as estimated until measured:

- **Repair duration:** work associated with the selected repair option.
- **Total pit time:** pit entry to pit exit, including travel and service.
- **Pit loss:** extra time compared with continuing on track over equivalent endpoints.

Also calculate the **extra stop time caused by repairs**. Services may overlap or
run sequentially; validate the game's service schedule rather than summing every task.
Account for tyres, refuelling, limiter travel, penalties and service already planned.
Forecast uncertainty should remain visible; a range is preferable to false precision.

Estimate performance impact from repeated comparable post-impact segments/laps
against the driver's own pre-impact baseline. Control for fuel load, tyres, weather,
traffic, pedal inputs and setup when evidence permits. Top speed or aero force at
one instant cannot be converted directly into lap loss. Suppress attribution when
confounders or insufficient data prevent a useful comparison.

The basic time comparison is:

`recoverable loss per lap x affected remaining laps > extra repair stop cost`

For a new unscheduled repair stop, its cost includes the extra pit visit, not just
repair work. Use the race horizon after that visit. For a planned stop, use the
marginal cost over the otherwise planned service. Show the break-even lap count
only when expected recovery and repairability are supported. Partial repairs must
not assume full performance recovery. Handling/critical-damage warnings remain
separate from a time-saving recommendation.

Mock display: `PACE LOSS · MEASURED +0.8 s/lap` (clean laps since the impact
against before it), `SINCE IMPACT 3 LAPS`, `TO FINISH · 5 LAPS +4.0 s` and
`REPAIR TIME` from `pitstop-estimate.damage` (30 s and 113 s seen live); the driver weighs
repair time against the loss and the dashboard makes no repair call. The row appears at a
loss of 0.3 s/lap or more over two clean laps, or a repair time of 30 s or more. Missing
repair time yields `REPAIR TIME UNAVAILABLE`, not an estimate derived from an arbitrary
damage percentage. A labeled manual repair
time entered in Settings before racing can be an optional fallback. Never require
a manual entry, alert dismissal or confirmation on the live dashboard.

## Proposed architecture

`rF2 shared memory plugin -> Express worker thread -> Express live service -> local browser`

Decided 2026-10-15: read shared memory inside the app, not through a sidecar. The source
is the rF2 shared memory plugin (`$rFactor2SMMP_Telemetry$`, `$rFactor2SMMP_Scoring$`), as
the recorder uses today; a native LMU source can replace it later. A `worker_thread` maps
the buffers through koffi (`OpenFileMappingW` / `MapViewOfFile`, no compiler needed) and
decodes at the offsets in `server/live/rf2Layout.ts`. To keep
CPU low it copies only the player's vehicle, checks the plugin's version counters before and
after each copy, skips unchanged frames, reads at about 50 Hz only while `inRealtime` (1 Hz or
less otherwise), and runs the pit/strategy models per lap and on events, not per sample.
The app never reads a replay, results XML or DuckDB file while LMU may still be writing it:
while the live service sees a session loaded, file scans and replay decoding (the start-up
scan, Refresh, the replay upgrade runner) are queued, and they run once the session has
ended. This also keeps their CPU off the race. The browser
draws the pedal trace on a canvas only when samples arrive; React updates only the figures.
The C# recorder stays a capture tool.

**Opens by itself when LMU starts.** While the app runs with the game closed, the live service
checks every few seconds whether the plugin's shared memory exists (a cheap open attempt, no
REST calls, since the REST port is not polled until the game is up). When it appears, the
server sends a `game-started` app event once for that game launch, and the app page that is
already open switches itself to `#/live`. The app never starts a browser (decision
2026-10-16: the driver keeps the site open on the second screen). Nothing happens when a
dashboard page is already connected, and it does not switch again until LMU is started
again. Settings holds the on/off switch (on by default).
While LMU runs, an app page that was not switched (setting off, or another dashboard page
already open) shows a banner above the navbar, "Le Mans Ultimate is running. Open the live
dashboard", from the `game-running` app event; the LMU mark on the dashboard leads back.
The banner clears when exit is detected, or immediately if the app event stream fails.
After 37.5 seconds without an app event or heartbeat, the page clears stale game status
and reconnects every 2 seconds until the server answers.
Polling is deliberate: Windows has no notice for a named mapping being created, and process
start events (WMI) cost more or need admin rights. The app's own open handle keeps the
mapping alive after LMU exits, and the buffer alone keeps the last session on the menu and
shows a replay as driving, so the reader asks `navigation/state` every 2 s: a refused read is
the game gone (a reset or slow answer is not: LMU resets requests in the frozen last seconds of
a load), and the answer says menu, loading (also while `OP_TO_REALTIME`, after LMU clears its
loading flag), replay or session. A jump in the buffer (another session or track, the clock
going back, any write on the menu, such as the one LMU makes as it exits) holds the frames
until the game answers, within a second. The page itself then
follows the lifecycle (menu, garage, on track) without any input.

Add selective, lifecycle-gated REST reads through the backend for fields that
shared memory does not supply. Keep the game API local. The UI uses domain API
modules; a streaming transport belongs in `src/api/`, alongside the existing JSON client.
The same-PC setup does not require exposing Express on the local network.

Suggested ownership:

- C# recorder: retain recording commands only (captures for analysis and replay fixtures).
- `server/live/`: shared memory worker (coherent reads, reconnect when the game restarts,
  clean shutdown), validation, freshness, resource history, REST polling, snapshots and a
  bounded trace buffer. Diagnostics stay off the data stream.
- `shared/domain/live/`: deterministic consumption, race horizon and service/repair models.
- `shared/types/`: canonical live contracts with source time, receipt time, sequence,
  session identity, capabilities, units and estimate confidence.
- `src/api/`: one live connection per page, reconnect and error handling.
- `src/components/live/`: one passive fullscreen presentation; pre-race configuration
  belongs in the existing Settings feature.

Capture fresh pedal samples at the available source rate; initially target 20-30 Hz
batched browser delivery and smooth bounded rendering. Coalesce strategy readouts
to a slower cadence and meaningful events. These are performance targets, not
measured capabilities. Preserve pedal peaks when reducing samples. A slow browser
must not back-pressure the simulation reader or create an unbounded queue.

SSE is a reasonable initial browser transport for advice-only data; compare it
with WebSocket only if measured load/latency or future control requirements justify it.
Preserve the zero-dependency path where practical and use an explicit snapshot
after reconnect. The browser holds one stream and the server pushes state
changes, pedal batches only while driving, and a heartbeat every ~15 s so a dead connection
shows as disconnected. `EventSource` gives up on an error status (a dev proxy error during a server restart left the
page on `DATA LOST`, 2026-10-16), so the page reopens the stream every 2 s until the server answers. Do not query growing DuckDB files to supply the live pedal trace.

**Effect on the existing app.** `/api/status` and `/api/scan/status` stay plain GETs; the
analysis app polls scan progress once a second only while work runs and stops when idle,
so moving them to a stream saves nothing, and race data must not reach app tabs. One gap:
the server runs the scans held during a session by itself when it ends, and an idle app tab would not
notice. (Built: only a scan asked for during the session runs then; new results are found by Refresh or at the
next start, as before. A replay playing also holds the scans: one started from a session's monitor leaves that
session loaded.) Add a small app-wide event stream (`scan started`, `scan finished`), separate from
the live stream but on the same transport code: `scan started` restarts the existing
progress polling and `scan finished` reloads the data. Replacing the progress polling with
it later is optional.

Clear learned state on session/car/layout changes, clock regression, restart or
return to garage as appropriate. No PAUSED marker: offline LMU never reports its pause in
the shared memory (no game phase 9 in any capture, 2026-10-20), so a paused game simply
holds its last values; disconnection comes from receipt freshness. Unknown fields stay absent, never zero-filled.
The post-session cache and parser remain authoritative for historical analysis.

## Delivery and acceptance

1. **Data feasibility:** largely done 2026-10-15 (shared memory and the safe REST reads,
   live). Left: the garage reads (MFD, repair options, tyre sets), the rest of the damage
   test, the race-weekend reads and wet weather; see the next test session in
   [LIVE_DATA_SOURCES.md](LIVE_DATA_SOURCES.md). Never call `getVehicleCondition` during replay playback (it crashed
   LMU twice); the other reads the app makes answered safely in a replay ([LMU_REST_API.md](../LMU_REST_API.md) §4.1).
2. **Cockpit prototype:** mock-data fullscreen page at 2560 x 1440; test from 50 inches
   or farther, with the game active on the main display. Validate key figures and trace
   readability before finalizing size, density and browser presentation. All race
   information must be available without clicking, hovering or changing views.
3. **Live fundamentals:** lifecycle states (game closed, menu, garage between sessions with the VE or fuel needed for the next one, session starting, finished; mocked), connect/disconnect/paused, opening the dashboard when LMU starts, player/session isolation,
   current fuel/energy and full-width pedals. Confirm low impact on LMU frame pacing.
4. **Pit advice:** timed horizons converted to laps, reserves, stint planning and verified
   MFD targets. Exercise finish-line edge cases and unavailable-resource fallbacks.
5. **Service and damage:** repair duration and total pit estimate, then performance
   attribution and marginal repair decisions once evidence supports them.

**Built on `live-dashboard` (2026-10-16, mock-checked at 2560 x 1440, not yet raced):** the VE/fuel engine (measured
per lap over the last 3 clean laps, game estimate before the first lap, reserve setting 0–2 laps, default 0.5),
the race plan modes (stint, pit countdown with the MFD values, pit this lap, sprint, pit now for a flat or lost
wheel, in pit, calculating), pit time with the random delays and stop-and-go while a penalty is pending, the damage
row, tyres, the forecast slot, the garage screen (laps and amount needed against the garage setting) and the
loading screen. Unverified until the next race weekend: the fuel-class MFD `FUEL:` line and garage fuel in litres,
the online forecast, pace-loss confounders (traffic, tyres), and pit elapsed time during the stop (not shown).
Per-lap use has no history fallback; before the first measured lap it is the game's estimate.
Review fixes before the merge (2026-10-16): laps left counts a car's own crossings up to the leader's flag (a lapped
car, or a GT3 behind a Hypercar leader, is no longer cut short); `PIT NOW` and the in-pit view set the MFD for a stop
this lap; the event's per-lap use and lap times are forgotten when another resolved layout of the same track name
loads; replays are detected from `navigation/state` `settingMode` (`GetGameState.isReplayActive` stayed false in a
replay) and `getVehicleCondition`, the one read that crashed LMU in a replay, follows its own check; a replay holds the file
scans; the race view stays up until the player takes the flag.
Not built: pace-loss confounders, hysteresis on the pit countdown,
the history fallback for per-lap use, and the extra lap a car behind a faster overall leader can run in the
race garage figure (the race plan counts it once the race runs).

Automated cases should cover refills, partial laps, capacity overflow, lap-number
conventions, timed finishes, mandatory rules, resource changes, missing data,
reconnects, service overlap and repair break-even. Follow repository tests/build
requirements; run endpoint benchmarks before/after API performance changes.
GT3 (offline) and LMP3 (online) are validated live; Hypercar and LMP2 checks remain.
No all-class success claim until each supported resource model is verified.

`PRODUCT.md` records the live dashboard as the one exception to its post-session operating context;
the existing analysis pages retain their established behavior and scale.

## Next priorities agreed with the driver (2026-10-16)

The usual race has zero or one pit stop. Prioritize saving scenarios, tyre coverage,
fuel-ratio guidance, pit execution, and better post-qualifying, pre-race and post-race
screens. Multi-stint comparison is deferred: it has limited value for this use.
Nearby cars and traffic are already covered by the in-game HUD; duplicating those
views is not a priority for the second screen. These are next-scope decisions, not
claims of implemented or validated features.

- **Sprint presentation (provisional choice, accepted by the driver):** while the finish
  reserve is covered, current-lap delta against the session best leads, with sector
  deltas and the last completed lap clearly visible. Projected resource at the finish
  and reserve coverage remain secondary; raw consumption per lap is not the primary.
  Promote the required saving target and projected shortfall when resource management
  requires a change in driving, and urgent pit advice when a car problem requires it.
  Keep this direction until a better idea is agreed. Implemented first increment:
  the healthy sprint leads with live delta and the session-best reference, projected
  finish resource is marked estimated with reserve coverage, and tyre temperature
  replaces the duplicate delta in the sector strip. Existing pit and damage modes
  still override pace. New saving-target calculations remain next work.
- **Saving scenarios:** show the per-lap VE or fuel target needed to reach the finish
  with the configured reserve and, where feasible, avoid the single planned stop.
  Distinguish avoiding a stop from reducing the load at a stop that remains necessary.
  Use deterministic calculations and expose insufficient measurement confidence.
- **Tyre coverage:** answer whether the fitted set covers the remaining race or the
  next planned stop, and whether the available sets cover the intended strategy.
  Validate wear extrapolation before showing a lifespan as reliable.
- **Fuel ratio:** guide the garage and MFD ratio for VE cars using measured fuel/VE
  use and an explicit physical-fuel margin; retain the single primary resource display.
- **Pit execution:** compare the intended departure resource, tyres and repair choice
  against actual MFD settings. Recalculate for an early or emergency stop. Distinguish
  selected service, a pending penalty and completed service using verified game data.

The following screen contents are proposals to refine with the driver:

- **Post qualifying:** final class position when available, best valid lap, gap to the
  driver's personal record, and the qualifying tyre set's wear. Carry useful measured
  consumption and tyre information into race preparation, isolated by layout/car and
  relevant conditions. Do not imply the grid is final while results remain provisional.
- **Pre race:** a clear checklist for start resource, fuel ratio where applicable,
  fitted tyre set and its coverage, expected zero/one-stop plan, reserve and weather.
  Compare actual garage settings with targets; identify estimates and missing data.
- **Post race:** final class result when available, best and average clean race pace,
  actual stops and resource remaining, planned versus actual consumption, and a
  concise handoff to the existing session analysis. Show provisional live results first;
  official post-session results remain authoritative when ingested.

All transitions remain automatic and passive while driving. Preserve the established
cockpit readability and full-width pedal trace; detailed analysis belongs after driving.

### Implemented strategy and session improvements (2026-10-16)

- `shared/domain/live/liveInsights.ts` owns no-stop targets, paired-lap fuel ratios and
  linear tyre projections. No AI or game control is involved. The no-stop ceiling is
  `amount / (remaining fractional laps + reserve laps)`, rounded down to 0.01 for the
  displayed target. The saving and shortfall update with resource level and race horizon.
  A measured saving of up to 5%, after at least three measured laps, leads as `TO SKIP
  STOP`; this cutoff limits presentation, not a claim of feasibility. Larger or game-based
  scenarios remain secondary to the pit plan. Damage and penalties retain priority.
- Fuel ratio uses the highest of up to 30 paired clean-lap fuel/VE measurements after
  three pairs, or the labelled game estimate before then, rounded up to an available
  MFD setting. No available range means no invented target; no clamping below the needed
  ratio. Layout, car and dry/wet changes clear incompatible learned history (wet from `RAIN_WET_MIN`, dry again
  below 7 of 255 so a drying track does not flip); another compound resets only the tyre wear.
  Available ratio settings persist within the same event across qualifying/race; actual
  garage and MFD settings are read independently. The garage now also reads the safe
  pit-menu endpoint to obtain the setting range.
- Tyre coverage projects remaining tread at the next pit or finish, using observed
  wear, and compares the reported inventory with the linear race requirement. Zero or
  unknown wear gives no lifespan. `LAPS TO ZERO` is explicitly a tread extrapolation,
  not a useful-grip or safety limit. Same-compound wear carries into the pre-race
  checklist; a new compound or changed conditions clears it.
- Pit cells show the departure target against the actual MFD amount, fuel ratio,
  selected tyres and repair choice. A flat with `NO CHANGE` flags a tyre change. No
  repair choice is made on the driver's behalf, and no elapsed/finished-service claim
  is inferred from a timer.
- `LiveResultTracker` captures clean observed lap average, best lap, raw game pit-stop
  count, class/overall position, resource remaining and recent use versus the start
  plan. It freezes race metrics at the player's flag, never the leader's. Cooldown laps
  and subsequent refills cannot overwrite the summary. Class order may still update;
  every live result is marked provisional. Mid-session captures are labelled partial.
- Post-qualifying and post-race summaries now replace the generic finished screen,
  including in the garage after the flag. Qualifying context carries into race
  preparation for the same layout and car. Race preparation shows zero/one-stop plan,
  reserve, actual start resource, ratio, fitted tyres and wear projection. Post-race
  links to session analysis; leave the live session and refresh to ingest official
  results. No historical session ID is guessed from live names.

Automated fixtures cover reserve preservation, conservative rounding, refill scenarios,
paired measurements, available-setting limits, wet-condition resets, tyre extrapolation,
early pit settings, partial captures and player/leader finish ordering. UI fixtures were
checked at 2560 x 1440. Validate fuel-ratio ranges on a second VE car, wet runs, inventory
units, real tyre degradation and a complete race weekend before treating these models
as race-validated.

### Persistent estimate / selection / outcome history (2026-10-16)

Storage update 2026-10-18: the implementation below is the original delivery record. Full checkpoints
now live in the session DuckDB and run without dashboard subscribers. The inspected old SQLite audit
table/data was deleted with user approval; its compatibility code is removed. JSON/CSV reads only
recordings after they close. Subsequent user decision: JSON/CSV endpoints/UI and export workers
are also removed; debug the checkpoints directly in DuckDB. The old writer and 30-run pruning policy are removed. See [current audit storage](../LIVE_CAPTURE_FORMAT.md#consolidated-strategy-audit).

The live service now writes immutable checkpoints into `live_strategy_audit` in the local WAL SQLite database while a dashboard page is open (driver decision 2026-10-16: no REST reads or history without one; no size limit for now, to be reviewed after a few sessions). Each capture has its own UUID, ordered sequence, wall clock, session clock and forecasting model version. Session changes, clock regressions, known layout changes and leaving the session close the capture; interrupted runs remain available. Capture scope is explicit, not a guessed XML session ID. No imported results are altered.

Checkpoints preserve the complete plan, garage and next-stop MFD selections, physical fuel/VE readings, tyre tread/compound, conditions, reserve and eventual provisional result. They are written on start, settings or estimate changes, completed laps, new clean-lap measurements, finish, exit and otherwise every 10 session seconds. A storage failure leaves live driving operational and marks history unavailable rather than claiming it was saved.

Accuracy comparisons freeze the consumption and fuel-ratio forecast at the start of a lap, then compare it against raw measured use at that lap's crossing. Actual minus forecast is positive for underestimation; percentage error divides that difference by the forecast. VE cars wait for matched fuel/VE crossings to calculate actual litres per 1% VE; each eligible lap contributes once. Mid-lap joins and changes of layout, compound or wet/dry regime have no retrospective comparison. The existing usage meter excludes pit, caution, invalid, refuelled and unbracketed laps. Zero/one-stop races both retain pit plans and selections; next-stop MFD settings are not described as the ratio already loaded in the car.

Settings > Live dashboard offers CSV export; the cockpit dashboard stays passive with no links, buttons or export controls; `/api/live/audit` returns the newest 200 checkpoints (optional `runId`), and `/api/live/audit.csv` streams all history or that capture. CSV includes signed selection/recommendation mismatches and forecast/actual consumption and ratio errors. JSON retains original precision and context. Tyre projections and final tread are retained for review; there is no automatic tyre-error score across tyre changes, or invented full-race fuel requirement from clean-lap averages. Historical data collection does not yet change recommendations automatically. Any later calibration must group by canonical resolved layout, car, compound, conditions and model version, and distinguish interrupted captures from full races. Unresolved layouts must not train a layout-specific model.

### Cockpit review refinements (2026-10-16)

Finish-covered sprint racing now shows only the current pace delta, projected resource at the finish and projected tread. Fuel ratio (a next-stop setting), reserve reassurance, reference-lap subtitle and routine tyre-life subtitles are omitted. The pace readout uses two columns; all controls remain outside the cockpit dashboard.

The driver's planning floor is 40% tread (`LIVE_TYRE_TREAD_FLOOR`), not zero. Set coverage uses usable fitted tread above that floor and 60% usable tread per fresh set. Healthy projections display only the approximate tread; below-floor projections and inventory shortages remain warnings. The floor is a driver preference, not an inferred grip guarantee. Forecast model version is now 2 so saved history distinguishes these planning rules.

When tyre replacement is needed and the MFD says No Change, the pit readout shows a specific fresh set of the fitted compound (e.g. NEW MEDIUM), alongside SET NO CHANGE. Unknown compound shows NEW SET. This renewal advice does not infer a different compound from rain forecasts.

Successful strategy-history saving is silent on the cockpit result screens. The routine saved-history label is omitted; an actual storage failure remains visible.

Preparation hierarchy: the estimated session lap count is a dedicated 180 px readout, separate from the subtitle. Duration and the race stop plan use a 64 px supporting line; qualifying carryover remains secondary. Redundant lap/reserve/calculation text is removed from the subtitle; source labels stay beside the recommendations. Unknown lap counts display a dash.

Subtitle audit: remove routine clean/paired sample counts, already-matching MFD selections, the duplicate tyre forecast, repair N/A, generic post-qualifying prompts and repeated lifecycle descriptions. Retain actual setting differences, missing-reading reasons, game-estimate qualifiers, tyre-floor/stock warnings, penalty-service restrictions, formation/countdown status, qualifying carryover and provisional/partial-result context. Race result consumption retains its recent-clean-lap horizon. The review gallery also includes a 45-minute / approximately 24-lap race with one planned stop, derived through planGarage at 4.5% VE per lap.

Planned-stop preparation includes the estimated first racing pit lap (`LiveGaragePlan.firstPitLap`). `planGarage` delegates to canonical `planRace` using the selected garage load, reserve and consumption, after subtracting the formation lap's use (`formationLapUse`: none for VE, a lap for fuel) from the load and the formation lap from the session horizon. It does not count the formation lap as racing lap 1. Unknown load/use or an insufficient formation-and-reserve load gives no preview; a full-session load gives no pit lap. This is a resource-range preview, not an optimal pit window; tyre/forecast/damage advice still applies. The 45-minute fixture at 4.5% VE/lap previews lap 21 from a selected 100%, and lap 17 from 80% (lap 20 on fuel).

Race preparation treats the completed qualifying result carried into the race garage as settled for cockpit presentation, so its QUALI position/time line has no provisional suffix. The underlying source remains live scoring; this presentation change does not claim XML-result linkage or change the result-summary source semantics.

Qualifying settlement requires BOTH timer expiry (`currentEt >= endEt` with a valid timed end) and full-field terminal finish statuses (finished, DNF or DQ). The decoder reports an unknown completion state when the scoring field is absent/truncated. A personal flag, phase 8 or return to the garage alone cannot settle qualifying. The waiting summary remains provisional and still records the player's final lap; personal cooldown metrics freeze at the player's terminal status. Once all drivers finish and time expires, settlement latches for that qualifying session and carries to race preparation without the provisional label. Unknown/early-transition carryover remains provisional. This supersedes the earlier assumption that simply entering the race garage settles the qualifying result; no XML linkage is implied. Live confirmation of qualifying finish-status behaviour remains required.

Multiclass horizon (forecast model version 3): the overall leader sets the timed-race flag. `projectRaceFlagSeconds` is shared by live laps remaining and garage preparation; a slower class never uses the overall leader lap count directly. The decoder selects the player's class leader from the complete scoring field via canonical class normalization, including aliases, while keeping LMP2 WEC and ELMS distinct. Remaining player crossings use the player's own pace (median of its recent valid laps), then same-class leader pace, then the player's estimate; the next crossing is the later of lap start plus pace and the position on the lap (a lap slowed by a stop crosses later), and a planned stop still ahead costs its pit lane loss plus its service: the loss is the median of the newest 20 stops stored for the exact layout and class (`live_pit_lane_losses`, each the in-lap and out-lap against two laps at pace, less the time standing in the box; stops with damage from their pace laps on are left out; `tools/analysis/backfillPitLaneLoss.ts` fills it from closed recordings), else this session's own measured stop (model version 5, 2026-10-22: class-leader pace without the stop read one lap too many at Le Mans). Laps already lost are never added back. The leader is taken to make the player's stops: while it has made fewer (`pitStops`) than the player's done and planned, one stop of the player's cost delays its flag (model version 6, Le Mans 2026-10-23: 18 laps read until the leader stopped on lap 13, everyone ran 17, and the stop loaded a lap too much). Once the overall leader has finished, each running player has only its current lap to complete. Preparation projects the overall leader's final post-timer lap, converts that horizon with class pace, and shows racing laps only; the additional formation/out-lap use stays in the resource/tyre budget. This applies to every canonical player class, not specifically GT3. The gallery includes a one-hour GT3 example (Hyper overall leader at 110 s, player class at 120 s): overall flag at 3630 s, 33 Hyper racing laps versus 31 player-class racing laps, plus formation use in preparation budgeting.

### Event transition validation (2026-10-16)

Automated validation uses decoded scoring and navigation fixtures; it does not constitute a recorded online or single-player LMU weekend. Online and single-player sequences share the same lifecycle engine and session-code mapping.

| Transition | Expected dashboard behavior | Automated coverage |
|---|---|---|
| Main menu before scoring arrives | IN MENU; no old session, results, weather or strategy | Service and rendered sequence |
| Loading practice or another stage | LOADING; hide old session content; hold file ingestion; no pit-data polling | Service sequence and lifecycle checks |
| Practice garage → driving | Practice setup → practice driving view and pedal trace | Service and rendered sequence |
| Qualifying garage → driving | Qualifying setup → qualifying driving view | Service and rendered sequence |
| Qualifying timer expires while drivers finish | Keep driving until player's flag; garage summary waits for complete field | Online sequence, result and rendered checks |
| Timer expired and all drivers terminal | QUALIFYING COMPLETE; settled result retained | Online sequence, result and rendered checks |
| Race garage, with or without intervening loading/warmup | Race preparation; settled qualifying retained for the same event; no old result screen | Weekend matrix and rendered sequence |
| Grid → formation → countdown | Grid: phase title + garage checklist + pedal trace; from the formation lap RACE STARTING with phase-specific status and pedal trace | Service phases 0–4 and rendered sequence |
| Green → race | Race view replaces starting screen | Service and rendered sequence |
| Overall leader flagged, player still running | Keep race view and capture player's final lap | Service, result and rendered checks |
| Player flagged → garage | Race summary; cooldown cannot overwrite frozen metrics | Service, result and page checks |
| DNF / DQ / game closes | Terminal result or offline; clear event state on exit | Service and existing page/lifecycle checks |
| Leave and rejoin same practice server | Clear previous best, laps, qualifying and strategy, even if old scoring remains | Service regression |

The weekend matrix exercises every nonempty ordered subset of practice, qualifying, warmup and race (15 combinations), including practice only, qualifying only, race only, practice/race, qualifying/race and the complete weekend. A separate online three-stage sequence exercises transitions without a loading screen, pending qualifying completion, race preparation and the player's final race lap. Existing reader tests cover shared-memory opening/closure, busy loading probes, menu detection, pauses and reconnect behavior. The rendered sequence asserts that no buttons or text inputs appear.

Fixed during validation:

- Navigation loading/menu takes precedence before the first scoring frame. Loading holds the ingestion guard but does not start pit polling.
- Menu/offline clears lap timing, weather, learned strategy and result carryover even if LMU retains the scoring buffer. Loading hides content while preserving event learning for the next stage.
- Qualifying carryover survives a temporarily unresolved layout in the next session. Two different known layouts still invalidate carryover; a new practice cycle also clears prior qualifying.

### Fixes from the 2026-10-16 race weekend

- Garage length and laps: LMU's `endEt` is a session time, not a length (a 3-minute practice ended at 210 s, so the
  garage said 4 MIN and ~3 laps). The garage now uses the time left, and the out lap of practice or qualifying is one
  of the laps the clock allows (only a race adds its formation lap). On the race grid `endEt` is the countdown to the
  start (64 s); in a later weekend's race garage LMU reported phase 9 then 0 with the clock at 0 and the end at 5 s
  (2026-10-17: the garage said `0 MIN · NO STOP PLANNED` and laps left ~1). The race length now comes from
  `GetSessionsInfoForEvent` (every garage listed PRACTICE 5, QUALIFYING 10, RACE 5 minutes), read in the garage once a
  minute behind its own replay check; without it the race garage shows `LAPS AT THE START`. Race laps left wait for
  the race clock, and qualifying laps left count from now while the player is in the pits (they held at 9 in the
  garage while the clock ran out).
- Behind a faster overall leader the race garage counts laps to the leader's flag, which falls after the clock. When
  the leader's pace is unknown it plans for the latest flag (one of the player's laps after the clock), so the fuel or
  VE is never a lap short; at worst it is a lap long.
- A puncture is not wear: the flat read 0% tread, its lap counted as 49% wear, and after the tyre change the fitted set
  read 0% at the finish. A drop of more than 15% in one lap now restarts the wear measurement.
- The estimated lap (session best plus the running delta) replaces `CURRENT VS BEST` in the race and `BEST POSSIBLE`
  in practice and qualifying; qualifying shows its laps left. Compounds read in their sidewall colours.
- The original running lap clock advanced between the game's 5 updates a second; this run-on is superseded by
  the 2026-10-18 practice fix below. A lost stream reconnects by itself.

Checks: `npm test` — 2,991 passed, 56 skipped; `npm run build` — passed without warnings. The skips are existing optional fixture tests.

Remaining live confirmation: record an online practice → qualifying → race event, a practice-only server and a single-player race-only start. Confirm navigation/phase timing, full-field qualifying finish flags, garage REST availability and formation behavior against these expectations. Missing or incomplete full-field finish data intentionally keeps qualifying provisional. Scoring-only fixtures cannot establish that every LMU server supplies those fields at the same moment.

### First practice fixes — 2026-10-18

The lap clock now displays received game time without speculative run-on, eliminating animation-induced
backward snaps. A game's positive completed flying-lap time remains valid even when the app missed
part of its trace or sampled a transient current-lap flag; incomplete traces still cannot supply deltas.
Before a matching session-best trace exists, the estimate may use the game's own projection, marked
with `~`. It never combines a personal best with a delta from a different lap. Out laps stay explicit.
Loading state takes precedence over a stale main-menu label, and a held garage frame is released on
session confirmation even when the scoring counter stops changing. Regression tests pass; the next
drive must confirm these changes. The brief freeze reported inside LMU remains unexplained.
See the [practice findings and next checks](LIVE_SESSION_VALIDATION.md#first-practice-findings--2026-10-18).

### Current practice delivery — 2026-10-18

The approved layout retains the hero and table. Only the latest completed lap has a second row of
large green/red sector deltas; raw sector times stay neutral. Comparisons and the `BEST` footer use
the actual session-best lap, not a composite of individual best sectors. The temporary preview was removed.

Clock smoothing is restored with monotonic, bounded corrections; this display clock never enters
calculations. The app computes continuous delta against a complete matching lap trace. When that trace
is unavailable, estimated lap uses the latest completed split rather than the game's potentially fixed
pace estimate. There is no `~` prefix; the source is disclosed in tooltip/metadata. Timing-line rollover
before the lap counter updates preserves the prior trace. Invalid lap durations can be recovered from
consecutive lap-start clocks, remain gray with computed provenance, and stay excluded from valid records.
Checks: 3,262 tests passed, 56 skipped; production build passed without warnings. See
[second practice and next-drive checks](LIVE_SESSION_VALIDATION.md#second-practice-and-approved-layout--2026-10-18).

### Third-practice follow-up — 2026-10-18

The reported fixed estimate remains pending live acceptance. Timing events now carry the complete
estimate/reference/delta/source together; all production timing views render that value directly.
Opt-in sidecars sample timing output and source clocks at most once a second for post-session
investigation. Invalid-lap text is removed; gray times remain. See the
[validation runbook](LIVE_SESSION_VALIDATION.md#third-practice-estimate-investigation--2026-10-18)
for evidence limits and next-drive checks.

### Elapsed-clock source correction — 2026-10-19

Bahrain diagnostics established that `timeIntoLap` is estimated progress, not elapsed time. The
running clock and reference traces now use `currentEt - lapStartEt`; out-laps use an observed
local departure clock. Stale anchors, garage returns and pause/crossing transitions are guarded.
A sanitized recorded-clock regression demonstrates changing gains/losses and estimates.
The driver confirmed the estimate looks good and the out-lap clock runs normally in a new session
on 2026-10-19. Quantified HUD accuracy and remaining edge-case/runbook checks are separate.
Verification at implementation: 3,267 tests passed, 56 skipped; build warning-free.
See [the runbook](LIVE_SESSION_VALIDATION.md).
