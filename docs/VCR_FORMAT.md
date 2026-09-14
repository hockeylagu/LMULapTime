# Le Mans Ultimate / rFactor 2 VCR Replay File Format Specification

This document is the **reference** for the binary structure of the `.Vcr` replay file format used
by **Le Mans Ultimate (LMU)** and the **rFactor 2 (rF2 / gMotor)** engine: byte offsets, bit
masks and payload layouts. It states only what is established.

For how these fields were discovered, confidence levels, open leads, superseded hypotheses,
implementation status and future work, see **[VCR_ANALYSIS.md](VCR_ANALYSIS.md)**. Keep the two
separate: no evidence or speculation in this file.

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
- **Next 67 bytes**: Session conditions block. Layout not established.

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

**Gear is encoded in the event header's `eventType` field, not in the payload.**
`eventType` ranges 7..15 for these packets, mapping to `gear = eventType - 8`:
`7` = reverse (-1), `8` = neutral (0), `9..15` = forward gears 1..7. Available for every driver,
player and AI. Retain the pose size/type checks but do not hard-gate on `eventClass`.

The transmission genuinely passes through neutral for 2-3 frames during every real up/downshift
(clutch/dog-ring disengagement) - this is authentic telemetry, not noise. Code that detects gear
transitions must therefore track the last non-zero gear rather than compare adjacent frames.

**Engine RPM** is a 10-bit field spanning byte 6 bit 5 through byte 7 bit 6
(absolute bits 53..62):

```js
const raw10 = (payload.readUInt16LE(6) >>> 5) & 0x3ff;
const rpm   = 10.9228 * raw10;   // scale is absolute, not normalised per car
```

The field saturates at 1023, i.e. ~11,170 rpm, and would wrap silently above that.

| Offset in Payload | Size | Type | Field & Bitfield Description |
| :--- | :--- | :--- | :--- |
| `0` | 4 bytes | UInt32LE | **`info1`**: <br>• Bits 0..6: `steerYaw` (Steering angle / 127) <br>• Bits 11..16: `throttle` (Throttle level 0..63) <br>• Bit 17: `inPit` (1 = in pit lane / garage) <br>• Bits 18..31: unidentified (**not** RPM) |
| `4` | 4 bytes | UInt32LE | **`info2`**: <br>• Bits 0..9: `detachablePartState` (Bitmask of detached / damaged aero body parts) |
| `4` | 2 bytes | UInt16LE | **`steer10`**: Steering wheel position: `(raw16 & 0x3FF)`, angle = `((steer10 - 512) / 512) * 270` deg (540° lock-to-lock range, ±270°) |
| `5` | 1 byte | UInt8 | **`rawThrottle`**: 8-bit throttle pedal position (1 = 0%, 249 = 100%) |
| `6..7` | 10 bits | Bitfield | **`engineRpm`**: `(readUInt16LE(6) >>> 5) & 0x3FF`, rpm = `raw * 10.9228` |
| `8..12` | 5 bytes | Binary | Speed / velocity vector info |
| `13..35` | 23 bytes | Binary | Vehicle dynamics; individual fields are not established |
| `36` | 1 byte | UInt8 | **`rawBrake`** & Systems: <br>• Bits 0..5: Analog brake pressure (0 to 63 = 0% to 100%) <br>• Bit 6 (`0x40`): ABS Active flag <br>• Bit 7 (`0x80`): Traction Control (TC) Active flag |
| `38` | 1 byte | UInt8 | **`vehicleStatus`**: <br>• Bit 0 (`0x01`): Off-track / track limit cut violation <br>• Bit 2 (`0x04`): Pit limiter engaged (holding 60 km/h) <br>• Bit 7 (`0x80`): Inside pit lane boundary |
| `41` | 4 bytes | Float32LE | **`x`**: World coordinates X (lateral position in meters) |
| `45` | 4 bytes | Float32LE | **`y`**: World coordinates Y (elevation in meters) |
| `49` | 4 bytes | Float32LE | **`z`**: World coordinates Z (longitudinal position in meters) |
| `53` | 4 bytes | Float32LE | **`rotX`**: Pitch angle (radians) |
| `57` | 4 bytes | Float32LE | **`rotY`**: Yaw / heading angle (radians) |
| `61` | 4 bytes | Float32LE | **`rotZ`**: Roll angle (radians) |

#### Type 15 (`eventSize === 24` or `37`): Brake Rotor Temperature & Chassis Dynamics Packet
Emitted periodically alongside vehicle motion packets (at up to ~50 Hz per car). Contains chassis dynamics state and brake rotor temperature.

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0..15` | 16 bytes | Binary | Unestablished chassis dynamics state. |
| `16..21` | 6 bytes | Binary | Internal chassis motion sync and cycle counter bitfields. |
| `22..23` | 2 bytes | UInt16LE | **Brake Rotor Temperature**: Byte 23 (and UInt16LE at byte 22) is the brake rotor disc thermal state. <br>Calibration: `tempC = max(20, round((byte23 - 51) * 5.86 + 29))`. <br>Front axle: `[tempC, tempC]`; Rear axle: `[0.88 * tempC, 0.88 * tempC]`. |
| `24..36` (`sz === 37`) | 13 bytes | Binary | Extended dynamics / chassis state (rare variant, present on select vehicles). |

*Grid Scope: In online multiplayer races, this packet is recorded for all drivers across the entire grid. Per-wheel rubber wear degradation and carcass temperatures are not stored in this packet.*

#### Type 51 (`eventSize === 3`): Onboard Fuel Level Packet
Emitted continuously throughout stints (~50 Hz per car) to broadcast fuel remaining in tank:

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0..1` | 2 bytes | UInt16LE | **Fuel Level**: Onboard fuel remaining in tank (monotonically decreases from full capacity down to reserve across stints). |
| `2` | 1 byte | UInt8 | Fuel pump / feed status indicator. |

*Grid Scope: In online multiplayer races, this packet is recorded exclusively for the local player's vehicle.*

#### Type 7: Garage Event
- Float32LE: Timestamp of entering/exiting garage bay.

---

### Class 1: Wheel Dynamics & Session Visuals

#### Type 24 (`eventSize === 40`): 4-Corner Wheel Dynamics & Braking Packet
Emitted continuously at up to ~50–100 Hz per car. Contains granular per-wheel physics structured as **4 discrete 10-byte corner blocks**:
- **Front-Left (FL)**: Bytes `0..9`
- **Front-Right (FR)**: Bytes `10..19`
- **Rear-Left (RL)**: Bytes `20..29`
- **Rear-Right (RR)**: Bytes `30..39`

Each 10-byte corner block contains:

| Relative Offset | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `+0` | 1 byte | UInt8 | Unestablished corner state byte. |
| `+2..3` | 2 bytes | UInt16LE | **Corner Brake Pressure**: Individual wheel hydraulic braking line pressure. |
| `+6..7` | 2 bytes | UInt16LE | **Chassis / Track Datum**: Static axle datum (`~1399-1404` for front, `~1454-1460` for rear). Does not vary with wheel rotation or speed; wheel speeds are not recorded in this packet. |
| `+7..8` | 2 bytes | Int16LE | Unestablished corner dynamics field. |
| `+9` | 1 byte | UInt8 | Corner brake pressure high byte / ABS modulation flag. |

*Grid Scope: In online multiplayer races, this packet is recorded exclusively for the local player's vehicle. Dedicated servers strip opponent 4-wheel dynamics to conserve network bandwidth.*

- **Type 10**: payload size and layout not established (a documented single-byte `startLightsCode`
  variant has not been observed).
- **Type 23**: payload size and layout not established (a documented 4-byte countdown variant has
  not been observed).

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
- **Type 10**: Track Condition & Flag Status (**Class 3**, payload always 3 bytes):
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
  - 1 byte: second byte, meaning not established.
  - 1 byte: third byte, meaning not established.

---

### Class 6/7 (or 3): Timing Loops, Standings & Pit Lane

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
#### Type 19: Session State Name
ASCII string (Class 7, length matches the session name exactly, e.g. `"Race"`) broadcast at
session start confirming the current session name. A separate single-byte variant of Type 19
also occurs repeatedly through a session; its meaning is not established.

#### Type 48 (`eventSize === 41`): Live Leaderboard / Standings Matrix
Emitted periodically (Class 7) to broadcast the official real-time session running order:
- `+0`: 1 byte count: Number of active cars ranked.
- `+1..20`: 20 bytes, meaning not established.
- `+21..40`: Array of up to 20 driver slot bytes in track order:
  - Byte `21` = P1 leader slot
  - Byte `22` = P2 slot
  - Byte `21+n-1` = Pn slot
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



