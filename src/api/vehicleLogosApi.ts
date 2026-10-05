import { fetchJson } from './apiClient.js';

let cachedLogos: Record<string, string> | null = null;
let pendingPromise: Promise<Record<string, string> | null> | null = null;
let failedAt: number | null = null;

/** After a failed fetch, mounting components get the failure from memory for this long before one retries. */
export const LOGO_RETRY_COOLDOWN_MS = 60_000;

export async function fetchVehicleLogos(): Promise<Record<string, string> | null> {
  if (cachedLogos !== null) return cachedLogos;
  if (pendingPromise !== null) return pendingPromise;
  if (failedAt !== null && Date.now() - failedAt < LOGO_RETRY_COOLDOWN_MS) return null;
  pendingPromise = (async () => {
    try {
      const data = await fetchJson<{ packageRevision: string; logos: Record<string, string> }>(
        '/api/data-plugin/vehicles/logos'
      );
      cachedLogos = data.logos ?? {};
      failedAt = null;
      return cachedLogos;
    } catch {
      failedAt = Date.now();
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
  failedAt = null;
}

export function clearCachedVehicleLogos(): void {
  cachedLogos = null;
  pendingPromise = null;
  failedAt = null;
}
