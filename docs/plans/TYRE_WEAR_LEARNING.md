# Tyre wear learning (per wheel, slip-aware)

Status: 2026-10-25: Phase 1 validated (model v2), committed `70591550`. Phase 2 implemented and accepted on one session (below), uncommitted. Reviewer: Claude
(main session) validates each phase against the regression race and the practice logs; the implementer does not judge
its own acceptance.

### Implementation handoff (2026-10-25)

Phase 1 code, evaluator, fixtures and focused tests are implemented; no commit was made. The implementer ran
focused tests, typechecking, lint and a production build as implementation checks. The build passed; Vite emitted
a `PLUGIN_TIMINGS` advisory about CSS callback duration. Full-suite, warning-free build confirmation and cohort
acceptance belong to the independent validator. No acceptance criterion is marked passed here.

- Native strategy state reads are shared through `readSessionLapStates`; source data remains on demand.
- `sessionTyreWear.ts` requires the existing current-rule unique ownership gate and a closed, available version-2+
  capture. Each lap is selected by scoring anchor time, never by an assumed raw counter offset. A gap over 2 s
  excludes the lap, consistent with `learning/capture.ts`; missing wheel channel values also exclude it.
- Important source correction: in `2026_10_24_16_51_08-73R1`, raw capture lap **9** is XML/native completed lap **10**
  (1043.051–1147.619 s). Both the ~1059 s impact and ~1074.8 s lockup lie in it. The existing native end-state reader
  measures RL loss **0.0168804** for this lap. The earlier ~1.74%/lap-9 note used different sampling/numbering; the
  checked-in fixture pins the canonical reader's result rather than fabricating that older value.
- Invalid laps can have a null scoring duration and an XML time repeating the previous lap. Consecutive verified
  crossing starts bound these intervals, retaining their real wear and slip. Timed anchors must still match XML.
- The fixture includes that race, `2026_10_24_16_27_40-52Q1`, and `2026_10_22_09_22_04-75R1`; no raw recordings
  were copied. Regenerate with `npx tsx tools/analysis/evaluateTyreWear.ts
  2026_10_24_16_51_08-73R1,2026_10_24_16_27_40-52Q1,2026_10_22_09_22_04-75R1 --fixture` (JSON stdout).
- Garage selected tread is kept in FL/FR/RL/RR order. The inspected Portimão practice diagnostics sidecar
  `portimao_wec_practice_2026-10-24T20-16-31.859Z_*.diagnostics.jsonl.gz` has the four-entry `selectedTires`
  body, including `[100,99,100,100]`; the validator should independently confirm corner identity in a driven set.
- Profiles are cached by exact cohort plus session/native-link revisions; reconciliation already advances the
  session revision. Reads start only in the garage, abort between I/O steps when leaving it or switching cohort,
  and do not cache cancelled work. An already submitted read finishes before its handle closes.
- `LIVE_MODEL_VERSION` is 9; the fuel/VE baseline version is unchanged. Older saved garage plans can omit per-wheel
  tread and fall back to their stored minimum.
- Run `npx tsx tools/analysis/evaluateTyreWear.ts portimao_wec` for the cohort report (or omit the filter for all).
  It holds out the newest session and reports, per wheel, the plan's wear against each kept lap (bias and MAE;
  negative bias = less wear planned than run, the unsafe side), the same for the old rule, and the fit with each lap's
  actual slip; then a no-change garage projection against the native flag tread, skipped for races with a stop, new
  tyres or a puncture. The old rule is the live plan's: the preceding session's worst tread from its first crossing to
  its last, per lap (unknown when that session changed tyres).

### Validation of phase 1 (reviewer, 2026-10-25)

Gates: `npm test` 3,593 passed, `npm run lint` clean, `npm run build` clean when run alone (the `PLUGIN_TIMINGS`
advisory appears only under parallel load; it is the CSS transform, not this change). Confirmed on real data: lap
selection by verified crossing time (the Portimão impact and lockup land in XML lap 10 with the native RL loss); the
garage `selectedTires` order is FL, FR, RL, RR (six sessions' last garage read equals their native flag tread wheel for
wheel); compound names match (`Medium` in XML, REST and shared memory); session types are `Race`/`Practice`/`Qualifying`.

The first review rejected model v1: without a slip slope (4 of 5 cohorts) the wear was the median of near slip-free
laps, so it planned 12–16 % less wear than Le Mans and COTA Lexus ran; the evaluator compared against a rule the live
plan never used. Fixed (model v2): without a slope the wear is the usual laps' mean loss (their slip cost included); the
usual slip is a mean, not a median (the expected value of a linear cost); a negative slope falls back the same way;
`N/A` is an unknown compound; the evaluator measures the plan's wear against each kept lap and the live plan's real rule.

Held-out results, model v2 (bias = planned − run per lap; negative is the unsafe side):

| Cohort (held-out race) | Worst unsafe wheel bias | Old rule (live) | Garage projection, new / old / actual |
|---|---|---|---|
| Portimão Ginetta (`73R1`) | RL −0.0016 (the lap 10 lockup) | +0.0031 to +0.0061 | 0.959 / 0.903 / 0.940 |
| Le Mans Peugeot 9x8 (`46R1`) | RL −0.0014 | unknown (tyre change) | skipped (stop) |
| Bahrain BMW M4 (`32R1`) | none (−0.00004) | +0.0004 to +0.0013 | skipped (stop) |
| COTA Ferrari 296 (`31R1`) | none (FL −0.0001) | +0.0016 to +0.0037 | 0.832 / 0.856 / 0.878 |
| COTA Lexus RCF (`37R1`) | FL −0.0003 | +0.0005 to +0.0034 | 0.857 / 0.844 / 0.852 |

Portimão: 0.959 against 0.940 at the flag (within 0.02; the live plan showed 0.806). The slip gate (5 laps with ≥ 0.5 s
on the wheel) was checked against 3 laps with ≥ 0.25 s: two more slopes, one better (Le Mans FR), one worse (Portimão
FL), the rest unchanged; races have too few slip laps for the gate to matter, so it stays. Remaining known error: one
incident lap in a short race (Portimão RL) is not predictable; COTA Ferrari plans more wear than run (safe side).

### Practice validation and Phase 2 (2026-10-25)

Silverstone National practice, Ferrari 296 LMGT3 Evo (`silverstone_national_practice_2026-10-25T16-37-31`): 11
`tyre-check` pairs. `mWear` is **tread left** (1 = new): it matched the condition reply's `tireCondition` within 0.0001 on
every wheel (as wear done it was off by ~1), and it moved up to 0.0036 between replies, so REST is the one that lags.

Phase 2 is implemented: `LiveCarReading.tread` (decoded from `mWear`, clamped 0..1; the raw `lmu-fields` log is removed),
`LiveTyreTracker` keeps one stint per wheel fed at each crossing from it (new-tyre reset and puncture rule per wheel),
`LiveTyres.wheels` carries each wheel's tread and wear per lap, `wearPerLap` is the highest of the four, and the live and
garage coverage (`limitingTyreCoverage`) project every wheel and name the limiting corner on the dashboard (`~94% RL`).
`eventTyreWear` is per wheel. The per-lap `getVehicleCondition` trigger and the `tyre-check` diagnostic are removed; the
impact trigger, the pit-exit trigger and the poller's 5-minute read stay (damage still needs REST). `LIVE_MODEL_VERSION` 10.

Acceptance session (Silverstone National `55P1`, 2026-10-25: three stops, a penalty, damage, a spin): no condition call
at a plain crossing (12 calls, all after a pit exit, an impact or the 5-minute poll), and the live tread at each crossing
equals the native lap-end tread per wheel (e.g. lap 13 0.944/0.984/0.888/0.947 both). Two tracker fixes followed
(`LIVE_MODEL_VERSION` 11): a new tyre is any rise above `NEW_TYRE_RISE` (0.005, as the native measurement) instead of
0.05, which missed fresh tyres after a 5-lap stint (rise 0.015) and read 0.0002 a lap; and each wheel's wear per lap is
the median lap of its stint, so the spin lap (11% off RL, already in the tread) no longer read 0.027 a lap.

Working rules for the implementer: read [`docs/CODE_MAP.md`](../CODE_MAP.md) and `AGENTS.md` first. `npm test`,
`npm run lint`, `npm run build` finish with zero warnings; every test under 1000 ms in the full suite. **Do not commit**
(the user says when). Deterministic only: no AI, no fitted parameter that is not reproducible from stored data.
Prefer the smallest change; no new flags or settings. `shared/types/` is at its 20-file limit: add types to
`shared/types/liveStrategy.ts` or `shared/types/session.ts`. Never touch an active `.live.duckdb` recording; read only
closed, verified ones, read-only. LMU REST: no new calls.

## Why

Portimão LMP3 sprint 2026-10-24 (Ginetta, race `73R1`, qualifying `52Q1`, see [RACE_REVIEW_LOG.md](../RACE_REVIEW_LOG.md)):
the garage plan predicted 0.806 tread at the flag, the race ended at 0.944. The plan took the event's measured wear,
which came from qualifying (0.012–0.015 a lap) where the driver had spins and lockups (20.5 s of wheel slip over
6 laps); the race wore 0.0044–0.0053 a lap (6.9 s of slip over 13 laps). Wear follows slip: lag-paired fits gave
Ginetta r 0.87 (clean 0.0032 a lap, +0.0021 per slip second), Lexus r 0.73. A 5–6 s lockup/spin costs 1.5–2 % on
the worst wheel. Wear also differs a lot per wheel (lap 9 event: RL 1.74 %, RR 1.23 %, FR 0.80 %, FL 0.45 %; normal
laps RL 0.41, RR 0.37, FL 0.27, FR 0.15 %).

## Decisions (settled with the user 2026-10-24/25)

| Topic | Decision |
|---|---|
| Model | Per wheel: `wear per lap = clean wear + cost per slip second × the driver's usual race slip on that wheel`. |
| Cohort | Layout (`layout_key`, never across layouts) + car model (`resolveVehicle` model, the same as the live identity's `vehicleModel`) + compound + dry + player driver. Wet laps are left out (no wet tyre model yet). |
| Wear after the session | Native LMU DuckDB "Tyres Wear" (4 wheels, full precision, no lag), via the existing `DuckDbReader.getLapEndStates()`. Read on demand, never copied into our recordings or SQLite. |
| Slip | From the app's live recordings only (`capture_samples` patch/ground longitudinal velocities, `detectWheelSlipEvents`). **No native fallback**: native "Wheel Speed" is the hub ground speed (validated: 0 s vs 6.86 s on the Portimão race). A session without a verified live recording does not teach the tyre model. |
| Sessions used | Every session type (practice, qualifying, race) with both a linked native file and a verified live recording, newest 10 per cohort. Qualifying laps teach the model; the usual slip comes from race laps (below), so a spin-heavy qualifying no longer sets the race wear. |
| Usual slip | Mean per-lap slip seconds of that wheel over the cohort's race laps; no race laps → practice laps; none → qualifying laps (mean since v2: the expected slip cost). |
| Plan priority | Learned profile → the event's measured wear (today's behaviour) → earlier races' median (`estimateFromHistory`). |
| Live tread | Phase 2: shared memory `WHEEL.wear` per wheel at each crossing, not REST. |
| REST | Phase 2 drops only the per-lap `getVehicleCondition` trigger. Keep the impact trigger, the pit-exit trigger and the 5-minute safety poll (user, 2026-10-24). Damage stays on REST (no shared-memory equivalent). |
| rF2 plugin | Stays; other apps use it. File names keep `rf2` (user, 2026-10-25). |

## Phase 1: learn the per-wheel profile and use it in the garage plan

No dependency on the practice validation.

### 1a. Per-lap wear and slip of one session (`server/sessions/sessionTyreWear.ts`, new)

`readTyreWearLaps(sessionDb, sessionId): Promise<TyreWearLap[] | null>`:
- Native: reuse what `readSessionStrategy` (`server/sessions/sessionStrategy.ts`) does to collect `StrategyLapState`
  per lap from the linked native files (extract the shared part into one function; no copy). `tread[w]` at the end of
  lap N, lap 0 = start. Loss of lap N on wheel w = `tread(N−1) − tread(N)`.
- Live recording: the session's verified recording, with the same ownership checks as `learningProjectionInputs`
  (`server/live/learning/inputs.ts`: one verified recording owning the session at the current match rule version).
  Read the wheel channels exactly as `tools/analysis/listWheelSlipEvents.ts` does (`liveCaptureChannels`,
  `wheelSlipChannelIndexes`, `wheelSlipRatios`, `detectWheelSlipEvents`; normalization version ≥ 2), open with
  `openVerifiedLiveRecording` read-only. Slip seconds per wheel per lap = sum of event durations (lockup + wheelspin)
  on that wheel. Also count a lap as unknown when the recording has a gap inside it (the same rule as
  `capture-gap` in `shared/domain/learning/capture.ts`).
- **Lap numbering**: the capture's `lap_number` is rF2 `mLapNumber`; native and XML laps use the completed-lap number.
  Establish the mapping and pin it with the regression anchor below; do not guess.
- Laps kept (each lap gets a reason when dropped, for the tool): XML lap with a time, not lap 1, not `isPitStop`, not
  `isOutLap`, dry (`condition_group`), compound known (per wheel from the lap's `flCompound`/… fields; all four the
  same as the cohort's), slip known, no wheel's tread rising more than `NEW_TYRE_RISE` (0.005, new tyres, in
  `shared/domain/strategy/sessionStrategy.ts`) and no wheel losing more than `MAX_LAP_WEAR` (0.15, puncture / lost
  wheel, in `shared/domain/live/liveCarCondition.ts`). Both are module constants today: export them and import, no
  copies. Slow, traffic and contact laps stay: they are real wear.
- Session type, compound, game version and lap number go with each lap.

### 1b. The fit (`shared/domain/strategy/tyreWear.ts`, new, pure)

`fitTyreWear(laps, sessionKind per lap): TyreWearProfile | null`, per wheel FL, FR, RL, RR:
- At least 8 kept laps, else null for the whole profile (not per wheel: one wheel without data means the data is wrong).
- With at least 5 laps of slip ≥ 0.5 s on that wheel: ordinary least squares `loss = a + b·slip`; `wearPerLap = a + b·u`.
  `a < 0` → `a = 0` and refit `b` through the origin. `b < 0` is treated as no slope.
- Without a slope `b = null`, `a` = median loss of the laps with slip < 0.25 s (shown as clean wear), and
  `wearPerLap` = the mean loss of the usual laps (race, else practice, else qualifying), their slip cost included.
- Usual slip `u` per wheel per the decisions table (mean); `wearPerLap` rounded to 0.00001. Model version 2.
- Profile: `{ version: TYRE_WEAR_MODEL_VERSION (1), wheels: [{ corner, cleanWear: a, perSlipSecond: b, usualSlip: u,
  wearPerLap, laps }], sessions, laps, gameVersions }`. Types in `shared/types/liveStrategy.ts`.

### 1c. Profile for the live plan

- `readTyreWearProfile(sessionDb, layoutKey, carModel, compound, driverName)` in `server/sessions/sessionTyreWear.ts`:
  the newest 10 sessions of the cohort that have both sources, then `fitTyreWear`. Check that `sessions.player_car_type`
  holds the `resolveVehicle` model; if it does not, resolve it rather than adding a column.
- Wire it like `raceHistory` (`server/index.ts` → `LiveServiceOptions` → `LiveStrategyTracker`): read once per
  layout + car + compound + driver, cached for the server run, re-read when a session of the cohort is imported.
  Never read while the car is on track (garage or menus only, like the history read).
- `LiveStrategyTracker.raceStrategy`: priority per the decisions table. `LiveRaceStrategyBasis.wear` gains `'learned'`
  (with the session count); `LiveRaceStrategy.tsx` shows `WEAR LEARNED (n)` the way it shows `WEAR FROM n`.
- Garage tyre coverage (`garage.tyreCoverage`) uses the same wear.

### 1d. Per-wheel race plan (`shared/domain/strategy/raceStrategy.ts`)

- `RaceStrategyInput.wearPerLap` becomes per wheel (`[FL, FR, RL, RR]` or null). The history and event fallbacks,
  which know only the worst wheel, fill all four with that value.
- `LiveGarageTyres` gains `tread: [FL, FR, RL, RR]` from `parseSelectedTyres` (`wearValue` per wheel, 0–100; check the
  wheel order against a logged `TireManagement` body in a diagnostics sidecar before relying on it); `wear` stays
  the minimum.
- Each option projects every wheel; `treadAtFlag` and `lowest` are the minimum over wheels; add `treadCorner` (the
  wheel that sets it). The UI shows the corner beside the tread (`TREAD AT FLAG ~62 % RL`).
- Bump `LIVE_MODEL_VERSION` (plan formulas, `shared/domain/live/liveAudit.ts`). The fuel/VE forecast baseline does not
  change: leave `LIVE_BASELINE_MODEL_VERSION` alone.

### 1e. Evaluation tool (`tools/analysis/evaluateTyreWear.ts`, new, read-only)

Per cohort: fit without the newest session, predict its kept laps per wheel; print MAE and worst miss per wheel, and the
same for the old rule (the live plan's: the preceding session's worst-tread stint); then the garage plan's tread at the flag for that session
with old and new wear against the actual. Lists dropped laps with reasons. This is what the reviewer and the
`race-review` skill run.

### 1f. Tests (Phase 1)

- Regression anchor (lap numbering): Portimão race `73R1`, the impact at ~1059 s and the RL lockup at ~1074.8 s session
  time land in the same lap as the native RL loss of ~1.74 %. Fixture data extracted once with the tool into
  `test/fixtures/` (per-lap loss and slip arrays, a few KB), not the DuckDB files.
- `fitTyreWear` cases: slip-free laps (b null), clear slip slope, negative slope clamp, negative intercept refit,
  fewer than 8 laps, usual slip from race → practice → qualifying.
- Portimão garage plan: qualifying `52Q1` + earlier race `75R1` as history, the race's 12 laps → tread at the flag
  within 0.02 of the actual 0.944 (old rule 0.806).
- Lap filters: pit, out, lap 1, wet, puncture drop, new-tyre rise, capture gap.
- `planRaceStrategies` per wheel: the limiting corner changes with the stint; fallbacks fill four wheels.

### Phase 1 acceptance (reviewer)

`evaluateTyreWear.ts` on the stored data: on the Ginetta Portimão cohort the new MAE is below the old rule's on every
wheel and the race's predicted tread at the flag is within 0.02 of 0.944. No cohort gets worse than the old rule on its
worst wheel. Then the next race is reviewed with the `race-review` skill.

## Phase 2: live per-wheel tread from shared memory, one REST call less

**Gate: the practice validation.** Logging is already in place (uncommitted, 2026-10-25): every condition reply writes
`tyre-check` (REST `tireCondition` per wheel beside shared memory `mWear` per wheel, `lmu-fields.wear`) to the
diagnostics sidecar; `tools/analysis/checkLmuSharedMemory.ts` compares them as tread left, as wear done and against
the previous reading. The reviewer confirms from one practice: `mWear` is tread left (1 = new) or wear done, it matches
REST within 0.001, and whether REST lags it. Phase 2 starts only after that, with the result written here.

- `LiveCarReading` gains `tread: [FL, FR, RL, RR]` (decoded in `server/live/rf2Decode.ts` from `WHEEL.wear`, converted
  per the validation). Remove the raw `wear` from `lmu-fields` then.
- `LiveTyreTracker` (`shared/domain/live/liveCarCondition.ts`): one stint per wheel, fed at each crossing from the car
  reading instead of `worstTread(condition)`. The new-tyre reset and puncture rule apply per wheel as today.
  `wearPerLap` per wheel; `worst`/`worstCorner`/`wearPerLap` stay (the worst wheel) for the existing UI.
- `LiveTyres` gains `wheels: [{ corner, tread, wearPerLap }]`. `tyreCoverage` (`shared/domain/live/liveInsights.ts`)
  projects each wheel and reports the lowest (with its corner).
- `eventTyreWear` becomes per wheel.
- `server/live/liveService.ts` `followPlayer`: remove `if (player.totalLaps > before.totalLaps) this.pit.trigger('condition')`.
  Keep the pit-exit trigger, the impact trigger (`followCar`) and the poller's 5-minute read. Update the comment and
  `docs/LMU_REST_API.md` / `docs/plans/LIVE_DATA_SOURCES.md` where they describe the per-lap read.
- Remove the `tyre-check` diagnostic once the tracker no longer reads REST tread.
- Tests: tracker per wheel (one wheel's puncture does not reset the others), coverage picks the limiting wheel, the
  service no longer triggers the condition on a crossing but still does on pit exit and impact.

### Phase 2 acceptance (reviewer)

One practice or race with the new build: crossings make no `getVehicleCondition` call (diagnostics `rest` records),
the live per-wheel wear matches the native "Tyres Wear" after the session within 0.001 per lap, and the dashboard shows
the limiting corner.

## Not in scope

Wet tyre wear; tyre temperature or pressure effects; fresh-tyre pace in the race plan; two-tyre changes; storing
per-lap tyre data in SQLite (read on demand, like the strategy history); the debrief showing per-wheel wear (a later
follow-up if wanted).

## Docs to keep current

`docs/CODE_MAP.md` (new modules and the tool), [`LIVE_RACE_DASHBOARD.md`](LIVE_RACE_DASHBOARD.md) (tyre plan rule),
this plan's status line, and the plans [README](README.md) row.
