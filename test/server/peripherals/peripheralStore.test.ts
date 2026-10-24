import { describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { PeripheralStore } from '../../../server/core/peripherals/peripheralStore.js';
import { DEVICE, PRESET } from './fixtures.js';
import { loadPeripheralPlugin, REGISTERED_PERIPHERALS } from '../../../server/peripherals/pluginRegistry.js';

describe('peripheral catalog', () => {
  it('keeps mappings through failed refreshes, rename and confirmed deletion, and rolls back invalid saves', () => {
    const db = new SessionDatabase(':memory:');
    try {
      const store = new PeripheralStore(db.getDb());
      const row = { productUuid: DEVICE.productUuid, deviceUuid: DEVICE.deviceUuid, scopeKind: 'model' as const, scopeKey: 'Ferrari 296 LMGT3', presetUuid: PRESET.presetUuid };
      store.replaceCatalog(DEVICE, [PRESET], 100);
      store.saveMappings([row], [], 100);
      store.recordRefreshError(DEVICE, 'offline');
      expect(store.catalog(DEVICE)).toMatchObject({ refreshedAt: 100, lastError: 'offline' });
      expect(store.catalog(DEVICE).presets[0].available).toBe(true);
      store.replaceCatalog(DEVICE, [{ ...PRESET, name: 'New name' }], 200);
      expect(store.listMappings()[0].presetUuid).toBe(PRESET.presetUuid);
      expect(store.catalog(DEVICE).presets[0].name).toBe('New name');
      expect(() => store.saveMappings([{ ...row, presetUuid: '999' }], [row], 300)).toThrow('unavailable');
      expect(store.listMappings()).toHaveLength(1);
      store.replaceCatalog(DEVICE, [], 400);
      expect(store.catalog(DEVICE).presets[0].available).toBe(false);
      expect(store.listMappings()).toHaveLength(1);
    } finally { db.close(); }
  });
  it('offers only LMU-tagged presets and refuses mapping any other', () => {
    const db = new SessionDatabase(':memory:');
    try {
      const store = new PeripheralStore(db.getDb());
      const other = { ...PRESET, presetUuid: '3400000000000000099', name: '296 GT3', tags: ['acc'] };
      store.replaceCatalog(DEVICE, [PRESET, other], 100);
      expect(store.catalog(DEVICE).presets.map(preset => preset.name)).toEqual(['GT3 296']);
      const row = { productUuid: DEVICE.productUuid, deviceUuid: DEVICE.deviceUuid, scopeKind: 'model' as const, scopeKey: 'Ferrari 296 LMGT3', presetUuid: other.presetUuid };
      expect(() => store.saveMappings([row], [], 100)).toThrow('not tagged for LMU');
    } finally { db.close(); }
  });
  it('isolates missing and incompatible packages', async () => {
    const missing = new Error("Cannot find package 'lmu-peripheral-simagic'");
    Object.assign(missing, { code: 'ERR_MODULE_NOT_FOUND' });
    expect((await loadPeripheralPlugin(REGISTERED_PERIPHERALS[0], () => Promise.reject(missing))).install).toBe('not-installed');
    expect((await loadPeripheralPlugin(REGISTERED_PERIPHERALS[0], async () => ({ CONTRACT_VERSION: 2 }))).install).toBe('incompatible');
  });
});
