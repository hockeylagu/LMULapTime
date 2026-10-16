import type { LiveSettings } from '../../shared/types/live.js';
import type { SessionDatabase } from '../core/db.js';

const AUTO_OPEN_KEY = 'live_auto_open';
const RESERVE_KEY = 'live_reserve_laps';

/** Reserve choices offered in Settings, in laps; half a lap by default. */
export const RESERVE_LAP_CHOICES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2] as const;
export const DEFAULT_RESERVE_LAPS = 0.5;

type SettingsStore = Pick<SessionDatabase, 'getMetadata' | 'setMetadata'>;

export const isReserveLaps = (value: unknown): value is number =>
  typeof value === 'number' && (RESERVE_LAP_CHOICES as readonly number[]).includes(value);

/** Auto-open is on until the driver turns it off; the reserve is half a lap until changed. */
export function loadLiveSettings(store: SettingsStore): LiveSettings {
  const reserve = Number(store.getMetadata(RESERVE_KEY));
  return {
    autoOpen: store.getMetadata(AUTO_OPEN_KEY) !== 'false',
    reserveLaps: store.getMetadata(RESERVE_KEY) !== null && isReserveLaps(reserve) ? reserve : DEFAULT_RESERVE_LAPS,
  };
}

export function saveLiveSettings(store: SettingsStore, settings: LiveSettings): void {
  store.setMetadata(AUTO_OPEN_KEY, settings.autoOpen ? 'true' : 'false');
  store.setMetadata(RESERVE_KEY, String(settings.reserveLaps));
}
