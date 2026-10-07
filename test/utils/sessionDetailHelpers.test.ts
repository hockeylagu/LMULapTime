import { describe, it, expect } from 'vitest';
import {
  findWeekendSessions,
  CandidateRelatedSession,
  WeekendSessionLink,
  sessionLapComparePath,
} from '../../src/components/session-detail/sessionDetailHelpers';
import { DetailedSession } from '../../server/core/types';

describe('sessionDetailHelpers', () => {
  describe('findWeekendSessions', () => {
    const MIN = 60_000;
    const T0 = 1_787_580_000_000;
    const monza = { trackVenue: 'Autodromo Nazionale Monza', trackCourse: 'Grand Prix' };
    const session = (fields: Partial<CandidateRelatedSession>): DetailedSession =>
      ({ ...monza, laps: [], drivers: [], ...fields }) as unknown as DetailedSession;
    const links = (found: WeekendSessionLink[]) => found.map((l) => `${l.type}:${l.target.id}`);

    it('returns nothing without a current session, candidates or a weekend session type', () => {
      const race = session({ id: 'r', sessionType: 'Race', timestamp: T0 });
      expect(findWeekendSessions(null, [])).toEqual([]);
      expect(findWeekendSessions(race, [])).toEqual([]);
      expect(findWeekendSessions(race, null as unknown as CandidateRelatedSession[])).toEqual([]);
      const warmup = session({ id: 'w', sessionType: 'Warmup', sessionName: 'Warmup', timestamp: T0 });
      expect(findWeekendSessions(warmup, [{ ...monza, id: 'q', sessionType: 'Qualifying', timestamp: T0 - MIN }])).toEqual([]);
    });

    it('links the earlier practice and qualifying of an offline weekend from its race, closest first', () => {
      const race = session({ id: 'r', sessionType: 'Race', sessionName: 'R1', timestamp: T0 });
      const candidates: CandidateRelatedSession[] = [
        { ...monza, id: 'p', sessionType: 'Practice', sessionName: 'P1', timestamp: T0 - 90 * MIN },
        { ...monza, id: 'q_older', sessionType: 'Qualifying', sessionName: 'Q1', timestamp: T0 - 80 * MIN },
        { ...monza, id: 'q', sessionType: 'Qualifying', sessionName: 'Q1', timestamp: T0 - 30 * MIN },
        { id: 'q_spa', trackVenue: 'Circuit de Spa-Francorchamps', sessionType: 'Qualifying', timestamp: T0 - MIN },
      ];
      expect(links(findWeekendSessions(race, candidates))).toEqual(['practice:p', 'qualifying:q']);
    });

    it('reads the start from the time string when the timestamp is missing', () => {
      const race = session({ id: 'r', sessionType: 'Race', timestamp: 0, timeString: '2026/06/15 15:00:00' });
      const candidates: CandidateRelatedSession[] = [
        { ...monza, id: 'q_close', sessionType: 'Qualifying', timeString: '2026/06/15 14:00:00' },
        { ...monza, id: 'q_far', sessionType: 'Qualifying', timeString: '2026/06/15 08:00:00' },
      ];
      expect(links(findWeekendSessions(race, candidates))).toEqual(['qualifying:q_close']);
    });

    it('never links across circuits, even close in time', () => {
      const practice = session({
        id: 'atl_p1', sessionType: 'Practice', sessionName: 'P1',
        trackVenue: 'Michelin Raceway Road Atlanta', trackCourse: 'Michelin Raceway Road Atlanta',
        timestamp: T0, settings: { modeSetting: 'Race Weekend' },
      });
      const candidates: CandidateRelatedSession[] = [
        {
          id: 'spa_r1', sessionType: 'Race', trackVenue: 'Circuit de Spa-Francorchamps', trackCourse: 'Circuit de Spa-Francorchamps',
          timestamp: T0 + 10 * MIN, settings: { modeSetting: 'Race Weekend' },
        },
        { id: 'mod_r1', sessionType: 'Race', trackVenue: 'Nonexistent Venue', timestamp: T0 + 10 * MIN },
      ];
      expect(findWeekendSessions(practice, candidates)).toEqual([]);
    });

    it('never links online and offline sessions to each other', () => {
      const offlinePractice = session({ id: 'p', sessionType: 'Practice', timestamp: T0 });
      const candidates: CandidateRelatedSession[] = [
        { ...monza, id: 'r_online', sessionType: 'Race', timestamp: T0 + MIN, settings: { serverName: 'Some Server' } },
        { ...monza, id: 'q_offline', sessionType: 'Qualifying', timestamp: T0 + 5 * MIN },
      ];
      expect(links(findWeekendSessions(offlinePractice, candidates))).toEqual(['qualifying:q_offline']);

      const onlineRace = session({ id: 'r', sessionType: 'Race', timestamp: T0, settings: { modeSetting: 'Multiplayer' } });
      expect(findWeekendSessions(onlineRace, [{ ...monza, id: 'q', sessionType: 'Qualifying', timestamp: T0 - MIN }])).toEqual([]);
    });

    it('never links offline sessions of another day or another car class', () => {
      const practice = session({ id: 'p', sessionType: 'Practice', timestamp: T0, playerDriver: { carClass: 'GT3' } });
      const candidates: CandidateRelatedSession[] = [
        { ...monza, id: 'r_next_day', sessionType: 'Race', timestamp: T0 + 24 * 60 * MIN },
        { ...monza, id: 'r_hypercar', sessionType: 'Race', timestamp: T0 + 40 * MIN, playerDriver: { carClass: 'Hypercar' } },
      ];
      expect(findWeekendSessions(practice, candidates)).toEqual([]);
    });

    it('does not point an offline weekend left before its race at the previous weekend race', () => {
      // Weekend A: P 12:00, Q 12:40, R 13:00. Weekend B: P 14:30, Q 15:10, then quit.
      const candidates: CandidateRelatedSession[] = [
        { ...monza, id: 'a_p', sessionType: 'Practice', timestamp: T0 },
        { ...monza, id: 'a_q', sessionType: 'Qualifying', timestamp: T0 + 40 * MIN },
        { ...monza, id: 'a_r', sessionType: 'Race', timestamp: T0 + 60 * MIN },
        { ...monza, id: 'b_p', sessionType: 'Practice', timestamp: T0 + 150 * MIN },
        { ...monza, id: 'b_q', sessionType: 'Qualifying', timestamp: T0 + 190 * MIN },
      ];
      const current = (id: string) => session(candidates.find((c) => c.id === id) ?? {});
      expect(links(findWeekendSessions(current('b_q'), candidates))).toEqual(['practice:b_p']);
      expect(links(findWeekendSessions(current('b_p'), candidates))).toEqual(['qualifying:b_q']);
      expect(links(findWeekendSessions(current('a_r'), candidates))).toEqual(['practice:a_p', 'qualifying:a_q']);
    });

    it('links the sessions of one multiplayer event by their shared event start', () => {
      const spa = {
        trackVenue: 'Circuit de Spa-Francorchamps', trackCourse: 'Circuit de Spa-Francorchamps',
        settings: { modeSetting: 'Multiplayer' },
      };
      const practice = session({
        ...spa, id: '2026_10_06_15_33_33-72P1', sessionType: 'Practice', sessionName: 'P1',
        timeString: '2026/10/06 15:31:00', timestamp: 1791315060101,
      });
      const candidates: CandidateRelatedSession[] = [
        { ...spa, id: '2026_10_06_15_43_27-90Q1', sessionType: 'Qualifying', sessionName: 'Q1', timeString: '2026/10/06 15:31:00', timestamp: 1791315060201 },
        { ...spa, id: '2026_10_06_16_09_01-31R1', sessionType: 'Race', sessionName: 'R1', timeString: '2026/10/06 15:31:00', timestamp: 1791315060301 },
        // The race of the previous week's event on the same circuit
        { ...spa, id: '2026_09_30_16_24_19-59R1', sessionType: 'Race', sessionName: 'R1', timeString: '2026/09/30 15:46:21', timestamp: 1790797581301 },
      ];
      expect(links(findWeekendSessions(practice, candidates))).toEqual([
        'qualifying:2026_10_06_15_43_27-90Q1',
        'race:2026_10_06_16_09_01-31R1',
      ]);
    });

    it('does not link the previous event of a cycling multiplayer server', () => {
      // A server looping every 45 minutes: event N raced, event N+1 left after qualifying.
      const server = { ...monza, settings: { modeSetting: 'Multiplayer', serverName: 'Sprint Server' } };
      const candidates: CandidateRelatedSession[] = [
        { ...server, id: 'n_q', sessionType: 'Qualifying', timeString: '2026/08/24 12:00:00', timestamp: T0 + 201 },
        { ...server, id: 'n_r', sessionType: 'Race', timeString: '2026/08/24 12:00:00', timestamp: T0 + 301 },
        { ...server, id: 'n1_p', sessionType: 'Practice', timeString: '2026/08/24 12:45:00', timestamp: T0 + 45 * MIN + 101 },
      ];
      const qualiN1 = session({
        ...server, id: 'n1_q', sessionType: 'Qualifying', timeString: '2026/08/24 12:45:00', timestamp: T0 + 45 * MIN + 201,
      });
      expect(links(findWeekendSessions(qualiN1, candidates))).toEqual(['practice:n1_p']);
    });
  });

  describe('sessionLapComparePath', () => {
    it("opens the lap on the leaderboard under the board's class, not the results file's", () => {
      const session = { id: 'race 1', trackVenue: 'Bahrain International Circuit', trackCourse: 'Bahrain International Circuit' };
      const path = sessionLapComparePath(session, { carClass: 'GT3', carType: 'Ferrari 296 GT3' }, 3);
      const params = new URLSearchParams(path.split('?')[1]);
      expect(path.startsWith('/leaderboard?')).toBe(true);
      expect(params.get('carClass')).toBe('LMGT3');
      expect(params.get('sessionId')).toBe('race 1');
      expect(params.get('lapNum')).toBe('3');
      expect(new URLSearchParams(sessionLapComparePath(session, undefined, null).split('?')[1]).has('lapNum')).toBe(false);
    });
  });
});
