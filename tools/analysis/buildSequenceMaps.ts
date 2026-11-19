import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { decompressJson } from '../../server/core/dbCache.js';
import { getTelemetryLapCache, getTelemetryLapCacheFilenames, getTelemetryMetadata } from '../../server/core/dbTelemetryStore.js';
import { getReplayLapBlobs } from '../../server/core/replay/dbReplayLapRows.js';
import { nearTrackTest, readPassLap } from '../../server/corners/cornerPassBuild.js';
import { lapTrace, nativeTrace, sequenceLap, type LapTrace } from '../../server/corners/sequenceLaps.js';
import { fastestMapLaps } from '../../server/corners/sequenceMapService.js';
import { DuckDbReader } from '../../server/telemetry/duckdbReader.js';
import type { DuckDbLapTelemetry } from '../../server/telemetry/duckdbTypes.js';
import { TelemetryLinks } from '../../server/telemetry/telemetryLinks.js';
import { buildCenterlineSpatialIndex } from '../../server/tracks/trackProjection.js';
import { getTrackDefinition } from '../../server/tracks/serverTrackSync.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { placeTurns } from '../../shared/domain/circuitTurns/placeTurns.js';
import { LAYOUT_TURN_LISTS } from '../../shared/domain/circuitTurns/turnLists.js';
import { buildSequenceMap, checkSequenceMap, type SequenceLap, type SequenceMap } from '../../shared/domain/cornerSequences/sequenceMap.js';
import { sequenceLabel as label, turnName } from '../../shared/domain/cornerSequences/sequenceLabel.js';
import { resolveVehicle } from '../../shared/domain/vehicleMapping.js';
import type { ReplayMetadata } from '../../shared/types/index.js';

// Builds each layout and class's corner sequence map from its 10 fastest clean dry replay laps (different drivers)
// and checks it against the driver's own 5 fastest, read from the native telemetry where it exists. Report mode:
// reads the app's database only, writes the report.
// Usage: tsx --env-file-if-exists=.env.local tools/analysis/buildSequenceMaps.ts <report.json> [layoutKey] [class]
const reportPath = path.resolve(process.argv[2] ?? 'sequence-maps.json');
const [, , , onlyLayout, onlyClass] = process.argv;
const svgDir = process.env.SEQUENCE_SVG_DIR;
const MAP_LAPS = 10;
const CHECK_LAPS = 5;
const MIN_LAPS = 3;

const db = new Database(path.join('server', 'lmu_cache.db'), { readonly: true, fileMustExist: true });
const links = TelemetryLinks.load({
  getTelemetryMetadata: (sessionId?: string) => getTelemetryMetadata(db, sessionId),
  getTelemetryLapCacheFilenames: (sessionId?: string) => getTelemetryLapCacheFilenames(db, sessionId),
});

const sessionOf = db.prepare('SELECT session_id id FROM session_recordings WHERE recording_name=?');

interface Candidate { filename: string; slot: number; lapNumber: number; lapTimeSec: number; startSec: number; driver: string; own: boolean }
const lapsStmt = db.prepare(`SELECT l.driver_slot slot, l.lap_number lap, l.lap_time_sec t, l.start_sec s,
  (SELECT COUNT(*) FROM replay_corner_passes p WHERE p.filename=l.filename AND p.driver_slot=l.driver_slot AND p.lap_number=l.lap_number) passes
  FROM replay_laps l WHERE l.filename=? AND l.lap_number>1 AND l.is_valid=1 AND COALESCE(l.is_out_lap,0)=0 AND l.lap_time_sec>0`);

const groups = new Map<string, Candidate[]>();
for (const row of db.prepare('SELECT filename, metadata_br FROM replay_metadata').all() as Array<{ filename: string; metadata_br: Buffer }>) {
  const meta = decompressJson<ReplayMetadata>(row.metadata_br);
  const { layoutKey } = getCircuitSpecification(meta.trackVenue, meta.trackCourse, meta.sceneDesc, row.filename);
  if (layoutKey === 'unknown' || meta.hasRain || (onlyLayout && layoutKey !== onlyLayout)) continue;
  const bySlot = new Map(meta.drivers.filter(driver => driver.slot !== undefined).map(driver => [driver.slot!, driver]));
  const laps = lapsStmt.all(row.filename) as Array<{ slot: number; lap: number; t: number; s: number | null; passes: number }>;
  const allTurns = Math.max(0, ...laps.map(lap => lap.passes));
  for (const lap of laps) {
    const driver = bySlot.get(lap.slot);
    if (!driver || !lap.passes || lap.passes < allTurns || lap.s === null) continue;
    const carClass = resolveVehicle(driver.vehicleId ?? driver.carType)?.carClass ?? driver.carClass ?? '?';
    if (onlyClass && carClass !== onlyClass) continue;
    const key = `${layoutKey}|${carClass}`;
    groups.set(key, [...(groups.get(key) ?? []), {
      filename: row.filename, slot: lap.slot, lapNumber: lap.lap, lapTimeSec: lap.t, startSec: lap.s, driver: driver.name, own: Boolean(driver.isPlayer),
    }]);
  }
}


function nativeFiles(lap: Candidate) {
  const session = sessionOf.get(lap.filename) as { id: string } | undefined;
  return links.filesForReplay(lap.filename, session).map(filename => links.row(filename)).filter(row => row !== undefined);
}
const hasNativeFiles = (lap: Candidate) => nativeFiles(lap).length > 0;

async function nativeLap(lap: Candidate): Promise<DuckDbLapTelemetry | null> {
  const files = nativeFiles(lap);
  for (const file of files) {
    const cached = getTelemetryLapCache(db, file.filename, lap.lapNumber);
    if (cached && Math.abs(cached.lapTimeSec - lap.lapTimeSec) <= 0.5) return cached;
  }
  for (const file of files.filter(file => links.isOnDisk(file.filename))) {
    const reader = new DuckDbReader(file.filePath);
    try {
      await reader.open();
      const match = (await reader.getLapList()).find(item => (item.lapNumber === lap.lapNumber || item.lapNumber === lap.lapNumber - 1)
        && Math.abs(item.lapTimeSec - lap.lapTimeSec) <= 0.5);
      if (match) return await reader.getLapTelemetry(match.lapNumber);
    } catch (error) {
      console.warn(`native read failed ${file.filename}:`, error instanceof Error ? error.message : error);
    } finally {
      await reader.close();
    }
  }
  return null;
}


const report: unknown[] = [];
for (const [key, candidates] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const [layoutKey, carClass] = key.split('|');
  const track = getTrackDefinition(layoutKey);
  if (!track) { console.log(`${key}: no centre line`); continue; }
  const startStationM = track.timingGates?.startFinish?.stationM ?? 0;
  const { lengthM, turns } = placeTurns(track.centerline, LAYOUT_TURN_LISTS[layoutKey] ?? null, startStationM);
  const index = buildCenterlineSpatialIndex(track.centerline);
  const nearTrack = nearTrackTest(index);
  const traceOf = (lap: Candidate): LapTrace | null => {
    const [row] = getReplayLapBlobs(db, lap.filename, [lap]);
    return row ? lapTrace(readPassLap(lap.lapNumber, row.blob, index, startStationM, nearTrack), lengthM) : null;
  };
  const mapLaps = fastestMapLaps(candidates, MAP_LAPS);
  if (mapLaps.length < MIN_LAPS) { console.log(`${key}: ${mapLaps.length} laps, no map`); continue; }
  const mapInput = mapLaps.flatMap(lap => { const trace = traceOf(lap); return trace ? [sequenceLap(trace)] : []; });
  const sequenceTurns = turns.map(({ id, apexM }) => ({ id, apexM }));
  const map = buildSequenceMap(sequenceTurns, mapInput, lengthM);

  // The driver's fastest laps that have native telemetry; their replay laps when fewer than MIN_LAPS have.
  const ownLaps = [...candidates].filter(lap => lap.own).sort((a, b) => a.lapTimeSec - b.lapTimeSec);
  let checkInput: SequenceLap[] = [];
  // The same laps from the replay: native against replay on one lap is the replay's own quality, not driving.
  const sameLapsReplay: SequenceLap[] = [];
  for (const lap of ownLaps) {
    if (checkInput.length >= CHECK_LAPS) break;
    if (!hasNativeFiles(lap)) continue;
    const native = await nativeLap(lap);
    const stored = native && traceOf(lap);
    if (native && stored) {
      checkInput.push(sequenceLap(nativeTrace(native.points, stored, lap.startSec)));
      sameLapsReplay.push(sequenceLap(stored));
    }
  }
  const sourceChecks = checkInput.length >= MIN_LAPS
    ? checkSequenceMap(buildSequenceMap(sequenceTurns, sameLapsReplay, lengthM), buildSequenceMap(sequenceTurns, checkInput, lengthM))
    : [];
  const nativeCount = checkInput.length;
  if (nativeCount < MIN_LAPS) {
    checkInput = ownLaps.slice(0, CHECK_LAPS).flatMap(lap => { const trace = traceOf(lap); return trace ? [sequenceLap(trace)] : []; });
  }
  const own = mapLaps.every(lap => lap.own);
  const check: SequenceMap | null = checkInput.length >= MIN_LAPS && !own ? buildSequenceMap(sequenceTurns, checkInput, lengthM) : null;
  const checks = check ? checkSequenceMap(map, check) : [];
  const sequences = map.sequences.map((sequence, i) => ({
    label: label(turns, sequence.turnIds.filter(id => !sequence.exitTurnIds.includes(id))),
    turns: sequence.turnIds.map(id => turnName(turns.find(turn => turn.id === id)!)),
    exitTurns: sequence.exitTurnIds.map(id => turnName(turns.find(turn => turn.id === id)!)),
    startM: Math.round(sequence.startM), minM: Math.round(sequence.minM),
    spreadM: { median: Math.round(sequence.startSpreadM.median), max: Math.round(sequence.startSpreadM.max) },
    laps: sequence.lapCount,
    check: checks[i] ? { same: checks[i].sameGrouping, offsetM: checks[i].startOffsetM === null ? null : Math.round(checks[i].startOffsetM) } : null,
  }));
  const joins = turns.map((turn, i) => `${turnName(turn)}>${map.joinVotes[i]}/${Math.round(map.recovered[i] * 100)}`);
  report.push({ layoutKey, carClass, lengthM: Math.round(lengthM), mapLaps: mapLaps.length, drivers: new Set(mapLaps.map(lap => lap.driver)).size,
    checkLaps: checkInput.length, nativeCheckLaps: nativeCount >= MIN_LAPS ? nativeCount : 0, checkNote: own ? 'the map is the driver\'s own laps' : check ? null : 'too few own laps',
    sequences, joins, lapTimes: mapLaps.map(lap => lap.lapTimeSec), ownLapTimes: ownLaps.slice(0, CHECK_LAPS).map(lap => lap.lapTimeSec),
    sourceChecks: sourceChecks.map(item => ({ turns: item.turnIds.map(id => turnName(turns.find(turn => turn.id === id)!)),
      same: item.sameGrouping, offsetM: item.startOffsetM === null ? null : Math.round(item.startOffsetM) })) });
  if (svgDir) {
    const at = (distM: number): [number, number] => {
      const station = ((startStationM + distM) % index.totalLengthM + index.totalLengthM) % index.totalLengthM;
      let k = index.cumulativeStations.findIndex(value => value > station) - 1;
      if (k < 0) k = index.points.length - 1;
      const along = station - index.cumulativeStations[k];
      return [index.points[k][0] + index.tangents[k].x * along, index.points[k][1] + index.tangents[k].z * along];
    };
    const xs = index.points.map(point => point[0]);
    const zs = index.points.map(point => point[1]);
    const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const scale = 1100 / Math.max(maxX - minX, maxZ - minZ);
    const xy = ([x, z]: [number, number]) => `${((x - minX) * scale + 50).toFixed(1)},${((maxZ - z) * scale + 50).toFixed(1)}`;
    const colours = ['#38bdf8', '#f59e0b', '#34d399', '#f472b6'];
    const parts = map.sequences.map((sequence, i) => {
      const next = map.sequences[(i + 1) % map.sequences.length];
      const span = ((next.startM - sequence.startM) % lengthM + lengthM) % lengthM || lengthM;
      const line = Array.from({ length: Math.ceil(span / 10) + 1 }, (_, k) => xy(at(sequence.startM + Math.min(span, k * 10)))).join(' ');
      const [sx, sy] = xy(at(sequence.startM)).split(',');
      const [lx, ly] = xy(at(sequence.minM)).split(',');
      return `<polyline points="${line}" fill="none" stroke="${colours[i === map.sequences.length - 1 && i % colours.length === 0 ? 2 : i % colours.length]}" stroke-width="5"/>`
        + `<circle cx="${sx}" cy="${sy}" r="6" fill="#fff"/>`
        + `<text x="${Number(lx) > 900 ? Number(lx) - 8 : Number(lx) + 8}" y="${Number(ly) - 8}" text-anchor="${Number(lx) > 900 ? 'end' : 'start'}" fill="#e2e8f0" font-size="15" font-family="sans-serif">${sequences[i].label}</text>`;
    });
    const apexes = turns.map(turn => { const [x, y] = xy(at(turn.apexM)).split(','); return `<circle cx="${x}" cy="${y}" r="3" fill="#94a3b8"/>`; });
    const [fx, fy] = xy(at(0)).split(',');
    fs.writeFileSync(path.join(svgDir, `${layoutKey}-${carClass}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">`
      + `<rect width="1200" height="1200" fill="#0f172a"/><text x="20" y="32" fill="#e2e8f0" font-size="22" font-family="sans-serif">${layoutKey} ${carClass}: ${map.sequences.length} sequences from ${mapInput.length} laps (white dot = start)</text>`
      + `${parts.join('')}${apexes.join('')}<rect x="${Number(fx) - 6}" y="${Number(fy) - 6}" width="12" height="12" fill="#f43f5e"/></svg>`);
  }
  const failing = checks.filter(item => !item.sameGrouping || Math.abs(item.startOffsetM ?? 0) > 10).length;
  console.log(`${key}: ${map.sequences.length} sequences of ${turns.length} turns from ${mapInput.length} laps; check ${checkInput.length} (${nativeCount >= MIN_LAPS ? 'native' : 'replay'}), ${failing} off`);
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1));
db.close();
console.log(`Report ${reportPath}`);
