import { Database as DatabaseType } from 'better-sqlite3';
import type { DetailedSession, DriverData, LapData } from '../core/types.js';
import { getDriverEvents, getReplayLaps } from '../core/replay/dbReplayLapStore.js';
import { getStoredReplayTrajectory } from '../core/replay/dbReplayTrajectoryStore.js';
import {
  EnergyPoint, PitStopTimes, classMedianService, lineInPitLane, pitStopsFromEvents, serviceSeconds, stopEnergy, summarisePitService,
} from '../../shared/domain/pitStops.js';
import type { ReplayDriverEventFact } from '../replay/replayFacts.js';

const eventDriverName = (event: ReplayDriverEventFact) =>
  typeof event.detail?.driverName === 'string' ? event.detail.driverName : null;

/** The lap a stop belongs to: the pit in-lap that was under way when the car entered the pit lane. */
function inLapOf(driver: DriverData, stop: PitStopTimes): LapData | undefined {
  const started = (driver.laps ?? []).filter((lap) => typeof lap.elapsedSeconds === 'number' && lap.elapsedSeconds <= stop.entrySec);
  const lap = started.reduce<LapData | undefined>((last, l) => (!last || (l.elapsedSeconds as number) > (last.elapsedSeconds as number) ? l : last), undefined);
  return lap?.isPitStop ? lap : undefined;
}

/** The stored points of a driver's replay laps over a stop (the energy is only recorded for the player's car). */
function pointsOver(db: DatabaseType, replayName: string, slot: number, stop: PitStopTimes): EnergyPoint[] {
  const end = stop.exitSec ?? stop.completeSec ?? stop.entrySec;
  return getReplayLaps(db, replayName, slot)
    .filter((lap) => (lap.startSec ?? Infinity) <= end && (lap.endSec ?? -Infinity) >= stop.entrySec)
    .flatMap((lap) => getStoredReplayTrajectory(db, replayName, slot, lap.lapNumber)?.points ?? [])
    .flatMap((point) => typeof point.timeSec === 'number' ? [{ timeSec: point.timeSec, virtualEnergy: point.virtualEnergy }] : []);
}

/**
 * Sets `pitService` on every driver's in-laps from the linked replay's pit events: time in the pit
 * lane (and where the timing line fell in it) and on the jacks, the class's usual stop, and for
 * the player the energy refill and a guess at repairs when the stop ran well past both. Read-time
 * only: nothing is stored, so a replay
 * stored later (or a new rule) needs no re-parse.
 */
export function attachPitServices(db: DatabaseType, session: DetailedSession): void {
  // Session objects are cached: drop what an earlier call attached before any early return.
  for (const driver of [...(session.drivers ?? []), ...(session.playerDriver ? [session.playerDriver] : [])]) {
    for (const lap of driver.laps ?? []) delete lap.pitService;
  }
  const replayName = session.matchingReplayFile?.name;
  if (!replayName) return;
  const events = getDriverEvents(db, replayName).filter((e) => e.kind === 'pit' || e.kind === 'penalty_served');
  const byName = new Map<string, ReplayDriverEventFact[]>();
  for (const event of events) {
    const name = eventDriverName(event);
    if (name) byName.set(name, [...(byName.get(name) ?? []), event]);
  }
  if (byName.size === 0) return;

  const drivers = session.drivers ?? [];
  const stopsOf = new Map(drivers.map((driver) => {
    const own = byName.get(driver.name) ?? [];
    return [driver.name, { stops: pitStopsFromEvents(own.filter((e) => e.kind === 'pit')), own }] as const;
  }));
  const lapStarts = new Map<number, number[]>();
  for (const lap of getReplayLaps(db, replayName)) {
    if (lap.startSec !== null) lapStarts.set(lap.driverSlot, [...(lapStarts.get(lap.driverSlot) ?? []), lap.startSec]);
  }
  const classOf = (driver: DriverData) => (driver.carClass || '').toLowerCase();
  const playerName = session.playerDriver?.name;

  for (const driver of drivers) {
    const { stops, own } = stopsOf.get(driver.name) ?? { stops: [], own: [] };
    const slot = own[0]?.driverSlot;
    for (const stop of stops) {
      const lap = inLapOf(driver, stop);
      if (!lap) continue;
      const otherServices = drivers
        .filter((other) => classOf(other) === classOf(driver))
        .flatMap((other) => (stopsOf.get(other.name)?.stops ?? []).filter((s) => s !== stop).map(serviceSeconds))
        .filter((sec): sec is number => sec !== null);
      const end = stop.exitSec ?? Infinity;
      const penaltyServed = own.some((e) => e.kind === 'penalty_served' && e.timeSec >= stop.entrySec && e.timeSec <= end);
      const energy = driver.name === playerName && slot !== undefined ? stopEnergy(pointsOver(db, replayName, slot, stop), stop) : undefined;
      const lineSec = slot !== undefined ? lineInPitLane(stop, lapStarts.get(slot) ?? []) : undefined;
      lap.pitService = summarisePitService(stop, { classMedianServiceSec: classMedianService(otherServices), energy, penaltyServed, lineSec });
    }
  }
  if (playerName) {
    const player = drivers.find((d) => d.name === playerName);
    if (player) session.playerDriver = player;
  }
}
