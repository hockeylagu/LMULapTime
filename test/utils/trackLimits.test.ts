import { describe, it, expect } from 'vitest';
import {
  isNoFurtherActionTrackLimit,
  getTrackLimitPoints,
  getTrackLimitSeverity,
  getWorstTrackLimitSeverity,
  getTrackLimitBadgeClasses,
  getTrackLimitStandingsPillClasses,
} from '../../src/utils/trackLimits.js';
import { LapTrackLimit } from '../../server/core/types.js';

describe('trackLimits utility', () => {
  describe('isNoFurtherActionTrackLimit', () => {
    it('returns true when action contains "No Further Action"', () => {
      const tl: LapTrackLimit = { description: 'Track limits review', action: 'No Further Action' };
      expect(isNoFurtherActionTrackLimit(tl)).toBe(true);
    });

    it('returns true case-insensitively', () => {
      const tl: LapTrackLimit = { description: 'Review', action: 'no further action' };
      expect(isNoFurtherActionTrackLimit(tl)).toBe(true);
    });

    it('returns true when description contains "No Further Action"', () => {
      const tl: LapTrackLimit = { description: 'Track limits review (No Further Action)' };
      expect(isNoFurtherActionTrackLimit(tl)).toBe(true);
    });

    it('returns true when warningPoints is 0 and action is not warning', () => {
      const tl: LapTrackLimit = { description: 'Review', warningPoints: 0 };
      expect(isNoFurtherActionTrackLimit(tl)).toBe(true);
    });

    it('returns false when action is warning', () => {
      const tl: LapTrackLimit = { description: 'Violation', action: 'Warning', warningPoints: 0.25 };
      expect(isNoFurtherActionTrackLimit(tl)).toBe(false);
    });
  });

  describe('getTrackLimitPoints', () => {
    it('returns warningPoints when available', () => {
      expect(getTrackLimitPoints({ description: 'TL', warningPoints: 0.5 })).toBe(0.5);
    });

    it('returns currentPoints when warningPoints is not available', () => {
      expect(getTrackLimitPoints({ description: 'TL', currentPoints: 0.75 })).toBe(0.75);
    });

    it('extracts points from description if fields missing', () => {
      expect(getTrackLimitPoints({ description: 'Track limits violation (+0.50 pts)' })).toBe(0.5);
      expect(getTrackLimitPoints({ description: 'Track limits violation (+0.75 pts)' })).toBe(0.75);
    });

    it('defaults to 0.25 if no point info available', () => {
      expect(getTrackLimitPoints({ description: 'Track limits' })).toBe(0.25);
    });
  });

  describe('getTrackLimitSeverity', () => {
    it('returns cleared for No Further Action', () => {
      const tl1: LapTrackLimit = { description: 'Track limits review', action: 'No Further Action' };
      expect(getTrackLimitSeverity(tl1)).toBe('cleared');

      const tl2: LapTrackLimit = { description: 'Track limits review (No Further Action)' };
      expect(getTrackLimitSeverity(tl2)).toBe('cleared');

      const tl3: LapTrackLimit = { description: 'Track limits', warningPoints: 0, action: 'No Action' };
      expect(getTrackLimitSeverity(tl3)).toBe('cleared');
    });

    it('returns warning for 0.25 points', () => {
      const tl: LapTrackLimit = { description: 'Violation', warningPoints: 0.25, action: 'Warning' };
      expect(getTrackLimitSeverity(tl)).toBe('warning');
    });

    it('returns warning for 0.50 points', () => {
      const tl: LapTrackLimit = { description: 'Violation', warningPoints: 0.50, action: 'Warning' };
      expect(getTrackLimitSeverity(tl)).toBe('warning');
    });

    it('returns serious for 0.75 points', () => {
      const tl: LapTrackLimit = { description: 'Violation', warningPoints: 0.75, action: 'Warning' };
      expect(getTrackLimitSeverity(tl)).toBe('serious');
    });

    it('returns serious for points >= 0.75 (e.g. 1.0)', () => {
      const tl: LapTrackLimit = { description: 'Violation', warningPoints: 1.0, action: 'Warning' };
      expect(getTrackLimitSeverity(tl)).toBe('serious');
    });

    it('returns serious when accumulated currentPoints >= 0.75 even if warningPoints is 0.25', () => {
      const tl: LapTrackLimit = {
        description: 'Violation',
        warningPoints: 0.25,
        currentPoints: 0.75,
        action: 'Warning',
      };
      expect(getTrackLimitSeverity(tl)).toBe('serious');
    });
  });

  describe('getWorstTrackLimitSeverity', () => {
    it('returns cleared when all are No Further Action', () => {
      const tls: LapTrackLimit[] = [
        { description: 'Review', action: 'No Further Action' },
        { description: 'Review', action: 'No Further Action' },
      ];
      expect(getWorstTrackLimitSeverity(tls)).toBe('cleared');
    });

    it('returns warning when mixing cleared and 0.25/0.50', () => {
      const tls: LapTrackLimit[] = [
        { description: 'Review', action: 'No Further Action' },
        { description: 'Violation', warningPoints: 0.25, action: 'Warning' },
      ];
      expect(getWorstTrackLimitSeverity(tls)).toBe('warning');
    });

    it('returns serious when any track limit is 0.75+', () => {
      const tls: LapTrackLimit[] = [
        { description: 'Review', action: 'No Further Action' },
        { description: 'Violation', warningPoints: 0.25, action: 'Warning' },
        { description: 'Violation', warningPoints: 0.75, action: 'Warning' },
      ];
      expect(getWorstTrackLimitSeverity(tls)).toBe('serious');
    });
  });

  describe('badge and pill classes', () => {
    it('returns neutral classes for cleared', () => {
      expect(getTrackLimitBadgeClasses('cleared')).toContain('lmu-raised');
      expect(getTrackLimitStandingsPillClasses('cleared')).toContain('lmu-raised');
    });

    it('returns warn classes for a warning', () => {
      expect(getTrackLimitBadgeClasses('warning')).toContain('lmu-warn');
      expect(getTrackLimitStandingsPillClasses('warning')).toContain('lmu-warn');
    });

    it('returns loss classes for serious', () => {
      expect(getTrackLimitBadgeClasses('serious')).toContain('lmu-loss');
      expect(getTrackLimitStandingsPillClasses('serious')).toContain('lmu-loss');
    });
  });
});
