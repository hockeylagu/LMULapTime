import type { LiveSettings } from '../../shared/types/live.js';
import { DEFAULT_LIVE_SETTINGS, PEDAL_TRACE_SECONDS_CHOICES, RESERVE_LAP_CHOICES } from '../../shared/types/live.js';
import type { SessionDatabase } from '../core/db.js';

const AUTO_OPEN_KEY = 'live_auto_open';
const RESERVE_KEY = 'live_reserve_laps';
const PEDAL_TRACE_KEY = 'live_pedal_trace_seconds';

type SettingsStore = Pick<SessionDatabase, 'getMetadata' | 'setMetadata'>;

export const isReserveLaps = (value: unknown): value is number =>
  typeof value === 'number' && (RESERVE_LAP_CHOICES as readonly number[]).includes(value);

export const isPedalTraceSeconds = (value: unknown): value is number =>
  typeof value === 'number' && (PEDAL_TRACE_SECONDS_CHOICES as readonly number[]).includes(value);

/** Auto-open is on until the driver turns it off; the reserve is half a lap until changed. */
export function loadLiveSettings(store: SettingsStore): LiveSettings {
  const reserve = Number(store.getMetadata(RESERVE_KEY));
  const pedalTrace = Number(store.getMetadata(PEDAL_TRACE_KEY));
  return {
    autoOpen: store.getMetadata(AUTO_OPEN_KEY) !== 'false',
    reserveLaps: store.getMetadata(RESERVE_KEY) !== null && isReserveLaps(reserve) ? reserve : DEFAULT_LIVE_SETTINGS.reserveLaps,
    pedalTraceSeconds: isPedalTraceSeconds(pedalTrace) ? pedalTrace : DEFAULT_LIVE_SETTINGS.pedalTraceSeconds,
  };
}

export function saveLiveSettings(store: SettingsStore, settings: LiveSettings): void {
  store.setMetadata(AUTO_OPEN_KEY, settings.autoOpen ? 'true' : 'false');
  store.setMetadata(RESERVE_KEY, String(settings.reserveLaps));
  store.setMetadata(PEDAL_TRACE_KEY, String(settings.pedalTraceSeconds));
}
