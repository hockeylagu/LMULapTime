# Live wetness projection (proposal)

Proposed 2026-11-11 after the Le Mans wet races. Nothing here is built.

## Outcome

The dashboard tells the driver ahead of time when the track will change state, not only once it has: "WET IN ~7 MIN" when
rain starts, "DAMP ~LAP 14, NOT DRY BY THE FLAG" once it stops. The tyre crossover can then fold a change into a planned
stop, and lap time and fuel use can follow the projected wetness instead of trailing it. Deterministic: measured
step timings, no AI.

## What the game gives

- Path wetness (`minPathWetness`, `avgPathWetness`, `maxPathWetness`) comes only in steps, in every source (shared
  memory, REST, native telemetry): 0, 0.05 Damp, 0.125 Slightly wet, 0.4 Wet, 0.6 Very wet, 1.0 Extremely wet. Nothing
  finer exists, so the projection works in time between steps.
- Rain (`raining`) is continuous. The live dashboard reads it raw; the recorder stores it rounded to 0.05
  (`server/live/capture/controller.ts`, `track-surface`), which hides the intensity the wetting rate depends on.
- The forecast (REST `sessions/weather`, `liveForecast.ts`) gives rain chance per node: when rain may come or stop.
- Cloud is not available live (`darkCloud` and the native `CloudDarkness` stay 0 in a storm); the replay has the cloud
  field after the session. Not an input here.

## Evidence (live captures, `track-surface`)

Wetting, Daytona 2026-11-05 (time from each rain change; race 1 / race 2):

| Rain (stored) | Step | Race 1 | Race 2 |
|---|---|---|---|
| 0.05 | Damp on the wettest part (max) | +122 s | +157 s |
| | Damp on average | +141 s | +213 s |
| | Damp everywhere (min) | +160 s | +280 s |
| 0.15 | 0.125 max / average | 0 / +66 s | +73 / +106 s |
| | 0.4 max / average | +260 / +449 s | +291 / +409 s |
| | 0.6 max | +889 s | rain eased first |

Drying, Le Mans 2026-11-10 / 11-11 (time from the rain stopping, 1399 / 1386 s; track 14-15 °C):

| Step (average) | 11-10 | 11-11 |
|---|---|---|
| 0.6 → 0.4 | at the stop | +41 s |
| 0.4 → 0.125 | +806 s | +869 s |
| 0.125 → 0.05 | +1734 s | +1807 s |
| 0.05 → 0 | not by the flag (+2680 s) | not by the flag (+2690 s) |

The wettest part leads when wetting and lags when drying; the driest part read 0 all race at Le Mans, even in rain.
Lap times kept improving between drying steps (about 240 → 226 s) and fuel use rose with them, about +0.03 L for each
second gained (Oreca, 11-10). Two races per direction, one track and one weather preset each: enough for a starting
table, not for thresholds.

## Design

**State.** `LiveWetnessProjection` in `shared/domain/live/` follows each scoring reading: the three wetness steps, when
each last changed, and the rain (raw, smoothed over about 10 s) with the time it last crossed a rain bucket.

**Direction.** Wetting while rain is above the current step's holding level; drying once rain is 0 and the forecast
has no rain before the next node (`nextForecastChange`). Otherwise steady, and no projection.

**Step durations.** A table of seconds per average step, by direction and, for wetting, by rain bucket (light up to
about 0.1, heavier above), seeded from the evidence above. The next step is due at its duration less the time already
spent on the current step (never below "due"); later steps chain on. Each projected time comes with a range from the
spread of the examples (±60-100 s now) and widens per chained step.

**Outputs** (`LiveStrategy.wetnessProjection`): direction, the next average step and its time, the times to Slightly wet
(0.125, the wets advice) and to dry (0, the slicks advice), each null when beyond the flag, and the lap they fall on
from the race plan's pace. "Not by the flag" is an answer, not a missing value.

**Crossover** (`liveTyreCrossover.ts`). The current rule stays the trigger. The projection adds timing: a change
projected within `CROSSOVER_MERGE_LAPS` of a planned stop goes into that stop; a change projected after the flag says
"keep" at the stop (both Le Mans races: wets held at the lap 11-12 stop; the three LMP2 cars on Mediums lost 8-15 s a
lap).

**Pace and fuel** (later). While drying, the expected lap time follows the step clock; laps left and the fuel per lap
use it (11-10: 13 laps left shown at lap 2, 16 run; the last stint used 2 % more than measured and ended 0.03 lap
under the reserve). Needs the lap time per step at a layout first.

## Phases

1. **Data.** Record rain unrounded, a row when it moves by 0.01 or more (`controller.ts`; format in
   `LIVE_CAPTURE_FORMAT.md`). Add `tools/analysis/listWetnessSteps.ts`: per recording the step times of min/avg/max
   from each rain change, as the tables above. The race-review weather section reads it.
2. **Projection.** The class and table above, shown as an estimate on the weather cell (next step and time). Unit
   tests from the four races replay each recording's readings and check the projected times against the observed ones.
3. **Crossover timing.** Merge or "keep" at the planned stop from the projection; demo scenarios for both directions.
   Bump `LIVE_MODEL_VERSION`.
4. **Pace and fuel.** Lap time per step per layout and class from stored laps; laps left and fuel per lap from the
   projected pace. Only after phase 2 holds over several wet races.

## Learning

Start with the fixed table in code, updated through race reviews when several races agree. Per-layout durations
(track temperature, sun) once three or more wet races at a layout are recorded; automatic fitting through the existing
learning gates only after that, never replacing the table without a held-out check.

## Open questions

- Track temperature and time of day: does a warmer track dry faster? Le Mans was 14-15 °C only.
- The holding level per rain intensity: Damp held under 0.05 rain at Daytona (4-5 min), 0.6 under 0.15 at Le Mans
  (15 min). Where does each rain level stop wetting?
- Is the projection worth showing before phase 3, or only once it drives the crossover?
- Online vs offline weather: same step clock?

## Acceptance

Each wet race review lists projected against observed step times (phase 2 within the stated range on the reviewed
race), the crossover timing against the class's actual compound choices, and the projection's first appearance after
each rain change.
