import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CacheSettingsCard } from '../../../src/components/settings/CacheSettingsCard.js';
import type { AppStatus } from '../../../shared/types/index.js';

const statusWith = (sessionsCount: number, dbSizeBytes = 524288): AppStatus => ({
  resultsDir: 'C:\\LMU\\Results',
  resultsExist: true,
  replaysDir: 'C:\\LMU\\Replays',
  replaysExist: true,
  sessionsCount,
  tracksCount: 1,
  sqliteCache: { enabled: true, dbPath: 'x.db', sessionsCount, lastSyncedAt: null, dbSizeBytes },
});

describe('CacheSettingsCard', () => {
  it('states exactly what clearing deletes, with the live session count', () => {
    render(<CacheSettingsCard status={statusWith(42)} isClearingCache={false} onClearCache={vi.fn()} cacheMessage={null} />);
    expect(screen.getByText(/Clearing deletes 42 parsed sessions/)).toHaveTextContent('Cached replays and telemetry are kept.');
  });

  it('asks inline before clearing, and Escape cancels', () => {
    const onClear = vi.fn();
    render(<CacheSettingsCard status={statusWith(3)} isClearingCache={false} onClearCache={onClear} cacheMessage={null} />);

    fireEvent.click(screen.getByRole('button', { name: /clear cache/i }));
    expect(screen.getByText('Clear 3 parsed sessions?')).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
    expect(screen.queryByText('Clear 3 parsed sessions?')).not.toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('clears only after Confirm', () => {
    const onClear = vi.fn();
    render(<CacheSettingsCard status={statusWith(3)} isClearingCache={false} onClearCache={onClear} cacheMessage={null} />);
    fireEvent.click(screen.getByRole('button', { name: /clear cache/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('disables Clear cache when there are no sessions', () => {
    render(<CacheSettingsCard status={statusWith(0)} isClearingCache={false} onClearCache={vi.fn()} cacheMessage={null} />);
    expect(screen.getByRole('button', { name: /clear cache/i })).toBeDisabled();
  });

  it('scales the database size to GB', () => {
    render(<CacheSettingsCard status={statusWith(1, 5011.09 * 1024 * 1024)} isClearingCache={false} onClearCache={vi.fn()} cacheMessage={null} />);
    expect(screen.getByText('4.89 GB')).toBeInTheDocument();
  });

  it('shows an error message as an error, not a success', () => {
    render(<CacheSettingsCard status={statusWith(1)} isClearingCache={false} onClearCache={vi.fn()} cacheMessage={{ tone: 'error', text: 'Clearing the cache failed: nope' }} />);
    const message = screen.getByRole('status');
    expect(message).toHaveClass('text-lmu-loss');
    expect(message).toHaveTextContent('Clearing the cache failed');
  });
});
