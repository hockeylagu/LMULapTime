import type { PeripheralDevice, PeripheralHealth, PeripheralPreset } from '../../shared/types/peripherals/peripherals.js';

export const PERIPHERAL_CONTRACT_VERSION = 1;
export interface PeripheralHostContext {
  log(level: 'info' | 'warn' | 'error', message: string): void;
  now(): number;
}
export type PresetList = { ok: true; presets: PeripheralPreset[] } | { ok: false; error: string };
export type ActivePreset = { ok: true; presetUuid: string } | { ok: false; error: string };
export type SelectResult = { outcome: 'accepted' } | { outcome: 'rejected' | 'uncertain'; error: string };
export interface PeripheralPlugin {
  id: string;
  label: string;
  contractVersion: number;
  listDevices(this: void, signal: AbortSignal): Promise<{ ok: true; devices: PeripheralDevice[] } | { ok: false; error: string }>;
  listPresets(this: void, device: PeripheralDevice, signal: AbortSignal): Promise<PresetList>;
  readActivePreset(this: void, device: PeripheralDevice, signal: AbortSignal): Promise<ActivePreset>;
  selectPreset(this: void, device: PeripheralDevice, presetUuid: string, signal: AbortSignal): Promise<SelectResult>;
  checkHealth(this: void, signal: AbortSignal): Promise<PeripheralHealth>;
}
