import type { RaceReplayCar, RaceReplayLap, RaceReplayOverview, RaceRunningOrder } from '../../shared/types/index.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { buildRaceEvents, type StoredDriverEvent } from '../../shared/domain/raceReplay/raceEvents.js';
import { encodeRacePoseWindow } from '../../shared/domain/raceReplay/poseWindow.js';
import type { ReplayLapRow } from '../core/replay/dbRacePositionStore.js';
import type { ReplayLapFactRow } from '../core/replay/dbReplayLapStore.js';
import { assembleRacePoseWindow, RACE_POSE_HZ, RACE_POSE_WINDOW_SEC, type LapPoses } from './racePoses.js';
import { resampleLapsInWorker, type KeyedLapPoses } from './racePosesWorkerClient.js';

export interface RaceReplayStore {
  /** Changes whenever the replay's stored laps do. */
  getReplaySignature(filename: string): string | null;
  getReplayLaps(filename: string): ReplayLapFactRow[];
  getReplayLapBlobs(filename: string, laps: ReadonlyArray<{ slot: number; lapNumber: number }>): ReplayLapRow[];
  getReplayRunningOrder(filename: string): RaceRunningOrder[];
  getReplayDriverEvents(filename: string): StoredDriverEvent[];
}

export interface RaceOverviewRequest {
  replayName: string;
  sessionType?: string;
  trackVenue?: string;
  trackCourse?: string;
  sceneDesc?: string;
  cars: RaceReplayCar[];
}

type Resample = (laps: Array<{ key: string; blob: Uint8Array }>, hz: number) => Promise<KeyedLapPoses[]>;

type TimedLap = ReplayLapFactRow & { startSec: number; endSec: number };
/** Laps with a known span on the replay clock: the others cannot be placed in a window. */
const timedLaps = (laps: ReplayLapFactRow[]) => laps.filter((lap): lap is TimedLap => lap.startSec !== null && lap.endSec !== null);

/** Resampled laps kept in memory: a whole Le Mans race is about 50 MB at 10 Hz. */
const LAP_CACHE_BYTES = 160 * 1024 * 1024;

/**
 * Every car of a session replay on one clock, for the race replay. Pose windows are built on
 * demand from the stored laps (resampled on a worker thread) and the resampled laps kept in a
 * bounded in-memory cache, so the next windows mostly reuse them; nothing is written to the database.
 */
export class RaceReplayService {
  private readonly lapCache = new Map<string, LapPoses>();
  private lapCacheBytes = 0;
  private readonly pending = new Map<string, Promise<Uint8Array>>();

  public constructor(
    private readonly store: RaceReplayStore,
    private readonly resample: Resample = resampleLapsInWorker,
    private readonly cacheBytes = LAP_CACHE_BYTES,
  ) {}

  public getOverview(request: RaceOverviewRequest): RaceReplayOverview {
    const laps: RaceReplayLap[] = timedLaps(this.store.getReplayLaps(request.replayName)).map(lap => ({
      slot: lap.driverSlot, lapNumber: lap.lapNumber, startSec: lap.startSec, endSec: lap.endSec,
      lapTimeSec: lap.lapTimeSec ?? null, isValid: lap.isValid === true,
    }));
    const { layoutKey } = getCircuitSpecification(request.trackVenue, request.trackCourse, request.sceneDesc, request.replayName);
    const starts = laps.map(lap => lap.startSec);
    const ends = laps.map(lap => lap.endSec);
    return {
      replayName: request.replayName,
      sessionType: request.sessionType,
      startSec: starts.length ? Math.min(...starts) : 0,
      endSec: ends.length ? Math.max(...ends) : 0,
      poseHz: RACE_POSE_HZ,
      windowSec: RACE_POSE_WINDOW_SEC,
      layoutKey: layoutKey !== 'unknown' ? layoutKey : undefined,
      trackVenue: request.trackVenue,
      trackCourse: request.trackCourse,
      sceneDesc: request.sceneDesc,
      cars: request.cars,
      laps,
      runningOrder: this.store.getReplayRunningOrder(request.replayName),
      events: buildRaceEvents(this.store.getReplayDriverEvents(request.replayName), new Set(request.cars.map(car => car.slot))),
    };
  }

  /** Window `index` (seconds index × windowSec onwards) of every car, encoded for the client. */
  public getPoseWindow(replayName: string, index: number): Promise<Uint8Array> {
    const signature = this.store.getReplaySignature(replayName);
    if (!signature) return Promise.reject(new Error('This replay has no stored laps'));
    const key = `${replayName}|${signature}|${index}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const build = this.buildWindow(replayName, signature, index).finally(() => this.pending.delete(key));
    this.pending.set(key, build);
    return build;
  }

  private async buildWindow(replayName: string, signature: string, index: number): Promise<Uint8Array> {
    const fromSec = index * RACE_POSE_WINDOW_SEC;
    const toSec = fromSec + RACE_POSE_WINDOW_SEC;
    const facts = timedLaps(this.store.getReplayLaps(replayName));
    const slots = [...new Set(facts.map(lap => lap.driverSlot))].sort((a, b) => a - b);
    const overlapping = facts.filter(lap => lap.startSec <= toSec && lap.endSec >= fromSec);
    const lapKey = (lap: { driverSlot: number; lapNumber: number }) => `${replayName}|${signature}|${lap.driverSlot}|${lap.lapNumber}`;

    const missing = overlapping.filter(lap => !this.lapCache.has(lapKey(lap)));
    const fresh = new Map<string, LapPoses>();
    if (missing.length) {
      const blobs = this.store.getReplayLapBlobs(replayName, missing.map(lap => ({ slot: lap.driverSlot, lapNumber: lap.lapNumber })));
      const poses = await this.resample(blobs.map(row => ({ key: lapKey({ driverSlot: row.slot, lapNumber: row.lapNumber }), blob: row.blob })), RACE_POSE_HZ);
      for (const pose of poses) fresh.set(pose.key, this.remember(pose.key, pose));
    }

    const bySlot = new Map<number, LapPoses[]>();
    for (const lap of overlapping) {
      const pose = fresh.get(lapKey(lap)) ?? this.recall(lapKey(lap));
      if (!pose) continue;
      bySlot.set(lap.driverSlot, [...bySlot.get(lap.driverSlot) ?? [], pose]);
    }
    return encodeRacePoseWindow(assembleRacePoseWindow(index, slots, bySlot));
  }

  private recall(key: string): LapPoses | undefined {
    const pose = this.lapCache.get(key);
    if (pose) {
      this.lapCache.delete(key);
      this.lapCache.set(key, pose);
    }
    return pose;
  }

  private remember(key: string, pose: LapPoses): LapPoses {
    const lap = { firstTick: pose.firstTick, count: pose.count, data: pose.data };
    const previous = this.lapCache.get(key);
    if (previous) this.lapCacheBytes -= previous.data.byteLength;
    this.lapCache.delete(key);
    this.lapCache.set(key, lap);
    this.lapCacheBytes += lap.data.byteLength;
    for (const [oldKey, old] of this.lapCache) {
      if (this.lapCacheBytes <= this.cacheBytes) break;
      this.lapCache.delete(oldKey);
      this.lapCacheBytes -= old.data.byteLength;
    }
    return lap;
  }
}
