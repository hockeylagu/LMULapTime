import type { PlacedTurn } from '../../shared/domain/circuitTurns/placeTurns.js';
import { sequenceLabel } from '../../shared/domain/cornerSequences/sequenceLabel.js';
import { buildSequenceMap, checkSequenceMap, type SequenceLap, type SequenceMap } from '../../shared/domain/cornerSequences/sequenceMap.js';
import type { ReplayMetadata } from '../../shared/types/index.js';
import type { ReplayLapRow } from '../core/replay/dbReplayLapRows.js';
import type { MapLapRef, StoredSequenceMap } from '../core/replay/dbSequenceMapStore.js';
import { getTrackDefinition } from '../tracks/serverTrackSync.js';
import type { SequenceLapInput } from './cornerPassBuild.js';
import {
  mapRuleHash, placeLayout, refreshReplayCornerPasses, replayClassesBySlot, replayLayoutKey, shortHash,
  type CornerPassOutcome, type CornerPassStore, type PlacedLayout, type TrackLoader,
} from './cornerPassService.js';
import { readSequenceLapsInWorker } from './cornerPassWorkerClient.js';

/** A map is built from this many laps, then stays as it is. */
export const SEQUENCE_MAP_LAPS = 10;
/** The driver's own fastest laps it is checked against. */
const SEQUENCE_CHECK_LAPS = 5;
/** Fewer laps make no map (and no check). */
const SEQUENCE_MIN_LAPS = 3;
/** New laps among the class's fastest after which a full map is checked again. */
export const SEQUENCE_RECHECK_NEW_LAPS = 3;
/** How far a start may sit from the map's and still agree (metres): the driver's choice, 2026-11-19. */
const SEQUENCE_START_TOLERANCE_M = 10;

export interface SequenceMapStore extends CornerPassStore {
  getStoredReplayMetadata(filename: string): ReplayMetadata | null;
  listLayoutPassReplays(layoutKey: string): string[];
  listSequenceCandidateLaps(filename: string): Array<{ slot: number; lapNumber: number; lapTimeSec: number; passes: number }>;
  getReplayLapBlobs(filename: string, laps: ReadonlyArray<{ slot: number; lapNumber: number }>): ReplayLapRow[];
  replaceSequenceMap(map: StoredSequenceMap): void;
  getSequenceMapFreshLaps(layoutKey: string, carClass: string): MapLapRef[];
  recordSequenceMapCheck(layoutKey: string, carClass: string, check: { agrees: boolean; detail: string }, freshLaps: readonly MapLapRef[]): void;
}

type ReadLaps = (input: SequenceLapInput) => Promise<SequenceLap[]>;

interface Candidate extends MapLapRef { own: boolean }

/**
 * The laps of a layout a class's map may come from, per class: dry replays, timed valid laps (not lap 1 or an out-lap)
 * that pass every official turn.
 */
function layoutCandidates(store: SequenceMapStore, layoutKey: string, turnCount: number): Map<string, Candidate[]> {
  const byClass = new Map<string, Candidate[]>();
  for (const filename of store.listLayoutPassReplays(layoutKey)) {
    const metadata = store.getStoredReplayMetadata(filename);
    if (!metadata || metadata.hasRain) continue;
    const classes = replayClassesBySlot(metadata);
    const drivers = new Map((metadata.drivers ?? []).flatMap(driver => driver.slot === undefined ? [] : [[driver.slot, driver] as const]));
    for (const lap of store.listSequenceCandidateLaps(filename)) {
      const carClass = classes.get(lap.slot);
      const driver = drivers.get(lap.slot);
      if (!carClass || !driver || lap.passes < turnCount) continue;
      const laps = byClass.get(carClass) ?? [];
      laps.push({ filename, slot: lap.slot, lapNumber: lap.lapNumber, lapTimeSec: lap.lapTimeSec, driver: driver.name, own: Boolean(driver.isPlayer) });
      byClass.set(carClass, laps);
    }
  }
  return byClass;
}

/** The fastest laps, one per driver first, then a second per driver, then any (a pair one driver alone drove), up to `count`. */
export function fastestMapLaps<T extends { lapTimeSec: number; driver: string }>(candidates: readonly T[], count: number): T[] {
  const sorted = [...candidates].sort((a, b) => a.lapTimeSec - b.lapTimeSec);
  const picked: T[] = [];
  for (const perDriver of [1, 2, count]) {
    for (const lap of sorted) {
      if (picked.length >= count) break;
      if (picked.includes(lap) || picked.filter(other => other.driver === lap.driver).length >= perDriver) continue;
      picked.push(lap);
    }
  }
  return picked;
}

const lapId = (lap: MapLapRef) => `${lap.filename}:${lap.slot}:${lap.lapNumber}`;

/**
 * Builds or grows the layout's map of each class (ingestion, the first fill and a re-map): a class's map is built
 * from its fastest laps up to SEQUENCE_MAP_LAPS and, once it has them, stays as it is unless `remap`. The driver's own
 * fastest laps check it (same grouping, start offset), kept with the map. A full map is checked again once
 * SEQUENCE_RECHECK_NEW_LAPS new laps make the class's fastest: a map built from those laps is compared with it and
 * the result flagged, the map left as it is. Returns the classes whose map changed.
 */
export async function refreshSequenceMaps(
  store: SequenceMapStore, layoutKey: string, classes: readonly string[] | null,
  options: { remap?: boolean; readLaps?: ReadLaps; loadTrack?: TrackLoader } = {}
): Promise<string[]> {
  const layout = placeLayout(layoutKey, options.loadTrack ?? getTrackDefinition);
  if (!layout || layout.turns.length === 0) return [];
  const ruleHash = mapRuleHash(layout.turnsKey);
  const readLaps = options.readLaps ?? readSequenceLapsInWorker;
  const sequenceTurns = layout.turns.map(({ id, apexM }) => ({ id, apexM }));
  const candidates = layoutCandidates(store, layoutKey, layout.turns.length);
  const changed: string[] = [];
  for (const carClass of [...classes ?? candidates.keys()].sort()) {
    const stored = store.getSequenceMap(layoutKey, carClass);
    const pool = candidates.get(carClass) ?? [];
    const laps = fastestMapLaps(pool, SEQUENCE_MAP_LAPS);
    if (laps.length < SEQUENCE_MIN_LAPS) continue;
    const full = stored !== null && stored.mapKey.startsWith(`${ruleHash}:`) && stored.laps.length >= SEQUENCE_MAP_LAPS;
    if (full && !options.remap) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- One class's laps decoded at a time: each read holds its laps in memory.
      await recheckSequenceMap(store, stored, laps, { readLaps, layout, sequenceTurns });
      continue;
    }
    const mapKey = `${ruleHash}:${shortHash(laps.map(lapId).join(','))}`;
    if (!options.remap && stored?.mapKey === mapKey) continue;
    const own = laps.every(lap => lap.own);
    const checkLaps = own ? [] : pool.filter(lap => lap.own).sort((a, b) => a.lapTimeSec - b.lapTimeSec).slice(0, SEQUENCE_CHECK_LAPS);
    // oxlint-disable-next-line eslint/no-await-in-loop -- One class's laps decoded at a time: each read holds its laps in memory.
    const read = await readMapLaps(store, [...laps, ...checkLaps], layout, readLaps);
    if (!read) continue;
    const map = buildSequenceMap(sequenceTurns, read.slice(0, laps.length), layout.lengthM);
    if (map.sequences.length === 0) continue;
    const checks = checkLaps.length >= SEQUENCE_MIN_LAPS
      ? checkSequenceMap(map, buildSequenceMap(sequenceTurns, read.slice(laps.length), layout.lengthM)) : null;
    store.replaceSequenceMap({
      layoutKey, carClass, mapKey, lengthM: layout.lengthM,
      sequences: map.sequences.map((sequence, i) => ({
        ...sequence, check: checks ? { same: checks[i].sameGrouping, offsetM: checks[i].startOffsetM } : null,
      })),
      laps: laps.map(lapRef), checkLaps: checks ? checkLaps.map(lapRef) : [],
    });
    changed.push(carClass);
  }
  return changed;
}

const lapRef = ({ filename, slot, lapNumber, lapTimeSec, driver }: MapLapRef): MapLapRef => ({ filename, slot, lapNumber, lapTimeSec, driver });

/** The laps' turning points, read on the worker; null when a lap is no longer stored. */
async function readMapLaps(store: SequenceMapStore, laps: readonly MapLapRef[], layout: PlacedLayout, readLaps: ReadLaps): Promise<SequenceLap[] | null> {
  const blobs = laps.flatMap(lap => store.getReplayLapBlobs(lap.filename, [lap]));
  if (blobs.length !== laps.length) return null;
  return readLaps({ laps: blobs, centerline: layout.centerline, startStationM: layout.startStationM });
}

/**
 * A full map against the class's fastest laps now, once SEQUENCE_RECHECK_NEW_LAPS of them are new since it was built
 * or last checked: a map built the same way from them must group every sequence the same and start each within
 * SEQUENCE_START_TOLERANCE_M. The outcome and the laps are recorded; the map stays until regenerated.
 */
async function recheckSequenceMap(
  store: SequenceMapStore, stored: StoredSequenceMap, laps: readonly MapLapRef[],
  context: { readLaps: ReadLaps; layout: PlacedLayout; sequenceTurns: Array<{ id: number; apexM: number }> }
): Promise<void> {
  const { layoutKey, carClass } = stored;
  const reference = store.getSequenceMapFreshLaps(layoutKey, carClass);
  const known = new Set((reference.length ? reference : stored.laps).map(lapId));
  if (laps.filter(lap => !known.has(lapId(lap))).length < SEQUENCE_RECHECK_NEW_LAPS) return;
  const read = await readMapLaps(store, laps, context.layout, context.readLaps);
  if (!read) return;
  const fresh = buildSequenceMap(context.sequenceTurns, read, context.layout.lengthM);
  store.recordSequenceMapCheck(layoutKey, carClass, compareSequenceMaps(stored, fresh, context.layout.turns), laps.map(lapRef));
}

/** Whether a fresh map agrees with the stored one, and in words what differs ("T5–T6: now T5 + T6", "T1: start 18 m later"). */
export function compareSequenceMaps(stored: Pick<StoredSequenceMap, 'sequences' | 'lengthM'>, fresh: SequenceMap, turns: readonly PlacedTurn[]):
  { agrees: boolean; detail: string } {
  const differences = checkSequenceMap({ ...fresh, sequences: stored.sequences, lengthM: stored.lengthM }, fresh).flatMap(item => {
    const label = sequenceLabel(turns, item.turnIds);
    if (!item.sameGrouping) {
      const now = fresh.sequences.filter(sequence => sequence.turnIds.some(id => item.turnIds.includes(id)));
      return [`${label}: now ${now.map(sequence => sequenceLabel(turns, sequence.turnIds)).join(' + ')}`];
    }
    const offset = item.startOffsetM ?? 0;
    return Math.abs(offset) > SEQUENCE_START_TOLERANCE_M ? [`${label}: start ${Math.round(Math.abs(offset))} m ${offset > 0 ? 'later' : 'earlier'}`] : [];
  });
  return { agrees: differences.length === 0, detail: differences.join('; ') };
}
// Ingestion and a map's regeneration both write maps and sequence passes: one runs at a time, in the order asked.
let cornerWork: Promise<unknown> = Promise.resolve();

/** Runs `work` once the corner work asked before it has finished (failed or not). */
export function queueCornerWork<T>(work: () => Promise<T>): Promise<T> {
  const run = cornerWork.then(work);
  cornerWork = run.catch(() => undefined);
  return run;
}

/**
 * A stored replay's corner work at ingestion: its passes (its turn passes name the laps a map may read), then its
 * classes' maps on the layout (built or grown), then the sequence passes of every replay on the layout when a map
 * changed (only those builds are redone). Queued with a map's regeneration.
 */
export function refreshReplayCorners(store: SequenceMapStore, filename: string, metadata: ReplayMetadata): Promise<CornerPassOutcome> {
  return queueCornerWork(async () => {
    const outcome = await refreshReplayCornerPasses(store, filename, metadata);
    if (outcome.status === 'skipped') return outcome;
    const layoutKey = replayLayoutKey(filename, metadata);
    const changed = await refreshSequenceMaps(store, layoutKey, [...new Set(replayClassesBySlot(metadata).values())]);
    if (changed.length > 0) await refreshLayoutSequencePasses(store, layoutKey);
    return outcome;
  });
}

/** Brings every replay on the layout to its classes' current maps (only those whose sequence passes are stale are built). */
export async function refreshLayoutSequencePasses(store: SequenceMapStore, layoutKey: string): Promise<void> {
  for (const filename of store.listLayoutPassReplays(layoutKey)) {
    const metadata = store.getStoredReplayMetadata(filename);
    // oxlint-disable-next-line eslint/no-await-in-loop -- One replay's laps decoded at a time, as ingestion builds them.
    if (metadata) await refreshReplayCornerPasses(store, filename, metadata);
  }
}
