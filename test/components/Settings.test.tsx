import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Settings } from '../../src/components/Settings';

describe('Settings component', () => {
  const mockStatus = {
    resultsDir: 'C:\\LMU\\Results',
    resultsExist: true,
    replaysDir: 'C:\\LMU\\Replays',
    replaysExist: true,
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
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  it('renders directory paths, status indicators, and scans directories on submit', async () => {
    const onUpdatePaths = vi.fn();
    render(<Settings status={mockStatus} onUpdatePaths={onUpdatePaths} />);

    expect(screen.getByText('Application Settings')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Results')).toBeInTheDocument();
    expect(screen.getByDisplayValue('C:\\LMU\\Replays')).toBeInTheDocument();

    const playerNameInput = screen.getByDisplayValue('Player1');
    fireEvent.change(playerNameInput, { target: { value: 'NewDriver' } });

    const scanBtn = screen.getByRole('button', { name: /rescan & load telemetry/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(onUpdatePaths).toHaveBeenCalled();
    });
  });

  it('handles reference laptimes manual refresh button click', async () => {
    const onUpdatePaths = vi.fn();
    render(<Settings status={mockStatus} onUpdatePaths={onUpdatePaths} />);

    expect(screen.getByText('Reference Laptimes Benchmark')).toBeInTheDocument();

    const refreshBtn = screen.getByRole('button', { name: /update reference laptimes/i });
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
      },
    };

    // Mock confirm dialog
    vi.spyOn(window, 'confirm').mockReturnValue(true);

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

    expect(screen.getByText('Session XML SQLite Cache')).toBeInTheDocument();
    expect(screen.getByText(/42 Sessions Cached/i)).toBeInTheDocument();
    expect(screen.getByText('512.0 KB')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /clear cache/i });
    fireEvent.click(clearBtn);

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Session SQLite cache cleared successfully/i)).toBeInTheDocument();
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

    const refreshBtn = screen.getByRole('button', { name: /update reference laptimes/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/No Changes \(All 188 targets identical\)/i)).toBeInTheDocument();
      expect(
        screen.getByText(/All 188 benchmark targets are currently synchronized with Google Sheets/i)
      ).toBeInTheDocument();
    });
  });
});
