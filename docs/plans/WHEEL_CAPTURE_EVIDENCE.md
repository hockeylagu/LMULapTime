# Saved wheel evidence assessment

Inspected 2026-10-18. Existing raw shared-memory JSONL can supply the wheel-channel verification
dataset; another drive is not the starting requirement. Normalization-version-2 capture is implemented
using the mappings below, with a saved-frame round-trip through the real DuckDB worker.

## Available data

Streaming inspection found four captures with all six pending fields at all four corners:

| Capture | Valid telemetry rows | Rows above 30 km/h |
|---|---:|---:|
| `test/fixtures/telemetry/Bahrain-International-Circuit_20260913-163257.jsonl` | 46,103 | 43,726 |
| `C:/Documents/lmu-live-captures/2026-10-15-laguna-gt3-offline-practice/WeatherTech-Raceway-Laguna-Seca_20261015-204047.jsonl` | 1,243 | 1,243 |
| `C:/Documents/lmu-live-captures/2026-10-15-lemans-gt3-offline-damage-test/Circuit-de-la-Sarthe_20261015-212740.jsonl` | 8,203 | 2,484 |
| `C:/Documents/lmu-live-captures/2026-10-15-lemans-lmp3-online/shared-memory/Circuit-de-la-Sarthe_20261015-213408.jsonl` | 106,953 | 99,089 |
| Total | 162,502 | 146,542 |

These are JSONL row counts, not independent laps or sessions for learning acceptance. Non-JSON
lines, including a truncated trailing record encountered during inspection, are excluded. Earlier
Algarve/Monza fixtures have camber but omit some of the other five fields; absence must not become zero.
Analysis outputs are local ignored files under `.cache/wheel-evidence/`.

## Findings and remaining interpretation

All six fields vary and contain nonzero values while driving. The historical C# recorder serializes
the corresponding `Rf2Wheel` doubles directly, rounding velocities to four decimals and angles to
five; its rounding helper replaces nonfinite values with zero. Consequently a recorded zero alone
cannot prove a valid physical zero. The live decoder must preserve nonfinite input as unavailable.

| Field | Saved evidence | Constraint before ISO-normalized capture |
|---|---|---|
| `longitudinalGroundVel` | Negative during forward travel; Bahrain wheel values reach −71.6525 m/s and Le Mans LMP3 −82.9956 m/s. Correlation of its negation with speed in m/s is approximately 0.991–0.999 across the four LMP3 wheels, with fitted slopes 1.002–1.008 | Strong scale/direction evidence; account for wheel-local frame and turns rather than blindly applying a vehicle-axis conversion |
| `lateralGroundVel` | Varies in both directions, including approximately −8.454 to +12.1582 m/s in Bahrain | Compare straight/left/right segments and the wheel orientation to establish lateral sign/frame |
| `longitudinalPatchVel` | Distinct from ground velocity; Bahrain range −26.1192 to +12.2042 m/s | Preserve its contact-patch meaning; do not label it vehicle speed or a dimensionless slip ratio |
| `lateralPatchVel` | Varies in both directions, often close to lateral ground velocity | Similarity does not make them aliases; establish physical reference/sign from the producer and segment analysis |
| `camber` | Nonzero dynamic angles, including about −0.04974 to −0.00748 in the short Laguna capture | The producer's side-dependent description means outward-positive on both sides, matching ISO camber; preserve the value rather than flipping one side as for a roll angle |
| `toe` | Front values closely follow steering: correlation above 0.9997 in sampled Laguna/Le Mans data, with slope around 0.29–0.33 radians per normalized steering input | This is a current wheel orientation relative to the vehicle, not merely static garage toe; do not present it as the setup setting |

Correlations sample every tenth moving telemetry row, preserve file/corner separation and do not
establish full-session timing alignment or calibration acceptance. Stationary, damaged or unsupported
samples must be considered separately. No claim is made that wheel rotation/load supplies an
independent reference: the inspected recordings did not yield rotating-and-loaded controls under
the analysis criterion, despite meaningful velocity/angle values.

Primary producer reference:
[rF2 shared-memory wheel definitions](https://github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin/blob/master/Monitor/rF2SMMonitor/rF2SMMonitor/rF2Data.cs).
Its comments identify camber units/side convention and toe relative to the vehicle, but do not fully
define all wheel velocity signs. It is lineage evidence, not a substitute for checking actual LMU output.

## Delivered mapping and tests

| Source field at FL/FR/RL/RR | Normalization version 2 |
|---|---|
| `lateralPatchVel`, `lateralGroundVel` | Preserve left-positive value in m/s |
| `longitudinalPatchVel`, `longitudinalGroundVel` | Negate back-positive value to forward-positive m/s |
| `camber` | Preserve outward-positive radians at every corner (ISO camber, not globally signed inclination/roll) |
| `toe` | Preserve on FL/RL; negate on FR/RR, yielding inward-positive radians; retains current steering |

The source frame must not be inferred solely from steering or the old decoder's comments.
The producer's [InternalsPlugin header](https://github.com/cosimo/rFactor2-DeltaBest/blob/master/Include/InternalsPlugin.hpp)
defines left/up/back local vehicle axes and right-positive yaw. Inspection of saved LMP3 data also
fitted wheel lateral ground velocity against body lateral velocity, toe and yaw: body-lateral
coefficients were approximately 0.992–1.009, supporting preservation of lateral sign. Those fits
are consistency checks, not exact wheel-centre or suspension geometry reconstructions.

This exposed the original six-channel sign error. Version 2 maps vehicle velocity as `(-z, x, y)`
and angular velocity as `(z, -x, -y)`, accounting for the source frame's handedness. Version-1
recordings keep their original metadata/data and are not resumed by the new recorder. Evidence reads
correct their lateral/roll/yaw signs once, reporting current normalization and source version separately.
No raw files or retained learning facts are deleted or rewritten.

ISO camber is outward-positive and toe-in is positive; these scalar conventions differ from a general
rotation about an axis. Definitions are in ISO 8855:2011, §7.1.7/§7.1.17; the
[suspension kinematics research](https://odr.chalmers.se/bitstreams/04f5c74e-06bd-4afb-a74f-633217050d8e/download)
also documents their geometric interpretation. The old plugin header's historical ISO parenthetical
is not used as the authority for the current ISO axis definition.

Tests cover all corners with distinct values, both direction signs, radians, finite zero, NaN/infinity,
versioned catalogs, old-file read conversion and interrupted-version isolation. A captured Laguna
frame's 24 wheel values survive service → writer worker → DuckDB → separate read-only process.
The aligned motion API still serves its six vehicle channels; wheel values are stored for DuckDB
analysis and future consumers. Existing JSONL is verification input, not automatically imported history.

Next: compare a new live recording against these expectations and complete overhead, session-transition
and recovery checks. Specialized consumers and derived slip metrics remain separate work; storage
alone does not establish their validity.

The normal race-weekend and multi-session learning acceptance checks remain in the
[validation runbook](LIVE_SESSION_VALIDATION.md).
