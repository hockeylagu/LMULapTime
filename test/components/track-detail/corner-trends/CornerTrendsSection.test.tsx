import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CornerTrend, CornerTrendPoint, CornerTrendsResponse } from '../../../../shared/types/corners/cornerTrends.js';
import type { CornerHabitTrend } from '../../../../shared/types/corners/cornerAnalysis.js';

const api = vi.hoisted(() => ({ fetchCornerTrends: vi.fn(), onSequenceMapsChanged: vi.fn(() => () => {}) }));
vi.mock('../../../../src/api/cornerSequenceApi.js', () => api);

import { CornerTrendsSection } from '../../../../src/components/track-detail/corner-trends/CornerTrendsSection.js';
import { cornerTrendRow, cornerTrendTone, focusCornerIds, graphTopSec, missingSessionsText, sessionMark, sharedGraphSpanSec, sortCornerRows, type CornerSort } from '../../../../src/components/track-detail/corner-trends/cornerTrendRows.js';

const point = (sessionId: string, usualSec: number, sessionType = 'Race'): CornerTrendPoint => ({
  sessionId, timestamp: Date.UTC(2026, 10, Number(sessionId.slice(1))), sessionType, sessionName: sessionType[0], carType: 'Car A',
  passCount: 4, usualSec, bestSec: usualSec - 0.1,
});
const corner = (id: number, points: CornerTrendPoint[], reference: number | null = null, habit: CornerHabitTrend | null = null): CornerTrend => ({
  id, label: `SQ${id}`, name: `Turn ${id}`, title: `Turn ${id}: why`, points,
  reference: reference === null ? null : { usualSec: reference, sessionId: 'x', timestamp: 0 }, habit,
});
const response = (corners: CornerTrend[], sessions: Partial<CornerTrendsResponse['sessions']> = {}): CornerTrendsResponse => ({
  layoutKey: 'spa_gp', carClass: 'GT3', kind: 'sequences', minPasses: 3, corners,
  sessions: { total: 4, noReplay: 0, waiting: 0, tooFewPasses: 0, ...sessions },
});

describe('cornerTrendRow', () => {
  it('fits the direction of the last five sessions, and compares the latest with the class', () => {
    // A slow start (11.9, 11.0) is left out: the last five drop 0.1 s a session.
    const usuals = [11.9, 11.0, 10.6, 10.5, 10.4, 10.3, 10.2];
    const row = cornerTrendRow(corner(1, usuals.map((usual, i) => point(`s${i + 1}`, usual)), 9.9));
    expect(row).toMatchObject({ latestSec: 10.2, recentFrom: 2 });
    expect(row.recentChangeSec).toBeCloseTo(-0.4);
    expect(row.vsClassSec).toBeCloseTo(0.3);
    // One odd session neither makes a trend (a slow last one) nor hides one (a slow one in the middle).
    const change = (usuals: number[]) => cornerTrendRow(corner(1, usuals.map((usual, i) => point(`s${i + 1}`, usual)))).recentChangeSec;
    expect(change([10.0, 10.0, 10.0, 10.0, 10.3])).toBeCloseTo(0);
    expect(change([10.4, 10.3, 11.5, 10.1, 10.0])).toBeCloseTo(-0.4);
    // Two sessions are no direction.
    expect(cornerTrendRow(corner(1, [point('s1', 10.5), point('s2', 10.1)], 10))).toMatchObject({ recentFrom: null, recentChangeSec: null });
  });

  it('flags the two corners losing most to the class, never one within 0.1 s', () => {
    // Latest 10.0 s everywhere; the class at 9.5, 9.8, 9.2, 9.4 and none: gaps 0.5, 0.2, 0.8, 0.6.
    const references: Array<number | null> = [9.5, 9.8, 9.2, 9.4, null];
    const rows = references.map((reference, i) => cornerTrendRow(corner(i + 1, [point('s1', 10.0)], reference)));
    expect([...focusCornerIds(rows)]).toEqual([3, 4]);
    const close = [cornerTrendRow(corner(1, [point('s1', 10.0)], 9.95)), cornerTrendRow(corner(2, [point('s1', 10.0)], 9.8))];
    expect([...focusCornerIds(close)]).toEqual([2]);
  });

  it('tops each graph at the class line and gives every graph the same height in seconds', () => {
    const behind = corner(1, [point('s1', 10.6), point('s2', 10.4)], 9.9);
    const ahead = corner(2, [point('s1', 8.0), point('s2', 8.2)], 8.1);
    expect([graphTopSec(behind), graphTopSec(ahead), graphTopSec(corner(3, []))]).toEqual([9.9, 8.0, null]);
    // The largest gap below a top is 0.7 s (10.6 against 9.9).
    expect(sharedGraphSpanSec([behind, ahead])).toBeCloseTo(0.7);
    // Within 0.3 s and 1.5 s.
    expect(sharedGraphSpanSec([ahead])).toBe(0.3);
    expect(sharedGraphSpanSec([corner(1, [point('s1', 14)], 9.9)])).toBe(1.5);
  });

  it('sorts by a number with the missing ones last and ties in lap order', () => {
    const rows = [corner(1, [point('s1', 10.0)], 9.5), corner(2, []), corner(3, [point('s1', 10.0)], 9.2), corner(4, [point('s1', 10.0)], 9.5)]
      .map(cornerTrendRow);
    const order = (sort: CornerSort) => sortCornerRows(rows, sort).map(row => row.corner.id);
    expect(order({ key: 'vsClass', descending: true })).toEqual([3, 1, 4, 2]);
    expect(order({ key: 'vsClass', descending: false })).toEqual([1, 4, 3, 2]);
    expect(order({ key: 'corner', descending: true })).toEqual([4, 3, 2, 1]);
  });

  it('colours the recent trend, level within 0.05 s', () => {
    expect([cornerTrendTone(-0.2), cornerTrendTone(0.2), cornerTrendTone(0.04), cornerTrendTone(null)])
      .toEqual(['text-lmu-gain', 'text-lmu-loss', 'text-lmu-muted', 'text-lmu-muted']);
  });

  it('marks a session by its type', () => {
    expect([sessionMark('Race', 'R1'), sessionMark('Qualifying', 'Q1'), sessionMark('Practice', 'Quali practice'), sessionMark('Warmup', 'WU')])
      .toEqual(['race', 'qualifying', 'qualifying', 'practice']);
  });

  it('says why sessions have no point, only when some have none', () => {
    expect(missingSessionsText(response([], { total: 9, noReplay: 5, waiting: 1, tooFewPasses: 2 })))
      .toBe('8 of 9 sessions have no corner times: 5 without a replay, 1 waiting for a rebuild, 2 with too few clean laps.');
    expect(missingSessionsText(response([]))).toBeNull();
  });
});

describe('CornerTrendsSection', () => {
  beforeEach(() => api.fetchCornerTrends.mockReset());

  it('draws a row per corner with a dot per session and the class line', async () => {
    api.fetchCornerTrends.mockResolvedValue(response([
      corner(1, [point('s1', 10.5, 'Practice'), point('s2', 10.3, 'Qualifying'), point('s3', 10.1)], 9.9), corner(2, []),
    ], { noReplay: 2 }));
    render(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="Car A" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading corner trends');
    const rows = await screen.findAllByTestId('corner-trend-row');
    expect(api.fetchCornerTrends).toHaveBeenCalledWith('spa_gp', 'GT3', 'Car A', expect.any(AbortSignal));
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getAllByTestId('corner-trend-point')).toHaveLength(3);
    // Quicker lately: the line stays grey and the latest mark wears the gain colour; marks keep their shape.
    expect(within(rows[0]).getByTestId('corner-trend-sparkline')).toHaveClass('text-lmu-muted');
    expect(within(rows[0]).getAllByTestId('corner-trend-point').map(mark => mark.classList.contains('text-lmu-gain'))).toEqual([false, false, true]);
    expect([...rows[0].querySelectorAll('[data-mark]')].map(mark => mark.getAttribute('data-mark'))).toEqual(['practice', 'qualifying', 'race']);
    expect(within(rows[0]).getByTestId('corner-trend-reference')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('SQ1Turn 110.100−0.400+0.200');
    // The one corner behind the class by 0.1 s or more is the one to work on.
    expect(within(rows[0]).getByLabelText('Biggest gap to the class\'s fastest usual +0.200 s')).toHaveClass('text-lmu-loss');
    expect(rows[1]).toHaveTextContent('No session with enough clean laps');
    expect(screen.getByText('2 of 4 sessions have no corner times: 2 without a replay.')).toBeInTheDocument();
  });

  it('colours the latest mark by the last five sessions, older ones left out', async () => {
    const usuals = [10.0, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6];
    api.fetchCornerTrends.mockResolvedValue(response([corner(1, usuals.map((usual, i) => point(`s${i + 1}`, usual)))]));
    render(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    const row = await screen.findByTestId('corner-trend-row');
    expect(within(row).getAllByTestId('corner-trend-point').at(-1)).toHaveClass('text-lmu-loss');
  });

  it('asks for any car model as an empty car type, and says when no session has corner times', async () => {
    api.fetchCornerTrends.mockResolvedValue(response([corner(1, [])], { noReplay: 4 }));
    render(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    expect(await screen.findByText(/No session here has corner times yet/)).toBeInTheDocument();
    expect(api.fetchCornerTrends).toHaveBeenCalledWith('spa_gp', 'GT3', '', expect.any(AbortSignal));
  });

  it('shows the error and tries again', async () => {
    api.fetchCornerTrends.mockRejectedValueOnce(new Error('Session summaries are being rebuilt.'))
      .mockResolvedValueOnce(response([corner(1, [point('s1', 10)])]));
    render(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Session summaries are being rebuilt.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('corner-trend-row')).toBeInTheDocument();
  });

  it('sorts the rows from the header, the numbers biggest first, a second click turning it round', async () => {
    api.fetchCornerTrends.mockResolvedValue(response([
      corner(1, [point('s1', 10.2)], 10.0), corner(2, [point('s1', 10.6)], 10.0), corner(3, [point('s1', 10.4)], 10.0),
    ]));
    render(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    const labels = async () => (await screen.findAllByTestId('corner-trend-row')).map(row => row.querySelector('span')?.textContent);
    expect(await labels()).toEqual(['SQ1', 'SQ2', 'SQ3']);
    fireEvent.click(screen.getByRole('button', { name: 'Vs class: sort descending' }));
    expect(await labels()).toEqual(['SQ2', 'SQ3', 'SQ1']);
    fireEvent.click(screen.getByRole('button', { name: 'Vs class: sort ascending' }));
    expect(await labels()).toEqual(['SQ1', 'SQ3', 'SQ2']);
    fireEvent.click(screen.getByRole('button', { name: 'Corner: sort ascending' }));
    expect(await labels()).toEqual(['SQ1', 'SQ2', 'SQ3']);
  });

  it("adds the corner's habit under its row: how often it showed, the corner against the session before, a habit fixed", async () => {
    const habit: CornerHabitTrend = {
      session: { sessionId: 's3', timestamp: Date.UTC(2026, 10, 3, 12), sessionType: 'Race' },
      habit: { line: 'Brake 10 m later into T5', lossSec: 0.12, rule: 'brakeEarly' }, seen: 4, of: 5,
      since: { sessionId: 's2', timestamp: Date.UTC(2026, 9, 21, 12), sessionType: 'Qualifying' }, gainSec: 0.14,
      change: { turnId: 5, half: 'in', rule: 'brakeEarly', isNew: false, cue: 'brake 6 m later' }, fixed: 'Carry 3 km/h more through T6',
    };
    api.fetchCornerTrends.mockResolvedValue(response([
      corner(1, [point('s1', 10.2)], 10.0, habit), corner(2, [point('s1', 10.6)], 10.0, { ...habit, habit: null, seen: 0, of: 1, since: null, gainSec: null, change: null }),
    ]));
    render(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    const rows = await screen.findAllByTestId('corner-trend-row');
    const lines = within(rows[0]).getByTestId('corner-habit');
    expect(lines).toHaveTextContent('Brake 10 m later into T5 · +0.12 s a lap · seen in 4 of 5 sessions');
    expect(lines).toHaveTextContent(/vs Oct 21 Qualifying: 0\.14 s quicker · brake 6 m later/);
    expect(lines).toHaveTextContent(/Fixed since Oct 21 Qualifying: Carry 3 km\/h more through T6/);
    expect(within(rows[1]).queryByTestId('corner-habit')).toBeNull();
  });

  it('draws nothing without a layout', () => {
    const { container } = render(<CornerTrendsSection layoutKey={null} carClass="GT3" carModel="All" />);
    expect(container).toBeEmptyDOMElement();
    expect(api.fetchCornerTrends).not.toHaveBeenCalled();
  });
});
