# Live channel coverage analysis

Status: Analysis complete for the available recordings, including every decoded shared-memory field
(section 9); user subsequently authorized the capture foundation described in the ingestion plan.
Analysis date: 2026-10-17. Analysis used saved sources without new game polling or source-file changes.
Related: [Inventory](LIVE_CHANNEL_INVENTORY.md), [ingestion plan](LIVE_SESSION_EVIDENCE.md).

Subsequent confirmed decision: convert verified LMU memory dynamics to the **ISO 8855 standard once
at ingestion**, storing normalized values directly in DuckDB for the app's consumers. Keep conversion
metadata, not a second native sample stream. Native values/ranges below describe the evidence inspected,
not the selected stored representation or already-normalized output.
Axis/sign verification is an engineering validation task; the target convention is settled. Track/map
coordinates remain native LMU Cartesian coordinates, independently of vehicle dynamics normalization.

## 1. Evidence examined

- Opened all **199 existing native DuckDB files read-only** and compared their complete
  `channelsList`, `eventsList` and metadata. All 199 declare the same **58 continuous channels and
  40 events**, including matching declared units/frequencies. This is catalog coverage, not proof of
  useful values in every table, class or session.
- Class distribution from original metadata: GT3 140, LMP3 46, GTE 6, Hyper 7. No LMP2 sample in
  this cohort. Do not generalize observed live values to every class or future patch.
- Inspected table schemas/counts and selected ranges in the largest recording by file size for each
  of those four classes. All 98 declared tables were nonempty in those four examples. Some populated
  channels remain class-inapplicable: VE is zero throughout the checked GTE/LMP3 examples.
- Streamed three existing shared-memory JSONL captures: Laguna Seca GT3 practice, Le Mans GT3
  damage test, and Le Mans LMP3 online. Read **116,399 telemetry frames**, including **103,024** with
  recorded speed above 20 km/h; evaluated all four wheels, not only a single corner.
- Re-read saved Bahrain REST condition, tyre-management, pit-rule and weather responses, plus the
  earlier Laguna forecast response. No HTTP request was sent to LMU.
- Compared known VCR format fields and current decoder output, not unestablished binary bytes.
  A missing decoded field means no established usable coverage, not proof the binary contains none.

Source roots:

- Native files: `C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/UserData/Telemetry/`.
- Existing captures: `C:/Documents/lmu-live-captures/2026-10-15-laguna-gt3-offline-practice/`,
  `2026-10-15-lemans-gt3-offline-damage-test/`, `2026-10-15-lemans-lmp3-online/`, and
  `2026-10-16-bahrain-outer-gt3-offline/` under the same capture root.
- Local diagnostic outputs: `.cache/live-channel-analysis/duckdb-catalogs.json`,
  `duckdb-value-checks.json`, `live-values.json`, `combined-values.json`, `rest-evidence.json`,
  `weather-evidence.json`, and `paired-clock-check.json`. These are analysis artifacts, not new
  application contracts or guaranteed retained fixtures. Key evidence is recorded below.

## 2. Corrections to the preliminary inventory

**Do not capture these as missing high-rate channels:**

| Previously uncertain field | Actual native coverage | Decision |
|---|---|---|
| Current wind | `Wind Speed` and `Wind Heading`, 1 Hz | Already exported; no duplicate live wind stream |
| Brake pad thickness | `Brake Thickness`, four wheels, 10 Hz | Already exported; normalized condition needs separate semantic justification |
| Vertical acceleration | `G Force Vert`, 10 Hz | Already exported; not a missing third acceleration channel |
| Tyre inner/centre/outer surface bands | `TyresTempLeft/Centre/Right`, four wheels, 100 Hz | Already exported; avoid recapturing all bands |
| Additional thermal channels | Carcass 5 Hz, rubber 10 Hz, rim 50 Hz; brake air 50 Hz | Exported even when not used by current importer |
| Controls and auxiliary state | Filtered/unfiltered clutch, brake bias/migration, maps, flaps, launch control, ABS/TC settings | Already in channels/events; no new stream solely because UI omits them |
| Initial static setup | `metadata.CarSetup` present and nonempty in all 199 files | Reuse native setup snapshot; live capture only needs verified subsequent changes/context |
| Per-wheel brake command | `Brakes Force`, four wheels, 50 Hz | Strong observed overlap with live `brakePressure`; no default duplicate |

Do not trust catalog unit labels blindly: `Brake Thickness` declares `%` but example front values
are around 3.6, whereas saved REST thickness is about 0.036 m. `Wind Heading` declares degrees but
the four checked examples contain about 1.5708203. These discrepancies need normalization analysis;
they do not justify a second continuous stream. They also do not establish the correct conversion alone.

The native `Version` metadata is exporter metadata; this analysis does not reinterpret it as the
game patch. Use verified XML `GameVersion` as already agreed.

## 3. High-rate complementary channels

The following fields are absent from all 199 native catalogs and have no established measured
equivalent in the current VCR decoder. VCR positions/orientations can provide derived motion, but
that is different evidence from measured local velocities and rates.

| Proposed channel family | Exact live fields | Scalars | Working unit / normalization | Observed and proposed cadence |
|---|---|---:|---|---|
| Local vehicle velocity | `localVel.x/y/z`, diagnostic `vx/vy/vz` | 3 | m/s; preserve native axes, canonical axis mapping versioned | Observed 50 Hz; propose 50 Hz |
| Local angular velocity | `localRot.x/y/z`, diagnostic `rotX/Y/Z` | 3 | rad/s; do not confuse with replay orientation `rotX/Y/Z` | Observed 50 Hz; propose 50 Hz |
| Contact-patch velocity | Per-wheel `lateralPatchVel`, `longitudinalPatchVel` | 8 | m/s; preserve native wheel-local signs | Observed 50 Hz; propose 50 Hz |
| Ground velocity at wheel | Per-wheel `lateralGroundVel`, `longitudinalGroundVel` | 8 | m/s; distinct from patch velocity and wheel speed | Observed 50 Hz; propose 50 Hz |
| Dynamic camber | Per-wheel `camber` | 4 | Working unit radians; per-side/axis interpretation needs final normalization validation | Observed changing at 50 Hz; propose 50 Hz |
| Dynamic toe | Per-wheel `toe` | 4 | Working unit radians; do not equate to static setup toe without validation | Observed changing at 50 Hz; propose 50 Hz |
| **Core total** | Six families | **30** | Four-wheel order FL/FR/RL/RR | One shared source timestamp per synchronous sample |

Working units are consistent with the stored values, source semantics and paired checks below;
this is not a completed controlled validation of every axis, wheel convention, slip formula or class.
Keep producer-specific semantics in provenance; verify mappings before writing ISO canonical columns.
Do not retain native axes/signs in canonical recording values. Choose canonical names
that distinguish angular rates from orientation angles; the diagnostic JSON names are not canonical IDs.

Useful variation is established in both the GT3 and LMP3 moving samples. Across all four wheels:

| Value | Minimum | Maximum | Nonzero / observations |
|---|---:|---:|---:|
| Camber | -0.31175 | 0.24972 | 412,095 / 412,096 |
| Toe | -0.18294 | 0.21131 | 411,854 / 412,096 |
| Lateral patch velocity | -10.5505 | 9.8932 | 410,775 / 412,096 |
| Longitudinal patch velocity | -41.1889 | 7.0423 | 410,849 / 412,096 |
| Lateral ground velocity | -10.4736 | 9.5644 | 410,754 / 412,096 |
| Longitudinal ground velocity | -82.9956 | 0 | 410,851 / 412,096 |

The source-time step median and p95 are both about 0.020 s in each capture. These are measured
sample intervals in saved captures, not an instruction to poll REST at 50 Hz. Impact/garage states
can create exceptional values; nonzero variation alone does not certify them as clean learning inputs.

**Additional high-rate candidate:** `localRotAccel.x/y/z` (3 scalars, working rad/s²) also varies at
50 Hz, but includes sharp transients up to about 394.8 in the checked moving samples. Keep it separate
for user review: it costs 4.32 MB/hour as float64 payload and may add measured transient evidence,
but utility over differentiated angular velocity and sign/quality rules remain unproven. No invented
slip angle, slip ratio or understeer raw channels: those are deterministic projections of verified inputs.

## 4. Complementary low-rate, event and configuration evidence

These are proposed field-level records from existing safe producers. A field in an already-read
response does not require a new endpoint or independent polling schedule.

| Proposed family | Exact fields / kind | Shape and storage | Proposed cadence and limits |
|---|---|---|---|
| Dent state | SM `dentSeverity[8]`; measured indicators | Eight small integers, initial state and changes; numbered zones only | Observe with existing car frames; 10 Hz target maximum for change detection, exact cadence to benchmark |
| Body/suspension damage | REST `vehicleDamage`, `suspensionDamage[4]`; measurements | Five numeric values plus response observation interval; body value is not bounded to 1 | Existing impact/crossing/pit-exit condition triggers; 5-minute fallback and replay safety retained |
| Path wetness | SM `avgPathWetness`, `maxPathWetness`; measurements | Two source fractions plus source time | Up to scoring cadence (~5 Hz); preserve observed changes; validate direct SM wet values before calling this producer verified |
| Full pit-service estimate | `fuel`, `ve`, `tires`, `damage`, `brakes`, `brakeDucts`, `driverSwap`, `penalties`, `total`; estimates | Sparse named numeric vector, seconds | Existing 60 s/10 s busy estimate schedule; absent fields stay unknown, penalty context retained |
| Pit choices | Resource target, ratio, tyres, repair, driver, individual tyres/pressures, brake replacement and adjustment lines from MFD; selections | Initial state and typed changes; raw option labels dictionary-encoded where semantics unresolved | Existing 30 s on-track/10 s busy or garage menu schedule; retain poll observation time, not guessed user action time |
| Garage resource choice | `VM_VIRTUAL_ENERGY`, `VM_FUEL_LEVEL`; selections | Amount/ratio plus availability and unit/meaning | Existing 5 s garage reads; state changes only; initial static setup reuses DuckDB metadata later |
| Tyre inventory | `maxAvailableTires`, `newTires`, `bestConditionsUsed`; inventory state | Counts and bounded condition arrays | Existing tyre-management reads, pit exit; preserve distinction between tyres and complete sets |
| Selected tyres | `selectedTires[4]` compound/index/type/isUsed/wearValue; selection | Four records, compound dictionary; not a globally unique physical set ID | Same response, initial state and changes |
| Game expected usage | `fuelConsumption`, `fuelFractionPerLap`, `virtualEnergyConsumption`, `virtualEnergyFractionPerLap`, compound `wearPerLap`; estimates | Litres/lap, fractions/lap, energy/lap and typed compound records | Existing tyre-management reads; retain redundant unit forms only for verified capacity/conversion context |
| Compound operating targets | `optimalCompoundConditions` temperature values; configuration | Snapshot per compound with units | Same response, verify item schema; no extra tyre-temperature stream |
| Service rules | `pitStopTimes.times` service durations, insertion/removal, fill rates, random delays and concurrency flags; configuration | Typed configuration snapshot, raw named values where unknown | Once per session/configuration change from existing RepairAndRefuel response; do not interpret concurrency fields as durations |
| Forecast nodes | Session/node `WNV_RAIN_CHANCE`, `WNV_SKY`, `WNV_TEMPERATURE`, `WNV_HUMIDITY`, `WNV_WINDSPEED`, `WNV_WINDDIRECTION`; forecast/configuration | Five nodes per session kind, fractions 0/.25/.5/.75/1; preserve raw enum and value | Existing 60 s weather read, persist changes; wind direction is an enum, not automatically degrees |

Examples re-read from saved REST responses:

- Front impact: body damage **1.378386**, suspension `[0.0045945, 0.7217405, 0, 0]`.
- Parts damage: body **1.571399**, suspension `[1, 0, 1, 0]`. Never clamp body damage to 1.
- Tyre management reports `newTires: 56`, not evidence of 56 complete four-tyre sets. Preserve raw
  inventory wording and semantics until verified; the earlier description of "56 sets" was too strong.
- After five laps, game expected use is about **2.128404 L/lap** and **0.02532835 VE fraction/lap**.
  These are estimates. Measured consumption remains a different learning target.
- The saved pit rules contain **37 named entries**, including concurrency, service rates and delays.
  Interpret each by schema/semantics, not by treating every number as seconds.
- Weather history contains 60 responses; 20 usable session-info bodies show average and maximum
  wetness from **0 to 0.60000002**, minimum from 0 to 0.40000001, rain from 0 to 0.93743763.
  REST wetness variation is verified here; the three SM captures are dry and do not independently
  establish wet SM values. Current minimum/off-path wetness is already present in native events.

Brake condition can be preserved only if a distinct useful meaning from native pad thickness is
demonstrated. Do not add a `brakeinfo` polling stream: its two saved four-value responses are identical,
and native thickness is already exported. Per-part REST flags likewise need demonstrated extra detail
over VCR detachable-part state before inclusion.

## 5. DuckDB clock and overlapping channel check

Paired native file: `WeatherTech Raceway Laguna Seca_P_2026-10-16T00_40_19Z.duckdb`.
Paired shared-memory file: `WeatherTech-Raceway-Laguna-Seca_20261015-204047.jsonl`.

- Native GPS time spans 41.895-323.685 session seconds; live samples span 69.4525-94.3125.
- All **1,243** live telemetry samples have a nearest native GPS sample within **2.5 ms**.
- Live diagnostic speed versus native Ground Speed: correlation **0.9999984**, mean absolute
  difference **0.06918 km/h**, without fitting a new offset.
- Live FL brakePressure versus native FL Brakes Force, aligned through GPS/order and 50 Hz frequency:
  correlation **0.998360**, mean absolute difference **0.0001783** in the recorded numeric scale.
  This supports treating it as overlap, not as a new independent high-rate brake channel.
- Change in diagnostic heading per second correlates **-0.9999960** with midpoint native `localRot.y`;
  mean absolute value of their sum is **0.0006994 rad/s**. This supports angular-rate units/sign on
  this segment, not complete 3D/Euler or per-wheel sign validation. Diagnostic heading is derived from
  SM orientation, so this is an internal consistency check, not independent replay truth.

Use DuckDB's game-time and lap-relative convention. Do not manufacture wall-clock synchronization,
depend on native files being open while driving, or force 50 Hz live samples into 100 Hz recording.
This paired check is one short recording: it does not establish a universal 2.5 ms tolerance.

### Is shared memory already ISO 8855 compatible?

Some scalar signs agree, but the local vectors are not already in ISO vehicle-axis order. In a saved
forward-driving sample at session time 82.8125 s (third gear, full throttle, 133.7125 km/h), raw local
velocity is `[0.4143, 0.2803, -37.139]` m/s. The main forward component is negative native Z, not
positive ISO X. The existing native world frame is also Y-up, while the ISO vehicle frame is Z-up.

A separate position/orientation consistency check on 1,242 consecutive moving intervals projects
world displacement onto the recorded orientation's columns. Mean absolute differences from native
local velocity are about `[0.07344, 0.00566, 0.03757]` m/s. Using rows instead produces large errors:
the recorded diagnostic orientation array must not be assumed to store vehicle basis vectors as rows.
This supports retaining explicit producer-frame semantics rather than blindly relabeling X/Y/Z.

The heading-rate check above also shows why blanket sign flipping is wrong: native `localRot.y`
already agrees in sign with the project's positive-left ISO yaw rate, since native heading grows in
the opposite sense. Use per-channel verified axis permutation/sign/unit conversion and an identity
mapping for already compatible fields. Full pitch/roll and wheel-frame conventions still need their
own validation; these checks do not establish compliance of all shared-memory fields.

## 6. Unsupported channels and recovery evidence

Across the 103,024 moving telemetry frames, front/rear downforce, drag, engine torque and front/rear
chassis ride height remain zero. All four wheels' load, grip and lateral/longitudinal force are also
zero in those samples. Exclude them unless a later producer/class provides verified useful data.

Do not confuse zero chassis ride height with wheel `rideHeight`, which varies but is already covered
by native wheel dynamics. Do not store orientation, acceleration, wind, brake pressure or setup copies
merely because they appear beside the accepted fields in a shared-memory structure.

The GT3 damage recording contains one backward elapsed-time reset, and the LMP3 recording contains
two. Both end with one malformed final JSON line (lines 9,030 and 117,669 respectively), excluded from
statistics. Existing data therefore directly supports explicit epochs and recoverable chunk boundaries.
The intended binary format must not rely on subtracting the first recorded sample as a universal lap start.

## 7. Representation, cadence and storage budget

Conservative core calculation preserves 64-bit numeric values; no compression ratio is assumed:

| Record group | Shape | Uncompressed payload cost |
|---|---|---:|
| Six core dynamic families | 30 float64 values + one float64 session timestamp, 50 Hz | **44.64 MB/hour** |
| Optional angular acceleration | Three extra float64 values on same timeline, 50 Hz | **4.32 MB/hour** additional |
| Average/maximum wetness | Two float64 values + timestamp, 5 Hz worst-case | **0.432 MB/hour** before change suppression |
| Fuel overlap | Fuel float64 + timestamp, 1 Hz example | **0.0576 MB/hour** |
| Damage/pit/tyre/forecast/identity | Change/event/configuration records and sparse anchors | Variable; measure after exact accepted field list |

MB means decimal 1,000,000 bytes. Headers, masks, checksums, alignment, REST observation intervals,
dictionaries and metadata are additional. **50-60 MB/hour** is a provisional total planning envelope,
not a measured file size or guaranteed maximum. This is roughly **5-6 GB per 100 recorded hours**
before compression. There is no retention cap or automatic deletion; the user will clean up recordings
manually when needed. More channels, cadence changes or verbose fallback records alter that estimate.

Use separate typed blocks for dynamic samples, change records, sparse events and configuration.
Record strings once in dictionaries; do not repeat static setup or entire REST bodies at frame rate.
Keep source timestamps float64 and native values float64 initially. Casting the *already rounded JSON*
motion values to float32 introduced at most about 3.81e-6 m/s in the checked velocity fields and
1.66e-7 rad/s in angular velocity; those bounds are limited to this diagnostic dataset and do not prove
losslessness for original shared-memory doubles. Float32 is a future explicit precision decision.

Compression remains lossless and post-session. Do not promise game performance from small byte rates:
allocation, buffer copying, worker scheduling, disk stalls and serialized REST polling still need the
implementation performance gates. No new game-performance test was run during this analysis.

### Comparison with existing DuckDB storage

Measured file size divided by GPS Time span for the four representative recordings (the largest file
per class in this cohort), compared with the proposed live dynamic core:

| Class | Recorded span | Native file size | Native MB/hour | Live core as share of native |
|---|---:|---:|---:|---:|
| GT3 | 63.15 min | 106.21 MB | 100.92 | 44% |
| LMP3 | 28.60 min | 43.97 MB | 92.24 | 48% |
| GTE | 23.60 min | 28.83 MB | 73.30 | 61% |
| Hyper | 43.17 min | 86.32 MB | 119.97 | 37% |

This compares actual native on-disk database sizes with an uncompressed live payload estimate of
44.64 MB/hour before headers and other evidence. It is not a matched compression benchmark or a
whole-cohort average. The proposed 50-60 MB/hour planning envelope would add approximately 42-82%
to these native-only hourly rates before live compression. Channel counts alone are misleading:
the native catalog has 58 continuous channels plus 40 event definitions, and some channels contain
four wheel values, whereas the live core's 30 count is individual numeric values.

## 8. Proposed review outcome

1. Include the **30-scalar dynamic core**, subject to final producer-unit/sign normalization checks.
2. Include the useful complementary low-rate/event/configuration families in section 4; preserve
   unresolved named settings/rules as typed source facts, not invented physical meanings.
3. Review angular acceleration separately; it is useful-looking measured data but its incremental
   benefit is not established. Keep brake condition/per-part flags conditional on distinct coverage.
4. Exclude continuous wind, brake thickness/pressure, static setup, temperature, controls and other
   native-covered streams, except the small timing/identity/resource overlaps required by the plan.
5. Storage decision after this analysis: one app-owned DuckDB file per game session, with SQLite
   retaining links and compact evidence. Label the sources Native telemetry and Live capture rather
   than treating DuckDB as a source category. The payload figures above are not measured DuckDB file sizes.
6. No implementation until the user reviews this scope. Outstanding limitations are explicit:
   no LMP2 live cohort, incomplete full-axis validation, no wet SM capture, no measured final binary
   encoding/DuckDB size/compression ratio, and no new live capture or game frame-time benchmark.

## 9. Complete shared-memory field coverage

Follow-up the same day. Sections 3-6 profiled selected motion/wheel fields. This pass classifies **every
field in the decoded layout** (`server/live/rf2Layout.ts`) so nothing is silently dropped or duplicated.
Method: streamed every numeric/string leaf of the three JSONL captures (moving telemetry > 20 km/h,
all scoring frames, player and opponents separately) into `.cache/live-channel-analysis/all-fields.json`,
and correlated live `localAccel` with native G Force on the paired Laguna file (`accel-overlap.json`).
The recorder writes only a subset of the struct, so fields it never wrote have **no evidence** yet.

### 9.1 New findings that change the proposal

| Field | Evidence | Native / VCR coverage | Proposal |
|---|---|---|---|
| Tyre vertical deflection, `verticalTireDeflection[4]` | Varies on all wheels: 0-0.057 m, >98% nonzero, changes nearly every 50 Hz frame (GT3 + LMP3) | Absent from all 199 catalogs; not wheel `RideHeights` or `Susp Pos` | **Add to the dynamic core** (4 scalars, +5.76 MB/hour float64); core becomes 34 scalars |
| Impact magnitude and time, `lastImpactMagnitude`, `lastImpactET` | Damage test: 7 impacts, magnitude up to 8,896, ET 0-129 s; zero in clean runs | Native `LastImpactMagnitude` is declared **BOOLEAN**: the magnitude is lost | **Add as a sparse event** (on ET change): time, magnitude; supports damage learning |
| Per-wheel terrain name, `terrainName[4]` | 8+ distinct materials per wheel (`RMBLRAZOR`, `RMBLFLAT`, `ASTRO`, `GRVL`, `DIRT`, `RDSTREETOFF`...), ~500-1,500 changes per wheel per 26 min | Native `SurfaceTypes` is a coarse 5 Hz code | **Add as per-wheel change events**, dictionary-encoded; kerb type / track-limit evidence. Names are cut at 16 bytes (`RDRACEOLD,ROAD,`): store raw, never parse a truncated list |
| Fuel capacity, `fuelCapacity` | Constant per car: GT3 117, LMP3 100 | Not in native metadata | **Add to session configuration** (once) |
| Car upgrade pack, `upgradePack[16]` (scoring, every car) | Two distinct values among LMP3 opponents (`4242...`, `4282...`) | Not in native metadata; VCR coverage unknown | **Add to configuration** for the player car only (opponents excluded, 9.4), raw hex; meaning unresolved |
| Local acceleration, `localAccel` | 50 Hz; impact transients to 269 m/s² | **Same quantity** as native G Force at 10 Hz: r = 0.9995 (`ax` vs native "Long" table), 0.996 (`az` vs "Lat"), 0.955 (`ay` vs "Vert"); MAE ≤ 0.02 g | Overlap, not new evidence. **Conditional** (+4.32 MB/hour) only if 50 Hz G is wanted for transients; default exclude |

The accel check also independently confirms the reader's note that native "G Force Long" holds lateral
acceleration and "G Force Lat" longitudinal (`server/telemetry/duckdbReader.ts`).

### 9.2 Covered by native telemetry (no capture beyond agreed anchors)

Pedals/steering (filtered and unfiltered), gear, engine RPM/max RPM, water/oil temperature, clutch RPM,
steering shaft torque, third-spring deflection, fuel level, turbo boost, rear brake bias, headlights,
overheating, speed limiter, flaps, anti-stall, current sector, compound index. Per wheel: suspension
deflection, ride height, brake temperature, brake pressure (overlap shown in section 5), rotation (Wheel
Speed), pressure, three surface temperatures, carcass temperature, wear, surface type, detached. Player
scoring: lap distance, path lateral, track edge, sector/lap times, time behind next, finish status, in pits.
Session: ambient/track temperature, `darkCloud` (native CloudDarkness). Position/orientation: VCR + native GPS.

### 9.3 Zero, constant or invalid in every capture (exclude until proven)

- Zero across GT3 and LMP3: engine torque, drag, front/rear downforce, chassis front/rear ride height,
  `frontWingHeight`, `physicalSteeringWheelRange` (so steering cannot be converted to degrees from SM),
  compound index (0 even with names present), unfiltered clutch, flaps, wheel `flat`/`detached`, wind.
- Electric boost motor torque/RPM/temperatures/state: zero, but **no Hyper live capture exists**;
  revisit with a Hyper recording before excluding for that class.
- `batteryChargeFraction` is nonzero in the non-hybrid LMP3 with impossible values (-5.86 to 2.05):
  those were LMU's `mDeltaBest` (seconds). LMU's `InternalsPlugin.hpp` inserts it before the battery, so the
  old layout read every battery/boost field 8 bytes early; fixed 2026-10-25 (`rf2Layout.ts` follows LMU's header,
  incl. `mVirtualEnergy`, ABS/TC active and settings). The earlier readings of these fields are invalid.
- `currentSector` sometimes holds the int32 sentinel (-2,147,483,648): writers must map it to unknown.
- Constant: `ignitionStarter` = 1, `deltaTime` = 0.01 (not the 0.02 s sample spacing).

### 9.4 Opponents (scoring, every car, ~5 Hz)

Online LMP3 capture: 15 cars, 150,002 opponent rows; lap distance, path lateral, track edge, world
position, time into lap, place, lap, sector, pit/garage state and best/last lap all vary. Native telemetry
is player-only; VCR replays hold every car's trajectory but **only when a replay is saved**.

Cost at ~10 float64 scalars per car at 5 Hz: about 1.44 MB/hour per car, **21.6 MB/hour for 15 cars,
~86 MB/hour for a 60-car Le Mans grid**, more than the whole player core. **User decision (2026-10-17): exclude opponent capture and rely on saved replays.** Live capture
records the player car only; opponent race context comes from VCR replays when one is saved, and is
absent otherwise. Do not add sparse per-car transitions or 5 Hz opponent trajectories.

### 9.5 Never recorded: no evidence yet

The recorder never wrote these struct fields, so neither coverage nor validity is known:

- Telemetry: `suspForce[4]` (absent from native catalogs; most promising), `wheelYLocation[4]`,
  `tireInnerLayerTemperature[3]` per wheel (native has rubber/carcass, relationship unknown),
  `staticUndeflectedRadius`, `lastImpactPos`, `scheduledStops`, `maxGears`, `visualSteeringWheelRange`,
  `physicsToGraphicsOffset`, `speedLimiterAvailable`, front/rear compound name changes beyond "Medium".
- Player/opponent scoring: `numPitstops`, `numPenalties`, `pitState`, `flag`, `underYellow`,
  `countLapFlag`, `individualPhase`, `qualification`, `serverScored`, `estimatedLapTime`, time/laps behind
  leader/next, `pitLapDist`, `bestLapSector1/2`, opponent local velocity/rotation.
- Session info: `endET`, `maxLaps`, `sectorFlag[3]`, `gameMode`, `serverName`, `maxPlayers`, `startET`.

Next evidence step: extend `BuildTelemetrySample`/`WriteScoring` in the diagnostic recorder to write these
fields, then record one dry GT3, one wet session and one Hyper session. No new REST polling is needed.

### 9.6 Updated proposal and budget

1. Dynamic core: the 30 scalars of section 3 **plus tyre vertical deflection (34 scalars)**:
   34 float64 + timestamp at 50 Hz = **50.4 MB/hour** (was 44.64).
2. New sparse records: impact events, per-wheel terrain changes; new configuration: fuel capacity,
   per-car upgrade pack. Each well under 0.1 MB/hour.
3. Opponents: excluded by user decision (9.4); saved replays remain the opponent source.
4. Conditional: angular acceleration (section 3), 50 Hz local acceleration (9.1), boost-motor fields (Hyper).
5. Provisional planning envelope: **55-65 MB/hour**, player car only.

## Appendix: exact native catalogs

All 199 catalogs agree. Types below come from the checked GT3 example; all four representative
recordings were checked for table presence and population. Labels are preserved verbatim, including
the unit discrepancies noted above. Blank unit means the exporter declared an empty unit string.

### Continuous channels (58)

| Native name | Hz | Declared unit | Value columns |
|---|---:|---|---|
| Ambient Temperature | 1 | C | value: FLOAT |
| Brake Pos | 50 | % | value: FLOAT |
| Brake Pos Unfiltered | 50 | % | value: FLOAT |
| Brake Thickness | 10 | % | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| Brakes Air Temp | 50 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| Brakes Force | 50 | % | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| Brakes Temp | 50 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| Clutch Pos | 50 | % | value: FLOAT |
| Clutch Pos Unfiltered | 50 | % | value: FLOAT |
| Clutch RPM | 100 | RPM | value: FLOAT |
| Engine Oil Temp | 7 | C | value: FLOAT |
| Engine RPM | 100 | RPM | value: FLOAT |
| Engine Water Temp | 7 | C | value: FLOAT |
| FFB Output | 100 | % | value: FLOAT |
| Front3rdDeflection | 100 | m | value: FLOAT |
| FrontRideHeight | 100 | m | value: FLOAT |
| Fuel Level | 20 | L | value: FLOAT |
| G Force Lat | 10 | G | value: FLOAT |
| G Force Long | 10 | G | value: FLOAT |
| G Force Vert | 10 | G | value: FLOAT |
| GPS Latitude | 10 | deg | value: FLOAT |
| GPS Longitude | 10 | deg | value: FLOAT |
| GPS Speed | 10 | m/s | value: FLOAT |
| GPS Time | 100 | s | value: DOUBLE |
| Ground Speed | 100 | km/h | value: FLOAT |
| Lap Dist | 10 | m | value: FLOAT |
| OverheatingState | 2 | — | value: BOOLEAN |
| Path Lateral | 10 | m | value: FLOAT |
| Rear3rdDeflection | 100 | m | value: FLOAT |
| RearRideHeight | 100 | m | value: FLOAT |
| Regen Rate | 100 | kW | value: FLOAT |
| RideHeights | 100 | m | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| SoC | 20 | % | value: FLOAT |
| Steering Pos | 100 | % | value: FLOAT |
| Steering Pos Unfiltered | 100 | % | value: FLOAT |
| Steering Shaft Torque | 100 | Nm | value: FLOAT |
| SurfaceTypes | 5 | — | value1: UTINYINT, value2: UTINYINT, value3: UTINYINT, value4: UTINYINT |
| Susp Pos | 100 | m | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TC | 100 | — | value: BOOLEAN |
| Throttle Pos | 50 | % | value: FLOAT |
| Throttle Pos Unfiltered | 50 | % | value: FLOAT |
| Time Behind Next | 2 | s | value: FLOAT |
| Total Dist | 10 | m | value: FLOAT |
| Track Edge | 10 | m | value: FLOAT |
| Track Temperature | 1 | C | value: FLOAT |
| Turbo Boost Pressure | 100 | Pa | value: FLOAT |
| Tyres Wear | 10 | % | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TyresCarcassTemp | 5 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TyresPressure | 10 | kPa | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TyresRimTemp | 50 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TyresRubberTemp | 10 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TyresTempCentre | 100 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TyresTempLeft | 100 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| TyresTempRight | 100 | C | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| Virtual Energy | 20 | % | value: FLOAT |
| Wheel Speed | 100 | m/s | value1: FLOAT, value2: FLOAT, value3: FLOAT, value4: FLOAT |
| Wind Heading | 1 | deg | value: FLOAT |
| Wind Speed | 1 | m/s | value: FLOAT |

### Events (40)

| Native name | Declared unit | Columns |
|---|---|---|
| ABS | — | ts: DOUBLE, value: BOOLEAN |
| ABSLevel | — | ts: DOUBLE, value: UTINYINT |
| AntiStall Activated | — | ts: DOUBLE, value: BOOLEAN |
| Best LapTime | s | ts: DOUBLE, value: FLOAT |
| Best Sector1 | s | ts: DOUBLE, value: FLOAT |
| Best Sector2 | s | ts: DOUBLE, value: FLOAT |
| Brake Bias Rear | — | ts: DOUBLE, value: FLOAT |
| Brake Migration | — | ts: DOUBLE, value: FLOAT |
| CloudDarkness | % | ts: DOUBLE, value: BOOLEAN |
| Current LapTime | s | ts: DOUBLE, value: FLOAT |
| Current Sector | — | ts: DOUBLE, value: UTINYINT |
| Current Sector1 | s | ts: DOUBLE, value: FLOAT |
| Current Sector2 | s | ts: DOUBLE, value: FLOAT |
| Engine Max RPM | RPM | ts: DOUBLE, value: FLOAT |
| Finish Status | — | ts: DOUBLE, value: UTINYINT |
| FrontFlapActivated | — | ts: DOUBLE, value: BOOLEAN |
| FuelMixtureMap | — | ts: DOUBLE, value: UINTEGER |
| Gear | — | ts: DOUBLE, value: TINYINT |
| Headlights State | On/Off | ts: DOUBLE, value: BOOLEAN |
| In Pits | — | ts: DOUBLE, value: UTINYINT |
| Lap | — | ts: DOUBLE, value: USMALLINT |
| Lap Time | s | ts: DOUBLE, value: FLOAT |
| Last Sector1 | s | ts: DOUBLE, value: FLOAT |
| Last Sector2 | s | ts: DOUBLE, value: FLOAT |
| LastImpactMagnitude | — | ts: DOUBLE, value: BOOLEAN |
| LaunchControlActive | — | ts: DOUBLE, value: BOOLEAN |
| Minimum Path Wetness | % | ts: DOUBLE, value: FLOAT |
| OffpathWetness | % | ts: DOUBLE, value: BOOLEAN |
| RearFlapActivated | — | ts: DOUBLE, value: BOOLEAN |
| RearFlapLegalStatus | — | ts: DOUBLE, value: BOOLEAN |
| Sector1 Flag | — | ts: DOUBLE, value: UTINYINT |
| Sector2 Flag | — | ts: DOUBLE, value: UTINYINT |
| Sector3 Flag | — | ts: DOUBLE, value: UTINYINT |
| Speed Limiter | — | ts: DOUBLE, value: BOOLEAN |
| TCCut | — | ts: DOUBLE, value: UTINYINT |
| TCLevel | — | ts: DOUBLE, value: UTINYINT |
| TCSlipAngle | — | ts: DOUBLE, value: UTINYINT |
| TyresCompound | — | ts: DOUBLE, value1: UINTEGER, value2: UINTEGER, value3: UINTEGER, value4: UINTEGER |
| WheelsDetached | — | ts: DOUBLE, value1: UTINYINT, value2: UTINYINT, value3: UTINYINT, value4: UTINYINT |
| Yellow Flag State | — | ts: DOUBLE, value: UTINYINT |

### Metadata keys (all 199 files)

`CarClass`, `CarName`, `CarSetup`, `DriverName`, `RecordingTime`, `SessionTime`, `SessionType`, `SteamID`, `TrackLayout`, `TrackName`, `Version`, `WeatherConditions`.
