import { VEHICLE_MODELS } from '../vehicleMapping.js';
import type { MappingCar, MappingSuggestion, PeripheralPreset, PresetMapping } from '../../types/peripherals/peripherals.js';

const tokens = (name: string): string[] => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
export const MAPPING_CARS: MappingCar[] = [];
for (const car of VEHICLE_MODELS) {
  if (car.carClass === 'Safety Car') continue;
  const existing = MAPPING_CARS.find(item => item.model === car.model && item.carClass === car.carClass);
  const aliases = [car.carName, ...(car.names ?? []), ...(car.presetNames ?? [])];
  if (existing) existing.aliases = [...new Set([...existing.aliases, ...aliases])];
  else MAPPING_CARS.push({ model: car.model, carClass: car.carClass, aliases });
}
const MAKERS = new Set(['aston', 'martin', 'bmw', 'chevrolet', 'corvette', 'ferrari', 'ford', 'lamborghini', 'lexus', 'mclaren', 'mercedes', 'amg', 'porsche', 'alpine', 'cadillac', 'genesis', 'glickenhaus', 'isotta', 'fraschini', 'peugeot', 'toyota', 'vanwall', 'oreca', 'adess', 'duqueine', 'ginetta', 'ligier']);
const GENERIC = new Set(['gt3', 'lmgt3', 'gte', 'hyper', 'hypercar', 'hyp', 'lmp2', 'lmp3', 'p2', 'p3', 'lm', 'wec', 'elms', 'evo', 'evo2', 'hybrid', 'lmh', 'lmdh', 'r', 'amr', 'series']);
function presetClass(name: string): string | null {
  const parts = tokens(name);
  if (parts.includes('gt3') || parts.includes('lmgt3')) return 'GT3';
  if (parts.includes('gte')) return 'GTE';
  if (parts.some(part => ['hyp', 'hyper', 'hypercar', 'lmh', 'lmdh'].includes(part))) return 'Hyper';
  if (parts.includes('lmp3') || parts.includes('p3')) return 'LMP3';
  if (parts.includes('lmp2') || parts.includes('p2')) return 'LMP2';
  return null;
}
function matches(car: MappingCar, preset: PeripheralPreset): boolean {
  const category = presetClass(preset.name);
  if (category && category !== car.carClass.replace('_ELMS', '')) return false;
  const words = tokens(preset.name);
  const names = [car.model, ...car.aliases];
  const carWords = tokens(car.model);
  if (words.some(word => MAKERS.has(word) && !carWords.includes(word))) return false;
  // Explicit aliases also cover class-only labels (LM P2 / WEC P2) for the canonical Oreca model.
  if (car.aliases.some(alias => {
    const aliasWords = tokens(alias);
    return aliasWords.length === words.length && aliasWords.every(word => words.includes(word));
  })) return true;
  if (names.some(name => {
    const distinguishing = tokens(name).filter(word => !MAKERS.has(word) && !GENERIC.has(word));
    return distinguishing.length > 0 && distinguishing.every(word => words.includes(word));
  })) return true;
  // Unique manufacturer tokens are useful for labels such as "HYP Peugeot" and "LMP3 Ginetta".
  return words.every(word => MAKERS.has(word) || GENERIC.has(word))
    && carWords.some(word => MAKERS.has(word) && words.includes(word)
      && MAPPING_CARS.filter(other => tokens(other.model).includes(word) && (!category || other.carClass === car.carClass)).length === 1);
}

// A class-only label ("LMP2 WEC", "LMP2 ELMS") suggests the class default: the Oreca 07 runs in both LMP2 classes with different profiles.
function classDefaults(car: MappingCar, presets: PeripheralPreset[]): PeripheralPreset[] {
  const elms = car.carClass.endsWith('_ELMS');
  return presets.filter(preset => {
    const words = tokens(preset.name);
    return words.every(word => GENERIC.has(word)) && presetClass(preset.name) === car.carClass.replace('_ELMS', '') && words.includes('elms') === elms;
  });
}

export function suggestMappings(presets: PeripheralPreset[], existing: PresetMapping[], overwrite: boolean): MappingSuggestion[] {
  const saved = (scopeKind: 'model' | 'class', scopeKey: string) => !overwrite && existing.some(row => row.scopeKind === scopeKind && row.scopeKey === scopeKey);
  return MAPPING_CARS.filter(car => !saved('model', car.model)).flatMap((car): MappingSuggestion[] => {
    const candidates = presets.filter(preset => matches(car, preset));
    const defaults = candidates.length ? [] : classDefaults(car, presets);
    if (defaults.length) {
      if (saved('class', car.carClass)) return [];
      const preset = defaults.length === 1 ? defaults[0] : null;
      return [{ car, scopeKind: 'class', scopeKey: car.carClass, presetUuid: preset?.presetUuid ?? null, presetName: preset?.name ?? null, reason: preset ? `Matched ${preset.name}` : `Ambiguous: ${defaults.map(item => item.name).join(', ')}` }];
    }
    const preset = candidates.length === 1 ? candidates[0] : null;
    return [{ car, scopeKind: 'model', scopeKey: car.model, presetUuid: preset?.presetUuid ?? null, presetName: preset?.name ?? null, reason: preset ? `Matched ${preset.name}` : candidates.length ? `Ambiguous: ${candidates.map(item => item.name).join(', ')}` : 'No match' }];
  });
}
