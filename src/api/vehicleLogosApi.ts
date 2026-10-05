import { fetchJson } from './apiClient.js';

let cachedLogos: Record<string, string> | null = null;
let pendingPromise: Promise<Record<string, string> | null> | null = null;

export async function fetchVehicleLogos(): Promise<Record<string, string> | null> {
  if (cachedLogos !== null) return cachedLogos;
  if (pendingPromise !== null) return pendingPromise;
  pendingPromise = (async () => {
    try {
      const data = await fetchJson<{ packageRevision: string; logos: Record<string, string> }>(
        '/api/data-plugin/vehicles/logos'
      );
      cachedLogos = data.logos ?? {};
      return cachedLogos;
    } catch {
      return null;
    } finally {
      pendingPromise = null;
    }
  })();
  return pendingPromise;
}

export function getCachedVehicleLogos(): Record<string, string> | null {
  return cachedLogos;
}

export function setCachedVehicleLogos(logos: Record<string, string> | null): void {
  cachedLogos = logos;
}

export function clearCachedVehicleLogos(): void {
  cachedLogos = null;
  pendingPromise = null;
}
