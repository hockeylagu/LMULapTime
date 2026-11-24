import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { SessionDebriefSection } from '../../../../src/components/session-detail/debrief/SessionDebriefSection.js';
import { requestBody } from '../../../fixtures/requestUrl.js';
import type { SessionLiveCapture } from '../../../../shared/types/liveCapture.js';
import { analysis, me, mockWatchServer, session } from './debriefFixtures.js';

const renderSection = (props: { session: DetailedSession; selectedDriver: DriverData }) =>
  render(<SessionDebriefSection {...props} />);

describe('SessionDebriefSection', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows the goal with PaceBadges, unified focus rows with sparklines and collapsible details, and graduated corners', async () => {
    const fetchMock = mockWatchServer();
    renderSection({ session, selectedDriver: me });
    expect(screen.getByRole('heading', { name: 'Session Debrief' })).toBeInTheDocument();
    const next = await screen.findByRole('region', { name: 'Focus next session' });
    // The finish line uses PaceBadge for current -> next level.
    const goal = screen.getByTestId('debrief-goal');
    expect(goal).toHaveTextContent(/^GoodCompetitive·0\.76 sto find$/);
    expect(goal).toHaveAttribute('title', expect.stringContaining('102.3% of the benchmark target of this layout and class, 1:35.000: Good. Competitive starts at 101.5%'));

    expect(next).toHaveTextContent('Focus next sessionlast 4 sessions here');
    const items = within(next).getAllByTestId('debrief-focus-row');
    expect(items).toHaveLength(2);
    // Focus row 0 has merged progress: sparkline + cost trend + Try + compact apex speed + Last try.
    expect(items[0]).toHaveTextContent('T1–T2 ·Carry 4 km/h more through T2');
    expect(within(items[0]).getByTestId('debrief-sparkline')).toHaveAttribute('aria-label', 'Cost trend: 0.31 → 0.27 → 0.24 → 0.20 s/lap');
    expect(items[0]).toHaveTextContent('0.31 → 0.20 s/lap');
    expect(within(items[0]).getByTitle('The target is 1.2 m closer to the inside at the apex than you')).toHaveTextContent('Try: Get closer to the inside at the apex');
    expect(items[0]).toHaveTextContent('Apex 96 → 100 km/h');
    expect(within(items[0]).getByTitle('Your usual moved 0.8 m closer to the inside at the apex'))
      .toHaveTextContent('Last try: you got a little closer to the inside at the apex at T2 · the corner is 0.06 s quicker');
    // Diagnostics are hidden by default until Details is expanded.
    expect(within(items[0]).queryByTestId('debrief-focus-details')).toBeNull();
    expect(items[0]).not.toHaveTextContent('Other differences vs target:');
    fireEvent.click(within(items[0]).getByRole('button', { name: /^Details for / }));
    const details = within(items[0]).getByTestId('debrief-focus-details');
    expect(details).toHaveTextContent('Why vs target: tighter arc (80 m radius against 87 m)');
    expect(details).toHaveTextContent('Progress since Oct 21 Practice: Minimum speed at T2: 7 km/h under → 4 km/h under');
    expect(details).toHaveTextContent('Other differences vs target: braking 0.4 s longer · 0.2 s more coasting');
    expect(within(details).getByTitle(/off both pedals/)).toHaveTextContent('0.2 s more coasting');
    expect(within(details).getByTitle(/slowest speed in the corner is at least 1\.5 km\/h under/)).toHaveTextContent('Over-slowing');
    expect(details).toHaveTextContent('showed on 100% of your clean laps');
    expect(within(details).getByRole('link', { name: 'Compare against your Oct 21 Practice lap' })).toHaveAttribute('href', expect.stringContaining('baselineSessionId=P1'));
    // The target is never named: who it is does not change what to do.
    expect(screen.queryByText(/Bob Quick/)).toBeNull();
    expect(items[0]).not.toHaveTextContent(/Slipping|Your pick/);

    // Focus row 1 has no earlier progress yet: single-turn corner names the corner once, with cost, pin control and slipping tag.
    expect(items[1]).toHaveTextContent('T4 ·Brake 10 m later');
    expect(items[1]).not.toHaveTextContent('into T4');
    expect(within(items[1]).getByTitle('Your usual time lost to the target through the whole corner')).toHaveTextContent('+0.10 s/lap');
    expect(items[1]).not.toHaveTextContent('Try:');
    expect(items[1]).toHaveTextContent(/Slipping.*Your pick.*Unpin/);
    expect(within(items[0]).getByRole('link', { name: 'T1–T2: Carry 4 km/h more through T2' })).toHaveAttribute('href', expect.stringContaining('corner=2'));

    // Corners that recently left the top 2 appear in their own compact section, showing what was corrected.
    const left = screen.getByRole('region', { name: 'No longer in your top 2' });
    expect(left).toHaveTextContent('T70.15 → 0.16 s/lap');
    expect(left).toHaveTextContent('Brake point at T7: 12 m early → 2 m early');
    expect(left).not.toHaveTextContent(/fixed/);

    // Traffic is left out: the biggest one-off the driver caused.
    expect(screen.getByTitle(/slower on the way out than on your usual lap/)).toHaveTextContent('a slow exit');
    const mistake = within(screen.getByRole('complementary')).getByRole('region', { name: 'One-off' });
    expect(mistake).toHaveTextContent('T2 · a slow exit · +0.30 s vs. your usual');
    expect(within(mistake).getByRole('link', { name: 'Replay lap 20' })).toHaveAttribute('href', expect.stringContaining('corner=2'));
    // No recording for this race: no strategy block.
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/strategy'))).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: 'Race strategy' })).toBeNull();
  });

  it('unpins a corner the driver picked, then reads the focus again', async () => {
    const fetchMock = mockWatchServer();
    renderSection({ session, selectedDriver: me });
    const analysisReads = () => fetchMock.mock.calls.filter(([url]) => url.includes('/corner-analysis')).length;
    fireEvent.click(await screen.findByRole('button', { name: /^Unpin / }));
    await vi.waitFor(() => expect(analysisReads()).toBe(2));
    const unpin = fetchMock.mock.calls.find(([url]) => url === '/api/habit-focus/unpin');
    expect(JSON.parse(requestBody(unpin?.[1]?.body))).toEqual({ layoutKey: 'test_gp', carClass: 'Hyper', turnId: 4 });
  });

  it('says the top pace level is reached, and colours a cost that went up, signed with a true minus', async () => {
    const [row] = analysis.focus.progress;
    mockWatchServer(200, {
      ...analysis, goal: { ...analysis.goal, percent: 100.3, level: 'Alien', next: null },
      focus: { ...analysis.focus, progress: [{ ...row, costThenSec: -0.19, costNowSec: 0.1, costs: [-0.19, 0.1], slipping: true, tried: null }] },
    });
    renderSection({ session, selectedDriver: me });
    expect(await screen.findByTestId('debrief-goal')).toHaveTextContent(/^Alien·top level$/);
    const [item] = within(screen.getByRole('region', { name: 'Focus next session' })).getAllByTestId('debrief-focus-row');
    expect(item).toHaveTextContent('−0.19 → 0.10 s/lap');
    expect(within(item).getByTestId('debrief-sparkline').querySelector('circle')).toHaveClass('text-lmu-loss');
    expect(screen.queryByRole('region', { name: 'No longer in your top 2' })).toBeNull();
  });

  it('hides the graduated section when no corner has left focus, and hides the goal when absent', async () => {
    mockWatchServer(200, { ...analysis, goal: null, focus: { ...analysis.focus, progress: [] } });
    renderSection({ session, selectedDriver: me });
    expect(await screen.findByRole('region', { name: 'Focus next session' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'No longer in your top 2' })).toBeNull();
    expect(screen.queryByTestId('debrief-goal')).toBeNull();
  });

  it('reports unavailable corner analysis and keeps strategy race-only', async () => {
    mockWatchServer(404);
    renderSection({ session: { ...session, sessionType: 'Qualifying' }, selectedDriver: me });
    expect(await screen.findByText(/No corner analysis for this session/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Race strategy' })).toBeNull();
  });

  it('offers retry when corner analysis fails', async () => {
    mockWatchServer(503);
    renderSection({ session, selectedDriver: me });
    expect(await screen.findByRole('alert')).toHaveTextContent('Session summaries are rebuilding');
    mockWatchServer();
    fireEvent.click(screen.getByRole('button', { name: 'Retry corner analysis' }));
    expect(await screen.findByText('Brake 10 m later')).toBeInTheDocument();
  });

  it('distinguishes missing history from a clean analysis with no recurring habit', async () => {
    mockWatchServer(200, { ...analysis, focus: { sessions: 1, corners: [], progress: [] }, habits: [], unexplained: [], carDifferences: [], mistakes: [] });
    renderSection({ session: { ...session, sessionType: 'Practice' }, selectedDriver: me });
    expect(await screen.findByText('No recurring driving habit identified.')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('uses the strategy request independently when a race has no linked replay', async () => {
    const fetchMock = mockWatchServer();
    renderSection({ session: { ...session, matchingReplayFile: undefined }, selectedDriver: me });
    expect(screen.getByText('No replay linked to this session.')).toBeInTheDocument();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/strategy$/);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it("lists a live-recorded session's radio calls, collapsed, with what became of each", async () => {
    mockWatchServer();
    const recorded = { ...session, matchingReplayFile: undefined, liveCaptures: [{ recordingId: 'rec' } as SessionLiveCapture] };
    renderSection({ session: recorded, selectedDriver: me });
    const radio = await screen.findByTestId('session-radio');
    expect(radio).toHaveTextContent('2 of 3 said');
    // Collapsed until opened.
    expect(within(radio).queryAllByRole('listitem')).toHaveLength(0);
    fireEvent.click(within(radio).getByRole('button', { name: 'Radio' }));
    const rows = within(radio).getAllByRole('listitem');
    expect(rows.map(row => row.textContent)).toEqual([
      'Lap 4Box in 2 laps.',
      'Lap 6Box this lap. Energy 38 percent. New medium.cut off by a newer call',
      'Lap 6Energy use too high. Save to hold lap 19.not said: no slot in time',
    ]);
  });

  it('shows nothing for another driver than the player', () => {
    const { container } = renderSection({ session, selectedDriver: { ...me, driverOrdinal: 3 } });
    expect(container).toBeEmptyDOMElement();
  });
});
