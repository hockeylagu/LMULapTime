import { describe, expect, it } from 'vitest';
import wheel from '../../fixtures/peripherals/wheel.json';
import { suggestMappings } from '../../../shared/domain/peripherals/suggestMappings.js';
import { isLmuPreset, resolvePresetTarget } from '../../../shared/domain/peripherals/presetMapping.js';

const all = wheel.result.map(row => ({ presetUuid: row.presetUUID, name: row.presetName, tags: row.gameName_list, official: row.isOffical, active: row.selected }));
// The app only offers LMU-tagged presets (the store filters them), so Suggest sees those alone.
const presets = all.filter(isLmuPreset);
describe('preset suggestions', () => {
  it('matches LMU presets, rejects class conflicts and leaves ambiguities unmapped', () => {
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.some(preset => preset.name === '296 GT3')).toBe(false);
    const rows = suggestMappings(presets, [], false);
    const ferrari = rows.find(row => row.car.model === 'Ferrari 296 LMGT3');
    expect(ferrari?.reason).toBe('Matched GT3 296');
    expect(ferrari?.presetName).toBe('GT3 296');
    expect(rows.find(row => row.car.model === 'Peugeot 9x8')?.reason).toBe('Matched HYP Peugeot');
    expect(rows.find(row => row.car.model === 'Oreca 07')?.presetUuid).toBeNull();
    expect(rows.find(row => row.car.model === 'Ferrari 488 GTE EVO')?.reason).not.toContain('GT3 296');
    expect(rows.find(row => row.car.model === 'Chevrolet Corvette Z06 LMGT3.R')?.reason).toBe('Matched GT3 Vette');
    const gteOnly = all.filter(preset => preset.name === 'Corvette C8.R');
    expect(suggestMappings(gteOnly, [], false).find(row => row.car.model === 'Chevrolet Corvette Z06 LMGT3.R')?.presetUuid).toBeNull();
    expect(rows.filter(row => row.car.model === 'McLaren 720S LMGT3 Evo')).toHaveLength(1);
  });
  it('suggests the WEC and ELMS class defaults from class-only presets for the Oreca 07', () => {
    const preset = (presetUuid: string, name: string) => ({ presetUuid, name, tags: ['lmu'], official: false, active: false });
    const lmp2 = [preset('10', 'LMP2 WEC'), preset('11', 'LMP2 ELMS')];
    const rows = suggestMappings(lmp2, [], false).filter(row => row.car.model === 'Oreca 07');
    expect(rows.map(row => [row.scopeKind, row.scopeKey, row.presetName])).toEqual([['class', 'LMP2', 'LMP2 WEC'], ['class', 'LMP2_ELMS', 'LMP2 ELMS']]);
    const saved = { scopeKind: 'class' as const, scopeKey: 'LMP2', productUuid: '1', deviceUuid: '1', presetUuid: '10' };
    expect(suggestMappings(lmp2, [saved], false).filter(row => row.car.model === 'Oreca 07').map(row => row.scopeKey)).toEqual(['LMP2_ELMS']);
    expect(suggestMappings(lmp2, [saved], true).filter(row => row.car.model === 'Oreca 07')).toHaveLength(2);
  });
  it('matches a model name without its Evo2 suffix', () => {
    const huracan = [{ presetUuid: '20', name: 'GT3 Huracan', tags: ['lmu'], official: false, active: false }];
    expect(suggestMappings(huracan, [], false).find(row => row.car.model === 'Lamborghini Huracan LMGT3 Evo2')?.presetName).toBe('GT3 Huracan');
  });
  it('does not replace saved rows without explicit overwrite', () => {
    const saved = { scopeKind: 'model' as const, scopeKey: 'Ferrari 296 LMGT3', productUuid: '1', deviceUuid: '1', presetUuid: '2' };
    expect(suggestMappings(presets, [saved], false).some(row => row.car.model === saved.scopeKey)).toBe(false);
    expect(suggestMappings(presets, [saved], true).some(row => row.car.model === saved.scopeKey)).toBe(true);
    expect(resolvePresetTarget([saved, { ...saved, scopeKind: 'class', scopeKey: 'GT3', presetUuid: '3' }], { model: saved.scopeKey, carClass: 'GT3' })).toEqual(saved);
  });
});
