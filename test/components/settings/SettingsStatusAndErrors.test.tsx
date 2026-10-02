import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Settings } from '../../../src/components/settings/index.js';
import { ReferenceLaptimesCard } from '../../../src/components/settings/ReferenceLaptimesCard.js';
import { AiReportsHistoryCard } from '../../../src/components/settings/AiReportsHistoryCard.js';
import { SETTINGS_SECTIONS } from '../../../src/components/settings/settingsSections.js';
import type { AppStatus, BenchmarkDiffSummary } from '../../../shared/types/index.js';

const status: AppStatus = {
  resultsDir: 'C:\\LMU\\Results',
  resultsExist: true,
  replaysDir: 'C:\\LMU\\Replays',
  replaysExist: true,
  telemetryDir: 'C:\\LMU\\Telemetry',
  telemetryExist: true,
  playerName: 'Player1',
  sessionsCount: 35,
  tracksCount: 6,
  referenceLaptimes: { lastUpdated: '2026-10-01T10:00:00Z', entriesCount: 187 },
};

const json = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const fail = (message: string) => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: message }) });

describe('Settings overview card', () => {
  beforeEach(() => {
    window.location.hash = '#/settings';
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/replays/upgrade')) {
        return json({ pendingReplays: 0, pendingDrivers: 0, currentVersion: 'v7', status: { running: false, enabled: true } });
      }
      if (url.includes('/api/replays/cache')) {
        return json([
          { filename: 'A R1 1.Vcr', isOnDisk: true, replayVersion: 'v7', fileSizeBytes: 1, compressedSizeBytes: 1 },
          { filename: 'B R1 2.Vcr', isOnDisk: false, replayVersion: 'v7', fileSizeBytes: 1, compressedSizeBytes: 1 },
        ]);
      }
      if (url.includes('/api/ai/settings')) return json({ configured: false, model: 'gemini-3.7-flash', keySource: null });
      return json([]);
    });
  });

  it('reads folders, sessions, replays and AI in one labelled group', async () => {
    render(<Settings status={status} onUpdatePaths={vi.fn()} />);
    const strip = screen.getByRole('group', { name: 'Settings status' });
    await waitFor(() => expect(within(strip).getByText('1 archived')).toBeInTheDocument());
    expect(within(strip).getByText('All found')).toBeInTheDocument();
    expect(within(strip).getByText('35')).toBeInTheDocument();
    expect(within(strip).getByText('2')).toBeInTheDocument();
    expect(within(strip).getByText('Optional · not set up')).toBeInTheDocument();
    expect(within(strip).queryByText('Benchmarks updated')).not.toBeInTheDocument();
    for (const label of ['Folders', 'Sessions', 'Replays', 'AI reports', 'Total app database', 'Last synced']) {
      expect(within(strip).getByText(label)).toBeInTheDocument();
    }
  });

  it('shows dashes, not zeros, before anything has loaded', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<Settings status={null} onUpdatePaths={vi.fn()} />);
    const strip = screen.getByRole('group', { name: 'Settings status' });
    expect(within(strip).queryByText('0')).not.toBeInTheDocument();
    expect(within(strip).getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('flags a missing folder in the strip and has no sidebar system overview', async () => {
    render(<Settings status={{ ...status, replaysExist: false }} onUpdatePaths={vi.fn()} />);
    const strip = screen.getByRole('group', { name: 'Settings status' });
    expect(within(strip).getByText('1 missing')).toBeInTheDocument();
    expect(screen.queryByText('System Overview')).not.toBeInTheDocument();
    await waitFor(() => expect(within(strip).getByText('1 archived')).toBeInTheDocument());
  });

  it('lists the sections in the healthy order', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.title)).toEqual([
      'Overview',
      'Reference Benchmarks',
      'AI Lap Reports',
      'AI Report History',
      'Cached Replays',
      'Folder Paths & Driver',
    ]);
  });

  it('offers upgrade, but not migration, as a replay search term', () => {
    const replay = SETTINGS_SECTIONS.find((s) => s.id === 'replay-cache');
    expect(replay?.keywords).toContain('upgrade');
    expect(replay?.keywords).not.toContain('migration');
  });

  it('keeps the form empty when the server reports no folders, with the Steam path only as a placeholder', async () => {
    const bare: AppStatus = { ...status, resultsDir: '', replaysDir: '', telemetryDir: '', resultsExist: false, replaysExist: false, telemetryExist: false };
    render(<Settings status={bare} onUpdatePaths={vi.fn()} />);
    const results = screen.getByLabelText(/results/i, { selector: 'input' });
    expect(results).toHaveValue('');
    expect(results).toHaveAttribute('placeholder', expect.stringContaining('Steam'));
    await waitFor(() => expect(screen.getByText('1 archived')).toBeInTheDocument());
  });
});

describe('Error surfacing', () => {
  const history: BenchmarkDiffSummary[] = [
    { id: 9, timestamp: '2026-09-15T08:00:00Z', hasChanges: true, addedCount: 0, updatedCount: 3, removedCount: 0, totalEntries: 186, totalAffectedSessions: 1, totalCategoryShifts: 5 },
  ];
  const props = {
    status,
    isUpdatingLaptimes: false,
    onUpdateReferenceLaptimes: vi.fn(),
    laptimesMessage: null,
    updateDiff: null,
  };

  it('shows the server message when the benchmark history cannot load', async () => {
    global.fetch = vi.fn().mockImplementation(() => fail('Benchmark store unavailable'));
    render(<ReferenceLaptimesCard {...props} />);
    expect(await screen.findByText('Benchmark store unavailable')).toHaveClass('text-lmu-loss');
  });

  it('describes history entries in plain words with one accessible name', async () => {
    global.fetch = vi.fn().mockImplementation(() => json(history));
    render(<ReferenceLaptimesCard {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /update history/i }));
    const select = await screen.findByRole('combobox', { name: 'Show update' });
    expect(select).not.toHaveAttribute('aria-label');
    expect(within(select).getByRole('option', { name: / — 3 changed, 5 pace shifts$/ })).toBeInTheDocument();
  });

  it('shows a failed diff load inline and does not leave the old diff under the new selection', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      url.includes('/diffs/9') ? fail('Snapshot 9 is missing') : json(history)
    );
    const latest = {
      id: 10, timestamp: '2026-10-01T10:00:00Z', hasChanges: true, addedCount: 1, updatedCount: 0, removedCount: 0,
      totalEntries: 187, totalAffectedSessions: 0, totalCategoryShifts: 0,
      added: [{ trackName: 'Latest Ring', className: 'Hypercar', timeStr: '1:40.000', timeSec: 100 }],
      updated: [], removed: [],
    } as unknown as Parameters<typeof ReferenceLaptimesCard>[0]['updateDiff'];
    render(<ReferenceLaptimesCard {...props} updateDiff={latest} />);
    fireEvent.click(await screen.findByRole('button', { name: /update history/i }));
    expect(await screen.findByText('Latest Ring')).toBeInTheDocument();

    fireEvent.change(await screen.findByRole('combobox', { name: 'Show update' }), { target: { value: '9' } });
    expect(await screen.findByText('Snapshot 9 is missing')).toHaveClass('text-lmu-loss');
    expect(screen.queryByText('Latest Ring')).not.toBeInTheDocument();
  });

  it('shows the server message when the AI report history cannot load', async () => {
    global.fetch = vi.fn().mockImplementation(() => fail('Report store offline'));
    render(<AiReportsHistoryCard />);
    expect(await screen.findByText('Report store offline')).toHaveClass('text-lmu-loss');
    expect(screen.queryByText(/\d+ Cached/)).not.toBeInTheDocument();
  });

  it('shows no count while the history loads, then the latest reports with Show all', async () => {
    const reports = Array.from({ length: 8 }, (_, i) => ({
      cacheKey: `k${i}`, replayName: `Replay ${i}`, lapNumber: i + 1, model: 'gemini-3.7-flash', generatedAt: 1,
    }));
    global.fetch = vi.fn().mockImplementation(() => json(reports));
    render(<AiReportsHistoryCard />);
    expect(screen.queryByText(/cached$/)).not.toBeInTheDocument();
    expect(await screen.findByText('8 cached')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show latest only' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});
