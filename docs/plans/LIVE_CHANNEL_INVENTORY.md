# Live capture channel inventory

Status: Reviewed inventory; capture foundation implemented 2026-10-18. Six vehicle dynamics are
enabled; reserved wheel channels remain unavailable pending ISO frame/sign verification.
Reviewed: 2026-10-17 against 199 native catalogs, three shared-memory captures and saved REST evidence.
Companion: [Live session evidence plan](LIVE_SESSION_EVIDENCE.md).

Confirmed normalization: the app expects the **ISO 8855 standard**. Convert verified LMU memory
dynamics once at ingestion and store ISO values directly in the live-capture DuckDB file. Source-axis/
unit conversion still requires verification; unmapped fields do not enter canonical columns. Store
conversion provenance/version rather than duplicate native sample arrays. Native track/map coordinates
keep their existing LMU frame; no ISO conversion is applied to physical track geometry.

The [measured analysis and full native catalog](LIVE_CHANNEL_ANALYSIS.md) supersede preliminary absence
claims. Confirmed corrections: wind, brake thickness, vertical G, all three tyre-temperature bands and
initial setup are already in DuckDB. Motion/per-wheel values vary at about 50 Hz in GT3/LMP3 captures.
The proposed 30-scalar dynamic core costs 44.64 MB/hour (50.4 MB/hour with tyre deflection, [section 9](LIVE_CHANNEL_ANALYSIS.md)) as float64 values with one timestamp per sample,
before metadata. No final storage size or game-performance improvement is claimed.

Implementation was authorized after user review. Existing game observations are historical
evidence, not a fresh live verification. Struct availability does not establish useful values or semantics.
The full actual DuckDB catalog must distinguish exported channels from fields merely missing in the app's
reader; absence from `ReplayTrajectoryPoint` or an importer is not proof of source absence.

## Selection rules

- Add useful evidence missing from DuckDB and replay; avoid recording their full streams again.
- Keep small identity/time/resource overlaps needed for session matching and current live advice.
- Store measurements, game estimates, selections and derived metrics as different kinds of evidence.
- Cadences below are proposals, not measured performance guarantees. REST shares the existing serialized
  request budget, replay exclusions and backoff; frequencies are not additive endpoint polling promises.
- Review actual per-recording catalogs and replay facts before finalizing absence claims. If the actual
  recording lacks an ordinarily available channel, document the fallback policy explicitly.
- Preserve source precision in typed chunks, record state changes/sparse events, compress after sessions.

Evidence labels: **Observed** = values documented from prior game captures; **Decoded** = current app
parses the field; **Candidate** = field exists or historical notes suggest value, but useful semantics or
cross-source coverage still need validation. These labels can overlap. No row implies user acceptance yet.

## A. Proposed complementary evidence

| Channel / values | Live source and kind | Existing coverage and benefit | Evidence / proposed capture |
|---|---|---|---|
| Body dent severity, eight slots | SM `dentSeverity[8]`; measurement | Adds evolving damage-zone indicators beyond impact/detachment events; exact body-zone labels unknown | Observed, Decoded; sample with low-rate car frames, persist changes plus initial state |
| Body/aero damage level | REST `getVehicleCondition.vehicleDamage`; measurement | Adds a damage level, distinct from VCR part-detachment flags | Observed, Decoded; existing impact/crossing/pit-exit condition triggers |
| Suspension damage FL/FR/RL/RR | REST `suspensionDamage[4]`; measurement | Adds per-corner mechanical condition, not suspension travel | Observed, Decoded; same triggered response, no extra request stream |
| Repair-time estimate | REST `pitstop-estimate.damage`; game estimate | Adds contemporaneous repair estimate; not proof of actual repair duration | Observed, Decoded; existing pit/damage polling; retain penalty context |
| Pit service estimates | REST estimate `fuel`, `ve`, `tires`, `penalties`, `total`; game estimates | Allows later comparison of expected versus observed stop; components may be suppressed by penalties | Observed, Decoded; existing estimate response, timestamped changes |
| Pit repair selection | MFD `DAMAGE:`; selection | Records body/all/no-repair intent, not service completion | Observed, Decoded; existing menu reads, state changes |
| Pit resource target and fuel ratio | MFD resource/fuel-ratio lines and options; selection | Actual fuel/VE traces do not preserve the user's intended target or ratio | Observed, Decoded; existing menu reads, state changes; preserve units/meaning |
| Pit tyre selection | MFD `TIRES:`; selection | Adds requested service context | Observed, Decoded; same menu response, state changes |
| Garage start resource/ratio selection | `getPlayerGarageData` resource fields; selection | Adds pre-run intent; selection is not physically loaded resource | Observed, Decoded; existing garage/session reads |
| Tyre inventory | `TireManagement.tireInventory`; state | Adds raw available/new tyre counts; not proven counts of complete four-tyre sets | Observed, Decoded; existing tyre-management reads and pit exit |
| Selected tyre condition | `selectedTires` used/wear/compound entries; selection | Adds chosen tyre-set context, not a proven unique physical set ID | Observed; app currently aggregates used/worst wear/compound; preserve per-wheel evidence if verified |
| Game consumption estimates | `expectedUsage` fuel and VE; game estimates | Distinct from measured consumption; useful fallback and estimator evaluation | Observed, Decoded; existing tyre-management response |
| Pit-rule random delays | `RepairAndRefuel.pitStopTimes` repair/fuel/tyre/VE delays; configuration | Explains variation around pit estimates | Observed, Decoded; once/configuration change, not every telemetry frame |
| Forecast rain nodes | `sessions/weather` rain chance at start/25/50/75%/finish, per session; forecast | Adds future/scripted weather context; recorded rain is an outcome, not a forecast | Observed, Decoded; loaded-session response and verified changes |
| Forecast sky/temperature/humidity/wind nodes | Same weather response; forecast/configuration | Additional future-condition context beyond rain nodes | Observed response fields in REST notes; not all parsed; validate units/availability before inclusion |
| Impact magnitude and time | SM `lastImpactMagnitude`, `lastImpactET`; measurement | Native `LastImpactMagnitude` is boolean, so magnitude is lost | Observed (7 impacts, up to 8,896); sparse event on ET change |
| Per-wheel terrain material | SM wheel `terrainName`; measurement | Richer than native `SurfaceTypes` code (rumble strip type, astro, gravel) | Observed; dictionary-encoded per-wheel change events; raw 16-byte names may be truncated |
| Fuel capacity, car upgrade pack | SM `fuelCapacity`; player scoring `upgradePack`; configuration | Absent from native metadata | Observed; once per session, upgrade pack raw hex |
| Average/maximum path wetness | SM `avgPathWetness`, `maxPathWetness`; measurement | Absent from all native catalogs; VCR rain bytes must not be relabeled actual wetness | REST saved wet values verified 0-0.60 for both; available SM samples dry, direct wet validation pending; up to ~5 Hz proposed |

SM = shared memory. Resource percent, fraction and joules must remain distinct. Four-wheel arrays use
FL/FR/RL/RR. REST condition responses retain observation intervals and age; no fabricated crossing precision.

## B. Motion and per-wheel candidates requiring validation before acceptance

The first six rows form the proposed 30-scalar dynamic core: actual useful variation is established in
GT3/LMP3 captures, and no equivalent is declared by the 199 native catalogs or established VCR fields.
Full-axis/physical normalization still needs validation; detailed ranges and timing checks are in the analysis.

| Channel / values | Source fields | Benefit / overlap | Proposed representation and cadence |
|---|---|---|---|
| Measured angular velocity, three axes | SM `localRot` | Can replace differentiated replay orientation for yaw/pitch/roll rates | Three typed values at observed source cadence, at most ~50 Hz initially; axis/sign validation required |
| Measured local velocity, three axes | SM `localVel` | Provides vehicle-frame motion for measured sideslip inputs; replay position offers derived velocity | Three typed values, at most ~50 Hz; validate local axes and relation to orientation |
| Wheel contact-patch velocity, lateral/longitudinal per wheel | SM `lateralPatchVel`, `longitudinalPatchVel` | Inputs for per-wheel slip, not interchangeable with wheel speed | Eight typed values, at most ~50 Hz if validated |
| Wheel ground velocity, lateral/longitudinal per wheel | SM `lateralGroundVel`, `longitudinalGroundVel` | Complements patch velocity; slip definitions need physical validation | Eight typed values, same timestamps as patch values |
| Dynamic camber per wheel | SM `camber` | Measured wheel geometry rather than static setup | Four typed values; 50 Hz proposed; variation verified, radians working unit, side/sign checks remain |
| Dynamic toe per wheel | SM `toe` | Adds changing alignment evidence | Four typed values; 50 Hz proposed; variation verified, radians working unit, side/sign checks remain |
| Tyre vertical deflection per wheel | SM wheel `verticalTireDeflection` | Absent from native catalogs; varies 0-0.057 m at 50 Hz | Proposed addition to the core (34 scalars); four typed values |
| Local acceleration, three axes | SM `localAccel` | Same quantity as native G Force (r ≥ 0.955) at 10 Hz | Conditional; only 5x cadence gain for transients |
| Angular acceleration, three axes | SM `localRotAccel` | Potential transient handling evidence; may be derivable/noisy | Conditional; keep only if measured benefit exceeds differentiating angular velocity |
| Wind vector | SM scoring `wind` | Native Wind Speed/Heading already exported at 1 Hz | Exclude duplicate by default; checked SM vectors all zero |
| Brake condition | REST `brakeCondition`, wearables | Native Brake Thickness already exported at 10 Hz; normalized condition may duplicate it | Include only if a distinct useful meaning is established; exclude separate brakeinfo polling |
| Per-part loss flags | REST `wearables.body.detachableParts` | Only useful if more detailed than decoded VCR detachable-part state | Conditional state changes; requires semantic mapping and coverage comparison |
| Detailed pit rules | REST service base times, rates and constraints | Can explain stop duration beyond current parsed random delays | Conditional configuration snapshot from existing response; validate units and service semantics |

Derived yaw rate, sideslip, wheel-slip angle/ratio and damage pace loss are projections, not extra raw
channels. Record validated inputs and formula versions. Avoid storing raw vectors plus redundant derived
angles/rates by default. Existing fields with derived names do not prove equivalent measured coverage.

## C. Covered channels: no full duplicate historical capture by default

| Channel group | Existing source evidence | Live treatment |
|---|---|---|
| Throttle, brake, steering, gear, RPM, speed | DuckDB reader and VCR | Use current live UI stream if needed; do not persist a second full trace by default |
| Fuel and VE level | DuckDB native channels; replay fallback fields | Small overlap for current strategy, crossing usage and validation; no full duplicate high-rate trace |
| Tyre wear, pressure, temperature | DuckDB channels and replay fields | Retain only required current condition/selection context or verified semantic gaps |
| Wheel speed, suspension position, brake temperature | DuckDB/native and replay contracts | No full duplicate; compare actual source catalogs for availability |
| Position and orientation | Replay world coordinates/rotation; native telemetry coordinate evidence | No full duplicate; use only minimal synchronization or uniquely justified measured additions |
| G forces / acceleration | DuckDB; replay-derived values | No automatic duplicate; first establish whether new vertical/local components add missing evidence |
| Actual rain intensity and track/air temperature | Replay weather and telemetry/session evidence | Keep minimal live condition context; forecast and actual wetness are separate channels |
| Impact time/magnitude, wheel detachment, overheating | Native telemetry/events and replay evidence vary | Use minimal damage-event trigger/context; do not automatically persist duplicates |
| Lap/sector timing, position, pit state, flags | XML/replay/telemetry overlap | Retain sparse anchors and transitions needed for matching, stop outcomes and live operation |
| Compound, SoC, regen and engine channels | Native exported channels vary by class/catalog | Inventory first; not new channels merely because the current reader does not expose every field |
| Wind, brake thickness, vertical G, three tyre-temperature bands, static setup | Actual native catalogs and `metadata.CarSetup` across all 199 files | Reuse recorded data; no full duplicate streams or setup snapshots; capture only justified later changes |

Minimal necessary overlap must be listed with a purpose, shape and cadence before approval. Proposed
overlap: game elapsed time/epoch, lap-start/crossing/sector anchors, source car/driver identity and lifecycle,
pit/caution transitions, and low-rate fuel/VE observations for current resource planning. UTC receipt
and monotonic time are recorder metadata, not replacements for DuckDB-compatible game time.

## D. Exclude unsupported or misleading channels

- Tyre load, grip, lateral/longitudinal forces, aerodynamic downforce/drag, engine torque and chassis
  ride heights documented as zeroed in historical shared-memory captures: exclude unless new evidence
  verifies useful data. Struct presence does not make zero a valid measurement.
- Opponent scoring (positions, gaps, laps, pit state): excluded by user decision 2026-10-17; saved
  replays are the opponent source. Live capture records the player car only.
- Other cars' online fuel/VE: prior REST observations returned zero; do not infer actual remaining resource.
- Mandatory-stop/window rules without verified semantics: exclude guessed metrics.
- Unknown dent-slot body names: store numbered slots, not invented front/rear/left/right labels.
- Detailed temperature layers, terrain/contact fields, electric motor fields or extra setup channels:
  unresolved until catalog comparison and useful live values establish that they add missing evidence.

## Review gate and next evidence

Before any capture implementation:

1. Review A as the proposed complementary evidence, B as conditional candidates, C as minimal overlap
   or existing coverage, and D as excluded/unresolved. User acceptance must identify the chosen rows.
2. Completed: compare all 199 actual native catalogs and inspect four representative table populations;
   the exact catalog and known VCR coverage are in [the analysis](LIVE_CHANNEL_ANALYSIS.md).
3. Partly completed: quantify B's value quality and paired timing from existing captures; full unit/sign
   normalization remains explicit. Any new live validation
   remains discovery only, preserving existing safe polling and excluding replay observations.
4. Proposed shapes, cadence, units/limits and conservative costs are in the analysis. Finalize canonical
   names and normalization for the rows the user accepts; do not claim approval from this analysis.
5. Update this inventory with evidence and uncertainties, then obtain user review before implementation.

The selected container is one app-owned DuckDB file per game session, with recovery segments retained
inside that session recording. Table layout and post-session compaction choices follow the accepted
channel shapes and measured writer behavior. Source labels are **Native telemetry** and **Live capture**;
DuckDB describes their engine rather than serving as a source label.
The agreed automatic capture, lightweight writes and deferred compression remain unchanged. Recordings
have no hard cap or automatic eviction; storage cleanup is manual, preserving compact evidence/provenance.

## References

- [Recorded live-source evidence](LIVE_DATA_SOURCES.md).
- [DuckDB format and historical enrichment comparison](../TELEMETRY_FORMAT.md).
- [REST observations](../LMU_REST_API.md), [VCR format](../VCR_FORMAT.md).
- [Shared-memory layout](../../server/live/rf2Layout.ts),
  [decoder](../../server/live/rf2Decode.ts), [REST parsers](../../server/live/lmuPitRest.ts).
- [DuckDB reader](../../server/telemetry/duckdbReader.ts),
  [replay contracts](../../shared/types/replay.ts),
  [diagnostic capture fields](../../tools/telemetry-recorder/Program.cs).
