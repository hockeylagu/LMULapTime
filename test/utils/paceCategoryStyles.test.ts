import { describe, it, expect } from 'vitest';
import { PaceCategory } from '../../shared/types/index.js';
import {
  getPaceCategoryStyle,
  PACE_CATEGORY_STYLES,
} from '../../src/utils/paceCategoryStyles.js';

describe('paceCategoryStyles utility', () => {
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
});
