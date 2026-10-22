import fs from 'node:fs';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';
import { detectWheelSlipEvents, WHEEL_POSITIONS, wheelSlipChannelIndexes, wheelSlipRatios } from '../../shared/domain/live/wheelSlip.js';
import type { LiveEvidenceChannel } from '../../shared/types/liveEvidence.js';
import { liveCaptureChannels } from '../../server/live/capture/channels.js';

// Read-only calibration check: runs the app's lockup/wheelspin detection over every closed live recording.
// Usage: tsx tools/analysis/listWheelSlipEvents.ts [captureDirectory]
const directory = path.resolve(process.argv[2] ?? path.join('server', 'live-captures'));
const channels: LiveEvidenceChannel[] = liveCaptureChannels(3)
  .filter(channel => channel.frame === 'iso8855-wheel')
  .map(channel => ({ name: channel.name, unit: channel.unit, frame: channel.frame, sourceField: channel.sourceField }));
const indexes = wheelSlipChannelIndexes(channels)!;

for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.live.duckdb')).sort()) {
  const instance = await DuckDBInstance.create(path.join(directory, filename), { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    const raw = (await connection.runAndReadAll('SELECT CAST(manifest_json AS VARCHAR) AS manifest FROM capture_manifest')).getRowObjectsJson()[0]?.manifest;
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : {}) as { normalizationVersion?: number; vehicleName?: string };
    if ((parsed.normalizationVersion ?? 1) < 2) continue; // Version 1 has no verified wheel catalog.
    const rows = (await connection.runAndReadAll(`SELECT lap_number, elapsed_seconds, ${channels.map(channel => `"${channel.name}"`).join(', ')}
      FROM capture_samples ORDER BY sample_index`)).getRowsJson() as Array<Array<number | string | null>>;
    if (!rows.length) continue;
    const laps = new Map<number, Array<{ lapSeconds: number; ratios: ReturnType<typeof wheelSlipRatios> }>>();
    for (const [lap, elapsed, ...values] of rows) {
      const samples = laps.get(Number(lap)) ?? [];
      samples.push({ lapSeconds: Number(elapsed), ratios: wheelSlipRatios(values.map(value => value === null ? null : Number(value)), indexes) });
      laps.set(Number(lap), samples);
    }
    const counts: Record<string, number> = {};
    let seconds = 0;
    const worst: string[] = [];
    for (const [lap, samples] of laps) {
      for (const event of detectWheelSlipEvents(samples)) {
        const key = `${event.kind} ${event.wheel.toUpperCase()}`;
        counts[key] = (counts[key] ?? 0) + 1;
        seconds += event.endLapSeconds - event.startLapSeconds;
        worst.push(`lap ${lap} ${key} ${(event.endLapSeconds - event.startLapSeconds).toFixed(2)}s peak ${Math.round(event.peakSlipRatio * 100)}%`);
      }
    }
    const ordered = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    console.log(`${filename.slice(0, 48)} | ${parsed.vehicleName ?? '?'} | ${laps.size} laps | ${rows.length} samples | ${seconds.toFixed(2)}s in events`);
    console.log(`  ${JSON.stringify(ordered)}`);
    for (const line of worst.slice(0, 6)) console.log(`  ${line}`);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
console.log(`Wheels: ${WHEEL_POSITIONS.join(', ')}; thresholds in shared/domain/live/wheelSlip.ts`);
