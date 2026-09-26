import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../../../src/components/navbar/index.js';

describe('Navbar component', () => {
  it('renders brand title and active tab correctly', () => {
    const onRefresh = vi.fn();

    render(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 15 }}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    );

    expect(screen.getByText(/LMU/)).toBeInTheDocument();
    expect(screen.getByText(/15 Sessions/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /tracks/i })).toHaveAttribute('href', '/tracks');
  });

  it('handles refresh button click and triggers onRefresh', () => {
    const onRefresh = vi.fn();

    render(
      <Navbar
        status={{ resultsExist: false, replaysExist: false, sessionsCount: 0 }}
        onRefresh={onRefresh}
        isRefreshing={false}
      />
    );

    const refreshBtn = screen.getByTitle('Refresh LMU Directory Scan');
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('returns to dashboard when clicking the top-right status section or the brand logo', () => {
    render(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 15 }}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    // Click top-right status section
    const statusCard = screen.getByText(/15 Sessions/i);
    expect(statusCard.closest('a')).toHaveAttribute('href', '/dashboard');

    // Click brand title
    const brandHeading = screen.getByRole('heading', { level: 1, name: /LMU Lap Time Analyzer/i });
    expect(brandHeading.closest('a')).toHaveAttribute('href', '/dashboard');
  });

  it('renders clean Replays count without implementation details (no parsed or cached labels)', () => {
    render(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 15, replaysCount: 42 }}
        replayScanStatus={{
          running: false,
          processed: 42,
          total: 42,
          currentFile: null,
          startedAt: null,
          finishedAt: '2026-09-24T00:00:00Z',
          result: { total: 42, added: 0, updated: 0, skipped: 42, lastSyncedAt: '2026-09-24T00:00:00Z', interrupted: false },
          error: null,
        }}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    // Clean counts should be displayed
    expect(screen.getByText('15 Sessions')).toBeInTheDocument();
    expect(screen.getByText('42 Replays')).toBeInTheDocument();
    // Implementation details should NOT be present
    expect(screen.queryByText(/parsed/i)).toBeNull();
    expect(screen.queryByText(/cached/i)).toBeNull();
  });

  it('displays live syncing progress for sessions, replays, and telemetry', () => {
    const { rerender } = render(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 10 }}
        replayScanStatus={{
          running: false,
          processed: 0,
          total: 0,
          currentFile: null,
          startedAt: null,
          finishedAt: null,
          result: null,
          error: null,
          sessionScan: { running: true, processed: 5, total: 20, currentFile: 'session_5.xml', startedAt: '2026-09-24T00:00:00Z', finishedAt: null, result: null, error: null },
        }}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    expect(screen.getByText('Syncing Sessions... 5/20')).toBeInTheDocument();
    expect(screen.getByTitle('Syncing Session: session_5.xml')).toBeInTheDocument();

    // Rerender during replay sync
    rerender(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 10 }}
        replayScanStatus={{
          running: true,
          processed: 12,
          total: 50,
          currentFile: 'monza_replay.Vcr',
          startedAt: null,
          finishedAt: null,
          result: null,
          error: null,
        }}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    expect(screen.getByText('Syncing Replays... 12/50')).toBeInTheDocument();
    expect(screen.getByTitle('Syncing Replay: monza_replay.Vcr')).toBeInTheDocument();

    // Rerender during telemetry sync
    rerender(
      <Navbar
        status={{ resultsExist: true, replaysExist: true, sessionsCount: 10 }}
        replayScanStatus={{
          running: false,
          processed: 50,
          total: 50,
          currentFile: null,
          startedAt: null,
          finishedAt: null,
          result: null,
          error: null,
          telemetryScan: { running: true, processed: 3, total: 8, currentFile: 'spa_telemetry.duckdb', startedAt: '2026-09-24T00:00:00Z', finishedAt: null, result: null, error: null },
        }}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />
    );

    expect(screen.getByText('Syncing Telemetry... 3/8')).toBeInTheDocument();
    expect(screen.getByTitle('Syncing Telemetry: spa_telemetry.duckdb')).toBeInTheDocument();
  });
});
