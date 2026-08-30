import { describe, it, expect } from 'vitest';
import {
  getPaceCategoryStyle,
  formatPacePercentage,
  normalizeCarClassGroup,
  matchesCarClass,
  normalizeTrackName,
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
      expect(getPaceCategoryStyle('InvalidCategory' as any)).toEqual(PACE_CATEGORY_STYLES.Offline);
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

  describe('normalizeTrackName', () => {
    it('normalizes Paul Ricard variations', () => {
      expect(normalizeTrackName('Circuit Paul Ricard', '1A v2 Short')).toBe('Paul Ricard (1A v2 short)');
      expect(normalizeTrackName('Paul Ricard', '1A v2')).toBe('Paul Ricard (1A v2)');
      expect(normalizeTrackName('Paul Ricard', '1A')).toBe('Paul Ricard (1A)');
      expect(normalizeTrackName('Paul Ricard', '3A')).toBe('Paul Ricard (3A)');
      expect(normalizeTrackName('Paul Ricard', '')).toBe('Paul Ricard (1A v2)');
    });

    it('normalizes Monza variations', () => {
      expect(normalizeTrackName('Autodromo Nazionale Monza', '')).toBe('Monza');
      expect(normalizeTrackName('Monza', 'Curva Grande')).toBe('Monza (curvagrande)');
    });

    it('normalizes Spa, Sarthe, COTA, and Silverstone variations', () => {
      expect(normalizeTrackName('Circuit de Spa-Francorchamps', 'GP')).toBe('Spa');
      expect(normalizeTrackName('Circuit 24 Heures du Mans', 'Straight')).toBe('Circuit de la Sarthe (straight)');
      expect(normalizeTrackName('Circuit of the Americas', 'National')).toBe('COTA (national)');
      expect(normalizeTrackName('Circuit of the Americas', 'GP')).toBe('COTA');
      expect(normalizeTrackName('Silverstone', 'National')).toBe('Silverstone (National)');
      expect(normalizeTrackName('Silverstone', 'International')).toBe('Silverstone (International)');
      expect(normalizeTrackName('Silverstone', 'GP')).toBe('Silverstone (GP)');
    });

    it('normalizes Bahrain, Qatar, Fuji, and Sebring variations', () => {
      expect(normalizeTrackName('Bahrain International Circuit', 'Endurance')).toBe('Bahrain (endurance)');
      expect(normalizeTrackName('Bahrain', 'Outer')).toBe('Bahrain (outer)');
      expect(normalizeTrackName('Bahrain', 'Paddock')).toBe('Bahrain (paddock)');
      expect(normalizeTrackName('Bahrain', '')).toBe('Bahrain (wec)');
      expect(normalizeTrackName('Losail Qatar', 'Short')).toBe('Qatar (short)');
      expect(normalizeTrackName('Lusail', '')).toBe('Qatar');
      expect(normalizeTrackName('Fuji Speedway', 'Classic')).toBe('Fuji (classic)');
      expect(normalizeTrackName('Fuji', '')).toBe('Fuji (chicane)');
      expect(normalizeTrackName('Sebring International Raceway', 'School')).toBe('Sebring (school)');
      expect(normalizeTrackName('Sebring', '')).toBe('Sebring');
    });

    it('normalizes Barcelona, Daytona, Imola, Interlagos, Laguna Seca, Portimao', () => {
      expect(normalizeTrackName('Circuit de Barcelona-Catalunya', '')).toBe('Barcelona');
      expect(normalizeTrackName('Daytona International Speedway', '')).toBe('Daytona');
      expect(normalizeTrackName('Autodromo Enzo e Dino Ferrari', '')).toBe('Imola');
      expect(normalizeTrackName('Autodromo Jose Carlos Pace', '')).toBe('Interlagos');
      expect(normalizeTrackName('WeatherTech Raceway Laguna Seca', '')).toBe('Laguna Seca');
      expect(normalizeTrackName('Autodromo Internacional do Algarve', '')).toBe('Portimao');
    });

    it('falls back to venue if no specific mapping matches', () => {
      expect(normalizeTrackName('Custom Track', 'Layout A')).toBe('Custom Track');
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
});
