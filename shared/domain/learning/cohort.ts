import type { LivePerLapSource } from '../../types/liveStrategy.js';

export interface LearningIdentity {
  layoutKey: string | null;
  vehicleModel: string | null;
  driverName: string;
  gameVersion: string | null;
  condition: string | null;
  compound: string | null;
  modelVersion: number | null;
  predictionSource: LivePerLapSource | null;
}

/** One exact compatibility contract for fitting and live lookup. Unknown identity never matches. */
export function learningCohort(identity: LearningIdentity): string | null {
  const fields = [identity.layoutKey, identity.vehicleModel, identity.driverName, identity.gameVersion,
    identity.condition, identity.compound, identity.modelVersion, identity.predictionSource];
  return fields.some(field => field === null || field === '' || field === undefined) ? null : JSON.stringify(fields);
}
