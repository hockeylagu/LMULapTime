import type { LiveCaptureObservation } from '../../../shared/types/liveCapture.js';

/** File-scoped dictionary definitions live with observations and survive reader/controller restarts. */
export function internTerrainObservations(observations: LiveCaptureObservation[], definitions: string[]): LiveCaptureObservation[] {
  const materials = new Map<string, number>();
  const ids = new Set<number>();
  let nextId = 0;
  for (const json of definitions) {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || !('rawName' in value) || typeof value.rawName !== 'string'
      || !('materialId' in value) || typeof value.materialId !== 'number' || !Number.isSafeInteger(value.materialId)
      || value.materialId < 0 || materials.has(value.rawName) || ids.has(value.materialId)) throw new Error('Invalid terrain dictionary');
    materials.set(value.rawName, value.materialId); ids.add(value.materialId);
    nextId = Math.max(nextId, value.materialId + 1);
  }
  const result: LiveCaptureObservation[] = [];
  for (const observation of observations) {
    if (observation.source !== 'shared-memory' || observation.kind !== 'terrain-change') { result.push(observation); continue; }
    const data = observation.data;
    if (!data || typeof data !== 'object' || !('rawName' in data) || typeof data.rawName !== 'string' || data.rawName.length > 16
      || !('corner' in data) || typeof data.corner !== 'string' || !['FL', 'FR', 'RL', 'RR'].includes(data.corner)) {
      throw new Error('Invalid terrain-change observation');
    }
    let materialId: number | null = data.rawName === '' ? null : materials.get(data.rawName) ?? null;
    if (materialId === null && data.rawName !== '') {
      if (!Number.isSafeInteger(nextId)) throw new Error('Terrain dictionary ID exceeds the safe integer range');
      materialId = nextId++;
      materials.set(data.rawName, materialId);
      result.push({ source: 'recorder', kind: 'terrain-material', elapsedSeconds: null, receivedAt: observation.receivedAt,
        data: { materialId, rawName: data.rawName } });
    }
    result.push({ ...observation, data: { corner: data.corner, materialId } });
  }
  return result;
}
