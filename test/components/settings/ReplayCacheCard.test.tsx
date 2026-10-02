import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReplayCacheCard } from '../../../src/components/settings/ReplayCacheCard.js';
import { formatDateTime } from '../../../src/components/settings/settingsFormat.js';

describe('ReplayCacheCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty state when no replays are cached', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    render(<ReplayCacheCard />);

    await waitFor(() => {
      expect(screen.getByText(/no replays cached yet/i)).toBeInTheDocument();
    });
    expect(screen.getByText('0 Cached')).toBeInTheDocument();
  });

  it('renders a row per cached replay with drivers, duration, size and compressed size', async () => {
    const updatedAt = new Date('2026-02-20T12:00:00Z').getTime();
    const replayDateMs = new Date('2026-01-15T12:00:00Z').getTime();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          filename: 'Spa_R1.Vcr',
          fileSizeBytes: 2 * 1024 * 1024,
          compressedSizeBytes: 512 * 1024,
          updatedAt,
          replayDateMs,
          trackName: 'Spa-Francorchamps',
          driversCount: 24,
          durationSec: 125,
          trajectoriesCached: 3,
          replayVersion: 'v5',
          isOnDisk: true,
        },
      ]),
    });

    render(<ReplayCacheCard />);

    await waitFor(() => {
      expect(screen.getByText('Spa_R1.Vcr')).toBeInTheDocument();
    });
    expect(screen.getByTestId('replay-on-disk-badge')).toHaveTextContent('On disk');
    expect(screen.queryByTestId('replay-not-on-disk-badge')).not.toBeInTheDocument();
    expect(screen.getByText('Disk')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('v5')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    expect(screen.getByText('512.0 KB')).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(replayDateMs))).toBeInTheDocument();
    expect(screen.getByText('1 Cached')).toBeInTheDocument();
    expect(screen.queryByText('Spa-Francorchamps')).not.toBeInTheDocument();
  });

  it('renders a warning when when replay file is deleted from disk', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          filename: 'Deleted_P1.Vcr',
          fileSizeBytes: 1024 * 1024,
          compressedSizeBytes: 256 * 1024,
          updatedAt: Date.now(),
          replayDateMs: Date.now(),
          driversCount: 1,
          durationSec: 60,
          trajectoriesCached: 1,
          replayVersion: 'v5',
          isOnDisk: false,
        },
      ]),
    });

    render(<ReplayCacheCard />);

    await waitFor(() => {
      expect(screen.getByText('Deleted_P1.Vcr')).toBeInTheDocument();
    });
    expect(screen.getByTestId('replay-not-on-disk-badge')).toHaveTextContent('Deleted from disk');
    expect(screen.queryByTestId('replay-on-disk-badge')).not.toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    render(<ReplayCacheCard />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load cached replays/i)).toBeInTheDocument();
    });
  });

  it('reloads the list when the refresh button is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    global.fetch = fetchMock;

    render(<ReplayCacheCard />);
    await waitFor(() => {
      const cacheCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/replays/cache'));
      expect(cacheCalls.length).toBe(1);
    });

    fireEvent.click(screen.getByLabelText(/refresh cached replays/i));
    await waitFor(() => {
      const cacheCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/replays/cache'));
      expect(cacheCalls.length).toBe(2);
    });
  });

  it('shows a progress bar while a background replay scan is running', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    render(<ReplayCacheCard replayScanStatus={{
      running: true,
      processed: 131,
      total: 225,
      currentFile: 'Daytona International Speedway Road Course Q1 3.Vcr',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    }} />);

    await waitFor(() => {
      expect(screen.getByText('Parsing Replays in Background')).toBeInTheDocument();
    });
    expect(screen.getByText('131 / 225')).toBeInTheDocument();
    expect(screen.getByText('Daytona International Speedway Road Course Q1 3.Vcr')).toBeInTheDocument();
  });

  it('reloads the cached list once a running scan finishes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    global.fetch = fetchMock;

    const { rerender } = render(<ReplayCacheCard replayScanStatus={{
      running: true,
      processed: 224,
      total: 225,
      currentFile: 'Last_Replay.Vcr',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    }} />);
    await waitFor(() => {
      const cacheCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/replays/cache'));
      expect(cacheCalls.length).toBe(1);
    });

    rerender(<ReplayCacheCard replayScanStatus={{
      running: false,
      processed: 225,
      total: 225,
      currentFile: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      result: { added: 1, updated: 0, skipped: 0, total: 225, lastSyncedAt: new Date().toISOString(), interrupted: false },
      error: null,
    }} />);

    await waitFor(() => {
      const cacheCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/replays/cache'));
      expect(cacheCalls.length).toBe(2);
    });
  });

  describe('table sorting, filtering and versions', () => {
    const replay = (filename: string, extra: Record<string, unknown>) => ({
      filename,
      fileSizeBytes: 1024 * 1024,
      compressedSizeBytes: 256 * 1024,
      updatedAt: 1,
      replayDateMs: 1,
      driversCount: 1,
      durationSec: 60,
      trajectoriesCached: 1,
      replayVersion: 'v7',
      isOnDisk: true,
      ...extra,
    });

    const rowNames = () => screen.getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent);

    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          replay('Monza.Vcr', { driversCount: 12, replayVersion: 'v6' }),
          replay('Alpha.Vcr', { driversCount: 30 }),
          replay('Spa.Vcr', { driversCount: 5 }),
        ]),
      });
    });

    it('sorts by a column and reports it with aria-sort', async () => {
      render(<ReplayCacheCard />);
      await screen.findByText('Monza.Vcr');

      fireEvent.click(screen.getByRole('button', { name: /^Drivers/ }));
      expect(rowNames()).toEqual(['Spa.Vcr', 'Monza.Vcr', 'Alpha.Vcr']);
      expect(screen.getByRole('columnheader', { name: /Drivers/ })).toHaveAttribute('aria-sort', 'ascending');

      fireEvent.click(screen.getByRole('button', { name: /^Drivers/ }));
      expect(rowNames()).toEqual(['Alpha.Vcr', 'Monza.Vcr', 'Spa.Vcr']);
      expect(screen.getByRole('columnheader', { name: /Drivers/ })).toHaveAttribute('aria-sort', 'descending');
    });

    it('filters by replay name and announces the count', async () => {
      render(<ReplayCacheCard />);
      await screen.findByText('Monza.Vcr');

      fireEvent.change(screen.getByLabelText(/filter replays by name/i), { target: { value: 'spa' } });
      expect(rowNames()).toEqual(['Spa.Vcr']);
      expect(screen.getByText('1 of 3 replays')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/filter replays by name/i), { target: { value: 'zzz' } });
      expect(screen.getByText(/no replay matches that name/i)).toBeInTheDocument();
    });

    it('flags versions older than the newest cached version', async () => {
      render(<ReplayCacheCard />);
      await screen.findByText('Monza.Vcr');

      expect(screen.getByText('v6')).toHaveClass('text-lmu-warn');
      expect(screen.getAllByText('v7')[0]).toHaveClass('text-lmu-muted');
    });

    it('labels the scroll container so it is not a bare tab stop', async () => {
      render(<ReplayCacheCard />);
      await screen.findByText('Monza.Vcr');
      expect(screen.getByRole('region', { name: 'Cached replays' })).toHaveAttribute('tabindex', '0');
    });
  });

  describe('embedded upgrade progress', () => {
    it('shows the upgrade progress when an upgrade is running and does not show any toggle switch', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/replays/upgrade')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: {
                enabled: true,
                running: true,
                processed: 2,
                total: 8,
                driversDone: 30,
                driversTotal: 120,
                currentFile: 'LeMans_P2.Vcr',
                currentStage: 'Driver 3: Decoding telemetry',
                filePercent: 45,
                startedAt: '2026-03-01T10:00:00Z',
                finishedAt: null,
                result: null,
                error: null,
              },
              pendingReplays: 6,
              pendingDrivers: 90,
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      render(<ReplayCacheCard />);

      await waitFor(() => {
        expect(screen.getByTestId('replay-upgrade-running')).toBeInTheDocument();
      });
      expect(screen.getByText('Upgrading Replay Telemetry')).toBeInTheDocument();
      expect(screen.getByText('30 / 120 Drivers')).toBeInTheDocument();
      expect(screen.getByText('25%')).toBeInTheDocument();
      expect(screen.getByText('Replay 3 of 8')).toBeInTheDocument();
      expect(screen.getByText('LeMans_P2.Vcr')).toBeInTheDocument();
      expect(screen.getByText('Driver 3: Decoding telemetry')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();

      // Ensure no toggle switch is present
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('hides the upgrade progress when upgrade is idle/not running', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/replays/upgrade')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: {
                enabled: true,
                running: false,
                processed: 0,
                total: 0,
                driversDone: 0,
                driversTotal: 0,
                currentFile: null,
                currentStage: null,
                filePercent: null,
                startedAt: null,
                finishedAt: null,
                result: null,
                error: null,
              },
              pendingReplays: 0,
              pendingDrivers: 0,
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      render(<ReplayCacheCard />);

      await waitFor(() => {
        expect(screen.getByText(/no replays cached yet/i)).toBeInTheDocument();
      });
      expect(screen.queryByTestId('replay-upgrade-running')).not.toBeInTheDocument();
      expect(screen.queryByText('Upgrading Replay Telemetry')).not.toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });
  });
});

