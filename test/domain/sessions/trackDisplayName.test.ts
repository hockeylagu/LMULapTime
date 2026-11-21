import { describe, it, expect } from 'vitest';
import { getDisplayTrackName } from '../../../shared/domain/sessions/trackDisplayName.js';

describe('getDisplayTrackName', () => {
  it('returns venue if course is empty', () => {
    expect(getDisplayTrackName('Spa-Francorchamps', '')).toBe('Spa-Francorchamps');
    expect(getDisplayTrackName('Monza', undefined)).toBe('Monza');
  });

  it('returns venue when course is generic layout (gp, grand prix, full, wec)', () => {
    expect(getDisplayTrackName('Silverstone', 'GP')).toBe('Silverstone');
    expect(getDisplayTrackName('Silverstone', 'Grand Prix')).toBe('Silverstone');
    expect(getDisplayTrackName('Le Mans', 'Full')).toBe('Le Mans');
    expect(getDisplayTrackName('Bahrain', 'WEC')).toBe('Bahrain');
  });

  it('returns venue when venue already includes course name', () => {
    expect(getDisplayTrackName('Circuit de Spa-Francorchamps GP', 'Spa-Francorchamps')).toBe('Circuit de Spa-Francorchamps GP');
  });

  it('formats custom layouts cleanly and removes redundant venue words', () => {
    expect(getDisplayTrackName('Paul Ricard', 'Paul Ricard - 1A-V2-Short')).toBe('Paul Ricard (1A V2 Short)');
    expect(getDisplayTrackName('Silverstone', 'National Circuit')).toBe('Silverstone (National Circuit)');
    expect(getDisplayTrackName('Sebring', 'Sebring School Course')).toBe('Sebring (School Course)');
  });

  it('returns layout with venue when course provides additional layout details', () => {
    expect(getDisplayTrackName('Monza', 'Monza Circuit')).toBe('Monza (Circuit)');
  });
});
