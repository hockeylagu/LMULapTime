import { describe, expect, it, vi } from 'vitest';
import { resolveLiveIdentity } from '../../../shared/domain/live/liveIdentity.js';

const LE_MANS = { trackName: 'Circuit de la Sarthe', vehicleName: 'DKR Engineering #4:ELMS25 1.09', vehicleClass: 'LMP3' };

describe('live identity', () => {
  it('resolves the exact layout from the LMU sceneDesc, the class from the vehicle, and the record for both', () => {
    const personalBest = vi.fn(() => 228.419);
    const identity = resolveLiveIdentity(LE_MANS, { sceneDesc: 'LEMANSWEC', classes: ['ELMS2025', 'LMP3'] }, personalBest);
    expect(identity).toEqual({
      layoutKey: 'sarthe_full', layoutName: 'Full 24 Hours Circuit (Circuit de la Sarthe)', carClass: 'LMP3', personalBestSeconds: 228.419,
    });
    expect(personalBest).toHaveBeenCalledWith('sarthe_full', 'LMP3');
  });

  it('tells two layouts of one facility apart by sceneDesc and never guesses without it', () => {
    const none = () => null;
    expect(resolveLiveIdentity(LE_MANS, { sceneDesc: 'LEMANSWEC_MULSANNE', classes: [] }, none).layoutKey).toBe('sarthe_mulsanne');
    const without = resolveLiveIdentity(LE_MANS, null, none);
    expect(without).toMatchObject({ layoutKey: null, layoutName: 'Circuit de la Sarthe', personalBestSeconds: null });
    expect(resolveLiveIdentity(LE_MANS, { sceneDesc: 'NOT_A_TRACK', classes: [] }, none).layoutKey).toBeNull();
  });

  it('resolves a facility with a single layout from its name when the sceneDesc is unavailable', () => {
    const laguna = { trackName: 'Laguna Seca', vehicleName: 'Ferrari 296 GT3', vehicleClass: 'GT3' };
    expect(resolveLiveIdentity(laguna, null, () => null)).toMatchObject({ layoutKey: 'laguna_seca', carClass: 'GT3' });
    expect(resolveLiveIdentity(laguna, { sceneDesc: 'LAGUNASECA', classes: [] }, () => null).layoutKey).toBe('laguna_seca');
  });

  it('asks for no record when the layout or the class is unresolved', () => {
    const personalBest = vi.fn(() => 1);
    expect(resolveLiveIdentity(LE_MANS, null, personalBest).personalBestSeconds).toBeNull();
    const unknownCar = { ...LE_MANS, vehicleName: 'Mystery', vehicleClass: '' };
    expect(resolveLiveIdentity(unknownCar, { sceneDesc: 'LEMANSWEC', classes: [] }, personalBest))
      .toMatchObject({ layoutKey: 'sarthe_full', carClass: null, personalBestSeconds: null });
    expect(personalBest).not.toHaveBeenCalled();
  });

  it('falls back to the class names the game lists for the selected car', () => {
    const unknownCar = { ...LE_MANS, vehicleName: 'Mystery', vehicleClass: '' };
    expect(resolveLiveIdentity(unknownCar, { sceneDesc: 'LEMANSWEC', classes: ['Nothing', 'LMP3'] }, () => null).carClass).toBe('LMP3');
  });
});
