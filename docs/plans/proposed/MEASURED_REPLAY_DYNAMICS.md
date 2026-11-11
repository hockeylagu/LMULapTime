# Measured replay dynamics (steps 1-3 done)

Agreed with the driver on 2026-11-10. Replay laps use the pose packet's measured acceleration, yaw rate and velocity
(every car, up to 50 Hz) and the measured wheel speeds instead of the values `src/utils/computedTelemetry.ts`
estimates from position and heading. The estimates stay as the fallback for laps without them (replays whose file is
gone, decoded before this change).

The decoder converts to ISO 8855 (positive left, TELEMETRY_FORMAT.md "Sign conventions") once, before the row is
cached, as it already does for steering; rows hold what the app serves and the read path stays a plain decode.

## Evidence (Daytona R1 12, 2026-11-10)

Pose fields against the car's own motion, speeds above 15 m/s, 9-sample means against ±4-sample differences:

| Field (VCR_FORMAT §4.1) | Frame found | Check | Result |
| :--- | :--- | :--- | :--- |
| Velocity x, z (bits 64..103) | world | against d(position)/dt | r 1.0000, slope 1.000 |
| Car forward | world | velocity direction against `rotY` | forward = (−sin rotY, −cos rotY), r −0.99 |
| Acceleration x, z (bytes 3, 34, 35) | **world**, not car | against d(world velocity)/dt | r 0.925 (x), 0.949 (z) |
| Longitudinal = a · forward | car | against d(speed)/dt | r 0.962 / 0.983 (two cars), slope 0.94 / 0.97 |
| Lateral = a · left, left = (cos rotY, −sin rotY) | ISO 8855 | against speed × yaw rate | r 0.938 / 0.993, slope 0.95 / 1.04 |
| Yaw rate = −(angular velocity y) | ISO 8855 | against −d(rotY)/dt | r 0.985 / 0.994, slope 0.91 / 0.96 |
| Sideslip = atan2(v · left, v · forward) | ISO 8855 | distribution | median 0.3°, p95 1.7° |

VCR_FORMAT.md §4.1 calls the acceleration fields longitudinal and lateral; they are world x and z and are corrected
with this change.

## Design

### Decoder (`replayPose.ts`)

From each pose, in ISO 8855, rounded below the source resolution so the codec keeps them small:

| Stored channel | Formula | Source step | Stored as |
| :--- | :--- | :--- | :--- |
| `accelLonG` | world acceleration · forward / g | 1/32 m/s² (0.0032 g) | 3 decimals |
| `accelLatG` | world acceleration · left / g | 1/32 m/s² | 3 decimals |
| `yawRateDeg` | −(angular velocity y) in deg/s | 1/64 rad/s (0.9 °/s) | 2 decimals |
| `velocityLon` | world velocity · forward, m/s | 1/32 m/s | 3 decimals |
| `velocityLat` | world velocity · left, m/s | 1/32 m/s | 3 decimals |

**The file's values can be rebuilt from these.** Rotating back by the stored `rotY` (4 decimals) and rounding to the
source step gives every acceleration, velocity and angular velocity code exactly: 0 misses over 12,219,543 poses of
every car in Daytona R1 12 (2026-11-10). A later migration can therefore rewrite rows of replays whose file is gone
from the stored values. Forward velocity is kept for that (the driver's choice, 2026-11-10): rebuilt from the speed
instead, 1.2 % of the velocity codes came back wrong, a reversing car badly. The vertical velocity is not kept.
Sideslip is not stored as an angle (it would not round-trip); the app takes
`slipAngleDeg = atan2(velocityLat, velocityLon)` where `velocityLon` ≥ 5 m/s.

Size, Daytona R1 12 (encoding 2 picks each form itself): about 2.5 bytes per sample for the five channels against
8.3 for the current rows, so replays on disk grow by about 30 %.

Tests: synthetic poses for each formula with the signs as fixtures (a left turn gives positive lateral G and yaw
rate, braking gives negative longitudinal G), the round trip back to the file codes, and the player's values against
native DuckDB G and yaw rate on one paired session.

### Measured wheel slip

Slip ratio needs each car's rolling radius, which the replay does not hold for other cars (opcode 88 is player only).
Estimate it per wheel and lap from free-rolling samples (no brake, low yaw rate, above 20 m/s), then
`ratio = (ω × r − v_forward) / v_forward`, from the stored `wheelAngularSpeeds` and the lap's speed. This is
analysis on a whole lap, so it lives in `shared/domain` beside the live `wheelSlip.ts` and uses its event rule (15 %,
two samples). The served field is source-neutral (`wheelSlip`); a live capture, where
present, still takes precedence (it measures the contact patch directly).

Validation before wiring: compare the replay ratios with live-capture ratios on the same laps (any race with a live
recording) and with the opcode 143 slide levels; the radius estimate must agree within 1 % across a stint.

### App: prefer measured, keep the estimate as fallback

`computeVehicleDynamics` already prefers a finite measured `accelLonG` / `accelLatG`; yaw rate and sideslip get the
same rule, and `computeTireSlipAndLockup` uses measured slip when present. Under/oversteer stays computed (no direct
field), fed with the measured yaw rate. Provenance marks replay-measured values apart from live ones.

## Delivery

1. **Replay (cache v10), done 2026-11-10.** The decoder stores the five channels for every car; the deleted
   replays were relabelled offline (backup in lmu-offline). Stored laps grew about 25 % (4.4 B per sample on the
   Daytona race).
2. **App fallback rule, done 2026-11-10.** `computeVehicleDynamics` takes the replay's measured yaw rate, and
   sideslip = atan2(velocityLat, velocityLon) from 5 m/s forward; the estimates fill in elsewhere. On Daytona laps
   the estimates agree (yaw r 0.99, sideslip r 0.82-0.93).
3. **Measured slip, done 2026-11-10.** `shared/domain/live/replayWheelSlip.ts`, applied to every lap the app
   loads (`replayApi.ts`). Validated on the Le Mans race of 2026-11-10 (16 laps, live capture): the radius stays within
   0.2-0.4 % per wheel; 47 of the 53 live lockup/wheelspin events found, the 6 missed peaking at 15-19 %; 19
   replay-only events, mostly around two incidents. Replay ratios read about 2 % less braking slip at the fronts
   (1 % at the rears) than the patch, so borderline front lockups can be missed.

Each step lands as its own commits with tests, lint and build clean.

## Follow-up: live capture channels

The live recorder keeps forward and left velocity and yaw rate only for post-session charts (sideslip, yaw rate;
`liveTelemetryFusion.ts`), and the eight patch and ground longitudinal velocities for wheel slip (`wheelSlip.ts`); the
live dashboard reads none of them. Once step 1 shows the replay's player values match the live ones on the same laps,
the three body channels can leave the recorder (recording version 5). The eight wheel channels are the reference that
step 3 is validated against; whether they can go is decided after it. The raw hybrid values stay (the replay has no
battery charge or regen power).
