import { describe, it, expect } from 'vitest';
import { PaceCategory, ReferenceLaptimeEntry } from '../../server/types';
import {
  getPaceCategoryStyle,
  formatPacePercentage,
  normalizeCarClassGroup,
  matchesCarClass,
  normalizeTrackName,
  matchesTrack,
  getPaceCategoryFromPercentage,
  findMatchingTrackBenchmarkEntries,
  findReferenceEntry,
  PACE_CATEGORY_STYLES,
  VEHICLE_CLASS_OPTIONS,
} from '../../src/utils/paceCategory';

describe('paceCategory utility', () => {
  describe('getPaceCategoryStyle', () => {
    it('returns style object for each valid category', () => {
      expect(getPaceCategoryStyle('Alien')).toEqual(PACE_CATEGORY_STYLES.Alien);
      expect(getPaceCategoryStyle('Competitive')).toEqual(PACE_CATEGORY_STYLES.Competitive);
      expect(getPaceCategoryStyle('Good')).toEqual(PACE_CATEGORY_STYLES.Good);
      expect(getPaceCategoryStyle('Midpack')).toEqual(PACE_CATEGORY_STYLES.Midpack);
      expect(getPaceCategoryStyle('Tail-ender')).toEqual(PACE_CATEGORY_STYLES['Tail-ender']);
      expect(getPaceCategoryStyle('Offline')).toEqual(PACE_CATEGORY_STYLES.Offline);
    });

    it('returns Offline fallback style when given null, undefined, or invalid category', () => {
      expect(getPaceCategoryStyle(null)).toEqual(PACE_CATEGORY_STYLES.Offline);
      expect(getPaceCategoryStyle(undefined)).toEqual(PACE_CATEGORY_STYLES.Offline);
      expect(getPaceCategoryStyle('InvalidCategory' as unknown as PaceCategory)).toEqual(PACE_CATEGORY_STYLES.Offline);
    });
  });

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

  describe('normalizeCarClassGroup', () => {
    it('correctly maps hypercar strings to LMH', () => {
      expect(normalizeCarClassGroup('Hypercar', '')).toBe('LMH');
      expect(normalizeCarClassGroup('LMH', 'Ferrari 499P')).toBe('LMH');
      expect(normalizeCarClassGroup('', 'Porsche 963 LMDh')).toBe('LMH');
    });

    it('correctly maps GT3 strings to LMGT3', () => {
      expect(normalizeCarClassGroup('GT3', 'Porsche 911 GT3 R')).toBe('LMGT3');
      expect(normalizeCarClassGroup('LMGT3', 'Aston Martin Vantage')).toBe('LMGT3');
    });

    it('correctly maps LMP3 strings', () => {
      expect(normalizeCarClassGroup('LMP3', 'Ligier JS P320')).toBe('LMP3');
    });

    it('correctly maps LMP2 strings', () => {
      expect(normalizeCarClassGroup('LMP2', 'Oreca 07')).toBe('LMP2');
    });

    it('correctly maps GTE strings', () => {
      expect(normalizeCarClassGroup('GTE', 'Ferrari 488 GTE')).toBe('GTE');
    });

    it('falls back to uppercase general or car name', () => {
      expect(normalizeCarClassGroup('CustomClass', '')).toBe('CUSTOMCLASS');
      expect(normalizeCarClassGroup('', '')).toBe('GENERAL');
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

  describe('normalizeTrackName - Comprehensive Layout Variants', () => {
    it('normalizes Silverstone layout variants (GP vs International vs National)', () => {
      expect(normalizeTrackName('Silverstone', 'GP')).toBe('Silverstone (GP)');
      expect(normalizeTrackName('Silverstone', 'Grand Prix')).toBe('Silverstone (GP)');
      expect(normalizeTrackName('Silverstone', 'International')).toBe('Silverstone (International)');
      expect(normalizeTrackName('Silverstone', 'National')).toBe('Silverstone (National)');
      expect(normalizeTrackName('Silverstone Circuit', '')).toBe('Silverstone (GP)');
    });

    it('normalizes Le Mans / Sarthe layout variants (24h vs Straight / Chicaneless)', () => {
      expect(normalizeTrackName('Circuit de la Sarthe', '')).toBe('Circuit de la Sarthe');
      expect(normalizeTrackName('Circuit 24 Heures du Mans', '24 Heures')).toBe('Circuit de la Sarthe');
      expect(normalizeTrackName('Circuit 24 Heures du Mans', 'Straight')).toBe('Circuit de la Sarthe (straight)');
      expect(normalizeTrackName('Le Mans', 'Chicaneless')).toBe('Circuit de la Sarthe (straight)');
    });

    it('normalizes Bahrain layout variants (WEC vs Outer vs Endurance vs Paddock)', () => {
      expect(normalizeTrackName('Bahrain International Circuit', 'Grand Prix')).toBe('Bahrain (wec)');
      expect(normalizeTrackName('Bahrain', 'WEC')).toBe('Bahrain (wec)');
      expect(normalizeTrackName('Bahrain', 'Outer')).toBe('Bahrain (outer)');
      expect(normalizeTrackName('Bahrain', 'Endurance')).toBe('Bahrain (endurance)');
      expect(normalizeTrackName('Bahrain', 'Paddock')).toBe('Bahrain (paddock)');
      expect(normalizeTrackName('Bahrain', '')).toBe('Bahrain (wec)');
    });

    it('normalizes Paul Ricard layout variants (1A v2 vs 1A vs 3A vs Short)', () => {
      expect(normalizeTrackName('Circuit Paul Ricard', '1A v2 Short')).toBe('Paul Ricard (1A v2 short)');
      expect(normalizeTrackName('Paul Ricard', '1A v2')).toBe('Paul Ricard (1A v2)');
      expect(normalizeTrackName('Paul Ricard', '1A')).toBe('Paul Ricard (1A)');
      expect(normalizeTrackName('Paul Ricard', '3A')).toBe('Paul Ricard (3A)');
      expect(normalizeTrackName('Paul Ricard', '')).toBe('Paul Ricard (1A v2)');
    });

    it('normalizes Monza layout variants (GP vs Curva Grande)', () => {
      expect(normalizeTrackName('Autodromo Nazionale Monza', '')).toBe('Monza');
      expect(normalizeTrackName('Monza', 'Grand Prix')).toBe('Monza');
      expect(normalizeTrackName('Monza', 'Curva Grande')).toBe('Monza (curvagrande)');
    });

    it('normalizes COTA, Fuji, Qatar, and Sebring layout variants', () => {
      expect(normalizeTrackName('Circuit of the Americas', 'GP')).toBe('COTA');
      expect(normalizeTrackName('Circuit of the Americas', 'National')).toBe('COTA (national)');
      expect(normalizeTrackName('COTA', '')).toBe('COTA');

      expect(normalizeTrackName('Fuji Speedway', 'Grand Prix')).toBe('Fuji (chicane)');
      expect(normalizeTrackName('Fuji Speedway', 'Classic')).toBe('Fuji (classic)');
      expect(normalizeTrackName('Fuji', '')).toBe('Fuji (chicane)');

      expect(normalizeTrackName('Losail Qatar', 'Grand Prix')).toBe('Qatar');
      expect(normalizeTrackName('Lusail', 'Short')).toBe('Qatar (short)');
      expect(normalizeTrackName('Qatar', '')).toBe('Qatar');

      expect(normalizeTrackName('Sebring International Raceway', '12h')).toBe('Sebring');
      expect(normalizeTrackName('Sebring', 'School')).toBe('Sebring (school)');
      expect(normalizeTrackName('Sebring', '')).toBe('Sebring');
    });

    it('normalizes Barcelona, Daytona, Imola, Interlagos, Laguna Seca, Portimao', () => {
      expect(normalizeTrackName('Circuit de Barcelona-Catalunya', 'GP')).toBe('Barcelona');
      expect(normalizeTrackName('Daytona International Speedway', 'Road Course')).toBe('Daytona');
      expect(normalizeTrackName('Autodromo Enzo e Dino Ferrari', 'GP')).toBe('Imola');
      expect(normalizeTrackName('Autodromo Jose Carlos Pace', 'GP')).toBe('Interlagos');
      expect(normalizeTrackName('WeatherTech Raceway Laguna Seca', '')).toBe('Laguna Seca');
      expect(normalizeTrackName('Autodromo Internacional do Algarve', 'GP')).toBe('Portimao');
    });

    it('falls back to venue if no specific mapping matches', () => {
      expect(normalizeTrackName('Custom Track', 'Layout A')).toBe('Custom Track');
      expect(normalizeTrackName('Unknown Venue', '')).toBe('Unknown Venue');
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
