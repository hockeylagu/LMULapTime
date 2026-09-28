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
- **Next 67 bytes**: Session rules and game settings block (mirrors XML results flags):
  - `+8` (4 bytes, UInt32LE): `DamageMult` (e.g. `100` = `0x64`).
  - `+16` (4 bytes, UInt32LE): `FuelMult` (e.g. `1` = `0x01`).
  - `+20` (4 bytes, UInt32LE): `TireMult` (e.g. `1` = `0x01`).
  - `+32` (4 bytes, UInt32LE): `RaceTime` in minutes (e.g. `20` = `0x14`, `30` = `0x1E`).
  *(Note: This block stores static session rules; live weather and track precipitation are broadcast continuously in Class 1 Type 10 packets).*

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

**Bit 29 is a per-file flag, not part of the class.** It is set on every event of a race
replay and clear on every event of a practice or qualifying replay (71/71 race files set,
158/158 practice/qualifying files clear). The same packet therefore appears as raw class `1`
in a race and `0` in practice (`3`↔`2`, `7`↔`6`). Identify packets by the two high bits:

```javascript
const sessionFlag = (eventHeader >>> 29) & 1;  // 1 = race replay, 0 = practice / qualifying
const classGroup  = (eventHeader >>> 30);      // 0, 1 or 3: the class without the flag
```

### 3.3 Raw Class Values
The section headings in §4 are historical groupings. The raw `eventClass` bits of the
established packets are (race value, then practice/qualifying value):

| Packet | Raw `eventClass` race / P+Q | `eventType` / `eventSize` | Scope |
| :--- | :--- | :--- | :--- |
| Vehicle pose & inputs | `1` / `0` | `7..15` / `65` | every car |
| Brake rotor temperature | `1` / `0` | `15` / `24` or `37` | every car |
| Virtual energy | `1` / `0` | `51` / `3` | player car |
| Weather broadcast | `1` / `0` | `10` / `80` | `driverSlot = 255` |
| Tyre compound | `1` / `0` | `16` / `4` | every car |
| Contact event | `1` / `0` | `17` / `33` | reporting car |
| Impact event | `1` / `0` | `6` / `10` | reporting car |
| Damage & sector-best events | `1` / `0` | `23`, `26`, `29..31` / `23` | reporting car |
| Downshift marker | `1` / `0` | `0` / `0` | player car |
| Player chassis (per wheel) | `3` / `2` | `24` / `40` | player car |
| Player sound events (gearshift, limiter) | `3` / `2` | `11` / `22` | player car |
| Track flag state | `3` / `2` | `10` / `3` | `driverSlot = 255` |
| Timing loop checkpoint | `7` / `6` | `6` / `21` (online) or `18` (offline) | every car |
| Penalty issued | `7` / `6` | `5` / variable | penalised car |
| Penalty served | `7` / `6` | `7` / `1` | penalised car |
| Track-limits verdict | `7` / `6` | `28` / `4` | every car |
| Standings matrix | `7` / `6` | `48` / `21 + N` | `driverSlot = 255` |
| Packet stream (not decoded) | `7` / `6` | `9` / variable | `driverSlot = 255` |
| Sequenced opaque messages (not decoded) | `7` / `6` | `60` / variable | `driverSlot = 255` |

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

#### Type 51 (`eventSize === 3`): Virtual Energy Packet
Emitted continuously (~50 Hz) for the player car. It carries **Virtual Energy**, not fuel.

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0` | 1 byte | UInt8 | **Virtual Energy**: `VE% = byte / 2.55` (i.e. `byte = round(VE% × 2.55)`, 0.39 % resolution). |
| `1` | 1 byte | UInt8 | `2` for the first seconds of a practice / qualifying session (car still in the garage), otherwise `0`. |
| `2` | 1 byte | UInt8 | **Pit-request state**: non-zero from a few seconds before the pit-request event (pit code `33`) until service completes (code `37`), or to the end of the session if the stop is never taken. Values seen: `4`, `8`, `13`, `16`, `64`, `128`; their meaning is not established. |

*Grid Scope: Recorded exclusively for the local player's vehicle.* Validated against DuckDB on
34 player sessions (practice, qualifying and race) of LMGT3 (BMW M4, Corvette Z06, McLaren 720S)
and Hypercar (Peugeot 9X8): byte 0 = `round(VE% × 2.55)` in 100 % of samples (one session
99.95 %). **Cars without a VE system still send the packet, with byte 0 = 0 for the whole
session**: GTE (Aston Martin Vantage, 4 sessions) and LMP3 (Ginetta / Duqueine / ADESS / Ligier,
6 sessions at Monza). The replay does **not** store fuel for these cars, and neither does byte 0
for VE cars. LMU's own replay viewer agrees: an LMP3 replay loaded in-game shows neither fuel
nor VE. Treat a car that never reports a non-zero byte 0 as having no VE.

#### Type 7: Garage Event
- Float32LE: Timestamp of entering/exiting garage bay.

---

### Class 1: Session Events & Weather

#### Type 10 (`eventSize === 80`): Track Meteorology, Rain Intensity & Surface Condition Broadcast
Emitted periodically at ~0.5 Hz (every 1.5–2 seconds) across all sessions. Broadcast with `driverSlot === 255` (`0xFF`) to report global track meteorology, surface precipitation, and ambient temperature:

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0..3` | 4 bytes | Float32LE | **Simulation Time**: Game physics clock in seconds (advances in 3.333s / 10/3 intervals). |
| `6..9` | 4 bytes | Float32LE | Linear ramp with session time (~0.0016 per second). Meaning not established. |
| `10..13` | 4 bytes | Float32LE | Linear ramp with session time, offset from `6..9`. Meaning not established. |
| `14..37` | 24 bytes | Binary | Not established. |
| `38` | 1 byte | UInt8 | **Ambient Temperature**: `ambientC = byte / 8 + 5.9` (0.125 °C resolution). |
| `39` | 1 byte | UInt8 | Constant `0x81` (129) in every replay examined. **Not** track temperature. |
| `40..41` | 2 bytes | Binary | Not established. |
| `42..77` | 36 bytes | Binary | **Rain / Surface Wetness**: 9 blocks of 4 bytes, each `[w, w, w, 0x00]`. `rain = w / 255` is the simulation's `raining` value (0.0 = dry). In every replay examined, all 9 blocks carry the same value. |

**Track surface temperature is not stored in the replay.** The engine recomputes it during
playback from the stored weather state. Take it from DuckDB (`Track Temperature`) when you
need it.

*Grid Scope: Global broadcast packet (`driverSlot === 255`). Recorded in both online multiplayer and offline practice sessions.*

#### Type 16 (`eventSize === 4`): Tyre Compound per Wheel
Emitted for every car when it loads onto the grid and again whenever its tyres change.

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0` | 1 byte | UInt8 | Front-left compound index |
| `1` | 1 byte | UInt8 | Front-right compound index |
| `2` | 1 byte | UInt8 | Rear-left compound index |
| `3` | 1 byte | UInt8 | Rear-right compound index |

The index is the compound's position in the car's tyre file: the same index as the XML results'
`fcompound` / `rcompound` (`"0,Medium"`, `"1,Wet"`). Names must be resolved per car. The last
packet before a lap gives the compound fitted for that lap. A packet after the chequered flag
may reset the value.

*Grid Scope: Every car, in every session type (raw class `1` in races, `0` in practice/qualifying; §3.2).*

#### Type 17 (`eventSize === 33`): Contact Event
Emitted once per contact, by the reporting car (header `driverSlot`). A car-to-car contact
produces one packet per car. This packet is the source of the XML results' `<Incident>` rows.

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0..7` | 8 bytes | Binary | Not established (four Int16LE values that vary per contact). |
| `8..11` | 4 bytes | Float32LE | **Impact magnitude**: the value in the XML `reported contact (x)`. |
| `12..27` | 16 bytes | Binary | Identity hash of the other object; constant per object type within a session. |
| `28..31` | 4 bytes | UInt32LE | Small per-object id that accompanies the hash (e.g. `0x4f` / `0x50`). |
| `32` | 1 byte | UInt8 | **Other party**: the other car's driver slot, or an object code (below). |

| Object code | XML name |
| :--- | :--- |
| `105` | Cone |
| `106` | Post |
| `107` | Sign |
| `108` | Wheel (a detached wheel) |
| `109` | Wing (detached bodywork) |
| `112` | Immovable (walls, barriers) |

The contact time is the slice `sTime` (0.02 s resolution).

*Grid Scope: Every car, in every session type (raw class `1` in races, `0` in practice/qualifying; §3.2).*

#### Type 6 (`eventSize === 10`): Impact Event
Emitted by the reporting car around hard impacts, often several in a row (e.g. 4 packets 20 ms
apart). 492 of 578 in the corpus sit within 0.3 s of a Type 17 contact by the same car.

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0..5` | 6 bytes | Binary | Not established. |
| `6..9` | 4 bytes | Float32LE | Session time of the impact (equals the slice `sTime` within 0.2 s in 578/578). |

#### Types 23, 26, 29, 30, 31 (`eventSize === 23`): Damage & Sector-Best Events
One packet per XML `<Sector>` row, emitted by the car named in that row (header `driverSlot`).
The 23-byte payload is all zeros in every packet of the corpus; the type carries the meaning.

| Type | XML `<Sector>` text |
| :--- | :--- |
| `23` | `reports new engine damage` |
| `26` | `reports new suspension damage` |
| `29` | `set new best for sector 1` |
| `30` | `set new best for sector 2` |
| `31` | `set new best for sector 3` |

#### Type 0 (`eventSize === 0`): Downshift Marker
Player car only, no payload. Every one coincides with a Class 3 Type 11 downshift event (277/277
in three races), but only about a third of downshifts carry one. What selects them is not
established.

---

### Class 3: High-Frequency Wheel Dynamics & Chassis Physics

#### Type 24 (`eventSize === 40`): Player Chassis Packet (per wheel)
Emitted continuously (~50 Hz, one per player pose). Four 10-byte blocks, one per wheel, in the
order `[FL, FR, RL, RR]` (block `k` starts at `k × 10`):

| Offset in block | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0` | 1 byte | Int8 | Not established. Tracks longitudinal G (r ≈ 0.93), with a side-dependent offset (left wheels negative, right positive). |
| `1`, `2`, `4`, `5` | 1 byte each | Int8 | Mostly `0` / `±1`. Not established. |
| `3` | 1 byte | Int8 | Not established. Small range; follows brake force on the front wheels. |
| `6..7` | 2 bytes | UInt16LE | **Tyre radius–like value**: constant per axle and car at rest, growing with the square of wheel speed (`value = a + k × v²`, residual 0.3 = integer rounding). Rest values: Corvette / McLaren GT3 front 1399, rear 1454; Peugeot 9X8 1487 on all four (equal tyre sizes). A unit of 0.25 mm gives plausible radii (350 / 364 / 372 mm). |
| `8` | 1 byte | Int8 | Not established. Tracks longitudinal G (r ≈ 0.95), larger scale than byte `0`. |
| `9` | 1 byte | Int8 | Not established. Range `-1..1`; follows brake on the front wheels and throttle on the rear wheels (a drive/brake torque sign). |

The earlier "per-wheel brake line pressure" reading of these blocks is not supported.

*Grid Scope: Recorded exclusively for the local player's vehicle.*

#### Type 11 (`eventSize === 22`): Player Sound / Animation Event
Player car only. Fired for discrete driver actions. Not decoded by the app: it duplicates the pose
`gear` channel, only timed to the frame.

| Offset in Payload | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `0` | 1 byte | UInt8 | Varies per event (93..110). Not established. |
| `1` | 1 byte | UInt8 | Varies per event (even values `0x5c..0x7e`). Not established. |
| `2..17` | 16 bytes | Binary | Event hash, identical across cars and sessions for the same action. |
| `18..21` | 4 bytes | UInt32LE | **Event id**: `52` = upshift, `55` = downshift, `88` = pit limiter toggle, `97` = not established (rare). |

The hash prefixes are `555da8e9…` (upshift), `6868bfaf…` (downshift), `5655040e…` (limiter) and
`fd2e6aff…` (id 97). On three cars (Corvette GT3, Peugeot 9X8, McLaren GT3), 637 of 638 gear
changes found independently as RPM steps in DuckDB have one of these events within 0.3 s, and
upshift events show an RPM drop in 894 of 900 cases.

*Grid Scope: Recorded exclusively for the local player's vehicle.*

#### Type 25 (`eventSize === 34`): High-Frequency Physics Sub-Tick Sync Packet
Emitted continuously alongside Type 24 for the local player. Byte 3 steps sequentially across sub-ticks (e.g. stepping by 13 cycles).

---

### Class 2: Penalties, Incidents & Race Control

Penalty packets are raw class **7** (race) / **6** (practice/qualifying), i.e. class 3 once
bit 29 is masked, not class 2. Validated against the XML `<Penalty>` rows of 69 races: 108/108
served matched. Issued penalties are **incomplete**: 89 of 146 XML rows have a matching Type 5
(0 field mismatches); the 13 disqualifications never do (a DQ shows up as a Type 28 verdict with
resolution `0` plus a zero-size 3/17 marker), and 44 penalties handed out in a burst at the
start are not in the replay. Prefer the XML when it exists.

- **Type 5** (variable size): Penalty Issued, header `driverSlot` = penalised car:
  - `+0` UInt8: penalty type: `0` = Stop/Go, `1` = Drive Thru, `3` = Time penalty.
  - `+1` UInt8: penalty seconds / 2 (XML `Time="10"` → `5`, `Time="100"` → `50`).
  - `+2..`: reason text, ASCII, the XML `Reason` (e.g. `"Speeding"`, `"Out of position"`, `"Speeding In Pitlane"`).
- **Type 7** (`eventSize === 1`): Penalty Served, header `driverSlot` = serving car:
  - `+0` UInt8: penalty type, same codes as Type 5.
- **Type 8**: *not* a penalty-rescinded event. Raw `7/8` is a high-volume, unrelated packet
  (a 1-byte broadcast every ~4 s, among others). No rescind packet has been identified.
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

#### Type 48 (`eventSize = 21 + vehicleCount`): Live Leaderboard / Standings Matrix
Emitted periodically (`Class 7`) to broadcast the official real-time session running order across the grid.
The payload length is **dynamic** based on the active car count (`eventSize = 21 + count`, e.g. 40 bytes for 19 cars, 41 for 20 cars, 46 for 25 cars):
- `+0`: 1 byte count: Number of active cars ranked ($N$).
- `+1..20`: 20 bytes classification / status flags.
- `+21..(21 + N - 1)`: Array of $N$ driver slot bytes in exact track order:
  - Byte `21` = P1 leader slot
  - Byte `22` = P2 slot
  - Byte `21 + n - 1` = Pn slot
Enables 100% accurate running position, leader intervals, and position-over-time charts without post-hoc sorting or interpolation.

#### Type 49 (`eventSize === 1`): Pit & Garage Transitions
- 1 byte code: `3` = Entered pit lane / Returned to garage. Emitted synchronously with pit entry and garage return beacons.

#### Type 28 (`eventSize === 4`): Track-Limits Verdict
One packet per XML `<TrackLimits>` row (including the XML's duplicated rows), header
`driverSlot` = the car. Validated on 69 races: 32,469 of 32,622 rows matched exactly with the
UInt16 lap field, 153 had no packet, **no field mismatches**.

| Offset | Size | Type | Field Description |
| :--- | :--- | :--- | :--- |
| `+0` | 1 byte | UInt8 | `WarningPoints × 4` |
| `+1` | 1 byte | UInt8 | `CurrentPoints × 4` |
| `+2` | 2 bytes | UInt16LE | `(Lap << 3) \| Resolution`: the lap spills into byte `+3` from lap 32 |

| Resolution | XML text |
| :--- | :--- |
| `0` | Disqualify |
| `1` | Stop Go Penalty |
| `2` | Drive Through Penalty |
| `3` | Time Penalty |
| `4` | Warning |
| `7` | No Further Action |

#### Type 33 (`eventSize === 4`): Per-Car Progress Step (lead)
Emitted for every car except the local player: `+0` = `0` or `1`, `+1` = `13 × k` (5 % steps),
bytes `2..3` zero. Every car emits step `k` when it passes the same track position on the same
lap, and `k` rises about every 2.3–2.4 laps. The quantity is not established (it does not track
the player's VE, fuel or tyre wear at the same moments).

#### Type 60 (variable `eventSize`): Sequenced Opaque Messages (not decoded)
Broadcast (`driverSlot === 255`). Plain header, opaque body:
`[00][fragments: 01|02][02 00][msgType u16][d2 70 00 00 00 00 00 00][seq u8]…`. `msgType 7` is
a 26-byte keepalive; `1`, `2`, `3` carry bodies of 100–500 bytes on a steady ~60 s cadence. The
body is not zlib data. Chat is **not** stored here or anywhere in the replay: XML
`<ChatMessage>` times do not line up with these packets (13 of 1,094 within 1 s, against 21 for
random times).

#### Type 9 (variable `eventSize`, ~190–380 bytes): Packet Stream (not decoded)
Broadcast (`driverSlot === 255`) at exactly **32 Hz**, making up about 9 % of a race replay's
frame stream. `byte0 & 0x7E` is a sub-stream tag; the number of tags varies by replay (8 to 52).
Bytes `1..2` (UInt16LE) are a counter that increases separately within each tag. The stream
runs at a nearly constant ~8 KB/s whatever the grid size (19 to 41 cars), so it is a
bandwidth-capped stream rather than per-car state. Its fields are bit-packed at variable
offsets: a sweep of every bit offset (widths 8–16, both bit orders) finds nothing smooth beyond
the counter.

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



