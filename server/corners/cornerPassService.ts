import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { placeTurns, TURN_PLACEMENT_VERSION, type PlacedTurn } from '../../shared/domain/circuitTurns/placeTurns.js';
import { LAYOUT_TURN_LISTS, TURN_LISTS_VERSION } from '../../shared/domain/circuitTurns/turnLists.js';
import type { CornerPass } from '../../shared/types/corners/cornerPasses.js';
import type { ReplayMetadata } from '../../shared/types/index.js';
import type { CornerPassBuild } from '../core/replay/dbCornerPassStore.js';
import type { ReplayLapRow } from '../core/replay/dbReplayLapRows.js';
import { getTrackDefinition } from '../tracks/serverTrackSync.js';
import type { CornerPassInput } from './cornerPassBuild.js';
import { CORNER_PASS_VERSION } from './cornerPasses.js';
import { buildCornerPassesInWorker } from './cornerPassWorkerClient.js';

export interface CornerPassStore {
  getReplayLapSignature(filename: string): string | null;
  listReplayLapRows(filename: string): ReplayLapRow[];
  getCornerPassBuild(filename: string): CornerPassBuild | null;
  replaceCornerPasses(filename: string, build: Omit<CornerPassBuild, 'passCount'>, passes: CornerPass[]): void;
}

type CenterlineTrack = { centerline: Array<[number, number]>; projectionRevision: string;
  timingGates?: { startFinish?: { stationM?: number } } };
export type TrackLoader = (layoutKey: string) => CenterlineTrack | null;
type Build = (input: CornerPassInput) => Promise<CornerPass[]>;

export type CornerPassOutcome = { status: 'built'; passCount: number } | { status: 'current' } | { status: 'skipped'; reason: string };

/** What a replay's passes are built from: its layout's centre line and placed turns, and the key of that build. */
export interface CornerPassPlan {
  layoutKey: string;
  centerline: Array<[number, number]>;
  startStationM: number;
  lengthM: number;
  turns: PlacedTurn[];
  versionKey: string;
}

/**
 * The build a replay's passes should come from: same pass rule, turn lists, layout, centre line and stored laps
 * (the version key). The replay's own scene names its layout, so the build does not wait for a session match.
 */
export function planCornerPasses(
  filename: string,
  metadata: Pick<ReplayMetadata, 'sceneDesc' | 'trackVenue' | 'trackCourse'>,
  lapSignature: string | null,
  loadTrack: TrackLoader = getTrackDefinition
): CornerPassPlan | { reason: string } {
  const { layoutKey } = getCircuitSpecification(metadata.trackVenue, metadata.trackCourse, metadata.sceneDesc, filename);
  if (layoutKey === 'unknown') return { reason: 'unknown layout' };
  return planLayoutCornerPasses(layoutKey, lapSignature, loadTrack);
}

/** planCornerPasses on a known layout (the one a stored build names, when reading its passes). */
export function planLayoutCornerPasses(layoutKey: string, lapSignature: string | null, loadTrack: TrackLoader = getTrackDefinition):
  CornerPassPlan | { reason: string } {
  const track = loadTrack(layoutKey);
  if (!track) return { reason: `no centre line for ${layoutKey}` };
  if (!lapSignature) return { reason: 'no stored laps' };
  const startStationM = track.timingGates?.startFinish?.stationM ?? 0;
  const { lengthM, turns } = placeTurns(track.centerline, LAYOUT_TURN_LISTS[layoutKey] ?? null, startStationM);
  const versionKey = [`passes v${CORNER_PASS_VERSION}`, `turns v${TURN_LISTS_VERSION}.${TURN_PLACEMENT_VERSION}`, layoutKey,
    track.projectionRevision, lapSignature].join('|');
  return { layoutKey, centerline: track.centerline, startStationM, lengthM, turns, versionKey };
}

/** Builds a replay's corner passes unless the stored ones come from the same build (planCornerPasses). */
export async function refreshReplayCornerPasses(
  store: CornerPassStore,
  filename: string,
  metadata: Pick<ReplayMetadata, 'sceneDesc' | 'trackVenue' | 'trackCourse'>,
  build: Build = buildCornerPassesInWorker,
  loadTrack: TrackLoader = getTrackDefinition
): Promise<CornerPassOutcome> {
  const plan = planCornerPasses(filename, metadata, store.getReplayLapSignature(filename), loadTrack);
  if ('reason' in plan) return { status: 'skipped', reason: plan.reason };
  if (store.getCornerPassBuild(filename)?.versionKey === plan.versionKey) return { status: 'current' };
  const segments = plan.turns.map(({ id, startM, endM }) => ({ id, startM, endM }));
  const passes = await build({ laps: store.listReplayLapRows(filename), centerline: plan.centerline, startStationM: plan.startStationM, segments });
  store.replaceCornerPasses(filename, { versionKey: plan.versionKey, layoutKey: plan.layoutKey }, passes);
  return { status: 'built', passCount: passes.length };
}
