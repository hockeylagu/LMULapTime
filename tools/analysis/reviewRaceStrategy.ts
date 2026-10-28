import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

// Read-only race review: the strategy boxes of each race recording (laps planned vs run, formation lap use, stops,
// fuel/VE left at the flag against the reserve), from the recording's scoring rows and strategy audit checkpoints.
// Usage: tsx tools/analysis/reviewRaceStrategy.ts <recording filename part, e.g. 2026-10-28> [captureDirectory]
const filter = process.argv[2] ?? '';
const directory = path.resolve(process.argv[3] ?? path.join('server', 'live-captures'));

interface Scoring { lapNumber: number; gamePhase: number; inPits: boolean }
interface Audit {
  snapshot?: { strategy?: { resource?: { perLap?: number | null; reserveLaps?: number | null; unit?: string };
    garage?: { laps?: number | null; reserveLaps?: number | null; raceStrategy?: { laps?: number; chosen?: { stops?: number; pitLap?: number | null } } } } };
  observation?: { fuel?: { amount: number } | null; ve?: { amount: number } | null; fuelNowLitres?: number | null; veNowPercent?: number | null };
}
const round = (value: number | null | undefined, digits = 2): string => value == null ? '-' : value.toFixed(digits);
const mean = (values: number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.live.duckdb') && name.includes('_race_') && name.includes(filter)).sort()) {
  const instance = await DuckDBInstance.create(path.join(directory, filename), { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    const read = async <T>(kind: string) => ((await connection.runAndReadAll(`SELECT elapsed_seconds, CAST(data AS VARCHAR) AS data
      FROM capture_observations WHERE kind='${kind}' ORDER BY elapsed_seconds`)).getRowObjectsJson() as Array<{ elapsed_seconds: number; data: string }>)
      .map(row => ({ et: Number(row.elapsed_seconds), data: JSON.parse(row.data) as T }));
    const scoring = await read<Scoring>('scoring');
    const audits = await read<Audit>('strategy-audit-v1');
    const formation = scoring.find(row => row.data.gamePhase === 3)?.et ?? null;
    const green = scoring.find(row => row.data.gamePhase === 5)?.et ?? null;
    const amountsAt = (et: number | null, before: boolean) => {
      if (et === null || !Number.isFinite(et) && !before) return null;
      const rows = audits.filter(row => row.data.observation?.fuelNowLitres != null && (before ? row.et <= et : row.et >= et));
      return (before ? rows[rows.length - 1] : rows[0])?.data.observation ?? null;
    };
    const plan = audits.find(row => row.data.snapshot?.strategy?.garage?.laps != null)?.data.snapshot?.strategy?.garage;
    const fuelLaps = mean(audits.flatMap(row => row.data.observation?.fuel ? [row.data.observation.fuel.amount] : []));
    const veLaps = mean(audits.flatMap(row => row.data.observation?.ve ? [row.data.observation.ve.amount] : []));
    const lapsRun = Math.max(0, ...scoring.map(row => row.data.lapNumber)) - 1;
    // The flag is the last line crossing: the drive back to the garage after it is not a stop.
    const flag = scoring.find(row => row.data.lapNumber === lapsRun + 1)?.et ?? Infinity;
    const last = amountsAt(flag, true);
    const stops = scoring.filter((row, index) => green !== null && row.et > green && row.et < flag
      && row.data.inPits && !scoring[index - 1]?.data.inPits).length;
    const start = amountsAt(formation, true);
    const atGreen = amountsAt(green, false);

    console.log(`\n${filename.slice(0, 60)}`);
    console.log(`  laps     planned ${plan?.raceStrategy?.laps ?? '-'} racing (+ formation: ${plan?.laps ?? '-'}), run ${lapsRun}`);
    console.log(`  stops    planned ${plan?.raceStrategy?.chosen?.stops ?? '-'}${plan?.raceStrategy?.chosen?.pitLap ? ` (lap ${plan.raceStrategy.chosen.pitLap})` : ''}, made ${stops}`);
    console.log(`  formation fuel ${round(start?.fuelNowLitres)} -> ${round(atGreen?.fuelNowLitres)} L`
      + ` (${fuelLaps && start?.fuelNowLitres != null && atGreen?.fuelNowLitres != null ? round((start.fuelNowLitres - atGreen.fuelNowLitres) / fuelLaps) : '-'} lap),`
      + ` VE ${round(start?.veNowPercent, 1)} -> ${round(atGreen?.veNowPercent, 1)} %`);
    console.log(`  per lap  fuel ${round(fuelLaps, 3)} L, VE ${round(veLaps, 3)} % (measured laps, mean)`);
    console.log(`  at flag  fuel ${round(last?.fuelNowLitres)} L = ${fuelLaps && last?.fuelNowLitres != null ? round(last.fuelNowLitres / fuelLaps) : '-'} laps,`
      + ` VE ${round(last?.veNowPercent)} % = ${veLaps && last?.veNowPercent != null ? round(last.veNowPercent / veLaps) : '-'} laps; reserve ${plan?.reserveLaps ?? '-'} lap`);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
