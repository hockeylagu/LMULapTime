import type { PeripheralCar, PresetMapping } from '../../types/peripherals/peripherals.js';
import { normalizeCarClass } from '../vehicleMapping.js';

/** A preset tagged for Le Mans Ultimate in SimPro; the only presets the app offers, suggests or selects. */
export function isLmuPreset(preset: { tags: readonly string[] }): boolean {
  return preset.tags.some(tag => tag.toLowerCase() === 'lmu');
}

export function resolvePresetTarget(rows: readonly PresetMapping[], car: PeripheralCar): PresetMapping | null {
  return rows.find(row => row.scopeKind === 'model' && row.scopeKey === car.model)
    ?? rows.find(row => row.scopeKind === 'class' && row.scopeKey === normalizeCarClass(car.carClass)) ?? null;
}
