# VCR Format — Analysis & Provenance

Companion to [VCR_FORMAT.md](../VCR_FORMAT.md).

**Division of responsibility:**

- **VCR_FORMAT.md** states *what is where* — byte offsets, bit masks, payload layouts. Only
  facts that are established go there, with no hedging, evidence or history.
- **This document** records *how we know*, *how confident we are*, what has been ruled out, and
  what is still open (§3). Anything speculative, superseded, or in progress belongs here.

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
| Verify plugin/struct health first | `tools/telemetryRecorder.ts` | `npm run telemetry:probe` |
| Capture live telemetry | same | `npm run telemetry:record` |
| Diagnose an empty/odd buffer | same | `npm run telemetry:dump` |
| Sweep VCR bytes vs telemetry | `tools/analysis/correlateVcr.ts` | `npx tsx tools/analysis/correlateVcr.ts --vcr <f.Vcr> --telemetry <f.jsonl>` |
| Cross-validate a field, no ground truth needed | Historical `verifyRpm.ts` experiment (not shipped in the current tree) | See §2.1 for the recorded method/results; there is no current command for this removed tool |

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

### 2.3 Acceleration leads — settled

The lateral G lead at pose `i8 @14` and the unresolved longitudinal G (§1 captures) are settled by the pose
survey: acceleration x and z are signed 12-bit fields at bytes 34–35 and byte 3 (§2.14, VCR_FORMAT §4.1).

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

> **Superseded (2026-11-10):** the conclusion below is wrong for brakes and wear. Opcode 143 stores all four brake temperatures and opcode 198 the per-lap tyre wear of every car (§2.17 A, B). The rejected offsets were simply the wrong ones.

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
     - **Ground Truth**: Native `.Vcr` binary replay files do **not** record instantaneous wheel angular velocities or wheel spin/lockup RPMs. True wheel speeds reside exclusively in DuckDB (`Wheel Speed`). *Superseded 2026-11-09: the pose packet carries every car's wheel rotation speeds at 50 Hz (VCR_FORMAT.md, pose bytes 16..31); the statement holds for this per-wheel block only.*
2. **4-Wheel Brake Line Pressures**:
   - Bytes 2..3 (UInt16LE) and byte 9 correlate with individual corner hydraulic braking pressure:
     - **FL**: $r = 0.929$
     - **FR**: $r = 0.930$
     - **RL**: $r = 0.890$
     - **RR**: $r = 0.869$
#### B. Class 2 Type 15 (`sz === 24` or `37`): Authentic Brake Rotor Disc Temperature ($r = 1.000$)

> **Superseded (2026-11-10):** byte 23 is the top of the front-left 10-bit field; the full per-wheel layout is in §2.17 A.
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
  - **Byte 39** stayed at `129` (`0x81`) while the reported road temperature changed. The broader comparison in §2.12 did not establish it as a temperature field.
  - Unlike ambient air which drops rapidly by ~3.0°C during rain, track thermal inertia keeps asphalt temperatures elevated, decaying slowly as standing water accumulates.

#### F. Additional API & Stream Discoveries
1. **Dynamic Grid Size in Standings Matrix (Class 7 Type 48)**:
   - Comparing `/rest/watch/standings` against the frame stream revealed that `Type 48` event sizes are **dynamic**, scaling with the active vehicle count: $\text{eventSize} = 21 + N$.
   - A hardcoded check for `sz === 41` (which assumed exactly 20 cars) broke standings snapshots on 19-car or 25-car grids. Updating to `sz >= 22` with dynamic driver count $N = \text{payload}[0]$ allows 100% reliable position tracking for grids of any size.
2. **Track Collisions & Incidents Ledger (`/rest/watch/getIncidentsList/0`)**:
   - The live API provides 44 contact events with timestamps and driver pairings (e.g. `{ contactWith: "Nicholas Moreno", et: 141.56, player: "Michal Kazmierczak" }`).
   - The replay contains contact events (§2.11 B) and separate penalty assessments where applicable. The nearby type 9 surface updates have their own cadence (§2.15 D).

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

**Question:** can the embedded REST API (`:6397`, see [LMU_REST_API.md](../LMU_REST_API.md)) act
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

The `type 0` polyline was measured against `public/tracks/sebring_full.json`
(`centerline`, 2348 pts). Nearest-point distance: **p50 2.47 m, p90 6.05 m, p99 13.46 m,
max 17.27 m**. Polyline length is 5798 m against our `lengthM` 5861.3 m. The two share the LMU
local (x, z) frame with no rotation or offset. The typical 2–6 m lateral offset (largest in
corners) fits a racing / AI line rather than a centreline. This is not replay data, but it is a
free, game-authoritative reference: frame and scale
checks for new layouts before any laps have been driven, plus a pit-lane polyline.

#### D. Per-car fields worth hunting in the binary (leads, not findings)

`standings` shows which scoring quantities the engine tracks per car. Because the endpoint is
frozen during playback, it can't validate them against the VCR. Candidates not yet located in
the replay stream: `veFraction` (virtual energy), `fuelFraction` (compare with Class 0 Type 51,
§2.8 C), `headlights`, `penalties` count, `pitState`, `upgradePack`, and `lapDistance` /
`pathLateral` / `trackEdge` (the app derives these from geometry). Validating any of them
still needs a driven shared-memory capture (§1): a timeline seek does not refresh `standings`.

#### E. Hazard: garage endpoints can crash LMU in replay mode

A blind sweep of every parameterless `GET` crashed the game during this investigation.
`/rest/garage/getPlayerGarageData` returned (40 KB), then `/rest/garage/getVehicleCondition`
hung for about 30 s and LMU went down, restarting to the main menu (`gameState: "Setup"`).
Keep replay-mode probing to `/rest/watch/*` and `/rest/replay/*` reads: one request at a time,
≤ 1 Hz, stopping on the first non-200 or slow response. Details in
[LMU_REST_API.md](../LMU_REST_API.md) §4.1.

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
| **7/9** | **192–360, variable** | 48,152 | **8.7 %** | 255 | **RealRoad surface updates.** 32 Hz (4800 per 150 s). Block layout and compression in §2.15 D |
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
| **Track temperature** | Weather byte 39 stayed at 129. During `Circuit de la Sarthe R1 37` playback, `sessionInfo.trackTemp` matched DuckDB `Track Temperature` within 0.002 °C over 75 samples. The matching float32 and float64 values did not appear in the file | The API scalar has no established direct field. The replay separately carries spatial temperature updates (§2.15 D) |
| **API wind in replay** | `sessionInfo.windSpeed` is all zeros while DuckDB records 7 m/s | API does not report wind in replay mode |
| **7/9 stream** (C) | No byte-aligned field correlates with any player channel after detrending | **RealRoad surface state** (§2.15 D) |
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
catalog built from the results logs at the time of that fix. Current exact aliases and vehicle
records are supplied by an optional local package through `server/plugins/`; the generated
`vehicleCatalog.ts` and `vehicles:catalog` command are no longer shipped. See [PLUGINS.md](../PLUGINS.md).

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

#### C. Class 7 Type 9: early byte-aligned survey

Tag = `byte0 & 0x7E`. Le Mans R1 37 has 16 tags, not 21 cars. Four tags (`0x00`, `0x10`,
`0x60`, `0x70`) carry about 5,800 packets each; the rest carry 1,100–5,000. Bytes 1–2 form a
little-endian value that climbs separately within each apparent tag. A detrended sweep of
byte-aligned u8/i8/u16/i16/f32 against 106 DuckDB series found no convincing player telemetry
signal. The apparent tags and counters come from the packed surface indices in §2.15 D.

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
| **Header bit 29 tracks session type** (A) | Set on every event in 71/71 race replays, clear in 158/158 practice/qualifying replays. The same packet can appear one raw class apart (`1/8` ↔ `0/8`, `7/9` ↔ `6/9`, `3/24` ↔ `2/24`) | Corpus pattern. The engine meaning is open (§2.15 B) |
| **7/28 = track-limits verdict** (B) | 32,473 of 32,622 XML `<TrackLimits>` rows matched on slot and time, **0 field mismatches** on WarningPoints, CurrentPoints, Lap and Resolution. Re-check (G): 32,469 exact, and only once the lap is read as `u16@2 >> 3` | **Confirmed** |
| **7/5, 7/7 = penalty issued / served** (B) | 129/133 issued (slot + reason text), 108/108 served (time). Re-check (G): 89 of 146 issued; DQs and start-burst penalties are missing | **Confirmed layout, partial coverage**; parsed since cache v7 |
| **1/23, 1/26, 1/29–31 = damage & sector bests** (B) | 2,076 of 2,099 XML `<Sector>` rows matched: 26 suspension damage (713), 23 engine damage (11), 29/30/31 best sector 1/2/3 (491/468/391). Payload always 23 zero bytes | **Confirmed** |
| **3/11 = player gear-shift / limiter event** (C) | Event id 52 upshift, 55 downshift, 88 pit limiter. 637/638 DuckDB RPM-step shifts have one within 0.3 s, on three different cars | **Confirmed** |
| **3/24 = four per-wheel blocks** (D) | `u16@6` of each block = `a + k·v²` of that wheel's speed, residual 0.3 (rounding); rest value matches tyre size per axle and car | **Radius-like value confirmed**; other bytes are leads |
| **1/6 (`sz 10`) = impact** (E) | f32 at +6 equals the event's own `sTime` in 578/578; 492 within 0.3 s of a contact by the same car | Confirmed as impact-related; bytes 0..5 open |
| **1/0 (`sz 0`) = downshift marker** (E) | Player only; 277/277 coincide with a downshift event, but only ~⅓ of downshifts get one | Partly understood |
| **7/33 progress step** (E) | +13 (5 %) per step for every remote car at the same track position, about every 2.3–2.4 laps | Lead; quantity unknown |
| **7/9 stream** (F) | About 8 KB/s at 32 Hz across grid sizes of 19–41 cars | **RealRoad surface state** (§2.15 D) |
| **Chat** (F) | No ASCII or UTF-16 copy of any XML `<ChatMessage>` text. Type 60 timing does not follow chat times (13 of 1,094 within 1 s vs 21 for random times) | Chat association unsupported in sampled files |

#### A. Bit 29 varies with session type in the corpus

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

**7/9** is a RealRoad stream. Its block structure is in §2.15 D. **7/60** carries sequenced
messages (fragment count, type, constant id `d270…`, sequence byte) with opaque bodies on
roughly a 60 s cadence. The inspected bodies did not decode as zlib. See §2.15 E for the
remaining scope.

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

### 2.14 Pose packet bit survey (Daytona + Bahrain, 20261109)

The player's 65-byte pose packets (class 0, types 7..15) of seven replays were resampled onto
every native DuckDB channel and event of the same sessions and swept byte by byte and bit field
by bit field: Daytona Hypercar R11, R12, P27, Q11, Q12; Bahrain GT3 P30, Q12. Pose time and the
telemetry clock agree with a 0.00 s offset in all seven pairs (speed cross-correlation r 1.0000).
Scripts and raw results stayed in the session scratchpad (`sweep.mjs`, `results.json`).

Native telemetry caveats found on the way: the "G Force Lat" table is longitudinal (r -0.994 with
d(speed)/dt) and "G Force Long" lateral, as `server/telemetry/duckdbReader.ts` already handles;
"Wheel Speed" and "Tyres Wear" repeat in pairs ([1]=[3], [2]=[4]), so they hold left/right values,
not four wheels.

**Headlights (byte 2 `0x10`).** Against the `Headlights State` event of the Daytona race
(2026-11-05, 63 cars): all 129 player toggles have a transition of this bit within 0.02 s in the
same direction, flash trains included, and the bit agrees with the lamp state over the whole
session (including 847 s lit without a break). An exhaustive search of every bit and byte found no
other candidate above 8 % of the toggles. About 40 other cars switch the same bit on within a
minute of the player. The same match holds in P27, Q11, Q12, BP30 and BQ12.

**Corrections to earlier entries of VCR_FORMAT.md:**
- byte 38 bits 0..1 were documented as off-track. In R12 `0x01` is set on 200 of 173,304 packets
  above 60 km/h and on 138 of 65,797 fast packets on a non-road surface (SurfaceTypes ≠ 0); BQ12
  0 of 1,701. The pair is the clutch pedal: r 0.987 / 0.997 (R11), 0.934 / 0.984 (R12) against
  `Clutch Pos`; 100 % clutch maps to state 3 in 9,330 of 10,284 samples (R12), 60–80 % always to 2.
  The app dropped its `isOffTrack` flag (477afbd3);
- byte 2 `0x02` (bit 17, read as `inPit`) is never set; byte 38 `0x80` (documented as pit lane) is
  never set on the player;
- the first word's bits 0..6 (steering) and 11..16 (throttle) were wrong: byte 1 is 0 on every car;
- `info2 & 0x3ff` (`detachablePartState`, §6.6) is the same ten bits as `steer10`;
- byte 14 (r 0.71 with "longitudinal G") was the lateral channel, see the caveat above.

**Findings:**

| Field | Verdict | Evidence |
|---|---|---|
| b0 `0x20` puncture | confirmed (2 events) | R12 set 2364–2521 s, right-side wear and pressure drop to 0 at 2364 s; R11 3004–3313 s, Tyres Wear[4] = 0 on 12,243 of 15,421 set packets. Never set in P/Q/Bahrain; other byte 0 bits untested (no left-side event) |
| b2 `0x20` active | strong | Clears on retire / finish |
| b2 `0x40` wipers / rain light | strong | Never set in 5 dry sessions; R11 / R12 one transition each (2776 s / 2796 s), 246–279 s after Minimum Path Wetness reached 5; all 19 Hypercar slots of R12 switch on within 2734–2797 s; wet tyre change at 2438 s. No wiper or lamp channel to separate the two |
| b2 `0x80` | unknown | Never on the player; 34.7 % of other cars' packets in R12, never with `0x40`; flickers ~4,000 times on slots 10–18 and 104 in BQ12 |
| b13..15 | angular rates | The earlier field crossing b13 and b14 correlated with lateral motion. The individual pitch, yaw and roll fields are mapped in §2.15 C |
| words 16/20/24/28 bits 0..12 wheel speed | confirmed | r 0.985–0.999 in six driving sessions, ~0.0219 m/s per count |
| same words bits 13..15 | partial | 7 normally, 0 stationary / dropped out; 1..6 on ~1.5 % of R12 |
| Int16 at 18/22/26/30 suspension | confirmed | r 0.972–0.999 with `Susp Pos[1..4]`; ~9e-5 m/count GT3 front, 1.05e-4 rear; Hypercar 6.7e-5 front, 5.5e-5 rear |
| b36 `0x40` ABS | confirmed | BP30 100.00 %, MCC 1.000, 950/950 transitions, lag 0; BQ12 97.5 %, MCC 0.77, recall 0.91 (event jitter ±30 ms); never set on the Hypercar (no ABS) |
| b37 bits 0..1 hybrid mode | confirmed | Regen Rate exactly 0 in mode 1; mode 3 is 75 % of samples, mean -25.8 kW (deploy) |
| b37 bits 2..4 regen level | confirmed, scale approximate | Mode 2 mean by level 5.7, 22.0, 43.0, 64.8, 88.2, 110.1, 133.2, 156.0 kW; r 0.914 with Regen Rate (R12); level 7 saturates. Bits 5..7 always 0; deploy follows throttle (r -0.81) |
| b38 `0x20` | unknown | Race only: player 48 runs (R11), 2 (R12); on 41/54 and 42/63 cars, peaking laps 3–5; only with fuel < 50 L and VE 10–60 %; best \|r\| 0.29 (mixture); no flag, launch, anti-stall or TC link |
| b38 `0x40` garage | partial | Only at the start or end of the telemetry window (R12 0–5.2 s; Q12 0–81 s); not set in race pit stalls with the engine off |
| b39 bits 0..1 TC level | strong | R12: level 0 means TC false in 100 % of 160k packets; mean throttle at levels 1/2/3 ≈ 15 / 38 / 70 % |
| b39 bits 3..4 | unknown | Always set together on the GT3; best \|r\| 0.25 |
| b40 | paired wheel temperatures, exact channel open | Slow (lag-1 autocorrelation 0.999); r 0.72–0.78 with tyre temperatures in R11/R12, 0.1–0.6 elsewhere. See §2.15 C for the packing |
| b3, b32..35 | packed motion and wheel fields | b3 completes the Z acceleration, b32..33 extend the wheel words, and b34..35 carry the X acceleration and the high bits of Z acceleration (§2.15 C) |
| b1 | constant | 0 on every car |

Not re-checked: b36 bits 0..5, b5, b6..7 (brake, throttle, RPM: known layout).

### 2.15 Event timing, full opcodes and surface state

The file checks cover 12 installed replays spanning offline practice, race recordings and
saved clips, with format versions `0x80000007` and `0x80000008`. Playback details below are
scoped to LMU Steam build `25661166`.

#### A. Container and event clock

- **Metadata offset.** The eight bytes at file offset 53 form a little-endian absolute
  metadata pointer. Byte 61 is the start of the first slice. The upper four bytes were zero
  in every checked recording, which explains why a 32-bit read at 53 worked.
- **Event clock.** A slice starts with a float32 base time in session seconds and a uint16
  event count. An event then has a uint32 header, one byte of time offset and the payload.
  Playback uses `eventTimeSec = sliceTimeSec + offsetMs / 1000`. The writer rounds the offset
  to a millisecond and caps it at 255. The checked files had offsets from 0 to 71 ms,
  including 1 and 11 ms in online races. The byte still occupies the same space as the
  previously assumed separator. The app currently timestamps decoded events and poses at
  the slice time. Changing that clock needs a fresh XML timing and DuckDB alignment check.
- **Trailer.** The footer is six 4-byte fields at EOF − 24. The first two count slices and
  events after the initial slice. In all 12 files the slice count was one less than the
  number walked, and the event count differed by exactly the first slice's event count.
  The next two are float32 start and end times in session seconds. The preceding four bytes
  vary between files. The final two words are serialized fields with unresolved semantics.
- **Roster boundaries.** Each record starts with a one-byte slot, followed by five
  one-byte-length strings and a 27-byte tail. The tail is a 16-byte block, two float32
  timestamps at offsets 16 and 20, and three individual bytes at offsets 24–26. The
  next record starts immediately after offset 26. Walking the declared roster landed
  exactly at EOF − 24 in five files with 2 to 63 records. The current parser reads
  tail byte 26 and the next slot as one big-endian number, which works for these files
  because byte 26 is zero. Byte 25 mirrors the slot in both Daytona races and Sebring.
  The other fields' meanings remain open. The exit timestamp `0xF49DC5AE` represents
  approximately −10³² and occurs for drivers without a recorded exit.

#### B. Dispatch uses a 9-bit opcode

```js
const slot = header & 0xff;
const payloadBytes = (header >>> 8) & 0x1ff;
const opcode = (header >>> 17) & 0x1ff;
const category = opcode >>> 6;
const sessionCode = (header >>> 26) & 0xf;
```

Bits 23–25 select the dispatch category and are also the high three bits of the opcode.
The historical type labels keep only the low six bits. For example, pose opcode 10 and
weather opcode 138 both have historical type 10. Wheel dynamics opcode 88 has type 24,
brake thermal opcode 143 has type 15, and timing checkpoints use opcode 198 (type 6).
Payload sizes and slots still matter when distinguishing layouts under an opcode.

Bits 26–29 hold the numeric session code from metadata. The header uses the full code:
P1 = 1, Q1 = 5 and R1 = 10. Every event in the sampled Bahrain P1/Q1 and Daytona R1
files matched that file's metadata code, including all 25.8 million events in the four
files combined. This explains the bit-29 pattern in §2.13 A. Bits 30–31 are a separate
field.

#### C. Packed wheel fields in the 65-byte pose

**Motion.** Offsets below are relative to the start of the 65-byte payload. The axes
match the world-space position at bytes 41–52. Sign-extend each field at its listed width
before scaling.

| Quantity | Packed fields | Scale per count |
|---|---|---:|
| X, Y, Z velocity | Five-byte little-endian word at 8. X bits 0–13, Y bits 14–25, Z bits 26–39 | X/Z 1/32 m/s, Y 1/20 m/s |
| Pitch, yaw, roll rate | Pitch `b15 >>> 1` (7 bits), yaw `u16LE@14 & 0x1ff` (9 bits), roll `b13` (8 bits) | 1/64 rad/s |
| X, Z acceleration | X = `u16LE@34 >>> 4`, Z = `((u16LE@34 & 15) << 8) | b3`. Both signed 12-bit | 1/32 m/s² |
| Engine speed | Unsigned 14-bit field at bits 50–63, or `u16LE@6 >>> 2` | 1/7 rad/s, approximately 1.364185 RPM |

In Daytona R1 11 and 12, 336,244 moving sample pairs with 15–60 ms spacing gave median
velocity errors under 0.018 m/s per axis against changes in position. The horizontal
acceleration fields correlated with changes in X/Z velocity at `r = 0.995–0.998`, with
median absolute errors of 0.48–0.57 m/s². Yaw and roll rates agreed with wrapped angle
differences at `r = 0.991–0.998`. Pitch agreement was weaker at `r ≈ 0.64` in both files.

The engine-speed writer rounds angular speed × 7 and clamps the result to 0–16,383.
The app's 10-bit RPM estimate discards the three fine bits and the top bit. The fine
bits were nonzero in 12,041 of 13,649 paired samples. Against matching native telemetry,
the full decode reduced median error from 4.66 to 3.46 RPM in R1 11 and from 2.64 to 0.35
RPM in R1 12. The top bit was clear in both recordings.

**Byte 40** packs a mean temperature and a signed half-difference. In Celsius:

```js
const mean = 20 + (byte40 >>> 3) * (150 / 31);
const halfDifference = 10 * (byte40 & 7) - 30;
const a = mean - halfDifference;
const b = mean + halfDifference;
```

The decoded values populate the four wheel entries as `[a, b, a, b]`. The writer can
average three readings per wheel before forming the left and right pairs. Re-encoding
the three exported tread channels from the matched Daytona recordings reproduced the
whole byte in 11% of R1 11 samples and 7% of R1 12 samples, so the specific sensor source
remains open.

**Bytes 16–33** form four little-endian 32-bit wheel words followed by a shared 16-bit
extension. For wheel `i`, the decoder uses the signed top 14 bits of its word as one value,
scaled by `1 / 2048`. It forms a second packed word from the lower 18 bits and nibble `i` of
the extension at offset 32:

```js
const wheelWord = payload.readUInt32LE(16 + 4 * i);
const extra = (payload.readUInt16LE(32) >>> (4 * i)) & 0xf;
const packed = (wheelWord & 0x3ffff) | (extra << 18);
```

The signed 14-bit value is wheel displacement relative to the car's reference. The
remaining fields describe wheel rotation. The high eight bits of `packed` below the sign
bit encode angular speed magnitude in steps of 1/16 rad/s. The low 13 bits encode angle
with a scale of `2π / 8191`. A speed code of 255 instead puts angular speed magnitude in
the low 13 bits, still in steps of 1/16 rad/s, and sets angle to −1. Bit 21 supplies the
speed sign in both modes. In the fallback branch the writer can derive angular speed
from vehicle speed divided by wheel radius. The previous 13-bit wheel-speed and 3-bit
state observations picked up that fallback layout.

#### D. The 32 Hz stream carries RealRoad surface updates

Historical class 6/7 type 9 is **opcode 137**. Playback routes it to the same track-surface
state used by the RealRoad update path. Each payload contains one or more blocks. All fields
are read least significant bit first, and blocks can begin at any bit offset:

| Block field | Width | Meaning |
|---|---:|---|
| Channel | 2 bits | One of four values per surface element |
| Start index | 21 bits | First surface element to update |
| Precision | 1 bit | 0 for 4-bit samples and 1 for 8-bit samples |
| Runs | Variable | Expand to exactly 160 samples |

To decode a run, let `remaining` be the number of samples left in the block:

1. Read a repeat flag if `remaining > 1`. Flag 1 repeats one value, while flag 0 reads
   one literal per sample.
2. If `remaining <= 4` at 4-bit precision, or `remaining <= 3` at 8-bit precision, the
   run fills the remaining samples. Otherwise, start the length at 1 and set the count
   limit to `remaining - 1`. Read a count in 2 bits for limits up to 3, 3 bits for limits
   up to 7, and 4 bits otherwise. Add it to the length. A count of 15 continues with the
   limit reduced by 15.
3. Read the value or literals at the block precision. Multiply 4-bit values by 17 to
   expand them to bytes. Continue at the next bit after the run. Once the block has 160
   values, start another block only if at least one whole payload byte remains after
   rounding the bit position up to a byte boundary.

A separate byte-level check expanded 6,908 payloads with no run overruns across Bahrain Outer
P1 28, COTA R1 2, Daytona R1 9 and Sebring R1 17. It exercised all four channels, both
precisions and packets with several blocks. A Bahrain packet starts at channel 2, index
54,544, with 160 zeros, then updates channel 3 at index 13,516. The earlier byte-aligned
tag and counter were slices of the channel, index and precision fields.

Playback applies each block to consecutive surface elements, wrapping at the surface-array
length. The four channels occupy four bytes per element.

| Channel | Interpretation | Evidence and limits |
|---:|---|---|
| 0 | Rubber buildup | The tyre-crossing update adds material towards saturation. Values are widespread even in dry practice. Exact physical units are open |
| 1 | Loose material, consistent with marbles | The tyre-crossing update removes material and transfers it to a separate accumulator. In the dry part of Daytona the mean was roughly 7–11 compared with 48–67 for channel 0. The marbles label is an interpretation of this behavior |
| 2 | Surface water | Zero before rain in both Daytona races and in dry Bahrain practice. The Daytona R1 11 sample mean rose from 0 to 95 as water accumulated. R1 12 reached 76 and stayed high as rain eased. The physical depth scale is open |
| 3 | Surface temperature | The thermal update uses `265.15 + value / 3` kelvin, equivalent to `value / 3 − 8` °C. The relationship to the HUD's single track-temperature reading is open |

**Opcode 139** (historical type 11) supplies initial surface state in an early burst.
It uses the same run decoder as opcode 137, with no two-bit channel selector. After the
21-bit index and one-bit precision selector, the 160 values split into four 40-value
planes, one plane per channel for the same 40 consecutive elements. All 1,552 sampled
packets in Daytona R1 11/12 and Sebring R1 17 decoded cleanly, producing 19,674 blocks
at 4-bit precision. No packet of this type appeared in the checked dry Bahrain practice.
The relation between element indices and exported mesh vertices still needs validation.

#### E. Multiplayer message fragments

Opcode 252 (historical type 60, slot 255) records outgoing Easy Anti-Cheat messages.
The replay wrapper is two bytes: zero-based fragment index at offset 0 and fragment count
at offset 1. Bytes 2 onward are the original message fragment. The writer chunks messages
at 500 bytes, so a full fragment has a 502-byte VCR payload. Both Daytona races contain
single-fragment messages and 502-byte first fragments with shorter continuations. R1 11
also has a few unpaired records in file order, so adjacency alone does not establish
message identity. The constant-looking identifier in the first fragment varies between
the two sessions. The inner message protocol is outside the replay wrapper.

### 2.16 Pit, repair and retirement events (2026-11-09)

Sources: Daytona R1 11 and R1 12 (online races, 51 and 62 entries) against their results XMLs
(`2026_11_05_10_45_27-02R1.xml`, `2026_11_05_12_14_39-32R1.xml`), the player's 1/51 VE
stream and the player's DuckDB. Events are timed at `slice time + offset ms` (§2.15 A).
Opcodes are the 9-bit values of §2.15 B. XML slots come from the `Name(slot)` text of the
`<Score>` rows, so the XML-only drivers with no `<Score>` row are left out.

#### A. Pit state (opcode 322, 1 or 6 bytes)

Byte 0 low nibble is the car's pit state, and the high nibble is a separate per-car value.
Every stop runs the same sequence:

| Low nibble | Event | Timing evidence |
|---:|---|---|
| 1 | Pit requested | Usually a few seconds after the line crossing on the lap before the stop |
| 2 | Entering the pit lane | Same instant as opcode 241 in 152 of 152 entries |
| 4 | Stopped in the box | About 10 s after entry |
| 5 | Released (6-byte form) | Same instant as opcode 324; duration from state 4 matches its stop time (C) |
| 0 | Back on track / none | About 40 s after release, the length of the pit exit lane; also sent once, high nibble 0, when a car retires (29 in R1 12) |

Value 3 never occurs. The high nibble is 2 on almost every event. It was 1 for every state
of your second R1 12 stop (puncture and suspension damage) and on two other events. Its
meaning, and the 5 extra bytes of the released form, are open.

#### B. Pit lane entry (opcode 241, 1 byte)

One event per pit lane entry, at the same instant as pit state 2. The per-car count equals
the XML laps flagged `pit="1"` for 61 of 61 R1 12 cars and 50 of 51 R1 11 cars. The byte is
always 3.

#### C. Pit stop summary (opcode 324, 5 bytes)

Sent at release, once for the player and twice for remote cars (identical copies).

| Field | Meaning | Evidence |
|---|---|---|
| `u16LE@0` as IEEE half float | Stationary time, s | Within 0.25 s of the time from state 4 to state 5 in 143 of 146 stops (median 0.1 s) |
| byte 2 | VE after the stop, `VE% = byte / 2.55` | Equals the player's 1/51 byte at release in 4 of 4 stops (76.1, 72.5, 72.9, 54.1 %) |
| byte 3 bit 0 | Never set | — |
| byte 3 bit 1 | Stop-and-go served | Set on 5 stops, all by drivers with an XML `Stop/Go` penalty issued earlier; the stop times are the penalty times (10.0 s ×4, 14.0 s for the 14 s penalty) |
| byte 3 bits 2–5 | Tyre changed: FL, FR, RL, RR | Every compound change seen in 1/16 across a stop carries the bit for that wheel, with one exception: slot 51's 0.02 s stop before retiring (R1 12) changed RL and RR without them |
| byte 3 bits 6–7, byte 4 bits 0–1 | Per-wheel companion bit: FL, FR, RL, RR | Only ever set on a wheel whose changed bit is set (e.g. `44 00` FL, `88 00` FR, `10 01` RL, `20 02` RR); `30 00`, `28 00` and `3c 00` change wheels without it. Probably new set vs used set; not validated |

One record disagrees with the player's DuckDB: your first R1 12 stop reads `fc 03` (all four
tyres changed, companion bits set), but DuckDB tyre wear carries on from 91 % across it and the
compound stays the same. The second stop (wet tyres after the puncture) also reads `fc 03`,
and there wear resets to 100 %. Check this against a stop where the tyre choice is known.

#### D. Retirement (opcode 207, 5 bytes)

One event per retired car (29 in R1 12; 11 in R1 11, where the XML lists 12 DNFs), each
paired with a final pit state 0 (A). Byte 0 is the XML `<DNFReason>`: 0 `DNF`, 1 `Engine`, 4 `Suspension`,
6 `Accident`. It matched all 38 retirements whose slot resolves. Bytes 1–4 (a float32 in the
hundreds to low thousands) are open.

#### E. Repairs (opcodes 320 / 321, 72; no payload)

Opcodes 320 and 321 fall 1.1 s before release on the stop where a car is repaired: 53 of 54
within 3 s of a release. Of those stops, 46 had an XML "reports new suspension damage" row for
that car since its previous stop, against 12 of the 92 stops without one. Opcode 72 is the
player's own marker at the same moment (your puncture stop in R1 12 and both repair stops in
R1 11). What separates 320 from 321 is open.

#### F. Player-only events

- **Opcode 70 (10 bytes):** four events at 2364.2–2364.4 s in R1 12, each on an XML incident
  of the player within 0.1 s (the wall contact that caused the puncture). Payload open.
- **Opcode 71 (float32):** three events per race. The value equals the event time: 2.97, 21.48
  and 3834.35 s in R1 12, i.e. the replay start, the first VE sample and the end. Meaning open.
- **Opcode 77 (no payload):** one per player pit entry (2 of 2 in R1 12).

#### G. Per-car leads

- **Opcode 160 (4 signed bytes, one per wheel):** always sent at the same instant as the
  tyre compound packet 1/16 (opcode 144), about every 45 s. Values change before and during
  stops (your car: `02 00 00 00` → `02 04 00 01` after the puncture → `03 03 03 03` with wet
  tyres). Probably the per-wheel tyre choice for the next stop. Value meanings open.
- **Opcode 161 (4 bytes, remote cars only):** byte 1 rises in 5 % steps (12–13 of 255) at
  about 2 % per lap. In the pits it falls by one step every 1.67 s, starting about 2.5 s after
  state 4 and stopping at 5–10 %. It is not VE: your VE in the same stops refills at
  2.5 %/s for the whole stationary time and drops about 4 % per lap. Quantity still unknown.
- **Opcode 164 (13 bytes):** a per-car bitmask, mostly `0xFF`. Bits 64–103 never clear, so
  bits 0–63 likely index other slots. A cleared bit is restored 1 s later. Meaning open.

#### H. Loose objects (opcodes 0–4, 24 bytes)

Each loose track object is its own channel, keyed by (opcode, byte 0); byte 1 is always 0.
A channel starts on a contact. Its first event is sent on the slot of the car that hit the
object (bits 30–31 = 3); the rest are on slot 255. It then sends a sample every 0.26 s for
about 55 s. The opcode is the object type, matched against the object name of the XML
contact row at the channel's start:

| Opcode | Object | Matched |
|---:|---|---|
| 0 | Cone | 3 of 3 |
| 1 | — | none seen with a named contact |
| 2 | Sign | 17 of 18 |
| 3 | Wheel | 5 of 6 |
| 4 | Wing | 6 of 8 |

Bytes 2–9 are a `u64LE` packed position in the local track frame:

- x = bits 0–21, signed, / 64 (m);
- z = bits 32–53, signed, / 64 (m);
- y = bits 54–63 shifted up 10 bits, ORed with bits 22–31, as a signed 20-bit value / 128 (m).

The first sample lies within about 1–3 m of the hitting car's pose at that instant in 13 of
13 checked pairs. A wheel's track falls, bounces and comes to rest. Bytes 10–13 probably hold
the orientation. Bytes 14–23 are zero at rest and nonzero while the object moves (probably
velocity). Neither is decoded.

#### I. Race start sequence (R1 12)

R1 11's recording starts at 578 s, so only R1 12 carries these one-off events.

- **Opcode 372 (211 bytes, at 0.68 s):** the starting grid. After a 25-byte header (byte 0 =
  0, three float32 of 63.0, three of `FLT_MAX`) come 62 triples of (flag, slot, value).
  The value is the XML `<GridPos>` for 61 of 61 resolvable slots. The flag is `0x10` on 4
  cars and `0x20` on 57; it does not follow class. Its meaning is open.
- **Opcode 194 (6 bytes, at 0.68 s):** `12 12 00 ff 00 93`. Bytes 0 and 1 are 18, the player's
  slot in this race. The rest is open.
- **Opcode 214 (formation rows, every 0.3 s from 66.06 s to 177.7 s):** slot bytes split into
  rows by `0xfe`. In grid order the rows read pole alone, then pairs (2–3, 4–5 … 14–15), with
  empty rows where a car is missing. The five cars of opcode 220, and the XML-only car that
  never started, are absent. The payload changes once (at 79.0 s) and empties at 177.7 s,
  as the race starts. It is empty in R1 11.
- **Opcode 220 (no payload, 66.06–66.14 s):** pit lane start. The five cars (slots 50, 52, 60,
  59, 23) are exactly those left out of the formation rows. They are also the only cars to get
  a pit state 0 (A) right after the start: 219.8–224.2 s, one after another, as they leave the
  pit lane about 42–47 s after the green.
- **Opcode 203 (float32, at 66.06 s):** 66.00, the time it is sent, at the same instant as
  the first formation rows and the pit lane starts. Probably the start of the formation phase.
- **Opcode 202 (u32 + float32, at 177.04 s):** `u32 = 3`, then float32 177.48, which is the XML
  lap 1 start time (177.4825 for every car). Sent 0.45 s before that time: the race start
  time, announced ahead.

### 2.17 Full opcode pass: evidence for the 2026-11-10 VCR_FORMAT rewrite

Source: Daytona R1 12 (online race, 62 entries, player slot 18) against its results XML and the player's DuckDB.
Events are timed at `slice time + offset ms`; DuckDB sample `i` is at `22.845 + i / rate` s. Each line below is the
data check behind a field now stated in `VCR_FORMAT.md` §4.

#### A. Brake temperatures in opcode 143 (§4.11)

36,485 player events. The four 10-bit fields at bits 24..63 of `u64@16`, `× 1500 / 1023 − 273.15`, match DuckDB
`Brakes Temp` (50 Hz) with a median |Δ| of 0.40 °C, against a 0.73 °C step. Bits 54..63 follow DuckDB value 1 (FL)
and 44..53 value 2 (FR). The two rear brakes stayed within 3 °C of each other all race, so the data cannot tell
rear-left from rear-right; the order in the spec follows the front pair. The 6-bit levels at bits 0..23 were 0 in
every event. 3,761 events carry the 13-byte tail. The tail's vector is not the car's velocity at the event (median
119 km/h apart): it holds the velocity at the spark point, so it only changes when the spark flags do.

This supersedes §2.7 and §2.8 B: the replay does store all four brake temperatures, and the byte-23 fit of §2.8 B was
the top 8 bits of the front-left field (one count = 5.87 K).

#### B. Timing crossings in opcode 198 (§4.14)

102 player crossings: `i32@4 / 4096` is the crossing time; the masked bytes against DuckDB at that time:

| Field | DuckDB channel | r | Median \|Δ\| |
| :--- | :--- | ---: | ---: |
| byte 11 × 114.9 L | `Fuel Level` | 1.0000 | — |
| byte 12 | `SoC` | 1.0000 | 0.10 % |
| byte 13 | `Virtual Energy` | 1.0000 | 0.10 % |
| bytes 14..17 | `Tyres Wear` (10 Hz) | 0.9989 | 0.10 % |

Aid bytes 18..20 over the grid: `02 40 10` for 49 drivers, `02 00 00` for 8, `02 41 18` and `02 43 18` for one each.
These are the XML `<ControlAndAids>` sets: PlayerControl + Clutch + AutoBlip, PlayerControl alone, and AutoShift 1 / 3
+ Clutch + AutoLift + AutoBlip. The fields are present for all 62 cars, so per-lap fuel, VE, battery and tyre wear
exist for the whole grid of an online race, where the XML has none of them.

#### C. Contacts, track limits, penalties and retirements (§4.12, §4.13, §4.15)

- **Opcode 145:** 842 of 842 events equal an XML `<Incident>` (slot, time within 0.15 s, magnitude to 0.01, other car or
  object name). The decoded contact points lie within the car body: |point| median 2.26 m, max 2.89 m.
- **Opcode 156:** 1,474 of 1,474 events equal an XML `<TrackLimits>` row (slot, lap, both point values, resolution,
  time within 0.15 s).
- **Opcode 133:** 12 events = the 12 XML penalty lines (type, seconds, reason; slot 50 `00 07` "Track Limits" = Stop/Go,
  14 s). **Opcode 135:** slot 4 `01` at 350.4 s = the XML "served 1st Drive Thru"; slot 50 `00` at 1227.0 s = Stop/Go.
- **Opcode 207:** 29 events, reasons 8 × 0, 14 × 4, 6 × 1, 1 × 6 = the XML `<DNFReason>` counts (DNF 8, Suspension 14,
  Engine 6, Accident 1).

#### D. Tyre wear after a stop (opcode 322, 6-byte form, §4.19)

Player stop 1 (2263.5 s): bytes 2..5 decode to 0.910 / 0.925 / 0.902 / 0.906, DuckDB `Tyres Wear` reads 90.9 / 92.6 /
90.3 / 90.7 % after the stop: the tyres were kept. Stop 2 (2521.7 s, wet tyres after the puncture): 1.000 × 4, new
tyres. This settles the §2.16 C disagreement: the `fc 03` bits of opcode 324 are set on both stops, so they do not mean
"tyre changed", while opcode 322 carries the wear the car leaves with. Byte 1 equals opcode 324 byte 2 (VE after the
stop) in 73 of 75 stops; the other two are one count apart.

#### E. Standings (opcode 240, §4.16)

2,016 events, about every 4 s. At 3879 s the first slot is 11 and the three floats are 95.4415 / 25.1289 / 67.0466:
slot 11's best line crossing (opcode 198 time 95.4415) and the sector 1 and sector 2 crossing times of that lap.

#### F. Pose fields (§4.1)

| Field | Check | Result |
| :--- | :--- | :--- |
| Velocity, bits 64..103 | `\|(vx, vz)\|` against the position change between consecutive player poses (above 5 m/s) | median \|Δ\| 0.040 m/s over 181,639 pairs |
| Throttle, bits 43..48 | `n / 63` against DuckDB `Throttle Pos` (50 Hz) | median \|Δ\| 0.00 % over 190,576 samples |
| Yaw rate, bits 112..120 | `n / 64` against the yaw angle's change between poses (above 20 m/s) | slope 1.011, r 0.73 (the differenced angle is noisy) |
| Gear = opcode − 8 | against DuckDB `Gear` | 98.67 % of 192,938 packets; the misses sit on shifts |

The earlier "byte 5 = throttle, 1..249" reading only works above 50 %: byte 5 holds the throttle's low 5 bits and bit
42, so a 6-bit value of 39 (62 %) reads as byte 57. The old 10-bit RPM field (bits 53..62) is the middle of the 14-bit
engine speed at bits 50..63, which is why it saturated at 11,170 rpm. The old wheel scale (0.0219 m/s per count) is
`1 / 16` rad/s times a 0.35 m tyre radius.

#### G. Smaller events

- **Opcode 64:** 183 of 183 within 0.05 s of an opcode 75 downshift (index 55); 642 downshifts in all. The fixed lap
  distances found in the R1 12 pass are the braking zones.
- **Opcode 74:** start lights `1` from 66.03 s (formation), `6` at 177.53 s (green), `0` at 187.5 s; pit exit light
  `2` until 217.5 s; pit official 0 `2` from 219.8 to 224.3 s, while the pit lane start was released. Opcode 211 bit 1
  is set at 217.2 s, as the pit exit light goes to `0`.
- **Opcodes 71 / 70:** dent sets at 2.97, 21.48 and 3834.35 s; four dents at 2364.1–2364.3 s, each at an XML contact of
  the player. Bytes 6..9 of those four opcode 70 payloads read 2364.14, 2364.16, 2364.28 and 2364.38 as Float32LE: the
  dent's session time (checked 2026-11-10).
- **Opcode 147:** `"Race"` five times.
- **Opcode 366:** `00` for all 61 cars (front and rear compound 0).
- **Opcode 202:** one event at 177.03 s: phase 3, 177.48 s, start ≈ 0. The phase stays 3 at the green in this rolling
  start; check a standing start.

### 2.18 Second opcode pass: corpus census and the remaining fields (2026-11-10)

Source: an opcode census of all 265 replays on disk (practice, qualifying and race, 2026-09 to 2026-11, 19 tracks),
keeping counts and the first 12 events of each rare opcode per file, plus Daytona R1 12 against its DuckDB.

#### A. Which opcodes occur

Present (total events / files): pose 7–15; 0–4 (loose objects, 17–93 files); 51; 64 (20,937 / 217); 68; 70 (881 / 97);
71; 72 (18 / 16); 74; 75; 77 (45 / 29); 88; 89; 133 (264 / 110); 135 (195 / 85); 137; 138; 139 (97,640 / 207); 143; 144;
145; 147; 148 (310 / 155); 151 (12 / 11); 154; 156; 157–159; 160; 161; 164; 194 (140 / 140); 198; 200; 202 (80 / 80);
203 (75 / 75); 207 (422 / 75); 209 (14 / 13); 211; 214; 220; 240; 241; 252; 320 (29 / 22); 321 (270 / 63); 322; 324;
366; 372 (63 / 63).

Never present: 5, 16–18, 66, 86, 87, 91, 128, 134, 136, 140–142, 152, 153, 162, 197, 201, 204, 205, 208, 210,
215–219, 221, 235–237, 242, 325, 327–337, 361, 377. These opcodes are handled when the session is live but are not
kept in the replays. No replay has a gear above 7 (opcodes 16, 17) or a compact pose (18).

#### B. Pose flags

Byte 36 bit 7 against DuckDB `TC` (100 Hz) over 193,961 player poses: 169,004 both off, 21,572 both on, none
disagree. It is traction control active. Bit 42 and byte 38 bits 3 and 4 are never set in R1 12; DuckDB's
`FrontFlapActivated` and `RearFlapActivated` are also never on there, so the flap reading of bits 3 and 4 has no data
check yet.

#### C. Tyre tread grid (opcode 89)

The 2,016-cell grid rebuilt from the player's events, averaged per wheel every 30 s, set against DuckDB `Tyres Wear`:

| Time (s) | Grid worn fraction FL / FR / RL / RR | DuckDB worn (100 − wear) |
| ---: | :--- | :--- |
| 519 | 0.028 / 0.028 / 0.023 / 0.023 | 2.6 / 2.3 / 2.8 / 2.7 % |
| 1479 | 0.055 / 0.050 / 0.055 / 0.049 | 6.1 / 5.1 / 6.5 / 6.3 % |
| 2199 | 0.083 / 0.055 / 0.077 / 0.075 | 9.0 / 7.4 / 9.6 / 9.2 % |
| 2439 | 0 / 0 / 0 / 0 | 0.0 / 0.0 / 0.0 / 0.0 % (new tyres) |
| 3639 | 0.046 / 0.032 / 0.049 / 0.049 | 6.0 / 4.5 / 6.5 / 6.6 % |

Both reset together at the tyre change. The grid tracks the wear, front-right lowest as in DuckDB, at about 0.8 of the DuckDB
figure with 1/31 steps. Cell bits 5..13 (worn depth and surface temperature level) are 0 in every cell all race.

#### D. Retirement distance (opcode 207 bytes 1..4)

The float never exceeds the track's length: largest value per track 13,624 m at Le Mans (13.6 km), 5,711 m at
Daytona (5.73 km), 5,745 m at Monza, 4,743 m at Imola (4.91 km), 3,590 m at Laguna Seca (3.60 km), 6,239 m at Spa
(7.00 km). It is the lap distance where the car stopped.

#### E. Other events

- **Opcode 241:** of the events kept, 1,619 are `03` (pit lane entry, §2.16 B), 5 are `04` (retired) and 1 is `05`
  (disqualified); no other reason codes occur in replays.
- **Opcode 209:** 14 events in 13 files, no payload; each marks a disqualification (the zero-size raw 3/17 marker of §2.13 G). 210 never
  occurs.
- **Opcode 202:** exactly one per race in 80 races, always phase 3 with the green time (Algarve R1 18: 127.245 s,
  `03000000 ae67ff42`); no replay has another phase.
- **Opcode 194:** once per session in 140 files, at about 0.6 s, `02 02 00 ff 00 82`, `12 12 00 ff 00 97`, …; its
  meaning is still open.
- **Opcode 148:** at the end of a session (practice at 210 s), twice.

The following were read from the way the session uses them, with no data channel to compare against: the tyre and
engine effect levels in opcode 143, the opcode 64 trigger (downshift under braking above half the maximum engine
speed, at most every 2.5 s), the opcode 200 flag codes (1 yellow, 6 ahead of certain cars, 3 chequered), the
difference between opcodes 320 and 321, and the opcode 241 reason codes that never occur in replays.

### 2.19 Wheels and tyres against DuckDB (2026-11-10)

Source: Daytona R1 12, player slot 18, 190,576 poses and 190,645 opcode 88 events against the player's DuckDB at the
same time (sample `i` at `22.845 + i / rate` s).

#### A. Pose wheel speed and suspension (§4.1)

| Wheel | DuckDB `Wheel Speed` (m/s) / pose wheel speed (rad/s) | r | Pose suspension against DuckDB `Susp Pos`: r, slope |
| :--- | ---: | ---: | :--- |
| FL | −0.3586 | −0.998 | 0.991, 0.547 |
| FR | −0.3585 | −0.998 | 0.996, 0.551 |
| RL | −0.3506 | −0.998 | 0.999, 0.456 |
| RR | −0.3513 | −0.997 | 0.999, 0.461 |

The pose wheel speed is the wheel's angular speed: DuckDB's figure is it times a rolling radius of 0.351–0.359 m, with
the opposite sign. The pose suspension follows DuckDB `Susp Pos` almost exactly but at 0.55 of the scale on the front
axle and 0.46 on the rear, one ratio per axle: the two record the suspension at different points (wheel travel
against spring or damper travel). The pose field ranges −0.042..+0.028 m over the race.

#### B. Pose tyre temperature (byte 40)

The side difference (bits 0..2) equals the value rebuilt from DuckDB's four tyres in 98.2 % of poses. The mean (bits
3..7) follows DuckDB's tread temperatures (`TyresTempLeft`, `Centre`, `Right`), r 0.81, but reads lower: median
−11.6 °C against their mean, −17.9 °C against `TyresRubberTemp` and −26.2 °C against `TyresCarcassTemp`.

| Pose level | Pose °C | DuckDB tread mean °C (median) | Poses |
| ---: | ---: | ---: | ---: |
| 4 | 39.4 | 46.6 | 3,562 |
| 6 | 49.0 | 59.5 | 33,545 |
| 8 | 58.7 | 74.1 | 62,877 |
| 10 | 68.4 | 75.1 | 1,527 |
| 12 | 78.1 | 84.4 | 1,307 |
| 15..22 | 92.6..126.5 | 58.7..68.3 | 266 |

The pose packs a different temperature from the three DuckDB ones, cooler in steady running, with short spikes
(levels 15..22) while DuckDB's stay around 60 °C. A time shift of ±20 s does not close the gap. For tyre temperature
the DuckDB channels remain the reference.

#### C. Opcode 88 (§4.8)

- **Tyre radius** (bytes 6..7, `n / 4096`): 0.3630 m at rest, median 0.3647 m on all four wheels, rising with
  wheel speed (r 0.94–0.98 against DuckDB `Wheel Speed` squared). The rest values of §2.8 (1399, 1454, 1487) are
  0.342, 0.355 and 0.363 m.
- **Lateral fields** (bytes 0 and 8): follow steering (r −0.73 with `Steering Pos` on the left wheels) and the
  10 Hz DuckDB g channel that follows steering (r 0.90..0.94); byte 8 is about seven times byte 0 (−66..+64 against
  −10..+10).
- **About-the-axle fields** (bytes 3 and 9): follow braking, r −0.66 with the wheel's `Brakes Force` on the front
  wheels.
- Bytes 1, 2, 4 and 5 stay within ±3 counts and follow none of the channels (|r| ≤ 0.02).

#### D. Formation grid (opcode 214) and loose objects

- **Opcode 214:** 30 bytes in Algarve R1 18 at 67.0 s, repeated every 0.3 s: `0f fe 00 | 01 fe 05 | 0b fe 03 | …`,
  ten rows of three with `fe` in the middle of each: the two-wide grid. Rows with no car are left out.
- **Loose objects** (first 12 events per file, 3,252 events): largest index 25 for cones (17 files), 186 posts (35),
  48 signs (54), 262 wheels (74) and 129 wings (93), all within the pools of 420 wheels and 210 wings. Objects at rest
  read an angular velocity of 0; a detached wheel spins at up to 54 rad/s, wings and signs tumble at 1..5 rad/s.

### 2.20 Remaining fields against replay data (2026-11-10)

Source: Daytona R1 12 (rain race, player slot 18) against its DuckDB, plus the first 25 race replays on disk for the
pose bits.

#### A. Opcode 143 wheel words and tail

- **Bits 20..25** (`(n / 63)² × 100`): set against a tyre sliding speed rebuilt from the replay alone (pose velocity,
  yaw rate and wheel speed × 0.345 m, car forward = −(sin yaw, cos yaw)), r 0.77, about 1 : 1 in m/s. Typical values
  0..4.3 m/s.
- **Bits 12..15** follow bits 4..7 (r 0.99) at half the resolution and read `0` at pit lane speeds.
- **Bytes 33..34**: r 0.995 against speed squared; about 12,600 N at 85 m/s.
- **Bytes 35, 36**: 0.018..0.033 m. They do not follow DuckDB `FrontRideHeight` / `RearRideHeight` (r 0.01): they
  are the floor's height at two points, not the ride heights DuckDB reports.

#### B. Weather (opcode 138)

| Field | Replay | DuckDB |
| :--- | :--- | :--- |
| Wind speed, byte 35 | 28 / 4 = 7 m/s | `Wind Speed` 7 |
| Wind direction, bytes 36..37 | 16384 → 1.5708 rad | `Wind Heading` 1.5708 |
| Time of day, bytes 78..79 | 56 × 900 s = 14:00, scale 4 → 1× | session time 14:00:21 at the start |
| Ambient temperature, bits 0..9 at 38 | same values as the earlier `n / 8 + 5.9` reading | `Ambient Temperature` |
| Air pressure, bits 10..22 at 38 | 99.01 kPa in every replay | — |
| Humidity, bits 23..31 at 38 | 0.501 at the start, wanders in dry sessions, rises with the rain | — |

Bytes 4 and 5 read `0` or `255`, set for a short time about every 600 s; byte 34 is 128 in every replay.

#### C. Track surface reset (opcode 194)

R1 12: bytes 2..5 = `00 ff 00 93`: no rubber, channel 1 full, no water, temperature `265.15 + 147 / 3` K = 41 °C
against DuckDB `Track Temperature` 31.7 °C at the start (the surface channel is the hottest surface value, not the
air-side track figure). Byte 3 is `0xfc` in some files.

#### D. Opcode 161

Every car except the player. Byte 1 rises by 13 about every 2.3 laps; slot 4 drops from 102 to 25 between 2,397
and 2,405 s, in steps of 13 about every 1.5 s, while the car stands in its box. Against the car's own figures: r −0.79
with fuel, r 0.40 with tyre wear. Byte 0 is `1` from the start, `0` from 1,216 s on. A per-car level that builds up
with distance and is cleaned in the stop: a screen dirt level fits; no data channel confirms it.

#### E. Marshal posts and sector flags (opcode 200)

- Post 37 shows flag 3 at 63.075 s; DuckDB `Sector2 Flag` turns 3 at 63.4175 s, the 0.25 + 37 / 1020 s stagger.
- At the green (177.6 s) every post shows `0`/`2`. The start line post (index 37) shows `0`/`4` at 160.5 s and `0`/`5`
  at 177.2 s.
- Flag 0 with mode 1 or 2 follows a yellow post in the same mode. Flag 4 mode 2 is beside yellow zones. Mode 6 is the
  end-of-race display.

#### F. Pose bits (first 25 race replays)

- **Bit 22**: only in the Daytona rain race; every car switches it on between 2,738 and 2,796 s, each at its own time,
  and keeps it to the end. Not tied to the tyre compound.
- **Bit 23**: Algarve R1 18 from 342.6 s to the end, every car and slot 104 together, toggling about every 0.2 s with
  the same count on every car (21,296 toggles). It does not belong to any one car.
- **Byte 39 bits 3..4**: set in every file without a pattern per car.
- **Bit 49**: set from 3 s into the session until the car leaves the grid area, while the pit limiter is on (93 % of
  limiter poses on most cars) and from a retirement to the end (slot 2 from 735.9 s, slot 12 from 533.6 s).
- **Bit 18** is never set.
- **Byte 38 bit 5**: race sessions only, a few cars per race.

#### G. Opcode 322 high nibble

R1 12: every car switches to `2` at the green; retired cars read `0`. In practice and qualifying, `1`.

#### H. Event time offset and the last pose bytes

- **Header byte 4**: Algarve R1 18, 1,987,226 events: slices are 20 ms apart (73,833 of 73,875 gaps); within a slice
  the byte never decreases. Poses read `0`, opcodes 51 and 88 read `10` / `11`, opcode 143 reads `0, 10, 20 … 70`
  (and `+1`). As a time offset of `n / 4000` s, every pose of a car falls exactly 20 ms after the previous one
  (1,477,100 of 1,477,120 intervals).
- **Pose byte 37 on non-hybrid cars**: `0` in every pose of the Monza R1 11 field and of the non-hybrid cars at Le Mans
  R1 47. On hybrid cars bits 5..7 change on every car at the same moments while they stand in the garage
  (Daytona R1 12 slots 0 and 2: `0` / `32` toggling at 2.9, 3.4, 3.5 … s), the leftover-content pattern of bit 23.
- **Pose bit 42**: never set; DuckDB's `AntiStall Activated` and `LaunchControlActive` are never on in R1 12 either.
- **Pose bit 18**: never set; no replay on disk has a driver swap.

## 3. Still open

The one current list; each pass's evidence stays in §2.

**Format fields not established** (VCR_FORMAT marks each one):
- Weather (opcode 138): what the two flags at bytes 4–5 (set about every 600 s) do; the constant at bytes 16–17
  (`0x1EA2` online, `0x5698` offline); byte 34 (`128` in every replay).
- Opcode 64: what the timed engine effect shows (every one sits within 0.05 s of a downshift sound, §2.17 G).
- Opcode 75: sound index `97`.
- Opcode 74: the names of the start light, pit exit light and pit official values.
- Opcode 143: the per-wheel levels at UInt64 `16` bits 0..23 (`0` in every replay).
- Opcode 161: the quantity of the per-car level (consistent with screen dirt, §2.16 G).
- Opcode 200: flags `2`, `5`, `7..10` and modes `3..5`.
- Opcode 324 (pit stop summary): byte 4 bits 0..1.
- Pose: which driving aid bit 42 is; the non-hybrid engine value in byte 37 (always `0`); why the tyre temperature
  at byte 40 reads below DuckDB's tread temperatures (§2.19 B).
- Opcode 194 channel 1: what the loose-material value `255` means.
- Opcodes the game defines but no replay holds (VCR_FORMAT §3.3): their layouts are unchecked.

**Decoded but not read by the app:** the pose packet's hybrid mode and regen level, clutch, TC level, ABS, puncture,
wipers / rain light and yaw rate. Map one when a feature needs it, all together in one cache version with a one-time
offline rewrite of the replays whose files are gone.

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

## 5. Comparative Telemetry Accuracy & Signal Loss: VCR vs. DuckDB vs. Shared-Memory Recorder (`npm run telemetry:record`)

This section quantifies the empirical accuracy loss, bandwidth decimation, and signal degradation across the three available telemetry ingestion paths in LMU.

### 5.1 Comparison Matrix

| Metric / Channel | Native DuckDB Telemetry (`UserData/Telemetry/*.duckdb`) | Custom Shared-Memory Recorder (`npm run telemetry:record`) | Binary VCR Replay (`UserData/Replays/*.Vcr`) | Accuracy Loss & Signal Degradation in VCR |
|---|---|---|---|---|
| **Sampling Rate** | **100 Hz** (10 ms period) | **~50 Hz** (20 ms period) | **~10–20 Hz** variable (50–100 ms period) | **5x–10x temporal decimation**. Sharp transient dynamics (ABS pulsing, kerb strikes, rapid steering corrections) under 50 ms are aliased or lost. |
| **Throttle & Brake Inputs** | 32-bit Float (`0.0`–`1.0`, zero quantization error) | 32-bit Float (`mUnfilteredThrottle`, `mUnfilteredBrake`) | 8-bit quantized integer (`0`–`255`, ~0.39% step resolution) | Quantization stepping masks subtle micro-trail-braking (< 0.5% pedal variations). Braking onset points have up to 50–100 ms temporal jitter. |
| **Steering Input** | Full precision float (rad / deg) | 32-bit Float (`mUnfilteredSteering`) | 10–12 bit packed field (~0.1° resolution) | Slight angular quantization banding; fast counter-steer peaks rounded off. |
| **Vehicle Speed** | Native `Ground Speed` float (m/s) | Native vector magnitude $\|(v_x, v_y, v_z)\|$ | Derived from displacement $\Delta(x, z)/\Delta t$ or packed velocity | Speed differentiation introduces high-frequency noise, requiring smoothing filters that shave 1–3 km/h off true apex minimum speeds ($V_{\min}$). |
| **Engine RPM** | Native `Engine RPM` float | Native `mEngineRPM` float | 10-bit packed field (0–1023) scaled by ~10.9228 | RPM quantised into ~11 RPM bins. Maximum headroom caps at 11,170 RPM. |
| **Gear Selection** | Timestamped sparse event (`Gear` table) | Native `mGear` (-1, 0, 1..8) | Reconstructed from event header (`eventType - 8`) | Transient neutral (0) frame dips during shifts can cause gear flicker if not debounced. |
| **4-Wheel Dynamics** | Native 4-corner arrays (`RideHeights`, `TyresPressure`, `Wheel Speed`, `TyresCarcassTemp`, `TyresRubberTemp`) | Full `mWheel[4]` telemetry (ride height, tire load, rotation, temp zones) | Every car: wheel angular speed and suspension travel in the pose (§2.19 A), wheel load, tyre sliding speed and brake temperatures in opcode 143, one tyre temperature mean and side difference in pose byte 40. Player: wheel mounting and tyre radius (opcode 88), tread wear grid (opcode 89). **Ride height, tyre pressure and the 12-point tread / carcass temperatures are not in the VCR.** | DuckDB is required for ride height, tyre pressure and per-zone tyre temperatures; the VCR has wheel speed and suspension travel for every car. |
| **2D Spatial Racing Line** | None (1D distance / time based) | World $(x, y, z)$ via `mPos` | **World $(x, y, z)$ + Yaw** | VCR is the **only source providing complete multi-car 2D grid coordinates** for circuit map visualization. |
| **Grid Scope** | **Main driver only** | **Main driver only** | **All drivers & AI grid** | VCR remains indispensable for head-to-head opponent comparisons and alien reference overlays. |
| **Setup & Friction** | Background native game exporter | Requires external C# console app running live | Automatic game recording | DuckDB and VCR require no secondary tools running while driving. |

### 5.2 Primary Error Modes in VCR Telemetry

1. **Temporal Aliasing & Braking Point Drift**:
   At 300 km/h (83.3 m/s), a 20 Hz replay slice spans **4.16 meters** of track per sample (and up to 8.3 m at 10 Hz). A 100 Hz DuckDB stream measures position every **0.83 meters**. Consequently, braking initiation points extracted purely from VCR files carry an inherent positional uncertainty of $\pm 2$ to $\pm 4$ meters.

2. **Trail-Braking Modulation Truncation**:
   When releasing the brake pedal from 20% to 0% over a 300 ms trail-braking phase into an apex, DuckDB captures 30 distinct float data points illustrating the curvature of the release rate. A VCR replay captures only 3 to 6 discrete steps, making automated coaching of progressive brake release heuristic rather than deterministic.

3. **Apex Minimum Speed Under-Reporting**:
   Because replay slices do not necessarily coincide with the exact spatial geometric apex of a corner, the lowest captured speed in a VCR slice often straddles the true apex by 25–50 ms. On tight hairpins (e.g. Monza T1 Rettifilo or Bahrain T10), VCR minimum speed is typically 1.5 to 3.0 km/h higher or lower than the true physics minimum recorded in DuckDB.

4. **Wheel Slip & Lockup Masking**:
   Micro-lockups lasting 20–40 ms (frequent in non-ABS Hypercar/LMP2 braking zones) are completely invisible in VCR replays because frame rates are too coarse to resolve the wheel deceleration transient, and per-wheel speeds are stripped from the replay stream. DuckDB's 100 Hz `Wheel Speed` channels (FL, FR, RL, RR) reliably expose every micro-lockup event.

### 5.3 Recommended Architecture: Fused Telemetry

To achieve zero-compromise analytics:
- **Ground Truth Driving Telemetry**: Use **DuckDB** for the main driver whenever available (exact 100 Hz pedals, speed, RPM, gear, wheel speeds, ride height).
- **Spatial Track Position**: Use **VCR Replay** for world coordinates $(x, z)$, yaw heading, and track map display (interpolating the VCR trajectory onto the DuckDB timeline).
- **Opponent Overlays**: Use **VCR Replay** for multi-car telemetry traces and benchmark ghost comparisons.
- **Offline Development & Deep Reverse Engineering**: Use **`npm run telemetry:record`** (`tools/telemetryRecorder.ts`) for live memory-mapped calibration sweeps and unknown byte validation.

### Weather packet: cloud field and drift (2026-11-10)

- The 32 four-bit cells are cloud type codes, not densities, read low half first. Evidence: a static read of the game's code (cell code to cloud type, 25 lower and 7 upper cells), and the game's own cloud coverage number recomputed from a Daytona practice replay (0.1886 near 410 s) against the value in a frame capture of that session (0.1886386); the density sum gives 0.152 there.
- Bytes 6..9 and 10..13 are the two layers' drift in cells; the rates measured earlier, `(20 + w) / 16500` and `(10 + w) / 10560`, are the constants in the game's code.
- The app's cloud cover figure still uses the density sum; switching it to the game's coverage needs the per-type weights from the data package.
