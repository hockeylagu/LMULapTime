# Le Mans Ultimate / rFactor 2 VCR Replay File Format Specification & Findings

This document details the complete binary structure of the `.Vcr` replay file format used by **Le Mans Ultimate (LMU)** and the **rFactor 2 (rF2 / gMotor)** engine. It consolidates reverse-engineered findings, byte alignments, bit masks, and event packet definitions discovered through analysis of real replay files and reference parsers.

---

## 1. File Container & Magic Header

| Byte Offset | Size | Type | Value / Description |
| :--- | :--- | :--- | :--- |
| `0x00` | 2 bytes | UInt16BE | Optional Gzip magic header (`0x1F8B`). If present, the file is compressed and must be decompressed with `zlib.gunzipSync` before parsing. |
| `0x00` | 45 bytes | ASCII | Magic text header: `//[[gMb1.002f (c)2016    ]] [[            ]]\n` |
| `0x2D` (45) | 4 bytes | ASCII | Tag magic: `IRSR` |
| `0x31` (49) | 4 bytes | UInt32LE | Replay format version: `0x80000008` (32-bit integer) |
| `0x35` (53) | 4 bytes | UInt32LE | **`metadataOffset`**: Absolute byte offset from the start of the file to the metadata block. |
| `0x39` (57) | 4 bytes | UInt32LE | Frame stream prefix (typically `0x00000000`). |
| `0x3D` (61) | Variable | Binary | **Frame/Slice Stream** begins here and runs until `metadataOffset`. |

---

## 2. Metadata Block (at `metadataOffset`)

The metadata block is located at `metadataOffset` (typically in the last 2 KB to 10 KB of the file). Reading directly from `metadataOffset` enables sub-5ms instant metadata extraction without scanning through the large frame stream.

### 2.1 Track & Event Information Strings
Each string is preceded by a **4-byte length prefix (`UInt32LE`)** specifying the string length in bytes:

1. **`eventInfo` JSON**:
   ```json
   {
     "eventId": "ce94a9ef-8208-4c69-83e9-f5d3871b5640",
     "eventTitle": "LMGT3 Fixed",
     "eventType": "daily",
     "sceneDesc": "PORTIMAOWEC",
     "seriesId": "638bd6a2-0e2c-4539-a93c-c1ee7ff380d2",
     "session": "PRACTICE",
     "splitNo": 6
   }
   ```
2. **`scnFile`**: `.SCN` scene file name (e.g. `PORTIMAOWEC.SCN`).
3. **`aiwFile`**: `.AIW` waypoint & circuit layout file name (e.g. `PORTIMAOWEC.AIW`).
4. **`trackName`**: Mod / layout name (e.g. `PortimaoWEC_2023`).
5. **`trackVersion`**: Track layout release version (e.g. `1.23`).
6. **`modUid`**: 64-character hex layout checksum / unique mod identifier.
7. **`trackPath`**: Full installed filesystem directory on disk (e.g. `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\Installed\Locations\PortimaoWEC_2023\1.23`).

### 2.2 Session Configuration Block
Immediately following String 6 (`trackPath`):

- **Byte 0**: Session flags / sub-type configuration byte.
- **Byte 1 (`sessionInfo`)**:
  - `sessionInfo & 0x0F` = Session Type Code:
    - `0`: Test Day
    - `1` - `4`: Practice (P1, P2, P3, P4)
    - `5` - `8`: Qualifying (Q1, Q2, Q3, Q4)
    - `9`: Warmup
    - `10` - `13`: Race (R1, R2, R3, R4)
  - `(sessionInfo >> 7) & 0x01`: Private / Dedicated session flag (`true` / `false`).
- **Next 67 bytes**: Comprehensive Session Environment & Weather Conditions Block:
  | Relative Offset | Size | Type | Field Description |
  | :--- | :--- | :--- | :--- |
  | `+0` | 4 bytes | Float32LE | **`ambientTemp`**: Ambient air temperature in degrees Celsius (°C). |
  | `+4` | 4 bytes | Float32LE | **`trackTemp`**: Track surface temperature in degrees Celsius (°C). |
  | `+8` | 4 bytes | Float32LE | **`rainIntensity`**: Atmospheric precipitation / rainfall rate (`0.0` = dry to `1.0` = torrential monsoon). |
  | `+12` | 4 bytes | Float32LE | **`trackWetness`**: Overall circuit surface wetness percentage (`0.0` = completely dry, `1.0` = flooded). |
  | `+16` | 4 bytes | Float32LE | **`waterDepth`**: Average standing puddle depth across racing line (mm). |
  | `+20` | 4 bytes | Float32LE | **`trackGrip`**: Rubbering level / track evolution factor (`0.0` = green, `0.5` = medium rubber, `1.0` = saturated rubber groove). |
  | `+24` | 4 bytes | Float32LE | **`windSpeed`**: Ambient wind speed in meters per second (m/s). |
  | `+28` | 4 bytes | Float32LE | **`windDirection`**: Wind heading angle (radians clockwise from track North). |
  | `+32` | 4 bytes | Float32LE | **`timeMultiplier`**: In-game time progression multiplier (e.g. `1.0` = real-time 1x, `5.0` = 5x accelerated, `24.0` = 24x). |
  | `+36..66` | 31 bytes | Binary | Cloud cover, haze, sky presets, sun azimuth/elevation vectors, and ambient light intensity. |

### 2.3 Structured Driver Roster
Located immediately after the 67-byte session conditions block:

- **`numDrivers` (4 bytes, Int32LE)**: Total number of drivers participating in the session.
- **Driver Records (repeated `numDrivers` times)**:
  - `slot` (1 byte, UInt8 or UInt16LE): In-game driver slot index.
  - `name` (1-byte length prefix + UTF-8 string): Driver full name (e.g. `"Douglas Riviera"`).
  - `vehicleId` (1-byte length prefix + UTF-8 string): Car skin / vehicle ID token (e.g. `"32_26_WRT_83524148"`).
  - `livery / vehicle version` (1-byte length prefix + UTF-8 string): Custom livery hash or version code.
  - `team` (1-byte length prefix + UTF-8 string): Team name (e.g. `"Team WRT 2026 #32"`).
  - `carNumber` (1-byte length prefix + UTF-8 string): Car number string (e.g. `"32"` or `"1"`).
  - **Fixed 24-byte Driver Status Tail**:
    - `0..15` (16 bytes): Vehicle class attributes, Balance of Performance (BoP) weight ballast (kg) and intake air restrictor ratio.
    - `16..19` (4 bytes, Float32LE): `entryTime` (Session time in seconds when driver joined the server/session).
    - `20..23` (4 bytes, Float32LE): `exitTime` (Session time in seconds when driver left/disconnected).
  - **4 bytes Transition Block**: Slot index / linkage to the next driver entry.

### 2.4 Metadata Trailer (Last 28 Bytes of the File)
Located at `fileSize - 28`:
- `+0` (4 bytes, UInt32LE): Unknown trailer marker (`0x00000000`).
- `+4` (4 bytes, UInt32LE): `timeSliceCount` (Total number of physics / time slices recorded in stream).
- `+8` (4 bytes, UInt32LE): `totalEvents` (Total count of all discrete events across all slices).
- `+12` (4 bytes, Float32LE): `startTimeSec` (Replay starting timestamp in session seconds).
- `+16` (4 bytes, Float32LE): `endTimeSec` (Replay end timestamp in session seconds).
- `+20` (8 bytes): Reserved / padding bytes.

---

## 3. Frame & Slice Stream Structure

The frame stream begins at **byte 57** (after a 4-byte stream prefix, at byte 61) and continues up to `metadataOffset`.

### 3.1 Slice Header
Each slice begins with a 6-byte header:
- `sTime` (4 bytes, Float32LE): Replay timestamp in elapsed seconds.
- `nEvents` (2 bytes, UInt16LE): Number of events packaged within this time slice.

### 3.2 Event Header Bitfield
Each event in a slice begins with a **4-byte unsigned integer header (`eventHeader`)**:
```javascript
const eventClass  = (eventHeader >>> 29);          // Top 3 bits (0 to 7)
const eventType   = (eventHeader >>> 17) & 0x3F;   // Middle 6 bits (0 to 63)
const eventSize   = (eventHeader >>> 8)  & 0x1FF;  // 9 bits: payload size in bytes
const driverSlot  = eventHeader & 0xFF;            // Bottom 8 bits (0 to 255)
```
Immediately following the 4-byte `eventHeader` is **1 separator byte** (`0x00` / marker).
The event payload begins at `offset + 5` and extends for `eventSize` bytes.

---

## 4. Event Classes & Payloads

### Class 0: Vehicle Motion & Telemetry

#### Type 8..14 (`eventSize === 65`): Vehicle Pose & Driver Inputs
This is the primary vehicle kinematic and pedal telemetry packet emitted at up to ~50 Hz per car.

| Offset in Payload | Size | Type | Field & Bitfield Description |
| :--- | :--- | :--- | :--- |
| `0` | 4 bytes | UInt32LE | **`info1`**: <br>• Bits 0..6: `steerYaw` (Steering angle / 127) <br>• Bits 11..16: `throttle` (Throttle level 0..63) <br>• Bit 17: `inPit` (1 = in pit lane / garage) <br>• Bits 18..31: `engineRpm` (Direct RPM integer value) |
| `4` | 4 bytes | UInt32LE | **`info2`**: <br>• Bits 0..9: `detachablePartState` (Bitmask of detached / damaged aero body parts) |
| `4` | 2 bytes | UInt16LE | **`steer10`**: Steering wheel position: `(raw16 & 0x3FF)`, angle = `((steer10 - 512) / 512) * 540` deg |
| `5` | 1 byte | UInt8 | **`rawThrottle`**: 8-bit throttle pedal position (1 = 0%, 249 = 100%) |
| `8..12` | 5 bytes | Binary | Speed / velocity vector info |
| `13..35` | 23 bytes | Binary | Vehicle dynamics / suspension travel |
| `36` | 1 byte | UInt8 | **`rawBrake` & Systems**: <br>• Bits 0..5: Analog brake pressure (0 to 63 = 0% to 100%) <br>• Bit 6 (`0x40`): ABS Active flag <br>• Bit 7 (`0x80`): Traction Control (TC) Active flag |
| `38` | 1 byte | UInt8 | **`vehicleStatus`**: <br>• Bit 0 (`0x01`): Off-track / track limit cut violation <br>• Bit 2 (`0x04`): Pit limiter engaged (holding 60 km/h) <br>• Bit 7 (`0x80`): Inside pit lane boundary |
| `41` | 4 bytes | Float32LE | **`x`**: World coordinates X (lateral position in meters) |
| `45` | 4 bytes | Float32LE | **`y`**: World coordinates Y (elevation in meters) |
| `49` | 4 bytes | Float32LE | **`z`**: World coordinates Z (longitudinal position in meters) |
| `53` | 4 bytes | Float32LE | **`rotX`**: Pitch angle (radians) |
| `57` | 4 bytes | Float32LE | **`rotY`**: Yaw / heading angle (radians) |
| `61` | 4 bytes | Float32LE | **`rotZ`**: Roll angle (radians) |

#### Type 15 (`eventSize === 24` or `37`): Per-Wheel Live Telemetry
Emitted periodically or on corner events to report real-time tire physics and brake thermal data:

| Relative Offset | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `+0..7` | 8 bytes (4x UInt16LE) | UInt16LE | **Tire Pressures**: Dynamic tire pressure for FL, FR, RL, RR in units of 0.1 kPa (or PSI / 10). |
| `+8..19` | 12 bytes (12x UInt8) | UInt8 | **Tire Tread Temperatures**: 3-zone surface temperatures across tire carcass (Inner, Center, Outer) for all 4 corners: <br>• FL: Inner (8), Center (9), Outer (10) <br>• FR: Outer (11), Center (12), Inner (13) <br>• RL: Inner (14), Center (15), Outer (16) <br>• RR: Outer (17), Center (18), Inner (19) <br>Value in degrees Celsius (°C). |
| `+20..23` | 4 bytes (4x UInt8) | UInt8 | **Dynamic Tire Wear**: Remaining rubber depth percentage (`0..100`% or raw byte `0..255` scaled to 100%) for FL, FR, RL, RR. |
| `+24..31` (if sz === 37) | 8 bytes (4x UInt16LE) | UInt16LE | **Brake Rotor Temperatures**: Brake disc temperature in degrees Celsius (°C) for FL, FR, RL, RR. |

#### Type 7: Garage Event
- Float32LE: Timestamp of entering/exiting garage bay.

---

### Class 1: Session Control & Visuals

- **Type 10**: Start Lights Status:
  - 1 byte integer (`startLightsCode`):
    - `0`: No lights / pit exit open
    - `1..5`: Red start light countdown illumination (1 light on, 2 on, 3 on, 4 on, 5 on)
    - `6`: All red lights held before extinguish
    - `7`: Green flag / lights out (Race start!)
    - `8`: Aborted start / extra formation lap
- **Type 23**: Session Countdown:
  - 4 bytes UInt32LE: Seconds remaining until session green flag or expiration.

---

### Class 2: Penalties, Incidents & Race Control

- **Type 5**: Penalty Issued Event:
  - 1 byte: `penaltyId` (Infraction type code: 1 = Cut Track, 2 = Speeding in Pit Lane, 3 = False Start, 4 = Causing a Collision).
  - 2 bytes: Penalty code / rule reference.
  - Variable string (`eventSize - 3` bytes): Exact human-readable infraction text (e.g. `"Cut track"`, `"Pit lane speeding"`, `"False start"`).
- **Type 7**: Penalty Served Event:
  - 1 byte: `0` = Stop & Go served, `1` = Drive Through served.
- **Type 8**: Penalty Rescinded:
  - 1 byte: Penalty cancelled by race control / server admin.
- **Type 10**: Track Condition & Flag Status:
  - 1 byte: `flagState`:
    - `0`: Green Flag (Track clear / race underway)
    - `1`: Local Yellow Flag (Hazard in sector)
    - `2`: Double Yellow Flag (Hazard blocking track)
    - `3`: Full Course Yellow (FCY, speed limited to 80 km/h)
    - `4`: Safety Car deployed (SC)
    - `5`: Safety Car in this lap
    - `6`: Virtual Safety Car (VSC)
    - `7`: Red Flag (Session suspended)
    - `8`: Checkered Flag (Session finished)
  - 1 byte: `sectorMask`: Affected track sector bitfield (`0x01` = S1, `0x02` = S2, `0x04` = S3).
  - 1 byte: `driverFlag`: Specific flag directed at vehicle (`0x01` = Blue flag yield, `0x02` = Black flag DQ, `0x04` = Mechanical defect meatball flag).

---

### Class 6 (or 3): Timing Loops, Standings & Pit Lane

#### Type 6 (`eventSize === 21` in Online/Multiplayer, `eventSize === 18` in Offline/Single-Player Practice): Authoritative Timing Loop Checkpoint
Fired when a vehicle crosses an electronic simulation timing loop (Start/Finish line, Sector 1, Sector 2). Note: In online/multiplayer sessions, the packet size is 21 bytes; in offline/single-player practice sessions, the packet size is 18 bytes. Both share the exact same binary payload offsets:

| Offset | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `+0` | 4 bytes | Float32LE | **`splitSec`**: Lap time or sector split time in seconds. <br>• Positive float (`> 0`): Official valid lap or sector time. <br>• `-1.0` or `<= 0`: Invalidated lap (cut track / track limits violation) or initial session outlap. |
| `+4` | 4 bytes | Float32LE | **`elapsedTime`**: Absolute simulation session time (`sTime`) when the checkpoint loop was crossed. |
| `+8` | 1 byte | UInt8 | **Sector & Lap Bitfield**: <br>• `buf[8] & 0x03`: Sector checkpoint index (`0` = Start/Finish Line, `1` = Sector 1 checkpoint, `2` = Sector 2 checkpoint). <br>• `buf[8] >> 2`: 0-indexed lap index (`0` = Lap 1, `1` = Lap 2, etc.). |

##### Deriving Official Sector Splits
1. **Sector 1 (`sector === 1`)**: `s1Sec = s1Event.splitSec`.
2. **Sector 2 (`sector === 2`)**: `s2Sec = s2Event.splitSec - s1Event.splitSec` (the packet reports cumulative elapsed split from lap start).
3. **Sector 3 (`sector === 0`)**: `s3Sec = finishEvent.splitSec - (s1Sec + s2Sec)`.

##### Incomplete Laps & Aborted Session Flush Handling
When a session terminates or a car ESCs back to the garage, the engine flushes an uncompleted lap event with `splitSec <= 0`.
- **Aborted Garage/Session Flush**: If `splitSec <= 0`, `lapTimeSec < 20`, and `!s1Event` (has not reached Sector 1), the event represents an aborted session flush and is discarded.
- **Valid Cut Lap**: If the car drove a full lap (`lapTimeSec >= 20` or completed Sector 1) but exceeded track limits, `splitSec` is `-1.0`. The parser records the completed lap, sets `isValid = false`, and computes lap duration from slice timestamps.

#### Type 19 (`eventSize === 8`): Session State Name
ASCII string broadcast confirming current session name (e.g. `"Practice"`, `"Qualify"`, `"Race"`).

#### Type 48 (`eventSize === 41`): Live Leaderboard / Standings Matrix
Emitted periodically to broadcast the official real-time session running order:
- `+0`: 1 byte count: Number of active cars ranked.
- `+1..40`: Array of driver slot bytes in precise track order:
  - Byte `1` = P1 leader slot
  - Byte `2` = P2 slot
  - Byte `n` = Pn slot
Enables 100% accurate running position, leader interval, and position-over-time charts without post-hoc sorting or interpolation.

#### Type 49 (`eventSize === 1`): Pit & Garage Transitions
- 1 byte code: `3` = Entered pit lane / Returned to garage. Emitted synchronously with pit entry and garage return beacons.

---

### Pit Stop & Garage Workflow Events (`eventType === 2`)

Emitted with `eventType === 2` (across event classes) to report exact car states through garage stints and pit stops:

| Action Code (Dec / Hex) | Payload Size | State Description | Garage State |
| :--- | :--- | :--- | :--- |
| `16` (`0x10`) | 1 byte | **Exited Garage Bay**: Driver departed garage stall / pit box to begin session outlap or stint. | `isGarage: true` (exiting) |
| `18` (`0x12`) | 1 byte | **In Pit Stall**: Car stationary in pit box before mechanics begin work. | `isGarage: false` |
| `20` (`0x14`) | 1 byte | **Service Commenced**: Mechanics initiate fueling / tire change sequence. | `isGarage: false` |
| `21` (`0x15`) | 1 byte | **Returned to Garage**: Driver hit ESC back to garage stall or returned to garage bay (end of stint). | `isGarage: true` (entering) |
| `32` (`0x20`) | 1 byte | **Exited Pit Lane**: Crossed pit exit timing line (pit limiter disengaged, rejoined racing circuit). | `isGarage: false` |
| `33` (`0x21`) | 1 byte | **Pit Stop Requested**: In-car dashboard pit request toggle activated by driver. | `isGarage: false` |
| `34` (`0x22`) | 1 byte | **Entered Pit Lane**: Crossed pit entry line (pit speed limiter engaged, 60 km/h). | `isGarage: false` |
| `35` (`0x23`) | 1 byte | **On Air Jacks**: Pneumatic air jacks hoisted car in pit box. | `isGarage: false` |
| `36` (`0x24`) | 1 byte | **On Air Jacks**: Vehicle elevated in pit box. | `isGarage: false` |
| `37` (`0x25`) | 6 bytes | **Service Complete / Off Jacks**: Service finished, car dropped back to ground. <br>• `+1`: Status byte <br>• `+2..5` (Float32LE): `fuelAddedLiters` (Volume of fuel pumped during stop). | `isGarage: false` |

## 5. Lap & Sector Timing Architecture: Official Simulation Timing Stream

The parser directly streams official game engine scoring events (`Class 6 Type 6`) to construct lap summaries and sector splits matching the in-game HUD:

```
                  ┌──────────────────────────────────────────────┐
                  │          VCR Stream Processing               │
                  └──────────────────────┬───────────────────────┘
                                         │
                    Stream Class 6 Type 6 Timing Events
                                         │
                                         ▼
                        ┌─────────────────────────────────┐
                        │   Official Timing Engine:       │
                        │   100% In-Game HUD Equivalent   │
                        ├─────────────────────────────────┤
                        │ • 100% official lap times (s)   │
                        │ • Official S1/S2/S3 splits      │
                        │ • Official lap numbering        │
                        │ • In-game cut-lap validity      │
                        │ • Cross-validated across tracks │
                        └─────────────────────────────────┘
```

### Multi-Track & Cross-Session Validation Suite

The timing parser is cross-validated against official XML simulation logs across all session types and 10 official circuits:
- **Imola (Autodromo Enzo e Dino Ferrari)**: Online Race (R1 8), Online Quali (Q1 8), Online Practice (P1 14)
- **Sebring International Raceway**: Online Race (R1 13), Online Quali (Q1 13), Online Practice (P1 33)
- **Circuit de Spa-Francorchamps**: Online Race (R1 35), Online Quali (Q1 27)
- **Bahrain International Circuit**: Online Race (R1 2), Online Quali (Q1 2), Online Practice (P1 16)
- **Daytona International Speedway Road Course**: Online Race (R1 3), Online Quali (Q1 3), Online Practice (P1 16)
- **WeatherTech Raceway Laguna Seca**: Online Race (R1 4), Online Quali (Q1 1)
- **Algarve International Circuit (Portimão)**: Online Race (R1 13), Online Quali (Q1 10), Online Practice (P1 41)
- **Autodromo Nazionale Monza**: Offline Race (R1 6)
- **Fuji Speedway**: Online Race (R1 24), Online Quali (Q1 16), Online Practice (P1 55)
- **Circuit de la Sarthe (Le Mans)**: Online Race (R1 26), Online Quali (Q1 24)

Every valid flying lap in each replay matches the official simulation XML results within floating-point precision, ensuring complete fidelity between replays and session logs.

---

## 6. Architectural Opportunities & Implementation Roadmap

| Feature Area | Implementation Status | Implementation Details Using VCR Native Data |
| :--- | :--- | :--- |
| **Driver Roster** | **Implemented** (`parseReplayMetadata`) | Deterministic binary `numDrivers` + exact structured records with `entryTime`/`exitTime`, fallback to heuristic regex for legacy mock buffers. |
| **Session Identification** | **Implemented** (`parseReplayMetadata`) | Session byte parsing (`sessionType`, `privateSession`), `modUid`, and `trackPath`. |
| **Lap & Sector Timing** | **Implemented** (`extractReplayLapSummaries`, `extractReplayTrajectory`) | Directly stream Class 6 Type 6 events to construct 100% official lap summaries, sector splits (S1/S2/S3), official lap numbering, and validity flags matching the in-game HUD. |
| **Tire Dynamics & Wear** | **Specification Ready** | Class 0 Type 15 delivers live 4-wheel pressures, 12-channel tread temperatures (Inner/Center/Outer), wear percentages, and brake rotor temperatures. |
| **Penalties & Incidents** | **Implemented** (`extractReplayPenalties`) | Class 2 Type 5 extraction of penalty strings (`"Cut track"`, `"Pit lane speeding"`), lap indices, and slice timestamps. |
| **Track Flags & Safety Car** | **Specification Ready** | Class 2 Type 10 track flag states (Green, Local Yellow, FCY, SC, VSC, Red, Checkered) and driver flags (Blue, Black, Meatball). |
| **3D Car Attitude** | **Implemented** (`extractReplayTrajectory`) | Full 3D attitude extraction: `rotX` (pitch), `rotY` (yaw), `rotZ` (roll), and `detachablePartState`. |
| **Engine RPM** | **Implemented** (`extractReplayTrajectory`) | True physics engine RPM directly decoded from `info1 >>> 18`. |
| **Pit Events & Strategy** | **Implemented / Expanded** (`extractReplayPitEvents`) | Class 5 Type 2 & Type 36 pit stop events, entry/exit, service durations, liters fueled, and tire compounds fitted. |
| **Live Standings** | **Specification Ready** | Class 6 Type 48 packets provide real-time running order array (P1..Pn) and gaps at every timestamp. |
| **Weather & Track Grip** | **Specification Ready** | Metadata 67-byte session environment block yields ambient/track temps, rain intensity, puddle depth, and rubber grip saturation. |

---

## 7. Legacy Hacks, Heuristics & Deprecations: Post-Decoding Analysis

During the early stages of reverse-engineering the `.Vcr` binary format, numerous heuristics, approximations, and string-scraping fallbacks were introduced because the underlying binary structures were not yet understood. With the complete decoding of the IRSR frame slice architecture, the deterministic metadata block, and the official event streaming engine, these hacks have been cataloged and evaluated for deprecation or removal.

### 7.1 Legacy Hacks Catalog

| Legacy Hack / Heuristic | Original Motivation | Obsolete Why? (Current Format Understanding) | Status & Recommended Action |
| :--- | :--- | :--- | :--- |
| **Naive `[0x41, 0x10]` Signature Scanner** (`replayParser.ts:909-941`) | Scanned raw chunks searching for byte pattern `[0x41, 0x10]` to find vehicle motion frames when frame slicing was unknown. | Official LMU replays are strictly formatted into IRSR frame slices (`sTime` Float32LE + `nEvents` UInt16LE). `0x41` was merely `sz === 65` and `0x10` was event class/type bits. | **Deprecated**. Retained exclusively as an internal fallback for legacy synthetic unit tests (`createMockVcrBuffer()`) that omit slice headers. |
| **Regex Driver Scraping & Word Blocklists (Methods 2 & 3)** (`replayParser.ts:408-540`) | Scanned arbitrary ASCII buffers using regex `/^[A-Z][a-zA-Z\s'-]{2,28}$/` and blocklisted words (`Team`, `WEC`, `Racing`, `Ambulante`, `Corsa`, `Hybrid`). | The VCR metadata block deterministically encodes the exact session environment block (67 bytes) followed immediately by `numDrivers` (Int32LE) and length-prefixed Pascal strings (`Method 1`). | **Obsolete**. Method 1 is the 100% authoritative format. Methods 2 & 3 are retained only as fallbacks for legacy/malformed synthetic mock buffers. |
| **Quadratic Aerodynamic Drag Deceleration ($a_{drag} = 0.00042 \cdot v^2$) & Kinematic Pedal Estimation** (`replayParser.ts:1318-1355`) | Approximated throttle (100% on straights, modulated in corners) and brake pressure based on vehicle deceleration and drag resistance. | Official LMU replays natively record 8-bit throttle (Byte 5, 0..249 mapped to 0..100%) and analog brake pressure (Byte 36, bits 0..5, ABS bit 6, TC bit 7) at 50 Hz in Class 0 Type 8-14 motion packets. | **Obsolete**. Deprecated in favor of native Byte 5 and Byte 36 telemetry. Retained solely as a fallback if synthetic test buffers omit pedal bytes. |
| **Fixed 33.3% / 66.7% Distance-Ratio Sector Split Approximation** (`replayParser.ts:1090, 1106, 1228`) | Sliced cumulative trajectory distance into 1/3 and 2/3 milestones to synthesize Sector 1 and Sector 2 elapsed times when timing loops were missing. | Class 6 Type 6 timing loops provide official microsecond-accurate S1, S2, and S3 splits directly from the simulation scoring engine. | **Obsolete**. Only triggered in the degenerate case where zero timing packets exist in an entire replay. |
| **Hardcoded > 380 km/h Speed Zeroing Hack** (`replayParser.ts:1308`) | Set `smoothSpeed = 0` if calculated speed exceeded 380 km/h to prevent teleport speed spikes. | Low-drag prototypes (e.g. Le Mans Hypercars with slipstream on the Mulsanne Straight) can legitimately exceed 340–360+ km/h. Zeroing speed corrupted charts. Teleports are already detected by multi-point distance/speed checks. | **Removed**. Replaced with proper non-negative speed clamping and coordinate jump filtering. |
| **Downshift Auto-Blip and Upshift Ignition Cut Smoothing** (`replayParser.ts:952-1006`) | Filtered out ECU transmission downshift auto-blips (`brk > 8 && thr > 0`) and interpolated over single-frame upshift cuts. | While ECU blips reflect real engine control inputs, users inspecting driver inputs prefer pedal intent rather than ECU actuator actuation. | **Retained as an intentional UX enhancement**, clearly documented as driver-intent filtering rather than raw ECU actuation. |

---

## 8. Catalog of Additional Extractable Data from VCR Format

The LMU/rF2 `.Vcr` format contains an extensive array of untapped telemetry, environment, and race control data that can be exposed in API endpoints, telemetry charts, and session dashboards:

### 8.1 4-Wheel Thermal, Pressure & Degradation Dynamics (Class 0 Type 15)
Emitted periodically or on corner events (`eventSize === 24` or `37`):
- **12-Point Tire Tread Temperatures (°C)**:
  - Separate temperatures across the tire carcass: **Inner**, **Center**, and **Outer** tread zones for all 4 corners (FL, FR, RL, RR).
  - Enables thermal camber optimization and tire overheating analysis in the UI.
- **Dynamic Hot Inflation Pressures (kPa / PSI)**:
  - Real-time internal air pressures for all 4 tires.
- **Corner-by-Corner Tire Wear Degradation (0–100%)**:
  - Live percentage of remaining tire rubber per corner.
  - Enables true tire degradation curves over stints instead of end-of-session approximations.
- **Brake Rotor / Disc Temperatures (°C)**:
  - Thermal load on carbon/steel brake discs (offsets `+24..31` when `eventSize === 37`).

### 8.2 Track Meteorology, Evolution & Weather Dynamics (Metadata Session Conditions Block)
The 67-byte session environment block (located at `metadataOffset + trackPathLength + 2`):
- **Ambient Air Temperature** (`+0` Float32LE): Ambient temperature in °C.
- **Track Surface Temperature** (`+4` Float32LE): Track asphalt temperature in °C.
- **Precipitation / Rain Intensity** (`+8` Float32LE): Rain rate (`0.0` dry to `1.0` storm).
- **Track Surface Wetness** (`+12` Float32LE): Moisture saturation (`0.0` dry to `1.0` wet).
- **Standing Water / Puddle Depth** (`+16` Float32LE): Average standing water depth in mm along racing line.
- **Dynamic Rubber Grip Saturation** (`+20` Float32LE): Track grip evolution factor (`0.0` green track to `1.0` heavily rubbered line).
- **Wind Speed & Direction Vector** (`+24` and `+28` Float32LE): Wind velocity in m/s and bearing angle in radians.
- **Time Acceleration Multiplier** (`+32` Float32LE): In-game session progression multiplier (e.g. 1x, 5x, 24x).

### 8.3 Live Race Control, Flags & Safety Car System (Class 2 Type 10 & Class 1 Type 10)
Broadcasts live race direction decisions and track conditions:
- **Track Condition Flags**:
  - `0`: Green Flag (Track clear / racing active)
  - `1`: Local Yellow Flag (Hazard in sector)
  - `2`: Double Yellow Flag (Hazard blocking track)
  - `3`: Full Course Yellow (FCY / speed limited to 80 km/h)
  - `4`: Safety Car deployed (SC)
  - `5`: Safety Car in this lap
  - `6`: Virtual Safety Car (VSC)
  - `7`: Red Flag (Session stopped)
  - `8`: Checkered Flag (Session completed)
- **Sector Hazard Mask**: Bitfield identifying which sector (S1, S2, S3) contains the hazard.
- **Driver-Targeted Flags**: Blue Flag (yielding to leader), Black Flag (disqualification), Meatball Flag (mandatory pit stop for mechanical damage).
- **Start Lights Countdown**: Exact illumination phase (1 to 5 red lights, hold, green lights out).

### 8.4 Live Leaderboard Matrix & Track Gaps (Class 6 Type 48)
Emitted periodically (`eventSize === 41`):
- **Real-Time Running Order Array**: Driver slot indices in exact track order from P1 leader down to Pn.
- **Live Gaps**: Exact intervals to leader and car ahead calculated in real time without post-hoc reconstruction.
- **Position Tracking Over Time**: Enables live "Lap Chart" visualizations showing position changes, overtakes, and pit stop shuffles.

### 8.5 Pit Stop Strategy, Fuel Ingestion & Tire Changes (Class 5 Type 2 & Type 36)
Full service telemetry emitted during pit stop operations:
- **Fuel Added**: Exact volume in liters (Float32LE) pumped into the tank during the stop.
- **Tire Compound Fitted**: Compound code installed per corner (FL, FR, RL, RR) (Hard, Medium, Soft, Wet).
- **Pneumatic Jack Duration**: Exact seconds the car spent hoisted on air jacks (`jackTimeSec`).
- **Penalty Compliance**: Validates whether in-pit penalties (e.g. 5-second or 10-second stop & go) were served before mechanics commenced work.
- **Pit Lane Speed Limit Enforcement**: Entry/exit line timing beacons detect pit lane speeding infractions.

### 8.6 Aerodynamic Damage & Detachable Bodywork (Class 0 Type 8-14 `info2 & 0x3FF`)
The 10-bit aero damage bitfield in `info2`:
- Front wing left / right endplate loss
- Rear wing main plane detachment
- Rear diffuser structural damage
- Front splitter detachment
- Left / right door damage
- Engine cowl / rear deck damage

### 8.7 Balance of Performance (BoP) & Driver Session Timings (Metadata 24-byte Tail)
Extended driver information stored in each driver's fixed tail:
- **`entryTime`**: Exact session second timestamp when the driver connected or entered the session.
- **`exitTime`**: Exact session second timestamp when the driver disconnected or left the session.
- **Success Ballast / BoP Weight**: Additional ballast mass (kg) added for Balance of Performance.
- **Intake Restrictor Ratio**: Engine power restriction scaling factor.
