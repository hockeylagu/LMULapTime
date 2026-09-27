import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReplayCacheCard } from '../../../src/components/settings/ReplayCacheCard.js';

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
    expect(screen.getByTestId('replay-on-disk-badge')).toHaveAttribute('aria-label', 'On Disk');
    expect(screen.getByText('Disk')).toBeInTheDocument();
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('v5')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(screen.getByText('2.00 MB')).toBeInTheDocument();
    expect(screen.getByText('512.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Jan 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('1 Cached')).toBeInTheDocument();
    expect(screen.queryByText('Spa-Francorchamps')).not.toBeInTheDocument();
  });

  it('renders "Not on Disk" badge when replay file is deleted from disk', async () => {
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
    expect(screen.getByTestId('replay-not-on-disk-badge')).toHaveAttribute('aria-label', 'Not on Disk');
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/refresh cached replays/i));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
