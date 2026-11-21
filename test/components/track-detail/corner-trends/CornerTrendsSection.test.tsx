import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { CornerTrend, CornerTrendPoint, CornerTrendsResponse } from '../../../../shared/types/corners/cornerTrends.js';
import type { CornerHabit, CornerHabitTrend } from '../../../../shared/types/corners/cornerAnalysis.js';

const api = vi.hoisted(() => ({
  fetchCornerTrends: vi.fn(), onSequenceMapsChanged: vi.fn(() => () => {}), pinHabitFocus: vi.fn(), unpinHabitFocus: vi.fn(),
}));
vi.mock('../../../../src/api/cornerSequenceApi.js', () => api);

import { CornerTrendsSection } from '../../../../src/components/track-detail/corner-trends/CornerTrendsSection.js';
import { cornerHabitText } from '../../../../src/components/track-detail/corner-trends/cornerHabitText.js';
import { cornerTrendRow, cornerTrendTone, graphTopSec, missingSessionsText, sessionMark, sharedGraphSpanSec, sortCornerRows, type CornerSort } from '../../../../src/components/track-detail/corner-trends/cornerTrendRows.js';

/** The section reads the page's query (its telemetry links keep it). */
const renderInRouter = (element: ReactElement) => {
  // The test setup's router starts at the hash.
  window.location.hash = '#/track/Spa?carClass=GT3';
  return render(element);
};

const point = (sessionId: string, usualSec: number, sessionType = 'Race'): CornerTrendPoint => ({
  sessionId, timestamp: Date.UTC(2026, 10, Number(sessionId.slice(1))), sessionType, sessionName: sessionType[0], carType: 'Car A',
  passCount: 4, usualSec, bestSec: usualSec - 0.1,
});
const corner = (id: number, points: CornerTrendPoint[], reference: number | null = null, habit: CornerHabitTrend | null = null): CornerTrend => ({
  id, label: `SQ${id}`, name: `Turn ${id}`, title: `Turn ${id}: why`, points,
  reference: reference === null ? null : { usualSec: reference }, habit,
});
const response = (corners: CornerTrend[], sessions: Partial<CornerTrendsResponse['sessions']> = {}): CornerTrendsResponse => ({
  corners,
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
  beforeEach(() => { api.fetchCornerTrends.mockReset(); api.pinHabitFocus.mockReset(); api.unpinHabitFocus.mockReset(); });

  it('draws a row per corner with a dot per session and the class line', async () => {
    api.fetchCornerTrends.mockResolvedValue(response([
      corner(1, [point('s1', 10.5, 'Practice'), point('s2', 10.3, 'Qualifying'), point('s3', 10.1)], 9.9), corner(2, []),
    ], { noReplay: 2 }));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="Car A" />);
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
    expect(within(rows[0]).getByLabelText('Latest median 10.100 s')).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText('Recent trend −0.400 s')).toBeInTheDocument();
    expect(within(rows[0]).getByTitle('Based on 3 eligible sessions')).toHaveTextContent('−0.400');
    // A corner without any session says so once, in the graph's place; "Need 3 sessions" is for one with too few.
    expect(within(rows[1]).queryByText('Need 3 sessions')).toBeNull();
    expect(within(rows[1]).getByText('No reference')).toBeInTheDocument();
    // The gap to the class is plain: the focus comes from the habits, not from this column.
    expect(within(rows[0]).getByLabelText('Against the class\'s fastest usual +0.200 s')).not.toHaveClass('text-lmu-loss');
    expect(rows[1]).toHaveTextContent('No session with enough clean laps');
    expect(screen.getByText('2 of 4 sessions have no corner times: 2 without a replay.')).toBeInTheDocument();
  });

  it('colours the latest mark by the last five sessions, older ones left out', async () => {
    const usuals = [10.0, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6];
    api.fetchCornerTrends.mockResolvedValue(response([corner(1, usuals.map((usual, i) => point(`s${i + 1}`, usual)))]));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    const row = await screen.findByTestId('corner-trend-row');
    expect(within(row).getAllByTestId('corner-trend-point').at(-1)).toHaveClass('text-lmu-loss');
  });

  it('asks for any car model as an empty car type, and says when no session has corner times', async () => {
    api.fetchCornerTrends.mockResolvedValue(response([corner(1, [])], { noReplay: 4 }));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    expect(await screen.findByText(/No session here has corner times yet/)).toBeInTheDocument();
    expect(api.fetchCornerTrends).toHaveBeenCalledWith('spa_gp', 'GT3', '', expect.any(AbortSignal));
  });

  it('shows the error and tries again', async () => {
    api.fetchCornerTrends.mockRejectedValueOnce(new Error('Session summaries are being rebuilt.'))
      .mockResolvedValueOnce(response([corner(1, [point('s1', 10)])]));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Session summaries are being rebuilt.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('corner-trend-row')).toBeInTheDocument();
  });

  it('sorts the rows from the header, the numbers biggest first, a second click turning it round', async () => {
    api.fetchCornerTrends.mockResolvedValue(response([
      corner(1, [point('s1', 10.2)], 10.0), corner(2, [point('s1', 10.6)], 10.0), corner(3, [point('s1', 10.4)], 10.0),
    ]));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    const labels = async () => (await screen.findAllByTestId('corner-trend-row')).map(row => row.querySelector('span')?.textContent);
    expect(await labels()).toEqual(['SQ1', 'SQ2', 'SQ3']);
    // One session each: too few for a trend.
    expect(screen.getAllByText('Need 3 sessions')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Ref. gap (s): sort descending' }));
    expect(await labels()).toEqual(['SQ2', 'SQ3', 'SQ1']);
    fireEvent.click(screen.getByRole('button', { name: 'Ref. gap (s): sort ascending' }));
    expect(await labels()).toEqual(['SQ1', 'SQ3', 'SQ2']);
    fireEvent.click(screen.getByRole('button', { name: 'Corner: sort ascending' }));
    expect(await labels()).toEqual(['SQ1', 'SQ2', 'SQ3']);
  });

  const sessionOf = (id: string, day: number) => ({ sessionId: id, timestamp: Date.UTC(2026, 10, day, 12), sessionType: 'Race' });
  const habitOf = (extra: Partial<CornerHabit> = {}): CornerHabit => ({
    cornerId: 2, turnId: 5, turnLabel: 'T5', half: 'in', lossSec: 0.12, sameCarLossSec: null, rule: 'overSlowing', gap: 4,
    speeds: { minKmh: 96, targetMinKmh: 100, exitKmh: 150, targetExitKmh: 150 }, kind: 'tighterArc', arc: null,
    action: { type: 'reachInside', gap: 1.2, line: 'Get closer to the inside at the apex' }, otherActions: [], causes: [],
    repeatability: 1, confidence: 1, priority: 0.12, line: 'Carry 4 km/h more through T5',
    detail: 'Apex 96 km/h, Ref Driver 100 km/h · tighter arc: 80 m radius against 87 m', ...extra,
  });
  /** T5's over-slowing over 3 sessions, the second without the gap measured. */
  const trendOf = (extra: Partial<CornerHabitTrend> = {}): CornerHabitTrend => ({
    session: sessionOf('s3', 3), habit: habitOf(), costSec: 0.22, focus: null, pinTurnId: 5, slipping: false,
    gap: { rule: 'overSlowing', turnLabel: 'T5', unit: 'km/h' },
    series: [{ session: sessionOf('s1', 1), costSec: 0.31, gap: 7 }, { session: sessionOf('s2', 2), costSec: 0.28, gap: null }, { session: sessionOf('s3', 3), costSec: 0.22, gap: 4.4 }],
    view: { lap: { sessionId: 's3', driverOrdinal: 2, lapOrdinal: 7 }, reference: { sessionId: 'r1', driverOrdinal: 4, lapOrdinal: 5, name: 'Ref Driver' } },
    ...extra,
  });

  it("opens the corner's habit under its row: its cost to the target, the thing to try, and the cost and gap over the last sessions", async () => {
    api.fetchCornerTrends.mockResolvedValue(response([
      corner(1, [point('s1', 10.6)], 10.0),
      corner(2, [point('s1', 10.2)], 10.0, trendOf()),
    ]));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    const rows = (await screen.findAllByTestId('corner-trend-row')).toReversed();
    // Closed at first; a corner without an analysis has no toggle.
    expect(within(rows[0]).queryByTestId('corner-habit')).toBeNull();
    expect(within(rows[1]).queryByRole('button')).toBeNull();
    const toggle = within(rows[0]).getByRole('button', { name: 'SQ2 Turn 2' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', within(rows[0]).getByTestId('corner-habit').id);
    // Anywhere on the row opens and closes it too.
    fireEvent.click(within(rows[0]).getByText('SQ2'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(rows[0]);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // A drag that selected text to copy it leaves the row open.
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Brake' } as Selection);
    fireEvent.click(rows[0]);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    selection.mockRestore();
    const lines = within(rows[0]).getByTestId('corner-habit');
    // The habit leads, the speeds and the kind of loss on its hover; the corner's cost against the target sits beside it.
    const advice = within(lines).getByText('Carry 4 km/h more through T5');
    expect(advice).toHaveAttribute('title', 'Apex 96 km/h, Ref Driver 100 km/h · tighter arc: 80 m radius against 87 m');
    expect(within(lines).getByText('+0.22 s a lap vs target')).toHaveClass('font-mono');
    expect(within(lines).getByTitle('The target is 1.2 m closer to the inside at the apex than you')).toHaveTextContent('Try: Get closer to the inside at the apex');
    // The cost sparkline (start → latest) and the habit's own gap over the last sessions: a gap that closes while the cost stays shows here.
    expect(within(lines).getByTestId('corner-habit-sparkline')).toHaveAttribute('aria-label', 'Cost trend: 0.31 → 0.28 → 0.22 s/lap');
    expect(lines).toHaveTextContent('0.31 → 0.22 s');
    expect(lines).toHaveTextContent('Minimum speed at T5, gap to the target: 7 → – → 4 km/h');
    expect(lines).not.toHaveTextContent(/fixed|Slipping|Focus corner|Your pick/);
    // The lap view at the corner (the second in lap order): the session's lap against the reference's, the page's query kept.
    const link = new URL(within(lines).getByRole('link', { name: /Compare in telemetry/ }).getAttribute('href')!, 'http://x');
    expect(link.pathname).toBe('/telemetry');
    expect(Object.fromEntries(link.searchParams)).toEqual({
      carClass: 'GT3', sessionId: 's3', driverOrdinal: '2', lapOrdinal: '7',
      baselineSessionId: 'r1', baselineDriverOrdinal: '4', baselineLapOrdinal: '5', compareDriver: 'Ref Driver', corner: '2',
    });
    // Following it leaves the advice open.
    fireEvent.click(within(lines).getByRole('link', { name: /Compare in telemetry/ }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks the focus corners and lets the driver make a corner a focus or unpin it', async () => {
    const rowsOf = (focus: Array<CornerHabitTrend['focus']>) => response([
      corner(1, [point('s1', 10.6)], 10.0, trendOf({ focus: focus[0], habit: null, gap: null, costSec: 0.6, slipping: true, series: [{ session: sessionOf('s3', 3), costSec: 0.6, gap: null }], view: null, pinTurnId: 3 })),
      corner(2, [point('s1', 10.2)], 10.0, trendOf({ focus: focus[1] })),
    ]);
    api.fetchCornerTrends.mockResolvedValueOnce(rowsOf(['focus', null])).mockResolvedValue(rowsOf(['focus', 'pinned']));
    api.pinHabitFocus.mockResolvedValue({ pinned: true });
    api.unpinHabitFocus.mockRejectedValue(new Error('Unpin one first'));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    const [first, second] = await screen.findAllByTestId('corner-trend-row');
    // The mark sits beside the corner's name; the other corner has none.
    expect(within(first).getByTitle('Focus corner: one of the 2 to work on next')).toBeInTheDocument();
    expect(within(second).queryByTitle(/Focus corner|Your pick/)).toBeNull();
    // A focus corner without a named habit still opens: its cost, the slip, and the way to keep it.
    fireEvent.click(first);
    const focusLines = within(first).getByTestId('corner-habit');
    expect(focusLines).toHaveTextContent('No habit named here in Nov 3 Race');
    expect(focusLines).toHaveTextContent('+0.60 s a lap vs target');
    expect(within(focusLines).getByText('Slipping')).toHaveAttribute('title', 'Its cost is at least 0.10 s a lap above its recent level in the last 2 sessions');
    expect(focusLines).not.toHaveTextContent(/Cost:|Try:/);
    expect(within(focusLines).getByRole('button', { name: 'Keep as focus' })).toBeInTheDocument();
    // Making the other corner a focus stores the pin on its turn and reads the rows again; the row stays open.
    fireEvent.click(second);
    fireEvent.click(within(second).getByRole('button', { name: 'Make focus' }));
    expect(api.pinHabitFocus).toHaveBeenCalledWith({ layoutKey: 'spa_gp', carClass: 'GT3', turnId: 5 });
    const unpin = await within(second).findByRole('button', { name: 'Unpin' });
    expect(within(second).getByTitle('Your pick: a focus corner until you unpin it')).toBeInTheDocument();
    // The tag beside the name says it once; the opened row does not repeat it.
    expect(within(second).getByTestId('corner-habit')).not.toHaveTextContent(/Your pick|Focus corner/);
    // A refusal is said on the row.
    fireEvent.click(unpin);
    expect(await within(second).findByRole('alert')).toHaveTextContent('Unpin one first');
    expect(api.unpinHabitFocus).toHaveBeenCalledWith({ layoutKey: 'spa_gp', carClass: 'GT3', turnId: 5 });
  });

  it('words a loss no rule explains as an observation, with no series from a single session', () => {
    const trend = trendOf({
      habit: habitOf({ line: 'Losing time into T5: no clear cause', detail: 'Open the laps side by side', rule: null, action: null }),
      costSec: -0.08, gap: null, series: [{ session: sessionOf('s3', 3), costSec: -0.08, gap: null }],
    });
    expect(cornerHabitText(trend)).toEqual({
      habit: { line: 'Losing time into T5: no clear cause', explained: false }, tryLine: null, cost: '−0.08 s a lap vs target', costSeries: null, gapSeries: null,
    });
    // A brake point is its own advice; without a target there is no cost.
    expect(cornerHabitText(trendOf({ habit: habitOf({ rule: 'brakeEarly', action: { type: 'brakeLater', gap: 10, line: 'Brake 10 m later' } }), costSec: null })))
      .toMatchObject({ tryLine: null, cost: null });
  });

  it('says when the class has no session at the track, apart from sessions without corner times', async () => {
    api.fetchCornerTrends.mockResolvedValue(response([corner(1, [])], { total: 0 }));
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass="GT3" carModel="All" />);
    expect(await screen.findByText(/No GT3 session at this track yet/)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(/come from sessions with a replay/)).toBeNull();
  });

  it('asks for a class on All classes, without loading anything', () => {
    renderInRouter(<CornerTrendsSection layoutKey="spa_gp" carClass={null} carModel="All" />);
    expect(screen.getByRole('status')).toHaveTextContent('Pick a class at the top of the page to see your corner trends');
    expect(api.fetchCornerTrends).not.toHaveBeenCalled();
  });

  it('keeps the card without a layout (no session of the class here), saying so', () => {
    renderInRouter(<CornerTrendsSection layoutKey={null} carClass="GT3" carModel="All" />);
    expect(screen.getByTestId('corner-trends')).toHaveTextContent('No GT3 session at this track yet');
    expect(api.fetchCornerTrends).not.toHaveBeenCalled();
  });
});
