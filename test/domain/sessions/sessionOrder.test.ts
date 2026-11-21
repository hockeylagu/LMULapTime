import { describe, it, expect } from 'vitest';
import { parseDateStringToTimestamp, getSessionTypeWeight, compareSessions, compareSessionsBySortOption } from '../../../shared/domain/sessions/sessionOrder.js';

describe('parseDateStringToTimestamp', () => {
  it('returns 0 for empty or undefined strings', () => {
    expect(parseDateStringToTimestamp('')).toBe(0);
    expect(parseDateStringToTimestamp(undefined)).toBe(0);
  });

  it('parses valid date strings with slashes or dashes', () => {
    expect(parseDateStringToTimestamp('2026/05/28 14:00')).toBeGreaterThan(0);
    expect(parseDateStringToTimestamp('2026-05-28 14:00')).toBeGreaterThan(0);
  });
});

describe('getSessionTypeWeight and compareSessions', () => {
  it('ranks Race as higher weight / newer than Qualifying, and Qualifying higher than Practice', () => {
    const practiceWeight = getSessionTypeWeight('Practice', 'P1');
    const qualiWeight = getSessionTypeWeight('Qualifying', 'Q1');
    const raceWeight = getSessionTypeWeight('Race', 'R1');

    expect(practiceWeight).toBeLessThan(qualiWeight);
    expect(qualiWeight).toBeLessThan(raceWeight);
  });

  it('keeps unknown types unknown even when their display names resemble a category', () => {
    expect(getSessionTypeWeight('Unknown', 'Race preparation')).toBe(0);
    expect(getSessionTypeWeight('Practice', 'Race preparation')).toBe(101);
    expect(getSessionTypeWeight('Practice', 'P2')).toBe(102);
  });

  it('orders Race after Qualifying in chronological ascending order, and before in descending order', () => {
    const qualiSession = {
      id: '2026_05_28_Q1',
      timeString: '2026/05/28 14:00:00',
      sessionType: 'Qualifying',
      sessionName: 'Q1',
    };

    const raceSession = {
      id: '2026_05_28_R1',
      timeString: '2026/05/28 14:00:00',
      sessionType: 'Race',
      sessionName: 'R1',
    };

    // In descending order (newest first), Race is newer so it should come first (negative return value)
    expect(compareSessions(raceSession, qualiSession, 'desc')).toBeLessThan(0);
    expect(compareSessions(qualiSession, raceSession, 'desc')).toBeGreaterThan(0);

    // In ascending order (chronological), Quali comes before Race (negative return value)
    expect(compareSessions(qualiSession, raceSession, 'asc')).toBeLessThan(0);
    expect(compareSessions(raceSession, qualiSession, 'asc')).toBeGreaterThan(0);
  });

  it('orders multiple sessions on the same date: Practice -> Quali -> Race', () => {
    const p1 = { id: 'P1', timeString: '2026/05/28 14:00', sessionType: 'Practice', sessionName: 'P1' };
    const q1 = { id: 'Q1', timeString: '2026/05/28 14:00', sessionType: 'Qualifying', sessionName: 'Q1' };
    const r1 = { id: 'R1', timeString: '2026/05/28 14:00', sessionType: 'Race', sessionName: 'R1' };

    const list = [q1, r1, p1];

    // Chronological: Practice, Quali, Race
    const sortedAsc = [...list].sort((a, b) => compareSessions(a, b, 'asc'));
    expect(sortedAsc.map(s => s.id)).toEqual(['P1', 'Q1', 'R1']);

    // Newest first: Race, Quali, Practice
    const sortedDesc = [...list].sort((a, b) => compareSessions(a, b, 'desc'));
    expect(sortedDesc.map(s => s.id)).toEqual(['R1', 'Q1', 'P1']);
  });
});

describe('compareSessionsBySortOption', () => {
  const s1 = {
    id: 'sess-1',
    timeString: '2026/05/28 10:00:00',
    sessionType: 'Race',
    sessionName: 'R1',
    playerDriver: {
      position: 1,
      bestLapTime: 120.5,
      bestLapPacePercentage: 101.2,
    },
  };

  const s2 = {
    id: 'sess-2',
    timeString: '2026/05/28 12:00:00',
    sessionType: 'Qualifying',
    sessionName: 'Q1',
    playerDriver: {
      position: 2,
      bestLapTime: 119.8,
      bestLapPacePercentage: 100.5,
    },
  };

  const s3 = {
    id: 'sess-3',
    timeString: '2026/05/28 09:00:00',
    sessionType: 'Practice',
    sessionName: 'P1',
    playerDriver: {
      position: 5,
      bestLapTime: 125.0,
      bestLapPacePercentage: 104.5,
    },
  };

  const sNoData = {
    id: 'sess-empty',
    timeString: '2026/05/28 08:00:00',
    sessionType: 'Practice',
    sessionName: 'P0',
  };

  it('sorts by date-desc and date-asc', () => {
    const list = [s1, s2, s3];
    const desc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'date-desc'));
    expect(desc.map((s) => s.id)).toEqual(['sess-2', 'sess-1', 'sess-3']);

    const asc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'date-asc'));
    expect(asc.map((s) => s.id)).toEqual(['sess-3', 'sess-1', 'sess-2']);
  });

  it('sorts by pos-asc prioritizing Race over Quali over Practice, then position, then date tie-break', () => {
    const list = [s3, s2, s1];
    const sorted = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'pos-asc'));
    // Race (s1) has highest type rank (0), Quali (s2) rank 1, Practice (s3) rank 2
    expect(sorted.map((s) => s.id)).toEqual(['sess-1', 'sess-2', 'sess-3']);
  });

  it('sorts by lap-asc with fastest bestLapTime first and missing laps placed last', () => {
    const list = [s1, sNoData, s3, s2];
    const sorted = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'lap-asc'));
    // 119.8 (s2) < 120.5 (s1) < 125.0 (s3) < no data (sNoData)
    expect(sorted.map((s) => s.id)).toEqual(['sess-2', 'sess-1', 'sess-3', 'sess-empty']);
  });

  it('sorts by pace-asc and pace-desc with lowest/highest pace % first and missing pace placed last', () => {
    const list = [s1, sNoData, s3, s2];
    const asc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'pace-asc'));
    // 100.5 (s2) < 101.2 (s1) < 104.5 (s3) < 999 (sNoData)
    expect(asc.map((s) => s.id)).toEqual(['sess-2', 'sess-1', 'sess-3', 'sess-empty']);

    const desc = [...list].sort((a, b) => compareSessionsBySortOption(a, b, 'pace-desc'));
    // 104.5 (s3) > 101.2 (s1) > 100.5 (s2) (with sNoData placed at 999 first)
    expect(desc[0].id).toBe('sess-empty');
    expect(desc.slice(1).map((s) => s.id)).toEqual(['sess-3', 'sess-1', 'sess-2']);
  });

  it('supports custom selectors for lap times and pace percentages', () => {
    interface CustomSession {
      id: string;
      customLap?: number;
      customPace?: number;
    }
    const c1: CustomSession = { id: 'c1', customLap: 100, customPace: 102 };
    const c2: CustomSession = { id: 'c2', customLap: 90, customPace: 105 };

    const sortedByLap = [c1, c2].sort((a, b) =>
      compareSessionsBySortOption(a, b, 'lap-asc', {
        getBestLapTime: (s) => s.customLap,
      })
    );
    expect(sortedByLap.map((s) => s.id)).toEqual(['c2', 'c1']);

    const sortedByPace = [c1, c2].sort((a, b) =>
      compareSessionsBySortOption(a, b, 'pace-asc', {
        getPacePercentage: (s) => s.customPace,
      })
    );
    expect(sortedByPace.map((s) => s.id)).toEqual(['c1', 'c2']);
  });
});
