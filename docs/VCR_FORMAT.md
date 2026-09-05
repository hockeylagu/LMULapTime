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

- **Byte 0**: Unknown configuration / flags byte.
- **Byte 1 (`sessionInfo`)**:
  - `sessionInfo & 0x0F` = Session Type Code:
    - `0`: Test Day
    - `1` - `4`: Practice (P1, P2, P3, P4)
    - `5` - `8`: Qualifying (Q1, Q2, Q3, Q4)
    - `9`: Warmup
    - `10` - `13`: Race (R1, R2, R3, R4)
  - `(sessionInfo >> 7) & 0x01`: Private / Dedicated session flag (`true` / `false`).
- **Next 67 bytes**: Environment & conditions block (track temperature, ambient temperature, wetness/grip presets, time progression multipliers).

### 2.3 Structured Driver Roster
Located immediately after the 67-byte session conditions block:

- **`numDrivers` (4 bytes, Int32LE)**: Total number of drivers in the session.
- **Driver Records (repeated `numDrivers` times)**:
  - `slot` (1 byte, UInt8 or UInt16LE): In-game driver slot index.
  - `name` (1-byte length prefix + UTF-8 string): Driver full name (e.g. `"Douglas Riviera"`).
  - `vehicleId` (1-byte length prefix + UTF-8 string): Car skin / vehicle ID token (e.g. `"32_26_WRT_83524148"`).
  - `livery / vehicle version` (1-byte length prefix + UTF-8 string): Custom livery hash or version code.
  - `team` (1-byte length prefix + UTF-8 string): Team name (e.g. `"Team WRT 2026 #32"`).
  - `carNumber` (1-byte length prefix + UTF-8 string): Car number string (e.g. `"32"` or `"1"`).
  - **Fixed 24-byte Driver Status Tail**:
    - `0..15` (16 bytes): Unknown vehicle state / class flags.
    - `16..19` (4 bytes, Float32LE): `entryTime` (Session time in seconds when driver entered).
    - `20..23` (4 bytes, Float32LE): `exitTime` (Session time in seconds when driver exited / disconnected).
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

#### Type 15 (`eventSize === 24` or `37`): Per-Wheel Telemetry
Contains individual 4-wheel telemetry (Front-Left, Front-Right, Rear-Left, Rear-Right):
- Tire pressures (kPa / PSI)
- Tire temperatures (Inner, Center, Outer)
- Tire wear percentages remaining

#### Type 7: Garage Event
- Float32LE: Timestamp of entering/exiting garage bay.

---

### Class 1: Session Control & Visuals

- **Type 10**: Start Lights Status:
  - 1 byte integer: Number of illuminated lights (`1` to `6` red/green start lights).
- **Type 23**: Session Countdown:
  - 4 bytes UInt32LE: Seconds remaining until session green flag or expiration.

---

### Class 2: Penalties, Incidents & Race Control

- **Type 5**: Penalty Issued Event:
  - 1 byte: `penaltyId` (Infraction type code)
  - 2 bytes: Penalty code / rule reference
  - Variable string (`eventSize - 3` bytes): Exact human-readable infraction text (e.g. `"Cut track"`, `"Pit lane speeding"`, `"False start"`).
- **Type 7**: Penalty Served Event:
  - 1 byte: `0` = Stop & Go served, `1` = Drive Through served.
- **Type 8**: Penalty Rescinded:
  - 1 byte: Penalty cancelled by race control / server admin.
- **Type 10**: Track condition flags (Green, Local Yellow, Full Course Yellow, Safety Car).

---

### Class 6 (or 3): Timing Loops, Standings & Pit Lane

#### Type 6 (`eventSize === 21`): Authoritative Timing Loop Checkpoint
Fired when a vehicle crosses an electronic simulation timing loop (Start/Finish line, Sector 1, Sector 2).

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

#### Type 48 (`eventSize === 41`): Live Leaderboard / Standings Order
Emitted periodically to broadcast the official session running order.
Contains an array of driver slot bytes in order of track position (P1, P2, P3... Pn).

#### Type 49: Pit Transitions
- 1 byte code: `3` = Entered pit lane, `4` = Returned to garage.

---

### Class 5: Pit Stop Service Operations

- **Type 2**: Pit Lane Workflow States:
  - `32`: Exited pit lane
  - `33`: Pit stop requested (in-car dash button pressed)
  - `34`: Entered pit lane speed limit line
  - `35`: Car stopped in pit box / hoisted on pneumatic air jacks
  - `36`: Service complete / dropped off jacks (includes service payload: liters of fuel added, tire compounds fitted, damage repair time).

---

## 5. Lap & Sector Timing Architecture: Dual-Path Processing Strategy

The parser utilizes a resilient **dual-path strategy** to balance 100% official accuracy with graceful degradation across non-standard replay files:

```
                  ┌──────────────────────────────────────────────┐
                  │          VCR Stream Processing               │
                  └──────────────────────┬───────────────────────┘
                                         │
                   Has Class 6 Type 6 Finish Timings?
                                         │
                      ┌──────────────────┴──────────────────┐
                     YES                                   NO
                      ▼                                     ▼
        ┌────────────────────────────┐        ┌────────────────────────────┐
        │       Primary Path:        │        │     Secondary Fallback:    │
        │   Official Timing Events   │        │ Autonomous Geometric Cross │
        ├────────────────────────────┤        ├────────────────────────────┤
        │ • 100% official lap times  │        │ • Start/Finish candidate   │
        │ • Official S1/S2/S3 splits │        │   density clustering       │
        │ • Official lap numbering   │        │ • Heading vector filtering │
        │ • HUD cut-lap validity     │        │ • Cumulative distance splits│
        │ • Zero geometric error     │        │ • Fallback for edge cases  │
        └────────────────────────────┘        └────────────────────────────┘
```

### Why the Geometric Fallback is Retained as a Safety Net

While standard Le Mans Ultimate replays always contain `Class 6 Type 6` events, the autonomous geometric coordinate crossing fallback (`if (detectedLaps.length === 0)`) is intentionally preserved in the codebase for four critical scenarios:

1. **Truncated Replay Snippets / Mid-Lap Clips**:
   When a user records or clips a short stint where the car never crosses the Start/Finish line, `finishTimings.length === 0`. Without the geometric fallback, the parser would return 0 laps and an empty trajectory. With the fallback, the vehicle's driving path and lap segments are still reconstructed.
2. **High-Grid Multiplayer Replays (Distance / Network Culling)**:
   In massive online sessions (e.g. 30+ cars), rFactor 2 / LMU occasionally optimizes packet throughput by streaming positional motion slices (`Class 1 Type 1`) for distant rival or spectator cars without broadcasting their full Class 6 scoring events. The fallback enables analyzing rival trajectories regardless of whether the game engine streamed their scoring loops.
3. **Custom / Modded Track Conversions**:
   In community track mods or converted layouts, track designers sometimes misconfigure or omit AIW timing checkpoint trigger volumes. The geometric fallback allows telemetry and trajectory visualization to function seamlessly.
4. **Synthetic Unit Tests & External Feeds**:
   Mock VCR generators or external GPS data feeds providing coordinate streams without game engine scoring loops continue to be fully supported.

> [!NOTE]
> **Zero Runtime Overhead**: When official timing packets are present, `detectedLaps` is populated by the primary path, and the geometric fallback is completely bypassed with zero performance cost.

---

## 6. Architectural Opportunities & Implementation Roadmap

| Feature Area | Implementation Status | Implementation Details Using VCR Native Data |
| :--- | :--- | :--- |
| **Driver Roster** | **Implemented** (`parseReplayMetadata`) | Deterministic binary `numDrivers` + exact structured records with `entryTime`/`exitTime`, fallback to heuristic regex. |
| **Session Identification** | **Implemented** (`parseReplayMetadata`) | Session byte parsing (`sessionType`, `privateSession`), `modUid`, and `trackPath`. |
| **Lap & Sector Timing** | **Implemented** (`extractReplayLapSummaries`, `extractReplayTrajectory`) | Directly stream Class 6 Type 6 events to construct 100% official lap summaries, sector splits (S1/S2/S3), official lap numbering, and validity flags matching the in-game HUD. Retains geometric crossing fallback. |
| **Tire & Fuel Wear** | Planned | Class 0 Type 15 gives live 4-wheel tire wear; Class 5 Type 2 provides exact pit fuel additions. |
| **Penalties & Cuts** | **Implemented** (`extractReplayPenalties`) | Class 2 Type 5 extraction of penalty strings (`"Cut track"`, `"Pit lane speeding"`), lap indices, and slice timestamps. |
| **3D Car Attitude** | **Implemented** (`extractReplayTrajectory`) | Full 3D attitude extraction: `rotX` (pitch), `rotY` (yaw), `rotZ` (roll), and `detachablePartState`. |
| **Engine RPM** | **Implemented** (`extractReplayTrajectory`) | True physics engine RPM directly decoded from `info1 >>> 18`. |
| **Pit Events** | **Implemented** (`extractReplayPitEvents`) | Class 5 Type 2 & Type 3 pit stop events, entry/exit, service durations, and fueling. |
| **Live Standings** | Planned | Read Class 6 Type 48 packets for live position tracking at every moment of the session. |
