import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { median } from '../../shared/domain/pitStops.js';
import { SessionDatabase } from '../../server/core/db.js';
import { readSessionCornerAnalysis } from '../../server/corners/cornerAnalysisService.js';
import { layoutPassKey, placeLayout } from '../../server/corners/cornerPassService.js';
import { minTrendPasses } from '../../server/corners/cornerTrends.js';
import type { CornerPass } from '../../shared/types/corners/cornerPasses.js';
import { turnUsual, type TurnUsual } from '../../shared/domain/cornerAnalysis/turnUsual.js';

// The corner analysis engine (shared/domain/cornerAnalysis/) for some sessions, read only: one JSON per session in the
// out folder, and the lap-to-lap noise of each pass measurement against the limit its rule uses
// (a measurement noisier than its limit is dropped: shared/domain/cornerAnalysis/analyzeCorners.ts).
// Usage: tsx --env-file-if-exists=.env.local tools/analysis/cornerAnalysis.ts <db> --out <folder> [--detail] <sessionId>...
// --detail prints each turn's usual against its corner's reference.
const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, detail: { type: 'boolean' } } });
const [dbPath, ...sessionIds] = positionals;
if (!dbPath || !values.out || !sessionIds.length) throw new Error('Usage: cornerAnalysis.ts <db> --out <folder> <sessionId>...');
const db = new SessionDatabase(path.resolve(dbPath));
fs.mkdirSync(values.out, { recursive: true });

/** Each measurement's typical lap-to-lap spread for one driver in one turn: the median absolute deviation. */
const MEASURES: Array<{ name: string; limit: number; value: (pass: CornerPass) => number | null }> = [
  { name: 'brake point (m)', limit: 3, value: pass => pass.brakeM },
  { name: 'minimum speed (km/h)', limit: 1.5, value: pass => pass.minSpeedKmh },
  { name: 'exit speed (km/h)', limit: 1.5, value: pass => pass.exitSpeedKmh },
  { name: 'part throttle (s)', limit: 0.3, value: pass => pass.partThrottleSec },
  { name: 'peak brake (0-1)', limit: 0.2, value: pass => pass.peakBrake },
  { name: 'gear', limit: 1, value: pass => pass.minSpeedGear },
  { name: 'coasting (s)', limit: 0.2, value: pass => pass.coastSec },
];

for (const sessionId of sessionIds) {
  const started = Date.now();
  const analysis = readSessionCornerAnalysis(db, sessionId);
  if (!analysis) { console.log(`${sessionId}: no analysis`); continue; }
  fs.writeFileSync(path.join(values.out, `${analysis.layoutKey}.json`), JSON.stringify(analysis, null, 2));
  console.log(`\n${analysis.layoutKey} ${analysis.carClass} ${sessionId}: ${analysis.laps} laps (${Date.now() - started} ms)`);
  for (const corner of analysis.corners) {
    console.log(`  ${corner.label.padEnd(5)} ${corner.name.slice(0, 28).padEnd(28)} loss ${corner.lossSec?.toFixed(3) ?? '–'} vs ${corner.reference?.name ?? '–'}${corner.reference && !corner.reference.sameSession ? ' (other session)' : ''}`);
  }
  for (const habit of analysis.habits) console.log(`  HABIT ${habit.lossSec.toFixed(2)} s ×${habit.repeatability.toFixed(2)} ${habit.line} — ${habit.detail}`);
  for (const habit of analysis.unexplained.slice(0, 4)) console.log(`  ?     ${habit.line}`);
  if (analysis.sameCarReference) console.log(`  same car: ${analysis.sameCarReference.name}`);
  for (const habit of analysis.carDifferences) {
    console.log(`  car   ${habit.turnLabel} ${habit.half}: ${habit.lossSec.toFixed(2)} s to the reference, ${habit.sameCarLossSec?.toFixed(2)} s to the same car`);
  }
  for (const mistake of analysis.mistakes) console.log(`  MISTAKE lap ${mistake.lapOrdinal} ${mistake.line}`);

  // The noise: every driver's counted passes at the layout, per turn.
  const layout = placeLayout(analysis.layoutKey);
  if (!layout) continue;
  const scope = { layoutKey: analysis.layoutKey, carClass: analysis.carClass, buildPrefix: layoutPassKey(layout), sessionIds: [sessionId] };
  const rows = [...db.listPlayerAnalysisPasses(scope), ...db.listReferenceAnalysisPasses(scope, minTrendPasses(layout.lengthM))];
  const groups = new Map<string, CornerPass[]>();
  for (const row of rows) {
    const key = `${row.sessionId}|${row.driverOrdinal}|${row.pass.segment}`;
    groups.set(key, [...(groups.get(key) ?? []), row.pass]);
  }
  if (values.detail) {
    // Each turn: the driver's usual against each corner's reference (time, split, speeds, points, cues).
    const show = (usual: TurnUsual | null) => (usual === null ? '–' : [usual.sec, usual.toApexSec, usual.fromApexSec].map(v => v?.toFixed(2) ?? '–').join('/')
      + ` ${[usual.entryKmh, usual.minKmh, usual.exitKmh].map(v => v?.toFixed(0) ?? '–').join('/')} km/h min@${usual.minSpeedM?.toFixed(0) ?? '–'}`
      + ` brk@${usual.brakeM?.toFixed(0) ?? '–'}(${usual.brakeShare.toFixed(1)}) pk${usual.peakBrake?.toFixed(2) ?? '–'}`
      + ` part${usual.partThrottleSec?.toFixed(2) ?? '–'} g${usual.gear ?? '–'} abs${usual.absSec.toFixed(2)}`);
    for (const { label, reference, turnIds } of analysis.corners) {
      if (!reference) continue;
      for (const turnId of turnIds) {
        const own = groups.get(`${sessionId}|${analysis.driverOrdinal}|${turnId}`) ?? [];
        const ref = groups.get(`${reference.sessionId}|${reference.driverOrdinal}|${turnId}`) ?? [];
        console.log(`  ${label} turn ${turnId}: you ${show(turnUsual(own, layout.lengthM))}\n${' '.repeat(16)}ref ${show(turnUsual(ref, layout.lengthM))}`);
      }
    }
  }
  const noise = MEASURES.map(({ name, limit, value }) => {
    const spreads = [...groups.values()].filter(passes => passes.length >= 3).flatMap(passes => {
      const known = passes.map(value).filter((item): item is number => item !== null);
      const middle = median(known);
      return middle === null || known.length < 3 ? [] : [median(known.map(item => Math.abs(item - middle))) ?? 0];
    });
    return `${name} spread ${median(spreads)?.toFixed(2) ?? '–'} (limit ${limit})`;
  });
  console.log(`  noise: ${noise.join('; ')}`);
}
db.close();
