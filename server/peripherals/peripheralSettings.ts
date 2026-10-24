import type { PeripheralSettings, SelectedDevice } from '../../shared/types/peripherals/peripherals.js';
import type { SessionDatabase } from '../core/db.js';

type Store = Pick<SessionDatabase, 'getMetadata' | 'setMetadata'>;
export const DEFAULT_PERIPHERAL_SETTINGS: PeripheralSettings = { enabled: false, automatic: true, wheel: null };
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,39})$/.test(value);
function isDevice(value: unknown): value is SelectedDevice | null {
  return value === null || (isRecord(value) && isUuid(value.productUuid) && isUuid(value.deviceUuid) && typeof value.name === 'string' && value.name.length <= 200);
}
export function isPeripheralSettings(value: unknown): value is PeripheralSettings {
  return isRecord(value) && typeof value.enabled === 'boolean' && typeof value.automatic === 'boolean' && isDevice(value.wheel);
}
export function loadPeripheralSettings(store: Store): PeripheralSettings {
  try {
    const value: unknown = JSON.parse(store.getMetadata('peripheral_settings:simagic') ?? 'null');
    // Only the known fields: an unknown key in the stored JSON never round-trips.
    return isPeripheralSettings(value) ? { enabled: value.enabled, automatic: value.automatic, wheel: value.wheel } : { ...DEFAULT_PERIPHERAL_SETTINGS };
  } catch { return { ...DEFAULT_PERIPHERAL_SETTINGS }; }
}
export function savePeripheralSettings(store: Store, value: PeripheralSettings): void {
  store.setMetadata('peripheral_settings:simagic', JSON.stringify(value));
}
