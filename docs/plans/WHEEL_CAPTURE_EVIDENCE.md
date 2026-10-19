# Saved wheel evidence assessment

Inspected 2026-10-18. Existing raw shared-memory JSONL can supply the wheel-channel verification
dataset; another drive is not the starting requirement. This assessment does not enable capture.

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
| `camber` | Nonzero dynamic angles, including about −0.04974 to −0.00748 in the short Laguna capture | Producer documents radians with side-dependent positive direction; ISO conversion must explicitly account for corner side |
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

## Next implementation work

1. Use these saved captures to finish per-corner sign/frame verification and document the exact
   conventional ISO 8855 mapping. Request a new controlled segment only where a specific gap remains.
2. Implement verified fields in `server/live/capture/decode.ts`, update channel provenance/verification
   metadata and add finite/unavailable, wheel-order, sign and unit regressions using small source excerpts.
3. Verify new DuckDB values against the established mapping in the next live session. The current
   reserved columns remain NULL until that implementation; existing JSONL is not automatically imported.

The normal race-weekend and multi-session learning acceptance checks remain in the
[validation runbook](LIVE_SESSION_VALIDATION.md).
