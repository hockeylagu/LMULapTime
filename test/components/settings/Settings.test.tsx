import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Settings } from '../../../src/components/settings/index.js';
import type { ScanStatus } from '../../../server/core/types.js';

/** The replay list has loaded once the status strip shows its replay figure. */
const settled = () =>
  waitFor(() => expect(within(screen.getByRole('group', { name: 'Settings status' })).getByText('No replays cached yet')).toBeInTheDocument());

describe('Settings component', () => {
  const mockStatus = {
    resultsDir: 'C:\\LMU\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\Replays',
    replaysExist: true,
    telemetryDir: 'C:\\LMU\\Telemetry',
    telemetryExist: true,
    playerName: 'Player1',
    sessionsCount: 15,
    tracksCount: 5,
    referenceLaptimes: {
      lastUpdated: '2026-05-28T12:00:00Z',
      entriesCount: 186,
    },
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/scan')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, count: 20, tracksCount: 5 }) });
      }
      if (url.includes('/api/reference-laptimes/refresh')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, entriesCount: 190 }) });
      }
      if (url.includes('/api/replays/cache')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/replays/upgrade')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ pendingReplays: 0, pendingDrivers: 0, status: { running: false, enabled: false } }),
        });
      }
      if (url.includes('/api/ai/settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ configured: false, model: 'gemini-3.7-flash', keySource: null }),
        });
      }
      if (url.includes('/api/ai/reports')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders directory paths, status indicators, and scans directories on submit', async () => {
    const onUpdatePaths = vi.fn();
    render(<Settings status={mockStatus} onUpdatePaths={onUpdatePaths} />);
    await settled();

    expect(screen.getByText('Application Settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cached Replays' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI Report History' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Results')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Replays')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Telemetry')).toBeInTheDocument();

    const playerNameInput = screen.getByDisplayValue('Player1');
    fireEvent.change(playerNameInput, { target: { value: 'NewDriver' } });

    const scanBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(onUpdatePaths).toHaveBeenCalled();
    });
  });

  it('shows active XML session scan file and stage progress', async () => {
    const scanStatus = {
      running: false,
      processed: 0,
      total: 0,
      currentFile: null,
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
      sessionScan: {
        running: true,
        processed: 2,
        total: 5,
        currentFile: '2026_09_25_12_00_00-01R1.xml',
        currentStage: 'Reading XML session log',
        filePercent: 5,
        startedAt: '2026-09-25T12:00:00.000Z',
        finishedAt: null,
        result: null,
        error: null,
      },
      referenceLaptimes: {
        started: false,
        running: false,
        checked: true,
        completedAt: null,
        refreshed: false,
        updatedCount: 0,
        diff: null,
        error: null,
      },
    } as ScanStatus;

    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} replayScanStatus={scanStatus} />);

    expect(await screen.findByText('Parsing XML Session Logs')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('2026_09_25_12_00_00-01R1.xml')).toBeInTheDocument();
    expect(screen.getByText('Reading XML session log')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
  });

  it('handles reference laptimes manual refresh button click', async () => {
    const onUpdatePaths = vi.fn();
    render(<Settings status={mockStatus} onUpdatePaths={onUpdatePaths} />);
    await settled();

    expect(screen.getByRole('heading', { name: 'Reference Benchmarks' })).toBeInTheDocument();

    const refreshBtn = screen.getByRole('button', { name: /update from the sheet/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/Updated 190 benchmark targets from the sheet./i)).toBeInTheDocument();
      expect(onUpdatePaths).toHaveBeenCalled();
    });
  });

  it('displays error notification when scan fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/scan')) {
        return Promise.reject(new Error('Network failure during scan'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await settled();

    expect(screen.getByText('Application Settings')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Player1'), { target: { value: 'NewDriver' } });
    const scanBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Network failure during scan/i)).toBeInTheDocument();
    });
  });

  it('renders SQLite cache section with stats and handles clear cache button', async () => {
    const onUpdatePaths = vi.fn();
    const statusWithCache = {
      ...mockStatus,
      sqliteCache: {
        enabled: true,
        dbPath: 'C:\\LMU\\server\\lmu_cache.db',
        sessionsCount: 42,
        lastSyncedAt: '2026-06-01T10:30:00Z',
        dbSizeBytes: 524288,
        telemetryFilesCount: 7,
      },
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/cache/clear')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'SQLite cache cleared', sessionsCount: 0 }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<Settings status={statusWithCache} onUpdatePaths={onUpdatePaths} />);
    await settled();

    expect(screen.queryByRole('heading', { name: 'Session Cache' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Total app database')).toBeInTheDocument();
    expect(screen.queryByText('Cached Sessions')).not.toBeInTheDocument();
    expect(screen.getByText('512.0 KB')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /clear parsed sessions/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText('Clear 42 parsed sessions?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(screen.getByText(/Session cache cleared/i)).toBeInTheDocument();
      expect(onUpdatePaths).toHaveBeenCalled();
    });
  });

  it('renders benchmark updates changelog section when lastUpdateDiff has changes', async () => {
    const onUpdatePaths = vi.fn();
    const statusWithDiff = {
      ...mockStatus,
      referenceLaptimes: {
        lastUpdated: '2026-05-28T12:00:00Z',
        entriesCount: 187,
        lastUpdateDiff: {
          timestamp: '2026-05-28T12:00:00Z',
          hasChanges: true,
          addedCount: 1,
          updatedCount: 1,
          removedCount: 0,
          totalEntries: 187,
          added: [
            {
              key: 'cota_lmgt3',
              trackName: 'Circuit of the Americas',
              carClass: 'LMGT3',
              patch: '1.4+',
              type: 'added' as const,
              newAlienSec: 125.4,
              newAlienTimeString: '2:05.400',
            },
          ],
          updated: [
            {
              key: 'bahrain_lmgt3',
              trackName: 'Bahrain',
              carClass: 'LMGT3',
              patch: '1.4+',
              oldPatch: '1.3',
              newPatch: '1.4+',
              type: 'updated' as const,
              oldAlienSec: 120.0,
              newAlienSec: 119.5,
              oldAlienTimeString: '2:00.000',
              newAlienTimeString: '1:59.500',
              diffSec: -0.5,
            },
          ],
          removed: [],
        },
      },
    };

    render(<Settings status={statusWithDiff} onUpdatePaths={onUpdatePaths} />);
    await settled();

    // Status line counts, history collapsed until asked
    expect(screen.getByText('+1 new')).toBeInTheDocument();
    expect(screen.getByText('1 updated')).toBeInTheDocument();
    expect(screen.queryByText('Circuit of the Americas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /update history/i }));

    expect(screen.getByText('What changed')).toBeInTheDocument();
    expect(screen.getByText('Circuit of the Americas')).toBeInTheDocument();
    expect(screen.getByText('Alien target 2:05.400')).toBeInTheDocument();
    expect(screen.getByText('Bahrain')).toBeInTheDocument();
    expect(screen.getByText('2:00.000')).toBeInTheDocument();
    expect(screen.getByText('1:59.500')).toBeInTheDocument();
    expect(screen.getByText('(-0.500s)')).toBeInTheDocument();
  });

  it('updates diff and renders changelog upon clicking update reference laptimes', async () => {
    const onUpdatePaths = vi.fn();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/reference-laptimes/refresh')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              entriesCount: 188,
              diff: {
                timestamp: '2026-05-28T12:05:00Z',
                hasChanges: false,
                addedCount: 0,
                updatedCount: 0,
                removedCount: 0,
                totalEntries: 188,
                added: [],
                updated: [],
                removed: [],
              },
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<Settings status={mockStatus} onUpdatePaths={onUpdatePaths} />);
    await settled();

    const refreshBtn = screen.getByRole('button', { name: /update from the sheet/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/no changes/i)).toHaveLength(1);
    });
  });

  it('finds Overview by cache, sqlite and clear', async () => {
    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await settled();
    const searchInput = screen.getByRole('textbox', { name: /search settings/i });
    for (const term of ['cache', 'sqlite', 'clear']) {
      fireEvent.change(searchInput, { target: { value: term } });
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument());
    }
    await settled();
  });

  it('filters settings cards and TOC items via search input and clears search', async () => {
    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await settled();

    const searchInput = screen.getByRole('textbox', { name: /search settings/i });
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reference Benchmarks' })).toBeInTheDocument();

    // Search for "gemini" -> should show AI sections and hide SQLite Cache
    fireEvent.change(searchInput, { target: { value: 'gemini' } });

    await waitFor(() => {
      expect(screen.getByText('2 of 6 sections match')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'AI Lap Reports' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'AI Report History' })).toBeInTheDocument();
      
    });

    // Clear search using the one clear button in the input
    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
      expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    });
    await settled();
  });

  it('shows empty state when no settings match and clears via empty state button', async () => {
    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await settled();

    const searchInput = screen.getByRole('textbox', { name: /search settings/i });
    fireEvent.change(searchInput, { target: { value: 'nonexistenttermxyz' } });

    await waitFor(() => {
      expect(screen.getByText('No settings found')).toBeInTheDocument();
      expect(screen.getByText(/No settings match "nonexistenttermxyz"/i)).toBeInTheDocument();
      
    });

    const [, clearBtn] = screen.getAllByRole('button', { name: 'Clear search' });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByText('No settings found')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    });
    await settled();
  });

  it('navigates to section and scrolls element into view on TOC button click', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await settled();

    const tocNav = screen.getByRole('navigation', { name: /settings table of contents/i });
    expect(tocNav).toBeInTheDocument();

    const aiButton = within(tocNav).getByRole('button', { name: /AI Lap Reports/i });
    fireEvent.click(aiButton);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});

