import { PERIPHERAL_CONTRACT_VERSION } from './peripheralContract.js';
import type { PeripheralPlugin } from './peripheralContract.js';
import type { PeripheralStatus } from '../../shared/types/peripherals/peripherals.js';

export interface PluginLoad { install: PeripheralStatus['install']; plugin: PeripheralPlugin | null; error: string | null }
export interface PeripheralRegistration { id: string; packageName: string; factory: string }
/** Only explicitly registered packages may execute inside the backend. */
export const REGISTERED_PERIPHERALS: readonly PeripheralRegistration[] = [
  { id: 'simagic', packageName: 'lmu-peripheral-simagic', factory: 'createSimagicPlugin' },
];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
function isPlugin(value: unknown, id: string): value is PeripheralPlugin {
  return isRecord(value) && value.id === id && typeof value.label === 'string'
    && value.contractVersion === PERIPHERAL_CONTRACT_VERSION
    && ['listDevices', 'listPresets', 'readActivePreset', 'selectPreset', 'checkHealth'].every(key => typeof value[key] === 'function');
}

export async function loadPeripheralPlugin(entry: PeripheralRegistration, importModule: (name: string) => Promise<unknown> = name => import(name)): Promise<PluginLoad> {
  try {
    const module = await importModule(entry.packageName);
    if (!isRecord(module) || module.CONTRACT_VERSION !== PERIPHERAL_CONTRACT_VERSION) {
      return { install: 'incompatible', plugin: null, error: 'Unsupported peripheral contract.' };
    }
    const factory = module[entry.factory];
    if (typeof factory !== 'function') return { install: 'incompatible', plugin: null, error: 'Peripheral factory is unavailable.' };
    const candidate: unknown = factory({ now: Date.now, log: (level: 'info' | 'warn' | 'error', message: string) => console[level](`[${entry.id}] ${message}`) });
    return isPlugin(candidate, entry.id) ? { install: 'ready', plugin: candidate, error: null }
      : { install: 'incompatible', plugin: null, error: 'Invalid peripheral plugin.' };
  } catch (error) {
    const missing = isRecord(error) && error.code === 'ERR_MODULE_NOT_FOUND'
      && error instanceof Error && error.message.includes(`'${entry.packageName}'`);
    return { install: missing ? 'not-installed' : 'load-failed', plugin: null, error: error instanceof Error ? error.message : 'Unable to load plugin.' };
  }
}
