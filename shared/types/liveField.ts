/** One car of the field as the scoring buffer gives it, about five times a second (the radio's incident and traffic calls). */
export interface LiveFieldCar {
  id: number;
  isPlayer: boolean;
  place: number;
  /** The game's class name; resolve through `knownCarClass`. */
  vehicleClass: string;
  /** The entry name (the livery) and the vehicle file id: `resolveVehicle` names the car from either. */
  vehicleName: string;
  vehFilename: string;
  totalLaps: number;
  /** rF2 `mSector`: 1 and 2 are sectors 1 and 2, 0 is sector 3. */
  sector: number;
  /** Metres from the start line along the lap; negative before the car first crosses it. */
  lapDist: number;
  /** Metres per second, from the car's local velocity. */
  speed: number;
  /** Metres right (positive) or left of the game's centre path, and the track edge on that side (signed the same way). */
  pathLateral: number;
  trackEdge: number;
  inPits: boolean;
  inGarage: boolean;
  /** rF2 `mControl`: 0 local player, 1 AI, 2 remote, 3 replay or driverless. */
  control: number;
  /** rF2 `mFinishStatus`: 0 running, 1 finished, 2 retired, 3 disqualified. */
  finishStatus: number;
}

/**
 * Whether the event's qualifying and practice are private (`GET /rest/sessions`: `SESSSET_private_qual`,
 * `SESSSET_private_prac`): every car is in the scoring data but none is on the player's track.
 */
export interface LivePrivateSessions { qualifying: boolean; practice: boolean }

/** The game's sector flags and every car of the field, read with each scoring change. */
export interface LiveFieldReading {
  /** rF2 `mSectorFlag`, sectors 1-3: 1 is yellow, 11 green (Portimão, 2026-10-29). */
  sectorFlags: [number, number, number];
  cars: LiveFieldCar[];
}
