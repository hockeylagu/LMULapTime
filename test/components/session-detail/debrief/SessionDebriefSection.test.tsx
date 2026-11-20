import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { SessionDebriefSection } from '../../../../src/components/session-detail/debrief/SessionDebriefSection.js';
import { me, mockWatchServer, session } from './debriefFixtures.js';

const renderSection = (props: { session: DetailedSession; selectedDriver: DriverData }) =>
  render(<SessionDebriefSection {...props} />);

describe('SessionDebriefSection', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('starts collapsed; opened, what to watch next session and the strategy read at once', async () => {
    const fetchMock = mockWatchServer();
    renderSection({ session, selectedDriver: me });
    const toggle = screen.getByRole('button', { name: /Debrief/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('watch next session · strategy');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    const watch = screen.getByTestId('watch-next-session');
    expect(await within(watch).findByText('Brake 10 m later into T1')).toBeInTheDocument();
    expect(within(watch).getByText('+0.12 s a lap · 75 % of laps')).toBeInTheDocument();
    expect(within(watch).getByText('vs Oct 21 Practice: brake 6 m later')).toBeInTheDocument();
    expect(within(watch).getByText(/vs Bob Quick \(Car B\), usual against usual over your 3 counted laps/)).toBeInTheDocument();
    expect(within(watch).getByText('T4 +0.60 s: traffic')).toBeInTheDocument();
    expect(within(watch).getByText('1 smaller one left out.')).toBeInTheDocument();
    expect(within(watch).getByText(/The car, not the driving: T4 out \(the quickest Car A loses there too\)/)).toBeInTheDocument();
    expect(within(watch).getByRole('link', { name: /Open in telemetry: Brake 10 m later into T1/ })).toHaveAttribute('href', expect.stringContaining('corner=2'));
    expect(await screen.findByText(/No telemetry recording is linked/)).toBeInTheDocument();
  });

  it('says when the session has no analysis, and offers a retry on an error', async () => {
    mockWatchServer(404);
    renderSection({ session: { ...session, sessionType: 'Qualifying' }, selectedDriver: me });
    fireEvent.click(screen.getByRole('button', { name: /Debrief/ }));
    expect(await screen.findByText(/No corner analysis for this session/)).toBeInTheDocument();
    expect(screen.queryByTestId('session-strategy')).toBeNull();
    cleanup();
    const fetchMock = mockWatchServer(503);
    renderSection({ session, selectedDriver: me });
    fireEvent.click(screen.getByRole('button', { name: /Debrief/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Session summaries are rebuilding');
    mockWatchServer();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Brake 10 m later into T1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('says so when nothing repeats and no lap went wrong', async () => {
    mockWatchServer(200, { sessionId: 'R1', layoutKey: 'test_gp', carClass: 'Hyper', driverOrdinal: 0, laps: 4, corners: [],
      sameCarReference: null, habits: [], unexplained: [], carDifferences: [], mistakes: [] });
    renderSection({ session: { ...session, sessionType: 'Practice' }, selectedDriver: me });
    fireEvent.click(screen.getByRole('button', { name: /Debrief/ }));
    expect(await screen.findByText(/Nothing repeats/)).toBeInTheDocument();
  });

  it('shows nothing for another driver than the player', () => {
    const { container } = renderSection({ session, selectedDriver: { ...me, driverOrdinal: 3 } });
    expect(container).toBeEmptyDOMElement();
  });
});
