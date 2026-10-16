# Live dashboard data sources

Status: desk check, 2026-10-15, then a live offline practice the same day (Laguna Seca,
GT3, build 14200): shared memory recorded for 25 s and eight REST reads (results in
`docs/LMU_REST_API.md` §4.2). Rows marked **Live** were seen with values in that session.
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
| **Live** | Read with values in the 2026-10-15 live practice |
| **Seen** | Values observed from the game in this repo's history |
| **Field** | Field exists in the struct or the endpoint exists; values, units and timing not checked live |
| **Guess** | Only an endpoint name or a doc description suggests it |
| **None** | No known source |

## Field map

### Lifecycle

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Game closed | Mapping absent, or version counters stop advancing | Port 6397 refuses | Field |
| In menu vs in session | `ScoringInfo.InRealtime` (true), `GamePhase` | `/navigation/state` → `NAV_REALTIME`, `GSTATE_DYN` | **Live** (both) |
| Session type | `ScoringInfo.Session` = 1 in practice 1 | `/navigation/state` → `gameSession` `PRACTICE1` | **Live** (both) |
| Starting / finished | `GamePhase` 0 before, 3 formation, 5 green, 8 over (rF2 codes hold); player `FinishStatus` | `navigation/state` `BEFORE` / `FORMATION` / `GREEN` / `CHECKERED`; `GetGameState` `END_OF_RACE_GRACE`; standings `finishStatus` `FSTAT_FINISHED` / `FSTAT_DNF` | **Live** (online race) |
| Paused | `CurrentET` stops; rF2 phase 9 | `gameState` = `GSTATE_PAUSED` | Field |
| Replay playing (must not count as driving) | Not distinguishable reliably | `/rest/sessions/GetGameState` → `isReplayActive` (false live) | **Live** (REST) |

The rF2 numeric codes are the plugin's convention; LMU's use of them is unverified.

### Identity

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Exact layout | `TrackName` (name only) | `/navigation/state` → `loadingData.trackInfo.sceneDesc` (`LAGUNASECA`) → `getCircuitSpecification` | **Live** |
| Car and class | `VehicleName`, `VehicleClass` | `loadingData.selectedCar.classes`, `vehFile` | Both field/example |
| PR | App database (canonical player best), not the game | — | App |

### Timing

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Last lap, sectors, best | `LastLapTime`, `LastSector1/2`, `BestLapTime`, `BestSector1/2`, `CurSector1/2` | `/rest/watch/standings` (live outside replay) | **Live** fields (out lap, so −1/0 so far) |
| Live delta | Computed from `LapDist`/`TimeIntoLap` vs own reference | — | Field |
| Lap validity (quali) | `CountLapFlag` | Standings may carry it | Field |
| Laps left (header) and time left (horizons only) | `TotalLaps`, `MaxLaps`, `EndET`, `CurrentET` | `/rest/watch/sessionInfo` | REST seen in replay |
| Next session length (garage screen between sessions: quali minutes or laps, race laps or minutes) | — | `/rest/sessions/GetSessionsInfoForEvent` (untested); `sessionInfo` only describes the current session | Guess |

### Fuel, energy and pit plan

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Fuel litres, capacity | `Fuel` (101.6 L), `FuelCapacity` (117 L), also for GT3 | `/rest/watch/standings` → `fuelFraction` | **Live** |
| **Virtual energy** | Not in the structs (`BatteryChargeFraction` 0 on GT3) | **`/rest/watch/standings` → `veFraction`** (0.978 one lap out) | **Live** (REST only) |
| Use per lap | Computed from fuel samples at line crossings | `/rest/strategy/usage` → per lap `fuel`, `ve`, `tyres`, `pit`, `stint` | **Live** |
| MFD refuel / VE target currently set | `ScheduledStops` only | `/rest/garage/PitMenu/receivePitMenu`, `UIScreen/RepairAndRefuel` | Guess, garage namespace |
| Pit state | `InPits`, `PitState`, `InGarageStall`, `NumPitstops`, `SpeedLimiter` | Standings `pitState`, `pitstops`, `pitting`; `GetGameState` → `PitEntryDist` (m to pit entry) | **Live** |
| Pit time estimate | — (historic `shared/domain/pitStops.ts`) | `/rest/strategy/pitstop-estimate` → seconds for `fuel`, `ve`, `tires`, `damage`, `brakes`, `total` | **Live** |
| Mandatory stops / windows | — | Session rules (`SESSSET_*`), unclear | None/guess |

VE is the biggest gap: GT3 and Hypercar depend on it. LMU's own DuckDB telemetry has a
`Virtual Energy` table (`server/telemetry/duckdbReader.ts`), but that file is not a live
source (the plan rules out querying growing DuckDB files for the trace; reading it for
per-lap VE would need its own check).

### Tyres

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Wear per wheel | `Wheel.Wear` = **remaining** fraction (0.9998 → 0.9989 over 25 s) | `/rest/strategy/usage` → `tyres` per lap (0–100) | **Live** |
| Compound | `Front/RearTireCompoundName` (`Medium`), `…Index` | `/rest/garage/UIScreen/TireManagement` | **Live** (SM) |
| Temps, pressure | `Wheel.Temperature[3]`, `TireCarcassTemperature`, `Pressure` (kPa) | `/rest/garage/tireinfo` | **Live** (SM) |
| Sets remaining | — | `/rest/garage/UIScreen/TireManagement` | Guess, garage namespace |
| Puncture / lost wheel | `Wheel.Flat`, `Wheel.Detached` | — | Field |

### Damage and repairs

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Damage indicators | `DentSeverity[8]` (0–2; slots 5 and 7 lit on right/side hits), `LastImpactET/Magnitude`, `Detached`, `Overheating` (not yet triggered) | `/rest/garage/getVehicleCondition` | **Live** (SM); REST crashed LMU in replay |
| Puncture | `Wheel.Flat` (front right and rear right went 0 → 1) | — | **Live** |
| Suspension damage (shows the damage row without a measured loss) | No suspension field (HUD showed it, SM did not) | Indirect: `pitstop-estimate.damage` 113 s with suspension vs 30 s for a body hit; direct read via `getVehicleCondition` untested | Indirect **Live** |
| Repair time / options | — | `/rest/strategy/pitstop-estimate` → `damage` seconds (0, 30, 113 seen); options via `/rest/garage/UIScreen/RepairAndRefuel` | **Live** |

No source in the repo records a repair (see the damage notes behind the existing pit-stop
guess). Repair time stays unavailable until this REST read is checked live.

### Weather

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Track / air temp | `TrackTemp` (37.3), `AmbientTemp` (21.0) | `/rest/watch/sessionInfo` | **Live** (both) |
| Rain now | `Raining`, `DarkCloud` | `sessionInfo.raining`, `darkCloud` | **Live** (dry: 0) |
| Track wetness | `Min/Max/AvgPathWetness` | `sessionInfo` path wetness | **Live** fields, dry only (0); wet still to check |
| Forecast | — | `/rest/sessions/weather` → per session, rain chance/sky/temp at `START`, 25/50/75 %, `FINISH`; `GetGameState` → closest node | **Live** |

### Inputs and traffic

| Dashboard need | Shared memory | REST | Level |
|---|---|---|---|
| Throttle / brake trace | `Unfiltered/FilteredThrottle`, `…Brake` | `/rest/options/liveInputs` (HTTP, too slow for a trace) | **Live**: telemetry about 50 Hz, scoring 5 Hz |
| Class gaps (deferred) | All cars: `Place`, `VehicleClass`, `TimeBehindNext`, `LapDist` | `/rest/watch/standings` | Field |
| Finish result: class/overall position, gaps at the flag | Player `Place` and `FinishStatus`; class place counted from all cars' `Place` + `VehicleClass` | `/rest/watch/standings` `position`, `finishStatus`; gaps must be frozen as each car finishes (`timeBehindNext` goes negative after the flag) | **Live** |
| Start position (for places gained) | — | Standings `qualification` = grid slot (3 → finished 1) | **Live** |
| Other cars' VE / fuel | — | Standings `veFraction` / `fuelFraction` read 0 online for other cars | **None** (player only) |

## What this means for the mock

- **Live from shared memory:** lifecycle, session type, fuel, pit state, tyre wear
  (remaining fraction)/compound/temps/pressures, weather now, pedals at about 50 Hz.
  Damage fields exist but no impact has been tested yet.
- **Live from low-risk REST reads:** VE (`standings.veFraction`), per-lap VE/fuel/tyre use
  (`strategy/usage`), pit time per service part including `damage`
  (`strategy/pitstop-estimate`), forecast by session node (`sessions/weather`), pit entry
  distance and replay detection (`GetGameState`), exact layout `sceneDesc`.
- **Practice** was not captured online beyond one read; it is assumed to match qualifying
  (same fields, `PRACTICE1`, green until the flag, garage monitor between runs).
- **Live online (qualifying + race):** the full lifecycle (before, grid, formation, green,
  checkered, back in the monitor), finish status, grid slot, gaps for all cars, and the
  pit-estimate fuel time growing as fuel burns (an indirect MFD refuel read).
- **Still unconfirmed:** MFD values already set (directly), tyre sets, suspension damage (garage
  namespace, beyond the repair-time proxy), pace loss after damage, which dent slot is which
  body area, detached parts and overheating, wet path wetness, start/finish phases.
- **Mock values now with a live source:** `VE / LAP` and `SPARE / LAP` (from
  `strategy/usage` and `veFraction`), the forecast lines (`sessions/weather`), `REPAIR TIME`
  (`pitstop-estimate.damage`, 30 s and 113 s seen). **Still without one:** the MFD
  tyre setting and an MFD read for VE/fuel.

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

## Next test session (planned 2026-10-16)

Steps 2 and 3 are done (live 2026-10-15). What is left, in order, same rules as above:

1. **Offline practice, garage reads.** Before driving, set a refuel or VE amount on the MFD that
   is easy to recognise, plus a tyre change and repairs. Then on track, one read per run:
   `PitMenu/receivePitMenu` (MFD values for the next stop), `UIScreen/RepairAndRefuel`,
   `UIScreen/TireManagement` (sets left), `brakeinfo` (pad wear: `pitstop-estimate` has a
   `brakes` time, shared memory has no pad wear), last `getVehicleCondition`. If
   `receivePitMenu` says nothing useful, try `getPlayerGarageData` (it answered before the crash).
   Skip `PitMenu/loadPitMenu` (a POST that may change the menu).
2. **Same session, rest of the damage test.** A few clean laps for a baseline, then a heavy
   front hit, a detached part and overheating if it can be provoked. Record shared memory
   throughout; note pace loss after each hit and which `DentSeverity` slot lights.
3. **Offline race weekend, read-only reads outside the garage namespace.** `sessions/GetSessionsInfoForEvent`
   (each session's length, timed or laps, required stops), read in the garage monitor after
   practice and after qualifying: it feeds the garage screen's `VE NEEDED` / `FUEL NEEDED`. In the race,
   `watch/standings/history` (live, never tried outside replay), and one retry of `strategy/overall` (400 in practice).
4. **Weather and forecast handling.** Offline race long enough to cross several nodes, dry
   start, rain set at the 25 % or 50 % node and drying before the finish. Record shared memory,
   and poll `sessions/weather` and `sessionInfo` every 30–60 s. Check:
   - **Rain now:** `Raining` / `sessionInfo.raining` scale and steps, `DarkCloud`, and how far
     the change at a node lags the node time.
   - **Track wetness:** min/avg/max path wetness as it rises and dries; how quickly it follows
     rain, and the level where wets are faster (to compare with `RAIN_WET_MIN`).
   - **Forecast:** whether node values change as the session runs (a live forecast or a fixed
     script); whether `WNV_RAIN_CHANCE` 60 % means rain did come; what `WNV_SKY` values map
     to; whether nodes are fractions of the session length (time or laps) so the mock's
     `RAIN ~LAP 25 · 60%` can turn a node into a lap; what `GetGameState` reports as the
     closest node.
   - **Online (later, any wet online race):** whether the server weather matches the local
     `sessions/weather` read.
   - **Tyres:** `strategy/usage` and wear on wets on a drying track; the compound name and
     index for wets in shared memory.

5. **When the files are complete.** During the runs above, watch the replay, results and
   DuckDB folders (file size every few seconds, no reads): when the `.Vcr`, the results XML
   and the DuckDB file appear, whether they grow during the session, and which lifecycle
   moment they stop at (checkered, back in the monitor, next session loaded, main menu). That
   moment is when the app may start its scan after a session.

Not worth testing: `watch/trackmap` (static geometry), `watch/getIncidentsList` (the XML has
more), `options/liveInputs` (too slow), options, profile, material editor and multiplayer reads.
Maybe later: `rest/chat/` (race control messages?), `race/car` (tank capacity?),
`UIScreen/PitCarReview`, stint handoff screens (multi-driver only).
