# Live dashboard data sources

Status: desk check, 2026-10-15, then a live offline practice the same day (Laguna Seca,
GT3, build 14200): shared memory recorded for 25 s and eight REST reads (results in
`docs/LMU_REST_API.md` §4.2). The garage namespace, damage, pit stops, menus, weather and
session files followed on 2026-10-16 with the app's live reader running (§4.3 and §2.2 there).
Rows marked **Live** were seen with values in one of those sessions.
Companion to [LIVE_RACE_DASHBOARD.md](LIVE_RACE_DASHBOARD.md) and the
[mock](../prototypes/live-dashboard/README.md).

Two live sources, each checking the other where they overlap:

- **Shared memory** (`$rFactor2SMMP_Telemetry$`, `$rFactor2SMMP_Scoring$`): read-only memory
  mapping, no risk to the game. Field list from `tools/telemetry-recorder/Rf2Structs.cs`.
- **LMU REST API** (`localhost:6397`): HTTP reads with a crash history. Paths from
  `docs/swagger-schema.json`, which lists **no response schemas**; only `/navigation/state`
  (example response, build 14200) and the `/rest/watch/*` replay behaviour
  (`docs/LMU_REST_API.md` §4.1) have been observed.

Evidence levels used below:

| Level | Meaning |
|---|---|
| **Live** | Read with values in the 2026-10-15/16 live sessions |
| **Seen** | Values observed from the game in this repo's history |
| **Field** | Field exists in the struct or the endpoint exists; values, units and timing not checked live |
| **Guess** | Only an endpoint name or a doc description suggests it |
| **None** | No known source |

## Field map

### Lifecycle

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Game closed | The app's own handle keeps the mapping; counters stop advancing | Port 6397 refuses (a timeout is a busy game, not a closed one; the port is not up yet while LMU starts) | **Live** (detected in about 6 s) |
| Main menu vs session loaded | **Not usable:** the buffer keeps the last session (vehicles, `InRealtime` false) after the driver leaves to the menu | `/navigation/state` → `navigationState` `NAV_MAIN_MENU` (menu and all race-weekend setup pages) vs `NAV_EVENT` / `NAV_REALTIME` | **Live** (REST decides) |
| Loading a session, with progress | — | `navigation/state` → `loadingStatus.loading` true, `percentage` 0 → 1; `gameState` `GSTATE_INIT` | **Live** |
| Garage monitor vs on track | `ScoringInfo.InRealtime`, `GamePhase` | `GetGameState.inMonitor`; `navigation/state` does not tell them apart offline (`NAV_EVENT` in both) | **Live** (SM decides) |
| Session type | `ScoringInfo.Session` = 1 in practice 1 | `/navigation/state` → `gameSession` `PRACTICE1` | **Live** (both) |
| Starting / finished | `GamePhase` 0 before, 3 formation, 5 green, 8 over (rF2 codes hold); player `FinishStatus` | `navigation/state` `BEFORE` / `FORMATION` / `GREEN` / `CHECKERED`; `GetGameState` `END_OF_RACE_GRACE`; standings `finishStatus` `FSTAT_FINISHED` / `FSTAT_DNF` | **Live** (online race) |
| Paused | `CurrentET` stops; rF2 phase 9 | `gameState` = `GSTATE_PAUSED` | Field |
| Replay playing (must not count as driving) | Not distinguishable reliably | `navigation/state` → `state.settingMode` `SETTING_REPLAY_PLAYBACK`; `GetGameState.isReplayActive` stayed false in a replay (2026-10-16) | **Live** (REST; main-menu and monitor replays, 2026-10-16) |

The rF2 numeric codes are the plugin's convention; LMU's use of them matched in every session seen.

### Identity

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Exact layout | `TrackName` (name only) | `/navigation/state` → `loadingData.trackInfo.sceneDesc` (`LAGUNASECA`, `BAHRAINWEC_OUTER`) → `getCircuitSpecification`; `loadingStatus.track.sceneDesc` already follows the track picked in the menu | **Live** (app resolves `bahrain_outer`) |
| Car and class | `VehicleName`, `VehicleClass` | `loadingData.selectedCar.classes`, `vehFile` | Both field/example |
| PR | App database (canonical player best), not the game | — | App (**Live**: 1:13.209 confirmed by the driver) |

### Timing

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Last lap, sectors, best | `LastLapTime`, `LastSector1/2`, `BestLapTime`, `BestSector1/2`, `CurSector1/2` | `/rest/watch/standings` (live outside replay) | **Live** (app's 1:15.285 and split sectors match the HUD) |
| Live delta | Computed from `LapDist`/`TimeIntoLap` vs own reference | — | Field (built; not compared on screen yet) |
| Lap validity (quali) | `CountLapFlag` (a lap with a cut and a pit pass: `COUNT_LAP_ONLY`, no time, no sectors) | Standings `countLapFlag` | **Live** (a cut alone not separated yet) |
| Laps left (header) and time left (horizons only); races are always timed, `MaxLaps` reads 2^32 - 1 and is not used | `TotalLaps`, `EndET`, `CurrentET`, the leader's `LapStartET` / `EstimatedLapTime` / `LapsBehindLeader` | `/rest/watch/sessionInfo` | REST seen in replay |
| Next session length (garage screen between sessions: quali and race minutes, converted to laps) | — | `/rest/sessions/GetSessionsInfoForEvent` → `scheduledSessions[{name, lengthTime (min), airTemp, rainChance}]` (practice-only weekend listed `PRACTICE 120`) | **Live** shape; a full weekend not read yet |

### Fuel, energy and pit plan

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Fuel litres, capacity | `Fuel` (101.6 L), `FuelCapacity` (117 L), also for GT3 | `/rest/watch/standings` → `fuelFraction` | **Live** |
| **Virtual energy** | Not in the structs (`BatteryChargeFraction` 0 on GT3) | **`/rest/watch/standings` → `veFraction`** (0.978 one lap out) | **Live** (REST only) |
| Use per lap | Computed from fuel samples at line crossings | `standings.veFraction` / `fuelFraction` sampled at each line crossing (precise); `/rest/strategy/usage` per lap is stored in 1/255 steps (0.39 %), too coarse for one lap | **Live** |
| Game's own per-lap estimate (fallback before any lap) | — | `UIScreen/TireManagement` → `expectedUsage` (VE 2.49 %, fuel 2.18 L per lap, updated while driving) | **Live** |
| Start VE / fuel set in the garage | — | `getPlayerGarageData` → `VM_VIRTUAL_ENERGY` "50% (20.1 laps)", `VM_FUEL_LEVEL` (ratio); the car only takes it when it leaves the garage | **Live** |
| MFD refuel / VE target currently set | `ScheduledStops` only | `PitMenu/receivePitMenu` → `VIRTUAL ENERGY:` "50% 20 laps", `FUEL RATIO:`, `TIRES:`, `DAMAGE:`; `RepairAndRefuel.fuelInfo` (litres and joules) | **Live** |
| Pit state | `InPits`, `PitState`, `InGarageStall`, `NumPitstops`, `SpeedLimiter` | Standings `pitState` `NONE` → `REQUEST` → `ENTERING` → `STOPPED` → `EXITING`, `pitstops` (a penalty stop does not count), `penalties`; `GetGameState` → `PitEntryDist` | **Live** |
| Pit time estimate | — (historic `shared/domain/pitStops.ts`) | `/rest/strategy/pitstop-estimate` → seconds for `fuel`, `ve`, `tires`, `damage`, `brakes`, `penalties`, `total`. **With a penalty pending it shows only the penalty** (the next stop is a stop-and-go). It leaves out random delays: 33.7 s estimated, 38 s real | **Live** |
| Mandatory stops / windows | — | Session rules (`SESSSET_*`), unclear | None/guess |

VE comes only from REST (`veFraction`, `fuelInfo` in joules); shared memory has none. LMU's
DuckDB telemetry has a `Virtual Energy` table, but that file is only complete when the driver
leaves the session, so it is not a live source.

### Tyres

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Wear per wheel | `Wheel.Wear` = **remaining** fraction (0.9998 → 0.9989 over 25 s) | `/rest/strategy/usage` → `tyres` per lap (0–100) | **Live** |
| Compound | `Front/RearTireCompoundName` (`Medium`), `…Index` | `UIScreen/TireManagement` (compounds, optimal temperature: Medium 92 °C, Wet 50 °C); MFD `TIRES:` options | **Live** |
| Temps, pressure | `Wheel.Temperature[3]`, `TireCarcassTemperature`, `Pressure` (kPa) | `/rest/garage/tireinfo` (Kelvin, kPa, load) | **Live** (both) |
| Sets remaining | — | `UIScreen/TireManagement` → `tireInventory` (56 new of 56) | **Live** |
| Set fitted for the next run | — | `UIScreen/TireManagement` → `tireInvGarageOptions.selectedTires` (per wheel `isUsed`, `wearValue`); the qualifying set stays fitted for the race until a new one is picked (driver, 2026-10-16) | **Live** (practice); race garage to read |
| Condition per tyre | `Wheel.Wear` | `getVehicleCondition.tireCondition` (0 = destroyed) | **Live** |
| Puncture / lost wheel | `Wheel.Flat`, `Wheel.Detached` | — | Field |

### Damage and repairs

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Damage indicators | `DentSeverity[8]` (0–2; slots 5 and 7 lit on right/side hits), `LastImpactET/Magnitude`, `Detached`, `Overheating` (not triggered; overheating test skipped) | `getVehicleCondition.vehicleDamage` (= body aero, above 1 after big hits); `RepairAndRefuel.wearables.body.detachableParts` (18 flags: parts lost show as false) | **Live** (both; garage reads safe outside replay) |
| Puncture | `Wheel.Flat` (front right and rear right went 0 → 1) | — | **Live** |
| Suspension damage (shows the damage row without a measured loss) | No suspension field (HUD showed it, SM did not) | `getVehicleCondition.suspensionDamage` per corner, 0–1 (0.72 front hit, 1.0 broken) | **Live** |
| Repair time / options | — | `pitstop-estimate.damage` (0, 30, 113, 130 s seen; 0 while a penalty is pending); MFD `DAMAGE:` "Do Not Repair / Repair Body / Repair All"; `RepairAndRefuel.pitStopTimes` rules (fix all damage 30 s, random delay up to 5 s) | **Live** |
| Brake wear | No pad wear | `brakeinfo` pad thickness (m), `getVehicleCondition.brakeCondition`: barely moves in a whole practice | **Live**: not modelled enough to show |

A Repair All stop (30 s estimated repair + refuel, 33.7 s total) took 38 s in the game and
fixed suspension, body and brakes. Pace loss after damage is still not measured (the cars hit
were too slow to drive).

### Weather

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Track / air temp | `TrackTemp` (37.3), `AmbientTemp` (21.0) | `/rest/watch/sessionInfo` | **Live** (both) |
| Rain now | `Raining`, `DarkCloud` | `sessionInfo.raining` (0–0.94, interpolated between forecast nodes); `darkCloud` stayed 0 in a storm | **Live** (wet) |
| Track wetness | `Min/Max/AvgPathWetness` | `sessionInfo` path wetness: lags the rain, moves in steps (0.05, 0.12, 0.40, 0.60) | **Live** (rising; drying not followed to the end) |
| Forecast | — | `/rest/sessions/weather` → per session, rain chance, sky (0 Clear, 1 Light Clouds, 10 Overcast & Storm), temperature at `START`, 25/50/75 %, `FINISH`: fractions of the session length; a fixed script offline (unchanged over a session). `GetGameState` → closest node, switching halfway between nodes | **Live** |

### Inputs and traffic

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Throttle / brake trace | `Unfiltered/FilteredThrottle`, `…Brake` | `/rest/options/liveInputs` (HTTP, too slow for a trace) | **Live**: telemetry about 50 Hz, scoring 5 Hz |
| Class gaps (deferred) | All cars: `Place`, `VehicleClass`, `TimeBehindNext`, `LapDist` | `/rest/watch/standings` | Field |
| Finish result: class/overall position, gaps at the flag | Player `Place` and `FinishStatus`; class place counted from all cars' `Place` + `VehicleClass` | `/rest/watch/standings` `position`, `finishStatus`; gaps must be frozen as each car finishes (`timeBehindNext` goes negative after the flag) | **Live** |
| Start position (for places gained) | — | Standings `qualification` = grid slot (3 → finished 1) | **Live** |
| Other cars' VE / fuel | — | Standings `veFraction` / `fuelFraction` read 0 online for other cars | **None** (player only) |

## What this means for the mock

- **Live from shared memory:** lifecycle on track and in the garage (not the main menu),
  session type, lap times and split sectors, fuel, pit state, tyre wear (remaining
  fraction)/compound/temps/pressures, weather now, pedals at about 50 Hz, dents and flats.
- **Live from low-risk REST reads:** VE (`standings.veFraction`), per-lap VE/fuel/tyre use
  (`strategy/usage`), pit time per service part including `damage`
  (`strategy/pitstop-estimate`), forecast by session node (`sessions/weather`), pit entry
  distance (`GetGameState`), replay detection and exact layout `sceneDesc` (`navigation/state`).
- **Practice** was not captured online beyond one read; it is assumed to match qualifying
  (same fields, `PRACTICE1`, green until the flag, garage monitor between runs).
- **Live online (qualifying + race):** the full lifecycle (before, grid, formation, green,
  checkered, back in the monitor), finish status, grid slot, gaps for all cars, and the
  pit-estimate fuel time growing as fuel burns (an indirect MFD refuel read).
- **Live from the garage namespace (2026-10-16, safe outside replay):** the MFD
  (`receivePitMenu`), the start VE and fuel set in the garage (`getPlayerGarageData`), fuel and
  VE in the car in litres and joules, the pit time rules, tyre sets, suspension damage per
  corner, lost parts, the game's own per-lap VE and fuel estimate.
- **Still unconfirmed:** pace loss after damage, overheating, which dent slot is which body
  area, a cut lap on its own, the wetness level where slicks become faster, a full race
  weekend (`GetSessionsInfoForEvent`, `standings/history`), laps left against a real finish,
  `strategy/overall` (400).
- **Every mock value now has a live source:** `VE / LAP`, `SPARE / LAP`, the forecast lines,
  `REPAIR TIME`, the MFD VE / fuel / tyre setting (`receivePitMenu`), `VE NEEDED` / `FUEL NEEDED`
  between sessions (setup `VM_VIRTUAL_ENERGY` plus `GetSessionsInfoForEvent` lengths).

## Validation run (needs LMU open, with the user present)

Order runs from no risk to known risk. One REST request at a time, at most 1 Hz; stop on the
first non-200 or slow answer. Never during replay playback. Save the full JSON response and
the game build for each read into `docs/LMU_REST_API.md`.

1. **Shared memory only (no risk).** Run the recorder through a practice session: garage,
   out lap, flying laps, a pit stop with refuel and tyre change, a contact, and a wet session.
   Damage, in an offline session: light contact, a heavy front hit (aero), a kerb or wall
   strike to bend suspension, a lost part, and overheating if it can be provoked. For each,
   note which fields move (`DentSeverity`, `Detached`, `LastImpactMagnitude`, `Overheating`,
   wheel `Flat`/`Detached`) and the lap-time loss that follows, to set the damage-row trigger.
   Settle units and directions (`Wear`, `Fuel`, path wetness, `GamePhase`/`Session` codes,
   pedal update rate).
2. **REST already observed (low risk).** `/navigation/state`, `/rest/watch/sessionInfo`,
   `/rest/watch/standings` while driving (not replay). Check that wetness and standings are
   live outside replay.
3. **REST never called (medium risk).** In the garage, then on track: `/rest/strategy/usage`,
   `/rest/strategy/pitstop-estimate`, `/rest/strategy/overall`, `/rest/sessions/weather`,
   `/rest/sessions/GetGameState`. First goal: find VE.
4. **Garage namespace (crash history).** Only in a live practice session, after saving
   anything that matters, one call per run: `/rest/garage/UIScreen/RepairAndRefuel`,
   `/rest/garage/PitMenu/receivePitMenu`, `/rest/garage/UIScreen/TireManagement`,
   `/rest/garage/tireinfo`, last `/rest/garage/getVehicleCondition`.

Each confirmed field then moves from mock value to live value; anything still unconfirmed
after step 4 stays shown as unavailable on the dashboard.

## Test session results (2026-10-16) and what is left

Done live, with the app's reader running (details in `docs/LMU_REST_API.md` §2.2 and §4.3; raw
reads in `C:/Documents/lmu-live-captures/2026-10-16-bahrain-outer-gt3-offline`):

1. **Garage reads**, in the garage and on track: all answered in 1–17 ms, LMU healthy.
   `loadPitMenu` skipped (a POST).
2. **Damage:** front hit, lost parts, side hit, two penalty stops and a Repair All stop.
   Overheating skipped (driver's choice).
3. **Menus and loading:** main menu, race-weekend setup, loading with progress, garage.
4. **Weather:** a 15-minute practice with a storm at the 25 % node.
5. **Session files:** results XML, final `.Vcr` and DuckDB checkpoint all land when the driver
   leaves the session; the app now scans about 6 s later (menu read from `navigation/state`).

Fixed in the app from what the session showed: the game was dropped while it loaded (REST port
not up yet), and the menu was never detected (the buffer keeps the last session), which held the
file scans until the game closed.

Still to test, in one offline race weekend (practice, qualifying, a 20-minute race):

- The dashboard's race plan against the race: per-lap VE/fuel against the MFD, the pit lap it calls, and
  the VE or fuel left at the finish; a fuel class (LMP2 or LMP3) for the MFD `FUEL:` line and the garage
  fuel in litres.
- The garage before the race: the game keeps the qualifying set fitted (confirmed by the driver,
  2026-10-16); still to see in the REST read: `selectedTires` reporting it used with its wear, and new
  once a new set is picked.

- `GetSessionsInfoForEvent` in the garage after practice and after qualifying;
  `watch/standings/history` and `strategy/overall` in the race.
- Laps left (`~`) against the real finish, after the clock ends and once the leader has the flag.
- A lap with only a track-limits cut (does the game drop the sectors or only the time?).
- Pace loss after a drivable hit; an early pit request against a late one (crew readiness vs
  random delays).
- A wet race long enough to see the track dry and the level where slicks are faster again
  (compare with `RAIN_WET_MIN`); wear on wets on a drying track.
- The header's track wetness (`avgPathWetness`) and its trend against what the track looks like, as rain
  starts and as the line dries.
- Online, later: whether the server weather matches the local `sessions/weather` read.

Not worth testing: `watch/trackmap` (static geometry), `watch/getIncidentsList` (the XML has
more), `options/liveInputs` (too slow), options, profile, material editor and multiplayer reads.
Maybe later: `rest/chat/` (race control messages?), `race/car` (tank capacity?),
`UIScreen/PitCarReview`, stint handoff screens (multi-driver only).
