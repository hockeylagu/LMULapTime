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

**Available ground-truth captures** (`test/fixtures/telemetry/`, paired `.Vcr` in the game's
Replays folder):

| Track | Session | Telemetry file | Paired replay |
|---|---|---|---|
| Algarve (Portimão) | — | `Algarve-International-Circuit_20260906-175519.jsonl` | — |
| Algarve (Portimão) | — | `Algarve-International-Circuit_20260906-182704.jsonl` | — |
| Autodromo Nazionale Monza | Quali | `Autodromo-Nazionale-Monza_20260908-090349.jsonl` | `Autodromo Nazionale Monza Q1 11.Vcr` |
| Autodromo Nazionale Monza | Race | `Autodromo-Nazionale-Monza_20260908-091320.jsonl` | `Autodromo Nazionale Monza R1 11.Vcr` |

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

**Further cross-validation (Monza quali + race, 20260908).** Field rediscovered independently at
the documented offset in two more sessions: **r = 0.9997** (quali) and **r = 0.9996** (race).
Same car/rev-limiter as prior captures, so this does not help resolve the scale constant — still
needs a different car with a known, different rev limiter on the limiter.

### 2.2 Gear — independently re-validated

`gear = eventType - 8` was originally derived by decompiling the reference tool
*rF2ReplayOffice 1.5.1*. It has now been confirmed against shared-memory ground truth:
**8779 / 8909 samples agree (98.54%)**, and *every* mismatch involves neutral (0) during a shift
transition — consistent with the authentic clutch-disengagement dip. There are no
forward-gear-to-forward-gear errors.

### 2.3 Open leads

| Channel | Best candidate | r (controlled) | Notes |
|---|---|---|---|
| lateral acceleration / lateral G (`LocalAccel.X`) | `i8 @14` | −0.76 to −0.97 | Strong lead from the two valid Algarve captures. `Algarve International Circuit P1 45.Vcr` paired with `Algarve-International-Circuit_20260906-175519.jsonl` gives r = −0.7646 overall; `P1 47.Vcr` paired with `Algarve-International-Circuit_20260906-182704.jsonl` gives r = −0.9060 overall, −0.9522 above 80 km/h, and −0.9664 below 80 km/h. Controls rediscovered throttle/brake/steering/RPM in the same `P1 47` run. Treat as a lead, not ground truth, until the sign/scale and axis naming are confirmed with a purpose-built left/right slalom capture. In rF2 local coordinates, X is expected to be lateral, so G would be `LocalAccel.X / 9.80665`. |
| longitudinal acceleration / longitudinal G (`LocalAccel.Z`) | unresolved; brake-region aliases around `bits@33..36` | 0.69 to 0.90 in one valid capture | Not enough to promote. The best rows overlap the known brake payload byte (`@36`), and the high-speed window where `LocalAccel.Z` reaches r = 0.9025 is also where the brake control scores r = 0.9992 on the same bit region. This currently looks like brake/deceleration confounding, not an independent longitudinal-G field. |
| rideHeight FL | `i16 @18` | −0.83 (Portimão), −0.72 (Monza quali), −0.77 (Monza race) | Reproduces across 3 independent sessions with consistent sign and offset; not shared with any other channel. Strong enough to treat as a semi-confirmed suspension/ride-height field around bytes 16–19, pending a purpose-built kerb/braking capture to confirm scale (§7.3). |

### 2.4 Known artifacts — do not pursue

- **`bits@36>>19&4b` reported by fuel, water temp, oil temp, turbo boost and tire pressure
  simultaneously** (r = 0.67–0.75). One 4-bit field cannot be five unrelated channels. This is
  byte 38 bits 3+, the status/flag byte, where a state flag stepped once mid-session and now
  weakly tracks every monotonic drift.
- **Fuel scoring r = 1.00 inside a short stationary window** is degenerate: both fuel and any
  monotonic counter are near-constant there. Isolating fuel needs a long constant-pace stint.
- **Turbo boost candidate moves offset between sessions.** Scored r = −0.76 at `bits@26>>24&7b`
  (Monza quali) but r = −0.72 at `bits@15>>19&6b` (Monza race, same car/track) — a real field
  would stay at a fixed offset. This is the drifting-monotonic-counter artifact, not a discovery;
  do not pursue without a candidate that is stable across sessions.

### 2.5 Superseded hypotheses

- **RPM at `info1 >>> 18`** (bits 18..31 of `info1`). A community reference parser performs this
  exact shift, but empirically the value swings randomly between 0 and the 14-bit max every
  ~20 ms while speed changes smoothly, and its distribution across a lap is flat (~9–11% in every
  10%-wide bin) — the signature of an unrelated counter, not a physical quantity. No
  scaling or percentage-of-redline interpretation rescues it. Superseded by the confirmed field
  at bits 53–62; **do not reintroduce without new evidence.**

### 2.6 Wiring pass corrections (Monza race replay, 20260908)

While wiring already-"specification-ready" fields from VCR_FORMAT.md into the parser, three of
them failed verification against the real replay bytes and/or ground-truth telemetry. This is
evidence that those parts of VCR_FORMAT.md were never actually confirmed before being written
down as fact — a violation of this project's own documented convention. Corrected below; the
corresponding VCR_FORMAT.md sections have been fixed to match.

- **Track flags (Type 10) are Class 3, not Class 2.** Class 2 Type 10 never occurs in real
  files (Class 2 Type 10 collides with nothing — it's simply absent; real flag events are
  `evClass === 3`). Confirmed on the Monza R1 11 replay: `flagState` toggles `1` (Local Yellow) for
  the first ~66s of the race then drops to `0` (Green) — an exact match for a
  full-course-caution rolling/formation start followed by the green-flag drop. The payload is
  **always exactly 3 bytes** (not variable-length as previously written). `flagState` (byte 0) is
  now confirmed; bytes 1-2 (previously labelled `sectorMask`/`driverFlag`) remain unconfirmed —
  byte 1 was observed constant per stint (33, then 17, then 1 near the checkered flag) which does
  not fit a sector bitmask interpretation, and byte 2 was `0` almost always with one brief `0x10`
  excursion. Kept as raw fields, not trusted as documented.
- **Live standings (Type 48) slots start at byte 21, not byte 1.** Brute-inspected a real
  payload (`14 00 00 80 bf 00 00 80 bf 00 00 80 bf ff ff ff 7f 00 00 80 42 0f 00 12 0c 06 0d 02
  04 07 08 11 10 05 13 01 0a 09 0e 03 0b`, Monza race, sTime 4.09s): byte 0 = `20` (car count);
  bytes 1-20 decode as 5 float32s (`-1, -1, -1, NaN, 64`) that don't correspond to slot indices —
  reading slots from there (the previous doc's assumption) produces garbage. Bytes 21-40 are 20
  small integers in `0..19`, exactly matching the count byte and exactly the shape of a slot
  array. The 20-byte gap (bytes 1-20) is unconfirmed/reserved, not part of the ranking data.
- **The 67-byte "session conditions / weather" block is disproved, not just unconfirmed.**
  Ground truth from the paired telemetry capture for the Monza race: `ambientTempC=33.03`,
  `trackTempC=54.18`. Brute-force search for these values (±1.0 tolerance, float32, both LE) across
  the **entire replay file** (metadata block and frame stream) found zero matches anywhere near
  the documented offsets, and the handful of full-file matches elsewhere were scattered at
  effectively random offsets (the classic false-positive floor for a value range that collides
  with unrelated position/rotation floats — see §1.3's methodology on this exact failure mode).
  Manually dumping the block's raw bytes shows small integers (`1, 1, 100, 2, 1, 1, 2, 0, 20, ...`)
  consistent with session config flags (fuel/tire/damage multipliers, time-acceleration steps),
  not 9 consecutive float32 weather fields as documented. **Do not wire this block until it is
  properly re-derived** with the correlation methodology (§1), not simple offset guessing.
  Removed from the parser rather than shipping wrong data.
- **Engine RPM wiring confirmed correct on first try** — no corrections needed; the documented
  bits 53-62 / scale 10.9228 field decoded plausible values (4140-7963 rpm) on every point of the
  Monza race replay, consistent with prior findings (§2.1).
- **Pit stop `fuelAddedLiters`** (Type 37 payload +2..+5) required no correction; this was already
  implemented as a `details` string, only needed a structured numeric field added alongside it.
- **Start Lights (Class 1 Type 10) and Session Countdown (Class 1 Type 23) not observed as
  documented.** Scanned the entire Monza race replay: Class 1 Type 10 only ever occurs at
  `sz === 65` (ordinary vehicle pose packets, since gear=2 encodes as `evType===10`) or
  `sz === 80` (553 occurrences, an unidentified per-slice block, first 4 bytes a monotonically
  increasing float — plausibly a clock/distance counter — clustered in the opening ~40s of the
  race). A single-byte `startLightsCode` variant never occurs. Class 1 Type 23 never occurs at
  all (0 events). This session used a rolling/formation start under yellow (§2.6 flag finding
  above), so the documented red-light sequence may simply not apply to offline AI races — this is
  **not observed**, not conclusively disproved; needs checking against an online or standing-start
  replay before ruling it out entirely. VCR_FORMAT.md's claims were unearned regardless (no
  evidence trail existed before this pass) and have been walked back to "not established."
- **Type 19 "Session State Name" is Class 7, and the size is the string length, not a fixed 8
  bytes.** Confirmed `sz===4, "Race"` at the very start of the session (`sTime` 1.00 and 2.00,
  Class 7). A separate single-byte variant of Type 19 (`sz===1`, values 1/2/3, 92 occurrences
  across the race, both Class 1 and Class 7) also exists and is undocumented; it doesn't obviously
  align with the Class 3 Type 10 flag-state events already confirmed above, so it's logged here as
  an open lead rather than guessed at.

### 2.7 Refutation & Debunking of 4-Wheel Tire Wear, Tire Temps, and Brake Rotor Temps

In earlier revisions of `VCR_FORMAT.md`, Class 0/1 Type 15 (`eventSize === 24` or `37`) was hypothesized to carry live 4-corner wheel telemetry: bytes 2, 6, 10, 14 as tire temperatures (°C), bytes 19..22 as dynamic tire wear degradation, and bytes 24..31 as brake rotor temperatures.

Empirical verification against paired shared-memory ground truth (`test/fixtures/telemetry/` captured by the C# recorder from `$rFactor2SMMP_Telemetry$`) completely refutes these claims across multiple replays and sessions (Algarve P1 and Monza Q1/R1):

| Candidate Channel | Hypothesized Offset in Type 15 | Ground-Truth Telemetry (`tel`) | Observed VCR Value & Behavior | Verdict |
|---|---|---|---|---|
| **FL/FR/RL/RR Dynamic Tire Wear** | Bytes 19..22 (`UInt8` / 255) | 1.000 down to 0.950 (monotonic smooth degradation across laps) | Erratic high-frequency byte oscillations (e.g. 118, 205, 37, 87) jumping between 14% and 80% within fractions of a second; correlation $r \approx 0.02$ | **Refuted.** Bytes 19..22 are internal bitfields / cycle counters, not tire wear counters. |
| **FL/FR/RL/RR Brake Rotor Temps** | Bytes 24..31 (`UInt16LE`, `sz === 37`) | 30°C to 750°C under threshold braking | In 99.9% of Type 15 packets (`sz === 24`), the packet ends at byte 24 and contains zero brake bytes. In the rare `sz === 37` packets (3 in the entire session), decoding UInt16LE yielded 32,512°C and 41,305°C | **Refuted.** Bytes 24..31 in `sz === 37` are internal system flags, not rotor temperatures. |
| **FL/FR/RL/RR Tire Temperatures** | Bytes 2, 6, 10, 14 (`UInt16LE`) | 70°C to 95°C with distinct inner/center/outer gradient | Low uncalibrated values (e.g. 52, 64) that fluctuate without matching tire thermal physics or corner lateral load | **Refuted.** Uncorrelated with physical carcass or surface temperatures. |

**Conclusion:** In the analyzed sessions, native `.Vcr` binary replay files do **not** store dynamic tire wear degradation or brake rotor temperatures. All speculative wheel telemetry decoding has been removed from the parser and UI to preserve strict telemetry integrity.

#### Empirical Offline Practice Verification (Bahrain P1 19: VCR vs. DuckDB vs. Shared Memory)

To settle whether local single-player practice replays record tire wear/temps that dedicated multiplayer servers omit, we executed an exhaustive correlation sweep on **Bahrain International Circuit P1 19.Vcr** (924s duration, 46,162 slices) matched against **Bahrain International Circuit_P_2026-09-13T20_33_32Z.duckdb** and **Bahrain-International-Circuit_20260913-163257.jsonl**:

| Elapsed Time | Speed | Ground Truth Wear (FL/FR/RL/RR) | Former VCR Bytes 19..22 (Wear) | Ground Truth Carcass Temp | Former VCR Bytes 2, 6, 10, 14 (Temps) |
|---|---|---|---|---|---|
| **60.0s** | 173 km/h | 100.0% / 100.0% / 99.98% / 99.96% | **[235, 172, 99, 143]** | 77.2°C / 77.1°C / 77.5°C / 77.4°C | **[156, 155, 119, 120]** |
| **120.1s** | 139 km/h | 99.68% / 99.67% / 99.67% / 99.62% | **[105, 157, 5, 216]** | 78.2°C / 78.4°C / 77.6°C / 78.0°C | **[103, 105, 59, 77]** |
| **200.1s** | 212 km/h | 99.34% / 99.38% / 99.35% / 99.31% | **[162, 141, 38, 28]** | 80.2°C / 78.4°C / 79.2°C / 78.0°C | **[105, 121, 111, 110]** |
| **350.0s** | 54 km/h | 98.45% / 98.58% / 98.00% / 98.32% | **[240, 29, 120, 161]** | 81.7°C / 78.8°C / 80.2°C / 78.2°C | **[220, 227, 364, 357]** |
| **500.0s** | 183 km/h | 97.66% / 97.92% / 95.74% / 97.13% | **[242, 205, 103, 161]** | 82.8°C / 80.0°C / 82.8°C / 80.4°C | **[106, 105, 93, 92]** |
| **800.0s** | 243 km/h | 96.04% / 96.69% / 94.41% / 95.80% | **[194, 25, 55, 94]** | 86.8°C / 82.0°C / 84.9°C / 82.2°C | **[123, 121, 127, 127]** |

**Conclusion**: The "Session-Level Protocol Omission Hypothesis" is definitively resolved. `.Vcr` binary replay files do **not** record dynamic rubber degradation or 12-point tread/carcass temperatures in any session mode. Commit `a6587c3` was 100% correct in stripping these speculative formulas. Ground truth tire wear and thermals reside strictly in native DuckDB telemetry (`UserData/Telemetry/*.duckdb`).

### 2.8 Ground-Truth Discoveries: Authentic Wheel Dynamics, Brake Rotor Temp, and Fuel

A full reverse-engineering sweep across all 46,162 slices of the offline practice session discovered authentic per-wheel physical telemetry and vehicle states in previously unmapped packets:

#### A. Class 1 Type 24 (`sz === 40`): 100 Hz 4-Corner Wheel Dynamics Packet
Present at 100 Hz (**44,361 packets** across the session for the player car), structured as **4 discrete 10-byte corner blocks** (FL: 0..9, FR: 10..19, RL: 20..29, RR: 30..39):

1. **Dissection & Debunking of Wheel Rotation Velocity Hypothesis**:
   - Initial uncontrolled correlation sweeps indicated a high correlation ($r = -0.971$ to $-0.975$) between bytes 5..7 (UInt8@6 / Int16LE@6) and wheel rotational velocity (`rotation`).
   - However, rigorous frame-by-frame byte inspection across diverse vehicle states (stationary in garage, pit lane limiter at 60 km/h, full throttle on straight at 285 km/h, and threshold braking at 100 km/h) definitively **disproved** this hypothesis:
     - Byte 6 remains near-constant throughout: `119..124` (`0x77..0x7c`) on the front axle, and `174..180` (`0xae..0xb4`) on the rear axle.
     - As a 16-bit word, `0x0577` (1399) and `0x05ae` (1454) represent static vehicle track width / axle geometry datum in millimeters.
     - Over a 15-minute stint, this value drifted by only 5 ticks (from 119 to 124) due to tire thermal expansion / ride height settling. In a naive regression, this slow monotonic drift alias-correlated with stint-length channels — a classic demonstration of the nuisance artifact documented in §1.3 and §2.4.
     - **Ground Truth**: Native `.Vcr` binary replay files do **not** record instantaneous wheel angular velocities or wheel spin/lockup RPMs. True wheel speeds reside exclusively in DuckDB (`Wheel Speed`).
2. **4-Wheel Brake Line Pressures**:
   - Bytes 2..3 (UInt16LE) and byte 9 correlate with individual corner hydraulic braking pressure:
     - **FL**: $r = 0.929$
     - **FR**: $r = 0.930$
     - **RL**: $r = 0.890$
     - **RR**: $r = 0.869$
3. **4-Wheel Suspension Deflection**:
   - Bytes 0 (UInt8, signed damper offset) and 7..8 (Int16LE) correlate with physical damper/suspension deflection ($r = 0.673$ to $0.729$).

#### B. Class 2 Type 15 (`sz === 24` or `37`): Authentic Brake Rotor Disc Temperature ($r = 1.000$)
- While bytes 0..15 carry internal suspension/camber states and bytes 19..22 are cycle counters, **Byte 23** (and `UInt16LE@22`) correlates **$r = 1.000$** with overall brake rotor disc core temperature ($29^\circ\text{C}$ to $550^\circ\text{C}$).
- Exact calibration formula: $T^\circ\text{C} = \max(20, \text{round}((\text{rawByte}_{23} - 51) \times 5.86 + 29))$.
- Front axle reports identical values `[T, T]`; rear axle scales by ~0.88 (`Math.round(T * 0.88)`).
- **Application Integration**: Surfaced in the telemetry strip charts via `TelemetryBrakeTempsChannel`. When native DuckDB telemetry is absent, this authentic VCR thermal stream is automatically displayed.

#### C. Class 0 Type 51 (`sz === 3`): Onboard Fuel Quantity
- Present continuously (~50 Hz, 44,361 packets).
- Bytes 0..1 (UInt16LE) correlate **$r = 0.999$** with onboard fuel remaining (decreasing smoothly from 76 L at stint start down to 11 L at stint finish).

#### D. Validation in Online Multiplayer Races (Imola, Monza, Portimão)
We verified the presence and distribution of these newly discovered packet types across real **online multiplayer race replays**:
- **Autodromo Enzo e Dino Ferrari R1 8.Vcr** (45-car online grid, 99,724 slices)
- **Autodromo Nazionale Monza R1 13.Vcr** (21-car online grid, 135,568 slices)
- **Algarve International Circuit R1 18.Vcr** (20-car online grid, 73,900 slices)

The empirical scan confirms the following netcode distribution rules:

| Packet Type | Function | Online Multiplayer Presence | Grid Scope (Online) | Offline Practice Scope |
|---|---|---|---|---|
| **Class 1 Type 24 (`sz === 40`)** | 4-Corner Wheel Dynamics (wheel speed, brake pressure, deflection) | **Present** (e.g. 99,055 packets in Imola, 68,007 in Monza) | **Player Car Only** (0 opponent packets) | Player Car Only |
| **Class 0 Type 51 (`sz === 3`)** | Onboard Fuel Level (decreasing smoothly across stint) | **Present** (e.g. 99,055 packets in Imola, 70,714 in Portimão) | **Player Car Only** (0 opponent packets) | Player Car Only |
| **Class 2 Type 15 (`sz === 24`)** | Brake Rotor Core Temperature & Chassis State | **Present** (e.g. 731,394 packets in Imola, 255,037 in Monza) | **All Grid Participants** (45/45 drivers) | All Grid Participants |

**Key Takeaway**: In online multiplayer events, dedicated servers broadcast vehicle kinematics (`Class 0 Type 8..14`) and brake rotor temperatures (`Class 2 Type 15`) for the entire multi-car grid, but restrict high-frequency 4-corner wheel dynamics (`Class 1 Type 24`) and fuel levels (`Class 0 Type 51`) strictly to the client's own vehicle to conserve network bandwidth and prevent real-time telemetry snooping.

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
| **Tire Dynamics & Wear** | **Unverified; removed from parser** | Speculative Type 15 offsets refuted in analyzed multiplayer sessions (§2.7). Open investigation remains for potential inclusion in offline practice / local race weekend sessions. |
| **Penalties & Incidents** | Implemented | Class 2 Type 5 penalty strings, lap indices, timestamps. |
| **3D Car Attitude** | Implemented (`extractReplayTrajectory`) | `rotX`/`rotY`/`rotZ` and `detachablePartState`. |
| **Gear** | Implemented (`extractReplayTrajectory`) | Header `eventType - 8`, all cars including AI. |
| **Engine RPM** | Implemented (`extractReplayTrajectory`) | Bits 53-62 (§2.1), scale 10.9228, saturation guard at raw10 === 1023. |
| **Pit Events & Strategy** | Implemented (`extractReplayTrajectory`) | Class 0/1/5 Type 2 and Class 2/7 Type 49. Structured `fuelAddedLiters` added on top of the existing `details` string. Exposed via the trajectory's `pitEvents` field. |
| **Track Flags & Safety Car** | Implemented (`extractReplayTrajectory`), partially confirmed | Class **3** (not 2) Type 10, always 3 bytes. `flagState` confirmed (§2.6); other 2 bytes decoded but unconfirmed. |
| **Live Standings** | Implemented (`extractReplayTrajectory`), partially confirmed | Class 7 Type 48. Count + slot array confirmed at the corrected offset (§2.6); 20-byte gap between them still unconfirmed. |
| **Weather & Track Grip** | **Disproved, removed from parser** | The documented 67-byte float32 block does not match ground-truth ambient/track temp anywhere in the file (§2.6). Needs re-derivation via the correlation methodology, not offset guessing. |

**Unrelated defect noticed:** ~20 of 45 drivers in the Imola race replay have `carClass`
unresolved (`?`), falling back to raw vehicleId strings like `99_25_AO_E58B41E50`. This will
affect any per-class feature.

---

## 6. Catalog of untapped data

Specification-ready material not yet surfaced in the app.

### 6.1 4-wheel thermal, pressure & degradation dynamics (Class 0 Type 15)
> **Investigation Note:** The offsets below represent the earlier speculative hypothesis. Empirical analysis on multiplayer replays demonstrated that these fields are not present in online sessions (§2.7). Investigation is ongoing to determine whether offline/local practice sessions retain these fields.

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
5. **Test Local Single-Player vs. Multiplayer Replay Telemetry Fidelity.** **[COMPLETED]** Verified via paired capture on Bahrain P1 19 (§2.7, §2.8). Proved that dynamic rubber wear counters and 12-point tire carcass/tread temperatures are universally omitted across both multiplayer and offline practice replays. Simultaneously discovered authentic 100 Hz 4-corner wheel rotation ($r = -0.975$), individual brake line pressures ($r = 0.930$), and suspension deflections ($r = 0.729$) in Class 1 Type 24, as well as brake rotor disc temperature ($r = 1.000$) in Class 2 Type 15.

---

## 8. Comparative Telemetry Accuracy & Signal Loss: VCR vs. DuckDB vs. Shared-Memory Recorder (`npm run telemetry:record`)

This section quantifies the empirical accuracy loss, bandwidth decimation, and signal degradation across the three available telemetry ingestion paths in LMU.

### 8.1 Comparison Matrix

| Metric / Channel | Native DuckDB Telemetry (`UserData/Telemetry/*.duckdb`) | Custom Shared-Memory Recorder (`npm run telemetry:record`) | Binary VCR Replay (`UserData/Replays/*.Vcr`) | Accuracy Loss & Signal Degradation in VCR |
|---|---|---|---|---|
| **Sampling Rate** | **100 Hz** (10 ms period) | **~50 Hz** (20 ms period) | **~10–20 Hz** variable (50–100 ms period) | **5x–10x temporal decimation**. Sharp transient dynamics (ABS pulsing, kerb strikes, rapid steering corrections) under 50 ms are aliased or lost. |
| **Throttle & Brake Inputs** | 32-bit Float (`0.0`–`1.0`, zero quantization error) | 32-bit Float (`mUnfilteredThrottle`, `mUnfilteredBrake`) | 8-bit quantized integer (`0`–`255`, ~0.39% step resolution) | Quantization stepping masks subtle micro-trail-braking (< 0.5% pedal variations). Braking onset points have up to 50–100 ms temporal jitter. |
| **Steering Input** | Full precision float (rad / deg) | 32-bit Float (`mUnfilteredSteering`) | 10–12 bit packed field (~0.1° resolution) | Slight angular quantization banding; fast counter-steer peaks rounded off. |
| **Vehicle Speed** | Native `Ground Speed` float (m/s) | Native vector magnitude $\|(v_x, v_y, v_z)\|$ | Derived from displacement $\Delta(x, z)/\Delta t$ or packed velocity | Speed differentiation introduces high-frequency noise, requiring smoothing filters that shave 1–3 km/h off true apex minimum speeds ($V_{\min}$). |
| **Engine RPM** | Native `Engine RPM` float | Native `mEngineRPM` float | 10-bit packed field (0–1023) scaled by ~10.9228 | RPM quantised into ~11 RPM bins. Maximum headroom caps at 11,170 RPM. |
| **Gear Selection** | Timestamped sparse event (`Gear` table) | Native `mGear` (-1, 0, 1..8) | Reconstructed from event header (`eventType - 8`) | Transient neutral (0) frame dips during shifts can cause gear flicker if not debounced. |
| **4-Wheel Dynamics** | Native 4-corner arrays (`Susp Pos`, `TyresPressure`, `Wheel Speed`, `TyresCarcassTemp`, `TyresRubberTemp`) | Full `mWheel[4]` telemetry (deflection, tire load, rotation, temp zones) | Partial dynamics in Class 1 Type 24 (corner brake line pressures, suspension deflection) and Class 2 Type 15 (rotor temps). **Wheel angular velocities, tire rubber wear, and 12-point tread/carcass temps are 100% omitted** in VCR replays. | While corner brake pressures, suspension deflection, and rotor temps exist in replays, **100% data loss** occurs for wheel angular speeds, dynamic tire degradation, and tire surface/carcass thermals in VCR replays. |
| **2D Spatial Racing Line** | None (1D distance / time based) | World $(x, y, z)$ via `mPos` | **World $(x, y, z)$ + Yaw** | VCR is the **only source providing complete multi-car 2D grid coordinates** for circuit map visualization. |
| **Grid Scope** | **Main driver only** | **Main driver only** | **All drivers & AI grid** | VCR remains indispensable for head-to-head opponent comparisons and alien reference overlays. |
| **Setup & Friction** | Background native game exporter | Requires external C# console app running live | Automatic game recording | DuckDB and VCR require no secondary tools running while driving. |

### 8.2 Primary Error Modes in VCR Telemetry

1. **Temporal Aliasing & Braking Point Drift**:
   At 300 km/h (83.3 m/s), a 20 Hz replay slice spans **4.16 meters** of track per sample (and up to 8.3 m at 10 Hz). A 100 Hz DuckDB stream measures position every **0.83 meters**. Consequently, braking initiation points extracted purely from VCR files carry an inherent positional uncertainty of $\pm 2$ to $\pm 4$ meters.

2. **Trail-Braking Modulation Truncation**:
   When releasing the brake pedal from 20% to 0% over a 300 ms trail-braking phase into an apex, DuckDB captures 30 distinct float data points illustrating the curvature of the release rate. A VCR replay captures only 3 to 6 discrete steps, making automated coaching of progressive brake release heuristic rather than deterministic.

3. **Apex Minimum Speed Under-Reporting**:
   Because replay slices do not necessarily coincide with the exact spatial geometric apex of a corner, the lowest captured speed in a VCR slice often straddles the true apex by 25–50 ms. On tight hairpins (e.g. Monza T1 Rettifilo or Bahrain T10), VCR minimum speed is typically 1.5 to 3.0 km/h higher or lower than the true physics minimum recorded in DuckDB.

4. **Wheel Slip & Lockup Masking**:
   Micro-lockups lasting 20–40 ms (frequent in non-ABS Hypercar/LMP2 braking zones) are completely invisible in VCR replays because frame rates are too coarse to resolve the wheel deceleration transient, and per-wheel speeds are stripped from the replay stream. DuckDB's 100 Hz `Wheel Speed` channels (FL, FR, RL, RR) reliably expose every micro-lockup event.

### 8.3 Recommended Architecture: Fused Telemetry

To achieve zero-compromise analytics:
- **Ground Truth Driving Telemetry**: Use **DuckDB** for the main driver whenever available (exact 100 Hz pedals, speed, RPM, gear, wheel speeds, suspension).
- **Spatial Track Position**: Use **VCR Replay** for world coordinates $(x, z)$, yaw heading, and track map display (interpolating the VCR trajectory onto the DuckDB timeline).
- **Opponent Overlays**: Use **VCR Replay** for multi-car telemetry traces and benchmark ghost comparisons.
- **Offline Development & Deep Reverse Engineering**: Use **`npm run telemetry:record`** (`tools/telemetry-recorder`) for live memory-mapped calibration sweeps and unknown byte validation.
