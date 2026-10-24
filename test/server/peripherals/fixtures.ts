import { vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { TypedEmitter } from '../../../server/core/typedEmitter.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import type { PeripheralDevice, PeripheralPreset } from '../../../shared/types/peripherals/peripherals.js';
import type { PeripheralPlugin } from '../../../server/peripherals/peripheralContract.js';
import { PeripheralHost } from '../../../server/peripherals/peripheralHost.js';

export const DEVICE: PeripheralDevice = { productUuid: '33947648', deviceUuid: '33947648', name: 'Wheel', role: 'wheel', firmware: null };
export const PRESET: PeripheralPreset = { presetUuid: '3400000000000000056', name: 'GT3 296', tags: ['lmu'], official: false, active: false };
export function snapshot(lifecycle: LiveSnapshot['lifecycle'] = 'garage'): LiveSnapshot {
  return { sequence: 1, receivedAt: Date.now(), lifecycle, session: {
    kind: 'practice', sessionCode: 1, gamePhase: 0, inRealtime: lifecycle !== 'garage', trackName: 'Bahrain',
    vehicleName: 'Ferrari 296 LMGT3', vehicleClass: 'GT3', elapsedSeconds: 0, endSeconds: 1800, playerLapsCompleted: 0, playerPlace: 1,
  }, identity: null, lapsLeft: null, weather: null, recentLaps: [], sessionBest: null, loadingProgress: null, strategy: null };
}
export function fakePlugin(): PeripheralPlugin {
  let active = '1';
  return { id: 'simagic', label: 'Simagic', contractVersion: 1,
    listDevices: vi.fn<PeripheralPlugin['listDevices']>(async () => ({ ok: true, devices: [DEVICE] })),
    listPresets: vi.fn<PeripheralPlugin['listPresets']>(async () => ({ ok: true, presets: [PRESET] })),
    readActivePreset: vi.fn<PeripheralPlugin['readActivePreset']>(async () => ({ ok: true, presetUuid: active })),
    selectPreset: vi.fn<PeripheralPlugin['selectPreset']>(async (_device, uuid) => { active = uuid; return { outcome: 'accepted' }; }),
    checkHealth: vi.fn<PeripheralPlugin['checkHealth']>(async () => ({ api: 'responsive', process: 'present' })),
  };
}
export async function setup(initial = snapshot(), plugin = fakePlugin()) {
  const db = new SessionDatabase(':memory:');
  db.setMetadata('peripheral_settings:simagic', JSON.stringify({ enabled: true, automatic: true, wheel: DEVICE }));
  const events = new TypedEmitter<{ snapshot: [LiveSnapshot] }>();
  let current = initial;
  const live = { events, getSnapshot: () => current };
  const host = new PeripheralHost(db, live, async () => ({ install: 'ready', plugin, error: null }));
  host.store.replaceCatalog(DEVICE, [PRESET], Date.now());
  host.store.saveMappings([{ productUuid: DEVICE.productUuid, deviceUuid: DEVICE.deviceUuid, scopeKind: 'model', scopeKey: 'Ferrari 296 LMGT3', presetUuid: PRESET.presetUuid }], [], Date.now());
  await host.start();
  return { db, host, plugin, frame: (next: LiveSnapshot) => { current = next; events.emit('snapshot', next); }, close: () => { host.stop(); db.close(); } };
}
