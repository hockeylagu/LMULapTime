# 🏎️ Le Mans Ultimate Embedded REST API Specification

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
- **`gamePhase`**: `"BEFORE"`, `"RECONNAISSANCE"`, `"GRID_FORMATION"`, `"STARTING"`, `"SESSION_ACTIVE"`, `"FINISHING"`, `"SESSION_OVER"`
- **`gameSession`**: `"PRACTICE1"`, `"PRACTICE2"`, `"PRACTICE3"`, `"QUALIFY"`, `"WARMUP"`, `"RACE"`
- **`gameState`**: `"GSTATE_SETUP"`, `"GSTATE_DRIVING"`, `"GSTATE_MONITOR"`, `"GSTATE_REPLAY"`, `"GSTATE_PAUSED"`
- **`navigationState`**: `"NAV_MAIN_MENU"`, `"NAV_GARAGE"`, `"NAV_MONITOR"`, `"NAV_DRIVE"`, `"NAV_SETTINGS"`, `"NAV_RACE_WEEKEND"`

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
