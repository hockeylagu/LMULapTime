/**
 * How much the lap comparison changes when laps are served at fewer points than recorded.
 * Fetches the four fixture lap pairs (test/utils/lapAlignment/README.md) at full resolution
 * from the running API server, reduces each lap with the server's own downsampler
 * (selectFeatureSamples, what `/trajectory?maxPoints=N` does) to each candidate budget, and
 * runs the replay inspector's comparison pipeline on both. Reports, per pair and budget, the
 * worst pedal-point error against full resolution, the pedal points found at one resolution and
 * not the other, the worst corner time-delta error and the final delta error. Read-only.
 *
 * Usage (server running on :3001):
 *   npx tsx tools/analysis/measureLapDensity.ts [budget,...]
 * A budget is a point count ("2400") or a spacing in metres ("2m": track length / 2 points).
 * Default: 2400,4m,3m,2m,1.5m,1m
 */
import { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../shared/types/index.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { selectFeatureSamples } from '../../server/replay/trajectoryDownsampler.js';
import { applyTelemetryPostProcessing } from '../../src/utils/telemetryPostProcessing.js';
import { computeLapComparisons } from '../../src/utils/replayComparison.js';
import { computeLapSegmentComparisons, CornerSegmentComparison, LapSegmentComparison } from '../../src/utils/cornerAnalysis/index.js';

const API = 'http://localhost:3001/api/replays';

interface LapRef { replay: string; lap: number; driver?: string; source: 'duckdb' | 'vcr' }
const PAIRS: Array<{ name: string; primary: LapRef; baseline: LapRef }> = [
  {
    name: 'Daytona',
    primary: { replay: 'Daytona International Speedway Road Course R1 10.Vcr', lap: 2, source: 'duckdb' },
    baseline: { replay: 'Daytona International Speedway Road Course R1 10.Vcr', lap: 9, driver: 'Mack Pearmain', source: 'vcr' },
  },
  {
    name: 'Le Mans',
    primary: { replay: 'Circuit de la Sarthe R1 41.Vcr', lap: 4, source: 'duckdb' },
    baseline: { replay: 'Circuit de la Sarthe R1 41.Vcr', lap: 3, driver: 'Richard Faber', source: 'vcr' },
  },
  {
    name: 'Bahrain',
    primary: { replay: 'Bahrain International Circuit R1 10.Vcr', lap: 10, source: 'duckdb' },
    baseline: { replay: 'Bahrain International Circuit R1 10.Vcr', lap: 4, driver: 'Harold Hooverson', source: 'vcr' },
  },
  {
    name: 'Spa',
    primary: { replay: 'Circuit de Spa-Francorchamps R1 38.Vcr', lap: 3, source: 'duckdb' },
    baseline: { replay: 'Circuit de Spa-Francorchamps R1 38.Vcr', lap: 4, driver: 'Gabriel Neves', source: 'vcr' },
  },
];

async function fetchFullLap(ref: LapRef): Promise<ReplayTrajectoryData> {
  const driver = ref.driver ? `&driverName=${encodeURIComponent(ref.driver)}` : '';
  const url = `${API}/${encodeURIComponent(ref.replay)}/trajectory?maxPoints=0&lap=${ref.lap}&source=${ref.source}${driver}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const data = (await res.json()) as ReplayTrajectoryData;
  if (data.currentLap !== ref.lap) throw new Error(`asked lap ${ref.lap}, got ${data.currentLap} (${ref.replay})`);
  return data;
}

function budgetPoints(budget: string, trackLengthM: number): number {
  return budget.endsWith('m') ? Math.ceil(trackLengthM / Number(budget.slice(0, -1))) : Number(budget);
}

function reduce(points: ReplayTrajectoryPoint[], budget: number): ReplayTrajectoryPoint[] {
  return budget >= points.length ? points : selectFeatureSamples(points, budget).map(i => points[i]);
}

const PEDAL_FIELDS = ['primaryBrakingDistM', 'primaryThrottleOnDistM', 'baselineBrakingDistM', 'baselineThrottleOnDistM'] as const;

function compareToFull(full: LapSegmentComparison[], reduced: LapSegmentComparison[]) {
  const corners = (s: LapSegmentComparison[]) => new Map(s.filter((c): c is CornerSegmentComparison => c.type === 'corner').map(c => [c.cornerNumber, c]));
  const fullCorners = corners(full);
  const reducedCorners = corners(reduced);
  let worstPedalM = 0;
  let worstPedal = '';
  let pedalsLost = 0;
  let pedalsGained = 0;
  let worstCornerDeltaSec = 0;
  for (const [n, f] of fullCorners) {
    const r = reducedCorners.get(n);
    if (!r) continue;
    worstCornerDeltaSec = Math.max(worstCornerDeltaSec, Math.abs(f.timeDeltaSec - r.timeDeltaSec));
    for (const field of PEDAL_FIELDS) {
      const a = f[field];
      const b = r[field];
      if (a !== null && b === null) pedalsLost++;
      else if (a === null && b !== null) pedalsGained++;
      else if (a !== null && b !== null && Math.abs(a - b) > worstPedalM) {
        worstPedalM = Math.abs(a - b);
        worstPedal = `T${n} ${field.replace('DistM', '')}`;
      }
    }
  }
  return { cornersFull: fullCorners.size, cornersReduced: reducedCorners.size, worstPedalM, worstPedal, pedalsLost, pedalsGained, worstCornerDeltaSec };
}

async function main() {
  const budgets = (process.argv[2] ?? '2400,4m,3m,2m,1.5m,1m').split(',');
  for (const pair of PAIRS) {
    const [p, b] = await Promise.all([fetchFullLap(pair.primary), fetchFullLap(pair.baseline)]);
    const trackLengthM = p.trackLengthM ?? 0;
    const nominalWidthM = p.layoutKey ? getCircuitSpecification(p.layoutKey).nominalWidthM : undefined;
    const run = (primary: ReplayTrajectoryPoint[], baseline: ReplayTrajectoryPoint[]) => {
      const pp = applyTelemetryPostProcessing(primary);
      const bp = applyTelemetryPostProcessing(baseline);
      const comparisons = computeLapComparisons(pp, bp, trackLengthM);
      return {
        segments: computeLapSegmentComparisons(pp, bp, 6, trackLengthM, nominalWidthM),
        finalDeltaSec: comparisons[comparisons.length - 1]?.deltaTimeSec ?? NaN,
      };
    };
    const full = run(p.points, b.points);
    console.log(`\n${pair.name} (${trackLengthM} m): full ${p.points.length} + ${b.points.length} pts, final Δ ${full.finalDeltaSec.toFixed(3)} s`);
    console.log('  budget          pts (P + B)   corners   worst pedal         lost/extra   worst corner Δ   final Δ err');
    for (const budget of budgets) {
      const n = budgetPoints(budget, trackLengthM);
      const primary = reduce(p.points, n);
      const baseline = reduce(b.points, n);
      const reduced = run(primary, baseline);
      const c = compareToFull(full.segments, reduced.segments);
      console.log(
        `  ${budget.padEnd(6)} ${String(n).padStart(6)}  ${`${primary.length} + ${baseline.length}`.padStart(13)}   ${`${c.cornersReduced}/${c.cornersFull}`.padStart(7)}   ` +
        `${`${c.worstPedalM.toFixed(1)} m ${c.worstPedal}`.padEnd(18)}  ${`${c.pedalsLost}/${c.pedalsGained}`.padStart(10)}   ` +
        `${(c.worstCornerDeltaSec * 1000).toFixed(0).padStart(10)} ms   ${(Math.abs(reduced.finalDeltaSec - full.finalDeltaSec) * 1000).toFixed(0).padStart(8)} ms`
      );
    }
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
