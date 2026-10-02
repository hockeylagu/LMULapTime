import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Settings } from '../../../src/components/settings/index.js';
import type { ScanStatus } from '../../../server/core/types.js';

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
    await screen.findByText(/no replays cached yet/i);

    expect(screen.getByText('Application Settings')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cached Replays' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI Report History' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Results')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Replays')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Telemetry')).toBeInTheDocument();

    const playerNameInput = screen.getByDisplayValue('Player1');
    fireEvent.change(playerNameInput, { target: { value: 'NewDriver' } });

    const scanBtn = screen.getByRole('button', { name: /rescan & load telemetry/i });
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
    await screen.findByText(/no replays cached yet/i);

    expect(screen.getByRole('heading', { name: 'Reference Benchmarks' })).toBeInTheDocument();

    const refreshBtn = screen.getByRole('button', { name: /update reference lap time benchmarks/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/Updated 190 benchmark entries from Google Sheets!/i)).toBeInTheDocument();
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
    await screen.findByText(/no replays cached yet/i);

    expect(screen.getByText('Application Settings')).toBeInTheDocument();

    const scanBtn = screen.getByRole('button', { name: /rescan & load telemetry/i });
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
    await screen.findByText(/no replays cached yet/i);

    expect(screen.getByRole('heading', { name: 'Session Cache' })).toBeInTheDocument();
    expect(screen.getByText('Cached Sessions').nextSibling).toHaveTextContent('42');
    expect(screen.getByText('512.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Cached Telemetry')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /clear cache/i });
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
    await screen.findByText(/no replays cached yet/i);

    // Renders benchmark section title and badges
    expect(screen.getByText('Benchmark Reference Updates')).toBeInTheDocument();
    expect(screen.getByText('+1 New Reference')).toBeInTheDocument();
    expect(screen.getByText('1 Updated Target')).toBeInTheDocument();

    // Renders items
    expect(screen.getByText('Circuit of the Americas')).toBeInTheDocument();
    expect(screen.getByText('Alien: 2:05.400')).toBeInTheDocument();
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
    await screen.findByText(/no replays cached yet/i);

    const refreshBtn = screen.getByRole('button', { name: /update reference lap time benchmarks/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/No Changes \(All 188 targets identical\)/i)).toBeInTheDocument();
      expect(
        screen.getByText(/All 188 benchmark targets are currently synchronized with Google Sheets/i)
      ).toBeInTheDocument();
    });
  });

  it('filters settings cards and TOC items via search input and clears search', async () => {
    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await screen.findByText(/no replays cached yet/i);

    const searchInput = screen.getByRole('textbox', { name: /search settings/i });
    expect(screen.getByRole('heading', { name: 'Session Cache' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reference Benchmarks' })).toBeInTheDocument();

    // Search for "gemini" -> should show AI sections and hide SQLite Cache
    fireEvent.change(searchInput, { target: { value: 'gemini' } });

    await waitFor(() => {
      expect(screen.getByText('2 of 6 sections match')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'AI Lap Reports' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'AI Report History' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Session Cache' })).not.toBeInTheDocument();
    });

    // Clear search using the one clear button in the input
    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
      expect(screen.getByRole('heading', { name: 'Session Cache' })).toBeInTheDocument();
    });
    await screen.findByText(/no replays cached yet/i);
  });

  it('shows empty state when no settings match and clears via empty state button', async () => {
    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await screen.findByText(/no replays cached yet/i);

    const searchInput = screen.getByRole('textbox', { name: /search settings/i });
    fireEvent.change(searchInput, { target: { value: 'nonexistenttermxyz' } });

    await waitFor(() => {
      expect(screen.getByText('No Settings Found')).toBeInTheDocument();
      expect(screen.getByText(/No settings match "nonexistenttermxyz"/i)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Session Cache' })).not.toBeInTheDocument();
    });

    const [, clearBtn] = screen.getAllByRole('button', { name: 'Clear search' });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByText('No Settings Found')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Session Cache' })).toBeInTheDocument();
    });
    await screen.findByText(/no replays cached yet/i);
  });

  it('navigates to section and scrolls element into view on TOC button click', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<Settings status={mockStatus} onUpdatePaths={vi.fn()} />);
    await screen.findByText(/no replays cached yet/i);

    const tocNav = screen.getByRole('navigation', { name: /settings table of contents/i });
    expect(tocNav).toBeInTheDocument();

    const aiButton = within(tocNav).getByRole('button', { name: /AI Lap Reports/i });
    fireEvent.click(aiButton);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});

