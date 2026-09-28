import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RivalCard } from '../../../../src/components/compare-laps/rivals/RivalCard.js';
import type { RivalState } from '../../../../src/components/compare-laps/rivals/useRival.js';
import type { RivalStatus, RivalTarget } from '../../../../shared/types/leaderboard.js';
import { entry } from '../leaderboard/leaderboardFixtures.js';

const player = entry(10, 'Me', 100, {
  isPlayer: true,
  bestLap: { ...entry(10, 'Me', 100).bestLap, s1: 30, s2: 40, s3: 30 },
  theoreticalBest: 99.8,
});
const rivalEntry = entry(9, 'Rival', 99.7, { bestLap: { ...entry(9, 'Rival', 99.7).bestLap, s1: 30.05, s2: 39.9, s3: 29.75 } });

const target = (extra: Partial<RivalTarget> = {}): RivalTarget => ({
  id: 1, kind: 'driver', driverName: 'Rival', targetTime: 99.7, startTime: 100.2, pinned: false, status: 'active',
  setAt: 1, endedAt: null, beatenTime: null, beatenSessionId: null, ...extra,
});

const status = (extra: Partial<RivalStatus> = {}): RivalStatus => ({
  rival: target(),
  rivalEntry,
  gap: 0.3,
  progress: 0.4,
  theoreticalGap: 0.1,
  beaten: [],
  nextUp: [entry(8, 'Next', 99.6)],
  trend: [
    { sessionId: 'a', sessionName: 'P1', timestamp: 1, best: 100.2, gap: 0.5 },
    { sessionId: 'b', sessionName: 'R1', timestamp: 2, best: 100, gap: 0.3 },
  ],
  ...extra,
});

const renderCard = (s: RivalStatus | null, error: string | null = null) => {
  const rival: RivalState = { status: s, loading: false, error, skip: vi.fn(), pin: vi.fn() };
  const handlers = { onCompare: vi.fn(), onTelemetry: vi.fn() };
  render(<RivalCard rival={rival} player={player} {...handlers} />);
  return { rival, ...handlers };
};

describe('RivalCard', () => {
  it('shows the rival, the time to find, the share closed and where the time is', () => {
    renderCard(status());
    expect(screen.getByRole('heading')).toHaveTextContent('P9Rival');
    expect(screen.getByText('0.300')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText(/Your best sectors close/)).toHaveTextContent('close 0.200 of the 0.300 s');
    expect(screen.getByText('S3 +0.250')).toBeInTheDocument();
    expect(screen.getByText('most of it is in S3')).toBeInTheDocument();
    expect(screen.getByLabelText('Gap after each session')).toHaveTextContent('0.50→0.30');
  });

  it('says so when the best sectors already beat the rival', () => {
    renderCard(status({ theoreticalGap: -0.12 }));
    expect(screen.getByText(/already driven it/)).toHaveTextContent('0.120 s under your rival');
  });

  it('shows a ghost target when nobody is within reach', () => {
    renderCard(status({ rival: target({ kind: 'ghost', driverName: null, targetTime: 99.8 }), rivalEntry: null }));
    expect(screen.getByText('Ghost target')).toBeInTheDocument();
    expect(screen.getByText('Your best, 0.2% faster')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Compare laps/ })).not.toBeInTheDocument();
  });

  it('compares with the rival, opens the telemetry, skips it, or pins the next one', () => {
    const { rival, onCompare, onTelemetry } = renderCard(status());
    fireEvent.click(screen.getByRole('button', { name: /Compare laps/ }));
    expect(onCompare).toHaveBeenCalledWith(rivalEntry);
    fireEvent.click(screen.getByRole('button', { name: /Telemetry/ }));
    expect(onTelemetry).toHaveBeenCalledWith(rivalEntry);
    fireEvent.click(screen.getByRole('button', { name: /Another rival/ }));
    expect(rival.skip).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Make Next your rival' }));
    expect(rival.pin).toHaveBeenCalledWith('Next');
  });

  it('lists the rivals beaten', () => {
    renderCard(status({ beaten: [target({ id: 2, driverName: 'Old rival', status: 'beaten', beatenTime: 100.1, endedAt: Date.now() })] }));
    expect(screen.getByText('Beaten (1)')).toBeInTheDocument();
    expect(screen.getByText('Old rival')).toBeInTheDocument();
  });

  it('shows nothing without a rival, and the error when it could not be loaded', () => {
    const { unmount } = render(<RivalCard rival={{ status: null, loading: false, error: null, skip: vi.fn(), pin: vi.fn() }} player={player} />);
    expect(screen.queryByLabelText('Your rival')).not.toBeInTheDocument();
    unmount();
    renderCard(null, 'Database is locked');
    expect(screen.getByRole('alert')).toHaveTextContent('Database is locked');
  });
});
