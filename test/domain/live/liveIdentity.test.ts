import { describe, expect, it, vi } from 'vitest';
import { resolveLiveIdentity } from '../../../shared/domain/live/liveIdentity.js';

const LE_MANS = { trackName: 'Circuit de la Sarthe', vehicleName: 'DKR Engineering #4:ELMS25 1.09', vehicleClass: 'LMP3' };

describe('live identity', () => {
  it('resolves the exact layout from the LMU sceneDesc, the class from the vehicle, and the record for both', () => {
    const personalBest = vi.fn(() => 228.419);
    const identity = resolveLiveIdentity(LE_MANS, { sceneDesc: 'LEMANSWEC', classes: ['ELMS2025', 'LMP3'], vehFile: null }, personalBest);
    expect(identity).toEqual({
      layoutKey: 'sarthe_full', layoutName: 'Full 24 Hours Circuit (Circuit de la Sarthe)', carClass: 'LMP3', vehicleModel: 'Ginetta G61-LT-P325 Evo',
      personalBestSeconds: 228.419,
    });
    expect(personalBest).toHaveBeenCalledWith('sarthe_full', 'LMP3');
  });

  it('tells two layouts of one facility apart by sceneDesc and never guesses without it', () => {
    const none = () => null;
    expect(resolveLiveIdentity(LE_MANS, { sceneDesc: 'LEMANSWEC_MULSANNE', classes: [], vehFile: null }, none).layoutKey).toBe('sarthe_mulsanne');
    const without = resolveLiveIdentity(LE_MANS, null, none);
    expect(without).toMatchObject({ layoutKey: null, layoutName: 'Circuit de la Sarthe', personalBestSeconds: null });
    expect(resolveLiveIdentity(LE_MANS, { sceneDesc: 'NOT_A_TRACK', classes: [], vehFile: null }, none).layoutKey).toBeNull();
  });

  it('resolves a facility with a single layout from its name when the sceneDesc is unavailable', () => {
    const laguna = { trackName: 'Laguna Seca', vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3' };
    expect(resolveLiveIdentity(laguna, null, () => null)).toMatchObject({ layoutKey: 'laguna_seca', carClass: 'GT3' });
    expect(resolveLiveIdentity(laguna, { sceneDesc: 'LAGUNASECA', classes: [], vehFile: null }, () => null).layoutKey).toBe('laguna_seca');
  });

  it('asks for no record when the layout or the class is unresolved', () => {
    const personalBest = vi.fn(() => 1);
    expect(resolveLiveIdentity(LE_MANS, null, personalBest).personalBestSeconds).toBeNull();
    const unknownCar = { ...LE_MANS, vehicleName: 'Mystery', vehicleClass: '' };
    expect(resolveLiveIdentity(unknownCar, { sceneDesc: 'LEMANSWEC', classes: [], vehFile: null }, personalBest))
      .toMatchObject({ layoutKey: 'sarthe_full', carClass: null, personalBestSeconds: null });
    expect(personalBest).not.toHaveBeenCalled();
  });

  it('takes the car from the entry name, the REST vehicle file only when the entry name is unknown', () => {
    const bahrain = { trackName: 'Bahrain International Circuit', vehicleName: 'Team WRT 2026 #32:LM', vehicleClass: 'GT3' };
    // The main menu already selects the next car while shared memory still holds the race (Bahrain race 2026-10-21).
    const menu = { sceneDesc: null, classes: ['WEC2026', 'GT3', 'Ferrari_296_LMGT3'], vehFile: '21_26_AFCO31910023.VEH' };
    expect(resolveLiveIdentity(bahrain, menu, () => null)).toMatchObject({ carClass: 'GT3', vehicleModel: 'BMW M4 LMGT3' });
    expect(resolveLiveIdentity({ ...bahrain, vehicleName: 'Mystery' }, menu, () => null))
      .toMatchObject({ carClass: 'GT3', vehicleModel: 'Ferrari 296 LMGT3' });
  });

  it('falls back to the class names the game lists for the selected car', () => {
    const unknownCar = { ...LE_MANS, vehicleName: 'Mystery', vehicleClass: '' };
    expect(resolveLiveIdentity(unknownCar, { sceneDesc: 'LEMANSWEC', classes: ['Nothing', 'LMP3'], vehFile: null }, () => null).carClass).toBe('LMP3');
  });
});
