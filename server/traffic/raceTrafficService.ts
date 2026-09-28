import type { DetailedSession, ReplayTrafficResponse } from '../../shared/types/index.js';
import { getCircuitSpecification } from '../../shared/domain/circuitSpecs.js';
import { getTrackDefinition } from '../tracks/serverTrackSync.js';
import type { ReplayLapRow } from '../core/replay/dbRacePositionStore.js';
import { RACE_POSITIONS_VERSION, RacePositions } from './racePositions.js';
import { buildRacePositionsInWorker } from './racePositionsWorkerClient.js';
import { findTrafficSpells, TrafficCarInfo } from './trafficSpells.js';
import type { StoredLapBlob } from './lapSamples.js';

export interface RaceTrafficStore {
  getReplayLapSignature(filename: string): string | null;
  listReplayLapRows(filename: string): ReplayLapRow[];
  getRacePositions<T>(filename: string, signature: string): T | null;
  saveRacePositions(filename: string, signature: string, positions: unknown): void;
}

/** What the replay says about its cars, and the session it belongs to. */
export interface RaceTrafficRequest {
  replayName: string;
  driverSlot: number;
  replayDrivers: Array<{ slot: number; name: string; carClass?: string }>;
  session?: Pick<DetailedSession, 'trackVenue' | 'trackCourse' | 'trackLengthMeters' | 'drivers'>;
  sceneDesc?: string;
  trackVenue?: string;
  trackCourse?: string;
}

type BuildPositions = (laps: StoredLapBlob[], centerline: Array<[number, number]>) => Promise<RacePositions>;
type LoadCenterline = (layoutKey: string) => Array<[number, number]> | null;

const unavailable = (reason: string): ReplayTrafficResponse => ({ available: false, reason, laps: [] });

/**
 * Who was close to a driver on the road, lap by lap, from a replay. The first request for a
 * replay builds its race positions index on a worker thread and stores it; later requests read
 * it back. Requests that arrive while it is being built wait for that one build.
 */
export class RaceTrafficService {
  private readonly building = new Map<string, Promise<RacePositions>>();

  public constructor(
    private readonly store: RaceTrafficStore,
    private readonly build: BuildPositions = buildRacePositionsInWorker,
    private readonly loadCenterline: LoadCenterline = (layoutKey) => getTrackDefinition(layoutKey)?.centerline ?? null
  ) {}

  public async getDriverTraffic(request: RaceTrafficRequest): Promise<ReplayTrafficResponse> {
    const venue = request.session?.trackVenue || request.trackVenue;
    const course = request.session?.trackCourse || request.trackCourse;
    const spec = getCircuitSpecification(venue, course, request.sceneDesc, request.replayName, null, request.session?.trackLengthMeters);
    const centerline = spec.layoutKey !== 'unknown' ? this.loadCenterline(spec.layoutKey) : null;
    if (!centerline) return unavailable('This layout has no track centreline to place the cars on.');

    const lapSignature = this.store.getReplayLapSignature(request.replayName);
    if (!lapSignature) return unavailable('The replay has no stored laps yet.');
    const signature = `${lapSignature}|${RACE_POSITIONS_VERSION}|${spec.layoutKey}`;
    const positions = await this.getPositions(request.replayName, signature, centerline);

    const driver = positions.drivers.find((d) => d.slot === request.driverSlot);
    if (!driver) return unavailable('The driver has no stored laps in this replay.');
    const cars = carsOf(request);
    return {
      available: true,
      laps: driver.laps.map((lap) => ({
        lapNumber: lap.lapNumber,
        spells: findTrafficSpells(positions, request.driverSlot, lap.startSec, lap.endSec, cars),
      })),
    };
  }

  private getPositions(replayName: string, signature: string, centerline: Array<[number, number]>): Promise<RacePositions> {
    const stored = this.store.getRacePositions<RacePositions>(replayName, signature);
    if (stored) return Promise.resolve(stored);
    const key = `${replayName}|${signature}`;
    const pending = this.building.get(key);
    if (pending) return pending;
    const laps = this.store.listReplayLapRows(replayName);
    const built = this.build(laps, centerline)
      .then((positions) => {
        this.store.saveRacePositions(replayName, signature, positions);
        return positions;
      })
      .finally(() => this.building.delete(key));
    this.building.set(key, built);
    return built;
  }
}

/**
 * Each replay car's name and class. The class comes from the session's results by driver name:
 * the replay's own class is sometimes wrong (a Hypercar listed as LMGT3), so it is only a fallback.
 */
function carsOf(request: RaceTrafficRequest): Map<number, TrafficCarInfo> {
  const sessionClass = new Map((request.session?.drivers ?? []).map((d) => [d.name.trim().toLowerCase(), d.carClass]));
  return new Map(request.replayDrivers.map((d) => [d.slot, {
    name: d.name,
    carClass: sessionClass.get(d.name.trim().toLowerCase()) || d.carClass || undefined,
  }]));
}
