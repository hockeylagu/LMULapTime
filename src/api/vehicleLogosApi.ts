import { fetchJson } from './apiClient.js';

let cachedLogos: Record<string, string> | null = null;
let pendingPromise: Promise<Record<string, string> | null> | null = null;
let failedAt: number | null = null;
let cacheGeneration = 0;
const listeners = new Set<(generation: number) => void>();
let vehicleLogoSource: string | null = null;

export function subscribeVehicleLogos(listener: (generation: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyChanged(): void {
  for (const listener of listeners) listener(cacheGeneration);
}

export function getVehicleLogoCacheGeneration(): number {
  return cacheGeneration;
}

/** Invalidate logos when the source server process or local data package changes. */
export function setVehicleLogoSource(source: string): void {
  if (vehicleLogoSource === null) {
    vehicleLogoSource = source;
  } else if (vehicleLogoSource !== source) {
    vehicleLogoSource = source;
    clearCachedVehicleLogos();
  }
}

/** After a failed fetch, mounting components get the failure from memory for this long before one retries. */
export const LOGO_RETRY_COOLDOWN_MS = 60_000;

export async function fetchVehicleLogos(): Promise<Record<string, string> | null> {
  if (cachedLogos !== null) return cachedLogos;
  if (pendingPromise !== null) return pendingPromise;
  if (failedAt !== null && Date.now() - failedAt < LOGO_RETRY_COOLDOWN_MS) return null;
  const requestGeneration = cacheGeneration;
  pendingPromise = (async () => {
    try {
      const data = await fetchJson<{ packageRevision: string; logos: Record<string, string> }>(
        '/api/data-plugin/vehicles/logos'
      );
      if (requestGeneration !== cacheGeneration) return cachedLogos;
      cachedLogos = data.logos ?? {};
      failedAt = null;
      notifyChanged();
      return cachedLogos;
    } catch {
      if (requestGeneration === cacheGeneration) failedAt = Date.now();
      return null;
    } finally {
      if (requestGeneration === cacheGeneration) pendingPromise = null;
    }
  })();
  return pendingPromise;
}

export function getCachedVehicleLogos(): Record<string, string> | null {
  return cachedLogos;
}

export function setCachedVehicleLogos(logos: Record<string, string> | null): void {
  cacheGeneration++;
  cachedLogos = logos;
  pendingPromise = null;
  failedAt = null;
  notifyChanged();
}

export function clearCachedVehicleLogos(): void {
  cacheGeneration++;
  cachedLogos = null;
  pendingPromise = null;
  failedAt = null;
  notifyChanged();
}
