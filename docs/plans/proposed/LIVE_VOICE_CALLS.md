# Live voice calls (proposal)

Proposed 2026-10-26. Nothing here is built beyond the existing demo-only experiment
(`src/components/live/display/strategySpeech.ts`, `LiveStrategySpeech.tsx`, used by `DemoTyrePlanView`).

## Outcome

A spoken engineer that adds what the dashboard cannot say while the driver's eyes are on the road:
decisions (box, set the MFD), consequences (repair costs 30 s) and threats (a Hypercar arriving in
two corners). It never reads out values the driver can glance at, never talks in braking zones, and
stays silent for most of a clean stint. Audio only at first; every call is kept in a radio log shown
in the post-race debrief so the wording and timing can be refined.

## Driver decisions (2026-10-26)

- No Crew Chief: nothing else talks except LMU's own radio, which calls the lap time at the line.
  Both stay available: a setting says whether LMU's lap-time call is on, and the after-line wait
  follows it (see Timing).
- Chrome, with a natural-sounding voice (see Voice).
- Other cars: manufacturer, plus the class when it differs from the player's ("the Porsche", "Hyper Ferrari").
- Quiet by default: decisions and safety only.
- Strategy calls on a straight or just after the lap completes.
- Audio only to start: no call text on the dashboard (it is read from 50+ inches and already full).
- Every call saved as a radio log for the debrief.
- Wheel button: nice to have, after the iterations.
- Multiclass: the quiet rule below is fine (passes in a braking zone or corner, groups), both ways
  (faster car behind, slower car ahead when in the faster class). The blue flag and mirrors cover
  the rest, so no "Blue flag" call.
- Silence means on plan: no confirmation calls ("On target", "fuel is fine"), at any level.

## The driver's questions, answered unasked

The test for every call: does it answer a question the driver would otherwise ask, at the moment they
would ask it? Silence is an answer too: no call means "on plan", so nothing confirms routine values.

| Question while driving | Answer | When |
|---|---|---|
| Will my energy/fuel last to the stop or the flag? | Silence = yes; "Energy use too high. Save to hold lap 18." | After the line, when the plan breaks |
| When do I pit, and what do I set? | "Box in 2 laps." "Box this lap. Energy 62, new mediums." | After the line; last straight before pit entry |
| Hypercar: should I change the deployment? | Silence = keep it; "Set deployment 40." | After the line, when the advice changes |
| Is my pit menu right? | "Pit menu energy too low. Set 62." | When a stop is planned and the MFD is wrong |
| Puncture, wheel gone? | "Front right puncture. Box this lap." | At once |
| Where do I rejoin after the stop? | "Rejoin P6, behind the BMW, ahead of two Hypers." | With "Box in 2 laps" and on the box lap |
| Is the damage worth fixing? | "Repair 30 seconds, costs 12 to the flag. Stay out." | First straight after the damage read |
| Will my tyres last? | "Tyres won't reach the flag. Plan a change." | After the line, once |
| Wets or slicks? | "Box this lap for wets." "Box this lap for slicks." | When the track reaches Slightly wet / Dry |
| Is rain coming, is the track changing? | "Rain expected around lap 14." "Track now damp." | When it changes |
| What is that yellow, is my line blocked? | "Yellow, Turn 6. Car stopped, left, on your line." | Within ~15 s of reaching it |
| Who is coming, when do they pass? | "Hyper Ferrari behind. Passes in 6 seconds." | Before the pass |
| Am I catching / being caught? | "Gap to P4 1.2, closing." (normal level only) | After the line |
| How long is left? Time for another quali lap? | "Ten minutes." "Last lap." "Time for one more lap." | At those moments |
| Penalty? Limiter? | "Drive-through penalty." "Limiter!" | At once |
| Am I on pace? | Not spoken: the dashboard delta | — |

Load measured off the car (2026-10-28, quiet level; scripts in the gitignored `.tmp/voice-load/`):

| Source | Measured | Reading |
|---|---|---|
| Strategy calls, 9 race captures (audit snapshots replayed through `strategySpeech`) | 0-8 per race, at most 0.53 per lap | Fits, once the three fixes below are in |
| Normal level, same captures | + "ten minutes" and "last lap" every race | Fine for normal |
| Multiclass passes, 22 race replays (401 laps, every car at 5 Hz) | 1.8 passes per lap across both directions | Calling them all is far too chatty |
| Same, only passes in a braking zone or corner, or groups | ~1.0 per lap; ~0.9 for faster cars passing a GT3/LMP3 | The quiet traffic rule (below) |
| Groups of faster cars (2+ within 6 s), player in the slower class (12 races, 259 laps) | 57 groups, ~0.22 per lap; 84 % of all groups reach a braking zone or corner | One call per group |

Strategy fixes found by the replay of captures:
- "Save N %": the key changes at every snapshot and the targets reached 22-93 %, which cannot be
  saved. Key it by the planned stop, and speak it only when the saving is reachable (about 5-8 % or
  less).
- "Box this lap" repeats when the pit lap slips by one (Bahrain box at 16 then 17; Le Mans 11, 12,
  13). One call per planned stop, plus at most one repeat when the lap moves.
- "Over budget" fired with no stop after the last stop: drop it once no stop is left.

Traffic rule from the pass counts (driver, 2026-10-28: knowing a Hypercar will pass soon is worth
it; the voice adds to the blue flag and the mirrors):
- Quiet: a faster car whose pass lands in a braking zone or corner, and every group of faster cars
  ("Two Hypers behind") as one call. Measured ~0.9 per lap for a GT3/LMP3 (Daytona and Imola about 1,
  Road Atlanta 0.3); lone passes on a straight stay silent.
- Prototype drivers, same rule for the slower car ahead (decision of 2026-10-26, both ways). Le Mans in
  LMP2/Hyper measures 0.9-3 calls per lap: the first thing to move to normal if a drive feels busy.

How the passes were counted: interpolate other-class cars at the player's samples and keep those
within 30 m. The along-track sign is the offset dotted with the player's heading, and a sign flip is
a pass. "Braking" means the player's brake was above 15 % within 1 s; "corner" means below 80 % of
their top speed. These are rough: in step 4 the traffic index (`server/traffic/`) and the corner
list replace them.

## Feasibility (checked against the code and data, 2026-10-26)

### Ready: data and logic already in the live snapshot

| Calls | Source |
|---|---|
| Box in N laps, box this lap with amount and tyres, pit menu energy/fuel/ratio/tyres wrong, save to skip the stop, over budget | `strategy.resource.race` (`pitInLaps`, `neededAfterStop`, `sparePerLap`, `saving`), `strategy.pit.mfd`, `strategy.fuelRatio`; most already in `strategySpeech.ts` |
| Puncture / wheel lost; "Suspension damage" or "Aero damage", repair versus loss | `strategy.damage`: `wheel`, `suspension`, `body`, `partsDetached`, `repairSeconds`, `lossToFinish` |
| Tyres won't last | `strategy.tyres.coverage` |
| Hypercar deployment change | The deployment advice (`strategy.deployment`, built live and unverified: see the checklist in the [plans README](../README.md)); needs the first practice to confirm `motorMap`, `motorMapMax` and the battery charge decode |
| Penalty pending ("stop and go next stop") | `strategy.pit.penalties` (a count; the type is not known live) |
| Ten minutes, last lap, quali one more lap | session clock, `lapsLeft`, lap pace |
| Rain or dry expected around lap N, forecast changed | `strategy.forecast` |

### Small decode work: in shared memory, meaning known from rF2

| Data | Where | For |
|---|---|---|
| `speedLimiterActive` | player telemetry | "Rejoin P6, behind the BMW, ahead of two Hypers." | Joined to "Box in 2 laps" and the box-lap call: the field's race-time positions, plus the pit lane loss (`livePitLane.ts`) and the service time, give the place and the cars around the exit. Same-class place; other-class cars named only when they arrive at the exit within ~3 s. P5+ or no car within 3 s: the place alone | P2 |
| "Limiter!" |
| `motorMap`, `motorMapMax`, `batteryChargeFraction` / `soc` | player telemetry | "Set deployment 40." (shared with the dashboard advice) |
| `yellowFlagState`, `sectorFlag[3]` | scoring info | Sector yellow, "Green, sector 2", yellow far ahead |
| Every car's lap distance, class, vehicle, `inPits`, speed (`localVel`), `pathLateral`, `trackEdge`, `timeBehindNext` | scoring vehicles (only player, leader and class leader are decoded today) | Traffic and incidents |

Decoding the whole field at the scoring rate (~5 Hz, up to ~60 cars) is cheap; send only cars within
a few seconds of the player to the call engine.

### Possible, but needs data or a check first

| Item | What is missing | How to get it |
|---|---|---|
| On or off track (`pathLateral` vs `trackEdge`) | Checked online 2026-10-29: works with a ~3 m margin beyond `trackEdge` | Replays: 132 files have a local-yellow flag state (VCR type 10 value 1, meaning not fully established) and every car's x/z at 5 Hz; project onto the plugin track boundaries. Live: one private practice with AI |
| "On your line" | Player's `pathLateral` by lap distance; how approximate LMU's "center path" is | Record the player's `pathLateral` live; compare a few laps |
| Pass lands in a braking zone | Braking zones by lap distance | The player's own brake trace by lap distance from this session's laps (pedals + lap distance are both live); flat-out fallback on the first lap |
| Seconds to the pass | Closing rate | Lap distance rate of both cars; tune on replay positions (407 replays) |
| "Box this lap" on the last straight before pit entry | Pit entry position | Learn from the player's own `inPits` switch-on lap distance; until then, call after the line |
| Track condition wording | `mTrackGripLevel` meaning | Mostly mapped (grip 2 Medium, 3 High 2026-10-27, 4 Saturated 2026-10-29; wetness steps to labels); recorded in every capture; confirm grip 0, 1 and Slightly wet in races |
| Wet/dry crossover pace | Pace by wetness | Not needed for the first version (wetness steps decide); race reviews of changing-weather races collect it. History has 72 sessions with wet laps (6,245 laps on wets, all drivers), but rain only, not path wetness |
| Online cars | Checked 2026-10-29 (above): positions, speeds and gaps are clean; lateral needs a ~3 m off-track margin | One online race with diagnostics on: the `field`, `flags` and `player-limiter` diagnostics lines (from 2026-10-28) hold every car's raw position, speed, lateral/edge, gaps and flags for analysis after the event |
| Natural voice | Piper/Kokoro downloads, CPU while LMU runs | Step 1 listening test |
| "Turn 6" | No corner list on main | Seconds or "sector 2" until the corner-map work lands |
| Rivals' VE or fuel | The REST standings `veFraction` read 0 online, but LMU's UI shows other cars' VE. Shared memory has `mFuelFraction` per car (u8, 0-255, "fuel or battery left"; logged in the `field` diagnostics line from 2026-10-28). Settled 2026-10-29 (online GT3 VE race at Portimão): it is the fuel tank, not VE, and 0 for every remote car online, so it is no longer logged | Rivals' VE needs another source; none known online |

### Online race check (Portimão GT3, 2026-10-29)

One online race, 19 GT3 cars, 26 min, diagnostics on (`field` 5,281 lines, `flags` 86):

| Check | Result |
|---|---|
| Remote car positions | Clean: speed from position change matches the reported speed (median 0.4 %, p95 1.6 %, no jumps) |
| Gaps | The player's LMU gap matches the field's `timeBehindNext` (median 0.02 s, p95 0.37 s): the rejoin call and the closing call can use the field |
| Sector yellows | `sectorFlags` value 1 = yellow, 11 = green. Index 0, 1 and 2 are sectors 1, 2 and 3: each yellow's stopped car sits in that sector's lap distance. `yellowFlagState` stayed 0 (no full-course yellow in LMU) |
| Yellow vs stopped car | All 29 yellow episodes had a car stopped or crawling in the flagged sector. The game flags it about 1.2 s after the car slows (max 8 s), so a call can name where the car is (side, on or off track) with no gain in warning time |
| Yellow flicker | Episodes last 1-11 s and often go on and off within seconds. The incident call needs one key per car, not per flag change |
| Slow-car detector | A fixed 15 m/s threshold fires in Portimão's hairpins (field median 18 m/s at those spots): 82 hits, only 48 near a yellow, and the diagnostics burst ran 92 % of the race. Below 50 % of the field median speed at that lap distance: 47 hits, 36 near a yellow. The burst uses it from 2026-10-29, plus a car 3 m beyond the edge: 63 % of this race in burst, most of it from the 29 yellows themselves |
| Off track | `pathLateral` beyond `trackEdge` holds for 3.7 % of samples at speed (kerbs, track width); more than 2 m beyond it, 0.21 %. Real offs read 10-38 m beyond. Use a margin of about 3 m |
| Per-car flags | `flag` 6 (blue) on lapped cars works but needs no call; `underYellow` never set online. Both dropped from the log |
| Car names | The entry name is the livery: 3 of 19 resolved to a manufacturer (BMW, Lexus). `mVehFilename` per car is logged from 2026-10-29 to name the car next race |
| Lateral side | Positive `pathLateral` is right of the path, negative left (757 of 757 car pairs) |
| Rivals' fuel or VE | `mFuelFraction` is 0 for every remote car online. The player's value tracks fuel, not VE (79 → 7 while VE went 42 → 6). Not a source for step 7 |
| Grip level | `trackGripLevel` 4 all race, dry, 20-22 °C: the MFD showed Saturated (driver) |
| Not covered | Limiter call (no pit stop), multiclass traffic, wet conditions |

### Not possible with the data we have

- Predicting a crash before it happens; we only know it within about a second.
- Who caused an incident, or contact between other cars: no impact data for other cars we can trust
  (rF2 telemetry for remote cars is mostly empty online).
- Penalty type and reason live: shared memory gives a count only (the replay has the type, after the
  race).
- Rivals' tyres online. (Their VE or fuel may be readable: see below.)
- Exact debris location, or another driver's damage.

## What the other tools do

| Tool | Typical calls | Lesson for us |
|---|---|---|
| Crew Chief (rF2/LMU plugin) | Spotter "car left / right / three wide / clear"; "gap ahead 1.2, closing"; "faster car behind"; "box this lap"; fuel "about 4 laps of fuel left"; yellow sector ahead; blue flag; "5 minutes left", "last lap"; damage "you have front aero damage"; PB and lap times; penalties | Huge vocabulary, very configurable; drivers usually turn most of it off. Its proximity spotter is the reference and needs 20+ Hz car positions. |
| LMU Engineer (`lmu-engineer.com`, compared 2026-10-18) | Fuel/VE laps left, pit window, damage, weather, lap and battle calls | Same game data; its strength is strategy, its weakness is volume. |
| Real WEC radio | "Box, box, box"; "Hyper behind, will pass into turn 1"; "Gap to P5 1.8, they're on older tyres"; "Full course yellow, full course yellow"; "Repair is 25 seconds, we stay out"; "Last lap, bring it home" | Short, number-first, one fact per call, said on the straight, repeated only for box and safety. |

## Proposed calls

Each call speaks once per state change, has a priority and an expiry (a call that could not be said
before it expires is dropped, never said late). P1 interrupts anything; P2 waits for its slot (see
Timing); P3 also counts against the lap budget. The default "quiet" level speaks P1 and P2; "normal"
adds P3.

### Strategy and resources (data exists; current experiment covers most)

| Call | Trigger | P |
|---|---|---|
| "Box this lap. Energy 62 percent, new mediums." | Plan pit lap is the current lap; on the last straight before pit entry | P1 |
| "Box in 2 laps." / "Box next lap." | Plan pit lap changes to 2 / 1 laps away | P2 |
| "Pit menu energy too low. Set 62." | MFD read below the needed amount while a stop is planned | P2 |
| "Fuel ratio too low. Set 0.88." | MFD ratio below recommendation | P2 |
| "Save 3 percent to skip the stop." | Saving target becomes reachable | P3 |
| "Energy use too high. Save to hold lap 18." | Spare per lap below zero for 2 laps running | P3 |
| "Set deployment 40." | Hypercar deployment advice moves to a new target (race and practice) | P2 |
| "Stop and go. No service on this stop." | Penalty outstanding while in the pit lane | P1 |
| "Limiter!" | Player enters the pit lane (`inPits` turns on) with `speedLimiterActive` off; once per entry | P1 |

### Damage and tyres (data exists, via REST condition reads)

| Call | Trigger | P |
|---|---|---|
| "Front left puncture. Box this lap." | Wheel `flat` or `detached` (shared memory, already decoded in `rf2Decode.ts`); once per wheel | P1 |
| "Suspension damage. Repair 30 seconds, costs 12 to the flag. Stay out." | Significant damage with repair and projected loss known | P2 |
| "Tyres won't reach the flag. Plan a change." | Projected tread below the floor | P3 |

Repair seconds are LMU's estimate and the pace loss is our median measure; the call says which wins.
Pit repair benefit remains an inference limitation (work queue).

Deployment call (driver, 2026-10-27). It speaks the dashboard's advice, never its own logic: one call
when the advice moves to a new target, which can be anywhere on the lap (the advice follows every reading). The
setting is said as the game's display shows it, in kW from the plugin's `deploymentKw` ("Set
deployment 40."); without plugin kW it says the game's map position ("Set deployment map 5.").
- Once per target: no reminder if the driver does not change it (the dashboard keeps showing it), and
  nothing while holding: no "hold" confirmation and no time to the edge (it stays on screen).
- A new target only comes after the previous change has settled (one lap of track), so a normal stint
  has a call every 8-30 laps; a change to the same value is never repeated.
- The call is P2 and waits for its slot; the advice comes a lap before the edge, so a short wait is fine.
- Silent in the pit lane and for the lap after it (no measurement then anyway) and in qualifying.
- Expiry: 30 s; if the advice changed or was withdrawn by then, the call is dropped.

### Weather and track condition (data exists: `LiveWeather`, `LiveForecast`, `track-surface` log)

The car's display shows the track condition, but a call when it changes is easier than reading it.
Calls look ahead: what the driver cannot see yet. Rain starting or stopping and the sky are visible
from the car, so they get no call (driver, 2026-10-27). Each call is said once per change, after the
line or on a straight:

| Change | Call | Trigger | P |
|---|---|---|---|
| Track grip (dry) | "Grip now high." / "Grip dropping, now medium." | `mTrackGripLevel` steps, held ~20 s; dry track only | P2 |
| Track wetness | "Track now damp." / "Track now wet." / "Track drying, now damp." | Path wetness enters another label band | P2 |
| Forecast | "Forecast changed. Rain likely, 60 percent." | The forecast nodes change mid-session (rain chance or sky) | P2 |
| Forecast | "Rain expected around lap 14." / "Dry expected around lap 20." | Next forecast change becomes known or moves by a lap; again ~5 min before | P2 |

Labels, from the 2026-10-27 sessions (see the grip mapping notes):
- Grip `mTrackGripLevel`: 0 Green, 1 Low, 2 Medium, 3 High, 4 Saturated (2, 3 and 4 confirmed by the
  driver, 4 on 2026-10-29; 0 and 1 likely). The display shows grip only when the track is dry.
- Wetness (`avgPathWetness`, stepped): 0.05 Damp, 0.125 Slightly wet (to confirm), 0.4 Wet,
  0.6 Very wet, 1.0 Extremely wet. A wet track shows this label instead of grip, so the calls do too.
- Forecast timing is approximate: offline the nodes are spaced evenly over the session (online their
  times are null) and rain came about 2.5 min before the predicted node at Silverstone. Say "expected
  around", never an exact minute; give the lap, not the clock.
- Forecast calls respect the minimum-rain-chance proposal (a 5 % node is not "rain").
- Tyre choice for the change ("Box this lap for wets") comes from the strategy engine:
  `strategy.crossover` ([implemented rule](../../CODE_MAP.md#live-race-dashboard)). First-version P1 calls:
  "Box this lap for wets" when MFD matches, "Box for wets. Set new wets" when it does not, and
  "Box this lap for slicks" on the dry return. For `when: planned-stop`, merge into that stop's call rather
  than claiming the change is this lap.

### Flags, penalties and session clock (fields laid out in `rf2Layout.ts`, need decoding)

| Call | Trigger | P |
|---|---|---|
| "Green, sector 2." | That sector's `sectorFlag` clears after a yellow call | P2 |
| "Yellow, sector 2." | `sectorFlag` ahead of the player turns yellow | P1 |
| "Drive-through penalty." | `penalties` increases | P2 |
| "Ten minutes." / "Last lap." | Race clock crossings and flag projection | P3 |
| Quali: "Time for one more lap." / "No time for another lap." | Remaining time versus current pace at the line | P2 |

### Incident ahead (our own detection, richer than the game's flag)

The game only says which sector is yellow. Shared-memory scoring (about 5 Hz) gives every car's
`lapDist`, `pathLateral`, `trackEdge`, `pos`, `localVel`, `ori` and `inPits`
(`VEHICLE_SCORING` in `rf2Layout.ts`; decoded for the diagnostics field log), so we can find the incident ourselves, often
before the yellow appears or the car is in sight. Crashes cannot be predicted; this is about knowing
where and what as soon as it happens.

Only incidents that affect the player get a full call. Relevance is the time until the player reaches
the incident at their own pace (lap distance ahead, wrapping over the line), and whether it is on track:

| Time to reach | On track / on your line | Off track |
|---|---|---|
| Under ~15 s | Full call, P1 | Short call, P2 ("car off right, clear") |
| ~15-60 s | "Yellow far ahead, sector 3", P3, once | Silent |
| Over ~60 s, or behind the player | Silent | Silent |

A far incident still there when the player gets within ~15 s gets its full call then, so nothing is
lost by staying quiet early. The game's sector yellow alone (no slow car found) is treated the same way
by the sector's distance.

| Call | Detection | P |
|---|---|---|
| "Yellow, Turn 6. Car stopped on track, left, on your line." | Car below ~40 % of the reference speed at its lap distance (or stopped), not in pits, within ~15 s ahead | P1 |
| "Yellow, Turn 1. Two cars off right. Track clear." | Several slow cars within ~150 m, all more than ~3 m beyond `trackEdge`, within ~15 s | P2 |
| "Slow car ahead, 6 seconds. Off your line, right." | Same, before any yellow, within ~10 s | P1 |
| "Car rejoining, Turn 9, careful." | A car that was off track moves back inside the edge, within ~15 s ahead | P1 |
| "Yellow far ahead, sector 3." | Incident or sector yellow 15-60 s ahead | P3 |
| "Turn 6 clear." | Only after an "on track" call, once the car has moved off or away before the player arrives | P2 |

- Where: lap distance to the incident, said as seconds at the player's pace; "Turn 6" once a corner
  list by lap distance is on main.
- On or off track: `|pathLateral|` against `trackEdge` on that side; later the plugin boundaries
  (white line) for a sharper test.
- Your line: the player's own `pathLateral` by lap distance from their last clean laps, compared in
  the same frame as the stopped car's; within ~2.5 m is "on your line", otherwise "off your line, left
  / right". No geometry needed.
- Multiple cars: cluster slow cars by lap distance; say the count.
- Exclusions: pit lane, garage stall, grid/formation. LMU has local yellows only (no full course
  yellow or safety car, driver 2026-10-26); if a patch adds one, add its call and compare with nearby
  cars then, since everyone is slow. Online cars are interpolated: require ~1 s of
  slow readings before calling, still well before the driver arrives.
- Level: not Crew Chief's volume (no call for every far yellow), but when the incident is close and
  affects the driver, the same kind of call Crew Chief makes: where, which side, on track or off,
  how many cars (driver, 2026-10-28).
- Validation: the diagnostics `field` line (from 2026-10-28) writes every car at the scoring rate
  (~5 Hz) from a flag change, a slow car (below half the field's speed at that spot) or a car more
  than 3 m off track until 20 s after, with position, speed, lateral
  and edge and the sector flags, so each online yellow can be replayed against the
  detector after the event. Replays (`server/traffic/`, every car at 5 Hz) cover past races.

### Traffic and battle (needs `timeBehindNext`, positions, class and speed for every car)

| Call | Trigger | P |
|---|---|---|
| "Hyper Ferrari behind, catching. Passes in 6 seconds." | Faster-class car within ~4 s and closing, pass in a braking zone or corner (~0.9 per lap measured with the groups) | P2 |
| "Two Hypers behind." | Group of faster cars arriving together (2+ within 6 s), one call for the group (~0.2 per lap measured) | P2 |
| "GT3 Aston ahead, 3 seconds." (prototype drivers) | Slower class ahead within reach before the next braking zone | P3 |
| "The Porsche behind, 0.6, closing." | Same-class car within 1 s and gaining over two laps | P3 |
| "Gap to P4 1.2, closing." | Once per lap after the line, only while the gap changes by more than 0.2 s/lap | P3 |

Naming (driver, 2026-10-26): the manufacturer, from the existing `resolveCarManufacturer`
(`shared/domain/vehicleMapping.ts`), with the class word ("Hyper", "P2", "P3", "GT3") only when it
differs from the player's: "the Ferrari behind", "Hyper Porsche behind" for a GT3 driver. A small
spoken-name map shortens the long ones ("Mercedes-AMG" → "Mercedes", "Aston Martin" → "Aston",
"Isotta Fraschini" → "Isotta"; driver, 2026-10-26).
When the brand does not tell cars apart (LMP2 is all Oreca; two Ferraris together), say the position
instead ("P5 behind"). Unknown cars fall back to the class, then to "car".

"Passes in 6 seconds" can later become "in 2 corners" once a corner list by lap distance is on main
(corner-map worktree or the reference lap's corner analysis).

### Not proposed for now

- Left/right proximity spotter. No Crew Chief, so nothing covers it, but it needs low-latency
  positions and a late call is worse than none. Optional step 6 after measuring call latency.
- Lap times, sector times, PB announcements, tyre temperatures: the dashboard and LMU's radio cover them.
- Race start "Green, green": LMU's radio says it. Track limits: the HUD marker covers it (driver, 2026-10-26).
- "Car ahead pitting": not for now.
- Coaching calls: rejected on 2026-10-18.
- "Energy to spare, push": dropped for now (driver, 2026-10-28).
- Stop check ("Tyres not changed"): the stop always does what the MFD says (driver, 2026-10-28).
- "Penalty served": the game makes it clear already (driver, 2026-10-28).
- Rival and undercut calls: a future phase (step 7), not rejected. They need rivals' VE or fuel
  ("P4 on 12 % energy, stops this lap"); `mFuelFraction` reads 0 for remote cars online (2026-10-29).

## Call catalogue and phrasing

The tables above are the proposal. Once built, one catalogue in code is the single source for every
call: `shared/domain/live/calls/catalogue.ts`, one entry per call:

- `id` and family (strategy, damage, flags, incident, traffic, clock)
- verbosity level (quiet / normal) and priority (P1-P3)
- rule: the trigger in one sentence, plus its thresholds as named constants
- template with typed slots, e.g. `Yellow, {where}. {count} {state}, {side}, {line}.`
- slot (when to say it), expiry, repeat rule (what change allows the call again)
- one or two example renderings

Tests check every entry: the examples render from the template, at most ~8 words (P1 incident calls
up to ~12), only words from the shared vocabulary, a rule and expiry present. The demo's call scenarios
and Settings' "Play sample" read the examples, and the debrief's radio log shows the call `id` next to
the text, so a call to refine is traced to its rule. Adding a call means adding one entry; this
document then keeps only the phrasing rules below.

Phrasing rules (consistent wording):
- Order: what, where, side, line, action. "Yellow, Turn 6. Car stopped, left, on your line."
- One verb for one action: "Box" (never "pit"), "Save", "Set", "Stay out", "Careful".
- Places: "Turn 6" when the corner list exists, else "sector 2" or "{n} seconds"; never metres.
- Sides: "left" / "right" in the direction of travel; lines: "on your line" / "off your line".
- Cars: manufacturer, class word first only when it differs ("Hyper Ferrari"); position when the
  brand does not tell them apart.
- Numbers: gaps and seconds to one decimal under 10 ("one point two"), whole numbers above; energy in
  percent, fuel in litres, fuel ratio to two decimals, deployment as the kW number or "map" plus its
  position; no units the driver can infer.
- Repeats: only P1 may double a word ("Box, box").
- No filler ("okay", "so", "mate") and no opinions; the dashboard keeps the numbers that need reading.

## Timing: not distracting

1. One fact per call, number first, at most about 8 words; P1 may repeat once ("Box, box").
2. Two slots for P2/P3: just after the lap completes (about 3 s after the line while the LMU
   lap-time call setting is on, at once when it is off; then on the first straight), or any straight (1 s flat out on the pedals; later the
   corner list gives the next straight ahead of time). Strategy calls prefer the after-the-line slot.
3. Budget: at most 2 P3 calls per lap and 1 per straight; the rest drop.
4. Hysteresis: a call key repeats only after its state really changes (existing 60 s guard plus
   per-call thresholds, e.g. gaps move 0.2 s/lap).
5. Expiry: each call has a deadline (box this lap = before pit entry; traffic = before the pass).
6. Silence where it matters: no P2/P3 on the out-lap, the first lap of the race or in qualifying
   flying laps except time-left calls.
7. A short earcon before P1 calls only.
8. Audio only: nothing is added to the dashboard. Voice on/off and options live in Settings; the
   demo's control row stays demo-only.
9. Browser audio unlock: Chrome plays audio only after a click in the page. A click earlier in the same
   page counts (the game-start switch to `#/live` keeps the page), so most sessions need nothing. After
   a reload with the voice on, the dashboard shows one "Click to enable radio" notice in the session
   bar's slot until clicked; the radio log records calls dropped while locked.

## Voice

Chrome's local Windows voices (David, Zira) are robotic; its "Google UK English" voices are better but
online. For a natural voice, synthesize on the server with a local neural model and play the audio
in the page:
- Piper (`en_GB` voices): very light on CPU, fast enough for short calls, good quality.
- Kokoro (82M, ONNX): more natural, heavier; check its latency and CPU while LMU runs.
Step 1 includes a listening test of both against Chrome's voices in the demo, on the same sample
calls. Fixed phrases (earcon, "Box, box") are cached; calls with numbers are synthesized when made.
Model and voice files are downloads: ask before fetching them.

## Radio log for the debrief

Every call the engine produces is stored, spoken or not: session and capture run, game time, lap,
lap distance, key, priority, text, and outcome (spoken, dropped for budget, expired, replaced). The
debrief of the reconciled session shows it as a radio timeline by lap, so wording, timing and
too-chatty laps can be refined after each race. Dropped calls stay in the log; they show what the
budget is hiding.

## Architecture

- `shared/domain/live/liveCalls.ts`: pure and deterministic. Snapshot, timing, traffic and the
  previous call state in, candidate calls out (`key`, `text`, priority, expiry). Generalizes
  `strategySpeech`.
- The scheduler runs on the server in the live service (slots, budget, hysteresis, expiry), so the log
  is complete even if the page fails, and sends a `call` stream event. The page plays it and reports
  back spoken or failed.
- Server: decode flags, gaps and per-car speed into `LiveVehicleReading`; spoken car names in
  `shared/domain/`; radio log table in SQLite next to the live capture stores, linked through the
  existing XML reconciliation.
- TTS: server-side Piper or Kokoro behind one small interface; the page only plays audio.
- Settings: voice on/off, voice, volume, rate, verbosity (quiet / normal), per-family toggles,
  LMU lap-time call on/off (on by default),
  "Play sample" for each family.

## Iterations

Each step ends with demo scenarios that play the calls, a replay of real `.live.duckdb` captures
through `liveCalls` that counts calls per lap and per slot, and one drive in the car.

1. Infrastructure: settings, server scheduler, slots, budget, radio log, voice listening test; move the
   existing strategy calls into the real dashboard behind the setting. Measure calls per lap on the
   Le Mans and COTA captures. Fix the three strategy keys found off the car (save by stop with a
   reachable cutoff, one box repeat, no over-budget after the last stop).
2. Strategy and damage wording, the Hypercar deployment call once its live advice is built, plus the
   radio log in the debrief.
3. Flags, penalties and the session clock: decode the fields, check against an online race. Then the
   incident detector, tested on replays with crashes before any drive.
4. Multiclass traffic with car names: faster class closing with time to the pass. Then the rejoin
   call, which needs the same field data (positions and race times of every car).
5. Same-class battle and gaps, only if steps 1-4 stay quiet enough.
6. Optional: left/right spotter if latency allows; wheel button (below).
7. Future: rival resource and undercut. Find an online source for rivals' VE or fuel first
   (`mFuelFraction` reads 0 for remote cars), then rivals' expected pit laps and undercut/overcut calls.
8. Later phase: engine and brake temperatures ("Water temp high", "Front brakes hot"), from the
   `overheating`, `engineWaterTemp`, `engineOilTemp` and `brakeTemp` fields laid out in `rf2Layout.ts`;
   per-car thresholds from recordings first (driver, 2026-10-28).

Targets to check in step 1: no P2/P3 inside a braking zone, P1 starts within 1 s, a clean race stint
averages under one call per lap at the quiet level, traffic aside; a multiclass race in the slower
class adds ~0.9 traffic calls per lap (2026-10-28 measure), so about 1.5 in all.

## Wheel button: repeat and questions (nice to have, after the iterations)

The app has no controller input today; the Simagic plugin only talks to SimPro (presets), not buttons.

Reading the button. LMU keeps the focus, so the browser Gamepad API is a poor fit (Chromium stops
gamepad updates for unfocused windows; to confirm). Read it on the server instead, in a small worker
through koffi (already a dependency):
- Windows `joyGetPosEx` (winmm): simplest, no new dependency, but only buttons 1-32. Check the wanted
  button's number in `joy.cpl` first.
- SDL joystick API with background events allowed: any button count and hot-plug; adds SDL3.dll.
The button must be left unbound in LMU. Settings gets "Press the button" to learn device + button,
stored by device GUID.

Gestures, all deterministic: short press repeats the last call ("Nothing new" when there is none);
double press gives a status from the current plan ("Box lap 18. Energy 4 laps. P4, gap 1.2."); hold
is push-to-talk for a question from a fixed list (fuel/energy left, laps to the stop, tyres, damage
and repair, gaps, who is behind, time left, weather, "what's the plan"), recognized locally with
whisper.cpp only while held. AI may only reword an answer, never compute it (AGENTS rule C).

## Still open

- Voice: Piper or Kokoro, after the step 1 listening test.
- Track condition labels: confirm grip 0, 1 and Slightly wet in the next wet race (2, 3, 4 and the
  other wetness steps are mapped).
- Later, for the wheel button: which button, and whether to add push-to-talk.
