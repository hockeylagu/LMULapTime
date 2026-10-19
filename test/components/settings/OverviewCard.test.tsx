import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { OverviewCard } from '../../../src/components/settings/OverviewCard.js';
import type { AppStatus } from '../../../shared/types/index.js';
import type { ReplayCacheState } from '../../../src/components/settings/replays/useReplayCache.js';
import type { AiSettingsState } from '../../../src/components/settings/hooks/useAiSettings.js';

const status = (sessions: number): AppStatus => ({
  resultsDir: 'C:\LMU\Results',
  resultsExist: true,
  replaysDir: 'C:\LMU\Replays',
  replaysExist: true,
  sessionsCount: sessions,
  tracksCount: 1,
  sqliteCache: { enabled: true, dbPath: 'x.db', sessionsCount: sessions, lastSyncedAt: null, dbSizeBytes: 1024, telemetryFilesCount: 3 },
});

const replay = { counts: { total: 4, archived: 1 } } as unknown as ReplayCacheState;
const ai = { settings: null, loadError: null } as unknown as AiSettingsState;

const renderCard = (sessions: number, onClearCache = vi.fn()) =>
  render(<OverviewCard status={status(sessions)} replay={replay} ai={ai} isClearingCache={false} onClearCache={onClearCache} cacheMessage={null} />);

describe('OverviewCard', () => {
  it('shows supplemental live recording files separately from native telemetry', () => {
    const appStatus = status(3);
    appStatus.sqliteCache!.liveTelemetryFilesCount = 12;
    const { rerender } = render(<OverviewCard status={appStatus} replay={replay} ai={ai}
      isClearingCache={false} onClearCache={vi.fn()} cacheMessage={null} />);
    expect(within(screen.getByText('Live telemetry files').parentElement!).getByText('12')).toBeInTheDocument();
    expect(within(screen.getByText('Telemetry files').parentElement!).getByText('3')).toBeInTheDocument();
    appStatus.sqliteCache!.liveTelemetryFilesCount = 0;
    rerender(<OverviewCard status={appStatus} replay={replay} ai={ai}
      isClearingCache={false} onClearCache={vi.fn()} cacheMessage={null} />);
    expect(screen.getByText('No live recordings yet')).toBeInTheDocument();
    delete appStatus.sqliteCache!.liveTelemetryFilesCount;
    rerender(<OverviewCard status={appStatus} replay={replay} ai={ai}
      isClearingCache={false} onClearCache={vi.fn()} cacheMessage={null} />);
    expect(screen.getByText('Live telemetry files').nextElementSibling).toHaveTextContent('—');
  });

  it('scopes the clear action to parsed sessions and does nothing until confirmed', () => {
    const onClear = vi.fn();
    renderCard(1, onClear);
    fireEvent.click(screen.getByRole('button', { name: /clear parsed sessions/i }));
    expect(screen.getByText('Clear 1 parsed session?')).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('cancels the confirm without clearing', () => {
    const onClear = vi.fn();
    renderCard(5, onClear);
    fireEvent.click(screen.getByRole('button', { name: /clear parsed sessions/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /clear parsed sessions/i })).toBeInTheDocument();
  });

  it('disables clearing when there are no parsed sessions and shows "Never" for last sync', () => {
    renderCard(0);
    expect(screen.getByRole('button', { name: /clear parsed sessions/i })).toBeDisabled();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });
});
