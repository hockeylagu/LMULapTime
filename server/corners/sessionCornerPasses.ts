import { describeTurn } from '../../shared/domain/circuitTurns/turnLabel.js';
import type { LapConditions, NonRepresentativeReason } from '../../shared/types/index.js';
import type {
  CornerPass, CornerPassCar, CornerPassContact, CornerPassLap, SessionCornerPasses,
} from '../../shared/types/corners/cornerPasses.js';
import type { CornerPassBuild } from '../core/replay/dbCornerPassStore.js';
import { planLayoutCornerPasses, type TrackLoader } from './cornerPassService.js';

export interface CornerPassReader {
  getReplayLapSignature(filename: string): string | null;
  getCornerPassBuild(filename: string): CornerPassBuild | null;
  listCornerPasses(filename: string): CornerPass[];
  /** The replay's laps of every car, with the flags the parser set (`cornerPassLaps`). */
  listCornerPassLaps(filename: string): CornerPassLap[];
  listContacts(filename: string): CornerPassContact[];
}

/** A replay lap as stored (its clock and the replay's own flags). */
interface ReplayLap {
  driverSlot: number;
  lapNumber: number;
  startSec: number | null;
  endSec: number | null;
  isOutLap: boolean | null;
  isValid: boolean | null;
}

/** A session lap's flags, as the parser set them. */
interface SessionLapFlags {
  lapNumber: number;
  isValid?: boolean;
  isPitStop?: boolean;
  isOutLap?: boolean;
  nonRepresentativeReason?: NonRepresentativeReason;
  conditions?: LapConditions;
}

/**
 * Every replay lap with the parser's flags: the session's results lap of the car's driver (by lap number), else
 * the replay's own (no pit stop, dry) for a car that is no session driver or a lap the results do not hold. A lap
 * without a clock (none stored) is left out: no pass lies in it.
 */
export function cornerPassLaps(
  replayLaps: readonly ReplayLap[],
  cars: readonly CornerPassCar[],
  sessionLaps: (driverOrdinal: number) => readonly SessionLapFlags[] | undefined,
): CornerPassLap[] {
  const byCar = new Map<number, Map<number, SessionLapFlags>>();
  for (const car of cars) {
    const laps = car.sessionDriverOrdinal === undefined ? undefined : sessionLaps(car.sessionDriverOrdinal);
    if (laps) byCar.set(car.slot, new Map(laps.map(lap => [lap.lapNumber, lap])));
  }
  return replayLaps.flatMap(lap => {
    if (lap.startSec === null || lap.endSec === null) return [];
    const flags = byCar.get(lap.driverSlot)?.get(lap.lapNumber);
    return [{
      slot: lap.driverSlot, lapNumber: lap.lapNumber, startSec: lap.startSec, endSec: lap.endSec,
      isValid: flags ? flags.isValid !== false : lap.isValid !== false,
      isPitStop: Boolean(flags?.isPitStop),
      isOutLap: Boolean(flags ? flags.isOutLap : lap.isOutLap),
      ...(flags?.nonRepresentativeReason ? { nonRepresentativeReason: flags.nonRepresentativeReason } : {}),
      wet: Boolean(flags?.conditions),
    }];
  });
}

/**
 * A session replay's corner passes with the turns they cut, the cars they met, their laps and the contacts; every
 * car's, or one car's (`slot`). Passes of another build (pass rule, turn lists, centre line or stored laps changed
 * since) are not served: they wait for the offline rebuild, never a build on open.
 */
export function readSessionCornerPasses(
  reader: CornerPassReader,
  replayName: string,
  cars: CornerPassCar[],
  slot?: number,
  loadTrack?: TrackLoader
): SessionCornerPasses {
  const build = reader.getCornerPassBuild(replayName);
  if (!build) return { available: false, reason: 'Corner times are not built for this replay yet.' };
  const plan = planLayoutCornerPasses(build.layoutKey, reader.getReplayLapSignature(replayName), loadTrack);
  if ('reason' in plan) return { available: false, reason: `Corner times are unavailable: ${plan.reason}.` };
  if (plan.versionKey !== build.versionKey) {
    return { available: false, reason: 'Corner times are from an older build; they are rebuilt offline.' };
  }
  const ofCar = <T extends { slot: number }>(rows: T[]) => (slot === undefined ? rows : rows.filter(row => row.slot === slot));
  return {
    available: true,
    layoutKey: plan.layoutKey,
    startStationM: plan.startStationM,
    trackLengthM: plan.lengthM,
    turns: plan.turns.map(turn => {
      const { label, title } = describeTurn(turn);
      return { id: turn.id, label, title, apexM: turn.apexM, startM: turn.startM, endM: turn.endM };
    }),
    cars,
    passes: ofCar(reader.listCornerPasses(replayName)),
    laps: ofCar(reader.listCornerPassLaps(replayName)),
    contacts: ofCar(reader.listContacts(replayName)),
  };
}
