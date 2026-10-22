import type { LiveNavigation } from '../../shared/domain/live/liveIdentity.js';
import type { GameProbe } from './liveReader.js';

/**
 * LMU's navigation state, read for the identity of the loaded session and (by the shared memory reader) to learn
 * whether LMU is on its menu or loading. `127.0.0.1`, never `localhost` (which tries IPv6 first and waits about 2 s).
 * The pit data reads are in `lmuPitRest.ts`.
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

/**
 * `loadingStatus.loadingData` is a JSON string: `trackInfo.sceneDesc` is the layout, `selectedCar.classes` the class hint
 * and `selectedCar.vehFile` the car's vehicle file (shared memory names only the entry).
 */
export function parseNavigationState(body: unknown): LiveNavigation | null {
  const status = asRecord(asRecord(body)?.loadingStatus);
  const loading = parseJson(status?.loadingData);
  const sceneDesc = asRecord(loading?.trackInfo)?.sceneDesc ?? asRecord(status?.track)?.sceneDesc;
  const selectedCar = asRecord(loading?.selectedCar);
  const classes = selectedCar?.classes;
  if (typeof sceneDesc !== 'string' && !Array.isArray(classes)) return null;
  return {
    sceneDesc: typeof sceneDesc === 'string' && sceneDesc.trim() ? sceneDesc.trim() : null,
    classes: Array.isArray(classes) ? classes.filter((name): name is string => typeof name === 'string') : [],
    vehFile: typeof selectedCar?.vehFile === 'string' && selectedCar.vehFile.trim() ? selectedCar.vehFile.trim() : null,
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

/**
 * Whether a replay is playing, from `state.settingMode`: `SETTING_REPLAY_PLAYBACK` in a replay (seen 2026-10-16;
 * `SETTING_GRANDPRIX` offline, `SETTING_MULTIPLAYER` online). Null when the field is missing.
 */
export function parseReplayPlayback(body: unknown): boolean | null {
  const mode = asRecord(asRecord(body)?.state)?.settingMode;
  return typeof mode === 'string' ? mode === 'SETTING_REPLAY_PLAYBACK' : null;
}

/**
 * LMU's main menu from the answer's `state.navigationState` (seen live: `NAV_MAIN_MENU`, `NAV_EVENT`, `NAV_REALTIME`),
 * and a session loading from `loadingStatus.loading` with `percentage` 0..1 (-1 when not loading). LMU clears
 * `loading` a few seconds before the session is in (frozen, the buffer not yet written): `internalStateCode`
 * stays `OP_TO_REALTIME` until then (seen 2026-10-16 through `GSTATE_INIT` and `GSTATE_RESTART`), so that is
 * still loading, with no progress. Explicit loading wins over a stale NAV_MAIN_MENU label during transition.
 * A loaded replay is `replay` (parseReplayPlayback). An answer that is not JSON
 * (a game shutting down) says nothing: `busy`.
 */
export function navigationProbe(body: string): GameProbe {
  try {
    const answer = JSON.parse(body) as {
      state?: { navigationState?: unknown; internalStateCode?: unknown };
      loadingStatus?: { loading?: unknown; percentage?: unknown };
    };
    if (answer.loadingStatus?.loading === true) {
      const progress = answer.loadingStatus.percentage;
      return { loading: typeof progress === 'number' && progress >= 0 && progress <= 1 ? Math.round(progress * 100) / 100 : null };
    }
    if (answer.state?.internalStateCode === 'OP_TO_REALTIME') return { loading: null };
    if (answer.state?.navigationState === 'NAV_MAIN_MENU') return 'menu';
    return parseReplayPlayback(answer) ? 'replay' : 'session';
  } catch {
    return 'busy';
  }
}
