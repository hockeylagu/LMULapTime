import { describeTurn } from '../../shared/domain/circuitTurns/turnLabel.js';
import { numberedTurnNames, sequenceTurnsText } from '../../shared/domain/cornerSequences/sequenceLabel.js';
import type { LapConditions, NonRepresentativeReason } from '../../shared/types/index.js';
import type {
  CornerPass, CornerPassCar, CornerPassContact, CornerPassLap, CornerTurn, LayoutCorners, SessionCornerPasses,
} from '../../shared/types/corners/cornerPasses.js';
import type { CornerPassBuild, PassKind } from '../core/replay/dbCornerPassStore.js';
import type { StoredSequenceMap } from '../core/replay/dbSequenceMapStore.js';
import {
  mapRuleHash, placeLayout, planLayoutCornerPasses, planSequencePasses, sequenceSegments, type PlacedLayout, type TrackLoader,
} from './cornerPassService.js';

export interface CornerPassReader {
  getReplayLapSignature(filename: string): string | null;
  getCornerPassBuild(filename: string, kind?: PassKind): CornerPassBuild | null;
  listCornerPasses(filename: string, kind?: PassKind): CornerPass[];
  /** The replay's laps of every car, with the flags the parser set (`cornerPassLaps`). */
  listCornerPassLaps(filename: string): CornerPassLap[];
  listContacts(filename: string): CornerPassContact[];
  /** Sequences only: each car's class as the build read it (slot to class), and a layout and class's map. */
  classesBySlot?(): ReadonlyMap<number, string>;
  getSequenceMap?(layoutKey: string, carClass: string): StoredSequenceMap | null;
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
 * A class's sequences as the card reads them: each from its start to the next one's start, labelled SQ1, SQ2… in lap
 * order (the driver's choice, 2026-11-19), titled by the turns it is called by (its exit turns left out), with its
 * slowest point as the apex.
 */
function sequenceTurns(plan: PlacedLayout, carClass: string, map: StoredSequenceMap): CornerTurn[] {
  const byId = new Map(map.sequences.map(sequence => [sequence.turnIds[0], sequence]));
  return sequenceSegments(map, plan.lengthM).flatMap((segment, index) => {
    const sequence = byId.get(segment.id);
    if (!sequence) return [];
    const named = sequence.turnIds.filter(id => !sequence.exitTurnIds.includes(id));
    const turns = sequenceTurnsText(plan.layoutKey, plan.turns, named);
    // Bends sharing one name (Le Mans' Porsche Curves, Monza's Variante Ascari) name it once.
    const exitText = sequenceTurnsText(plan.layoutKey, plan.turns, sequence.exitTurnIds, numberedTurnNames(plan.layoutKey, plan.turns, named));
    const exits = !exitText ? '' : exitText === turns ? ', flat on the exit' : `, then ${exitText} flat on the exit`;
    return [{
      id: segment.id, label: `SQ${index + 1}`, apexM: sequence.minM, startM: segment.startM, endM: segment.endM,
      title: `${turns}${exits}: from where the speed drops for it to where it drops for the next corner`,
      sequence: { carClass, turnIds: sequence.turnIds },
    }];
  });
}

/** The layout's official turns, labelled. */
const officialTurns = (layout: PlacedLayout): CornerTurn[] => layout.turns.map(turn => {
  const { label, title } = describeTurn(turn);
  return { id: turn.id, label, title, apexM: turn.apexM, startM: turn.startM, endM: turn.endM };
});

/**
 * A layout's corners for a class, for any lap of it (the lap view's corner windows): the class's map as it stands
 * (one of the layout's current turn placing), else the official turns; null without a centre line.
 */
export function layoutCorners(
  layoutKey: string, carClass: string, getSequenceMap: (layoutKey: string, carClass: string) => StoredSequenceMap | null,
  loadTrack?: TrackLoader
): LayoutCorners | null {
  const layout = placeLayout(layoutKey, loadTrack);
  if (!layout) return null;
  const map = carClass ? getSequenceMap(layoutKey, carClass) : null;
  const current = map?.mapKey.startsWith(`${mapRuleHash(layout.turnsKey)}:`) ? map : null;
  return {
    kind: current ? 'sequences' : 'turns',
    startStationM: layout.startStationM,
    lengthM: layout.lengthM,
    corners: current ? sequenceTurns(layout, carClass, current) : officialTurns(layout),
  };
}

export interface ReadCornerPassOptions {
  /** One car's rows only. */
  slot?: number;
  /** The official turns (default) or each class's turn sequences. */
  kind?: PassKind;
  loadTrack?: TrackLoader;
}

/**
 * A session replay's corner passes with the turns (or the class sequences) they cut, the cars they met, their laps
 * and the contacts; every car's, or one car's. Passes of another build (pass rule, turn lists, centre line, stored
 * laps or a class's map changed since) are not served: they wait for the rebuild, never a build on open.
 */
export function readSessionCornerPasses(
  reader: CornerPassReader,
  replayName: string,
  cars: CornerPassCar[],
  { slot, kind = 'turns', loadTrack }: ReadCornerPassOptions = {}
): SessionCornerPasses {
  const build = reader.getCornerPassBuild(replayName, kind);
  if (!build) return { available: false, reason: 'Corner times are not built for this replay yet.' };
  const plan = planLayoutCornerPasses(build.layoutKey, reader.getReplayLapSignature(replayName), loadTrack);
  if ('reason' in plan) return { available: false, reason: `Corner times are unavailable: ${plan.reason}.` };
  let turns: CornerTurn[];
  let versionKey = plan.versionKey;
  if (kind === 'sequences') {
    const sequences = planSequencePasses(plan, reader.classesBySlot?.() ?? new Map(), (layoutKey, carClass) => reader.getSequenceMap?.(layoutKey, carClass) ?? null);
    versionKey = sequences.versionKey;
    // One car's: its own class's sequences only (another class's ids would name other corners).
    const maps = slot === undefined ? sequences.maps : sequences.maps.filter(item => item.slots.includes(slot));
    turns = maps.flatMap(({ carClass, map }) => sequenceTurns(plan, carClass, map));
  } else {
    turns = officialTurns(plan);
  }
  if (versionKey !== build.versionKey) {
    return { available: false, reason: 'Corner times are from an older build; they are rebuilt offline.' };
  }
  if (kind === 'sequences' && turns.length === 0) {
    return { available: false, reason: slot === undefined ? 'No class of this replay has a corner map on this track yet.' : "The car's class has no corner map on this track yet." };
  }
  const ofCar = <T extends { slot: number }>(rows: T[]) => (slot === undefined ? rows : rows.filter(row => row.slot === slot));
  return {
    available: true,
    layoutKey: plan.layoutKey,
    startStationM: plan.startStationM,
    trackLengthM: plan.lengthM,
    turns,
    cars,
    passes: ofCar(reader.listCornerPasses(replayName, kind)),
    laps: ofCar(reader.listCornerPassLaps(replayName)),
    contacts: ofCar(reader.listContacts(replayName)),
  };
}
