import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { SessionDebriefSection } from '../../../../src/components/session-detail/debrief/SessionDebriefSection.js';
import { me, session } from './debriefFixtures.js';

const player = { ...me, driverOrdinal: 0 } as DriverData;
const race = { ...session, sessionType: 'Race', playerDriver: player } as DetailedSession;

describe('SessionDebriefSection', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('starts collapsed; opened, the strategy reads at once and where the time goes waits for its click', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ strategy: null, plan: null }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    render(<SessionDebriefSection session={race} selectedDriver={player} />);
    const toggle = screen.getByRole('button', { name: /Debrief/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('strategy · where the time goes');
    expect(screen.queryByTestId('session-strategy')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/No telemetry recording is linked/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Show where the time goes/ })).toBeInTheDocument();
  });

  it('leaves the strategy out of another driver or a non-race session, and shows nothing with neither part', () => {
    render(<SessionDebriefSection session={{ ...race, sessionType: 'Qualifying' } as DetailedSession} selectedDriver={player} />);
    fireEvent.click(screen.getByRole('button', { name: /Debrief/ }));
    expect(screen.queryByTestId('session-strategy')).toBeNull();
    expect(screen.getByTestId('session-debrief')).toBeInTheDocument();
    cleanup();
    const { container } = render(<SessionDebriefSection session={{ ...race, matchingReplayFile: null } as unknown as DetailedSession}
      selectedDriver={{ ...player, driverOrdinal: 3 } as DriverData} />);
    expect(container).toBeEmptyDOMElement();
  });
});
