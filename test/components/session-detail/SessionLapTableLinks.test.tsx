import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DetailedSession } from '../../../server/core/types.js';
import { SessionLapTable } from '../../../src/components/session-detail/table/SessionLapTable.js';
import { mockDetailedSession } from './mockSessionDetail.js';

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigateMock,
}));

describe('SessionLapTableRow expansion and actions', () => {
  beforeEach(() => navigateMock.mockClear());
  const renderTable = (session = mockDetailedSession as unknown as DetailedSession) => {
    render(<SessionLapTable session={session} selectedDriver={session.playerDriver} isMultiClass={false}
      hasTireWearData={false} hasFuelData={false} hasVirtualEnergyData={false} isCurrentSessionAllTimePB={false} />);
    return screen.getByTitle('Details for Lap 3');
  };

  it.each([true, false])('toggles details from the row and lap number with replay=%s', (hasReplay) => {
    const session = { ...mockDetailedSession,
      matchingReplayFile: hasReplay ? mockDetailedSession.matchingReplayFile : undefined,
    } as unknown as DetailedSession;
    const row = renderTable(session);
    fireEvent.click(row);
    expect(screen.getByTestId('lap-details-3')).toBeInTheDocument();
    expect(row).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(row).getByText('3', { exact: true }));
    expect(screen.queryByTestId('lap-details-3')).not.toBeInTheDocument();
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('supports Enter and Space on the row without toggling from nested controls', () => {
    const row = renderTable();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByTestId('lap-details-3')).toBeInTheDocument();
    fireEvent.keyDown(within(row).getByRole('link', { name: 'Compare lap 3' }), { key: 'Enter' });
    expect(screen.getByTestId('lap-details-3')).toBeInTheDocument();
    fireEvent.keyDown(row, { key: ' ' });
    expect(screen.queryByTestId('lap-details-3')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not navigate or expose an expansion state for laps without events', () => {
    renderTable();
    const row = screen.getByTitle('Details for Lap 1');
    fireEvent.click(row);
    expect(row).not.toHaveAttribute('tabindex');
    expect(row).not.toHaveAttribute('aria-expanded');
    expect(screen.queryByTestId('lap-details-1')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('opens telemetry once through its action without expanding the row', () => {
    const row = renderTable();
    fireEvent.click(within(row).getByRole('link', { name: 'Telemetry for lap 3' }));
    expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/telemetry?sessionId=sess123&driverOrdinal=0&lapOrdinal=2');
    expect(screen.queryByTestId('lap-details-3')).not.toBeInTheDocument();
  });

  it('keeps comparison on its dedicated link without expanding the row', () => {
    const row = renderTable();
    const link = within(row).getByRole('link', { name: 'Compare lap 3' });
    expect(link).toHaveAttribute('href', '/leaderboard?track=Spa&carClass=LMH&sessionId=sess123&lapNum=3&driverOrdinal=0&lapOrdinal=2');
    fireEvent.click(link);
    expect(screen.queryByTestId('lap-details-3')).not.toBeInTheDocument();
  });

  it('leaves ctrl and meta clicks on telemetry to the browser without expanding the row', () => {
    const row = renderTable();
    const link = within(row).getByRole('link', { name: 'Telemetry for lap 3' });
    // jsdom cannot open a new tab; swallow the browser default after React has seen the click.
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('lap-details-3')).not.toBeInTheDocument();
  });

  // The telemetry view opens the player's lap unless it is told which driver to show.
  it('opens the telemetry of the driver selected on the session page, not the player', () => {
    const session = mockDetailedSession as unknown as DetailedSession;
    const other = session.drivers.find((driver) => driver.name === 'AI Driver 2')!;
    render(<SessionLapTable session={session} selectedDriver={other} isMultiClass={false}
      hasTireWearData={false} hasFuelData={false} hasVirtualEnergyData={false} isCurrentSessionAllTimePB={false} />);
    fireEvent.click(screen.getByRole('link', { name: 'Telemetry for lap 1' }));
    expect(navigateMock).toHaveBeenCalledWith('/telemetry?sessionId=sess123&driverOrdinal=1&lapOrdinal=0');
  });
});

describe('SessionLapTableActions replay button', () => {
  const renderTable = (session: DetailedSession) =>
    render(<SessionLapTable session={session} selectedDriver={session.playerDriver} isMultiClass={false}
      hasTireWearData={false} hasFuelData={false} hasVirtualEnergyData={false} isCurrentSessionAllTimePB={false} />);

  it('shows the replay glyph on every lap when the session has a replay', () => {
    renderTable(mockDetailedSession as unknown as DetailedSession);
    const buttons = screen.getAllByRole('link', { name: /^Telemetry for lap/ });
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0].querySelector('svg')).toHaveAttribute('data-replay-glyph');
  });

  // Without a replay there is nothing to open: only the compare button stays, no button in its place.
  it('leaves the replay button out when the session has no replay', () => {
    renderTable({ ...mockDetailedSession, matchingReplayFile: undefined } as unknown as DetailedSession);
    expect(screen.queryAllByRole('link', { name: /^Telemetry for lap/ })).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: /^Compare lap/ }).length).toBeGreaterThan(0);
  });
});
