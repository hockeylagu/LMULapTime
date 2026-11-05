import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

// Read-only race review: what the live dashboard told the driver, as one line per change of the advice in the
// recording's strategy audit checkpoints (VE/fuel rate and source, laps left, pit lap and load, fuel ratio, pit state,
// tyre crossover, forecast, battery deployment), plus the battery's low/average/high per lap for hybrid cars.
// Usage: tsx tools/analysis/traceLiveAdvice.ts <recording filename part, e.g. 2026-11-05T16> [captureDirectory]
const filter = process.argv[2] ?? '';
const directory = path.resolve(process.argv[3] ?? path.join('server', 'live-captures'));

interface Snapshot {
  lifecycle?: string;
  session?: { playerLapsCompleted?: number };
  lapsLeft?: { laps?: number } | null;
  weather?: { raining?: number; avgPathWetness?: number } | null;
  strategy?: {
    resource?: { perLap?: number; perLapSource?: string; race?: { pitLap?: number | null; neededStopNow?: number | null; neededAfterStop?: number | null } | null } | null;
    pit?: { state?: string; mfd?: { resourceValue?: number | null; tyres?: string | null } | null } | null;
    fuelRatio?: { recommended?: number | null; source?: string; mfdSetting?: number | null; garageSetting?: number | null; fuelBiasLaps?: number | null } | null;
    crossover?: { action?: string; when?: string } | null;
    forecast?: { change?: string; chance?: number; atSeconds?: number } | null;
    deployment?: { current?: number | null; target?: number | null; next?: number | null; unit?: string } | null;
    tyres?: { compound?: string } | null;
  };
}

const value = (x: number | null | undefined, digits = 0): string => x == null ? '-' : x.toFixed(digits);

function line(s: Snapshot): string {
  const st = s.strategy ?? {};
  const race = st.resource?.race;
  const ratio = st.fuelRatio;
  const deploy = st.deployment;
  return [
    `${s.lifecycle ?? '-'} lap ${s.session?.playerLapsCompleted ?? '-'}`,
    `rate ${value(st.resource?.perLap, 2)} ${st.resource?.perLapSource ?? '-'}`,
    `left ${s.lapsLeft?.laps ?? '-'}`,
    `pit L${race?.pitLap ?? '-'} need ${value(race?.neededStopNow)}/${value(race?.neededAfterStop)}`,
    `${st.pit?.state ?? '-'} mfd ${value(st.pit?.mfd?.resourceValue)} ${st.pit?.mfd?.tyres ?? '-'}`,
    `ratio ${value(ratio?.recommended, 2)} ${ratio?.source ?? '-'} set ${value(ratio?.mfdSetting ?? ratio?.garageSetting, 2)} bias ${value(ratio?.fuelBiasLaps, 1)}`,
    `${st.tyres?.compound ?? '-'} wet ${value(s.weather?.avgPathWetness, 3)} rain ${value(s.weather?.raining, 2)} xover ${st.crossover ? `${st.crossover.action} ${st.crossover.when}` : '-'}`,
    `fc ${st.forecast ? `${st.forecast.change} ${st.forecast.chance}% @${st.forecast.atSeconds}` : '-'}`,
    `deploy ${deploy ? `${value(deploy.current)}→${value(deploy.target)} next ${value(deploy.next)}` : '-'}`,
  ].join(' | ');
}

for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.live.duckdb') && name.includes('_race_') && name.includes(filter)).sort()) {
  const instance = await DuckDBInstance.create(path.join(directory, filename), { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    console.log(`\n${filename.slice(0, 70)}`);
    const rows = (await connection.runAndReadAll(`SELECT elapsed_seconds, CAST(data AS VARCHAR) AS data FROM capture_observations
      WHERE kind='strategy-audit-v1' ORDER BY elapsed_seconds`)).getRowObjectsJson() as Array<{ elapsed_seconds: number; data: string }>;
    let last = '';
    for (const row of rows) {
      const snapshot = (JSON.parse(row.data) as { snapshot?: Snapshot }).snapshot;
      if (!snapshot) continue;
      const text = line(snapshot);
      if (text !== last) console.log(`  ${value(Number(row.elapsed_seconds), 1).padStart(7)} ${text}`);
      last = text;
    }
    const battery = (await connection.runAndReadAll(`SELECT lap_number, min(battery_charge_fraction) lo, avg(battery_charge_fraction) mean,
      max(battery_charge_fraction) hi, string_agg(DISTINCT CAST(motor_map AS VARCHAR), '/') maps FROM capture_samples
      WHERE battery_charge_fraction > 0 GROUP BY 1 ORDER BY 1`)).getRowObjectsJson() as Array<{ lap_number: number; lo: number; mean: number; hi: number; maps: string }>;
    if (battery.length) {
      console.log('  battery per lap (low/average/high %, motor maps):');
      console.log(`    ${battery.map(lap => `L${lap.lap_number} ${value(lap.lo * 100)}/${value(lap.mean * 100)}/${value(lap.hi * 100)} m${lap.maps}`).join(', ')}`);
    }
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
