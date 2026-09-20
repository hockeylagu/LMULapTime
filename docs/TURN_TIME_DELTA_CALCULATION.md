# 🏎️ Turn Time Delta vs. Telemetry Delta: Canonical Station Alignment Plan

This document details the mathematical mechanics, root cause investigation, and future implementation plan for aligning **Corner Analysis Turn Time Deltas** with the **Telemetry Strip Delta Trace**.

---

## 1. Problem Statement & Symptoms

When comparing a primary lap against a baseline lap in the Replay Inspector:
- **Telemetry Strip Delta Channel**: Shows running cumulative time delta ($\Delta t_{\text{lap}}$) at each frame.
- **Corner Strip & Corner Tables**: Show isolated corner delta ($\Delta t_{\text{turn}}$).

### Case Study: Daytona Road Course (Samuel Lague, R1 Lap 10 vs. Q1 Lap 4)
- **`T4 IN` (Entry, Frame 1019)**: Running lap delta was **`+0.006s`** (primary driver was 0.006s behind baseline).
- **`T4 OUT` (Exit, Frame 1667)**: Running lap delta was **`+0.620s`** (primary driver was 0.620s behind baseline).
- **Actual Time Lost Across Turn 4 in Telemetry**:
  $$\Delta t_{\text{turn, telemetry}} = +0.620\text{s} - (+0.006\text{s}) = \mathbf{+0.614\text{s}}$$
- **Corner Button & Analysis Card Display**: Displayed **`+0.72s`** (calculated internally as **`+0.725s`**).

**Discrepancy**: A phantom error of **`+0.111s`** between the telemetry delta curve and the corner summary card.

---

## 2. Root Cause: Coordinate Space Mismatch

The discrepancy is caused by comparing cars in two **different coordinate spaces**:

```
+------------------------------------------------------------------------------------------------+
| Telemetry Chart (replayComparison.ts):                                                         |
| Matches points using CANONICAL CENTERLINE STATION (s in meters via stationM)                   |
| -> Both cars sampled at the EXACT same physical track location (s = 2035.2m to s = 3683.2m)    |
| -> Primary elapsed: 29.200s, Baseline elapsed: 28.586s                                        |
| -> Net Delta = 29.200s - 28.586s = +0.614s                                                    |
+------------------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------------------+
| Corner Analysis (cornerAnalysis.ts):                                                           |
| Matches points using TRAJECTORY ODOMETER DISTANCE (d in meters via distM)                      |
| -> Samples baseline car at d = 2037m and d = 3664m along BASELINE's driven trajectory          |
| -> Because lines differed through T1-T3 (infield), baseline odometer drifted by tens of meters |
| -> Baseline sampled at WRONG physical track spot (exited early): Baseline elapsed = 28.473s    |
| -> Fabricated Delta = 29.198s - 28.473s = +0.725s (+0.72s)                                    |
+------------------------------------------------------------------------------------------------+
```

### Why Odometer Distance (`distM`) Drifts
1. `distM` measures cumulative distance traveled along the driver's specific trajectory:
   $$d = \sum \sqrt{\Delta x^2 + \Delta z^2}$$
2. In tight infield sections (e.g. Daytona Turns 1–3), taking an apex tighter or swinging wide changes the total path length by 10–30 meters.
3. By the time cars reach Turn 4:
   - Primary car has driven $2037\text{m}$.
   - Baseline car reached the same physical track entrance at a different odometer reading.
4. Sampling the baseline car at $d = 2037\text{m}$ looks up the baseline car at a different physical gate, creating an artificial timing offset.

---

## 3. Empirical Verification Data

Inspecting high-resolution downsampled replay frames (2,400 points) on `Daytona International Speedway Road Course R1 8.Vcr` (Lap 10) vs `Daytona International Speedway Road Course Q1 8.Vcr` (Lap 4):

| Metric | Using Odometer Distance (`distM`) | Using Canonical Station (`stationM`) | Telemetry Chart (`pointComparisons`) |
| :--- | :---: | :---: | :---: |
| **T4 Entry Delta** | `+0.060s` | `+0.004s` | **`+0.006s`** |
| **T4 Exit Delta** | `+0.785s` | `+0.618s` | **`+0.620s`** |
| **T4 Isolated Delta** | **`+0.725s` (`+0.72`)** | **`+0.614s` (`+0.61` / `+0.62`)** | **`+0.614s`** |
| **Primary Time in T4** | `29.198s` | `29.200s` | `29.200s` |
| **Baseline Time in T4** | `28.473s` *(inaccurate position)* | `28.586s` *(exact station)* | `28.586s` |

When canonical station matching (`stationM`) is applied to corner analysis, the corner delta matches the telemetry scrubber to within **$0.001\text{s}$**.

---

## 4. Implementation Specification

### 4.1 Target File: `src/utils/cornerAnalysis.ts`

In `computeLapSegmentComparisons`:
```typescript
export function computeLapSegmentComparisons(
  primaryPoints: ReplayTrajectoryPoint[],
  baselinePoints: ReplayTrajectoryPoint[],
  minProminenceKmh = 6,
  trackLengthM?: number
): LapSegmentComparison[]
```

#### Step 1: Detect Canonical Station Availability
Check if canonical centerline stations are available on both primary and baseline points:
```typescript
const canMatchByStation =
  Boolean(trackLengthM && trackLengthM > 0) &&
  primaryPoints[0]?.stationM !== undefined &&
  baselinePoints[0]?.stationM !== undefined;

let primaryRefCoords: number[];
let baselineRefCoords: number[];

if (canMatchByStation && trackLengthM) {
  primaryRefCoords = getMonotonicStations(primaryPoints, trackLengthM);
  baselineRefCoords = getMonotonicStations(baselinePoints, trackLengthM);
} else {
  primaryRefCoords = primaryDists;
  baselineRefCoords = baselineDists;
}
```

#### Step 2: Update `deltaAt` Lookup Function
Update `deltaAt` to look up points using the canonical reference coordinates:
```typescript
const deltaAt = (stationOrDistM: number): number => {
  const p = interpolatePointAtDistance(primaryPoints, primaryRefCoords, stationOrDistM);
  const b = interpolatePointAtDistance(baselinePoints, baselineRefCoords, stationOrDistM);
  return p.timeSec - b.timeSec;
};
```

#### Step 3: Map Segment Boundaries to Station Space
When `canMatchByStation` is true, convert the corner turning point boundaries (`entry.distM`, `exit.distM`) to canonical station space before querying `deltaAt`:
```typescript
const entryCoord = canMatchByStation ? primaryRefCoords[entry.index] : entry.distM;
const exitCoord = canMatchByStation ? primaryRefCoords[exit.index] : exit.distM;
const timeDeltaSec = Number((deltaAt(exitCoord) - deltaAt(entryCoord)).toFixed(3));
```

#### Step 4: Backward Compatibility & Fallback
If `stationM` is absent (e.g. tracks without physical survey boundaries in `server/data/tracks/`), the algorithm automatically falls back to `primaryDists` and `baselineDists`.

---

## 5. UI Tooltip Clarification Enhancement

In addition to the mathematical alignment, enhance the UI to make the relationship between isolated turn delta and running lap delta explicit:

### In `src/components/replay/telemetry/TelemetryCornerStrip.tsx`:
Update button `title` / tooltip:
```typescript
title={`Turn ${c.cornerNumber}: ${isCompareMode ? `Delta ${c.timeDeltaSec > 0 ? '+' : ''}${c.timeDeltaSec.toFixed(2)}s (Running: ${entryDelta >= 0 ? '+' : ''}${entryDelta.toFixed(2)}s → ${exitDelta >= 0 ? '+' : ''}${exitDelta.toFixed(2)}s)` : `${c.primaryTimeSec.toFixed(2)}s`}`}
```

---

## 6. Verification Checklist for Implementation

- [ ] `npm test test/utils/cornerAnalysis.test.ts` passes with zero regressions.
- [ ] `npm test test/components/CornerSpeedTable.test.tsx` passes with zero regressions.
- [ ] `npm test test/components/TelemetryStripCharts.test.tsx` passes with zero regressions.
- [ ] Daytona Road Course R1 Lap 10 vs Q1 Lap 4 displays Turn 4 delta matching the scrub line (`+0.61s` / `+0.62s`).
- [ ] Production build (`npm run build`) compiles with zero TypeScript errors and zero warnings.
