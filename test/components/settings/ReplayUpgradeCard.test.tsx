import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReplayUpgradeCard } from '../../../src/components/settings/ReplayUpgradeCard.js';
import type { ReplayUpgradeStatus } from '../../../shared/types/index.js';

const status = (overrides: Partial<ReplayUpgradeStatus> = {}): ReplayUpgradeStatus => ({
  enabled: true,
  running: false,
  processed: 0,
  total: 0,
  currentFile: null,
  currentStage: null,
  filePercent: null,
  driversDone: 0,
  driversTotal: 0,
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
  ...overrides,
});

const respond = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

describe('ReplayUpgradeCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the drivers upgraded so far and the replay being decoded', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({
      status: status({
        running: true, processed: 3, total: 10, driversDone: 45, driversTotal: 180,
        currentFile: 'Spa P1 80.Vcr', currentStage: 'Driver 4: Decoding telemetry and events', filePercent: 62,
      }),
      pendingReplays: 7,
      pendingDrivers: 135,
    }));

    render(<ReplayUpgradeCard />);

    await waitFor(() => expect(screen.getByText('45 / 180')).toBeInTheDocument());
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Replay 4 of 10')).toBeInTheDocument();
    expect(screen.getByText('Spa P1 80.Vcr')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('Driver 4: Decoding telemetry and events')).toBeInTheDocument();
  });

  it('says what is waiting when idle, and when everything is upgraded', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ status: status(), pendingReplays: 2, pendingDrivers: 40 }));
    const { unmount } = render(<ReplayUpgradeCard />);
    await waitFor(() => expect(screen.getByText(/40 drivers in 2 replays are waiting/)).toBeInTheDocument());
    unmount();

    global.fetch = vi.fn().mockResolvedValue(respond({ status: status(), pendingReplays: 0, pendingDrivers: 0 }));
    render(<ReplayUpgradeCard />);
    await waitFor(() => expect(screen.getByText(/stored at the current version/)).toBeInTheDocument());
  });

  it('reports the last run, including drivers that failed', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({
      status: status({ result: { replays: 3, upgraded: 58, failed: 2, interrupted: true } }),
      pendingReplays: 1,
      pendingDrivers: 12,
    }));

    render(<ReplayUpgradeCard />);

    await waitFor(() => expect(screen.getByText('58')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/paused/)).toBeInTheDocument();
  });

  it('shows the replay lap indexing that follows the upgrade, and what it still has to do', async () => {
    const facts = { running: true, processed: 40, total: 160, currentFile: 'Daytona R1 7.Vcr', startedAt: null, finishedAt: null, result: null, error: null };
    global.fetch = vi.fn().mockResolvedValue(respond({ status: status(), pendingReplays: 0, pendingDrivers: 0, facts: { status: facts, pendingReplays: 120 } }));
    const { unmount } = render(<ReplayUpgradeCard />);
    await waitFor(() => expect(screen.getByText('40 / 160')).toBeInTheDocument());
    expect(screen.getByText('Daytona R1 7.Vcr')).toBeInTheDocument();
    unmount();

    global.fetch = vi.fn().mockResolvedValue(respond({
      status: status(), pendingReplays: 0, pendingDrivers: 0, facts: { status: { ...facts, running: false }, pendingReplays: 3 },
    }));
    render(<ReplayUpgradeCard />);
    await waitFor(() => expect(screen.getByText(/replays wait for their laps and conditions/)).toBeInTheDocument());
  });

  it('turns the upgrade off with the switch', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond({ status: status(), pendingReplays: 2, pendingDrivers: 40 }))
      .mockResolvedValueOnce(respond({ status: status({ enabled: false }) }))
      .mockResolvedValueOnce(respond({ status: status({ enabled: false }), pendingReplays: 2, pendingDrivers: 40 }));
    global.fetch = fetchMock;

    render(<ReplayUpgradeCard />);
    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
    expect(fetchMock).toHaveBeenCalledWith('/api/replays/upgrade', expect.objectContaining({ method: 'POST', body: JSON.stringify({ enabled: false }) }));
    expect(screen.getByText(/Turned off/)).toBeInTheDocument();
  });
});
