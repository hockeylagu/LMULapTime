import type { DeviceCatalog, LoadedPeripheralPresets, MappingChange, MappingData, MappingSuggestion, PeripheralCar, PeripheralDevice, PeripheralRun, PeripheralSettings, PeripheralStatus } from '../../shared/types/peripherals/peripherals.js';
import { fetchJson, postJson } from './apiClient.js';

const ROOT = '/api/peripherals';
export function fetchPeripherals(signal?: AbortSignal): Promise<PeripheralStatus[]> { return fetchJson(ROOT, { signal }); }
export function refreshPeripheralHealth(signal?: AbortSignal): Promise<PeripheralStatus> { return postJson(`${ROOT}/simagic/health/refresh`, undefined, { signal }); }
export function fetchPeripheralDevices(signal?: AbortSignal): Promise<PeripheralDevice[]> { return fetchJson(`${ROOT}/simagic/devices`, { signal }); }
export function fetchLoadedPresets(signal?: AbortSignal): Promise<LoadedPeripheralPresets> { return fetchJson(`${ROOT}/simagic/loaded-presets`, { signal }); }
export function fetchPresetCatalog(signal?: AbortSignal): Promise<DeviceCatalog | null> { return fetchJson(`${ROOT}/simagic/presets`, { signal }); }
export function fetchPresetMappings(signal?: AbortSignal): Promise<MappingData> { return fetchJson(`${ROOT}/simagic/mappings`, { signal }); }
export function savePeripheralSettings(settings: PeripheralSettings): Promise<PeripheralStatus> {
  return fetchJson(`${ROOT}/simagic/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
}
export function savePresetMappings(rows: MappingChange[]): Promise<MappingData> {
  return fetchJson(`${ROOT}/simagic/mappings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) });
}
export function refreshPresetCatalog(): Promise<DeviceCatalog | null> { return postJson(`${ROOT}/simagic/presets/refresh`); }
export function suggestPresetMappings(overwrite: boolean): Promise<MappingSuggestion[]> { return postJson(`${ROOT}/simagic/mappings/suggest`, { overwrite }); }
export function applyCarPreset(car: PeripheralCar): Promise<PeripheralRun> {
  return postJson(`${ROOT}/simagic/apply`, { ...(car.model ? { model: car.model } : {}), ...(car.carClass ? { carClass: car.carClass } : {}) });
}
