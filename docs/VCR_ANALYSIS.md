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
- **The REST API only partly fills that gap.** During playback `/rest/watch/sessionInfo`
  follows the replay (weather, temps), but `/rest/watch/standings` stays a frozen snapshot, so
  per-car channels still need a driven capture (§2.10).
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
  Across all 325 cached replays (2026-09-27), byte 1 only takes `1`, `17` and `33`: bit 0 is
  always set, and bits 4 and 5 are never set together. It flips between 1 and 17 about 400 times
  per replay under green, with no change to `flagState`, so the "constant per stint" reading above
  held for Monza only. Byte 2 takes `0`, `2`, `16`, `32` and `34`. Both bytes are stored raw in
  `replay_conditions` (`sector_mask`, `driver_flag`) for later decoding. Candidates to correlate:
  lap crossings, pit entries and exits, sector crossings, and XML session phases.
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

### 2.8 Ground-Truth Discoveries: Authentic Brake Data and Fuel

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
#### B. Class 2 Type 15 (`sz === 24` or `37`): Authentic Brake Rotor Disc Temperature ($r = 1.000$)
- While bytes 0..15 remain unestablished and bytes 19..22 are cycle counters, **Byte 23** (and `UInt16LE@22`) correlates **$r = 1.000$** with overall brake rotor disc core temperature ($29^\circ\text{C}$ to $550^\circ\text{C}$).
- Exact calibration formula: $T^\circ\text{C} = \max(20, \text{round}((\text{rawByte}_{23} - 51) \times 5.86 + 29))$.
- Front axle reports identical values `[T, T]`; rear axle scales by ~0.88 (`Math.round(T * 0.88)`).
- **Application Integration**: Surfaced in the telemetry strip charts via `TelemetryBrakeTempsChannel`. When native DuckDB telemetry is absent, this authentic VCR thermal stream is automatically displayed.

#### C. Class 0 Type 51 (`sz === 3`): Onboard Fuel Quantity — **superseded: this is Virtual Energy** (§2.12 A)
- Present continuously (~50 Hz, 44,361 packets).
- Bytes 0..1 (UInt16LE) correlate **$r = 0.999$** with onboard fuel remaining (decreasing smoothly from 76 L at stint start down to 11 L at stint finish).
- *Correction (20260927):* fuel and virtual energy drain together, which caused the high r. Byte 0
  follows `Virtual Energy` exactly (100 % of 267k samples within rounding) and holds steady while
  fuel falls. See §2.12 A.

#### D. Validation in Online Multiplayer Races (Imola, Monza, Portimão)
We verified the presence and distribution of these newly discovered packet types across real **online multiplayer race replays**:
- **Autodromo Enzo e Dino Ferrari R1 8.Vcr** (45-car online grid, 99,724 slices)
- **Autodromo Nazionale Monza R1 13.Vcr** (21-car online grid, 135,568 slices)
- **Algarve International Circuit R1 18.Vcr** (20-car online grid, 73,900 slices)

The empirical scan confirms the following netcode distribution rules:

| Packet Type | Function | Online Multiplayer Presence | Grid Scope (Online) | Offline Practice Scope |
|---|---|---|---|---|
| **Class 1 Type 24 (`sz === 40`)** | 4-Corner brake pressure and unestablished corner state | **Present** (e.g. 99,055 packets in Imola, 68,007 in Monza) | **Player Car Only** (0 opponent packets) | Player Car Only |
| **Class 0 Type 51 (`sz === 3`)** | Onboard Fuel Level (decreasing smoothly across stint) | **Present** (e.g. 99,055 packets in Imola, 70,714 in Portimão) | **Player Car Only** (0 opponent packets) | Player Car Only |
| **Class 2 Type 15 (`sz === 24`)** | Brake Rotor Core Temperature & Chassis State | **Present** (e.g. 731,394 packets in Imola, 255,037 in Monza) | **All Grid Participants** (45/45 drivers) | All Grid Participants |

**Key Takeaway**: In online multiplayer events, dedicated servers broadcast vehicle kinematics (`Class 0 Type 8..14`) and brake rotor temperatures (`Class 2 Type 15`) for the entire multi-car grid, but restrict high-frequency 4-corner wheel dynamics (`Class 1 Type 24`) and fuel levels (`Class 0 Type 51`) strictly to the client's own vehicle to conserve network bandwidth and prevent real-time telemetry snooping.

### 2.9 Ground-Truth Discovery: Track Meteorology, Rain Intensity & Wetness (`Class 1 Type 10`, `sz === 80`)

#### A. Discovery Methodology via LMU Embedded REST API Ground Truth
The question of whether `.Vcr` binary replay streams store ambient weather, dynamic rain onset, or track surface wetness was resolved empirically using **Le Mans Ultimate's internal embedded REST API (`http://localhost:6397`)**.

While playing back `Sebring International Raceway R1 17.Vcr` in-game, we commanded the simulation timeline via `PUT /rest/watch/replaytime/{time}` in 60-second steps and queried `/rest/watch/sessionInfo` to capture the internal simulation engine's live ground-truth weather state:

| Simulation Time | Ground-Truth Raining (`raining`) | Path Wetness (`averagePathWetness`) | Ambient Temp (`ambientTemp`) | Observed Track Conditions |
|---|---|---|---|---|
| **0s – 420s** | 0.00% (0.0) | 0.00% | 25.02°C | Bone-dry track, optimal baseline grip |
| **480s** (8 min) | 0.35% (0.00348) | 0.00% | 23.91°C | First raindrops begin to fall |
| **600s** (10 min) | 0.70% (0.00705) | 0.00% | 23.29°C | Rain rate climbing steadily (+0.001787 / min) |
| **720s** (12 min) | 1.92% (0.01920) | 0.00% | 23.02°C | Visible precipitation across all sectors |
| **900s** (15 min) | 4.31% (0.04315) | 0.00% | 22.02°C | Wet tarmac, grip loss, TC duty cycles triple |
| **1140s** (19 min) | 6.85% (0.06848) | 0.00% | 22.02°C | Approaching peak precipitation intensity |
| **1200s** (20 min) | 7.03% (0.07029) | 0.00% | 22.02°C | Maximum wetness at race finish |

#### B. Isolating the Binary Meteorology Broadcast Packet
Correlating this temporal profile against candidate packet streams across the 130 MB replay file definitively isolated the dedicated environment broadcast packet:
- **`eventClass === 1`**, **`eventType === 10`**, **`eventSize === 80`**
- **`driverSlot === 255` (`0xFF`)**: Universal track broadcast channel (not tied to any vehicle).
- **Frequency**: Emitted continuously at **~0.5 Hz** (once every 1.5–2.0 seconds; exactly 600 packets across a 1,200s race).

#### C. Binary Payload Layout & Calibration
Inspecting packets sampled at `sTime` 411s, 511s, 614s, 720s, 821s, 921s, 1024s, 1128s, 1231s, 1331s, and 1435s established the exact 80-byte binary structure:

```
Offset   Type        Field Description & Calibrated Meaning
------------------------------------------------------------------------------------------------------
+0..3    Float32LE   Simulation game clock (seconds; ticks in 3.333s / 10/3 intervals).
+6..9    Float32LE   Solar progression factor (monotonically climbs from ~0.68 at start to 2.36 at end).
+10..13  Float32LE   Track condition baseline scale (monotonically climbs from 0.27 to 1.92).
+14..37  Binary      24-byte atmospheric state, sky coverage and cloud density parameters.
+38      UInt8       Ambient temperature scale (0x92 = 146 down to 0x81 = 129, tracking 25.0°C -> 22.0°C).
                     [Corrected 20260927, §2.12 B: ambient °C = byte / 8 + 5.9, not the linear 0.176 fit.]
+42..77  36 bytes    9 discrete 4-byte sector/track path surface wetness channels ([val, val, val, 0x00]).
```

#### D. Behavior of the Surface Wetness Channels (`Bytes 42..77`)
In `Sebring International Raceway R1 17.Vcr`, the 9 sector wetness channels track the rain curve with exact integer fidelity:
- **`sTime 511s` (Dry)**: `00000000 00000000 00000000 ...` (All zeroes across all 9 sectors)
- **`sTime 614s` (Rain onset)**: `02020200 02020200 ...` (`0x02` across all sectors)
- **`sTime 720s` (Building)**: `05050500 05050500 ...` (`0x05`)
- **`sTime 821s`**: `06060600 06060600 ...` (`0x06`)
- **`sTime 921s`**: `0d0d0d00 0d0d0d00 ...` (`0x0D` = 13)
- **`sTime 1024s`**: `0f0f0f00 0f0f0f00 ...` (`0x0F` = 15)
- **`sTime 1128s` (Peak rain)**: `11111100 11111100 ...` (`0x11` = 17)
- **`sTime 1331s` (Rain eases)**: `09090900 09090900 ...` (`0x09` = 9)
- **`sTime 1435s` (Tapering)**: `07070700 07070700 ...` (`0x07` = 7)

#### E. Ambient vs. Track Surface Temperature (`Bytes 38..39`)
Cross-referencing `/rest/watch/sessionInfo` across the timeline revealed how LMU handles road thermodynamics:
- **Ambient Air Temperature (`ambientTemp`)**:
  - The live API reports ambient air starting at **25.02°C** in dry air, falling steadily to **22.02°C** under dense cloud cover and sustained rain.
  - **Byte 38** tracks this drop identically: starting at raw `153` / `146` (`0x92`) and cooling down to `129` (`0x81`).
  - Empirical formula: $T_{\text{ambient}} = 25.0 - (146 - \text{val}) \times 0.176$.
- **Track Surface Temperature (`trackTemp`)**:
  - The live API reports road surface temperature starting at **27.33°C** and slowly cooling to **27.21°C** as rain accumulates over 20 minutes.
  - **Byte 39** holds the track surface baseline thermal index: `129` (`0x81`), corresponding directly to the ~27.3°C road baseline.
  - Unlike ambient air which drops rapidly by ~3.0°C during rain, track thermal inertia keeps asphalt temperatures elevated, decaying slowly as standing water accumulates.

#### F. Additional API & Stream Discoveries
1. **Dynamic Grid Size in Standings Matrix (Class 7 Type 48)**:
   - Comparing `/rest/watch/standings` against the frame stream revealed that `Type 48` event sizes are **dynamic**, scaling with the active vehicle count: $\text{eventSize} = 21 + N$.
   - A hardcoded check for `sz === 41` (which assumed exactly 20 cars) broke standings snapshots on 19-car or 25-car grids. Updating to `sz >= 22` with dynamic driver count $N = \text{payload}[0]$ allows 100% reliable position tracking for grids of any size.
2. **Track Collisions & Incidents Ledger (`/rest/watch/getIncidentsList/0`)**:
   - The live API provides 44 contact events with timestamps and driver pairings (e.g. `{ contactWith: "Nicholas Moreno", et: 141.56, player: "Michal Kazmierczak" }`).
   - In the VCR stream, the physics engine responds to these contacts with burst frames (`Class 7 Type 9` and `Class 7 Type 11`) at those exact fractions of a second, accompanied by penalty assessments (`Class 2 Type 5`) where applicable.

#### G. Cross-Validation Across 88 Real Race Replays
An exhaustive sweep across all 88 race replays on disk proved the fidelity of this packet:
1. **Bone-Dry Sessions**: In `Autodromo Enzo e Dino Ferrari R1 6..10.Vcr` (5 full races, >4,000 meteorology packets), bytes `+42..77` were **100% zeroes** without a single non-zero byte from green flag to checkered flag.
2. **Confirmed Rain Replays on Disk**:
   - `Sebring International Raceway R1 15.Vcr`: Max rain intensity **23** (Rain started at 504.3s; lap times collapsed from 127.2s to 161.1s, a massive +33.9s blowout).
   - `Sebring International Raceway R1 14.Vcr`: Max rain intensity **22** (Rain started at 277.7s; lap times dropped by +8.6s).
   - `Sebring International Raceway R1 17.Vcr`: Max rain intensity **18** (Rain started at 534.4s; lap times dropped by +17.5s).
   - `Sebring International Raceway R1 13.Vcr`: Max rain intensity **16** (Rain started at 297.8s; lap times dropped by +6.5s).
   - `Sebring International Raceway R1 16.Vcr`: Max rain intensity **14** (Rain started at 517.3s; lap times dropped by +5.1s).
   - `Circuit de Spa-Francorchamps R1 35.Vcr`: Max rain intensity **3** (Light mid-race drizzle starting at 487.3s).

### 2.10 REST API as ground truth during replay playback (Sebring R1 15, 20260927)

**Question:** can the embedded REST API (`:6397`, see [LMU_REST_API.md](LMU_REST_API.md)) act
as a ground-truth source while a replay plays, the way the shared-memory recorder does while
driving (§1)? If it could, every `.Vcr` on disk would become a paired capture.

**Setup:** `Sebring International Raceway R1 15.Vcr` (API replay id 128, `LMGT3 Fixed`, split 2;
XML `2026_08_24_16_23_16-21R1.xml`) loaded from the main menu and played at 1×. `standings`
and `sessionInfo` were polled alternately at 1 request/s for 45 cycles (~135 s wall), and every
field was diffed between consecutive samples. The replay's own Class 1 Type 10 packets were
dumped offline for comparison. Build 14200.

**Short answer: partially.** Only the global session and weather state follows the replay
timeline. Per-car state is a frozen snapshot, and the only other replay-mode data is static.

#### A. What each endpoint returns during replay

| Endpoint | Follows replay timeline? | Content | Value for VCR work |
|---|---|---|---|
| `GET /rest/watch/sessionInfo` | **Yes** (weather/temps) | `raining`, `ambientTemp`, `trackTemp`, `raceCompletion`, `timeRemainingInGamePhase` tick with playback and freeze while paused. `currentEventTime` stays `0.0`. `averagePathWetness`/`min`/`max` stay `0.0` even in heavy rain. `darkCloud` and `windSpeed` stay 0. | Ground truth for the weather packet (see B) |
| `GET /rest/watch/standings` | **No**: zero field changes across 45 samples of all 20 cars | Rich per-car schema (`lapDistance`, `pathLateral`, `trackEdge`, `carPosition`, `fuelFraction`, `veFraction`, `pitState`, `penalties`, `headlights`, `upgradePack`, gaps). Frozen at a `gamePhase: "FORMATION"` snapshot: `lapsCompleted` 0, best times −1. `carVelocity`/`carAcceleration` are all zeros. | None as a time series. The schema lists fields worth searching for in the binary (see D) |
| `GET /rest/watch/standings/history` | No | One entry per slot, the same formation snapshot | None |
| `GET /rest/watch/trackmap` | Static | **1672 track-geometry points, not car positions.** `type 0`: 1176 pts, 5798 m polyline. `type 1`: 346 pts (pit lane). Types 3–39 and 107–144: two points each (pit boxes / garage stalls). | Reference line in LMU local coordinates (see C) |
| `GET /rest/watch/getIncidentsList/0` | Static (whole race) | 44 `{player, contactWith, et}` contacts, et 141.56–1445.58 s | Adds nothing over the XML: it has 49 `<Incident>` rows *with* impact magnitude. API `et` resolution is 0.02 s against 0.1 s in the XML |
| `GET /rest/watch/focus` | — | `10` (the local player's slot) | — |
| `GET /rest/replay/CameraController/getCameraInfo` | — | `{"cameraName":"COCKPIT","currentCameraGroup":"Driving"}` | — |
| `GET /rest/watch/getBookmarkedTimestamps` | — | `[]` | — |
| `GET /rest/watch/replays` | Static | Per-file `eventId`, `eventTitle`, `eventType`, `seriesId`, `session`, `splitNo`, `sceneDesc`, `size`, `timestamp` (73 of 229 files carry no `eventId`) | Already decoded from the VCR event JSON (`replayParser.ts`), so nothing new |

`/rest/sessions/weather`, `opponents`, `getTracksAll` and `getAllVehicles` answer from the main
menu too. They describe the session setup and the content catalogue, not replay state.

#### B. Rain byte = engine `raining` × 255 (lossless)

Distinct `sessionInfo.raining` values seen during playback, compared with the VCR wetness byte
(Class 1 Type 10, payload `+42`):

| API `raining` | × 255 | VCR byte step (clock) |
|---|---|---|
| 0.0784314 | **20.0000** | `0x14` from 1286.7 s |
| 0.0761253 | 19.41 | *(between packets)* |
| 0.0745098 | **19.0000** | `0x13` from 1296.7 s |
| 0.0729028 | 18.59 | *(between packets)* |
| 0.0705882 | **18.0000** | `0x12` from 1310.0 s |
| 0.0666667 | **17.0000** | `0x11` from 1346.7 s (to end, 1510 s) |

- At packet instants the API value is **exactly** `byte / 255`. Between packets the engine
  interpolates linearly. The step order and spacing (API ≈ 9 s → 12 s → 25 s wall time; VCR
  10.0 → 13.3 → 36.7 s) confirm the alignment. The API's first sample sat at replay ET ≈ 1287 s.
- So the VCR byte *is* the simulation's rain state quantised to 1/255, and the API exposes no
  extra precision. The practical scale is `rain = byte / 255`, which replaces the qualitative
  bands in VCR_FORMAT.md §4 (at most 23/255 = 0.090 in R1 15).
- **All 9 channels were byte-identical in every packet after 1100 s.** In this replay the 9
  blocks carry one global value, not per-sector wetness. Per-sector variation would need a
  replay with localised rain to prove.
- `ambientTemp` 22.022 °C agrees with byte `+38` = 129 through the documented formula
  (22.008 °C).
- **Byte `+39` weakened as the track-temp candidate:** it stayed at 129 while the API's
  `trackTemp` drifted 26.000 → 25.887 °C, and 129 is not ~26 °C under the §2.9 scaling.
- `raceCompletion` is **not** the replay clock: 0.968 at ET ≈ 1287 s, and it saturated at 1.0
  while playback continued. `timeRemainingInGamePhase` (38 → 0) belongs to the post-race phase
  (`gamePhase` 9).

#### C. `trackmap` reference line matches our geometry frame

The `type 0` polyline was measured against `server/data/tracks/sebring_full.json`
(`centerline`, 2348 pts). Nearest-point distance: **p50 2.47 m, p90 6.05 m, p99 13.46 m,
max 17.27 m**. Polyline length is 5798 m against our `lengthM` 5861.3 m. The two share the LMU
local (x, z) frame with no rotation or offset. The typical 2–6 m lateral offset (largest in
corners) fits a racing / AI line rather than a centreline. This is not replay data, but it is a
free, game-authoritative reference for `docs/TRACK_BOUNDARIES_PIPELINE.md`: frame and scale
checks for new layouts before any laps have been driven, plus a pit-lane polyline.

#### D. Per-car fields worth hunting in the binary (leads, not findings)

`standings` shows which scoring quantities the engine tracks per car. Because the endpoint is
frozen during playback, it can't validate them against the VCR. Candidates not yet located in
the replay stream: `veFraction` (virtual energy), `fuelFraction` (compare with Class 0 Type 51,
§2.8 C), `headlights`, `penalties` count, `pitState`, `upgradePack`, and `lapDistance` /
`pathLateral` / `trackEdge` (§3 derives these from geometry today). Validating any of them
still needs a driven shared-memory capture (§1) or a way to refresh `standings` in replay mode
(see §7 item 6).

#### E. Hazard: garage endpoints can crash LMU in replay mode

A blind sweep of every parameterless `GET` crashed the game during this investigation.
`/rest/garage/getPlayerGarageData` returned (40 KB), then `/rest/garage/getVehicleCondition`
hung for about 30 s and LMU went down, restarting to the main menu (`gameState: "Setup"`).
Keep replay-mode probing to `/rest/watch/*` and `/rest/replay/*` reads: one request at a time,
≤ 1 Hz, stopping on the first non-200 or slow response. Details in
[LMU_REST_API.md](LMU_REST_API.md) §4.1.

### 2.11 Packet census & newly decoded events (Sebring R1 15, 20260927)

A full slice walk of `Sebring International Raceway R1 15.Vcr` (75,514 slices, 137.6 MB)
counted every event by its **raw header bits** (`class = h>>>29`, `type = (h>>>17)&0x3F`).
Section headings elsewhere in this document and in VCR_FORMAT.md sometimes use other class
numbers for the same packets (e.g. poses are raw class 1, documented as "Class 0"). The parser
mostly gates on type/size, so this has not mattered so far.

#### A. Census: what is decoded, and what is not

| Raw class/type | Size | Count | Share of stream | Slots | Status |
|---|---|---|---|---|---|
| 1/7..15 | 65 | ~1.58 M | 81.7 % | all cars | Decoded (pose, inputs, gear, RPM) |
| **7/9** | **192–360, variable** | 48,152 | **8.7 %** | 255 | **Undecoded.** Exactly 32 Hz (4800 per 150 s), high-entropy payload, first bytes look like a counter. Probably a compressed or bit-packed state stream. The biggest unknown in the file |
| 1/15 | 24 / 37 | 252,436 | 5.3 % | all cars | Decoded (brake rotor temps, §2.8 B) |
| 3/24 | 40 | 74,449 | 2.4 % | player | **Documented but not parsed.** Per-corner brake line pressure leads, r ≈ 0.87–0.93 (§2.8 A) |
| 3/25 | 34 | 74,449 | 2.1 % | player | Sub-tick sync (VCR_FORMAT.md) |
| 1/51 | 3 | 74,449 | 0.4 % | player | Decoded (fuel) |
| 7/11 | 341–377 | 519 | 0.1 % | 255 | Undecoded. Only in the first 0.7–67 s (load/grid), so likely per-car initial-state keyframes |
| 1/22 | 30 → 0 | 4,076 | <0.1 % | 255 | Undecoded. Slot list with `0xFE` separators, grouped in pairs (`02 · 05 11 · 0c 09 · …`), from 67 s on. Looks like the two-by-two formation grid order; the payload later empties |
| **1/17** | **33** | **48** | — | reporter | **Decoded here: contact events (B)** |
| **1/16** | **4** | **648** | — | all cars | **Decoded here: tyre compound per wheel (C)** |
| 7/32 | 4 | 627 | — | all cars | Lead: compound-related (C) |
| 7/28 | 4 | 141 | — | per car | Lead: a per-car counter in byte 2 stepping by 8 (`07, 0f, 17 … 4f`, low 3 bits always `111`), one step roughly every 1–3 laps. Bytes 0–1 are sometimes non-zero (`01 01`, `03 03`, `0c`, `0e`). Possibly tyre age or wear buckets. Not validated |
| 7/36 | 13 | 335 | — | 18 cars | Undecoded. Mostly `0xFF` masks, a few bits cleared near the start |
| 3/11 | 22 | 487 | — | — | Undecoded. First byte varies, rest near-constant |
| 3/4, 3/2, 1/19, 1/26, 1/29–31, 7/52 … | small | < 250 each | — | — | Undecoded, too rare to matter for telemetry |

#### B. Class 1 Type 17 (`sz === 33`): contact / collision event, confirmed

Matched against the session XML (`2026_08_24_16_23_16-21R1.xml`): **48 of the 49 `<Incident>`
rows match** on time (±0.1 s), reporting slot and impact magnitude to two decimals. The one miss
is a duplicate "Sign" hit in the same 0.1 s. No VCR contact lacks an XML counterpart.

| Field | Location | Evidence |
|---|---|---|
| Reporting car | header `driverSlot` | Matches the XML `Name(slot)` in 48/48 |
| Impact magnitude | payload `+8` Float32LE | e.g. 95.48, 273.86, 3949.99, identical to the XML `reported contact (x)` |
| Other party | payload `+32` UInt8 | Other car's slot for vehicle contacts. `112` = `Immovable` (walls), `107` = `Sign` |
| Other-object identity | payload `+12..31` | Constant per object type (the same 20 bytes on every `Immovable` hit except the last byte, `4a/4b/4c`). Probably an object hash / id |
| Unknown | payload `+0..7` | Four Int16LE values that vary per hit. Candidates: contact point or relative velocity. Unconfirmed |
| Time | slice `sTime` | 0.02 s resolution, finer than the XML's 0.1 s |

Why it matters: contacts can be placed on the track map by joining `sTime` to the pose stream.
They also stay available for replays whose XML is missing (the replay DB outlives the files).
The API's `getIncidentsList` (§2.10) is a lossy view of this same data.

#### C. Class 1 Type 16 (`sz === 4`): tyre compound index per wheel, confirmed

Bytes `[FL, FR, RL, RR]` hold the compound index from the car's tyre file. Checked against the
XML `fcompound`/`rcompound` (`0,Medium` / `1,Wet`): **20 of 20 drivers match**. That includes a
mid-race change: slot 17 (Jason Williams) goes `00000000` → `01010101` at 1141.6 s, inside its
pit sequence (pit events at 1119–1170 s), and the XML shows Medium → Wet. Packets arrive when
the car loads onto the grid and again after tyre changes. The index-to-name mapping is per car
and per tyre file, so name resolution still needs the XML or the vehicle catalogue.

**Class 7 Type 32 (`sz === 4`)** also carries a repeated per-wheel byte that follows the same
changes (slot 17 `03` → `02` at 1141.7 s), but with a different code. Medium runners end on
`00` or `03`, wet runners on `02`, and `01` shows up only briefly during grid setup. Candidate
meaning: tyre set, or the compound selected in the garage. Not confirmed.

### 2.12 Corpus & DuckDB validation (all replays on disk, 20260927)

**Corpus:** 229 replays and 929 XML results. Each replay was paired to its XML by contact
fingerprints (impact magnitudes are near-unique floats), and the slot→name mapping came from the
VCR roster (`parseReplayMetadata`). **DuckDB pairs:** 8 race replays with same-session 100 Hz
telemetry of the player car: `Circuit de la Sarthe R1 37–41`, `Daytona International Speedway
Road Course R1 9–10`, `Algarve International Circuit R1 19`. DuckDB `ts` / `GPS Time` sits on the
same session clock as slice `sTime`, so samples pair with no offset. Controls came back as
expected: brake rotor temp at 1/15 `u16@22`, r = 0.9997.

| Finding | Evidence | Verdict |
|---|---|---|
| **1/17 contact event** (§2.11 B) | 69 race replays: 9,884 XML incidents matched, **100 % correct** on reporting slot, magnitude and other party. The only "failures" were XML-escaped names (`O&apos;Reilly`). 8 VCR-only contacts. ~6 % of XML incidents have no packet; the gap is concentrated in 4 replays (e.g. `Spa R1 37`: 49/149 missing) | **Confirmed** |
| **1/17 object codes** | From every non-vehicle contact in the corpus: `105` Cone (26), `106` Post (145), `107` Sign (156), `108` Wheel (101: a detached wheel), `109` Wing (167: detached bodywork), `112` Immovable (2,875: walls/barriers). Values below ~105 are car slots | **Confirmed** |
| **1/16 tyre compound per wheel** (§2.11 C) | 1,592 of 1,611 drivers' final compound matches the XML. Mismatches are detail the XML cannot express: single-wheel changes (`01010101 → 01000101`), mixed front/rear sets that the XML reduces to axle values, and a post-flag reset to `00` | **Confirmed**, per wheel `[FL, FR, RL, RR]` |
| **Session-type scope** | ~~1/17 and 1/16 appear in 71/71 race replays and 0/158 practice/qualifying replays~~. **Corrected in §2.13 A:** header bit 29 is a race-session flag, so in practice and qualifying the same packets appear as 0/17 and 0/16. With the flag masked they are in every session type | ~~Race-only packets~~ **All sessions** |
| **1/51 = Virtual Energy** (A) | 4 races, 267k samples: byte 0 = `round(VE% × 2.55)` in 100 % of samples | **Confirmed**, supersedes "fuel" |
| **Ambient temperature** (B) | Byte 38 against DuckDB `Ambient Temperature` (Daytona R1 9/10: 17 distinct steps) and the Sebring API run | **Confirmed**: `°C = byte / 8 + 5.9` |
| **Track temperature** | Not in 1/10/80: best candidate r = 0.52 (Sebring API run) and 0.90 on a trend (Le Mans DuckDB). Byte 39 is constant 129 on every replay. The replay still **reproduces it exactly**: during `Circuit de la Sarthe R1 37` playback, `sessionInfo.trackTemp` matched DuckDB `Track Temperature` within 0.002 °C (75 samples; green flag at session 184 s). No float32/float64 bit pattern of those values exists anywhere in the file. DuckDB's track temperature steps on a fixed ~232 s cycle (141, 375, 606, 838, 1070, 1303 s), unrelated to laps | **Engine-derived, not stored.** Recomputed from stored weather state (sun angle ramps `f32@6`/`@10`, ambient, clouds). Use DuckDB when available |
| **API wind in replay** | `sessionInfo.windSpeed` is all zeros while DuckDB records 7 m/s | API does not report wind in replay mode |
| **7/9 stream** (C) | No byte-aligned field correlates with any player channel after detrending | **Bit-packed; open** |
| **3/24 packet** (D) | Strong but mixed correlations | Lead |

#### A. Class 1 Type 51 (`sz === 3`) byte 0 is Virtual Energy, not fuel

On `Circuit de la Sarthe R1 37`, byte 0 holds at 153 (= 60.0 % × 2.55) from 139 s to 186 s while
DuckDB `Fuel Level` falls 51.6 → 51.35 L. It then steps down exactly when `Virtual Energy`
crosses each 1/2.55 % boundary (59.805 % → 152, 59.413 % → 151, …). Across Le Mans R1 38,
Daytona R1 10 and Algarve R1 19 (VE 4–97 %, 267,000 samples), every sample is within 0.5 of
`VE% × 2.55`. **Scale: `VE% = byte0 / 2.55` (0.39 % resolution).** Byte 2 was `64` from 426 to
435 s, just before pit entry (449.4 s). That could be a pit-request flag; unconfirmed.

**App impact:** `server/replay/decode/replayTrajectory.ts` already computes `b0/255*100`, which is VE %,
but stores it as `fuelPct` in `driverFuel`. What the replay studio shows as "fuel" is therefore
virtual energy. On cars without a VE system (checked: GTE, `Fuji Speedway R1 29/30`) the packet is still
sent, but all three bytes are 0 for the whole session, so it carries neither fuel nor VE. The parser
reports VE only once a car sends a non-zero value (VE starts full).

**Validation by car class (20260927).** Every DuckDB file was paired to its replay by the
player's timing-line crossings (DuckDB `Lap.ts` against the 7/6 slice `sTime`, ±0.1 s), giving 41
pairs across practice, qualifying and race:

| Class (player car) | Sessions | Byte 0 |
|---|---|---|
| LMGT3 (BMW M4, Corvette Z06, McLaren 720S) | 28 | `round(VE% × 2.55)` in 100 % of samples (Bahrain R1 9: 99.95 %) |
| Hypercar (Peugeot 9X8) | 6 | 100 % (4 checked here, Daytona R1 9/10 in §2.12) |
| GTE (Aston Martin Vantage AMR, Spa) | 4 | always `0`; DuckDB has no VE, fuel 5–43 L |
| LMP3 (Monza, all-LMP3 grids) | 6 | always `0`; DuckDB has no VE, fuel 0.6–38 L |

So the replay records **no fuel for fuel-only cars**. Confirmed in-game: LMU's replay viewer shows
neither fuel nor VE for an LMP3 replay. For VE cars, fuel follows VE only through
the car's fuel ratio (implied "capacity" 85–101 L depending on car and track), which is not a
stored value. Other bytes: byte 1 = `2` for the first seconds of practice/qualifying (in the
garage). Byte 2 is a **pit-request state**, e.g. Daytona R1 8: `64` from 213.9 to 400.3 s around
request (code 33) at 217.3 s and service complete (37) at 401.4 s; then `8` from 734.2 to 894.0 s
(request 745.4, complete 895.1). It stays set to the end of a session when the stop is not
taken. Values 4, 8, 13, 16, 64, 128 differ per stop; their meaning is open.

*Side finding:* the replay roster labels the Monza LMP3 cars `Oreca 07 LMP2` (`4_25_DKR_…`) or
leaves them unresolved (`46_25_ADES…`, `12_25_WTM_…`, `11_25_EURO…`): a vehicle-mapping bug in
`shared/domain/vehicleMapping.ts`, not a VCR issue. Fixed: vehicle ids now resolve through a
catalog built from the results logs (`shared/domain/vehicleCatalog.ts`, `npm run vehicles:catalog`).

#### B. Ambient temperature: `°C = byte38 / 8 + 5.9`

Daytona R1 9 and R1 10 each step through bytes 161…177 while DuckDB ambient moves 26.026 →
28.027 °C: exactly 0.125 °C per unit. Fixed points: 161 → 26.026, 169 → 27.026 (all Le Mans
races), 177 → 28.027/28.028 (Daytona, Algarve), 129 → 22.022 (Sebring API), 153 → 25.025
(Sebring API). Residual ≤ 0.003 °C. The §2.9 formula (`25 − (146 − x) × 0.176`) is wrong away
from its two calibration points (it gives 26.2 °C for byte 153).

The Sebring API run (1 Hz `sessionInfo` over the full race at 2×, 167 in-race samples) also
fixed the replay clock: **VCR `sTime` = race time + 121.5 s** (green flag) for that file. Rain
matched `byte42 / 255` with a mean error of 0.005 byte units. All 9 wetness channels were equal
throughout (u16 reads of any block give the same fit).

#### C. Class 7 Type 9: sub-streams by tag, not per car

Tag = `byte0 & 0x7E`. Le Mans R1 37 has 16 tags, not 21 cars. Four tags (`0x00`, `0x10`,
`0x60`, `0x70`) carry about 5,800 packets each; the rest carry 1,100–5,000. Bytes 1–2 form a
little-endian counter that climbs separately within each tag. A detrended sweep of every
byte-aligned u8/i8/u16/i16/f32 in every tag against 106 DuckDB series found nothing above
r ≈ 0.96 beyond the counter's own time trend. That points to bit-packed (possibly
delta-coded) network messages. The next step is a bit-offset sweep, reading fields of width
4–16 at every absolute bit position within one tag.

#### D. Class 3 Type 24 (`sz === 40`, player only): leads after detrending

`u8@36` against `Turbo Boost Pressure` r = 0.983; `u8@26` against wheel/ground speed r = 0.959;
`i16@7` against `G Force Long` r = 0.944; `i16@17` against `FFB Output` r = 0.923; `i8@9` against
brake pedal r = −0.912; `i8@39` against throttle r = 0.847. These inputs correlate with each
other while driving, so each lead needs a partial-correlation or bit-level pass before
promotion. The §2.8 A "10-byte corner block" model does not fit these offsets well.
**Class 3 Type 11 (`sz === 22`, player, 354 packets):** `f32@15` against unfiltered throttle
r = −0.967. Sparse; meaning unknown. *(Both leads superseded by §2.13 C–D: 3/24 is four
per-wheel blocks after all, and 3/11 is a gear-shift event. The throttle correlation came from
a float read across an event hash.)*

### 2.13 Race-control events, per-wheel chassis & the session flag (corpus, 20260927)

Method as in §2.12: the 69 race replays paired to their XML, and the three DuckDB pairs with
different player cars (`Circuit de la Sarthe R1 37` Corvette GT3 slot 8, `Daytona … R1 10`
Peugeot 9X8 slot 0, `Algarve … R1 19` McLaren GT3 slot 18). Scripts live in the session
scratchpad (`tl.cjs`, `pen.cjs`, `sec.cjs`, `shift.mjs`, `fit6.mjs`, `bits.cjs`, `rate.cjs`).

| Finding | Evidence | Verdict |
|---|---|---|
| **Header bit 29 = race flag** (A) | Set on every event in 71/71 race replays, clear in 158/158 practice/qualifying replays. Every packet exists in both, one raw class apart (`1/8` ↔ `0/8`, `7/9` ↔ `6/9`, `3/24` ↔ `2/24`) | **Confirmed.** Supersedes the "race-only" scope of 1/16 and 1/17 |
| **7/28 = track-limits verdict** (B) | 32,473 of 32,622 XML `<TrackLimits>` rows matched on slot and time, **0 field mismatches** on WarningPoints, CurrentPoints, Lap and Resolution. Re-check (G): 32,469 exact, and only once the lap is read as `u16@2 >> 3` | **Confirmed** |
| **7/5, 7/7 = penalty issued / served** (B) | 129/133 issued (slot + reason text), 108/108 served (time). Re-check (G): 89 of 146 issued; DQs and start-burst penalties are missing | **Confirmed layout, partial coverage**; parsed since cache v7 |
| **1/23, 1/26, 1/29–31 = damage & sector bests** (B) | 2,076 of 2,099 XML `<Sector>` rows matched: 26 suspension damage (713), 23 engine damage (11), 29/30/31 best sector 1/2/3 (491/468/391). Payload always 23 zero bytes | **Confirmed** |
| **3/11 = player gear-shift / limiter event** (C) | Event id 52 upshift, 55 downshift, 88 pit limiter. 637/638 DuckDB RPM-step shifts have one within 0.3 s, on three different cars | **Confirmed** |
| **3/24 = four per-wheel blocks** (D) | `u16@6` of each block = `a + k·v²` of that wheel's speed, residual 0.3 (rounding); rest value matches tyre size per axle and car | **Radius-like value confirmed**; other bytes are leads |
| **1/6 (`sz 10`) = impact** (E) | f32 at +6 equals the event's own `sTime` in 578/578; 492 within 0.3 s of a contact by the same car | Confirmed as impact-related; bytes 0..5 open |
| **1/0 (`sz 0`) = downshift marker** (E) | Player only; 277/277 coincide with a downshift event, but only ~⅓ of downshifts get one | Partly understood |
| **7/33 progress step** (E) | +13 (5 %) per step for every remote car at the same track position, about every 2.3–2.4 laps | Lead; quantity unknown |
| **7/9 stream** (F) | Constant ~8 KB/s at 32 Hz whatever the grid size (19–41 cars); tag count 8–52 per replay; no smooth bit field at any fixed bit offset beyond the counter | Bandwidth-capped, variable-layout stream. **Parked** |
| **Chat** (F) | Not stored in the replay: no ASCII or UTF-16 copy of any XML `<ChatMessage>` text, and 7/60 timing does not follow chat times (13 of 1,094 within 1 s vs 21 for random times) | **XML only** |

#### A. Bit 29 is a session flag, not part of the class

The Sebring census (§2.11 A) read raw classes 1, 3 and 7. A practice replay shows the same
packets as 0, 2 and 6: `0/8` poses, `0/51` VE, `2/24`/`2/25` player chassis, `6/9` stream,
`0/17` contacts, `0/16` tyres. Counting with bit 29 masked (`h >>> 30`):

| Session | Files | With contacts (17) | With tyre packets (16) | With track limits (28) | With 3/11 shifts |
|---|---|---|---|---|---|
| Practice | 92 | 48 | 92 | 80 | 92 |
| Qualifying | 66 | 65 | 66 | 66 | 66 |
| Race | 71 | 69 | 71 | 69 | 69 |

**App impact:** `server/replay/decode/replayTrajectory.ts` tests `evClass === 1` for weather (1/10),
tyre compound (1/16), contacts (1/17) and VE (1/51), and `evClass === 3` for flags (3/10). None
of these branches fires on a practice or qualifying replay. Gate on `h >>> 30` instead.

#### B. Race control: track limits, penalties, damage and sector bests

**7/28 track limits** (`sz 4`): `+0 = WarningPoints × 4`, `+1 = CurrentPoints × 4`,
`u16@2 = (Lap << 3) | Resolution` (reading only byte 2 wraps the lap at 32). Resolution codes from the corpus XML: `0` Disqualify,
`1` Stop Go Penalty, `2` Drive Through Penalty, `3` Time Penalty, `4` Warning, `7` No Further
Action. The XML writes most rows twice, and so does the replay. Example (Le Mans R1 37, slot 5,
234.67 s): `01 01 04 00` = 0.25 / 0.25 points, lap 0, Warning.

**7/5 penalty issued**: `+0` type (`0` Stop/Go, `1` Drive Thru, `3` Time), `+1` seconds / 2,
`+2..` reason text (`01 05 "Speeding In Pitlane"` = Drive Thru, 10 s). **7/7 served**: `+0` type.
Penalties exist only as raw class 7 (or 6); nothing matches class 2. The parser's class-2
branch, which also reads the text from `+3`, never fires, so replays carry no penalties today.
Raw 7/8 is an unrelated high-volume packet, so a class-7 gate must not treat type 8 as
"penalty removed".

**Damage & sector bests** (`sz 23`, zero payload): one packet per XML `<Sector>` row. Le Mans
R1 37: `1/26` slot 8 at 414.89 s = XML 414.9 "Samuel Lague(8) reports new suspension damage";
`1/29` slot 3 at 226.69 s = XML 226.7 "R Franco(3) set new best for sector 1".

#### C. Class 3 Type 11: player sound / animation events

Payload `[u8][u8][16-byte hash][u32 id]`, the same shape as the other-object identity in 1/17.
The hash and id are identical across cars and sessions:

| Id | Hash prefix | Action | Evidence (3 races, 3 cars) |
|---|---|---|---|
| 52 | `555da8e9` | Upshift | 894/900 followed by an RPM drop |
| 55 | `6868bfaf` | Downshift | fired under braking at falling speed; RPM rises or holds |
| 88 | `5655040e` | Pit limiter toggle | 60 km/h, at pit entry and exit |
| 97 | `fd2e6aff` | Not established | 1–5 per race (e.g. stationary off track after a crash) |

Recall: 637 of 638 gear changes detected independently as RPM steps in DuckDB have a 3/11
within 0.3 s. This gives exact shift instants for the player, finer than the gear field of the
pose stream, which dips through neutral (§4 of VCR_FORMAT.md).

#### D. Class 3 Type 24: four per-wheel blocks

Blocks of 10 bytes at `k × 10`, wheel order `[FL, FR, RL, RR]` (per-wheel correlations follow
DuckDB `Wheel Speed[k]`). Per block:

- `u16@6`: `a + k·v²` of that wheel's speed, R² 0.99, residual sd 0.3 (integer rounding). At
  rest: 1399 front / 1454 rear on the Corvette and the McLaren (GT3: smaller front tyre, ratio
  0.962 against 0.966 from nominal sizes), 1487 on all four wheels of the Peugeot 9X8 (equal
  tyre sizes). Consistent with rolling radius under centrifugal growth, in 0.25 mm units.
- `i8@0`, `i8@8`: track G-long (r 0.93 / 0.95); left and right wheels have opposite intercepts.
- `i8@3`, `i8@9`: tiny range (`-1..1`), following brake on the fronts and throttle on the
  rears: a sign of drive/brake torque at that wheel.
- `i8@1`, `@2`, `@4`, `@5`: mostly `0`/`±1` noise. Running sums track nothing.

DuckDB has no per-wheel force, load or radius channel, so only `u16@6` is established.

#### E. Smaller events

- **1/6 (`sz 10`) impact:** e.g. four packets at 414.89–414.95 s for the player's wall hit;
  the f32 at +6 is the impact time (414.9).
- **1/0 (`sz 0`) downshift marker:** see table.
- **7/33 (`sz 4`)** (all cars but the player): `01 0d`, `01 1a`, `01 26` … Each car emits step
  `k` about 52–57 s after its lap-2 sector-1 crossing at Le Mans, at the same place for every
  car. On Daytona R1 10 the steps come at 376, 610, 840, 1067, 1309 … s. The player's VE falls
  about 8.5 % and front-left wear about 1.2 % per step, so neither matches a 5 % bucket.
- **7/15 (`sz 5`)**: `+0` code (0, 1, 4, 6, 9), `+1..4` Float32LE in the range of lap distance
  (5,300–12,500 at Le Mans). Lead.
- **0/19 (`sz 1`, slot 255)**: values 0–3, toggling around pit activity. Lead.

#### F. What stays out of reach

**7/9** carries a constant ~8 KB/s at 32 Hz whatever the grid size, with 8 to 52 tags per
replay. A sweep of every bit offset (8/10/12/16-bit, LSB- and MSB-first) finds only the
counter. It looks like a bandwidth-capped network stream with variable-length records. Poses
already cover every car, so it is parked. **7/60** carries sequenced messages (fragment count,
type, constant id `d270…`, sequence byte) with opaque bodies on a ~60 s cadence; it is not zlib
data. **Chat** is not stored in the replay.

#### G. Independent re-check (2026-09-27)

A separate pass with its own scripts over all 229 replays and 69 XML-paired races:

- **Bit 29:** set on every event of 71/71 race replays, on none of 158 practice/qualifying
  replays. Masked-class packets exist in practice and qualifying: 0/16/4 in 92/92 practice and
  66/66 qualifying files, 0/17/33 in 48 and 65, 0/51/3 in 38 and 53, 1/10/3 in all of them.
- **7/28:** 32,469 of 32,622 rows exact once the lap is `u16@2 >> 3`; byte 3 is non-zero from
  lap 32. 153 rows have no packet.
- **7/5:** 89 of 146 XML penalties exact (type, seconds, reason; 0 mismatches). The 13
  disqualifications have no 7/5: a DQ is a 7/28 verdict with resolution `0` plus a zero-size
  3/17 marker. 44 penalties issued in a burst at the start are absent. **7/7:** 108/108.
- **Damage & sector bests:** 2,076 of 2,099 `<Sector>` rows, none of the wrong kind.
- **3/11:** on Le Mans R1 37, Daytona R1 10 and Algarve R1 19, all 1,778 DuckDB gear changes
  have a shift event of the right direction; 1,779 of 1,789 shift events match a gear change.
- **3/24 `u16@6`:** R² 0.95–0.99 per wheel; rest values reproduced.
- **Other classes:** timing (3/6), standings (3/48) and pit (0/2) only ever appear in the one
  masked class the parser reads. Type 49 appears as masked class 1 and 3 in every session type,
  as distinct events next to pit / garage codes 21, 34 and 18; the parser keeps reading raw 2
  and 7 only, because it treats a type-49 event as a garage return.

Not re-checked: 1/6, 1/0, 7/33, 7/15, 0/19.

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
| **Penalties & Incidents** | Implemented (cache v7) | Trajectory `penalties`: class 3 Type 5 issued (`penaltyType`, `penaltySeconds`, reason text from `+2`) and Type 7 served (§2.13 B). Coverage is partial (DQs and start-burst penalties missing, §2.13 G); the XML stays the reference. Before v7 the branch gated on class 2 and never fired. |
| **3D Car Attitude** | Implemented (`extractReplayTrajectory`) | `rotX`/`rotY`/`rotZ` and `detachablePartState`. |
| **Gear** | Implemented (`extractReplayTrajectory`) | Header `eventType - 8`, all cars including AI. |
| **Engine RPM** | Implemented (`extractReplayTrajectory`) | Bits 53-62 (§2.1), scale 10.9228, saturation guard at raw10 === 1023. |
| **Pit Events & Strategy** | Implemented (`extractReplayTrajectory`) | Class 0/1/5 Type 2 and Class 2/7 Type 49. Structured `fuelAddedLiters` added on top of the existing `details` string. Exposed via the trajectory's `pitEvents` field. |
| **Garage state (`inGarage`)** | Implemented, recomputed on read | From codes `21` → `16` only, split into parked (garage) and the drive out (pit lane), ending at 100 km/h (VCR_FORMAT §Pit Stop & Garage Workflow). Before, type 49 counted as a garage return (17% of race cars flagged in the garage while racing after their first stop, dropping out of the traffic index) and the drive to the pit exit was flagged as garage. On 90 sampled replays: moving points flagged garage 12.4 M → 0. Applied by `withGarageState` on every read, including the traffic reader; drop it only once every row, deleted replays included, is rewritten. |
| **Track Flags & Safety Car** | Implemented (`extractReplayTrajectory`), partially confirmed | Class **3** (not 2) Type 10, always 3 bytes. `flagState` confirmed (§2.6); other 2 bytes decoded but unconfirmed. |
| **Live Standings** | Implemented (`extractReplayTrajectory`) | Class 7 Type 48. Dynamic grid size (`eventSize = 21 + count`), count + slot array in exact running order (§2.6, §2.9). |
| **Weather & Track Meteorology** | Implemented (`parseReplayMetadata`, `extractReplayTrajectory`) | Class 1 Type 10 (80 bytes, driverSlot 255). Ambient `byte38 / 8 + 5.9` °C, rain `byte42 / 255` (§2.12 B). Track temperature is not stored and is no longer derived from byte 39. |
| **Virtual Energy (1/51)** | Implemented (`extractReplayTrajectory`) | Point field `virtualEnergy` = `byte0 / 2.55` (§2.12 A). Before cache v6 it was stored as `fuel`. |
| **Contact events (1/17)** | Implemented (`extractReplayTrajectory`) | Trajectory `contacts`: slot, `sTime`, impact magnitude, other car slot or object name (§2.11 B, §2.12). All session types since cache v7 (class read as `h >>> 30`, §2.13 A). |
| **Tyre compound per wheel (1/16)** | Implemented (`extractReplayTrajectory`) | Point field `tireCompoundIndices` and trajectory `tireCompounds` `[FL, FR, RL, RR]`, raw indices (§2.11 C). All session types since cache v7. |
| **Cache v6 compatibility** | Implemented (`replayTrajectoryCodec.ts`) | v3–v5 rows are corrected on read (`fuel` → `virtualEnergy`, ambient rescaled from the recovered raw byte, `trackTemp` dropped, `rainPercent` = raw / 255). Stored blobs are never rewritten. v6 rows are served as written (race rows match v7 apart from penalties). On-disk replays are re-decoded at v7 by the background upgrade runner; deleted replays keep their rows and gain no contacts or compounds. |
| **Session flag (bit 29)** | Implemented (cache v7) | `extractReplayTrajectory` reads the class as `h >>> 30`: weather (0/10), tyres (0/16), contacts (0/17), VE (0/51) and flags (1/10) now decode in practice and qualifying. v6 rows of practice/qualifying replays lack them until re-decoded. |
| **Track limits (7/28)** | Not parsed (by decision) | Warning/current points, lap, resolution per verdict; 0 mismatches on 32k XML rows (§2.13 B). A field-for-field copy of the XML `<TrackLimits>` rows, which the stewards log already reads; only useful for a replay whose XML is gone. |
| **Damage & sector bests (1/23, 1/26, 1/29–31)** | Not parsed (by decision) | One packet per XML `<Sector>` row with an all-zero payload: the car, the time and the kind (engine damage, suspension damage, best S1/S2/S3), nothing about how much damage or where. Duplicates the XML. |
| **Damage & sector bests (1/23, 1/26, 1/29–31)** | Not implemented | Engine / suspension damage reports and sector-best markers (§2.13 B). |
| **Player gear shifts (3/11)** | Not parsed (by decision) | Exact upshift / downshift / limiter instants for the player car (§2.13 C). Same information as the pose `gear` channel, only timed to the frame, and DuckDB already gives the player 100 Hz gear. Documented, not decoded. |
| **Player tyre radius (3/24 `u16@6`)** | Not implemented | Per wheel, radius-like, grows with wheel speed² (§2.13 D). Low value for the app. |

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

### 6.2 Track meteorology, precipitation & wetness (Class 1 Type 10) [ESTABLISHED]
> **Resolution Note:** The earlier hypothesis that dynamic track meteorology was stored in the metadata 67-byte session block was superseded; that block stores static session rule multipliers (Damage, Fuel, Tire, Session Length). Dynamic track meteorology, precipitation, and sector surface wetness are fully established in **Class 1 Type 10 (`eventSize === 80`)**, detailed in §2.9 and [VCR_FORMAT.md](VCR_FORMAT.md) §4.
- **Ambient temperature** at byte 38: `°C = byte / 8 + 5.9` (§2.12 B).
- **9 sector track wetness / precipitation intensity channels** at bytes 42..77 (zero when dry, positive integers `0x01` to `0x18+` scaling with rainfall rate).
- Enables real-time rain timeline charts and automatic wet-session classification in Replay Studio.

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
  braking and kerb strikes to validate unknown corner-state fields (§2.3).
4. **Extend the track model** to more circuits: 2 edge laps each, per §3.
5. **Test Local Single-Player vs. Multiplayer Replay Telemetry Fidelity.** **[COMPLETED]** Verified via paired capture on Bahrain P1 19 (§2.7, §2.8). Proved that dynamic rubber wear counters and 12-point tire carcass/tread temperatures are universally omitted across both multiplayer and offline practice replays. Simultaneously confirmed individual brake line pressures ($r = 0.930$) in Class 1 Type 24 and brake rotor disc temperature ($r = 1.000$) in Class 2 Type 15.
6. **Does a timeline seek refresh `/rest/watch/standings`?** **[COMPLETED: no]** After a manual
   scrub to 5:00 of Sebring R1 15, all 20 cars were byte-identical to the formation snapshot. The
   API has no per-car ground truth in replay mode; use DuckDB pairs (§2.12) instead.
7. **Per-sector wetness.** Find a replay whose 9 Class 1 Type 10 wetness blocks ever differ.
   If none do, collapse them to a single `rain = byte / 255` value (§2.10 B).
8. **Locate track temperature.** **[RESOLVED: not stored]** The replay reproduces it exactly,
   but no packet carries it; the engine recomputes it from stored weather state (§2.12).
9. **Crack Class 7 Type 9** (32 Hz, 8.7 % of the stream, §2.11 A). **[PARKED]** Constant
   ~8 KB/s whatever the grid size, variable tag count, no field at any fixed bit offset
   (§2.13 F). Poses already cover every car, so the payoff is low.
10. **Wire up the confirmed events:** contacts (1/17) as map markers and a replay incident
    ledger, and tyre compound per wheel (1/16) in stint and pit views (§2.11 B–C).
    **[DONE in the parser]**, including bit-29 gating and the penalty branch (cache v7).
    Track limits (7/28), damage and sector bests (1/23, 1/26, 1/29–31) and player shift
    instants (3/11) stay documented but unparsed: they duplicate the XML or the gear channel (§5).
11. **Identify 7/33** (per-car 5 % steps every ~2.4 laps, remote cars only, §2.13 E). Compare
    against an AI or remote car's own DuckDB in a session where that car is the player, or
    against the API's `veFraction` / `fuelFraction` in a live (not replay) session.

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
| **4-Wheel Dynamics** | Native 4-corner arrays (`RideHeights`, `TyresPressure`, `Wheel Speed`, `TyresCarcassTemp`, `TyresRubberTemp`) | Full `mWheel[4]` telemetry (ride height, tire load, rotation, temp zones) | Player per-wheel blocks in raw 3/24 (a radius-like value that grows with wheel speed², §2.13 D) and rotor temps in raw 1/15. **Wheel angular velocities, ride height, tire rubber wear, and 12-point tread/carcass temps are not available as verified VCR fields.** | VCR has no verified physical ride-height or wheel-speed stream; DuckDB is required for those signals. |
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
- **Ground Truth Driving Telemetry**: Use **DuckDB** for the main driver whenever available (exact 100 Hz pedals, speed, RPM, gear, wheel speeds, ride height).
- **Spatial Track Position**: Use **VCR Replay** for world coordinates $(x, z)$, yaw heading, and track map display (interpolating the VCR trajectory onto the DuckDB timeline).
- **Opponent Overlays**: Use **VCR Replay** for multi-car telemetry traces and benchmark ghost comparisons.
- **Offline Development & Deep Reverse Engineering**: Use **`npm run telemetry:record`** (`tools/telemetry-recorder`) for live memory-mapped calibration sweeps and unknown byte validation.
