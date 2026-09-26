import { describe, it, expect } from 'vitest';
import { ReferenceLaptimeEntry } from '../../server/core/types.js';
import {
  formatPacePercentage,
  normalizeCarClass,
  matchesCarClass,
  matchesSessionCarClass,
  matchesTrack,
  getPaceCategoryFromPercentage,
  findMatchingTrackBenchmarkEntries,
  findReferenceEntry,
  VEHICLE_CLASS_OPTIONS,
} from '../../shared/domain/paceCategory.js';

describe('paceCategory utility', () => {

  describe('formatPacePercentage', () => {
    it('returns formatted percentage string', () => {
      expect(formatPacePercentage(100.24)).toBe('100.2%');
      expect(formatPacePercentage(102)).toBe('102.0%');
    });

    it('returns placeholder for null, undefined, or NaN values', () => {
      expect(formatPacePercentage(null)).toBe('--%');
      expect(formatPacePercentage(undefined)).toBe('--%');
      expect(formatPacePercentage(NaN)).toBe('--%');
    });
  });

  describe('normalizeCarClass', () => {
    it('distinguishes LMP2elms and LMP2wec and returns canonical class', () => {
      expect(normalizeCarClass('Hypercar', '')).toBe('LMH');
      expect(normalizeCarClass('GT3', 'Porsche 911 GT3 R')).toBe('LMGT3');
      expect(normalizeCarClass('LMP2', 'ELMS')).toBe('LMP2elms');
      expect(normalizeCarClass('LMP2', 'WEC')).toBe('LMP2wec');
      expect(normalizeCarClass('LMP3', 'Ligier JS P320')).toBe('LMP3');
      expect(normalizeCarClass('GTE', 'Ferrari 488 GTE')).toBe('GTE');
      expect(normalizeCarClass('UnknownClass')).toBe('UnknownClass');
    });
  });

  describe('matchesCarClass', () => {
    it('returns true when targetClass is All or empty', () => {
      expect(matchesCarClass('LMGT3', 'Porsche', 'All')).toBe(true);
      expect(matchesCarClass('LMH', 'Toyota', '')).toBe(true);
    });

    it('matches LMH / Hypercar variants', () => {
      expect(matchesCarClass('LMH', '', 'LMH')).toBe(true);
      expect(matchesCarClass('Hypercar', '', 'LMH')).toBe(true);
      expect(matchesCarClass('', 'LMDh Cadillac', 'LMH')).toBe(true);
      expect(matchesCarClass('LMGT3', '', 'LMH')).toBe(false);
    });

    it('matches LMGT3 variants', () => {
      expect(matchesCarClass('LMGT3', '', 'LMGT3')).toBe(true);
      expect(matchesCarClass('GT3', 'Corvette', 'LMGT3')).toBe(true);
      expect(matchesCarClass('LMH', '', 'LMGT3')).toBe(false);
    });

    it('matches LMP2 ELMS vs WEC properly', () => {
      expect(matchesCarClass('LMP2_ELMS', 'Oreca', 'LMP2elms')).toBe(true);
      expect(matchesCarClass('LMP2 (ELMS)', 'Oreca', 'LMP2elms')).toBe(true);
      expect(matchesCarClass('LMP2', 'Oreca ELMS', 'LMP2elms')).toBe(true);
      expect(matchesCarClass('LMP2', 'Oreca WEC', 'LMP2wec')).toBe(true);
      expect(matchesCarClass('LMP2', 'Oreca', 'LMP2wec')).toBe(true);
      expect(matchesCarClass('LMP2_ELMS', 'Oreca', 'LMP2wec')).toBe(false);
    });

    it('matches LMP3 and GTE', () => {
      expect(matchesCarClass('LMP3', '', 'LMP3')).toBe(true);
      expect(matchesCarClass('GTE', 'Ferrari', 'GTE')).toBe(true);
      expect(matchesCarClass('LMP2', '', 'LMP3')).toBe(false);
    });

    it('matches custom fallback classes', () => {
      expect(matchesCarClass('Formula', 'Spec', 'formula')).toBe(true);
    });
  });

  describe('matchesSessionCarClass', () => {
    it('returns true when targetClass is All or empty', () => {
      expect(matchesSessionCarClass({}, 'All')).toBe(true);
      expect(matchesSessionCarClass({}, '')).toBe(true);
    });

    it('matches session via playerDriver carClass or carType', () => {
      const session = {
        playerDriver: { carClass: 'Hypercar', carType: 'Ferrari 499P' },
      };
      expect(matchesSessionCarClass(session, 'LMH')).toBe(true);
      expect(matchesSessionCarClass(session, 'LMGT3')).toBe(false);
    });

    it('matches session via drivers array when playerDriver does not match or is absent', () => {
      const session = {
        playerDriver: null,
        drivers: [
          { carClass: 'LMGT3', carType: 'Aston Martin Vantage' },
          { carClass: 'LMH', carType: 'Porsche 963' },
        ],
      };
      expect(matchesSessionCarClass(session, 'LMGT3')).toBe(true);
      expect(matchesSessionCarClass(session, 'LMH')).toBe(true);
      expect(matchesSessionCarClass(session, 'LMP2')).toBe(false);
    });

    it('returns false when neither playerDriver nor any drivers match', () => {
      const session = {
        playerDriver: { carClass: 'LMP2', carType: 'Oreca 07' },
        drivers: [{ carClass: 'LMP2', carType: 'Oreca 07' }],
      };
      expect(matchesSessionCarClass(session, 'LMGT3')).toBe(false);
    });
  });

  describe('matchesTrack - Comprehensive Track Matching', () => {
    it('matches exact and normalized track names regardless of layout or prefix', () => {
      expect(matchesTrack('Spa', 'Circuit de Spa-Francorchamps', 'GP')).toBe(true);
      expect(matchesTrack('Circuit de Spa-Francorchamps', 'Spa', '')).toBe(true);
      expect(matchesTrack('Monza', 'Autodromo Nazionale Monza', 'Grand Prix')).toBe(true);
      expect(matchesTrack('Circuit de la Sarthe', 'Circuit 24 Heures du Mans', '')).toBe(true);
      expect(matchesTrack('Le Mans', 'Circuit de la Sarthe', '')).toBe(true);
      expect(matchesTrack('COTA', 'Circuit of the Americas', 'GP')).toBe(true);
      expect(matchesTrack('Austin', 'Circuit of the Americas', '')).toBe(true);
      expect(matchesTrack('Imola', 'Autodromo Enzo e Dino Ferrari', '')).toBe(true);
      expect(matchesTrack('Interlagos', 'Autodromo Jose Carlos Pace', '')).toBe(true);
      expect(matchesTrack('Portimao', 'Autodromo Internacional do Algarve', '')).toBe(true);
      expect(matchesTrack('Qatar', 'Losail International Circuit', '')).toBe(true);
      expect(matchesTrack('Lusail', 'Losail International Circuit', '')).toBe(true);
      expect(matchesTrack('Barcelona', 'Circuit de Barcelona-Catalunya', '')).toBe(true);
      expect(matchesTrack('Daytona', 'Daytona International Speedway', '')).toBe(true);
      expect(matchesTrack('Sebring', 'Sebring International Raceway', '')).toBe(true);
      expect(matchesTrack('Silverstone', 'Silverstone Circuit', 'GP')).toBe(true);
      expect(matchesTrack('Bahrain', 'Bahrain International Circuit', 'Grand Prix')).toBe(true);
    });

    it('differentiates between distinct track layouts when specified', () => {
      // Sebring Full vs Sebring School
      expect(matchesTrack('Sebring', 'Sebring International Raceway', '')).toBe(true);
      expect(matchesTrack('Sebring International Raceway', 'Sebring International Raceway', '12h')).toBe(true);
      expect(matchesTrack('Sebring (school)', 'Sebring International Raceway', 'School')).toBe(true);
      expect(matchesTrack('Sebring International Raceway', 'Sebring International Raceway', 'School')).toBe(false);
      expect(matchesTrack('Sebring', 'Sebring International Raceway', 'School')).toBe(false);
      expect(matchesTrack('Sebring (school)', 'Sebring International Raceway', '12h')).toBe(false);
      expect(matchesTrack('Sebring (school)', 'Sebring International Raceway', '')).toBe(false);

      // Paul Ricard layouts
      expect(matchesTrack('Paul Ricard (1A v2 short)', 'Circuit Paul Ricard', '1A-V2-Short')).toBe(true);
      expect(matchesTrack('Paul Ricard (1A)', 'Circuit Paul Ricard', '3A')).toBe(false);
      expect(matchesTrack('Paul Ricard (1A v2)', 'Circuit Paul Ricard', '1A-V2-Short')).toBe(false);

      // Silverstone layouts
      expect(matchesTrack('Silverstone (National)', 'Silverstone Circuit', 'National')).toBe(true);
      expect(matchesTrack('Silverstone (International)', 'Silverstone Circuit', 'National')).toBe(false);
      expect(matchesTrack('Silverstone (GP)', 'Silverstone Circuit', 'National')).toBe(false);
      expect(matchesTrack('Silverstone (GP)', 'Silverstone Circuit', 'GP')).toBe(true);

      // Bahrain layouts
      expect(matchesTrack('Bahrain (wec)', 'Bahrain International Circuit', 'Grand Prix')).toBe(true);
      expect(matchesTrack('Bahrain (outer)', 'Bahrain International Circuit', 'Outer')).toBe(true);
      expect(matchesTrack('Bahrain (endurance)', 'Bahrain International Circuit', 'Outer')).toBe(false);
      expect(matchesTrack('Bahrain (wec)', 'Bahrain International Circuit', 'Outer')).toBe(false);

      // Monza layouts
      expect(matchesTrack('Monza', 'Autodromo Nazionale Monza', 'GP')).toBe(true);
      expect(matchesTrack('Monza (curvagrande)', 'Autodromo Nazionale Monza', 'Curva Grande')).toBe(true);
      expect(matchesTrack('Monza', 'Autodromo Nazionale Monza', 'Curva Grande')).toBe(false);

      // Le Mans layouts
      expect(matchesTrack('Circuit de la Sarthe', 'Circuit 24 Heures du Mans', '24 Heures')).toBe(true);
      expect(matchesTrack('Circuit de la Sarthe (straight)', 'Circuit de la Sarthe', 'Straight')).toBe(true);
      expect(matchesTrack('Circuit de la Sarthe', 'Circuit de la Sarthe', 'Straight')).toBe(false);
    });

    it('returns true when queryTrack is All or empty', () => {
      expect(matchesTrack('All', 'Spa', 'GP')).toBe(true);
      expect(matchesTrack('', 'Monza', '')).toBe(true);
    });

    it('returns false for completely unrelated tracks', () => {
      expect(matchesTrack('Spa', 'Autodromo Nazionale Monza', '')).toBe(false);
      expect(matchesTrack('Silverstone', 'Circuit de la Sarthe', '')).toBe(false);
    });
  });

  describe('VEHICLE_CLASS_OPTIONS', () => {
    it('contains all standard LM classes', () => {
      const ids = VEHICLE_CLASS_OPTIONS.map(opt => opt.id);
      expect(ids).toContain('All');
      expect(ids).toContain('LMGT3');
      expect(ids).toContain('LMH');
      expect(ids).toContain('LMP3');
      expect(ids).toContain('LMP2elms');
      expect(ids).toContain('LMP2wec');
      expect(ids).toContain('GTE');
    });
  });

  describe('getPaceCategoryFromPercentage', () => {
    it('categorizes percentage correctly', () => {
      expect(getPaceCategoryFromPercentage(100.2)).toBe('Alien');
      expect(getPaceCategoryFromPercentage(101.0)).toBe('Competitive');
      expect(getPaceCategoryFromPercentage(102.5)).toBe('Good');
      expect(getPaceCategoryFromPercentage(104.5)).toBe('Midpack');
      expect(getPaceCategoryFromPercentage(106.5)).toBe('Tail-ender');
      expect(getPaceCategoryFromPercentage(110.0)).toBe('Offline');
    });
  });

  describe('findMatchingTrackBenchmarkEntries and findReferenceEntry', () => {
    const mockEntries = [
      { trackName: 'Spa', carClass: 'LMH', target100Sec: 120.0 },
      { trackName: 'Spa', carClass: 'LMGT3', target100Sec: 135.0 },
      { trackName: 'Monza', carClass: 'LMH', target100Sec: 95.0 },
      { trackName: 'Sebring', carClass: 'LMGT3', target100Sec: 120.23 },
      { trackName: 'Sebring (school)', carClass: 'LMGT3', target100Sec: 62.90 },
      { trackName: 'Silverstone (GP)', carClass: 'LMH', target100Sec: 100.0 },
      { trackName: 'Silverstone (National)', carClass: 'LMH', target100Sec: 55.0 },
    ] as unknown as ReferenceLaptimeEntry[];

    it('finds track benchmark entries matching track name', () => {
      const matches = findMatchingTrackBenchmarkEntries(mockEntries, 'Circuit de Spa-Francorchamps');
      expect(matches.length).toBe(2);
    });

    it('accurately isolates Sebring Full vs Sebring School benchmarks', () => {
      const sebringFull = findMatchingTrackBenchmarkEntries(mockEntries, 'Sebring International Raceway', '12h');
      expect(sebringFull.length).toBe(1);
      expect(sebringFull[0].target100Sec).toBe(120.23);

      const sebringSchool = findMatchingTrackBenchmarkEntries(mockEntries, 'Sebring International Raceway', 'School');
      expect(sebringSchool.length).toBe(1);
      expect(sebringSchool[0].target100Sec).toBe(62.90);
    });

    it('accurately isolates Silverstone layout benchmarks', () => {
      const gp = findMatchingTrackBenchmarkEntries(mockEntries, 'Silverstone Circuit', 'GP');
      expect(gp.length).toBe(1);
      expect(gp[0].target100Sec).toBe(100.0);

      const nat = findMatchingTrackBenchmarkEntries(mockEntries, 'Silverstone Circuit', 'National');
      expect(nat.length).toBe(1);
      expect(nat[0].target100Sec).toBe(55.0);
    });

    it('returns empty array when no track matches', () => {
      const matches = findMatchingTrackBenchmarkEntries(mockEntries, 'Nonexistent Track');
      expect(matches.length).toBe(0);
    });

    it('finds specific reference entry by track and class', () => {
      const entry = findReferenceEntry(mockEntries, 'Spa', 'GP', 'LMGT3', 'Porsche 911');
      expect(entry?.carClass).toBe('LMGT3');
      expect(entry?.target100Sec).toBe(135.0);

      const sebringRef = findReferenceEntry(mockEntries, 'Sebring International Raceway', '12h', 'LMGT3', 'Porsche');
      expect(sebringRef?.target100Sec).toBe(120.23);

      const schoolRef = findReferenceEntry(mockEntries, 'Sebring International Raceway', 'School', 'LMGT3', 'Porsche');
      expect(schoolRef?.target100Sec).toBe(62.90);
    });

    it('returns null when no track matches', () => {
      const entry = findReferenceEntry(mockEntries, 'Unknown Track', '', 'LMH', '');
      expect(entry).toBeNull();
    });
  });
});
