# Live race dashboard proposal

Status: analysis and proposed implementation; standalone mock placement previews
created under `docs/prototypes/live-dashboard/`. No live application changes shipped.
Updated: 2026-10-15. Evidence: shared memory and the safe REST reads validated live (offline
practice, damage test, online LMP3 qualifying and race; see [LIVE_DATA_SOURCES.md](LIVE_DATA_SOURCES.md));
the garage reads, wet weather, cockpit readability and runtime performance are not yet validated.

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

The standalone [prototype](../prototypes/live-dashboard/README.md) is the reference for
layout and wording; its README records each decision. It makes no game/API calls and is not
in the production entry. The [driver-centered review](../prototypes/live-dashboard/DRIVER_REVIEW.md)
holds the earlier critique. Current state, all at 2560 x 1440, read in glances:

- **Every driving view:** session bar (session, track and class, laps left in races, PR,
  one weather slot), the 20-second full-width pedal trace (curves and grid only), no
  paragraph text; labels about 48 px, supporting readouts 80-96 px, primary values larger.
- **Practice:** last lap largest, session best and best possible, a current-lap sector row
  followed by three completed laps and a `BEST` row of best sectors; no fuel figures.
  S1 and S2 fill from the game's cumulative timing fields at each crossing (S2 = cumulative S2 minus S1),
  independently of whether a session best exists, beside the lap number and the running lap clock. Uncrossed
  sectors remain unknown; at the finish the row becomes the top completed lap (S3 = lap time minus cumulative S2)
  and a new current row starts. Out laps have no current splits.
- **Qualifying:** `PUSH LAP · VS BEST` with the live delta, next attempt and tyre surface
  temperature, then the `LAST LAP` row; no fuel or VE, no valid flag (the HUD has it).
- **Race, pit coming:** `PIT IN 2 LAPS` (then `PIT THIS LAP`), `VE · MFD` or `FUEL · MFD`
  and `TYRES · MFD` (`NEW MEDIUM`, `NEW WET`, `NO CHANGE`, compound coloured, forecast note
  under it); current lap vs best with sector deltas, then `LAST LAP` with real sectors.
- **Race, mid-stint (accepted):** `VE / LAP · LAST 3` with spare per lap, `PIT IN 6 LAPS`, `TYRES TO
  PIT OK`, rain lap when forecast. **Sprint:** `SPARE / LAP` with `NO PIT STOP`, resource at
  the finish, `TYRES TO FINISH OK`.
- **Damage:** sector deltas stay; the last-lap row becomes `PACE LOSS · MEASURED`, `SINCE IMPACT`,
  `TO FINISH`, `REPAIR TIME`; the resource can read `NO CHANGE`. **Flat or detached
  wheel:** `PIT NOW`.
- **Lifecycle:** game closed, in menu, garage between sessions (`VE NEEDED` / `FUEL NEEDED`
  for the next session), race starting (plan and pedal check), finished (class place,
  battle at the flag, pace, debrief pointer).

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

Race keeps two timing rows: current lap against best with completed sector deltas, then
`LAST LAP` with its real S1/S2/S3 times. Practice uses the history table, qualifying the
`LAST LAP` row. S1/S2/S3 in a row come from that same lap; do not mix current-lap and
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
| Physical fuel and capacity | `tools/telemetry-recorder/Program.cs` and `Rf2Structs.cs` | Correct units/values during live driving and refuelling, across classes |
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
   If the finish is reachable with reserve, show the spare per lap and `NO PIT STOP`.
7. Compute the required departure resource target for the next planned stint or finish.
   If it exceeds capacity, schedule another stop rather than silently clipping the target.
   Recalculate after refuelling, condition changes and significant consumption changes.

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
decodes with `DataView` at the offsets in `tools/telemetry-recorder/Rf2Structs.cs`. To keep
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
Polling is deliberate: Windows has no notice for a named mapping being created, and process
start events (WMI) cost more or need admin rights. The app's own open handle keeps the
mapping alive after LMU exits, so game exit is detected when the plugin's counters stand
still for a few seconds and then one read of the REST port is refused (a paused game keeps
answering); the service then closes its handle and returns to the slow check. The page itself then
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
after reconnect. The browser never polls: it holds one stream and the server pushes state
changes, pedal batches only while driving, and a heartbeat every ~15 s so a dead connection
shows as disconnected. `EventSource` retries by itself only while the server is unreachable. Do not query growing DuckDB files to supply the live pedal trace.

**Effect on the existing app.** `/api/status` and `/api/scan/status` stay plain GETs; the
analysis app polls scan progress once a second only while work runs and stops when idle,
so moving them to a stream saves nothing, and race data must not reach app tabs. One gap:
the server now starts a scan by itself after a session ends, and an idle app tab would not
notice. Add a small app-wide event stream (`scan started`, `scan finished`), separate from
the live stream but on the same transport code: `scan started` restarts the existing
progress polling and `scan finished` reloads the data. Replacing the progress polling with
it later is optional.

Clear learned state on session/car/layout changes, clock regression, restart or
return to garage as appropriate. Distinguish game paused from disconnected using
both game state and receipt freshness. Unknown fields stay absent, never zero-filled.
The post-session cache and parser remain authoritative for historical analysis.

## Delivery and acceptance

1. **Data feasibility:** largely done 2026-10-15 (shared memory and the safe REST reads,
   live). Left: the garage reads (MFD, repair options, tyre sets), the rest of the damage
   test, the race-weekend reads and wet weather; see the next test session in
   [LIVE_DATA_SOURCES.md](LIVE_DATA_SOURCES.md). Never call garage endpoints during replay playback.
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

Automated cases should cover refills, partial laps, capacity overflow, lap-number
conventions, timed finishes, mandatory rules, resource changes, missing data,
reconnects, service overlap and repair break-even. Follow repository tests/build
requirements; run endpoint benchmarks before/after API performance changes.
GT3 (offline) and LMP3 (online) are validated live; Hypercar and LMP2 checks remain.
No all-class success claim until each supported resource model is verified.

This proposal expands the post-session-only operating context in `PRODUCT.md`.
Update product/design documentation when implementing the agreed live surface;
the existing analysis pages retain their established behavior and scale.
