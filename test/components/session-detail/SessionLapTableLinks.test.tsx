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

describe('SessionLapTableRow lap-number link', () => {
  beforeEach(() => navigateMock.mockClear());
  const renderTable = () => {
    const session = mockDetailedSession as unknown as DetailedSession;
    render(<SessionLapTable session={session} selectedDriver={session.playerDriver} isMultiClass={false}
      hasTireWearData={false} hasFuelData={false} hasVirtualEnergyData={false} isCurrentSessionAllTimePB={false} />);
    const row = screen.getByTitle('Click to open telemetry for Lap 2');
    return within(row).getByRole('link', { name: '2' });
  };

  it('opens the telemetry once on a plain click, not again through the row', () => {
    fireEvent.click(renderTable());
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it('leaves ctrl and meta clicks to the browser without reaching the row', () => {
    const link = renderTable();
    // jsdom cannot open a new tab; swallow the browser default after React has seen the click.
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // The telemetry view opens the player's lap unless it is told which driver to show.
  it('opens the telemetry of the driver selected on the session page, not the player', () => {
    const session = mockDetailedSession as unknown as DetailedSession;
    const other = session.drivers.find((driver) => driver.name === 'AI Driver 2')!;
    render(<SessionLapTable session={session} selectedDriver={other} isMultiClass={false}
      hasTireWearData={false} hasFuelData={false} hasVirtualEnergyData={false} isCurrentSessionAllTimePB={false} />);
    fireEvent.click(within(screen.getByTitle('Click to open telemetry for Lap 1')).getByRole('link', { name: '1' }));
    expect(navigateMock).toHaveBeenCalledWith('/telemetry?replayName=spa_replay.vcr&lap=1&driverName=AI+Driver+2');
  });
});
