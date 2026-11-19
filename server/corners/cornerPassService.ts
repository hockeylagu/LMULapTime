import { createHash } from 'node:crypto';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { placeTurns, TURN_PLACEMENT_VERSION, type PlacedTurn } from '../../shared/domain/circuitTurns/placeTurns.js';
import { LAYOUT_TURN_LISTS, TURN_LISTS_VERSION } from '../../shared/domain/circuitTurns/turnLists.js';
import { SEQUENCE_MAP_VERSION } from '../../shared/domain/cornerSequences/sequenceMap.js';
import { resolveDriverCarClass } from '../../shared/domain/vehicleMapping.js';
import type { CornerPass } from '../../shared/types/corners/cornerPasses.js';
import type { ReplayMetadata } from '../../shared/types/index.js';
import type { CornerPassBuild, PassKind } from '../core/replay/dbCornerPassStore.js';
import type { ReplayLapRow } from '../core/replay/dbReplayLapRows.js';
import type { StoredSequenceMap } from '../core/replay/dbSequenceMapStore.js';
import { getTrackDefinition } from '../tracks/serverTrackSync.js';
import type { CornerPassInput, CornerPassResult } from './cornerPassBuild.js';
import { CORNER_PASS_VERSION, type PassSegment } from './cornerPasses.js';
import { buildCornerPassesInWorker } from './cornerPassWorkerClient.js';

export interface CornerPassStore {
  getReplayLapSignature(filename: string): string | null;
  listReplayLapRows(filename: string): ReplayLapRow[];
  getCornerPassBuild(filename: string, kind?: PassKind): CornerPassBuild | null;
  replaceCornerPasses(filename: string, build: Omit<CornerPassBuild, 'passCount'>, passes: CornerPass[], kind?: PassKind): void;
  getSequenceMap(layoutKey: string, carClass: string): StoredSequenceMap | null;
}

type CenterlineTrack = { centerline: Array<[number, number]>; projectionRevision: string;
  timingGates?: { startFinish?: { stationM?: number } } };
export type TrackLoader = (layoutKey: string) => CenterlineTrack | null;
type Build = (input: CornerPassInput) => Promise<CornerPassResult>;

export type CornerPassOutcome =
  | { status: 'built'; passCount: number; sequencePassCount: number }
  | { status: 'current' }
  | { status: 'skipped'; reason: string };

/** A layout's centre line and placed turns, and the key naming them (turn lists, placing rule, centre line). */
export interface PlacedLayout {
  layoutKey: string;
  centerline: Array<[number, number]>;
  startStationM: number;
  lengthM: number;
  turns: PlacedTurn[];
  turnsKey: string;
}

/** What a replay's passes are built from: its layout's centre line and placed turns, and the key of that build. */
export interface CornerPassPlan extends PlacedLayout {
  versionKey: string;
}

/** The layout's turns placed on its centre line; null without a centre line. */
export function placeLayout(layoutKey: string, loadTrack: TrackLoader = getTrackDefinition): PlacedLayout | null {
  const track = loadTrack(layoutKey);
  if (!track) return null;
  const startStationM = track.timingGates?.startFinish?.stationM ?? 0;
  const { lengthM, turns } = placeTurns(track.centerline, LAYOUT_TURN_LISTS[layoutKey] ?? null, startStationM);
  const turnsKey = [`turns v${TURN_LISTS_VERSION}.${TURN_PLACEMENT_VERSION}`, layoutKey, track.projectionRevision].join('|');
  return { layoutKey, centerline: track.centerline, startStationM, lengthM, turns, turnsKey };
}

/** The layout a replay's own scene names, so the build does not wait for a session match; 'unknown' when none. */
export function replayLayoutKey(filename: string, metadata: Pick<ReplayMetadata, 'sceneDesc' | 'trackVenue' | 'trackCourse'>): string {
  return getCircuitSpecification(metadata.trackVenue, metadata.trackCourse, metadata.sceneDesc, filename).layoutKey;
}

/**
 * The build a replay's passes should come from: same pass rule, turn lists, layout, centre line and stored laps
 * (the version key).
 */
export function planCornerPasses(
  filename: string,
  metadata: Pick<ReplayMetadata, 'sceneDesc' | 'trackVenue' | 'trackCourse'>,
  lapSignature: string | null,
  loadTrack: TrackLoader = getTrackDefinition
): CornerPassPlan | { reason: string } {
  const layoutKey = replayLayoutKey(filename, metadata);
  if (layoutKey === 'unknown') return { reason: 'unknown layout' };
  return planLayoutCornerPasses(layoutKey, lapSignature, loadTrack);
}

/** planCornerPasses on a known layout (the one a stored build names, when reading its passes). */
export function planLayoutCornerPasses(layoutKey: string, lapSignature: string | null, loadTrack: TrackLoader = getTrackDefinition):
  CornerPassPlan | { reason: string } {
  const layout = placeLayout(layoutKey, loadTrack);
  if (!layout) return { reason: `no centre line for ${layoutKey}` };
  if (!lapSignature) return { reason: 'no stored laps' };
  return { ...layout, versionKey: [`passes v${CORNER_PASS_VERSION}`, layout.turnsKey, lapSignature].join('|') };
}

/** A short stable digest of a key (12 hex digits). */
export const shortHash = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 12);

/** The first part of a sequence map's key: the map rule and the layout's placed turns it was built on. */
export const mapRuleHash = (turnsKey: string): string => shortHash(`sequences v${SEQUENCE_MAP_VERSION}|${turnsKey}`);

/** Each car's class from the replay's entry list (slot to class); cars of no known class are left out. */
export function replayClassesBySlot(metadata: Pick<ReplayMetadata, 'drivers'>): Map<number, string> {
  return new Map((metadata.drivers ?? []).flatMap(driver => {
    const carClass = resolveDriverCarClass(driver);
    return driver.slot === undefined || !carClass ? [] : [[driver.slot, carClass] as const];
  }));
}

/** A map's sequences as pass segments: each from its start to the next one's start (the last runs across the line). */
export function sequenceSegments(map: Pick<StoredSequenceMap, 'sequences'>, lengthM: number): PassSegment[] {
  const sorted = [...map.sequences].sort((a, b) => a.startM - b.startM);
  return sorted.map((sequence, i) => {
    const next = sorted[(i + 1) % sorted.length];
    return { id: sequence.turnIds[0], startM: sequence.startM, endM: next.startM > sequence.startM ? next.startM : next.startM + lengthM };
  });
}

/** The sequence passes a replay should have: each class's map of its cars, and the key of that build. */
export interface SequencePassPlan {
  versionKey: string;
  maps: Array<{ carClass: string; slots: number[]; map: StoredSequenceMap }>;
}

/**
 * Each class's map as it stands, for the replay's cars by class; a map of another layout placing (an older turn list
 * or centre line) is no map. The key names the turn passes' build and every class's map (or none).
 */
export function planSequencePasses(
  plan: CornerPassPlan,
  classesBySlot: ReadonlyMap<number, string>,
  getSequenceMap: CornerPassStore['getSequenceMap']
): SequencePassPlan {
  const slotsByClass = new Map<string, number[]>();
  for (const [slot, carClass] of classesBySlot) {
    const slots = slotsByClass.get(carClass) ?? [];
    slots.push(slot);
    slotsByClass.set(carClass, slots);
  }
  const classes = [...slotsByClass.keys()].sort();
  const maps = classes.map(carClass => {
    const map = getSequenceMap(plan.layoutKey, carClass);
    return map?.mapKey.startsWith(`${mapRuleHash(plan.turnsKey)}:`) ? map : null;
  });
  return {
    versionKey: [plan.versionKey, ...classes.map((carClass, i) => `${carClass}:${maps[i]?.mapKey ?? 'none'}`)].join('|'),
    maps: classes.flatMap((carClass, i) => {
      const map = maps[i];
      return map ? [{ carClass, slots: slotsByClass.get(carClass) ?? [], map }] : [];
    }),
  };
}

/** Builds a replay's corner passes and sequence passes unless the stored ones come from the same build. */
export async function refreshReplayCornerPasses(
  store: CornerPassStore,
  filename: string,
  metadata: Pick<ReplayMetadata, 'sceneDesc' | 'trackVenue' | 'trackCourse' | 'drivers'>,
  build: Build = buildCornerPassesInWorker,
  loadTrack: TrackLoader = getTrackDefinition
): Promise<CornerPassOutcome> {
  const plan = planCornerPasses(filename, metadata, store.getReplayLapSignature(filename), loadTrack);
  if ('reason' in plan) return { status: 'skipped', reason: plan.reason };
  const sequencePlan = planSequencePasses(plan, replayClassesBySlot(metadata), (layoutKey, carClass) => store.getSequenceMap(layoutKey, carClass));
  const sequenceKey = sequencePlan.versionKey;
  const turnsCurrent = store.getCornerPassBuild(filename)?.versionKey === plan.versionKey;
  const sequencesCurrent = store.getCornerPassBuild(filename, 'sequences')?.versionKey === sequenceKey;
  if (turnsCurrent && sequencesCurrent) return { status: 'current' };
  // Only the stale build is worked out: a map change leaves the turn passes as they are.
  const sequences = sequencesCurrent ? [] : sequencePlan.maps.map(({ slots, map }) => ({ slots, segments: sequenceSegments(map, plan.lengthM) }));
  const segments = turnsCurrent ? [] : plan.turns.map(({ id, startM, endM }) => ({ id, startM, endM }));
  const result = await build({ laps: store.listReplayLapRows(filename), centerline: plan.centerline, startStationM: plan.startStationM, segments, sequences });
  if (!turnsCurrent) store.replaceCornerPasses(filename, { versionKey: plan.versionKey, layoutKey: plan.layoutKey }, result.passes);
  if (!sequencesCurrent) store.replaceCornerPasses(filename, { versionKey: sequenceKey, layoutKey: plan.layoutKey }, result.sequencePasses, 'sequences');
  return { status: 'built', passCount: result.passes.length, sequencePassCount: result.sequencePasses.length };
}
