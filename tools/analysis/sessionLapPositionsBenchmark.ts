import { performance } from 'node:perf_hooks';
import { lapClassPosition, lapClassPositions } from '../../shared/domain/lapPlaces.js';
import type { DetailedSession, DriverData, LapData } from '../../shared/types/index.js';

// Synthetic rank-work benchmark, not browser render time. Run with:
// node --import tsx tools/analysis/sessionLapPositionsBenchmark.ts

const drivers = Array.from({ length: 60 }, (_, i) => ({
  name: `Driver ${i}`, carClass: i % 2 ? 'GT3' : 'Hyper',
  laps: Array.from({ length: 180 }, (_, j) => ({ lapNum: j + 1, position: (i + j) % 60 + 1 } as LapData)),
} as DriverData));
const session = { drivers } as DetailedSession;
const selected = drivers[1];
function baseline() {
  const laps = [...selected.laps];
  laps.sort((a, b) => lapClassPosition(session, selected, a, true) - lapClassPosition(session, selected, b, true));
  for (let i = 0; i < selected.laps.length; i++) {
    const lap = selected.laps[i];
    for (let repeat = 0; repeat < 3; repeat++) {
      lapClassPosition(session, selected, lap, true);
      if (i > 0) lapClassPosition(session, selected, selected.laps[i - 1], true);
    }
  }
}
function measure(label: string, fn: () => void) {
  for (let i = 0; i < 5; i++) fn();
  const samples = Array.from({ length: 30 }, () => { const start = performance.now(); fn(); return performance.now() - start; }).sort((a, b) => a - b);
  console.log(`${label}: median ${samples[15].toFixed(2)} ms; p95 ${samples[28].toFixed(2)} ms (60 drivers, 180 laps, 30 runs)`);
}
measure('Original class-rank work', baseline);
measure('Indexed class-rank work', () => {
  const positions = lapClassPositions(session, selected, true);
  [...selected.laps].sort((a, b) => (positions.get(a) ?? 0) - (positions.get(b) ?? 0));
  for (let i = 0; i < selected.laps.length; i++) {
    for (let repeat = 0; repeat < 3; repeat++) {
      positions.get(selected.laps[i]);
      if (i > 0) positions.get(selected.laps[i - 1]);
    }
  }
});
