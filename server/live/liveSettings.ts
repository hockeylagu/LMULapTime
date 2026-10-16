import type { LiveSettings } from '../../shared/types/live.js';
import type { SessionDatabase } from '../core/db.js';

const AUTO_OPEN_KEY = 'live_auto_open';

type SettingsStore = Pick<SessionDatabase, 'getMetadata' | 'setMetadata'>;

/** Auto-open is on until the driver turns it off. */
export function loadLiveSettings(store: SettingsStore): LiveSettings {
  return { autoOpen: store.getMetadata(AUTO_OPEN_KEY) !== 'false' };
}

export function saveLiveSettings(store: SettingsStore, settings: LiveSettings): void {
  store.setMetadata(AUTO_OPEN_KEY, settings.autoOpen ? 'true' : 'false');
}
