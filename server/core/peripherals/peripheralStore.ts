import type { Database } from 'better-sqlite3';
import { isLmuPreset } from '../../../shared/domain/peripherals/presetMapping.js';
import type { DeviceCatalog, PeripheralPreset, PresetMapping, SelectedDevice } from '../../../shared/types/peripherals/peripherals.js';

interface PresetRow { preset_uuid: string; name: string; tags_json: string; official: number; available: number }
interface MappingDbRow { scope_kind: 'model' | 'class'; scope_key: string; product_uuid: string; device_uuid: string; preset_uuid: string }
export class PeripheralStore {
  public constructor(private readonly db: Database, private readonly id = 'simagic') {}

  public replaceCatalog(device: SelectedDevice, presets: PeripheralPreset[], now: number): void {
    if (new Set(presets.map(preset => preset.presetUuid)).size !== presets.length) throw new Error('Duplicate preset identifiers.');
    this.db.transaction(() => {
      this.db.prepare('UPDATE peripheral_presets SET available=0 WHERE plugin_id=? AND product_uuid=? AND device_uuid=?').run(this.id, device.productUuid, device.deviceUuid);
      const upsert = this.db.prepare(`INSERT INTO peripheral_presets VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(plugin_id, product_uuid, device_uuid, preset_uuid) DO UPDATE SET name=excluded.name, tags_json=excluded.tags_json, official=excluded.official, available=1`);
      for (const preset of presets) upsert.run(this.id, device.productUuid, device.deviceUuid, preset.presetUuid, preset.name, JSON.stringify(preset.tags), Number(preset.official));
      this.db.prepare(`INSERT INTO peripheral_catalog_refreshes VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(plugin_id, product_uuid, device_uuid) DO UPDATE SET refreshed_at=excluded.refreshed_at, last_error=NULL`).run(this.id, device.productUuid, device.deviceUuid, now);
    })();
  }

  public recordRefreshError(device: SelectedDevice, error: string): void {
    this.db.prepare(`INSERT INTO peripheral_catalog_refreshes VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT(plugin_id, product_uuid, device_uuid) DO UPDATE SET last_error=excluded.last_error`).run(this.id, device.productUuid, device.deviceUuid, error);
  }

  /** The device's LMU-tagged presets: every other preset is stored but never offered, suggested or selected. */
  public catalog(device: SelectedDevice): DeviceCatalog {
    const rows = this.db.prepare('SELECT * FROM peripheral_presets WHERE plugin_id=? AND product_uuid=? AND device_uuid=? ORDER BY name, preset_uuid').all(this.id, device.productUuid, device.deviceUuid) as PresetRow[];
    const refresh = this.db.prepare('SELECT refreshed_at, last_error FROM peripheral_catalog_refreshes WHERE plugin_id=? AND product_uuid=? AND device_uuid=?').get(this.id, device.productUuid, device.deviceUuid) as { refreshed_at: number | null; last_error: string | null } | undefined;
    const presets = rows.map(row => ({
      presetUuid: row.preset_uuid, name: row.name, tags: JSON.parse(row.tags_json) as string[], official: Boolean(row.official), available: Boolean(row.available), active: false,
    }));
    return { device, refreshedAt: refresh?.refreshed_at ?? null, lastError: refresh?.last_error ?? null, presets: presets.filter(isLmuPreset) };
  }

  public listMappings(): PresetMapping[] {
    const rows = this.db.prepare('SELECT * FROM peripheral_car_preset_mappings WHERE plugin_id=?').all(this.id) as MappingDbRow[];
    return rows.map(row => ({ scopeKind: row.scope_kind, scopeKey: row.scope_key, productUuid: row.product_uuid, deviceUuid: row.device_uuid, presetUuid: row.preset_uuid }));
  }

  public saveMappings(rows: PresetMapping[], clears: { scopeKind: string; scopeKey: string }[], now: number): void {
    this.db.transaction(() => {
      for (const row of rows) {
        const valid = this.catalog({ productUuid: row.productUuid, deviceUuid: row.deviceUuid, name: '' }).presets.some(preset => preset.available && preset.presetUuid === row.presetUuid);
        if (!valid) throw new Error('Preset is unavailable for the selected device or not tagged for LMU.');
        this.db.prepare(`INSERT INTO peripheral_car_preset_mappings VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(plugin_id, scope_kind, scope_key) DO UPDATE SET product_uuid=excluded.product_uuid, device_uuid=excluded.device_uuid, preset_uuid=excluded.preset_uuid, updated_at=excluded.updated_at`)
          .run(this.id, row.scopeKind, row.scopeKey, row.productUuid, row.deviceUuid, row.presetUuid, now);
      }
      const clear = this.db.prepare('DELETE FROM peripheral_car_preset_mappings WHERE plugin_id=? AND scope_kind=? AND scope_key=?');
      for (const row of clears) clear.run(this.id, row.scopeKind, row.scopeKey);
    })();
  }
}
