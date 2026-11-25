# Live voice calls (proposal)

Proposed 2026-10-26, reviewed 2026-11-21. Steps 1b, 2, 3 and 4 built 2026-11-22, in the browser voice:
- Calls: `shared/domain/live/radio/liveCalls.ts` (`liveCalls`: every strategy, damage and deployment call that applies,
  most important first, keyed per stop) on `racePlanMode.ts` (the race plan's leading advice, shared with the
  dashboard). The scheduler says the first one not yet said, so a call heard lets the next one through. Box countdown
  ("Box in 2 laps.", "Box next lap.", then the whole stop as P1), pit menu fixes (energy, fuel ratio, tyres), damage
  with its repair and loss ("Stay out." only when the repair costs more), the deployment target in races and practice
  (P2, waits 30 s), and on the race's first lap only P1 calls. No over-budget call on the box lap.
- Scheduler: `server/live/radio/radioScheduler.ts` in the live service, on the game clock of the pedal samples: P1 at
  once; P2/P3 in a slot (1 s flat out), nothing but an incident in the first 4 s after the line, one call per slot, 2 P3 a lap, dropped after 120 s
  or when the call no longer applies, replaced by a newer one. A P2/P3 key is said once a run; a P1 may come back
  after 60 s (a stop not taken). Reset on a new run or session.
- Log: every proposed call in SQLite `live_radio_calls` (`server/core/live/dbRadioLogStore.ts`) with the recording,
  game time, lap and outcome; the page reports `spoken`, `interrupted`, `locked`, `failed` or `late`
  (`POST /api/live/calls/:id/outcome`).
- Timing fixes (2026-11-23, from reading the pipeline; to check in the next race's log):
  - A P2/P3 keeps waiting for its slot while the page is still saying a call (the scheduler knows from the outcomes;
    a page that never answers holds it 20 s at most). Sent at once it queued on the page and was said up to 15 s
    later, wherever the car was by then.
  - A call said at once (a P1, traffic, a clear) carries how long it stays worth saying (`waitSeconds`: an incident
    until a second before the car is reached, traffic until a second before the pass); the others keep 30 s (P1) and
    15 s. Past it the page drops the call and reports `late`.
  - Calls no page could say (`no-client`: none connected, or reloading; `locked`: not clicked yet) are no longer
    spent for the run: they are proposed again, while they still apply, when a page connects and when a page says
    its radio can speak (`POST /api/live/calls/ready`, sent when the voice is on and the page was clicked).
- Page: SSE `call` events played by `src/components/live/display/radioPlayer.ts` (a P1 cuts a P2/P3 and waits for a
  P1, the rest wait their turn) through `LiveRadio.tsx`, in the browser voice (`voice/browserVoice.ts`); Settings has
  "Radio voice calls" (on by default) and the volume. The demo keeps its own controls
  (`demo/LiveStrategySpeech.tsx`).
- Player fixes from the Sebring log (2026-11-23): of eight calls spoken right after a cut none reported its end, six
  held every later call for 10 s to 5 minutes, and a P1 could cut a P1 ("Car stopped on track" lost to "Yellow,
  sector 3."). Now a call the browser has not started in 2 s, or not ended in 3 s plus 200 ms a character, is
  reported `failed` and the next one goes on; the call after a cut is spoken 50 ms later; a P1 waits for a P1. The
  scheduler reads the page's outcome: a call `failed` or `interrupted` is proposed once more a run while it still
  applies. Cause, reproduced silently in Chrome (2026-11-23): the races run in Chrome, this PC has no British Windows
  voice, so `en-GB` gives the online "Google UK English Female", and that voice drops a call spoken in the same task
  as `cancel()` with no event at all (6 of 6; spoken 1 to 250 ms later, 14 of 14 played). The Windows voices do not
  have the fault. A call said in the browser voice sends its text to Google's speech service and needs the network; the prepared clips
  (below) need neither. Check the log after the next race: no `interrupted` P1, no `failed` rows. The qualifying clock call is judged on what was left at the line (`LiveSessionInfo.playerLapStartSeconds`):
  judged on the clock now it came twice, the first a lap early.
- Debrief: a live-recorded session's calls by lap with what became of each (`GET /api/session/:id/radio`,
  `SessionRadioCard.tsx`), through the recordings matched to the session.
- Checked off the car on five races with stops or sprints (2026-11-22, `.tmp/voice-sim/scheduler.ts`), step 2 wording:
  COTA 10-20 1 call (was 18 with a 60 s repeat guard), COTA 10-21 x2 none (sprints), Le Mans 10-22 7 (puncture x2,
  countdown, menu fix, save to skip, box), Le Mans 10-23 5 (countdown, menu fix, box, box again when not taken).

- Field (steps 3 and 4): the scoring buffer's every car (`decodeField` in `server/live/rf2Decode.ts`,
  `LiveFieldReading` in `shared/types/liveField.ts`) and the sector flags feed `FieldWatch`
  (`shared/domain/live/radio/field/`) at about 5 Hz, green flag running only. `FieldTrack` keeps each car's progress
  speed over 1 s, the field's speed profile (20 m bins) and the player's line, lap time and sectors.
  - Incidents (P1, never repeated): a car slower than 3 m/s or half the field's speed there for 1.5 s (4.5 s for a
    car that froze and jumped on), within 15 s at the player's pace; cars within 150 m are one call, a spot stays
    one incident for 60 s. "Turn 6. Car stopped, left. In your path." ("In your path." only when it is; Sebring race
    2026-11-25: "on track" and "clear of your line" made it 3.6-3.8 s), "Yellow, " in front when the game's
    sector yellow covers it, "Turn 6 clear." on the same approach. A car more than 3 m off: "Turn 6. Car off right."
    (P2); back on slowly within 6 s ahead after 2 s off: "Turn 6. Car rejoining, careful." (not also said as stopped). A spot is said once:
    a car said off is not said again as it comes back on track or rejoins (Le Mans 2026-11-24: one car said three
    times in 4 s), and a call is made only if it ends a second before the car is reached, at 16 characters a second
    ("Michelin Chicane. Slow car on track, right, clear of your line." took 3.9 s and ended after the pass). The game's sector yellow
    with no slow car to explain it after 2 s: "Yellow, sector 2.", green once it holds 10 s. Turns are named from
    the layout's placed turns (`server/live/radio/layoutTurns.ts`), else the sector.
  - Traffic (said at once, not slotted): a faster class closing within 3 s with the pass landing in a corner
    ("Hyper Porsche behind.", "Two Hypers behind.") as a P2, one call per train (the cars it named keep its key
    until they pass; Sebring race 2026-11-25: 6 s out with "catching. Passes in 6 seconds." came too soon and ran
    3.5 s, a train of P2s got 7 calls in 23 s, and 4 s out was still too far), nothing behind while the player
    is under half the field's usual speed there (crawling with a puncture or to the pits: being lapped is expected;
    the same race said 20 in 23 s after a lap 3 puncture), a slower class ahead
    as a P3 inside the lap budget; none on the race's first lap. Names from `resolveVehicle` + the manufacturer,
    the class word only when it differs from the player's.
  - Rejoin, on the box call: "Rejoin P4. Behind the Genesis. Ahead of two GT3s." from the stored pit lane loss plus
    the planned service, the gaps from progress times the player's median lap.
  - Clock and penalties: "Ten minutes to go.", "Last lap.", in qualifying "One more lap after this." or "Last lap, push." (was "No time for another
    lap."), and "Penalty pending." (P1, once per penalty count).
- Checked off the car on five online races' diagnostics sidecars (2026-11-22, `.tmp/voice-sim/field.ts`): Portimão
  1.83 calls a lap, Silverstone 10-29 1.31, Daytona 4.1 and 5.2 (GT3s ahead about 1.4 a lap, 44-58 more dropped
  by the budget); "Rejoin P11." heard at Daytona 10-16. The parked car at Daytona T12 is said once, not every lap.

- Voice test (step 1a, started 2026-11-22): the demo's radio sampler plays every call in the browser voice or Kokoro
  (British male voices George, Lewis, Daniel, Fable; pace 0.9-1.3x) so the driver picks the voice and pace first
  (driver: a male voice like a race engineer; pick voice and pace before any speed work). Kokoro q8 on the CPU
  takes 3.5 s for "Box in 2 laps." in the browser on one thread, 2.4 s with threads (cross-origin isolated), 1.6 s
  natively in Node (3.4 s for a 4 s call): every option misses the 1 s P1 target, so live use needs the clips and
  cache below.
- Driver picked George at 1.2x with pauses cut to 80 ms (2026-11-22); synthesis during a race is out (3-10 s a call,
  CPU the game needs). Prepared clips instead: `tools/dev/prepareVoiceClips.ts` synthesizes, with the game closed,
  every demo call (`demoRadio.ts`, 35) whole and in its sentences (`callSentences`), 66 clips, into
  `public/voice/george/` (not committed) with a manifest; clips already made are kept, unused ones removed. The demo
  sampler plays them whole or joined by sentence with a 0-120 ms join gap (`voice/clipVoice.ts`): no synthesis, no
  CPU. Decided (driver, 2026-11-22): join at full stops only. Joined at commas too, each piece kept a sentence's own
  end tone and sounded off against the whole call; by sentence is fine. So the live library is sentence variants:
  turn sentences ("Turn 6.", "Yellow, Turn 6.") plus a shared set for the rest of each call.
- George on the live dashboard (driver, 2026-11-23: the demo was to find the voice, the races use it). The page's
  `RadioPlayer` plays a call from the clips, joined by sentence with a 50 ms gap, at the Settings volume on the radio
  output, when every sentence of the call has a clip; else the whole call is said in the browser voice, on the same
  time limits. `shared/domain/live/radio/radioSentences.ts` lists every sentence a clip can cover, most useful first,
  and `prepareVoiceClips.ts` makes them (the manifest is written as it goes, so a stopped run keeps its clips). A
  sentence with a number or a name needs one clip per value, so each value is a sentence of its own and never paired
  with another: the stop's load and its tyres ("Energy 38 percent. No tyre change."), a car ahead and its seconds
  ("GT3 Lexus ahead. 3 seconds."); pit laps 1-200, percents, litres, fuel ratios 0.50-1.50 and 37 turn names x 3
  remain the bulk: 1,396 sentences (2,793 while pairs had a clip each). No browser voice is the aim (driver,
  2026-11-23), so the calls with open-ended values were reworded into short sentences of their own (driver's choices):
  fuel in whole litres rounded up ("Fuel 46 litres. New medium.", "Set 46."); the rejoin as "Rejoin P4. Behind the
  Genesis. Ahead of two GT3s."; the damage as "Repair 30 seconds. Costs 45 seconds to the flag.", to the nearest
  5 s up to 5 minutes, "over 5 minutes" past that; cars off and rejoining with the turn first ("Turn 2. Two cars
  off right.", "Turn 6. Car rejoining, careful."), as the stopped-car call. Only a value past the library's ranges
  still falls to the browser voice: more than six cars in a group, a pit lap past 200, a load past 120 litres, a
  class place past 60. `.tmp/voice-cover/cover.ts` counts the logged calls the library covers. A wording change in
  `liveCalls` or `radio/field/` is copied to `radioSentences` and the clips prepared again with the game closed.
- First online weekend with the radio (Sebring School GT3, 2026-11-22, browser voice): practice 53 calls in ~9 laps
  (~6 a lap, above the 1-2.6 simulated: clears 1-2 s after their incident, green calls replaced or expired, the first
  10 locked until the page was clicked); qualifying 9, of which all 6 incident calls were false: it was LMU's private
  qualifying (20 drivers lapping in the results, none on the player's track, no game yellows); race 20 calls, right,
  until lap 16, where the dev server serving the dashboard stopped with the app's browser pane. Fixed: "sector 1."
  without a yellow now starts with a capital. Decided (driver): no field calls in a private session. `GET /rest/sessions` answered
  `SESSSET_private_qual` "On" in that qualifying (16 ms, on track), so the poller reads it once a session
  (`parsePrivateSessions`) and `FieldWatch` stays silent in private qualifying or practice; qualifying not yet read
  counts as private. Slow cars are called within 8 s (stopped cars 15 s): the second race called slow cars 11-15 s
  ahead that cleared a second later. Still open: the practice load.
- Radio output (driver, 2026-11-22): Settings → Live dashboard → "Radio output" picks the Windows default or a device
  (`LiveSettings.voiceOutput`, a browser device id, null for the default). The Web Audio voices (George's clips,
  Kokoro) play there through `AudioContext.setSinkId` (Chrome/Edge); an unplugged device falls back to the default.
  The browser's own voice (`speechSynthesis`) cannot be routed and stays on the default. Chrome lists the devices
  only after a one-time microphone permission ("Show device names"; nothing is recorded); "Test output" beeps
  on the chosen device.
Still to build: the live yellow test with the voice on (thresholds, lagging cars, the far yellow), step 5 and the
neural voice (step 1a).

## Outcome

A spoken engineer that adds what the dashboard cannot say while the driver's eyes are on the road:
decisions (box, set the MFD), consequences (repair costs 30 s) and threats (a Hypercar arriving in
two corners). It never reads out values the driver can glance at, never talks in braking zones, and
stays silent for most of a clean stint. Audio only at first; every call is kept in a radio log shown
in the post-race debrief so the wording and timing can be refined.

## Driver decisions (2026-10-26)

- No Crew Chief: nothing else talks except LMU's own radio, which calls the lap time at the line.
  Nothing but an incident is said in the first 4 s after the line, so the engineer never talks over it (driver,
  2026-11-24: the slot right at the line, chosen 2026-11-22, conflicted with the game's lap time; 2 s was still too short). A P1 such as "Box
  this lap." follows once the 4 s end, a P2/P3 waits for a straight.
- Chrome, with a natural-sounding voice (see Voice).
- Other cars: manufacturer, plus the class when it differs from the player's ("the Porsche", "Hyper Ferrari").
- Quiet by default: decisions and safety only.
- Strategy calls on a straight or just after the lap completes.
- Audio only to start: no call text on the dashboard (it is read from 50+ inches and already full).
- Every call saved as a radio log for the debrief.
- Wheel button: nice to have, after the iterations.
- Multiclass: in quiet mode, faster cars behind whose pass lands in a braking zone or corner, and
  groups of faster cars; slower cars ahead when in the faster class move to normal (P3, updated
  2026-11-21 to keep quiet mode calmer at Le Mans). The blue flag and mirrors cover the rest, so no
  "Blue flag" call.
- Silence means on plan: no confirmation calls ("On target", "fuel is fine"), at any level.
- Race start (2026-11-21): the start is often chaotic, so the incident calls stay on lap 1 to say where the
  cars are. One call per pile-up, the nearest first, side and line before the turn or the car name.

## The driver's questions, answered unasked

The test for every call: does it answer a question the driver would otherwise ask, at the moment they
would ask it? Silence is an answer too: no call means "on plan", so nothing confirms routine values.

| Question while driving | Answer | When |
|---|---|---|
| Will my energy/fuel last to the stop or the flag? | Silence = yes; "Energy use too high. Save to pit on lap 18." | After the line, when the plan breaks |
| When do I pit, and what do I set? | "Box in 2 laps." "Box this lap. Energy 62 percent. New medium." | After the line; last straight before pit entry |
| Hypercar: should I change the deployment? | Silence = keep it; "Set deployment 40." | Next straight, when the advice changes |
| Is my pit menu right? | "Pit menu energy too low. Set 62." | When a stop is planned and the MFD is wrong |
| Puncture, wheel gone? | "Front right puncture. Box this lap." | At once |
| Where do I rejoin after the stop? | "Rejoin P6, behind the BMW, ahead of two Hypers." | With "Box in 2 laps" and on the box lap |
| Is the damage worth fixing? | "Repair 30 seconds. Costs 12 seconds to the flag. Stay out." | First straight after the damage read |
| Will my tyres last? | "Tyres won't reach the flag. Plan a change." | After the line, once |
| Wets or slicks? | "Box this lap for wets." "Box this lap for slicks." | When the track reaches Slightly wet / Dry |
| Is rain coming, is the track changing? | "Rain expected around lap 14." "Track now damp." | When it changes |
| What is that yellow, is my line blocked? | "Yellow, Turn 6. Car stopped, left. In your path." | Within ~15 s of reaching it |
| Who is coming, when do they pass? | "Hyper Ferrari behind." | Before the pass |
| Am I catching / being caught? | "Gap to P4 1.2, closing." (normal level only) | After the line |
| How long is left? Time for another quali lap? | "Ten minutes to go." "Last lap." "One more lap after this." | At those moments |
| Penalty? | "Penalty pending." ("Drive-through" / "Stop and go" if type is verified) | At once |
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
- Normal (P3): prototype drivers calling a slower car ahead before a braking zone (updated
  2026-11-21; Le Mans in LMP2/Hyper measures 0.9-3 calls per lap, too busy for quiet mode).

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
| Hypercar deployment change | The deployment advice (`strategy.deployment`, built 2026-10-27; the `motorMap` and battery charge decode was confirmed in the Spa practice). Still open in the [plans README](../README.md): that the MFD shows the plugin's kW for each map, which the call says |
| Penalty pending ("Penalty. No service on this stop.") | `strategy.pit.penalties` (count only; check whether `strategy.pit.penaltySeconds` `0` vs `> 0` reliably separates drive-through from stop-and-go) |
| Ten minutes, last lap, quali one more lap | session clock, `lapsLeft`, lap pace |
| Rain or dry expected around lap N, forecast changed | `strategy.forecast` |

### Small decode work: in shared memory, meaning known from rF2

| Data | Where | For |
|---|---|---|
| `yellowFlagState`, `sectorFlag[3]` | scoring info | Sector yellow, "Green, sector 2", yellow far ahead |
| Every car's lap distance, class, vehicle, `inPits`, speed (`localVel`), `pathLateral`, `trackEdge`, `timeBehindNext` | scoring vehicles (only player, leader and class leader are decoded today) | Traffic and incidents |

Decoding the whole field at the scoring rate (~5 Hz, up to ~60 cars) is cheap; send only cars within
a few seconds of the player to the call engine.

### Possible, but needs data or a check first

| Item | What is missing | How to get it |
|---|---|---|
| On or off track (`pathLateral` vs `trackEdge`) | Checked online 2026-10-29: works with a ~3 m margin beyond `trackEdge` | Replays: 132 files have a local-yellow flag state (VCR type 10 value 1, meaning not fully established) and every car's x/z at 5 Hz; project onto the plugin track boundaries. Live: one private practice with AI |
| "On your line" | Player's `pathLateral` by lap distance; how approximate LMU's "center path" is | Record the player's `pathLateral` live; compare a few laps |
| Pass lands in a braking zone | Braking zones by lap distance | The player's own brake trace by lap distance from this session's laps (pedals + lap distance are both live); `PlacedTurn` segments (then flat-out fallback) on the first lap |
| Seconds to the pass | Closing rate | Lap distance rate of both cars; tune on replay positions (407 replays) |
| "Box this lap" on the last straight before pit entry | Pit entry position | Learn from the player's own `inPits` switch-on lap distance; until then, call after the line |
| Track condition wording | Grip 0 and 1 | Mapped: grip 2 Medium, 3 High (2026-10-27), 4 Saturated (2026-10-29); every wetness step, Slightly wet 0.125 confirmed at Daytona (2026-11-05). Grip 0 and 1 (likely Green and Low) wait for a session that shows them; recorded in every capture |
| Wet/dry crossover pace | Pace by wetness | Not needed for the first version (wetness steps decide); race reviews of changing-weather races collect it. History has 72 sessions with wet laps (6,245 laps on wets, all drivers), but rain only, not path wetness |
| Online cars | Done: four online races checked (above); positions, speeds and gaps are clean, lateral needs a ~3 m off-track margin | The diagnostics sidecars of 2026-10-28 to 2026-11-05 keep every car's raw position, speed, lateral/edge, gaps and flags for testing the calls off the car |
| Natural voice | Piper/Kokoro downloads, CPU/latency in a browser Web Worker (or server fallback) while LMU runs, plus pre-generated fixed clips | Step 1a listening test |
| "Turn 6" | Done: main places each layout's official turns on the track (`shared/domain/circuitTurns/placeTurns.ts`, names from `describeTurn` in `turnLabel.ts`) | Map the incident's or the pass's lap distance to the placed turn; "sector 2" or seconds where a layout has no turn list |
| Rivals' VE or fuel | The REST standings `veFraction` read 0 online, but LMU's UI shows other cars' VE. Shared memory has `mFuelFraction` per car (u8, 0-255, "fuel or battery left"; logged in the `field` diagnostics line 2026-10-28 to 10-29). Settled 2026-10-29 (online GT3 VE race at Portimão): it is the fuel tank, not VE, and 0 for every remote car online, so it is no longer logged | Rivals' VE needs another source; none known online |

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
| Not covered | Pit stop, multiclass traffic, wet conditions |

### Online race check (Silverstone International GT3, 2026-10-29)

One online race, 30 GT3 cars, 35 min, no pit stop, dry, diagnostics on (`field` 8,800 lines, `flags` 121):

| Check | Result |
|---|---|
| Car names | `mVehFilename` is the livery file id (`23_26_THOR64591293`), not the car: only the 4 "Custom Team" files (`397_25_BMW`) name a make. The data package's vehicle list (`vehicleIds`, looked up in `server/plugins/dataPlugin.ts`) maps all 23 files in the race to a model, 2026 liveries included: "the Ferrari behind" is possible from the file id |
| Incident burst | 83 % of the race in burst: a driverless car (`control` 3, left after a disconnect) sat 33 m off track at 3,093 m from the start, and every update re-triggered it. From 2026-10-29 only a car starting an incident triggers, and cars in an incident stay out of the speed profile: 61 % on this race, 62 % on Portimão (unchanged there), the rest from the race's 104 sector flag changes |
| Driverless cars | A parked car with `control` 3 stays in the field with `finishStatus` 0. The incident call must say it once, not every lap |
| Grip level | `trackGripLevel` 3 in practice, 4 from qualifying on (20-23 °C, dry): matches the rubber building up |
| Not covered | Pit entry (no pit stop), multiclass traffic, wet conditions |

### Online race check (Daytona Hypercar in a Hypercar + GT3 field, 2026-11-05)

Two online races, 53 and 62 cars, 56 and 64 min, two stops each, the player in a Hypercar (`.tmp/voice-load/passDiag.mjs`):

| Check | Result |
|---|---|
| Passes on slower cars | 2.3-2.4 GT3s passed per lap (69 and 81 calls once passes within 4 s are grouped): one call per pass is too many. Passes below 75 % of the player's top speed (braking zones and corners): 0.9-1.3 per lap; below 60 %: 0.4-0.9 per lap |
| Seconds to the pass | Gap over closing speed, taken 3 s before: median error 0.1-0.4 s; 6 s before: 0.6-1.2 s; 10 s before: 1.8-4.1 s. p90 is 5-8 s at every lead (a car pitting or the player lifting), so say seconds only up to ~6 s and drop the call when the closing rate collapses |
| Car names | All 73 car files (34 Hypercar, 39 GT3) map to a model through the installed data package |
| Pit entry | `inPits` turned on at 5,507 m on all four stops (lap 5,729 m): "box this lap" can be placed from the player's own first stop at a layout |
| Incident burst | 91-92 % of each race in burst: with 53-62 cars there is always an incident somewhere (~310-380 flag changes and ~700-800 car incidents per race). About 14 MB of log an hour |
| Rejoin | Every car's position at 5 Hz around both pit exits is in the logs, to test the rejoin prediction off the car once it is built |

The exploration log answered what it was added for (flags, online car data, names, passes, pit entry) and was removed on 2026-11-05 with the decode that fed it (every car's row, the sector flags, the player's LMU gaps); the voice calls decode what they use. The sidecars of 2026-10-28 to 2026-11-05 keep the data for testing the calls off the car. Grip and wetness come from the capture's `track-surface` rows.

### Call load simulation (Sebring School and Barcelona, 2026-11-21)

The planned calls replayed off the car on the two latest races (`.tmp/voice-sim/sim.ts`, local): strategy from the
diagnostics `strategy` records (every 10 s) through `strategySpeech` with the three strategy fixes below, clock and
weather from the recording, incidents and traffic from the replay (every car at 5 Hz, placed on the player's lap
distance). Off track is judged by distance from the player's own line (no track edges), and delivery follows Timing
(P1 at once; P2/P3 on the after-line or straight slots, dropped when stale; at most 2 P3 per lap).

| | Sebring School, GT3 only (21 cars, 20 laps, 20 min) | Barcelona, player in LMP3 among 24 LMP2 (45 cars, 21 laps, 30 min) |
|---|---|---|
| Quiet (P1 + P2) | 19 calls, 0.95 per lap; lap 1: 5, last lap: 4; 9 laps silent | 26 calls, 1.24 per lap; lap 1: 6; 8 laps silent |
| Normal (+ P3) | 36 calls, 1.8 per lap | 54 calls, 2.6 per lap |
| Car stopped on track within 15 s (P1) | 9 | 10 |
| Car off / turn clear (P2) | 10 (1 dropped) | 8 (4 dropped) |
| Traffic (P2) | none (one class) | 26 LMP2 passes, 11 calls (6 groups); 8 said, 3 expired with no straight before the pass |
| Yellow far ahead (P3) | 15 | 27 said, 7 dropped |
| Strategy, damage, weather | silent: sprints with no stop, dry, steady grip | silent, same |
| Clock (P3) | ten minutes, last lap | last lap (ten minutes dropped) |

The results files log 119 and 353 contacts, so these were busy online races. A race with a stop adds about 3-4
calls per stop (box in 2 laps, box next lap, box this lap, rejoin).

What it changes:
- Lagging cars: 20-22 slow spells a race recovered without losing time (some are network freezes, one
  confirmed by the driver at Sebring 2026-11-17). Each would be a false "car stopped". The simulation kept
  a slow car only when it covered under 60 % of the field's distance over the next 10 s, which a live
  detector cannot wait for: see Lagging cars below.
- Traffic needs its own slot: waiting for a straight let 3 of 11 calls expire before the pass. A traffic call is
  said on the last straight before the pass, or at once when no straight comes first.
- "Yellow far ahead" is the busiest call at the normal level (15-27 a race): see Still open.
- "Turn clear" only when the incident is still ahead of the player (within ~15 s) as it clears; said after
  every recovery, it doubled the P2 incident calls.

### Not possible with the data we have

- Predicting a crash before it happens; we only know it within about a second.
- Who caused an incident, or contact between other cars: no impact data for other cars we can trust
  (rF2 telemetry for remote cars is mostly empty online).
- Penalty type and reason live: shared memory gives a count only (the replay has the type, after the
  race).
- Rivals' tyres online, and rivals' VE or fuel (`mFuelFraction` reads 0 for remote cars online).
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
| "Box this lap. Energy 62 percent. New medium." | Plan pit lap is the current lap; on the last straight before pit entry | P1 |
| "Box in 2 laps." / "Box next lap." | Plan pit lap changes to 2 / 1 laps away | P2 |
| "Pit menu energy too low. Set 62." | MFD read below the needed amount while a stop is planned | P2 |
| "Fuel ratio too low. Set 0.88." | MFD ratio below recommendation | P2 |
| "Save 3 percent to skip the stop." | Saving target becomes reachable | P3 |
| "Energy use too high. Save to pit on lap 18." | Spare per lap below zero for 2 laps running | P3 |
| "Set deployment 40." | Hypercar deployment advice moves to a new target (race and practice) | P2 |
| "Penalty. No service on this stop." | Penalty outstanding while in the pit lane ("Stop and go" if penalty type is verified) | P1 |
| "Rejoin P6, behind the BMW, ahead of two Hypers." | Joined to "Box in 2 laps" and the box-lap call: the field's race-time positions, plus the pit lane loss (`livePitLane.ts`) and the service time, give the place and the cars around the exit. Same-class place; other-class cars named only when they arrive at the exit within ~3 s. P5+ or no car within 3 s: the place alone | P2 |

### Damage and tyres (data exists, via REST condition reads)

| Call | Trigger | P |
|---|---|---|
| "Front left puncture. Box this lap." | Wheel `flat` or `detached` (shared memory, already decoded in `rf2Decode.ts`); once per wheel | P1 |
| "Suspension damage. Repair 30 seconds. Costs 12 seconds to the flag. Stay out." | Significant damage with repair and projected loss known | P2 |
| "Damage. Stop 85 seconds." | Significant damage with a repair, before the pace loss is known (two laps after the impact): the game's stop estimate as the MFD is set, once per repair figure (Sebring race 2026-11-25: 87 s known 10 s after the crash, the pits 3 minutes later, nothing said) | P2 |
| "Tyres won't reach the flag. Plan a change." | Projected tread below the floor | P3 |

Repair seconds are LMU's estimate and the pace loss is our median measure; the call says which wins.
How much damage: `getVehicleCondition` gives `suspensionDamage` per corner (0-1, 0 undamaged; 0.72 after a
front hit) and `tireCondition` (0-1, 0 flat), which can be said as percents, but `vehicleDamage` (body
and aero) goes above 1 after big hits (1.38 seen), so the body is said as light or heavy. The repair
time (`pitstop-estimate.damage`: 30 s after a side hit, 113-130 s with suspension damage) is the more
useful number. Still unchecked with LMU open: the pace cost of each damage level and parts falling off
(deferred by the driver on 2026-10-16); check it before a call promises a number.
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

### Weather and track condition (data exists: `LiveScoringReading`, `LiveForecast`, `track-surface` log)

The car's display shows the track condition, but a call when it changes is easier than reading it.
Calls look ahead: what the driver cannot see yet. Rain starting or stopping and the sky are visible
from the car, so they get no call (driver, 2026-10-27). The call engine reads raw `avgPathWetness`
and `trackGripLevel` from `LiveScoringReading` (not `LiveWeather`, which omits `trackGripLevel` and
quantizes wetness to 0.05 steps, rounding 0.125). Each call is said once per change, after the line
or on a straight:

| Change | Call | Trigger | P |
|---|---|---|---|
| Track grip (dry) | "Grip now high." / "Grip dropping, now medium." | `mTrackGripLevel` steps, held ~20 s; dry track only | P2 |
| Track wetness | "Track now damp." / "Track now wet." / "Track drying, now damp." | Path wetness enters another label band | P2 |
| Forecast | "Forecast changed. Rain likely, 60 percent." | The forecast nodes change mid-session (rain chance or sky) | P2 |
| Forecast | "Rain expected around lap 14." / "Dry expected around lap 20." | Next forecast change becomes known or moves by a lap; again ~5 min before | P2 |

Labels, from the 2026-10-27 sessions (see the grip mapping notes):
- Grip `mTrackGripLevel`: 0 Green, 1 Low, 2 Medium, 3 High, 4 Saturated (2, 3 and 4 confirmed by the
  driver, 4 on 2026-10-29; 0 and 1 likely). The display shows grip only when the track is dry.
- Wetness (`avgPathWetness`, stepped): 0.05 Damp, 0.125 Slightly wet (confirmed Daytona 2026-11-05), 0.4 Wet,
  0.6 Very wet, 1.0 Extremely wet. A wet track shows this label instead of grip, so the calls do too.
- Forecast timing is approximate: offline the nodes are spaced evenly over the session (online their
  times are null) and rain came about 2.5 min before the predicted node at Silverstone. Say "expected
  around", never an exact minute; give the lap, not the clock.
- Forecast calls respect a minimum-rain-chance cutoff (a 5 % node is not "rain"; `liveForecast.ts`
  currently checks `rainChance > 0`, so add the threshold there or in the call engine).
- Tyre choice for the change ("Box this lap for wets") comes from the strategy engine:
  `strategy.crossover` ([implemented rule](../../CODE_MAP.md#live-race-dashboard)). First-version P1 calls:
  "Box this lap for wets" when MFD matches, "Box for wets. Set new wets" when it does not, and
  "Box this lap for slicks" on the dry return. Unify `when: now` with `strategy.resource.race`
  (`pitInLaps === 0`) under a single `box-now` call so a wet crossover on the planned pit lap never
  fires two P1 box calls. For `when: planned-stop`, merge into that stop's call rather than claiming
  the change is this lap.

### Flags, penalties and session clock (fields laid out in `rf2Layout.ts`, need decoding)

| Call | Trigger | P |
|---|---|---|
| "Green, sector 2." | That sector's `sectorFlag` clears after a yellow call | P2 |
| "Yellow, sector 2." | `sectorFlag` ahead of the player turns yellow | P1 |
| "Penalty pending." | `penalties` increases (name "Drive-through" / "Stop and go" only if `penaltySeconds` reliably distinguishes them) | P1 |
| "Ten minutes to go." / "Last lap." | Race clock crossings and flag projection | P3 |
| Quali: "One more lap after this." / "Last lap, push." | Remaining time versus current pace at the line; kept through a pit request (a misclick at Portimão 2026-11-25 lost it), not in the pit lane ("No time for another lap." was too flat, driver 2026-11-25) | P2 |

### Incident ahead (our own detection, richer than the game's flag)

The game only says which sector is yellow. Shared-memory scoring (about 5 Hz) gives every car's
`lapDist`, `pathLateral`, `trackEdge`, `pos`, `localVel`, `ori` and `inPits`
(`VEHICLE_SCORING` in `rf2Layout.ts`; decoded for the diagnostics field log), so we can find the incident ourselves, often
before the yellow appears or the car is in sight. Crashes cannot be predicted; this is about knowing
where and what as soon as it happens.

Only incidents that affect the player get a full call. Relevance is the time until the player reaches
the incident at their own pace (lap distance ahead, wrapping over the line), and whether it is on track:

| Time to reach | On track / in your path | Off track |
|---|---|---|
| Under ~15 s | Full call, P1 | Short call, P2 ("car off right, clear") |
| ~15-60 s | "Yellow far ahead, sector 3", P3, once | Silent |
| Over ~60 s, or behind the player | Silent | Silent |

A far incident still there when the player gets within ~15 s gets its full call then, so nothing is
lost by staying quiet early. The game's sector yellow alone (no slow car found) is treated the same way
by the sector's distance.

| Call | Detection | P |
|---|---|---|
| "Yellow, Turn 6. Car stopped, left. In your path." | Car below ~40-50 % of the reference speed at its lap distance (or stopped), not in pits, within ~15 s ahead | P1 |
| "Yellow, Turn 1. Two cars off right. Track clear." | Several slow cars within ~150 m, all more than ~3 m beyond `trackEdge`, within ~15 s | P2 |
| "Slow car ahead, 6 seconds. Off your line, right." | Same, before any yellow, within ~10 s | P1 |
| "Turn 9. Car rejoining, careful." | A car that was off track moves back inside the edge, within ~15 s ahead | P1 |
| "Yellow far ahead, sector 3." | Incident or sector yellow 15-60 s ahead | P3 |
| "Turn 6 clear." | Only after an "on track" call, once the car has moved off or away before the player arrives | P2 |

- Where: lap distance to the incident, said as seconds at the player's pace; "Turn 6" from the official
  turns placed on the layout (`circuitTurns/placeTurns.ts`).
- On or off track: `|pathLateral|` against `trackEdge` on that side; later the plugin boundaries
  (white line) for a sharper test.
- Your line: the player's own `pathLateral` by lap distance from their last clean laps, compared in
  the same frame as the stopped car's; within ~2.5 m adds "In your path.", otherwise nothing
  (the side is said anyway). No geometry needed.
- Multiple cars: cluster slow cars by lap distance; say the count. At the start, one call per pile-up
  and the nearest first: a newer, closer incident replaces one still waiting (driver, 2026-11-21).
- Exclusions: pit lane, garage stall, grid/formation. LMU has local yellows only (no full course
  yellow or safety car, driver 2026-10-26); if a patch adds one, add its call and compare with nearby
  cars then, since everyone is slow. Online cars are interpolated: require ~1 s of
  slow readings before calling, still well before the driver arrives. Lagging cars freeze and then
  jump on, often for longer than that (below).
- Lagging cars (25 online race replays, 2026-11-21, `.tmp/voice-sim/freeze.ts`, local): 174 freezes, where a
  car drops from racing speed to a stall within ~0.1 s, holds, then reappears 100-360 m on. They are rare and
  stick to a few cars: 29 cars of about 900, one car 98 times in one race, 13 of 25 races with none. A
  freeze holds 2.7 s at the median (90 % under 6.6 s, up to 30 s); 76 % last 1 s or more, 41 % 3 s or more,
  so no wait short enough to keep the warning filters them. Starting point for live: keep the ~1.5 s
  confirmation; drop a waiting call when the car jumps back; and mark a car that froze and jumped back as
  lagging for the session, so its next stall waits until it falls behind the field's progress (about 3 s).
  That leaves the first freeze of each lagging car: 20 of the 29 held 1.5 s or more, under one false
  call a race. Replays record remote cars as the game received them; live shared memory may smooth or
  extrapolate differently, so the step 3 live yellow test checks these numbers (driver, 2026-11-21).
- Level: not Crew Chief's volume (no call for every far yellow), but when the incident is close and
  affects the driver, the same kind of call Crew Chief makes: where, which side, on track or off,
  how many cars (driver, 2026-10-28).
- Validation: the diagnostics sidecars of 2026-10-28 to 2026-11-05 (`field` lines: every car at ~5 Hz
  around each incident, with position, speed, lateral and edge, and the sector flags) replay each online
  yellow against the detector off the car. Replays (`server/traffic/`, every car at 5 Hz) cover past races.

### Traffic and battle (needs `timeBehindNext`, positions, class and speed for every car)

| Call | Trigger | P |
|---|---|---|
| "Hyper Ferrari behind." | Faster-class car within ~4 s and closing, pass within 3 s in a braking zone or corner (~0.9 per lap measured with the groups) | P2 |
| "Two Hypers behind." | Group of faster cars arriving together (2+ within 6 s), one call for the group (~0.2 per lap measured) | P2 |
| "GT3 Aston ahead. 3 seconds." (prototype drivers) | Slower class ahead within 3 s before the next braking zone (Daytona: 2.3 such passes per lap in all, 0.9-1.3 in braking zones and corners) | P3 |
| "The Porsche behind, 0.6, closing." | Same-class car within 1 s and gaining over two laps | P3 |
| "Gap to P4 1.2, closing." | Once per lap after the line, only while the gap changes by more than 0.2 s/lap | P3 |

Naming (driver, 2026-10-26): the manufacturer, with the class word ("Hyper", "P2", "P3", "GT3") only when it
differs from the player's: "the Ferrari behind", "Hyper Porsche behind" for a GT3 driver. A small
spoken-name map shortens the long ones ("Mercedes-AMG" → "Mercedes", "Aston Martin" → "Aston",
"Isotta Fraschini" → "Isotta"; driver, 2026-10-26). The entry name is the livery and names only a few
cars (3 of 19 at Portimão), so the model comes from the car's `mVehFilename` through the data package's
`vehicleIds` (`server/plugins/dataPlugin.ts`; 73 of 73 files at Daytona), then `resolveCarManufacturer`
(`shared/domain/vehicleMapping.ts`) on that model; without a match, the class word alone.
When the brand does not tell cars apart (LMP2 is all Oreca; two Ferraris together), say the position
instead ("P5 behind"). Unknown cars fall back to the class, then to "car".

The call behind names no time: said up to 3 s before the pass, the call itself is the timing.

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
- "Limiter!" on pit entry: dropped (driver, 2026-10-29); its `player-limiter` log line went with it.
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
- Order: what, where, side, line, action. "Yellow, Turn 6. Car stopped, left. In your path."
- One verb for one action: "Box" (never "pit"), "Save", "Set", "Stay out", "Careful".
- Places: "Turn 6" from the placed official turns, else "sector 2" or "{n} seconds"; never metres.
- Sides: "left" / "right" in the direction of travel; lines: "In your path." only (driver, 2026-11-22: "on/off your line" sounded alike and was easy to miss; 2026-11-25: "clear of your line" dropped for length).
- Cars: manufacturer, class word first only when it differs ("Hyper Ferrari"); position when the
  brand does not tell them apart.
- Numbers: gaps and seconds to one decimal under 10 ("one point two"), whole numbers above; energy in
  percent, fuel in litres, fuel ratio to two decimals, deployment as the kW number or "map" plus its
  position; no units the driver can infer.
- Repeats: only P1 may double a word ("Box, box").
- No filler ("okay", "so", "mate") and no opinions; the dashboard keeps the numbers that need reading.

## Timing: not distracting

1. One fact per call, number first, at most about 8 words; P1 may repeat once ("Box, box").
2. One slot for P2/P3: any straight (1 s flat out on the pedals; the placed turns give the next straight ahead of
   time), never in the first 4 s after the line, where the game gives the lap time (driver, 2026-11-24).
3. Budget: at most 2 P3 calls per lap and 1 per straight; the rest drop.
4. Hysteresis: a call key repeats only after its state really changes (existing 60 s guard plus
   per-call thresholds, e.g. gaps move 0.2 s/lap).
5. Expiry: each call has a deadline (box this lap = before pit entry; traffic = before the pass). Traffic
   does not wait for the usual slots: it takes the last straight before the pass, or speaks at once when
   no straight comes first (simulation, 2026-11-21).
6. Silence where it matters: no strategy, deployment or battle P2/P3 calls on the out-lap, the first
   lap of the race or in qualifying flying laps except time-left calls. P2 incident and flag calls
   ("Two cars off right. Track clear.", "Green, sector 2.") still speak on lap 1.
7. Lifecycle and reset guards: speak only when `lifecycle === 'driving'`, `inRealtime`, and not in
   formation, countdown or pause (`gamePhase` 3, 4, 9). Reset scheduler state and hysteresis on
   session change, restart or reconnect so old keys never leak into a new run.
8. Optional, not planned for now (driver, 2026-11-22): a short earcon before P1 calls only.
9. Audio only: nothing is added to the dashboard. Voice on/off and options live in Settings; the
   demo's control row stays demo-only.
10. Browser playback, unlock and tabs: play through the Web Audio API (`AudioContext`) so P1 calls
    can interrupt an active clip immediately, mix the P1 earcon cleanly, and detect lock state via
    `audioContext.state === 'running'`. Chrome plays audio only after a click in the page; a click
    earlier in the same page counts (the game-start switch to `#/live` keeps the page), so most
    sessions need nothing. After a reload with the voice on, the dashboard shows one "Click to
    enable radio" notice in the session bar's slot until clicked; the radio log records calls
    dropped while locked. The driver keeps at most one dashboard tab open (2026-11-22), so every
    connected page plays; when none is connected, log `no-client` and skip synthesis.

## Voice

Chrome's local Windows voices (David, Zira) are robotic; its "Google UK English" voices are better but
online and can stall after long idle periods. For a natural offline voice, run local neural TTS in a
**browser Web Worker** by default (keeping the backend free of audio plumbing and native binaries),
with Chrome's `speechSynthesis` as fallback and a **server worker** fallback only if WASM latency or
CPU overhead hurts LMU frame times or reload startup:
- Piper (`en_GB` voices, WASM SIMD): very light on CPU, ~100-300 ms on short calls, good quality, safe
  for the `< 1 s` P1 budget.
- Kokoro (82M, ONNX): more natural, heavier; test CPU-only (avoid WebGPU while LMU runs so synthesis
  never competes with the sim for GPU frame time).

To minimize live synthesis while driving, use three layers:
1. **Pre-generated fixed clips (~35-40 calls)**: zero-variable and small-set calls — punctures (8),
   crossover and box countdown, track grip/wetness steps, sector flags, penalties, tyres, and clock
   calls — play in **0 ms** with **0 % CPU** (and can even be generated once offline with Kokoro).
2. **Persistent cache by `(voice, rate, text)`**: store synthesized clips in browser OPFS/Cache (or
   disk if server-side) so repeated parameterized calls ("Set deployment 40.", "Two Hypers behind.")
   synthesize only once ever.
3. **Sentence-boundary split (never word/number stitching)**: do not stitch individual words or
   numbers (it breaks neural prosody), but for dynamic P1 calls like "Box this lap. Energy 62
   percent, new mediums.", play the pre-generated first sentence at 0 ms while synthesizing the
   second sentence in parallel.

Step 1a includes a listening and latency test of Piper WASM, Kokoro CPU, and Chrome's voices in the
demo on the same sample calls while LMU runs. Model and voice files are downloads: ask before
fetching them.

## Radio log for the debrief

Every call the engine produces is stored, spoken or not: `recordingId` (linked to the reconciled
session via the existing XML reconciliation), game time, lap, lap distance, key, priority, text, and
outcome (`spoken`, `dropped-budget`, `expired`, `replaced`, `interrupted`, `locked`, `no-client`,
`failed`, `late`). The debrief of the reconciled session shows it as a radio timeline by lap, so wording,
timing and too-chatty laps can be refined after each race. Dropped calls stay in the log; they show
what the budget is hiding.

## Architecture

- `shared/domain/live/liveCalls.ts`: pure and deterministic. Snapshot, timing, traffic and the
  previous call state in, candidate calls out (`key`, `text`, priority, expiry). Generalizes
  `strategySpeech`.
- The scheduler runs on the server in the live service (slots, budget, hysteresis, expiry), so the log
  is complete even if the page fails or reloads, and sends a tiny metadata-only `call` SSE event
  (`{ id, priority, text, expiresAt }`, never inline audio bytes, avoiding SSE backpressure drops).
  The page plays it and reports back the outcome.
- Server: decode flags, gaps and per-car speed into `LiveVehicleReading`; spoken car names in
  `shared/domain/`; radio log table in SQLite next to the live capture stores, keyed by
  `recordingId` and linked through the existing XML reconciliation.
- TTS: browser-side Web Worker (Piper WASM / Kokoro CPU) + pre-generated fixed clips + persistent
  `(voice, rate, text)` cache behind one small player interface; if Step 1a shows WASM hurts LMU
  frame times or P1 latency, move synthesis to a persistent server worker and serve clips via
  `GET /api/live/calls/:id/audio`.
- Settings: voice on/off, voice, volume, rate, verbosity (quiet / normal), per-family toggles,
  "Play sample" for each family.

## Iterations

Each step ends with demo scenarios that play the calls, a replay of real `.live.duckdb` captures
through `liveCalls` that counts calls per lap and per slot, and one drive in the car.

- **1a. Voice & audio spike (demo):** listening test of browser Piper WASM, Kokoro CPU and Chrome
  voices on sample calls, plus pre-generated fixed clips and persistent `(voice, rate, text)` cache.
  Verify P1 `< 1 s` latency, Web Audio interruption/unlock, and zero LMU frame-time impact; fall back
  to a persistent server worker only if browser WASM fails those checks.
- **1b. Core infrastructure:** settings, server scheduler, slots, budget, SQLite radio log, SSE
  `call` events and outcome reporting; move the existing strategy calls into the real dashboard
  behind the setting. Measure calls per lap on the Le Mans and COTA captures. Fix the three strategy
  keys found off the car (save by stop with a reachable cutoff, one box repeat, no over-budget after
  the last stop).
2. Built 2026-11-22: strategy and damage wording, the Hypercar deployment call, plus the radio log in
   the debrief.
3. Built 2026-11-22 (live test pending). Flags, penalties and the session clock: decode the fields, check against an online race. Then the
   incident detector (naming turns via `circuitTurns/placeTurns.ts`), tested on replays with crashes
   before any drive. Then tune the yellow calls live, with the voice on, in online races. Shared memory
   is the source (sector flags and the detector on every car's positions); the LMU REST API is read
   alongside only as a check (allowlisted reads, at most 1 Hz) and is used for a call only where shared
   memory has nothing. Log every yellow and call so the thresholds, the confirmation for lagging cars and
   the far-yellow call are set from what the driver heard (driver, 2026-11-21).
4. Built 2026-11-22. Multiclass traffic with car names: faster class closing with time to the pass. Then the rejoin
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
class adds ~0.9 traffic calls per lap (2026-10-28 measure), so about 1.5 in all; a Hypercar driver at the normal
level, ~0.9-1.3 for slower cars passed in braking zones and corners (Daytona, 2026-11-05).

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

- Voice: Piper WASM vs. Kokoro CPU in a browser Web Worker (or server worker fallback), plus which
  fixed clips to pre-generate, after the Step 1a listening test.
- Penalty type: check whether `strategy.pit.penaltySeconds` (`0` vs `> 0`) reliably distinguishes
  drive-through from stop-and-go; keep wording type-neutral until verified.
- Lagging cars: whether live shared memory shows freezes like the replays do (step 3 live yellow test;
  starting rules under Incident ahead).
- "Yellow far ahead": drop it, or keep it only for the game's own sector yellow (15-27 a race when said for
  every slow car 15-60 s ahead). Settled in the step 3 live yellow test.
- Whether any REST read adds something shared memory lacks for yellows or incidents (shared memory stays
  the source; driver, 2026-11-21): checked in the same live test.
- Track condition labels: confirm grip 0 and 1 when a session shows them (2, 3, 4 and every
  wetness step are mapped).
- Later, for the wheel button: which button, and whether to add push-to-talk.
