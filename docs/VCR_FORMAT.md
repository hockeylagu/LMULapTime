# Le Mans Ultimate / rFactor 2 VCR Replay File Format Specification

This document is the **reference** for the binary structure of the `.Vcr` replay file format used
by **Le Mans Ultimate (LMU)** and the **rFactor 2 (rF2 / gMotor)** engine: byte offsets, bit
masks and payload layouts. It states only what is established.

For how these fields were discovered, confidence levels, open leads, superseded hypotheses,
implementation status and future work, see **[VCR_ANALYSIS.md](analysis/VCR_ANALYSIS.md)**. Keep the two
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
- **Bytes 2..3 (`raceStartMinute`, UInt16LE)**: The event's race start as minutes past local midnight, the same in
  every session of the event (Le Mans `0x04EC` = 21:00, Fuji `0x030C` = 13:00, Daytona `0x0348` = 14:00). `0xFFFF` in
  offline sessions, which start at the track's default time for that session. The in-game clock at session time
  `t` (seconds) is the session start plus `t` at 1× time scale; the session starts at:

  | Session | Start of day |
  | :--- | :--- |
  | Race | `raceStartMinute` |
  | Qualifying | `raceStartMinute − 15` |
  | Practice (online) | `raceStartMinute` |
  | Any, `0xFFFF` | the track's default time for the session (Daytona practice 10:05, Silverstone practice 11:00) |

  Checked against the native telemetry's `metadata.SessionTime` minus the session time of its first sample on 33
  recordings (Le Mans, Fuji, Daytona, Silverstone; race, qualifying, online and offline practice): every start
  agrees to within 2 s, and the clock advances at 1× (no other time scale was observed).
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

The frame stream begins at byte 61 (after the 4-byte stream prefix at byte 57) and continues up to `metadataOffset`.

### 3.1 Slice Header
Each slice begins with a 6-byte header:
- `sTime` (4 bytes, Float32LE): session time of the slice, seconds (slices are 20 ms apart).
- `nEvents` (2 bytes, UInt16LE): number of events in the slice.

### 3.2 Event Header
Each event is a 4-byte `UInt32LE` header, a time offset byte, then the payload:

```javascript
const slot        = header & 0xff;            // car slot, 255 = the whole session
const size        = (header >>> 8) & 0x1ff;   // payload size in bytes (0..511)
const opcode      = (header >>> 17) & 0x1ff;  // event opcode (0..511), §3.3
const sessionCode = (header >>> 26) & 0x0f;   // the session type code of §2.2 (10 = race 1)
const route       = header >>> 30;            // 0..3, set by the sender; not needed to identify the event
```

The byte after the header is the event's **time offset** within its slice: event time = slice time + `n / 4000` s
(0.25 ms steps; `255` = 63.75 ms or more). Slices are 20 ms apart, so values run `0..79`: poses are at `0`, player
physics events (opcodes 51, 88) at `10` or `11`, and opcode 143 at multiples of `10` (2.5 ms physics steps). The
payload starts 5 bytes after the header's first byte and runs for `size` bytes. Car slots are below 105; slot 255 carries session-wide events.

The opcode's top three bits (`opcode >> 6`) group the events. The app's decoder matches events by opcode alone.
Decoders up to cache v8 named them by `type = opcode & 0x3f` and the raw class `header >>> 29`, which mixes the top
bit of `sessionCode` with `route`; §3.3 keeps those old names.

### 3.3 Opcode Index

Every opcode found in the 265 replays on disk (2026-11-10). `Size` is the payload size; `slot` says who the event
belongs to. "Not established" means the layout or the meaning is not known.

| Opcode | Size | Slot | Event | Old app name |
| ---: | :--- | :--- | :--- | :--- |
| `0..4` | `24` | 255 | Loose object state: cone (0), post (1), sign (2), detached wheel (3), detached wing (4) (§4.22) | — |
| `7..15` | `65` | car | Car pose and inputs; gear = opcode − 8 (§4.1) | type 7..15 |
| `51` | `3` | player | Virtual energy (§4.2) | type 51 |
| `64` | `0` | player | Engine effect trigger on a downshift (§4.3) | type 0 |
| `68` | `50` | 255 | Sky setup (§4.4) | — |
| `70` | `10` | car | Dent (§4.5) | type 6 "impact" |
| `71` | `4` | car | Dent set start (§4.5) | — |
| `72` | `0` | player | Player marker at a repair stop, with opcodes 320 / 321 | — |
| `74` | `3` | 255 | Track lights (§4.6) | class 3 type 10 "flag state" |
| `75` | `22` | player | Car sound event (§4.7) | class 3 type 11 |
| `77` | `0` | player | Player pit entry time mark | — |
| `88` | `40` | player | Player chassis per wheel (§4.8) | class 3 type 24 |
| `89` | `34` | player | Tyre tread grid (§4.9) | class 3 type 25 |
| `133` | variable | car | Penalty given (§4.13) | class 7 type 5 |
| `135` | `1` | car | Penalty served (§4.13) | class 7 type 7 |
| `137` | variable | 255 | Track surface update (§4.21) | class 7 type 9 |
| `138` | `80` | 255 | Weather (§4.10) | type 10 |
| `139` | variable | 255 | Initial track surface state (§4.21) | type 11 |
| `143` | `24` or `37` | car | Car visual state: wheels, brake temperatures, sparks (§4.11) | type 15 "brake temperature" |
| `144` | `4` | car | Fitted tyre compound per wheel (§4.12) | type 16 |
| `145` | `33` | car | Contact (§4.12) | type 17 |
| `147` | variable | 255 | Session name, ASCII (`"Race"`) | class 7 type 19 |
| `148` | `0` | 255 | Session results closed | — |
| `151`, `154` | `23` | car | Damage report: engine (151), suspension (154); payload all zero | types 23, 26 |
| `156` | `4` | car | Track-limits ruling (§4.13) | class 7 type 28 |
| `157..159` | `23` | car | New best sector 1 / 2 / 3; payload all zero | types 29..31 |
| `160` | `4` | car | Tyre compound chosen per wheel (§4.12) | — |
| `161` | `4` | car | Per-car level, every 2.3 laps (§4.20) | class 7 type 33 |
| `164` | `13` | car | Network synchronisation marker (§4.20) | — |
| `194` | `6` | 255 | Track surface reset (§4.21) | — |
| `198` | `21` online, `18` offline | car | Timing line / sector crossing (§4.14) | class 7 type 6 |
| `200` | `1 + 2n` | 255 | Marshal post flags (§4.17) | — |
| `202` | `12` | 255 | Race phase (§4.18) | — |
| `203` | `4` | 255 | Formation lap skip time (§4.18) | — |
| `207` | `5` | car | Retirement (§4.15) | — |
| `209` | `0` | car | Disqualified (§4.13) | class 7 type 17 |
| `211` | `1` | 255 | Pit exit light (§4.18) | — |
| `214` | `3 × rows` | 255 | Formation grid order (§4.18) | — |
| `220` | `0` | car | Car removed from the track order (pit lane start) | — |
| `240` | `21 + N` | 255 | Standings (§4.16) | class 7 type 48 |
| `241` | `1` | car | Car status notice (§4.19) | class 7 type 49 |
| `252` | variable | 255 | Anti-cheat message fragments (§4.21) | class 7 type 60 |
| `320`, `321` | `0` | car | Repair (§4.19) | — |
| `322` | `1` or `6` | car | Pit state (§4.19) | type 2 "pit codes" |
| `324` | `5` | car | Pit stop summary (§4.19) | — |
| `366` | `1` | car | Starting tyre compounds (§4.12) | — |
| `372` | variable | 255 | Race state snapshot (§4.18) | — |

The game also defines these opcodes, but none occurs in the 265 replays: `5`, `16..18` (gears 8 and 9, compact pose),
`66`, `86`, `87`, `91`, `128`, `134`, `136`, `140..142`, `152`, `153`, `162`, `197`, `201`, `204`, `205`, `208`,
`210`, `215..219`, `221`, `235..237`, `242`, `325`, `327..337`, `361`, `377`. The layouts §4 gives for them
have no replay to check against.

---

## 4. Event Payloads

Bit numbers count from bit 0 of the first payload byte (little-endian). "Signed n-bit" fields are two's complement.

### 4.1 Car Pose & Inputs (opcodes 7..17, 65 bytes)
Every car, up to 50 Hz. **The opcode carries the gear: `gear = opcode − 8`** (`7` reverse, `8` neutral, `9..17`
gears 1..9). Playback interpolates between two packets, and engine speed only when both have the same opcode. The
gear passes through neutral for 2–3 packets during every real shift, so gear-change detection must track the last
non-zero gear.

| Bits / bytes | Field |
| :--- | :--- |
| bits `0..17` | **Detached parts**, bit `i` = part `i` is off the car: `0..3` the wheels, `4..5` two fixed parts, `6..17` the detachable bodywork parts listed in the car's data. Bit 5 is set with a puncture or lost tyre and clears when the car leaves its box after the tyre change. |
| bit `18` | The car is driven by a driver other than its first (driver swap); never set in the replays examined |
| bit `19` | `0` |
| bit `20` | **Headlights** on. A flash is a train of toggles about 0.19 s apart. |
| bit `21` | Car active in the session; clears once it retires or finishes |
| bit `22` | **Rain light** on: the track's rain is above the car's own threshold, so cars switch on a few seconds apart; not tied to wet tyres |
| bit `23` | Not written; holds leftover buffer content (it toggles on every car at once). Ignore it. |
| byte `3` + bits `272..275` | **Acceleration z**, world frame like the velocity: signed 12-bit, low 8 bits in byte 3, high 4 bits in the low nibble of byte 34; m/s² = `n / 32` (±63.97) |
| bits `32..41` | **Steering input**: `n = round(s × 511) + 512`, `s` = −1..1 of full lock. The app reads it as `(n − 512) / 512 × 270°`. |
| bit `42` | A driving-aid flag, sent with the ABS and traction control flags; never set in the replays examined |
| bits `43..48` | **Throttle**: `n / 63` |
| bit `49` | **In the pit lane or garage**: set at the session start, in the pit lane and after retiring to the garage |
| bits `50..63` | **Engine speed**: `n / 7` rad/s (`n` clamped to 16383), rpm = `n × 60 / (14π)` ≈ `n × 1.3642` |
| bits `64..77` | **Velocity x**, world frame: signed 14-bit, m/s = `n / 32` (±255.97) |
| bits `78..89` | **Velocity y** (vertical): signed 12-bit, m/s = `n / 20` (±102.35) |
| bits `90..103` | **Velocity z**: signed 14-bit, m/s = `n / 32` |
| byte `13` | **Angular velocity z** (roll): signed 8-bit, rad/s = `n / 64` (±1.98) |
| bits `112..120` | **Angular velocity y** (yaw rate): signed 9-bit, rad/s = `n / 64` (±3.98) |
| bits `121..127` | **Angular velocity x** (pitch): signed 7-bit, rad/s = `n / 64` (±0.98) |
| bytes `16..31` + bytes `32..33` | **Wheels**, one UInt32LE per wheel at 16, 20, 24, 28 (front-left, front-right, rear-left, rear-right) plus one nibble per wheel of UInt16LE at 32 (wheel `w` in bits `4w..4w+3`); below |
| byte `34` high nibble + byte `35` | **Acceleration x**, world frame: signed 12-bit = `UInt16LE(34) >> 4`; m/s² = `n / 32`. The car's own longitudinal and lateral acceleration come from x and z turned by the heading `rotY` (no vertical acceleration is recorded) |
| byte `36` | bits `0..5`: **brake pedal** `n / 63`; bit 6: **ABS active**; bit 7: **traction control active** |
| byte `37` | Hybrid cars: bits `0..1` **mode** (`0` off, `1` coast, `2` regen, `3` deploy), bits `2..4` **regen level** `n / 7` of the maximum, bits `5..7` not written, leftover buffer content (ignore). Other cars: the whole byte is an engine value `n / 255 × 21677`, `0` in every replay examined. |
| byte `38` | bits `0..1`: **clutch** `n / 3`; bit 2: **pit limiter** on; bits 3, 4: **front / rear flap activated** (active aero; never set in the replays examined); bit 5: the car flag that makes the marshal posts just ahead of the car show flag `6` (§4.17; race sessions only); bit 6: **car not collidable** (in the garage at the start or end of a session; not set during a pit stop); bit 7: `0` |
| byte `39` | bits `0..2`: **traction control level** `n / 7` of the maximum (at least 1 when on); bits `3..4`: not written, leftover buffer content (ignore); bits `5..7`: **engine map** |
| byte `40` | **Tyre temperature**: bits `3..7` mean of the four tyres, K = `293.15 + n × 150 / 31` (20 to 170 °C, 4.84 °C steps); bits `0..2` = `round((right − left) / 20) + 3`, the right side's mean (FR, RR) minus the left side's (FL, RL), each side's offset from the mean clamped to ±30 K |
| bytes `41..52` | **Position** x, y (vertical), z: 3 × Float32LE, metres |
| bytes `53..64` | **Orientation**: 3 × Float32LE radians, pitch (`rotX`), yaw (`rotY`), roll (`rotZ`) |

Each wheel is a 22-bit value `v` (bits `0..17` of the wheel word, then the wheel's nibble as bits `18..21`) and a
suspension field:

| Bits | Field |
| :--- | :--- |
| `v` bit `21` | wheel turning backwards |
| `v` bits `13..20` = `255` | **fast form**: `v` bits `0..12` = wheel speed, rad/s = `n / 16` (to 512 rad/s) |
| `v` bits `13..20` < `255` | **slow form** (under 15.9 rad/s): bits `13..20` = wheel speed `n / 16` rad/s, bits `0..12` = **wheel rotation angle**, rad = `n / 1303.638` (0..2π) |
| word bits `18..31` | **Suspension deflection**: signed 14-bit, metres = `n / 2048` (clamped ±2 m) |

A stationary or retired car has `v` bits `13..15` = `0`; a car at speed has them at `7` (the fast form).

**Opcode 18, compact pose.** Bytes `0..7` are a packed position (x and z signed 22-bit `/ 64` m, y signed 20-bit
`/ 128` m, the layout of the contact point in §4.12), bytes `8..11` a compressed orientation. Playback expands it to
an opcode-8 pose. Loose objects (opcodes `0..5`, §4.22) use the same packed position.

### 4.2 Virtual Energy (opcode 51, 3 bytes)
Player car only, about 50 Hz.

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0` | 1 | UInt8 | **Virtual energy**: `VE% = n / 2.55`. Cars without a VE system send `0` for the whole session (GTE, LMP3). The replay holds no fuel level here. |
| `1` | 1 | UInt8 | `2` for the first seconds of a practice or qualifying session (car still in the garage), otherwise `0` |
| `2` | 1 | UInt8 | **Pit request state**: non-zero from a few seconds before the pit request (opcode 322 state 1) until service ends (state 5), or to the session end if the stop is never taken. Values `4`, `8`, `13`, `16`, `64`, `128`; their meaning is not established. |

### 4.3 Engine Effect Trigger (opcode 64, no payload)
Player car only. Sent on a downshift made under braking with the engine above half its maximum speed, at most every
2.5 s; it starts a timed effect on the car (what the effect shows is not established). Every one comes with a
downshift sound event (opcode 75 index `55`, §4.7).

### 4.4 Sky Setup (opcode 68, 50 bytes)
`u8` mode, Float32LE transition time (s), then 15 NUL-terminated two-digit variant ids (`"01"`..`"03"`), one per
cloud cell code `0`..`14` of the weather packet's cloud field (§4.10): the id is the end of the name of the cloud material every
cloud of that code uses.

### 4.5 Dents (opcodes 71 and 70)
**Opcode 71** (4 bytes, Float32LE time) starts a car's dent set; one **opcode 70** per dent follows. A set is
sent when the replay starts, when the car is first set up, at the end, and after new damage.

| Opcode 70 offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..2` | 3 | 3 × Int8 | Dent point in the car frame: `n / 127 × (lo + hi) − lo` with the car's body extents `lo`, `hi` |
| `3..5` | 3 | 3 × Int8 | Deformation vector: `n / 127 × s`, `s` the car's deformation scale |
| `6..9` | 4 | Float32LE | Ramp whose rate follows the wind speed `w` (m/s): `dA/dt = (20 + w) / 16500`; same value at the same session time for the same rate. Probably the cloud field's drift (not established). |

### 4.6 Track Lights (opcode 74, 3 bytes, slot 255)
Six 4-bit light states, sent when one changes:

| Nibble | Light |
| :--- | :--- |
| byte 0 low | Start lights |
| byte 0 high | Caution light |
| byte 1 low | Pit entry light |
| byte 1 high | Pit exit light |
| byte 2 low | Pit official 0 |
| byte 2 high | Pit official 1 |

Race 1 at Daytona: start lights `1` from the formation start, `6` at the green, `0` ten seconds later; pit exit
light `2` until shortly after the green; pit official 0 `2` while the pit lane start is released. The value names
are not established. **This is not a flag state.**

### 4.7 Car Sound Event (opcode 75, 22 bytes)
Player car. One per discrete sound: gear shifts, pit limiter.

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..1` | 2 | UInt16LE | bits `0..8` pitch, bits `9..13` volume, bits `14..15` sound type |
| `2..17` | 16 | Binary | Sound id; the same for the same sound across cars and sessions |
| `18..21` | 4 | UInt32LE | **Sound index**: `52` upshift, `55` downshift, `88` pit limiter toggle, `97` not established |

Sound id prefixes: `555da8e9…` upshift, `6868bfaf…` downshift, `5655040e…` limiter, `fd2e6aff…` index 97.

### 4.8 Player Wheel Mounting (opcode 88, 40 bytes)
Player car, one per pose. Four 10-byte blocks, front-left, front-right, rear-left, rear-right (block `k` at `k × 10`).
Each block gives the wheel's place relative to the suspension part it is mounted on, in the car's axes (x lateral,
y vertical, z longitudinal), and two tyre deflections. Every field is clamped to its range before rounding.

| Offset in block | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0`, `1`, `2` | 1 each | Int8 | **Wheel offset** x, y, z from its mount: metres = `n / 1024` (±0.124) |
| `3`, `4`, `5` | 1 each | Int8 | **Wheel rotation** relative to its mount, about x, y, z: radians = `n / 256` (±0.496). With `m` the relative rotation matrix: x = `−asin(m12)`, y = `atan2(m02, m22)`, z = `atan2(m10, m11)` |
| `6..7` | 2 | UInt16LE | **Tyre radius**: metres = `n / 4096`. It grows with wheel speed. |
| `8` | 1 | Int8 | **Tyre lateral deflection**: metres = `n / 1024` (±0.124) |
| `9` | 1 | Int8 | **Tyre angular deflection** about the axle: radians = `n / 256` (±0.496) |

A wheel that is off the car sends zero offsets and angles, its rest radius and zero deflections.

### 4.9 Tyre Tread Grid (opcode 89, 34 bytes)
Player car. Updates a grid of 504 cells per tyre (7 across the tread × 72 around), front-left, front-right, rear-left,
rear-right: cell `c` belongs to wheel `c / 504`, 2,016 cells in all, wrapping after the last. Values are run-length
coded:

| Offset | Field |
| :--- | :--- |
| UInt32LE `0`, bits `20..31` | First cell updated |
| UInt32LE `0` bits `0..19` (5 nibbles) and UInt32LE `4` (8 nibbles) | Repeat count − 1 of each of the 13 values |
| `8..33` | 13 × UInt16LE cell values, low 14 bits used |

| Cell bits | Field |
| :--- | :--- |
| `0..4` | **Worn fraction** of the cell's tread, `n / 31` (`0` = new) |
| `5..8` | Worn depth, mm (0..15); `0` in the replays examined |
| `9..13` | Surface temperature level, `0` at or below 425 K to `31` at 575 K; `0` in the replays examined |

### 4.10 Weather (opcode 138, 80 bytes, slot 255)
About every 1.5–2 s in every session.

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..3` | 4 | Float32LE | Weather simulation time, s (advances in steps of 10/3 s) |
| `4`, `5` | 1 each | UInt8 | Two weather flags, `0` or `255`; set briefly about every 600 s. Their effect is not established. |
| `6..9` | 4 | Float32LE | **Upper cloud layer drift**, in cells: grows at `(20 + w) / 16500` per second, `w` the wind speed in m/s. |
| `10..13` | 4 | Float32LE | **Lower cloud layer drift**, in cells: grows at `(10 + w) / 10560` per second. |
| `14..15` | 2 | Binary | `0` |
| `16..17` | 2 | Binary | Constant within an event (`0x1EA2` online, `0x5698` offline). Not established. |
| `18..33` | 16 | 4-bit cells | **Cloud field**: 32 cells, the low four bits of each byte first. Cells 0–24 are the lower layer (a 5 × 5 grid), 25–31 the upper layer. A cell holds a cloud type code: `0–2` heavy rain cloud, `3–5` light rain cloud, `6–7` thick low cloud, `8–10` thin low cloud, `11–12` thick high cloud, `13–14` thin high cloud, `15` clear. The app's **cloud cover** figure is `Σ(15 − cell) / (15 × 32)`. |
| `34` | 1 | UInt8 | A fraction `n / 255`; `128` in every replay. Not established. |
| `35` | 1 | UInt8 | **Wind speed**: m/s = `n / 4` |
| `36..37` | 2 | UInt16LE | **Wind direction**: radians = `n × 2π / 65535` |
| UInt32LE `38`, bits `0..9` | 10 bits | | **Ambient temperature**: K = `247 + n × 0.12512` (°C = `n × 0.12512 − 26.15`; with bits 8..9 = `1`, °C = byte 38 `/ 8 + 5.9`) |
| UInt32LE `38`, bits `10..22` | 13 bits | | **Air pressure**: kPa = `n × 0.031254` (0..256) |
| UInt32LE `38`, bits `23..31` | 9 bits | | **Humidity**: `n / 511` |
| `42..77` | 36 | Binary | **Rain**: 9 blocks of 4 bytes, one per cell of a 3 × 3 grid over the track area, each three values `n / 255` (byte 3 unused). The centre block's byte 0 (offset 60) is the rain on the track, `0` = dry. In the replays examined all 9 blocks hold the same value. |
| `78` | 1 | UInt8 | bits `0..6`: **time of day** at session time 0, `n × 900` s; bit 7 unused |
| `79` | 1 | UInt8 | **Time scale**: `n / 4` (`4` = real time) |

Time of day at session time `t` = `(byte78 × 900 + byte79 / 4 × t) mod 86400` s. Cloud cover against the session's
weather name (Clear, Light Clouds, Partially Cloudy, Mostly Cloudy, Overcast) overlaps between names; ranges are in
the analysis. Track temperature is not in this event: it is the surface temperature channel of opcodes 137, 139 and
194 (§4.21), or DuckDB `Track Temperature`.

### 4.11 Car Visual State (opcode 143, 24 or 37 bytes)
Every car. Sent when the packed values change, at most every 0.1 s, and at least every 4 s. The size is 24 when bytes
`24..36` would all be zero, else 37; a 24-byte event clears them.

| Bytes / bits | Field |
| :--- | :--- |
| `0..15` | One UInt32LE per wheel (front-left, front-right, rear-left, rear-right), the wheel's effect state: bits `0..3`, `4..7`, `8..11` three **tyre effect levels** `n / 15` (below); bits `12..15` the **gated slide level** `n × 2 / 15`; bits `16..19` **wheel load** `n × 1000` N (to 15 kN); bits `20..25` **tyre sliding speed**, m/s = `n² × 0.0252` (`(n / 63)² × 100`, to 100 m/s) |
| UInt64LE `16`, bits `0..23` | Per-wheel level `n / 63`, 6 bits each: rear-right `0..5`, rear-left `6..11`, front-right `12..17`, front-left `18..23`; `0` in every replay examined (not established) |
| UInt64LE `16`, bits `24..63` | **Brake temperatures**, 10 bits each, K = `n × 1500 / 1023` (to 1500 K): rear-right `24..33`, rear-left `34..43`, front-right `44..53`, front-left `54..63` |
| `24` | Three **engine effect levels**: bits `0..1` `n / 3`, bits `2..4` `n / 7`, bits `5..7` `n / 7`; by default each is `0.5 × throttle × (rpm / max rpm)³` |
| `25..28` | UInt32LE bits `0..23`: **spark points**, one flag per body contact point scraping or hitting something |
| `29..32` | **Contact velocity** of the first flagged point, m/s, packed: x = signed bits `0..9` `/ 8`, y = signed bits `11..19` `/ 8`, z = signed bits `21..30` `/ 8`. Bits 10, 20 and 31 select a far range for x, y and z (`/ 4`, offset by ±63.75, ±31.75 and ±63.75). |
| `33..34` | Int16LE: **aerodynamic load**, N (whole part); grows with speed squared and with the flap state |
| `35`, `36` | **Underbody height** at two points along the floor, front and rear: metres = `n / 510`, clamped at `0` (a value below 0 sets spark points) |

With `g` the tyre's grip fraction (1 = full grip), the tyre effect levels are: bits `0..3` (skid)
`clamp((0.4 − g) × 3.333)`; bits `4..7` (slide) `clamp((0.6 − g) × 2)`; bits `8..11` (smoke)
`max(0, (skid − 0.25) × 1.333)`. On a loose surface the skid level is the surface's own effect level instead. The
gated slide level is `⌊round(slide × 15) / 2⌋`, `0` when the car's speed and the tyre's sliding speed are both
7 m/s or less.

The brake temperatures are in every car's packets, online and offline. Tyre wear and carcass temperature are not in
this event.

### 4.12 Tyres and Contacts (opcodes 144, 145, 160, 366)

**Opcode 144, fitted compound** (4 bytes, every car): 4 × Int8 compound index, front-left, front-right, rear-left,
rear-right. Sent when the car loads and whenever its tyres change. The index is the compound's position in the car's
tyre data, the same index as the XML `fcompound` / `rcompound` (`"0,Medium"`, `"1,Wet"`); names are per car. A packet
after the chequered flag may reset the value.

**Opcode 160, chosen compound** (4 bytes): 4 × Int8 compound index per wheel selected in the garage, sent before it
is fitted.

**Opcode 366, starting compounds** (1 byte): `front << 4 | rear`, `0xf` = none. Sent when a car's starting
compound was unset and the default is taken (qualifying and race).

**Opcode 145, contact** (33 bytes): one per contact, by the reporting car; a car-to-car contact gives one per car.
These are the XML `<Incident>` rows.

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..7` | 8 | packed | **Contact point** in the car frame, m: x = signed bits `0..21` of UInt32LE `0` `/ 64`; z = signed bits `0..21` of UInt32LE `4` `/ 64`; y = signed 20-bit, high 10 bits = bits `22..31` of UInt32LE `4`, low 10 bits = bits `22..31` of UInt32LE `0`, `/ 128` |
| `8..11` | 4 | Float32LE | **Impact magnitude**: the XML `reported contact (x)` |
| `12..27` | 16 | Binary | Id of the surface hit, constant per object type within a session |
| `28..31` | 4 | UInt32LE | Index of the surface hit (walls, other cars and loose objects have their own ranges per track) |
| `32` | 1 | UInt8 | **Other party**: the other car's slot (below 105), or `105 + object type`: `105` Cone, `106` Post, `107` Sign, `108` Wheel (detached), `109` Wing (detached bodywork); `112` Immovable (walls, barriers) |

The contact time is the slice `sTime`.

### 4.13 Penalties and Track Limits (opcodes 133..136, 156)

**Opcodes 133 / 134, penalty given** (car = penalised car):

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..1` | 2 | UInt16LE | bits `0..1` **type** (`0` Stop/Go, `1` Drive Thru, `2` Longest Line, `3` Time); bits `2..6` laps to serve; bits `7..15` **seconds** |
| `2..` | variable | UTF-8 | **Reason**, NUL-terminated (`"Speeding"`, `"Track Limits"`, `"Out of position"`) |

134 has the same layout and does not occur in replays. Disqualifications have no penalty event:
they show as a track-limits ruling with resolution `0` (below) plus an **opcode 209** event (no payload) for the
disqualified car. Opcode 210 withdraws a disqualification. Penalties given in a burst at the start
of an online race may be missing; prefer the XML when it exists.

**Opcodes 135 / 136, penalty served or removed** (1 byte): Int8 penalty type, same codes.

**Opcode 156, track-limits ruling** (4 bytes, every car): one per XML `<TrackLimits>` row.

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0` | 1 | UInt8 | Warning points × 4 |
| `1` | 1 | UInt8 | Current points × 4 |
| `2..3` | 2 | UInt16LE | bits `0..2` **resolution**; bits `3..15` **lap** |

| Resolution | Meaning (XML text) |
| :--- | :--- |
| `0` | Disqualify |
| `1` | Stop Go Penalty |
| `2` | Drive Through Penalty |
| `3` | Time Penalty |
| `4` | Warning |
| `5` | Invalid Lap (cut track) |
| `6` | Invalid Lap (off track) |
| `7` | No Further Action |

### 4.14 Timing Line and Sector Crossing (opcode 198)
Every car, at each sector 1, sector 2 and finish line crossing. 18 bytes offline; online sessions add the 3 aid bytes
(21 bytes). Bytes 11..17 are masked with per-car keys:

```javascript
const k  = (slot * 0x13 + 0x49) & 0xff;            // bytes 11..13
const kw = (wheel) => ((wheel + 6) * (slot + 3)) & 0xff; // bytes 14..17, wheel 0..3
```

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..3` | 4 | Float32LE | **Time since the lap started**: sector 1 time, sector 1 + 2 time, or the lap time. `≤ 0` (`-1`) = no valid time (track-limits invalidation, out-lap). |
| `4..7` | 4 | Int32LE | **Crossing time**, session seconds = `n / 4096` |
| `8..10` | 3 | bits | UInt32LE bits `0..1`: **crossing** (`1` sector 1, `2` sector 2, `0` finish line); bits `2..13`: **lap index** (`0` = lap 1); bits `14..23`: **lap top speed** so far, m/s = `n × 128 / 1023` |
| `11` | 1 | UInt8 | **Fuel**, fraction of tank capacity = `(b ^ k) / 255` |
| `12` | 1 | UInt8 | **Battery state of charge** = `(b ^ k) / 255` (`0` for cars without a hybrid) |
| `13` | 1 | UInt8 | **Virtual energy** = `(b ^ k) / 255` (only for cars with VE) |
| `14..17` | 4 | 4 × UInt8 | **Tyre wear** front-left, front-right, rear-left, rear-right = `(b ^ kw(wheel)) / 255` (`1` = new) |
| `18` | 1 | bits | Aids used this lap: bit 0 AI driving, bit 1 player driving (both = shared), bits `2..3` traction control, `4..5` ABS, `6..7` stability control |
| `19` | 1 | bits | bits `0..1` auto shift, `2..3` steering help, `4..5` braking help, bit 6 auto clutch, bit 7 invulnerable |
| `20` | 1 | bits | bit 0 opposite lock, 1 spin recovery, 2 auto pit, 3 auto lift, 4 auto blip |

Bytes 18..20 hold the highest level of each aid used since the previous finish line crossing. These are the XML
`<ControlAndAids>` values. Fuel, battery, VE and wear are in every car's events, online included, where the XML has
none of them.

**Sector splits.** `s1 = time(sector 1)`, `s2 = time(sector 2) − s1`, `s3 = lap time − s1 − s2`.

**Session flush.** When a session ends or a car returns to the garage mid-lap, a finish line event with time `≤ 0`
closes the lap. The app discards it when the lap lasted under 20 s and never reached sector 1; otherwise it keeps the
lap as invalid with its duration from the slice times.

### 4.15 Retirement (opcodes 207, 208, 5 bytes)
207 = car retired, 208 = retirement withdrawn.

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0` | 1 | UInt8 | **Reason**: `0` none given (XML `DNF`), `1` Engine, `2` Gearbox, `3` Clutch, `4` Suspension, `5` Brakes, `6` Accident, `7` Stall, `8` Electronics, `9` Fuel |
| `1..4` | 4 | Float32LE | **Lap distance** where the car stopped, metres |

### 4.16 Standings (opcode 240, `21 + N` bytes; opcode 197)

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0` | 1 | UInt8 | Count of classified cars |
| `1..12` | 12 | 3 × Float32LE | Overall best lap: lap time, its sector 1 time, its sector 1 + 2 time (`-1` before any) |
| `13..16` | 4 | UInt32LE | Race lap limit (`0x7fffffff` = none) |
| `17..20` | 4 | Float32LE | Race end time, session s (`FLT_MAX` while the start is pending) |
| `21..` | N | UInt8 | Car slot per position, leader first; `0xff` = empty |

Position = index + 1. Class positions follow by counting each car's class in this order. About every 4 s.

**Opcode 197** is an older form: byte 0 count, bytes `1..9` unused, slots from byte 10, no empty marker.

### 4.17 Marshal Post Flags (opcode 200, `1 + 2n` bytes, slot 255)
The track's marshal posts are numbered in lap-distance order (38 at Daytona).

- Byte 0: default for every post, high nibble = flag, low nibble = mode.
- Then `n` pairs: post index, flag/mode byte overriding that post.
- A post's new state takes effect at `t + 0.25 + index / 1020` s (staggered round the lap); an unchanged state
  keeps its earlier time.

Flag `0` is no flag. Flag `1` is a **yellow flag**: a post near the player switching to `1`, and back to `0`, gives the
yellow and yellow-cleared messages. Flag `6` is shown at the posts just ahead of certain cars, inside a window that
grows with the car's speed (a blue flag, probably). At the chequered flag the finish line post shows flag `3`
(chequered) with mode `6` and the other posts random flags with mode `6`. Mode use in the replays: at the green every
post shows `0`/`2`; the start line post shows `0`/`4`, then `0`/`5`, in the last seconds before the green; flag `0`
with mode `1` or `2` follows a yellow in the same mode (the green flag after the yellow zone); flag `4` mode `2` is
shown beside yellow zones. Flags `2`, `5`, `7..10` and modes `3..5` beyond these uses are not established.

**Sector flags**: a sector's flag (DuckDB `Sector n Flag`) is the most severe flag among its posts, `2` over `3` over
`1`, and `11` when the sector is clear; it changes at the post's staggered time.

### 4.18 Race Control (opcodes 201..204, 211, 214, 372)
Applied while the session is live; playback shows their effect through the other events.

- **201, countdown start** (8 bytes): UInt32LE countdown value, Float32LE countdown start time.
- **202, race phase** (12 bytes; one per race at the green, phase `3` with the green time in all 80 races): UInt32LE phase (`0` before the session, `1` reconnaissance, `2` walkthrough, `3`
  formation, `4` countdown, `5` green, `6` safety car, `7` red flag, `8` chequered), Float32LE phase end / green
  time, Float32LE phase start (`≤ 0` = now).
- **203, formation lap skip** (4 bytes): Float32LE time from which the formation lap is skipped.
- **204, caution** (1 byte): Int8 caution state (pending, caution, pits open, caution ending, …; codes not
  established).
- **211, pit exit light** (1 byte): bit 0 pit exit blue light blinking; bit 1 pit exit closed for a fixed time.
- **214, formation grid order** (`3 × rows` bytes): the grid row by row, three places per row (left, middle, right),
  each a car slot or `0xfe` for an empty place. A two-wide grid has `0xfe` in the middle of every row. Sent about every
  0.3 s during the formation; an empty payload clears it. Opcode 220 removes a car from it (pit lane start).
- **372, race state snapshot**: UInt8 (low nibble phase), Float32LE × 5 (phase start, now, phase end, formation
  skip, pit exit closed until), UInt32LE countdown, then per-car triples (flag, slot, grid position).

### 4.19 Pit Lane (opcodes 322, 324, 320, 321, 241)

**Opcode 322, pit state** (1 byte, or 6 with state 5):

| Bits | Field |
| :--- | :--- |
| byte 0 bits `0..3` | **Pit state**: `0` none, `1` stop requested, `2` entering the pit lane, `4` stopped in the box, `5` released (`3` is not used) |
| byte 0 bits `4..7` | **Running state**, signed: `2` racing (set for every car at the green; only then does the car get blue flags, scoring and timing display); `1` not racing: in practice and qualifying after the pit lane notice, after control of the car is taken over, or once the car is put back in the garage; `0` not running or retired |

The 6-byte form: byte 1 = **energy after the stop** `(b ^ k) / 255` (k as opcode 198); bytes 2..5 = **tyre wear after
the stop** front-left, front-right, rear-left, rear-right, `(b ^ kw(wheel)) / 255`. Kept tyres show their worn values,
new tyres `1`.

The app stores the whole byte as its `pitEvents` code: `0x2s` while racing (`33` requested, `34` entering, `36`
stopped, `37` released, `32` back to none at the pit lane exit) and `0x1s` otherwise. In practice and
qualifying `21` (`0x15`) is sent when the car returns to the garage and `16` (`0x10`) when it leaves the pit lane
afterwards, about 20 s after it drove out of the box; in races `21` is sent when the car leaves its box after a long
stop.

**Garage state of a point** (`server/replay/decode/garageState.ts`). A garage spell runs from a `21` (or the session
start, when `16` is the driver's first pit event other than `33` / `49`) to the next `16`. Within it the car is
`inGarage` while parked, then `inPit` from the moment it drives off (≥ 5 km/h) down the pit lane. The spell also ends
once the car reaches 100 km/h, which keeps the race meanings of `16` / `21` from flagging racing laps. It is
recomputed on read for every stored lap from the lap's `pitEvents`.

**Opcode 324, pit stop summary** (5 bytes):

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..1` | 2 | Float16LE | **Stationary time**, s |
| `2` | 1 | UInt8 | **Virtual energy** after the stop, `n / 255` |
| `3` | 1 | bits | Stop flags (bit 0 and bits `2..7`; meanings in the analysis) |
| `4` | 1 | bits | bits `0..1`: not established |

**Opcodes 320 / 321, repair** (no payload): the car's detached fixed parts (pose part bits 4 and 5) are put back. 321
also refits detached wheels with their bodywork and resets the tyres.

**Opcode 241, car status notice** (1 byte; a 3-byte form adds an Int16LE value): byte 0 is the reason, `0` lap
completed, `1` left the pits, `2` disqualification withdrawn, `3` entered the pit lane, `4` retired, `5` disqualified,
`6` left the session, `7` moved to the back during the formation, `8` penalty given. Replays hold only `3`, `4` and `5`.

### 4.20 Per-Car Values (opcodes 161, 164)

**Opcode 161** (4 bytes): every car except the local player; playback does not read it. Byte 0 a kind, `1` from the
session start and `0` from later in the race; byte 1 a level `n / 255` in steps of 13 (5 %); bytes 2..3 zero. The level
rises about every 2.3 laps and falls in steps of 13 about every 1.5 s while the car stands in its box. It is consistent
with a dirt build-up level (screen dirt, probably); not established.

**Opcode 164** (13 bytes): a network synchronisation marker. Playback does not read the payload.

### 4.21 Track Surface and Message Streams (opcodes 137, 139, 194, 252)

**Opcode 137, track surface update** (variable, slot 255, 32 Hz). One or more blocks, read least significant bit
first; a block can start at any bit:

| Block field | Width | Meaning |
| :--- | ---: | :--- |
| Channel | 2 bits | Which of the four values per surface element |
| Start index | 21 bits | First surface element updated |
| Precision | 1 bit | `0` = 4-bit samples, `1` = 8-bit samples |
| Runs | variable | Expand to exactly 160 samples |

Runs, with `remaining` = samples left in the block:

1. If `remaining > 1`, read a repeat flag: `1` repeats one value, `0` reads one literal per sample.
2. If `remaining ≤ 4` at 4-bit precision or `≤ 3` at 8-bit, the run fills the block. Otherwise the length starts at 1
   with a count limit of `remaining − 1`: read a count in 2 bits for limits up to 3, 3 bits up to 7, else 4 bits, and
   add it; a count of 15 continues with the limit reduced by 15.
3. Read the value or literals at the block precision; 4-bit values × 17 give bytes. After 160 values, another block
   follows only if a whole payload byte remains after rounding the bit position up to a byte.

Blocks apply to consecutive surface elements, wrapping at the end of the surface array. The four channels:

| Channel | Value |
| ---: | :--- |
| `0` | Rubber laid down |
| `1` | Loose material (marbles) |
| `2` | Surface water |
| `3` | Surface temperature, K = `265.15 + n / 3` |

**Opcode 139, initial surface state** (variable, slot 255, an early burst): the same run coding without the channel
field. After the 21-bit index and the precision bit, the 160 values are four 40-value planes, one per channel, for 40
consecutive elements.

**Opcode 194, track surface reset** (6 bytes, slot 255, once near the session start): pending opcode 137 / 139
updates are applied, then bytes `2..5` are written to every surface element, byte `2 + c` to channel `c` (rubber,
loose material, water, temperature). Bytes 0 and 1 hold the same small number (`0..42`) and are not read.

**Opcode 252, anti-cheat message fragments** (variable, slot 255): byte 0 fragment index (from 0), byte 1 fragment
count, then the fragment; messages are cut at 500 bytes. The message content is not part of the replay format. Chat is
not stored in the replay.

### 4.22 Loose Objects (opcodes 0..5, 24 bytes, slot 255)
The opcode is the object kind: `0` cone, `1` post, `2` sign, `3` detached wheel, `4` detached wing, `5` other detached
bodywork (not in the replays examined). Each kind has its own pool of objects.

| Offset | Size | Type | Field |
| :--- | :--- | :--- | :--- |
| `0..1` | 2 | UInt16LE | Object index in the kind's pool |
| `2..9` | 8 | packed | **Position**: x and z signed 22-bit `/ 64` m, y signed 20-bit `/ 128` m (the packed position of §4.1, opcode 18) |
| `10..13` | 4 | packed | **Orientation**, the compressed orientation of opcode 18 |
| `14..17` | 4 | packed | **Velocity**, the packed vector of the opcode 143 contact velocity (§4.11) |
| `18..23` | 6 | 3 × Int16LE | **Angular velocity** x, y, z: rad/s = `n / 128` |

---

## 5. Decoder Stream Performance and Safety

`extractReplayTrajectory` reads the frame stream in 16 MiB chunks. The 9-bit event
payload size limits each event to 516 bytes including its header and padding. If
`sliceStart + 6 + eventCount * 516` fits in the active buffer, the decoder can walk
the event headers once. Otherwise it validates the complete slice before decoding
any events; incomplete slices are carried into the next chunk without committing
partial points, events or channel state.

For an explicit or resolved target driver, unrelated pose, brake-temperature,
virtual-energy and tyre-compound packets are skipped. Timing, weather, contacts,
penalties, flags and standings remain replay-wide. X/Z rotations are rounded once
when final trajectory points are built, preserving the previous precision and
positive-zero output. The raw samples remain separate for lap classification and
speed derivation. These optimizations do not change cached results or require a
cache version bump.

Local benchmark (2026-10-11): a 945,797,856-byte Daytona race replay, 61 drivers,
extracting all 33 player laps at full resolution (185,101 points). After a warm-up
pair, six alternating before/after pairs ran in fresh workers. Median extraction
fell from 1,199 ms to 978 ms (221 ms / 18.4% saved); stream processing fell from
871 ms to 645 ms. Finalization remained approximately 285 ms. All outputs had
the same SHA-256 over serialized lap results, including replay-wide events.
Measurements include file reads but exclude worker startup, result transfer and
SQLite persistence. Filesystem reads were comparable (103 ms before / 104 ms
after); this measures warm-file parsing, not cold-disk or full-race ingestion.

For measuring worker handoff, compression and complete field import costs, see
[benchmark guidance](performance/ENDPOINT_BENCHMARKS.md#replay-ingestion).

File-backed imports now persist directly from the decoding worker. Lossless
binary lap encoding with Brotli quality 9 runs before the SQLite writer transaction; driver laps,
normalized facts, linked-session conditions, defaults and completion markers
commit atomically after source-identity checks. The worker acknowledges the save
with a compact summary, then on-demand requests read their requested lap from the
committed cache. The worker handoff itself does not change parser semantics; current app-owned
storage is specified in [replay cache format](REPLAY_CACHE_FORMAT.md), separately from VCR bytes.

Background sync and upgrades now use one frame-stream scan per replay for all
pending drivers. `ReplayDriverSamples` copies each requested 65-byte pose payload,
its session clock and channel-state reference into bounded 4,096-sample chunks.
Uncompressed chunks live in a worker-owned SQLite TEMP table, outside the
application database (deflate cost ~40 % of the decode time for 2–2.7× less
temporary disk). After the scan, one driver's chunks are consumed and
deleted, decoded with the same pose decoder as direct requests, and finalized
once using the complete timing, weather and incident history. Each finished lap
is immediately encoded with the current binary lap codec (Brotli quality 9); only compact
lap spans remain for fact persistence. Each driver still commits atomically.

Closing or terminating the worker releases temporary storage. Peak temporary
allocation was 1.2 GB for a 997 MB / 63-driver Le Mans replay (2026-10-27,
decode 49 s → 18 s with pose rounding without strings); this is an
ingestion working-space cost, not additional archive data. Single-driver
on-demand extraction retains the direct path without temporary packet staging.
