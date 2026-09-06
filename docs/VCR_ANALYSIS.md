# VCR Format — Analysis, Provenance & Future Work

Companion to [VCR_FORMAT.md](VCR_FORMAT.md).

**Division of responsibility:**

- **VCR_FORMAT.md** states *what is where* — byte offsets, bit masks, payload layouts. Only
  facts that are established go there, with no hedging, evidence or history.
- **This document** records *how we know*, *how confident we are*, what has been ruled out, and
  what to try next. Anything speculative, superseded, or in progress belongs here.

When a hypothesis in this document graduates to established fact, move the bare statement into
VCR_FORMAT.md and leave the evidence trail here.

---

## 1. Methodology: identifying undocumented fields via ground-truth correlation

Unknown bytes in the Class 0 pose packet are resolved empirically rather than by guesswork, by
cross-referencing against the rF2 shared memory plugin, which LMU ships and enables by default
(`Plugins/rFactor2SharedMemoryMapPlugin64.dll`).

### 1.1 Tooling

| Step | Tool | Command |
|---|---|---|
| Verify plugin/struct health first | `tools/telemetry-recorder` (C#) | `npm run telemetry:probe` |
| Capture live telemetry | same | `npm run telemetry:record` |
| Diagnose an empty/odd buffer | same | `lmu-telemetry-recorder.exe dump` |
| Sweep VCR bytes vs telemetry | `tools/analysis/correlateVcr.ts` | `npx tsx tools/analysis/correlateVcr.ts --vcr <f.Vcr> --telemetry <f.jsonl>` |
| Cross-validate a field, no ground truth needed | `tools/analysis/verifyRpm.ts` | `npx tsx tools/analysis/verifyRpm.ts <f.Vcr> ...` |

The recorder writes JSONL with `tel` records (~50 Hz: position, orientation matrix, rpm, fuel,
pedals, hybrid/boost, per-wheel temps/wear/terrain) and `sco` records (5 Hz: `lapDist`,
`pathLateral`, `trackEdge` for every car). Both are keyed on `et`, which joins to the VCR slice
`sTime`. The sweep estimates the constant epoch offset between the two by maximising speed
correlation before pairing samples.

**A replay must be saved from the same session as the recording**, or there is nothing to join.

> Note: `npm run vcr:correlate -- --flag` mangles arguments under PowerShell. Call `npx tsx`
> directly when passing flags.

### 1.2 Capture constraints

- **Replays do not feed the plugin.** Verified over ~60 s of active playback: the telemetry
  buffer is never populated and the scoring buffer is frozen (`mCurrentET` stays 0, version
  counters stop, all vehicle geometry zeroed). Only static session strings survive. All
  shared-memory capture must come from actually driving.
- **Track geometry fields are scoring-only**, i.e. 5 Hz: `mLapDist`, `mPathLateral`, `mTrackEdge`
  are `rF2VehicleScoring` members, not telemetry members.

### 1.3 Interpreting results (critical)

The sweep enumerates ~12k candidate extractions (u8/i8/u16/i16/u32/i32/f32 at every offset, plus
bitfields of width 4–16 at every shift). At that scale, false positives are guaranteed unless
controlled:

- **Known-answer controls.** `speedKmh`, `throttle`, `brake` and `steering` must be rediscovered
  at their documented offsets. If they are not, alignment or parsing is broken and every other
  row is meaningless.
- **Negative control.** `gear` lives in the event header (`eventType - 8`), never in the payload,
  so its score *is* the false-positive floor. Measured: **r = 0.87 uncontrolled, r = 0.65
  controlled** while driving; r = 0.55 in a stationary window. Anything at or below the floor is
  noise.
- **Nuisance regression.** Candidates and channels are residualised against speed, time and
  time². Without it, every monotonic channel (fuel falling, temps and wear rising) matches any
  drifting counter in the packet.
- **Shared-candidate smell.** If several unrelated channels all report the *same* candidate, that
  is the trend artifact, not a discovery.
- **Label aliasing.** `bits@4>>23`, `bits@5>>15` and `bits@6>>7` denote identical bits read from a
  u32 at different bases. Normalise via `absoluteBit = offset*8 + shift`.

### 1.4 Breaking confounds

Speed and rpm are nearly inseparable while driving, capping any rpm candidate around r = 0.83.
To decouple, record a purpose-built session: **stationary in neutral, blipping the throttle
through the rev range** — speed stays 0 while rpm sweeps fully. This worked: r went 0.83 → 0.9997
and resolved the field outright. Use `--maxSpeed 2` to restrict the sweep to that window.

The same idea isolates other channels: a long constant-pace stint for fuel, repeated identical
stops for brake temps.

### 1.5 Validating without ground truth

Once shared-memory captures run out, a candidate can still be tested for internal consistency.
`verifyRpm.ts` checks that **upshifts lower** the field and **downshifts raise** it. Because gear
comes from the event header rather than the payload, this is a genuine cross-check, not a
circular one.

> **Gotcha:** every real shift dips through neutral for 2–3 frames. Shift-detection code must
> track transitions on the *last non-zero gear*; a `gear >= 1` guard on adjacent frames silently
> detects **zero** shifts.

---

## 2. Findings & provenance

### 2.1 Engine RPM — confirmed

Documented in VCR_FORMAT.md §4. Evidence trail:

| Evidence | Value |
|---|---|
| Correlation in stationary window | **r = 0.9997** |
| Negative control (`gear`) in same window | r = 0.55 |
| Held-out error on 15,016 moving samples | **mean 8.5 rpm, p95 30.1** (0.11% of range) |
| Shift-direction consistency (Imola race, 45 drivers) | **100%** of ~10,000 upshifts lower it; 98–100% of downshifts raise it |

**Provenance of the 10.9228 scale.** It is an empirical fit, not a documented constant.
Constraining through the origin over 504 distinct raw levels gives **10.9228**; an unconstrained
fit gives 10.9099 with a 6.2 intercept. An earlier figure of **10.916** came from an
unconstrained fit on a smaller sample and is superseded. Consecutive-bin step differences suggest
~10.71 but are biased low by within-bin regression and 50 Hz interpolation error — do not use
them.

Candidate closed forms, none yet distinguishable within measurement noise:

| Candidate | Value | Error |
|---|---|---|
| `2^15 / 3000` | 10.92267 | 0.001% |
| `7500 / 687` | 10.91703 | 0.05% |
| `131 / 12` | 10.91667 | 0.06% |

The Imola LMP2 peak (raw 823) implies 8989 rpm; if that limiter is exactly 9000, the scale would
be 10.936, which none of the above predict. **Do not hard-code a "clean" constant.** Resolving
this needs cars with precisely known and *different* rev limiters, confirmed to be on the limiter.

**The scale is absolute, not per-car.** If it were normalised to each car's rev limit, every car
at its limiter would report the same raw value:

| Car | Peak raw | Implied rpm | True limit |
|---|---|---|---|
| BMW M4 GT3 (Portimão, 2 separate replays) | 687 / 688 | 7499 / 7510 | 7500 |
| Oreca 07 LMP2 field (Imola race, 45 cars) | 805–823 | 8800–8984 | ~8900 |

**Saturation risk.** The field is 10 bits, so it caps at 1023 ⇒ **~11,170 rpm**. Nothing in
current content approaches this (max observed 823), but a higher-revving car would wrap silently.
A guard is warranted.

### 2.2 Gear — independently re-validated

`gear = eventType - 8` was originally derived by decompiling the reference tool
*rF2ReplayOffice 1.5.1*. It has now been confirmed against shared-memory ground truth:
**8779 / 8909 samples agree (98.54%)**, and *every* mismatch involves neutral (0) during a shift
transition — consistent with the authentic clutch-disengagement dip. There are no
forward-gear-to-forward-gear errors.

### 2.3 Open leads

| Channel | Best candidate | r (controlled) | Notes |
|---|---|---|---|
| rideHeight FL | `i16 @18` | −0.83 | Strongest remaining lead; not shared with any other channel, suggesting suspension/ride-height data around bytes 16–19. |

### 2.4 Known artifacts — do not pursue

- **`bits@36>>19&4b` reported by fuel, water temp, oil temp, turbo boost and tire pressure
  simultaneously** (r = 0.67–0.75). One 4-bit field cannot be five unrelated channels. This is
  byte 38 bits 3+, the status/flag byte, where a state flag stepped once mid-session and now
  weakly tracks every monotonic drift.
- **Fuel scoring r = 1.00 inside a short stationary window** is degenerate: both fuel and any
  monotonic counter are near-constant there. Isolating fuel needs a long constant-pace stint.

### 2.5 Superseded hypotheses

- **RPM at `info1 >>> 18`** (bits 18..31 of `info1`). A community reference parser performs this
  exact shift, but empirically the value swings randomly between 0 and the 14-bit max every
  ~20 ms while speed changes smoothly, and its distribution across a lap is flat (~9–11% in every
  10%-wide bin) — the signature of an unrelated counter, not a physical quantity. No
  scaling or percentage-of-redline interpretation rescues it. Superseded by the confirmed field
  at bits 53–62; **do not reintroduce without new evidence.**

---

## 3. Track geometry from scoring (proof of concept)

The 5 Hz `sco` records carry `lapDist` (s), `pathLateral` (t) and `trackEdge` (signed distance
from the centre path to the tarmac edge **on the car's current side**). Two laps hugging opposite
white lines therefore yield a full width profile:

| Metric | Result (Portimão, 2 edge laps, 1620 samples) |
|---|---|
| 25 m bins with **both** edges sampled | **183 / 186** (3 one-sided, 0 empty) |
| Median track width | **14.02 m** (matches the real circuit) |
| p10 / p90 width | 13.79 / 17.78 m (widens on the pit straight) |

Build the model as `width(s) = medianRightEdge(s) − medianLeftEdge(s)`, binning by `lapDist` and
taking medians per bin. Reject bins with few samples: outliers down to 5.48 m appeared in
sparsely sampled bins.

Kerbs come from `mWheels[i].mTerrainName` / `mSurfaceType` (5 = rumblestrip), captured while
driving over them.

**Why not the AIW file?** The obvious source for centreline and track-edge geometry is the AIW,
but LMU ships track content inside **encrypted** `.mas` archives (no `GMOTOR`/`MAS2` magic; the
header is high-entropy). Standard rFactor extractors will not open them. Treat AIW as
unavailable and derive geometry from telemetry instead.

---

## 4. Cross-validation suites

### 4.1 Lap & sector timing

The timing parser is cross-validated against official XML simulation logs across all session
types and 10 official circuits:

- **Imola (Autodromo Enzo e Dino Ferrari)**: Race (R1 8), Quali (Q1 8), Practice (P1 14)
- **Sebring International Raceway**: Race (R1 13), Quali (Q1 13), Practice (P1 33)
- **Circuit de Spa-Francorchamps**: Race (R1 35), Quali (Q1 27)
- **Bahrain International Circuit**: Race (R1 2), Quali (Q1 2), Practice (P1 16)
- **Daytona International Speedway Road Course**: Race (R1 3), Quali (Q1 3), Practice (P1 16)
- **WeatherTech Raceway Laguna Seca**: Race (R1 4), Quali (Q1 1)
- **Algarve International Circuit (Portimão)**: Race (R1 13), Quali (Q1 10), Practice (P1 41)
- **Autodromo Nazionale Monza**: Offline Race (R1 6)
- **Fuji Speedway**: Race (R1 24), Quali (Q1 16), Practice (P1 55)
- **Circuit de la Sarthe (Le Mans)**: Race (R1 26), Quali (Q1 24)

Every valid flying lap in each replay matches the official simulation XML results within
floating-point precision.

---

## 5. Implementation status

| Feature Area | Status | Notes |
| :--- | :--- | :--- |
| **Driver Roster** | Implemented (`parseReplayMetadata`) | Deterministic binary `numDrivers` + structured records with `entryTime`/`exitTime`. |
| **Session Identification** | Implemented (`parseReplayMetadata`) | Session byte parsing, `modUid`, `trackPath`. |
| **Lap & Sector Timing** | Implemented (`extractReplayLapSummaries`) | Class 6 Type 6 events; matches in-game HUD. |
| **Tire Dynamics & Wear** | Implemented (`extractReplayTrajectory`) | Class 0 Type 15 tire temps, wear counters, brake rotor temps. |
| **Penalties & Incidents** | Implemented | Class 2 Type 5 penalty strings, lap indices, timestamps. |
| **3D Car Attitude** | Implemented (`extractReplayTrajectory`) | `rotX`/`rotY`/`rotZ` and `detachablePartState`. |
| **Gear** | Implemented (`extractReplayTrajectory`) | Header `eventType - 8`, all cars including AI. |
| **Engine RPM** | **Specification ready — not yet wired in** | Confirmed field at bits 53–62 (§2.1). Needs a saturation guard. |
| **Pit Events & Strategy** | Implemented (`extractReplayPitEvents`) | Class 0/1/5 Type 2 and Class 2/7 Type 49. |
| **Track Flags & Safety Car** | Specification ready | Class 2 Type 10 flag states and driver flags. |
| **Live Standings** | Specification ready | Class 6 Type 48 running-order array. |
| **Weather & Track Grip** | Specification ready | Metadata 67-byte environment block. |

**Unrelated defect noticed:** ~20 of 45 drivers in the Imola race replay have `carClass`
unresolved (`?`), falling back to raw vehicleId strings like `99_25_AO_E58B41E50`. This will
affect any per-class feature.

---

## 6. Catalog of untapped data

Specification-ready material not yet surfaced in the app.

### 6.1 4-wheel thermal, pressure & degradation dynamics (Class 0 Type 15)
- **12-point tire tread temperatures (°C)**: inner / centre / outer zones across all 4 corners,
  enabling thermal camber optimisation and overheating analysis.
- **Dynamic hot inflation pressures** (kPa / PSI) for all 4 tires.
- **Corner-by-corner wear degradation (0–100%)**, enabling true degradation curves over a stint
  instead of end-of-session approximations.
- **Brake rotor temperatures (°C)** at offsets `+24..31` when `eventSize === 37`.

### 6.2 Track meteorology & evolution (metadata session conditions block)
Ambient and track temperature, rain intensity, surface wetness, standing water depth, rubber
grip saturation, wind speed/direction, and the time acceleration multiplier. Layout in
VCR_FORMAT.md §2.2.

### 6.3 Live race control, flags & safety car (Class 2 Type 10, Class 1 Type 10)
Track condition flags (green through checkered, including FCY/SC/VSC), the sector hazard mask,
driver-targeted flags (blue / black / meatball), and the start-lights countdown phase.

### 6.4 Live leaderboard matrix & gaps (Class 6 Type 48)
Real-time running order from P1 to Pn at every timestamp, enabling lap charts, overtake
detection and pit-shuffle visualisation without post-hoc reconstruction.

### 6.5 Pit stop strategy & service detail
Fuel added in litres, tire compound fitted per corner, air-jack duration, penalty compliance
ordering, and pit lane speed enforcement beacons.

### 6.6 Aerodynamic damage & detachable bodywork (`info2 & 0x3FF`)
10-bit bitfield covering front wing endplates, rear wing main plane, diffuser, front splitter,
doors, and engine cowl / rear deck.

### 6.7 Balance of Performance & driver session timings (metadata 24-byte tail)
Success ballast (kg), intake restrictor ratio, and per-driver `entryTime` / `exitTime`.

---

## 7. Suggested next experiments

1. **Pin down the RPM scale.** Capture two cars with precisely known, *different* rev limiters,
   each held on the limiter, and solve for the constant exactly (§2.1).
2. **Isolate fuel.** A long constant-pace stint, so fuel drift is large relative to noise and
   separable from other monotonic channels (§2.4).
3. **Confirm the ride-height lead** at `i16 @18` with a purpose-built capture — e.g. heavy
   braking and kerb strikes to force large suspension travel (§2.3).
4. **Extend the track model** to more circuits: 2 edge laps each, per §3.
