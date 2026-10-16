import type { LiveNavigation } from '../../shared/domain/live/liveIdentity.js';

/**
 * The only LMU REST endpoint the live dashboard reads. `127.0.0.1`, never `localhost` (which tries IPv6
 * first and waits about 2 s). Garage paths crashed the game in the past: nothing else is ever requested.
 */
export const LMU_NAVIGATION_URL = 'http://127.0.0.1:6397/navigation/state';
export const NAVIGATION_TIMEOUT_MS = 2000;

export interface NavigationResponse { status: number; json(): Promise<unknown> }
export type NavigationFetch = (url: string, init: { signal: AbortSignal }) => Promise<NavigationResponse>;
export type NavigationRead = { ok: true; navigation: LiveNavigation } | { ok: false };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

function parseJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  try { return asRecord(JSON.parse(text)); } catch { return null; }
}

/** `loadingStatus.loadingData` is a JSON string: `trackInfo.sceneDesc` is the layout, `selectedCar.classes` the class hint. */
export function parseNavigationState(body: unknown): LiveNavigation | null {
  const status = asRecord(asRecord(body)?.loadingStatus);
  const loading = parseJson(status?.loadingData);
  const sceneDesc = asRecord(loading?.trackInfo)?.sceneDesc ?? asRecord(status?.track)?.sceneDesc;
  const classes = asRecord(loading?.selectedCar)?.classes;
  if (typeof sceneDesc !== 'string' && !Array.isArray(classes)) return null;
  return {
    sceneDesc: typeof sceneDesc === 'string' && sceneDesc.trim() ? sceneDesc.trim() : null,
    classes: Array.isArray(classes) ? classes.filter((name): name is string => typeof name === 'string') : [],
  };
}

/** One GET of the navigation state. Never throws: any failure, non-200 status or answer slower than 2 s is `ok: false`. */
export async function readNavigationState(
  fetchState: NavigationFetch = fetch as unknown as NavigationFetch,
  timeoutMs = NAVIGATION_TIMEOUT_MS,
): Promise<NavigationRead> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<NavigationRead>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve({ ok: false }); }, timeoutMs);
  });
  const request = (async (): Promise<NavigationRead> => {
    try {
      const response = await fetchState(LMU_NAVIGATION_URL, { signal: controller.signal });
      if (response.status !== 200) return { ok: false };
      const navigation = parseNavigationState(await response.json());
      return navigation ? { ok: true, navigation } : { ok: false };
    } catch {
      return { ok: false };
    }
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
