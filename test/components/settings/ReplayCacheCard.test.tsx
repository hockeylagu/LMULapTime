import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { ReplayCacheCard } from '../../../src/components/settings/ReplayCacheCard.js';
import { useReplayCache } from '../../../src/components/settings/replays/useReplayCache.js';
import { formatDateTime } from '../../../src/components/settings/settingsFormat.js';
import type { ReplayScanStatus, ScanStatus } from '../../../shared/types/index.js';

const Harness: React.FC<{ scan?: ScanStatus | ReplayScanStatus | null }> = ({ scan }) => {
  const replay = useReplayCache(scan);
  return <ReplayCacheCard replay={replay} replayScanStatus={scan} />;
};

const idleUpgrade = { enabled: true, running: false, processed: 0, total: 0, driversDone: 0, driversTotal: 0, currentFile: null, currentStage: null, filePercent: null, startedAt: null, finishedAt: null, result: null, error: null };

const replay = (filename: string, extra: Record<string, unknown> = {}) => ({
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

interface Api {
  replays?: unknown[];
  upgrade?: Record<string, unknown>;
  currentVersion?: string;
  cacheFailure?: string;
}

function mockApi({ replays = [], upgrade = idleUpgrade, currentVersion = 'v7', cacheFailure }: Api = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/replays/upgrade')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: upgrade, currentVersion, pendingReplays: 0, pendingDrivers: 0 }) });
    }
    if (cacheFailure) {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: cacheFailure }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(replays) });
  });
  global.fetch = fetchMock;
  return fetchMock;
}

const cacheCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/replays/cache'));
const rowNames = () => screen.getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent);

describe('ReplayCacheCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '#/settings';
  });

  it('shows an empty state when no replays are cached', async () => {
    mockApi();
    render(<Harness />);
    expect(await screen.findByText(/no replays cached yet/i)).toBeInTheDocument();
  });

  it('shows no count while the list is loading', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Harness />);
    expect(screen.getByText('Loading replays…')).toBeInTheDocument();
    expect(screen.queryByText(/\b0 (replays|cached)/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cached replays' })).not.toBeInTheDocument();
  });

  it('states the archived count as a strength and explains deleted replays', async () => {
    mockApi({ replays: [replay('Spa R1 12.Vcr'), replay('Monza R1 3.Vcr', { isOnDisk: false }), replay('Imola R1 4.Vcr', { isOnDisk: false })] });
    render(<Harness />);
    await screen.findByText('Monza');
    expect(screen.getByText(/kept after LMU deleted them/)).toHaveTextContent('2 kept after LMU deleted them');
    expect(screen.getByText(/never touched and stay fully usable from the cache/)).toBeInTheDocument();
  });

  it('renders a row per cached replay with drivers, duration, size and compressed size', async () => {
    const replayDateMs = new Date('2026-01-15T12:00:00Z').getTime();
    mockApi({
      replays: [replay('Spa_R1.Vcr', { fileSizeBytes: 2 * 1024 * 1024, compressedSizeBytes: 512 * 1024, replayDateMs, driversCount: 24, durationSec: 125, trajectoriesCached: 3, replayVersion: 'v5' })],
      currentVersion: 'v5',
    });
    render(<Harness />);
    await screen.findByText('Spa_R1.Vcr');
    const table = screen.getByRole('region', { name: 'Cached replays' });
    for (const header of ['Replay', 'Disk', 'Version', 'Drivers', 'Duration', 'File size', 'Stored size', 'Date', 'Telemetry']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(`^${header}`) })).toBeInTheDocument();
    }
    expect(within(table).getByText('v5')).toBeInTheDocument();
    expect(within(table).getByText('24')).toBeInTheDocument();
    expect(within(table).getByText('2:05')).toBeInTheDocument();
    expect(within(table).getByText('2.0 MB')).toBeInTheDocument();
    expect(within(table).getByText('512.0 KB')).toBeInTheDocument();
    expect(within(table).getByText(formatDateTime(replayDateMs))).toBeInTheDocument();
    expect(within(table).getByText('On disk')).toBeInTheDocument();
  });

  it('labels archived replays with text, not a warning icon or hidden strings', async () => {
    mockApi({ replays: [replay('Deleted R1 1.Vcr', { isOnDisk: false })] });
    render(<Harness />);
    await screen.findByText('Deleted');
    const table = screen.getByRole('region', { name: 'Cached replays' });
    expect(within(table).getByTestId('replay-source')).toHaveTextContent('Archived');
    expect(table.querySelector('tbody .sr-only')).toBeNull();
    expect(table.querySelector('svg.text-lmu-warn')).toBeNull();
  });

  it('keeps the end of a long name visible and the full name in the title', async () => {
    const name = 'Daytona International Speedway Road Course R1 12.Vcr';
    mockApi({ replays: [replay(name)] });
    render(<Harness />);
    const tail = await screen.findByText('R1 12.Vcr');
    expect(tail).toHaveClass('shrink-0');
    expect(tail.parentElement).toHaveAttribute('title', name);
  });

  it('warns about a behind version only for replays still on disk', async () => {
    mockApi({
      replays: [
        replay('Ondisk R1 1.Vcr', { replayVersion: 'v5' }),
        replay('Gone R1 1.Vcr', { replayVersion: 'v5', isOnDisk: false }),
        replay('Fresh R1 1.Vcr'),
      ],
    });
    render(<Harness />);
    await screen.findByText('Ondisk');
    const versions = screen.getAllByTestId('replay-version');
    expect(versions.map((v) => v.textContent).sort()).toEqual(['v5 behind', 'v5 · kept', 'v7']);
    const behind = versions.find((v) => v.textContent === 'v5 behind');
    expect(behind).toHaveClass('text-lmu-warn');
    versions.filter((v) => v !== behind).forEach((v) => expect(v).toHaveClass('text-lmu-muted'));
  });

  it('does not warn when the server has not reported its version', async () => {
    mockApi({ replays: [replay('Old R1 1.Vcr', { replayVersion: 'v1' })], currentVersion: '' });
    render(<Harness />);
    await screen.findByText('Old');
    expect(screen.getByTestId('replay-version')).toHaveTextContent('v1');
    expect(screen.getByTestId('replay-version')).not.toHaveClass('text-lmu-warn');
  });

  it('renders the Archived label in green for replays kept after deletion', async () => {
    mockApi({
      replays: [
        replay('Gone R1 1.Vcr', { isOnDisk: false }),
        replay('Active R1 1.Vcr', { isOnDisk: true }),
      ],
    });
    render(<Harness />);
    await screen.findByText('Gone');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Archived')).toHaveClass('text-lmu-gain');
    expect(within(table).getByText('On disk')).toHaveClass('text-lmu-muted');
  });

  it('states the version status and marks archived replays below it as kept, not behind', async () => {
    mockApi({ replays: [replay('Spa R1 1.Vcr'), replay('Old R1 2.Vcr', { isOnDisk: false, replayVersion: 'v3' })] });
    render(<Harness />);
    await screen.findByText('Old');
    await waitFor(() => expect(screen.getByTestId('replay-version-status')).toHaveTextContent('All on-disk replays are at v7 · 1 archived kept at older versions'));
    const versions = screen.getAllByTestId('replay-version').map((el) => el.textContent);
    expect(versions).toEqual(expect.arrayContaining(['v7', 'v3 · kept']));
    const kept = screen.getByText('v3 · kept');
    expect(kept).toHaveAttribute('aria-description', expect.stringMatching(/file is gone.*cannot be decoded again/));
    expect(kept).not.toHaveClass('text-lmu-warn');
    expect(screen.getByText('Replay upgrade: nothing to do.')).toBeInTheDocument();
    const table = screen.getByRole('region', { name: 'Cached replays' });
    const header = within(table).getByRole('button', { name: /^Stored size/ });
    expect(header).toHaveAccessibleDescription(/Space the cache uses/);
    const outdated = within(screen.getByRole('group', { name: 'Show replays' })).getByRole('button', { name: /^Outdated/ });
    expect(outdated).toHaveAttribute('aria-description', expect.stringMatching(/background replay upgrade/));
  });

  it('tells how many on-disk replays the upgrade will take, and keeps the old behind label', async () => {
    mockApi({ replays: [replay('Spa R1 1.Vcr', { replayVersion: 'v5' })] });
    render(<Harness />);
    await screen.findByText('Spa');
    await screen.findByText('v5 behind');
    expect(screen.getByTestId('replay-version-status')).toHaveTextContent('1 on-disk replay is behind v7');
  });

  it('shows no version comparison when the server sent no currentVersion', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.includes('/api/replays/upgrade')
          ? { status: idleUpgrade, pendingReplays: 0, pendingDrivers: 0 }
          : [replay('Old R1 2.Vcr', { isOnDisk: false, replayVersion: 'v3' }), replay('Spa R1 1.Vcr', { replayVersion: 'v5' })]),
      }));
    global.fetch = fetchMock;
    render(<Harness />);
    await screen.findByText('Old');
    expect(screen.queryByTestId('replay-version-status')).not.toBeInTheDocument();
    expect(screen.queryByText(/kept$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/behind$/)).not.toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
  });

  describe('filters, sort and the URL', () => {
    beforeEach(() => {
      mockApi({
        replays: [
          replay('Monza R1 2.Vcr', { driversCount: 12, replayVersion: 'v6' }),
          replay('Alpha R1 1.Vcr', { driversCount: 30, isOnDisk: false }),
          replay('Spa R1 3.Vcr', { driversCount: 5, isOnDisk: false, replayVersion: 'v3' }),
        ],
      });
    });

    it('counts each segment and filters by it, writing replayView to the URL', async () => {
      render(<Harness />);
      await screen.findByText('Monza');
      const group = screen.getByRole('group', { name: 'Show replays' });
      expect(within(group).getByRole('button', { name: /^All\s*3$/ })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: /^On disk\s*1$/ })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: /^Archived\s*2$/ })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: /^Outdated\s*1$/ })).toBeInTheDocument();

      fireEvent.click(within(group).getByRole('button', { name: /^Archived/ }));
      expect(rowNames()).toEqual(['Alpha R1 1.Vcr', 'Spa R1 3.Vcr']);
      expect(screen.getByText('2 of 3 replays')).toBeInTheDocument();
      await waitFor(() => expect(window.location.hash).toContain('replayView=archived'));

      fireEvent.click(within(group).getByRole('button', { name: /^Outdated/ }));
      expect(rowNames()).toEqual(['Monza R1 2.Vcr']);

      fireEvent.click(within(group).getByRole('button', { name: /^All/ }));
      await waitFor(() => expect(window.location.hash).not.toContain('replayView'));
    });

    it('filters by name and keeps the text in replayFilter', async () => {
      render(<Harness />);
      await screen.findByText('Monza');
      fireEvent.change(screen.getByLabelText(/filter replays by name/i), { target: { value: 'spa' } });
      expect(rowNames()).toEqual(['Spa R1 3.Vcr']);
      await waitFor(() => expect(window.location.hash).toContain('replayFilter=spa'));

      fireEvent.change(screen.getByLabelText(/filter replays by name/i), { target: { value: 'zzz' } });
      expect(screen.getByText(/no replay matches these filters/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(rowNames()).toHaveLength(3);
      await waitFor(() => expect(window.location.hash).not.toContain('replayFilter'));
    });

    it('sorts by a column, reports aria-sort and writes replaySort', async () => {
      render(<Harness />);
      await screen.findByText('Monza');
      fireEvent.click(screen.getByRole('button', { name: /^Drivers/ }));
      expect(rowNames()).toEqual(['Spa R1 3.Vcr', 'Monza R1 2.Vcr', 'Alpha R1 1.Vcr']);
      expect(screen.getByRole('columnheader', { name: /Drivers/ })).toHaveAttribute('aria-sort', 'ascending');
      await waitFor(() => expect(window.location.hash).toContain('replaySort=drivers-asc'));

      fireEvent.click(screen.getByRole('button', { name: /^Drivers/ }));
      expect(rowNames()).toEqual(['Alpha R1 1.Vcr', 'Monza R1 2.Vcr', 'Spa R1 3.Vcr']);
      await waitFor(() => expect(window.location.hash).toContain('replaySort=drivers-desc'));
    });

    it('restores the view from the URL and keeps ?section= intact', async () => {
      window.location.hash = '#/settings?section=replay-cache&replayView=archived&replaySort=drivers-asc';
      render(<Harness />);
      await screen.findByText('Spa');
      expect(rowNames()).toEqual(['Spa R1 3.Vcr', 'Alpha R1 1.Vcr']);
      fireEvent.change(screen.getByLabelText(/filter replays by name/i), { target: { value: 'alpha' } });
      await waitFor(() => expect(window.location.hash).toContain('replayFilter=alpha'));
      expect(window.location.hash).toContain('section=replay-cache');
    });

    it('scrolls inside a labelled region without an extra tab stop', async () => {
      render(<Harness />);
      await screen.findByText('Monza');
      const region = screen.getByRole('region', { name: 'Cached replays' });
      expect(region).not.toHaveAttribute('tabindex');
      expect(region).toHaveClass('overflow-auto');
    });
  });

  describe('errors', () => {
    it('shows the server message in the loss colour and retries', async () => {
      const fetchMock = mockApi({ cacheFailure: 'Replay cache is locked' });
      render(<Harness />);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Replay cache is locked');
      expect(within(alert).getByText('Replay cache is locked')).toHaveClass('text-lmu-loss');
      expect(screen.queryByText('Loading replays…')).not.toBeInTheDocument();

      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(cacheCalls(fetchMock)).toHaveLength(2));
    });

    it('shows the network error message when the request cannot be made', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      render(<Harness />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
    });
  });

  describe('progress', () => {
    const running = {
      running: true, processed: 131, total: 225,
      currentFile: 'Daytona International Speedway Road Course Q1 3.Vcr',
      startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null,
    } as unknown as ScanStatus;

    it('shows a progress bar only while a replay scan runs', async () => {
      mockApi();
      const { rerender } = render(<Harness scan={running} />);
      expect(await screen.findByText('Parsing Replays in Background')).toBeInTheDocument();
      expect(screen.getByText('131 / 225')).toBeInTheDocument();
      rerender(<Harness scan={{ ...running, running: false }} />);
      await waitFor(() => {
        expect(screen.queryByText('Parsing Replays in Background')).not.toBeInTheDocument();
      });
    });

    it('reloads the cached list once a running scan finishes', async () => {
      const fetchMock = mockApi();
      const { rerender } = render(<Harness scan={running} />);
      await waitFor(() => expect(cacheCalls(fetchMock)).toHaveLength(1));
      rerender(<Harness scan={{ ...running, running: false }} />);
      await waitFor(() => expect(cacheCalls(fetchMock)).toHaveLength(2));
    });

    it('shows the upgrade progress while it runs, with no switch', async () => {
      mockApi({
        upgrade: { ...idleUpgrade, running: true, processed: 2, total: 8, driversDone: 30, driversTotal: 120, currentFile: 'LeMans_P2.Vcr', currentStage: 'Driver 3: Decoding telemetry', filePercent: 45 },
      });
      render(<Harness />);
      expect(await screen.findByTestId('replay-upgrade-running')).toBeInTheDocument();
      expect(screen.getByText('30 / 120 Drivers')).toBeInTheDocument();
      expect(screen.getByText('Replay 3 of 8')).toBeInTheDocument();
      expect(screen.getByText('LeMans_P2.Vcr')).toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('shows nothing about the upgrade while it is idle', async () => {
      mockApi();
      render(<Harness />);
      await screen.findByText(/no replays cached yet/i);
      expect(screen.queryByTestId('replay-upgrade-running')).not.toBeInTheDocument();
      expect(screen.queryByText('Upgrading Replay Telemetry')).not.toBeInTheDocument();
    });

    it('does not turn an aborted upgrade poll into an error', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/replays/upgrade')) return Promise.reject(new DOMException('aborted', 'AbortError'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });
      render(<Harness />);
      await screen.findByText(/no replays cached yet/i);
      expect(screen.queryByText(/status unavailable/i)).not.toBeInTheDocument();
    });
  });
});
