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
});
