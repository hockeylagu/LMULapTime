import { CIRCUIT_SPECIFICATIONS } from '../circuitDefinitions.js';
import { getCircuitSpecification } from '../circuitSpecs.js';
import { mapVehicleIdToClass } from '../vehicleMapping.js';
import type { LiveIdentity, LiveSessionInfo } from '../../types/live.js';

/** What the game's navigation state says about the loaded event. */
export interface LiveNavigation {
  /** LMU `trackInfo.sceneDesc`, the exact layout. */
  sceneDesc: string | null;
  /** `selectedCar.classes`: the car's class names, a hint when the vehicle name is not recognized. */
  classes: string[];
}

/** Looks up the player's personal record on a layout and class; null when unknown. */
export type PersonalBestLookup = (layoutKey: string, carClass: string) => number | null;

/**
 * The canonical layout key, or null when unresolved. The exact LMU `sceneDesc` decides when it is known;
 * without it only a facility with a single layout resolves from the track name. Layouts of one
 * facility are never guessed between (AGENTS.md section 3A).
 */
function resolveLayout(trackName: string, sceneDesc: string | null) {
  const spec = getCircuitSpecification(trackName, null, sceneDesc);
  if (CIRCUIT_SPECIFICATIONS[spec.layoutKey] !== spec) return null;
  const exact = sceneDesc !== null && spec.sceneDescs.includes(sceneDesc.toLowerCase().replace(/\.scn$/i, '').trim());
  if (exact) return spec;
  const siblings = Object.values(CIRCUIT_SPECIFICATIONS).filter(other => other.circuitId === spec.circuitId);
  return siblings.length === 1 ? spec : null;
}

/** Layout, class and personal record of the loaded session. Pure; the record comes from `personalBest`. */
export function resolveLiveIdentity(
  session: Pick<LiveSessionInfo, 'trackName' | 'vehicleName' | 'vehicleClass'>,
  navigation: LiveNavigation | null,
  personalBest: PersonalBestLookup,
): LiveIdentity {
  const spec = resolveLayout(session.trackName, navigation?.sceneDesc ?? null);
  const carClass = mapVehicleIdToClass(session.vehicleName, session.vehicleClass)
    || (navigation?.classes ?? []).map(name => mapVehicleIdToClass(name)).find(Boolean)
    || null;
  return {
    layoutKey: spec?.layoutKey ?? null,
    layoutName: spec?.layoutName ?? session.trackName,
    carClass,
    personalBestSeconds: spec && carClass ? personalBest(spec.layoutKey, carClass) : null,
  };
}
