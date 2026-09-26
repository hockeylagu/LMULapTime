/**
 * Captures a real primary/baseline lap pair from the running API server into a compact
 * columnar fixture for the lap-comparison golden and invariant tests
 * (test/utils/lapAlignment/). Only the channels the comparison pipeline reads are kept.
 *
 * Usage (server running on :3001):
 *   npx tsx tools/analysis/captureLapPairFixture.ts <fixture-name> \
 *     "<replay>" <lap> "<driver or ->" "<source: duckdb|vcr>" \
 *     "<baseline replay>" <lap> "<driver>" "<source>" [maxPoints=2400]
 *
 * Example (the fixtures currently checked in):
 *   npx tsx tools/analysis/captureLapPairFixture.ts daytona-r1-10-lap-pair \
 *     "Daytona International Speedway Road Course R1 10.Vcr" 2 - duckdb \
 *     "Daytona International Speedway Road Course R1 10.Vcr" 9 "Mack Pearmain" vcr
 *   npx tsx tools/analysis/captureLapPairFixture.ts sarthe-r1-41-lap-pair \
 *     "Circuit de la Sarthe R1 41.Vcr" 4 - duckdb \
 *     "Circuit de la Sarthe R1 41.Vcr" 3 "Richard Faber" vcr
 *
 * A driver of "-" means the configured player. Both laps must be the same car class (a
 * comparison is only meaningful within a class); the capture is refused otherwise. Re-capturing changes the golden snapshot:
 * review the diff, then run `npx vitest run -u test/utils/lapAlignment`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReplayDriverEntry, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../shared/types/index.js';
import { mapVehicleIdToClass } from '../../shared/domain/vehicleMapping.js';

const API = 'http://localhost:3001/api/replays';
const FIELDS: Array<keyof ReplayTrajectoryPoint> = [
  'x', 'y', 'z', 'timeSec', 'distM', 'stationM', 'lateralOffsetM', 'speedKmh', 'throttle', 'brake',
  'steerYaw', 'gear', 'rotY', 'accelLatG', 'accelLonG', 'accelTotalG', 'absActive', 'tcActive', 'isOffTrack', 'isTeleport',
];

interface LapRequest {
  replay: string;
  lap: number;
  driver: string;
  source: string;
}

async function fetchCarClass(req: LapRequest): Promise<string> {
  const res = await fetch(`${API}/${encodeURIComponent(req.replay)}/metadata`);
  if (!res.ok) throw new Error(`${res.status} for ${req.replay} metadata`);
  const meta = (await res.json()) as { drivers?: ReplayDriverEntry[] };
  const entry = meta.drivers?.find(d => (req.driver === '-' ? d.isPlayer : d.name === req.driver));
  if (!entry) throw new Error(`driver ${req.driver} not found in ${req.replay}`);
  return entry.carClass || mapVehicleIdToClass(entry.vehicleId, entry.carModel);
}

async function fetchLap(req: LapRequest, maxPoints: number) {
  const carClass = await fetchCarClass(req);
  const driver = req.driver === '-' ? '' : `&driverName=${encodeURIComponent(req.driver)}`;
  const url = `${API}/${encodeURIComponent(req.replay)}/trajectory?maxPoints=${maxPoints}&lap=${req.lap}&source=${req.source}${driver}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const data = (await res.json()) as ReplayTrajectoryData;
  if (data.currentLap !== req.lap) throw new Error(`asked lap ${req.lap} of ${req.driver}, server returned lap ${data.currentLap}`);
  const lap = data.laps?.find(l => l.lapNumber === data.currentLap);
  if (!lap || !data.trackLengthM) throw new Error(`lap ${req.lap} has no lap time or track length`);

  const columns: Record<string, Array<number | null>> = {};
  for (const field of FIELDS) {
    if (!data.points.some(p => p[field] !== undefined)) continue;
    columns[field] = data.points.map(p => {
      const value = p[field];
      if (typeof value === 'boolean') return value ? 1 : 0;
      return typeof value === 'number' ? value : null;
    });
  }
  return {
    replayName: data.replayName,
    driverName: data.driverName,
    carClass,
    source: data.source ?? 'vcr',
    currentLap: data.currentLap,
    lapTimeSec: lap.lapTimeSec,
    layoutKey: data.layoutKey,
    trackLengthM: data.trackLengthM,
    maxPoints,
    columns,
  };
}

async function main() {
  const [name, pReplay, pLap, pDriver, pSource, bReplay, bLap, bDriver, bSource, max] = process.argv.slice(2);
  if (!name || !bSource) {
    console.log('See usage at the top of tools/analysis/captureLapPairFixture.ts');
    process.exit(1);
  }
  const maxPoints = Number(max ?? 2400);
  const primary = await fetchLap({ replay: pReplay, lap: Number(pLap), driver: pDriver, source: pSource }, maxPoints);
  const baseline = await fetchLap({ replay: bReplay, lap: Number(bLap), driver: bDriver, source: bSource }, maxPoints);
  if (primary.carClass !== baseline.carClass) {
    throw new Error(`refusing a cross-class pair: ${primary.driverName} is ${primary.carClass}, ${baseline.driverName} is ${baseline.carClass}`);
  }

  const toolsDir = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(toolsDir, '../../test/fixtures/replays', `${name}.json`);
  fs.writeFileSync(out, JSON.stringify({ primary, baseline }));
  console.log(`${out} [${primary.carClass}]: ${primary.driverName} lap ${primary.currentLap} (${primary.lapTimeSec}s) vs ${baseline.driverName} lap ${baseline.currentLap} (${baseline.lapTimeSec}s), ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
