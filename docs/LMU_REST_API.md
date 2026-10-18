# 🏎️ Le Mans Ultimate Embedded REST API Specification

Current app integration (2026-10-18): capture keeps existing gentle REST polling active independently
of dashboard clients while eligible live sessions run. Sparse evidence belongs to session DuckDB;
bounded response/error diagnostics use disposable JSONL sidecars with deferred gzip. Diagnostics add
no REST requests. The legacy manual capture directory is unchanged. See
[Live capture format](LIVE_CAPTURE_FORMAT.md). API findings below retain their original provenance.

This document provides a comprehensive technical reference for the embedded HTTP REST API and Swagger interface running natively inside **Le Mans Ultimate (LMU)** (Studio 397 / Motorsport Games, rFactor 2 engine lineage).

---

## 1. Overview & Embedded Server Architecture

When Le Mans Ultimate is running, the game engine hosts an internal HTTP web server listening by default on localhost:

```
http://localhost:6397
```

This embedded service exposes the complete internal state of the game, including navigation state, active session parameters, driver classifications, live standings, replay camera controls, garage setups, vehicle telemetry, hardware inputs, and race strategy.

### 1.1 Web Interfaces & Discovery Endpoints

| Resource | URL | Description |
| :--- | :--- | :--- |
| **Interactive Swagger UI** | `http://localhost:6397/swagger/index.html` | Interactive OpenAPI documentation web client |
| **Swagger 2.0 Schema** | `http://localhost:6397/swagger-schema.json` | Raw OpenAPI / Swagger 2.0 JSON specification (183 paths, 191 operations) |
| **Navigation State** | `http://localhost:6397/navigation/state` | Fast heartbeat endpoint to check if LMU is running and current menu state |
| **User Profile Info** | `http://localhost:6397/rest/profile/profileInfo/getProfileInfo` | Player name, nationality, Steam ID, and active language |
| **Static Web Data** | `http://localhost:6397/webdata/*` | Static web assets, track thumbnails, and livery textures |

### 1.2 Protocol & Connection Characteristics
- **Transport**: Standard HTTP/1.1
- **Default Port**: `6397` (TCP)
- **Content-Type**: `application/json` (except images/textures which return binary PNG/DDS streams)
- **CORS**: Headers allow local cross-origin requests from web dashboards and overlays
- **Authentication**: Not required for local requests (`localhost`); Steam session ticket is verified internally via `/rest/profile/getAuthSessionTicket`

---

## 2. Game Lifecycle & State Machine

Before polling specific session or garage endpoints, applications should verify the current lifecycle state via `/navigation/state`. Many endpoints (such as garage setup or replay status) return `404 Not Found` or `400 Bad Request` if the simulation is in a menu rather than on track.

### 2.1 Navigation & Session Heartbeat (`GET /navigation/state`)

Returns the current loading state, selected vehicle and track configuration, and the game phase.

#### Example Response Schema:
```json
{
  "loadingStatus": {
    "loading": false,
    "percentage": -1.0,
    "track": {
      "displayProperties": {},
      "dlcappID": 0,
      "length": "5.412",
      "owned": true,
      "premId": 999998,
      "sceneDesc": "<TRACK_CODE>",
      "sig": "<scene_hash>",
      "track": "<Event_Name>",
      "type": "Road Course",
      "venue": "<Track_Venue_Name>"
    },
    "loadingData": "{\"selectedCar\":{\"classes\":[\"<CLASS>\"],\"manufacturer\":\"<MANUFACTURER>\",\"number\":\"<NUMBER>\",\"team\":\"<TEAM>\",\"vehFile\":\"...\"},\"trackInfo\":{\"cmpName\":\"<TRACK_CODE>\",\"corners\":\"15\",\"trackLength\":\"5.412\"}}"
  },
  "state": {
    "appBuild": 14200,
    "gamePhase": "BEFORE",
    "gameSession": "PRACTICE1",
    "gameState": "GSTATE_SETUP",
    "internalStateCode": "OP_RAN_REALTIME_PASS",
    "navigationState": "NAV_MAIN_MENU",
    "settingMode": "SETTING_GRANDPRIX",
    "steamBetaBranchName": "default",
    "user": {
      "admin": false,
      "userState": "DEFAULT"
    }
  }
}
```

### 2.2 Lifecycle State Codes

Values **seen live** (build 14200, 2026-10-15/16); the rest of each enum is unconfirmed:

| Screen | `navigationState` | `gameState` | `internalStateCode` | `loadingStatus` |
|---|---|---|---|---|
| Main menu, and every race-weekend setup page (track, car, sessions) | `NAV_MAIN_MENU` | `GSTATE_SETUP` | `OP_RAN_REALTIME_PASS` (`OP_IN_OPTIONS` briefly) | `loading` false, `percentage` -1 |
| Session loading | `NAV_EVENT` | `GSTATE_INIT` | `OP_TO_REALTIME` | `loading` true, `percentage` 0 to 1 over about 12 s |
| Garage monitor, and on track (offline) | `NAV_EVENT` | `GSTATE_DYN` | `OP_RAN_REALTIME_PASS` | `loading` false |
| Driving (online capture) | `NAV_REALTIME` | `GSTATE_DYN` | `OP_RAN_REALTIME_PASS` | |

- In the menu, `loadingStatus.track` follows the track picked in the race-weekend setup live
  (`sceneDesc` e.g. `BAHRAINWEC_OUTER`), so the layout is known before the session loads.
  `gameSession` and `gamePhase` keep the last session's values there and mean nothing.
- `settingMode`: `SETTING_GRANDPRIX` offline, `SETTING_MULTIPLAYER` online.
- `gamePhase` (text) seen: `BEFORE`, `FORMATION`, `GREEN`, `CHECKERED`. `gameSession`: `PRACTICE1`, `QUALIFY1`, `RACE1`.
- The REST port is not listening while LMU starts up (the shared memory already exists then),
  and a loading game can answer slowly: a refused connection means the game is gone, a timeout does not.

---

## 3. Core Functional Modules

The 183 endpoints are organized into 10 primary functional domains:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      LMU Embedded REST API (:6397)                     │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ 1. Live Watch     │ 2. Garage & Setup │ 3. Sessions & Presets          │
│    • Standings    │    • Live Setup   │    • 63 Simulation Rules       │
│    • Track Map    │    • Tire Info    │    • Weather Schedules         │
│    • Cameras      │    • Brake Info   │    • Opponents / AI Control    │
│    • Replay Scrub │    • Pit Menu     │    • Save / Load Games         │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ 4. Race Content   │ 5. Strategy       │ 6. Options & Inputs            │
│    • All Vehicles │    • Overall Plan │    • Direct Input Polling      │
│    • All Tracks   │    • Pit Estimate │    • Graphics / Display Flags  │
│    • Car Images   │    • Fuel/Tire Use│    • Sound / Haptic Hardware   │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ 7. Profile & MP   │ 8. HUD & Cameras  │ 9. Livery & Material           │
│    • Steam Info   │    • HUD Toggles  │    • Custom Livery Reload      │
│    • Join MP Net  │    • Camera Groups│    • Shaders / Texture Maps    │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

---

## 4. Live Telemetry, Standings & Spectator (`/rest/watch`)

The `/rest/watch` namespace provides real-time race engineering and broadcasting data during active track sessions.

### Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/watch/standings` | Full live timing tower: positions, vehicle numbers, classes, sector splits, best/last lap, pit status |
| `GET` | `/rest/watch/standings/history` | Historical lap-by-lap timing table across all drivers |
| `GET` | `/rest/watch/sessionInfo` | Current session timer, remaining time/laps, track temperature, ambient temperature, flags |
| `GET` | `/rest/watch/trackmap` | Real-time 2D Cartesian vehicle coordinates ($x, z$), speeds, and pit lane status for all cars |
| `GET` | `/rest/watch/focus` | Current spectator camera focus target (slot ID / driver) |
| `PUT` | `/rest/watch/focus/{slotid}` | Focus camera on a specific driver slot ID |
| `PUT` | `/rest/watch/focusForward` | Advance spectator focus to next vehicle in standings order |
| `PUT` | `/rest/watch/focusBackward` | Step spectator focus to previous vehicle in standings order |
| `PUT` | `/rest/watch/focus/{cameraType}/{trackSideGroup}/{shouldAdvance}` | Select camera view (driving, cockpit, chase, TV trackside group) |
| `GET` | `/rest/watch/getIncidentsList/{minTimeBetweenContacts}` | Incident ledger filterable by contact threshold (sec) |
| `GET` | `/rest/watch/getBookmarkedTimestamps` | List of race incident and overtake bookmarks |
| `GET` | `/rest/watch/replays` | List of available `.Vcr` replay files |
| `GET` | `/rest/watch/play/{id}` | Load and play replay file ID |
| `PUT` | `/rest/watch/replayCommand/{command}` | Send transport commands: `play`, `pause`, `rewind`, `fastforward`, `step` |
| `PUT` | `/rest/watch/replaytime/{time}` | Jump to specific replay timestamp (seconds) |
| `POST`| `/rest/watch/replay/setReplayUIVisible` | Toggle replay playback control bar visibility |

### 4.1 Behaviour During Replay Playback (observed, build 14200)

Measured on a replay loaded from the main menu. Evidence is in
[VCR_ANALYSIS.md](VCR_ANALYSIS.md) §2.10.

- **`/rest/watch/sessionInfo` follows the replay timeline** for `raining`, `ambientTemp`,
  `trackTemp`, `raceCompletion` and `timeRemainingInGamePhase`. `currentEventTime` stays `0.0`,
  and `averagePathWetness`/`minPathWetness`/`maxPathWetness` stay `0.0` even in rain.
  `raining` equals the replay's Class 1 Type 10 wetness byte / 255, interpolated between
  packets.
- **`/rest/watch/standings` and `/standings/history` are frozen** at a formation-phase snapshot
  for the whole playback, and scrubbing the timeline doesn't refresh them. `carVelocity` and
  `carAcceleration` are zeros.
- **Replay clock:** `currentEventTime` stays 0. Use `timeRemainingInGamePhase` instead: race
  time = session length − remaining.
- **`/rest/watch/trackmap` returns static track geometry**, not live car positions: `type 0`
  reference line, `type 1` pit lane, and two-point markers for pit boxes (types 3–39, 107–144).
- **`/rest/watch/getIncidentsList/{minTimeBetweenContacts}`** returns the whole race's contact
  list (`player`, `contactWith`, `et`) without impact magnitude.

> ⚠️ **Crash hazard.** `/rest/garage/getVehicleCondition` crashes LMU during replay playback:
> it hung for about 30 s and LMU died in a 2026-09-27 sweep, and it did again in a one-request
> test on 2026-10-16 (2.6 s, connection reset, then refused). Never sweep every endpoint in the
> Swagger schema; probe one request at a time at ≤ 1 Hz and stop on the first non-200 or slow response.
>
> **Replay test, 2026-10-16** (build 14200, a replay started from the main menu, then one from a session's monitor;
> one endpoint per run with a
> `navigation/state` check before and after; log in `lmu-live-captures/2026-10-16-replay-rest-probe.jsonl`):
>
> | Endpoint | In replay |
> |---|---|
> | `navigation/state`, `sessions/GetGameState`, `watch/standings`, `strategy/pitstop-estimate`, `sessions/weather` | 200, fast |
> | `garage/getPlayerGarageData`, `garage/PitMenu/receivePitMenu` | 200, fast |
> | `garage/UIScreen/TireManagement`, `garage/UIScreen/RepairAndRefuel` | 404, no harm |
> | `garage/getVehicleCondition` | **crash** (main-menu replay; not sent in the monitor replay) |
>
> **Replay detection:** `GetGameState.isReplayActive` stayed `false` while the replay played. `navigation/state`
> `state.settingMode` reads `SETTING_REPLAY_PLAYBACK` (`navigationState` `NAV_EVENT`, `gameSession` `RACE1`); it
> is `SETTING_GRANDPRIX` offline and `SETTING_MULTIPLAYER` online. A replay started from a session's monitor reads
> the same (`SETTING_REPLAY_PLAYBACK`, `isReplayActive` false, `inMonitor` true) and gave the same answers.

### 4.2 Live Practice Reads (observed, build 14200, 2026-10-15)

Offline practice (`PRACTICE1`, Laguna Seca, Porsche 911 GT3 R #91, out lap). One GET at a
time, ≥ 1 s apart; every answer took about 0.21 s and the game stayed healthy. That time is
the client trying IPv6 `localhost` first: on `127.0.0.1` the same reads answer in 2–40 ms
(Python's `urllib` waits about 2 s on `localhost`). Use `127.0.0.1:6397`.

An online session (Le Mans, LMP3, 15 cars) gave the same fields. Other cars' `veFraction` and
`fuelFraction` read 0 and `strategy/usage` lists other drivers with `ve` only, so resource
levels are known for the player only. `navigationState` `NAV_EVENT`, `inRealtime` false and
`GetGameState.inMonitor` true mark the garage monitor; `settingMode` is `SETTING_MULTIPLAYER`.
Online qualifying and a 20-minute race were then polled every 5–30 s (1,602 reads, all 200,
slowest 134 ms on `127.0.0.1`). Lifecycle as the dashboard sees it:

| Moment | `sessionInfo` (`session`, `gamePhase`, `inRealtime`) | `navigation/state` `gamePhase` | `GetGameState` |
|---|---|---|---|
| Qualifying running | `QUALIFY1`, 5, true | `GREEN` | `GPHASE_GREEN`, `DRIVING` |
| Qualifying over, still driving | `QUALIFY1`, 8, true | `CHECKERED` | `GPHASE_CHECKERED` |
| Back in the garage monitor | `QUALIFY1`, 8, false | `CHECKERED`, `NAV_EVENT` | `MONITOR_MENU`, `inMonitor` true; `raceFinished` briefly true |
| Race loaded, before the grid | `RACE1`, 0, false | `BEFORE` | `GPHASE_BEFORE`, `MONITOR_MENU` |
| On the grid | `RACE1`, 0, true | `BEFORE` | `GPHASE_BEFORE`, `DRIVING` |
| Formation lap | `RACE1`, 3, true (`timeRemainingInGamePhase` −1) | `FORMATION` | `GPHASE_FORMATION` |
| Green | `RACE1`, 5, true (remaining 1198 s: a timed race) | `GREEN` | `GPHASE_GREEN` |
| Checkered, cool-down | `RACE1`, 8, true | `CHECKERED` | `GPHASE_CHECKERED`, `END_OF_RACE_GRACE` |
| Back in the monitor | `RACE1`, 8, false | `CHECKERED` | `END_OF_RACE_GRACE`, `inMonitor` true |

Phase 4 (countdown) fell between 5 s samples. In standings: `finishStatus` turns
`FSTAT_FINISHED` at the flag (`FSTAT_DNF` for retirements), `qualification` is the grid slot
(places gained = `qualification` − `position`), `pitState` passes `REQUEST` → `EXITING` as the
car returns to the garage, and the per-car `flag` stayed `GREEN` throughout (not usable).
After the flag `timeBehindNext` goes negative or jumps by tens of seconds as cars finish, so
gaps at the line must be frozen when each car's `finishStatus` changes. In the race,
`pitstop-estimate.fuel` grew steadily (2.4 → 6.9 s) as fuel burned: it is the time to add the
fuel the pit menu is set to, an indirect read of the MFD refuel amount.

Raw captures (shared memory + REST, practice → qualifying → race) are kept outside the repo in
`C:/Documents/lmu-live-captures/2026-10-15-lemans-lmp3-online`.

| Endpoint | Status | What it carries (live) |
|---|---|---|
| `GET /navigation/state` | 200 | `state.gameState` `GSTATE_DYN`, `gamePhase` `GREEN`, `gameSession` `PRACTICE1`, `navigationState` `NAV_REALTIME`, `appBuild`; `loadingData` (JSON string) has `selectedCar.classes` (`GT3`, …) and `trackInfo.sceneDesc` `LAGUNASECA`, plus the track's default weather slots per session |
| `GET /rest/watch/sessionInfo` | 200 | `session`, `gamePhase` 5, `inRealtime`, `currentEventTime` (live, unlike replay), `endEventTime`, `timeRemainingInGamePhase`, `raceCompletion.timeCompletion`, `ambientTemp`, `trackTemp`, `raining`, `darkCloud`, path wetness (0 in the dry), `yellowFlagState`, `sectorFlag` |
| `GET /rest/watch/standings` | 200 | Per car: **`veFraction` (0.978) and `fuelFraction`**, `position`, `qualification`, `carClass`, `lapsCompleted`, `lastLapTime`, `bestLapTime`, sector times (current/last/best), `estimatedLapTime`, `timeBehindNext` / `ClassLeader` / `Leader`, `lapsBehind*`, `pitState`, `pitstops`, `pitting`, `pitLapDistance`, `inGarageStall`, `countLapFlag`, `finishStatus`, `flag`, `underYellow`, `penalties`, `attackMode` |
| `GET /rest/strategy/usage` | 200 | Per driver, one entry per lap: `lap`, `stint`, `pit`, `fuel` and `ve` (fractions), `tyres` (four values, 0–100, 99.6 when new) |
| `GET /rest/strategy/pitstop-estimate` | 200 | Seconds per service part for the stop as currently set: `fuel` 2.76, `ve` 1.05, `tires`, `damage`, `brakes`, `brakeDucts`, `driverSwap`, `penalties`, `total` 2.76 |
| `GET /rest/strategy/overall` | **400** | Immediate (0.21 s); probably needs a parameter. Not retried |
| `GET /rest/sessions/weather` | 200 | Forecast per session (`PRACTICE`, `QUALIFY`, `RACE`) at nodes `START`, `NODE_25`, `NODE_50`, `NODE_75`, `FINISH` (% of session): `WNV_RAIN_CHANCE`, `WNV_SKY`, `WNV_TEMPERATURE`, `WNV_HUMIDITY`, wind |
| `GET /rest/sessions/GetGameState` | 200 | `PitEntryDist` (m to pit entry), `PitState`, `MultiStintState`, `gamePhase` `GPHASE_GREEN`, `isReplayActive`, `raceFinished`, `closeestWeatherNode` (sic), `inControlOfVehicle`, `timeOfDay` |

Damage test (same day, Le Mans, GT3, shared memory recorded alongside):

| Hit | Shared memory | `pitstop-estimate` |
|---|---|---|
| None | all damage fields 0 | `damage` 0, `total` 2.0 s |
| Right side at 132 km/h; HUD: right tyres and front-right suspension orange | `Flat` 1 on front right and rear right; `DentSeverity[5]` and `[7]` 1; `LastImpactMagnitude` 8896 | `damage` **113.4 s**, `tires` 4.5, `total` 120.0 |
| Side at 133 km/h (after a reset cleared hit 1) | `DentSeverity[7]` 1; magnitude 3235 then 4149; no flats | `damage` **30.0 s**, `total` 32.1 |

`pitstop-estimate.damage` gives the repair time for the current damage, and it grows with
suspension damage, which shared memory does not expose. `GetGameState` answers
`{"status": "unavailable", "gameState": "Setup"}` outside an active session.

The `/rest/garage/*` screens were read live the next day: see 4.3.

### 4.3 Garage, Pit, Damage and Weather Reads (observed, build 14200, 2026-10-16)

Offline practice, Bahrain Outer Circuit, GT3 (Manthey #91). One GET at a time with a
`navigation/state` health check after each. **Every `/rest/garage/*` read answered in 1–17 ms
and LMU stayed healthy**, in the garage monitor and on track. The replay crash (4.1) stays a
replay-only rule. Raw reads: `C:/Documents/lmu-live-captures/2026-10-16-bahrain-outer-gt3-offline`.

| Endpoint | What it carries |
|---|---|
| `GET /rest/garage/getPlayerGarageData` | The car setup: 172 `VM_*` / `WM_*` items, each `{value, stringValue, lastSavedStringValue, minValue, maxValue, available}`. **`VM_VIRTUAL_ENERGY` "50% (20.1 laps)"** and `VM_FUEL_LEVEL` (the fuel ratio, "0.86") are the start-of-stint amounts; `VM_FUEL_CAPACITY` "43.0L (19.7 laps)" is the fuel that VE allows. Also compounds, pressures, brake balance, ABS. The only read that shows a garage change before the car leaves |
| `GET /rest/garage/PitMenu/receivePitMenu` | The MFD for the next stop: 18 lines `{name, currentSetting, default, settings[{text}]}`: `DAMAGE:` ("N/A" until there is damage, then "Do Not Repair / Repair Body / Repair All"), `DRIVER:`, `VIRTUAL ENERGY:` (0–100 %, with the game's own laps estimate in the text, "50% 20 laps"), `FUEL RATIO:`, `TIRES:` ("No Change / New Medium / New Wet / Mixed Tyres"), each tyre, `R WING:`, `GRILLE:`, pressures, brake ducts, `REPLACE BRAKES:`. When the car leaves the garage, the MFD takes the setup's VE and ratio |
| `GET /rest/garage/UIScreen/RepairAndRefuel` | `fuelInfo` (current and max fuel in litres; **current and max virtual energy in joules**: 337.5 MJ of 675 MJ), `pitMenu` (as above), `pitStopLength.timeInSeconds` (= `pitstop-estimate.total`), `pitStopTimes` (the game's pit rules: four tyres 12 s, fix all damage 30 s, brake change 120 s, fuel 3.4 L/s, random delays up to 5 s on repairs and 2 s on fuel), `pitRecommendations`, `wearables` (body aero, 18 `detachableParts` flags, brake pads in metres, suspension and tyre per corner), `racePosition` (place in class, gaps), `currentWeather`, `weatherForecast` |
| `GET /rest/garage/UIScreen/TireManagement` | `expectedUsage`: the game's per-lap estimates (fuel 2.18 L or 1.87 % of the tank, **VE 2.49 %**), updated as laps are driven; `tireInventory` (56 new sets of 56); compounds with optimal temperatures (Medium 92 °C, Wet 50 °C); selected tyres; wheel info; weather |
| `GET /rest/garage/getVehicleCondition` | Per corner `suspensionDamage` (0–1) and `tireCondition` (0–1, 0 = flat or destroyed), `brakeCondition`, `vehicleDamage` (= aero body damage; above 1 after big hits), `fuel` and `fuelCapacity` in litres |
| `GET /rest/garage/brakeinfo` | Four pad thicknesses in metres (0.036 front, 0.032 rear); still 0.03599 after a whole practice: **brake wear is barely modelled** |
| `GET /rest/garage/tireinfo` | Per corner left, centre and right temperature in **Kelvin**, pressure (kPa), load |
| `GET /rest/sessions/GetSessionsInfoForEvent` | `scheduledSessions[{name, lengthTime (minutes), airTemp, rainChance}]`. A practice-only weekend listed only `PRACTICE 120`; a full weekend (2026-10-17) listed `PRACTICE 5`, `QUALIFYING 10`, `RACE 5`, the same in every garage of the event (200 in 2-4 ms). Read by the live dashboard in the garage |
| `GET /rest/strategy/overall` | Still **400**, in the garage and on track |

**VE and fuel.** `strategy/usage` stores `fuel`, `ve` and `tyres` in steps of 1/255 (0.39 %),
so one lap reads 2.35 % or 2.75 % VE when the true use is about 2.5 %.
`standings.veFraction` and `fuelFraction` are precise (0.37593 against 0.37647 in `usage`), so
per-lap use should be sampled from `veFraction` at each line crossing. A garage VE change shows
only in `getPlayerGarageData` until the car leaves; then `standings`, `usage`, `RepairAndRefuel`
and the MFD all switch to it. Fuel follows VE through the fuel ratio (VE 50 % with ratio 0.86 gave 43.0 L).

**Pit stop.** `standings.pitState` runs `NONE` → `REQUEST` (stop requested; 10 s before pit
entry here) → `ENTERING` → `STOPPED` → `EXITING` → `NONE`. `EXITING` with `inGarageStall` true
marks a drive-out from the garage. The lap count rose in the pit lane before the box (Bahrain
Outer's timing line is before it). A served penalty does not count in `pitstops`.

| Situation | `pitstop-estimate` | Real stop |
|---|---|---|
| Fresh car, nothing to service | `fuel` 2.0, `total` 2.0 | |
| Front hit: suspension FR 0.72, FR tyre 0, body 1.38 | `damage` 129.9, fuel 5.2, VE 5.0, tyres 4.5, `total` 139.6 | |
| Parts lost (left side destroyed), speeding penalty pending | `penalties` 10, **everything else 0**, `total` 10 | |
| Side hit (suspension 0.11 / 0.03), penalty pending | `penalties` 10, `total` 10 | Stop-and-go: held 10 s, **no service** |
| Same damage, penalties served | `damage` 30, fuel 3.1–3.7, VE 1.7, `total` 33.1–33.7 | Repair All + refuel: **38 s** in the game; everything repaired (suspension, body, brakes back to 1.0) |

While a penalty is pending, the next stop is a stop-and-go only, and the estimate drops every
service time. A repair estimate must therefore be kept separately and shown for the following
stop. The estimate leaves out the random delays (and possibly crew preparation after a late
request), so the real stop can be several seconds longer. `penalties` counts pending penalties:
two speeding penalties needed two stops. Returning to the garage from the menu resets the car
(full repair, the setup's VE and fuel) but keeps pending penalties.

**Weather** (15-minute practice, forecast clear → storm at 25 % → clear → light clouds):

| Session time | `sessionInfo.raining` | Path wetness min / avg / max | Air °C | `GetGameState.closeestWeatherNode` |
|---|---|---|---|---|
| 21 s | 0.07 | 0 / 0 / 0 | 29.0 | START (clear) |
| 81 s | 0.40 | 0.05 | 26.0 | START |
| 141 s | 0.83 | 0.05 / 0.12 / 0.12 | 21.8 | NODE_25 (storm, 100 %) |
| 171–201 s | **0.94** | 0.12 / 0.40 / 0.40 | 21.0 | NODE_25 |
| 231–282 s | 0.83 → 0.60 | 0.40 / 0.60 / 0.60 | 21–25 | NODE_25 |
| 359 s | 0.00 | 0.40 / 0.60 / 0.60 | | NODE_25 |

Rain is interpolated between forecast nodes: it rises from the start toward the storm node,
peaks just before it, and had stopped before the clear node at 50 %. Nodes are fractions of the
session length (225 s apart here). The closest node switches halfway between two nodes. Path
wetness lags the rain and moves in steps (0.05, 0.12, 0.40, 0.60). `darkCloud` stayed 0 in the
storm. `WNV_SKY` values seen: 0 Clear, 1 Light Clouds, 10 Overcast & Storm. All ten
`sessions/weather` reads were identical: the offline forecast is a fixed script, not a live
forecast. The in-game forecast showed "clear" during the storm, presumably the next node.

**Session files** (stat only, never opened while LMU runs). The replay is written as a growing
`Replays/_vcr*.tmp` during the session. The DuckDB telemetry file and its `.wal` appear when the
car first leaves the garage, and grow. When the driver leaves the session (to the menu or the
next session), the results XML, the final `.Vcr` and the DuckDB checkpoint (`.wal` folded in)
all land in the same second.

---

## 5. Garage, Car Setup & Pit Menu (`/rest/garage`)

Enables inspecting and altering vehicle setups, monitoring tire thermals and wear, configuring pit stops, and managing driver hand-offs in endurance races.

### 5.1 Setup Management Endpoints

| Method | Path | Body / Params | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/rest/garage/summary` | - | Overview of current car setup values |
| `GET` | `/rest/garage/setup` | - | Full setup file contents currently loaded |
| `POST` | `/rest/garage/setup` | string (name) | Save active setup to a new named file |
| `PUT` | `/rest/garage/setup` | string (name) | Overwrite / update named setup file |
| `DELETE`| `/rest/garage/setup/{name}` | path: name | Delete named setup file |
| `POST` | `/rest/garage/setup/compare` | string (name) | Compare current setup values against another setup |
| `GET` | `/rest/garage/setup/notes/{name}` | path: name | Retrieve driver setup notes for setup file |
| `POST` | `/rest/garage/setup/notes` | string (notes) | Save setup notes |
| `POST` | `/rest/garage/setup/default` | - | Restore track default setup |
| `POST` | `/rest/garage/refreshSetups` | - | Rescan setup files from disk |

### 5.2 Real-Time Setup Modification

Setup values are modified via regex-routed endpoints using the `GarageVal` model:

```json
{
  "value": 14
}
```

- **Vehicle Modifications**: `POST /rest/garage/(VM_.*)`  
  Changes global parameters such as aero wing angle, gear ratios, fuel load, brake bias, differential settings, or traction control.
- **Wheel Modifications**: `POST /rest/garage/(WM_.*)-(.*)`  
  Changes 4-wheel independent parameters:
  - Prefix: `WM_` setting name (e.g. `WM_tire_pressure`, `WM_camber`, `WM_toe`, `WM_spring_rate`, `WM_bump_damper`)
  - Suffix: Wheel identifier (`FL`, `FR`, `RL`, `RR`)

### 5.3 Diagnostic & Condition Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/garage/tireinfo` | Dynamic 4-corner tire temperatures (inner/center/outer), carcass temps, pressure, and wear percentage |
| `GET` | `/rest/garage/brakeinfo` | 4-corner brake rotor temperatures (°C) and pad wear |
| `GET` | `/rest/garage/getVehicleCondition` | Engine health, water/oil temps, gearbox damage, aero damage |
| `GET` | `/rest/garage/getPlayerGarageData` | Status of player's car in garage vs. on track |
| `POST` | `/rest/garage/drive` | Equivalent to clicking the in-game **"Drive"** button (leaves garage, enters pit lane) |
| `POST` | `/rest/garage/toRaceMenu` | Exits drive mode and returns to garage/monitor |

### 5.4 Pit Stop & Driver Handoff UI Screens

- `POST /rest/garage/PitMenu/loadPitMenu` & `GET /rest/garage/PitMenu/receivePitMenu`: Interactive pit menu sync
- `GET /rest/garage/UIScreen/RepairAndRefuel`: Planned damage repairs and refuel liters for next stop
- `GET /rest/garage/UIScreen/TireManagement`: Tire compound allocation and remaining sets in garage inventory
- `GET /rest/garage/UIScreen/DriverHandOffStintStart` / `DriverHandOffStintEnd`: Multi-driver endurance stint handoff

---

## 6. Sessions, Presets & Simulation Rules (`/rest/sessions`)

The `/rest/sessions` namespace allows complete programmatic configuration of race weekends, AI competitors, weather timelines, and event rules.

### 6.1 Session Settings Enumeration (`SessionID`)

The API exposes 63 distinct session configuration rules modified via:
`POST /rest/sessions/settings` with payload:
```json
{
  "sessionSetting": "SESSSET_AI_Strength",
  "value": 105
}
```

#### Complete List of `SessionID` Enums:

```
Session Structure:
  SESSSET_pract1, SESSSET_pract2, SESSSET_pract3, SESSSET_pract4
  SESSSET_num_qual_sessions, SESSSET_run_warmup, SESSSET_num_race_sessions
  SESSSET_Practice_Length, SESSSET_Qualify_Length, SESSSET_WarmUp_Length, SESSSET_Race_Laps, SESSSET_race_time

Starting & Time Scaling:
  SESSSET_practice1_starting_time, SESSSET_warmup_starting_time
  SESSSET_qualify_starting_time, SESSSET_race_starting_time
  SESSSET_race_timescale, SESSSET_race_timer, SESSSET_recon_timer
  SESSSET_recon_pit_open, SESSSET_recon_pit_closed, SESSSET_reconnaissance
  SESSSET_formation, SESSSET_force_formation, SESSSET_walkthrough

Rules & Penalties:
  SESSSET_flag_rules, SESSSET_blue_flags, SESSSET_cuts_allowed, SESSSET_cut_rules
  SESSSET_unsportsmanlike, SESSSET_safetycarcollision, SESSSET_safetycar_thresh
  SESSSET_parc_ferme, SESSSET_adjust_frozen, SESSSET_Finish_Criteria, SESSSET_Grid_Position

Simulation Realism & Physics:
  SESSSET_Fuel_Usage, SESSSET_Tire_Wear, SESSSET_Mech_Failures, SESSSET_Damage_Multi
  SESSSET_private_qual, SESSSET_private_prac
  SESSSET_keep_tire_inv_on_track_change, SESSSET_tires_available_in_garage, SESSSET_tire_warmers

AI Settings:
  SESSSET_Num_Opponents, SESSSET_AI_Strength, SESSSET_AI_Aggression

Weather & RealRoad Dynamic Grip:
  SESSSET_weather, SESSSET_timescaled_weather
  SESSSET_realroad_timescale_practice, SESSSET_realroad_timescale_qualify, SESSSET_realroad_timescale_race
  SESSSET_pract1_realroad_init, SESSSET_qual1_realroad_init, SESSSET_race_realroad_init
  SESSSET_pract1_realroad_wet, SESSSET_qual1_realroad_wet, SESSSET_race_realroad_wet
  SESSSET_pract1_realroad_temperatures, SESSSET_qual1_realroad_temperatures, SESSSET_race_realroad_temperatures
```

### 6.2 Weather Schedules & Timelines

- `GET /rest/sessions/weather`: Current weather slots across the session
- `POST /rest/sessions/weather/{session}/{preset}`: Apply a weather preset (e.g. `clear`, `rain`, `overcast`)
- `POST /rest/sessions/weather/{session}/{node}/{setting}`: Fine-tune hourly humidity, rain chance, cloud coverage, ambient temp, wind speed, and wind direction

---

## 7. Strategy & Stint Estimation (`/rest/strategy`)

Provides live mathematical projections calculated by LMU's onboard race engineer algorithms.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/rest/strategy/overall` | Stint strategy matrix: planned laps per stint, target pit windows, fuel per stint |
| `GET` | `/rest/strategy/pitstop-estimate` | Estimated pit delta in seconds (stationary service time + pit lane entry/exit traversal) |
| `GET` | `/rest/strategy/usage` | Consumption rates: average fuel liters consumed per lap, tire degradation percentage per lap |

---

## 8. Content Catalog: Vehicles & Tracks (`/rest/race` & `/rest/sessions`)

Query installed DLC, classes, liveries, tracks, layouts, and circuit geometries.

### 8.1 Track Catalog Schema (`GET /rest/sessions/getTracksAll`)

Returns an array of all installed circuits with weather presets, corner counts, and layout variants:

```json
{
  "id": "<track_guid_hash>",
  "trackName": "<Circuit Name>",
  "properTrackName": "<Official Facility Name>",
  "eventName": "<Event / Grand Prix Name>",
  "sceneDesc": "<SCENE_IDENTIFIER>",
  "sceneSig": "<sha256_signature_hash>",
  "corners": "15",
  "countryCode": "<ISO_COUNTRY_CODE>",
  "location": "<City, Country>",
  "trackLength": "4.653",
  "type": "Road Course",
  "version": "1.00",
  "image": "/rest/race/track/<id>/image",
  "thumbnail": "rest/race/track/<id>/thumbnail",
  "defaultPracticeStartTime": 660,
  "defaultRaceLengthTime": 480
}
```

### 8.2 Vehicle Catalog Schema (`GET /rest/sessions/getAllVehicles`)

Returns all vehicles across installed classes with driver rosters, skill ratings, and engine specs:

```json
{
  "id": "<vehicle_unique_id>",
  "vehicle": "<Vehicle Model & Year>",
  "manufacturer": "<Manufacturer>",
  "number": "<Car Number>",
  "team": "<Team Name>",
  "classes": ["<Class1>", "<Class2>"],
  "engine": "<Engine Type & Displacement>",
  "fullPathTree": "<Series, Category, Car Model>",
  "drivers": [
    { "name": "<Driver 1>", "nationality": "<ISO>", "skill": "Platinum" },
    { "name": "<Driver 2>", "nationality": "<ISO>", "skill": "Silver" },
    { "name": "<Driver 3>", "nationality": "<ISO>", "skill": "Bronze" }
  ],
  "vehFile": "<Path to installed .VEH file>"
}
```

---

## 9. Hardware, Live Inputs & Settings (`/rest/options`)

Provides direct hardware access to sim-racing peripherals, pedal calibration, force feedback (FFB), and graphic options.

### 9.1 Live Input Polling (`GET /rest/options/liveInputs`)

Returns real-time DirectInput device readings and calibrated pedal min/max positions. Useful for calibration overlays and input verification.

```json
{
  "liveInputs": {
    "di": [
      {
        "minmax": {
          "brakes": { "min": 0, "max": 65535, "current": 0 },
          "throttle": { "min": 0, "max": 65535, "current": 0 },
          "clutch": { "min": 0, "max": 65535, "current": 0 },
          "steering": { "min": -32768, "max": 32767, "current": 0 },
          "handbrake": { "min": 0, "max": 0, "current": 0 }
        }
      }
    ]
  }
}
```

### 9.2 Hardware Device Discovery
- `GET /rest/options/getAllSoundDevices`: Output audio sound cards and rendering endpoints
- `GET /rest/options/getAllHapticsDevices`: Force feedback wheels, active pedals, and tactile transducers
- `GET /rest/options/getAllResolutions`: Display resolutions and supported refresh rates (Hz)
- `POST /rest/options/resetVRView`: Recenter virtual reality head-mounted display orientation

### 9.3 Display & Graphic Flags (`GET /rest/options/display` & `GET /rest/options/settings`)
Exposes hundreds of engine cvars with metadata:
```json
{
  "GAMEOPT_telemetry": {
    "currentValue": 1,
    "minValue": 0,
    "maxValue": 1,
    "stepValue": 1,
    "stringValue": "On",
    "valueType": "LONG"
  }
}
```

---

## 10. HUD & Replay Camera Control (`/rest/hud` & `/rest/replay`)

### 10.1 HUD Overlays (`/rest/hud`)
- `GET /rest/hud`: Returns active HUD component flags:
  ```json
  {
    "chat": true,
    "mfd": true,
    "speedo": true,
    "timing": true,
    "trackMap": true
  }
  ```
- `POST /rest/hud/toggle/{component}`: Toggle specific widget (`chat`, `mfd`, `speedo`, `timing`, `trackMap`)
- `POST /rest/hud/toggleAllComponents/{visible}`: Hide all UI elements for clean video capture

### 10.2 Camera Control (`/rest/replay`)
- `GET /rest/replay/CameraController/getCameraInfo`: Active camera group and camera name
- `POST /rest/replay/CameraController/setCameraByName/{cameraName}`: Direct switch to named camera (e.g. `Cockpit`, `TV1`, `Nose`, `Bumper`, `Onboard-Rear`)
- `GET /rest/replay/isActive`: Returns whether replay mode is currently playing back

---

## 11. Profile, Multiplayer & Steam (`/rest/profile` & `/rest/multiplayer`)

- `GET /rest/profile/`: Active driver profile name and Steam64 ID
- `GET /rest/profile/eacActive`: Easy Anti-Cheat (EAC) runtime status (`true` / `false`)
- `GET /rest/profile/getAuthSessionTicket`: Steam session authentication ticket
- `GET /rest/multiplayer/join/state`: Status of multiplayer connection (`JOIN_IDLE`, `JOIN_CONNECTING`, `JOIN_SUCCESS`)
- `GET /rest/multiplayer/teams`: Registered endurance driver teams in current lobby
- `POST /rest/multiplayer/takeControlOfVehicle`: Take vehicle control during pit-stop driver swap

---

## 12. Quick Start Integration Recipes

### Recipe A: Health Check & LMU Detection (Node.js / TypeScript)

```typescript
import http from 'node:http';

export async function isLmuRunning(): Promise<{ running: boolean; state?: unknown }> {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:6397/navigation/state', { timeout: 1500 }, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => { raw += chunk.toString('utf-8'); });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw) as unknown;
          resolve({ running: true, state: json });
        } catch {
          resolve({ running: false });
        }
      });
    });
    req.on('error', () => resolve({ running: false }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false }); });
  });
}
```

### Recipe B: Live Standings & Telemetry Poller (TypeScript)

```typescript
export interface LiveStandingEntry {
  position: number;
  carNumber: string;
  driverName: string;
  vehicleClass: string;
  lastLapTime: number;
  bestLapTime: number;
  inPits: boolean;
}

export async function pollLiveStandings(baseUrl = 'http://localhost:6397'): Promise<LiveStandingEntry[] | null> {
  try {
    const res = await fetch(`${baseUrl}/rest/watch/standings`, {
      signal: AbortSignal.timeout(1500)
    });
    if (!res.ok) return null;
    return await res.json() as LiveStandingEntry[];
  } catch {
    return null;
  }
}
```

### Recipe C: Trigger Replay Jump to Stint Incident

```typescript
export async function jumpToIncidentTime(seconds: number): Promise<void> {
  await fetch(`http://localhost:6397/rest/watch/replaytime/${seconds}`, {
    method: 'PUT'
  });
  await fetch('http://localhost:6397/rest/watch/replayCommand/play', {
    method: 'PUT'
  });
}
```

---

## 13. Relationship to Other LMU Telemetry Interfaces

The embedded REST API complements the other data channels supported by this application:

| Feature / Metric | Embedded REST API (`:6397`) | 100 Hz DuckDB (`.duckdb`) | Binary Replay (`.Vcr`) | XML Results (`.xml`) |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Use** | Live interaction, commands, setup & spectator | High-frequency physical telemetry analysis | Spatial 2D trajectory & historic playback | Post-session classification, incidents, splits |
| **Frequency** | Polled HTTP (1 Hz - 20 Hz) | Native 100 Hz continuous | Variable replay slice (~50-100 Hz) | Single post-event file write |
| **Write / Control** | **Yes** (setups, cameras, replay commands) | Read-only | Read-only | Read-only |
| **Availability** | Only while LMU is actively running | Persisted to disk after session | Persisted to disk if saved | Persisted to disk automatically |
| **Overhead** | Minimal HTTP polling overhead | Zero during session | Zero during session | Zero during session |
