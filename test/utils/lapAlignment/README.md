# Lap comparison safety net

Regression harness for the lap comparison pipeline (telemetry channels, corner analysis,
map ghost / pedal markers / corner flags, corner consistency), run on real laps.

| File | Role |
|---|---|
| `lapPairFixture.ts` | Loads the fixtures and runs the same client pipeline the replay inspector runs |
| `lapAlignmentGolden.test.ts` | Characterization snapshot: **every** change in output shows up as a diff |
| `lapAlignmentInvariants.test.ts` | Properties that must hold whatever the implementation; known violations are listed with the phase that fixes them |

Fixtures (`test/fixtures/replays/*.json`) are captured with
`tools/analysis/captureLapPairFixture.ts` (usage in its header):

| Fixture | Class | Primary | Baseline | Why it is here |
|---|---|---|---|---|
| `daytona-r1-10-lap-pair` | Hypercar (Peugeot 9X8 vs Cadillac V-Series.R) | player lap 2, DuckDB 100 Hz (97.810) | Mack Pearmain lap 9, VCR (95.907) | Baseline's timing event lands 11.3 m after the line (remote timing latency); the server cuts it at the line |
| `sarthe-r1-41-lap-pair` | GT3 (Corvette vs Lexus) | player lap 4, DuckDB 100 Hz (249.940) | Richard Faber lap 3, VCR (239.249) | 13.6 km lap (5.7 m/sample); primary's timing slice starts 0.5 m **before** the line; primary is **stationary ~2 s in T5** (+10 s incident) |
| `bahrain-r1-10-lap-pair` | GT3 (BMW M4 vs Porsche 911 GT3 R) | player lap 10, DuckDB 100 Hz (120.837) | Harold Hooverson lap 4, VCR (120.301) | Small Δ (0.536 s); baseline's timing event lands 8.9 m after the line |
| `spa-r1-38-lap-pair` | GTE (Aston Vantage vs Porsche RSR-19) | player lap 3, DuckDB 100 Hz (140.067) | Gabriel Neves lap 4, VCR (140.413) | Primary **faster** (negative Δ); primary's slice starts before the line, baseline's timing event lands 14.9 m after it |

Since phase 4 the server cuts every lap of a recognised track exactly at the start/finish line
(`server/tracks/lapLineCut.ts`), using the recording of the neighbouring laps stored in the
cache, so every fixture lap starts at station 0 and ends at the track length.
Laps are reduced to the requested resolution by `server/replay/trajectoryDownsampler.ts`
(Visvalingam-Whyatt over pedals and speed): at 2400 points the pedal points of the four pairs
match the full-resolution lap within 2 m (9 m once, Spa), except the Le Mans T13 baseline
throttle pick-up, which no 2400-point reduction keeps.

The client still extrapolates up to 25 m at the lap edges (`computeStartFinishOffset`,
`interpolateScalarAtDistance(..., true)`): real laps no longer need it, but I3 (a recording
that starts late, e.g. an unknown-layout or uncut lap) does.

## Rules

- A golden snapshot diff must be explained in the commit that causes it. A refactor produces none.
  Update with `npx vitest run -u test/utils/lapAlignment`, after reviewing the diff.
- When a fix makes a known invariant violation hold, its `it.fails` fails: remove the entry
  from `KNOWN_VIOLATIONS` in the same commit.
- Never loosen an invariant tolerance to make a change pass.

## Invariants

| # | Property |
|---|---|
| I0 | Final channel Δ = official lap-time Δ (±0.02 s) |
| I1 | Segment Δs add up to the lap Δ |
| I2 | Pedal points sit where the channel crosses the threshold, and the map draws them there |
| I3 | Trimming the first 10 m of the baseline recording changes nothing |
| I4 | Swapping the laps flips the Δ sign |
| I5 | Halving the resolution with the server downsampler keeps pedal points within one sample |
| I6 | Samples recorded before the S/F line change nothing |
| I7 | Corner flags don't move when a comparison lap is added |

## Manual checklist (after each phase)

Open each of these and check: the ghost sits on the S/F line at the first frame; the T4
(Daytona) / Mulsanne chicanes (Le Mans) brake markers match the brake trace on the pedal
channel; the first and last segments' Δ; the final Δ vs the lap times; corner flags stay put
when toggling the comparison lap.

- Daytona: `http://localhost:5173/#/telemetry?replayName=Daytona+International+Speedway+Road+Course+R1+10.Vcr&lap=2&baselineReplay=Daytona+International+Speedway+Road+Course+R1+10.Vcr&compareDriver=Mack+Pearmain&compareLapNum=9`
- Le Mans: `http://localhost:5173/#/telemetry?replayName=Circuit+de+la+Sarthe+R1+41.Vcr&lap=4&baselineReplay=Circuit+de+la+Sarthe+R1+41.Vcr&compareDriver=Richard+Faber&compareLapNum=3`
- Le Mans, cross-session baseline (the original selector bug): `http://localhost:5173/#/telemetry?replayName=Circuit+de+la+Sarthe+R1+41.Vcr&lap=4&baselineReplay=Circuit+de+la+Sarthe+R1+27.Vcr&compareSessionId=2026_09_03_14_41_14-69R1&compareDriver=Andrzej+Nycz&compareLapNum=4`
- Also switch the telemetry resolution between 1200 and 2400 on one of them.
