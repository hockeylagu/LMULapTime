import { describe, it, expect } from 'vitest';
import {
  findRelatedSession,
  OPPONENT_COLORS,
  PLAYER_HIGHLIGHT_COLOR,
  CandidateRelatedSession,
} from '../../src/components/session-detail/sessionDetailHelpers';
import { DetailedSession } from '../../server/core/types';

describe('sessionDetailHelpers', () => {
  it('exports valid color constants', () => {
    expect(OPPONENT_COLORS.length).toBeGreaterThan(5);
    expect(PLAYER_HIGHLIGHT_COLOR).toBe('#FBBF24');
  });

  describe('findRelatedSession', () => {
    const baseCurrent: DetailedSession = {
      id: 'session_2026_06_15_R1',
      sessionType: 'Race',
      sessionName: 'Race 1',
      trackVenue: 'Autodromo Nazionale Monza',
      trackCourse: 'Grand Prix',
      timeString: '2026-06-15 14:00',
      timestamp: 1781532000,
      filename: 'session_2026_06_15_R1.xml',
      laps: [],
      drivers: [],
    } as unknown as DetailedSession;

    it('returns null when current session or candidate list is missing/empty', () => {
      expect(findRelatedSession(null, [])).toBeNull();
      expect(findRelatedSession(baseCurrent, [])).toBeNull();
      expect(findRelatedSession(baseCurrent, null as unknown as CandidateRelatedSession[])).toBeNull();
    });

    it('returns null when session type is neither race, qualifying, nor practice', () => {
      const warmup = { ...baseCurrent, sessionType: 'Warmup' as unknown as DetailedSession['sessionType'], sessionName: 'Warmup' };
      const candidates: CandidateRelatedSession[] = [
        { id: 'c1', sessionType: 'Qualifying' },
      ];
      expect(findRelatedSession(warmup, candidates)).toBeNull();
    });

    it('finds related qualifying session via direct ID pattern match for race', () => {
      const candidates: CandidateRelatedSession[] = [
        { id: 'session_2026_06_15_Q1', sessionType: 'Qualifying', sessionName: 'Qualifying' },
        { id: 'other_session', sessionType: 'Qualifying', sessionName: 'Qualifying' },
      ];

      const res = findRelatedSession(baseCurrent, candidates);
      expect(res).not.toBeNull();
      expect(res?.type).toBe('qualifying');
      expect(res?.target.id).toBe('session_2026_06_15_Q1');
    });

    it('finds related race session via direct filename pattern match for qualifying', () => {
      const qualiCurrent: DetailedSession = {
        ...baseCurrent,
        id: 'session_2026_06_15_Q1',
        sessionType: 'Qualifying',
        sessionName: 'Qualifying',
      };

      const candidates: CandidateRelatedSession[] = [
        {
          id: 'session-random',
          filename: 'session_2026_06_15_R1.xml',
          sessionType: 'Race',
          sessionName: 'Race 1',
        },
      ];

      const res = findRelatedSession(qualiCurrent, candidates);
      expect(res).not.toBeNull();
      expect(res?.type).toBe('race');
      expect(res?.target.filename).toBe('session_2026_06_15_R1.xml');
    });

    it('falls back to same track and closest time when ID pattern does not match', () => {
      const nonPatternCurrent: DetailedSession = {
        ...baseCurrent,
        id: 'race_monza_custom',
        timestamp: 10000,
      };

      const candidates: CandidateRelatedSession[] = [
        {
          id: 'q_diff_track',
          sessionType: 'Qualifying',
          trackVenue: 'Spa Francorchamps',
          timestamp: 9900,
        },
        {
          id: 'q_monza_older',
          sessionType: 'Qualifying',
          trackVenue: 'Autodromo Nazionale Monza',
          trackCourse: 'Grand Prix',
          timestamp: 5000,
        },
        {
          id: 'q_monza_closest',
          sessionType: 'Qualifying',
          trackVenue: 'Autodromo Nazionale Monza',
          trackCourse: 'Grand Prix',
          timestamp: 9500,
        },
      ];

      const res = findRelatedSession(nonPatternCurrent, candidates);
      expect(res).not.toBeNull();
      expect(res?.target.id).toBe('q_monza_closest');
    });

    it('handles practice sessions targeting race first, then falling back to qualifying', () => {
      const practiceCurrent: DetailedSession = {
        ...baseCurrent,
        id: 'practice_monza',
        sessionType: 'Practice',
        sessionName: 'Practice 1',
        timestamp: 8000,
      };

      // Only qualifying available (no race)
      const candidates: CandidateRelatedSession[] = [
        {
          id: 'q_only',
          sessionType: 'Qualifying',
          trackVenue: 'Autodromo Nazionale Monza',
          timestamp: 8500,
        },
      ];

      const res = findRelatedSession(practiceCurrent, candidates);
      expect(res).not.toBeNull();
      expect(res?.type).toBe('qualifying');
      expect(res?.target.id).toBe('q_only');
    });

    it('returns null if practice session has neither race nor qualifying candidates', () => {
      const practiceCurrent: DetailedSession = {
        ...baseCurrent,
        id: 'practice_monza',
        sessionType: 'Practice',
        sessionName: 'Practice 1',
      };

      const candidates: CandidateRelatedSession[] = [
        { id: 'practice_2', sessionType: 'Practice' },
      ];

      expect(findRelatedSession(practiceCurrent, candidates)).toBeNull();
    });

    it('falls back to dateString parsing when timestamp is not present', () => {
      const dateCurrent: DetailedSession = {
        ...baseCurrent,
        id: 'race_timeString',
        timestamp: 0,
        timeString: '2026-06-15 15:00:00',
      };

      const candidates: CandidateRelatedSession[] = [
        {
          id: 'q_close',
          sessionType: 'Qualifying',
          trackVenue: 'Autodromo Nazionale Monza',
          timeString: '2026-06-15 14:00:00',
        },
        {
          id: 'q_far',
          sessionType: 'Qualifying',
          trackVenue: 'Autodromo Nazionale Monza',
          timeString: '2026-06-15 08:00:00',
        },
      ];

      const res = findRelatedSession(dateCurrent, candidates);
      expect(res?.target.id).toBe('q_close');
    });

    it('falls back to candidate pool if no candidate matches track', () => {
      const currentOtherTrack: DetailedSession = {
        ...baseCurrent,
        id: 'race_unknown',
        trackVenue: 'Nonexistent Venue',
        timestamp: 1000,
      };

      const candidates: CandidateRelatedSession[] = [
        { id: 'q_any', sessionType: 'Qualifying', trackVenue: 'Spa', timestamp: 1200 },
      ];

      const res = findRelatedSession(currentOtherTrack, candidates);
      expect(res?.target.id).toBe('q_any');
    });
  });
});
