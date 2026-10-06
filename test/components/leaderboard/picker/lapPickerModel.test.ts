import { describe, it, expect } from 'vitest';
import type { ComparableLap } from '../../../../shared/types/index.js';
import {
  DEFAULT_PICKER_FILTERS,
  groupPickerSessions,
  lapEventDay,
  lapSessionKind,
  pickerQuickPicks,
} from '../../../../src/components/leaderboard/picker/lapPickerModel.js';
import { placeComparedLap } from '../../../../src/components/leaderboard/useCompareLapsData.js';

const DAY = Date.parse('2026-09-20T12:00:00');

function lap(sessionId: string, sessionType: string, lapNum: number, lapTime: number, extra: Partial<ComparableLap> = {}): ComparableLap {
  const offset = { p: 0, q: 1, r: 2, old: -86_400_000 * 7 }[sessionId] ?? 0;
  const timestamp = sessionId === 'old' ? DAY + offset : DAY + offset * 3_600_000;
  const date = new Date(timestamp);
  return {
    id: `${sessionId}_Me_lap_${lapNum}`,
    sessionId,
    sessionName: sessionType,
    sessionType,
    timestamp,
    dateString: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} 12:00`,
    driverName: 'Me',
    carType: 'Ferrari 296 GT3',
    carClass: 'LMGT3',
    lapNum,
    lapTime,
    lapTimeString: lapTime.toFixed(3),
    s1: null,
    s2: null,
    s3: null,
    topSpeed: null,
    isValid: true,
    isPlayer: true,
    ...extra,
  };
}

const laps: ComparableLap[] = [
  lap('old', 'Practice', 1, 125), lap('old', 'Practice', 2, 119.5),
  lap('p', 'Practice', 1, 124), lap('p', 'Practice', 2, 121), lap('p', 'Practice', 3, 120.8),
  lap('q', 'Qualifying', 1, 123), lap('q', 'Qualifying', 2, 120.2), lap('q', 'Qualifying', 3, 119.9, { isValid: false }),
  lap('r', 'Race', 1, 126), lap('r', 'Race', 2, 121.4), lap('r', 'Race', 3, 120.9, { isPitStop: true }), lap('r', 'Race', 4, 121.1),
];
const raceLap = laps.find((l) => l.id === 'r_Me_lap_4')!;

describe('lap picker model', () => {
  it('reads the session kind and the event day', () => {
    expect(lapSessionKind({ sessionType: 'Qualifying', sessionName: 'Q1' })).toBe('quali');
    expect(lapSessionKind({ sessionType: 'Race', sessionName: 'R1' })).toBe('race');
    expect(lapSessionKind({ sessionType: 'Practice', sessionName: 'P1' })).toBe('practice');
    expect(lapEventDay({ dateString: '2026/09/20 14:00' })).toBe('2026/09/20');
  });

  it('groups the laps by session, newest first, keeping the clean laps by default', () => {
    const sessions = groupPickerSessions(laps, DEFAULT_PICKER_FILTERS, raceLap);
    expect(sessions.map((s) => s.sessionId)).toEqual(['r', 'q', 'p', 'old']);
    // The start lap, the pit lap and the invalid lap are not clean.
    expect(sessions[0].laps.map((l) => l.lapNum)).toEqual([2, 4]);
    expect(sessions[1].laps.map((l) => l.lapNum)).toEqual([2]);
    expect(sessions[1].bestLapId).toBe('q_Me_lap_2');
  });

  it('filters by session type, and shows every lap when clean only is off', () => {
    const quali = groupPickerSessions(laps, { ...DEFAULT_PICKER_FILTERS, kind: 'quali', cleanOnly: false }, raceLap);
    expect(quali).toHaveLength(1);
    expect(quali[0].laps.map((l) => l.lapNum)).toEqual([1, 2, 3]);
  });

  it('keeps the anchor lap’s conditions unless all conditions are asked for', () => {
    const wet = laps.map((l) => (l.sessionId === 'q' ? { ...l, weatherCondition: 'Wet' as const } : l));
    expect(groupPickerSessions(wet, DEFAULT_PICKER_FILTERS, raceLap).map((s) => s.sessionId)).not.toContain('q');
    expect(groupPickerSessions(wet, { ...DEFAULT_PICKER_FILTERS, condition: 'all' }, raceLap).map((s) => s.sessionId)).toContain('q');
  });

  it('offers the event’s qualifying and race bests, this session’s and the previous session’s', () => {
    const picks = pickerQuickPicks(laps, raceLap, DEFAULT_PICKER_FILTERS, [raceLap.id]);
    expect(picks.map((p) => [p.key, p.lap.id])).toEqual([
      ['event-quali', 'q_Me_lap_2'],
      ['this-session', 'r_Me_lap_2'],
    ]);
    // From practice, the previous session is a week before, outside the event.
    const fromPractice = pickerQuickPicks(laps, laps.find((l) => l.id === 'p_Me_lap_3')!, DEFAULT_PICKER_FILTERS, ['p_Me_lap_3']);
    expect(fromPractice.map((p) => [p.key, p.lap.id])).toEqual([
      ['event-quali', 'q_Me_lap_2'],
      ['event-race', 'r_Me_lap_4'],
      ['this-session', 'p_Me_lap_2'],
      ['previous-session', 'old_Me_lap_2'],
    ]);
  });

  it('places a picked lap in the slot it replaces, or in the empty slot', () => {
    const [a, b, c] = [laps[2], laps[3], laps[4]];
    expect(placeComparedLap([a, b], c, a.id)).toEqual([c, b]);
    expect(placeComparedLap([a], c, null)).toEqual([a, c]);
    expect(placeComparedLap([a, b], b, a.id)).toEqual([a, b]);
  });
});
