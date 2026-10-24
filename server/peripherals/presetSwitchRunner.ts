import type { PeripheralCar, PeripheralRun, PeripheralSettings, PresetMapping, SwitchResult } from '../../shared/types/peripherals/peripherals.js';
import type { ActivePreset, PeripheralPlugin } from './peripheralContract.js';
import type { PeripheralStore } from '../core/peripherals/peripheralStore.js';
import { resolvePresetTarget } from '../../shared/domain/peripherals/presetMapping.js';

interface RunOptions {
  plugin: PeripheralPlugin;
  settings: PeripheralSettings;
  store: PeripheralStore;
  car: PeripheralCar;
  loadKey: string;
  signal: AbortSignal;
  safe: () => boolean;
  now: () => number;
}
async function switchWheel(target: PresetMapping | null, options: RunOptions): Promise<SwitchResult> {
  const { plugin, settings, store, signal, safe } = options;
  const device = settings.wheel;
  if (!device || !target) return { outcome: 'unmapped', message: 'No preset assigned.' };
  const details: Pick<SwitchResult, 'targetPresetUuid' | 'beforePresetUuid' | 'afterPresetUuid' | 'readbackError'> = { targetPresetUuid: target.presetUuid };
  if (target.productUuid !== device.productUuid || target.deviceUuid !== device.deviceUuid
    || !store.catalog(device).presets.some(preset => preset.available && preset.presetUuid === target.presetUuid)) {
    return { ...details, outcome: 'broken', message: 'Assigned preset is unavailable for this device.' };
  }
  if (signal.aborted || !safe()) return { ...details, outcome: 'skipped', message: 'Safe window closed.' };
  const devices = await plugin.listDevices(signal);
  const connected = devices.ok ? devices.devices.find(item => item.role === 'wheel' && item.productUuid === device.productUuid && item.deviceUuid === device.deviceUuid) : null;
  if (!connected) return { ...details, outcome: 'device-missing', message: devices.ok ? 'Selected device is disconnected.' : devices.error };
  const active = await plugin.readActivePreset(connected, signal);
  details.beforePresetUuid = active.ok ? active.presetUuid : null;
  if (!active.ok) return { ...details, outcome: 'skipped', message: `Active preset unknown: ${active.error}`, readbackError: active.error };
  if (active.presetUuid === target.presetUuid) return { ...details, outcome: 'already-active', message: 'Preset already active; no selection sent.' };
  if (signal.aborted || !safe()) return { ...details, outcome: 'skipped', message: 'Safe window closed.' };
  const result = await plugin.selectPreset(connected, target.presetUuid, signal);
  if (result.outcome !== 'accepted') return { ...details, outcome: result.outcome, message: result.error };
  let confirmed: ActivePreset;
  try { confirmed = await plugin.readActivePreset(connected, signal); }
  catch (error) { confirmed = { ok: false as const, error: error instanceof Error ? error.message : 'Confirmation read failed.' }; }
  details.afterPresetUuid = confirmed.ok ? confirmed.presetUuid : null;
  if (!confirmed.ok) details.readbackError = confirmed.error;
  return confirmed.ok && confirmed.presetUuid === target.presetUuid
    ? { ...details, outcome: 'applied', message: 'Preset selected and confirmed.' }
    : { ...details, outcome: 'applied-unconfirmed', message: 'Selection accepted; active preset could not be confirmed.' };
}
export async function runPresetSwitch(options: RunOptions): Promise<PeripheralRun> {
  const run: PeripheralRun = { loadKey: options.loadKey, car: options.car, startedAt: options.now() };
  if (!options.settings.wheel) return run;
  const target = resolvePresetTarget(options.store.listMappings(), options.car);
  try { run.wheel = await switchWheel(target, options); }
  catch (error) {
    run.wheel = { targetPresetUuid: target?.presetUuid, outcome: 'uncertain', message: error instanceof Error ? error.message : 'Plugin request failed; not retried.' };
  }
  return run;
}
