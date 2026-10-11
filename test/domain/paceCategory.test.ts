import { describe, it, expect } from 'vitest';
import { ReferenceLaptimeEntry } from '../../server/core/types.js';
import {
  formatPacePercentage,
  matchesTrack,
  getPaceCategoryFromPercentage,
  findMatchingTrackBenchmarkEntries,
  findReferenceEntry,
  createBenchmarkLookup,
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

  describe('matchesTrack - Comprehensive Track Matching', () => {
    it('strictly isolates track layouts (Monza Curva Grande, Bahrain Outer/Paddock, Paul Ricard Short)', () => {
      const replayTrackNames = [
        'Autodromo Nazionale Monza', 'Monza Curva Grande Circuit',
        'Bahrain International Circuit', 'Bahrain Outer Circuit', 'Bahrain Paddock Circuit',
        'Circuit Paul Ricard', 'Paul Ricard - 1A-V2-Short',
      ];
      const matching = (current: string) => replayTrackNames.filter(name => matchesTrack(name, current, ''));
      expect(matching('Autodromo Nazionale Monza (Curva Grande Circuit)')).toEqual(['Monza Curva Grande Circuit']);
      expect(matching('Bahrain International Circuit (Outer Circuit)')).toEqual(['Bahrain Outer Circuit']);
      expect(matching('Bahrain International Circuit (Paddock Circuit)')).toEqual(['Bahrain Paddock Circuit']);
      expect(matching('Paul Ricard Circuit (1A V2 Short)')).toEqual(['Paul Ricard - 1A-V2-Short']);
    });

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
      { trackName: 'Spa', carClass: 'Hyper', target100Sec: 120.0 },
      { trackName: 'Spa', carClass: 'GT3', target100Sec: 135.0 },
      { trackName: 'Monza', carClass: 'Hyper', target100Sec: 95.0 },
      { trackName: 'Sebring', carClass: 'GT3', target100Sec: 120.23 },
      { trackName: 'Sebring (school)', carClass: 'GT3', target100Sec: 62.90 },
      { trackName: 'Silverstone (GP)', carClass: 'Hyper', target100Sec: 100.0 },
      { trackName: 'Silverstone (National)', carClass: 'Hyper', target100Sec: 55.0 },
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
      const entry = findReferenceEntry(mockEntries, 'Spa', 'GP', 'GT3');
      expect(entry?.carClass).toBe('GT3');
      expect(entry?.target100Sec).toBe(135.0);

      const sebringRef = findReferenceEntry(mockEntries, 'Sebring International Raceway', '12h', 'GT3');
      expect(sebringRef?.target100Sec).toBe(120.23);

      const schoolRef = findReferenceEntry(mockEntries, 'Sebring International Raceway', 'School', 'GT3');
      expect(schoolRef?.target100Sec).toBe(62.90);
    });

    it('requires an exact canonical class and never selects another class benchmark', () => {
      expect(findReferenceEntry(mockEntries, 'Spa', 'GP', 'LMP3')).toBeNull();
      expect(findReferenceEntry(mockEntries, 'Spa', 'GP', 'LMH')).toBeNull();
      expect(findReferenceEntry(mockEntries, 'Spa', 'GP', '')).toBeNull();
    });

    it('returns null when no track matches', () => {
      const entry = findReferenceEntry(mockEntries, 'Unknown Track', '', 'Hyper');
      expect(entry).toBeNull();
    });
    it('batch lookup preserves layout, class, custom-track fallbacks and input ordering', () => {
      const entries = [...mockEntries,
        { trackName: 'My Custom Track', carClass: 'Hyper', target100Sec: 90 } as ReferenceLaptimeEntry];
      const lookup = createBenchmarkLookup(entries);
      for (const [venue, course] of [['Spa', 'GP'], ['Sebring', 'School'], ['Silverstone', 'National'], ['My Custom', ''], ['Missing', '']]) {
        expect(lookup.findTrackEntries(venue, course)).toEqual(findMatchingTrackBenchmarkEntries(entries, venue, course));
        for (const carClass of ['Hyper', 'GT3', 'Unknown', 'All']) {
          expect(lookup.findReferenceEntry(venue, course, carClass)).toEqual(findReferenceEntry(entries, venue, course, carClass));
        }
      }
    });
  });
});
