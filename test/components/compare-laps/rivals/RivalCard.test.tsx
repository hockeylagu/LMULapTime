import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  const rival: RivalState = { status: s, loading: false, error, pin: vi.fn() };
  const handlers = { onCompare: vi.fn(), onTelemetry: vi.fn() };
  render(<RivalCard rival={rival} player={player} {...handlers} />);
  return { rival, ...handlers };
};

describe('RivalCard', () => {
  it('shows the rival, the time to find, the share closed and the sector to analyse', () => {
    renderCard(status());
    expect(screen.getByRole('heading')).toHaveTextContent('P9Rival');
    expect(screen.getByText('0.300')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText(/Your best sectors close/)).toHaveTextContent('Your best sectors close 0.200 of the 0.300 s: the rest is new pace.');
    const sectors = screen.getByLabelText('Sector by sector');
    expect(within(sectors).getByText('S1 -0.050')).toHaveClass('text-emerald-300');
    expect(within(sectors).getByText('S2 +0.100')).toBeInTheDocument();
    expect(within(sectors).getByText('S3 +0.250')).toHaveClass('text-rose-300');
    expect(screen.getByRole('button', { name: /Analyse in Compare laps/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Where's the time/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Gap after each session')).toHaveTextContent('0.50→0.30');
  });

  it('shows the progress bar at 0%, with how to start closing the gap', () => {
    renderCard(status({ progress: 0 }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('beat 1:40.200 to start closing')).toBeInTheDocument();
  });

  it('shows a ghost target when nobody is within reach', () => {
    renderCard(status({ rival: target({ kind: 'ghost', driverName: null, targetTime: 99.8 }), rivalEntry: null }));
    expect(screen.getByText('Ghost target')).toBeInTheDocument();
    expect(screen.getByText('Your best, 0.2 s faster')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Analyse/ })).not.toBeInTheDocument();
  });

  it('leaves out the sector row when a ghost target has nothing to show in it', () => {
    const ghost = status({ rival: target({ kind: 'ghost', driverName: null, targetTime: 99.8 }), rivalEntry: null, theoreticalGap: null, trend: [] });
    const { container } = render(<RivalCard rival={{ status: ghost, loading: false, error: null, pin: vi.fn() }} player={{ ...player, theoreticalBest: null }} />);
    expect(container.querySelector('.space-y-2')).toBeNull();
  });

  it('compares with the rival, opens the telemetry, or pins the next one', () => {
    const { rival, onCompare, onTelemetry } = renderCard(status());
    fireEvent.click(screen.getByRole('button', { name: /Analyse/ }));
    expect(onCompare).toHaveBeenCalledWith(rivalEntry);
    fireEvent.click(screen.getByRole('button', { name: /Compare Telemetry/ }));
    expect(onTelemetry).toHaveBeenCalledWith(rivalEntry);
    expect(screen.queryByRole('button', { name: /Another rival/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Make Next your rival' }));
    expect(rival.pin).toHaveBeenCalledWith('Next');
  });

  it('offers the next drivers as chips, without the current rival', () => {
    renderCard(status());
    expect(screen.getByRole('button', { name: 'Make Next your rival' })).toHaveTextContent('P8Next1:39.600');
    expect(screen.queryByRole('button', { name: 'Make Rival your rival' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/rivals beaten/)).not.toBeInTheDocument();
  });

  it('counts the rivals beaten and lists them on demand', () => {
    renderCard(status({ beaten: [target({ id: 2, driverName: 'Old rival', status: 'beaten', beatenTime: 100.1, endedAt: Date.now() })] }));
    expect(screen.getByLabelText('1 rivals beaten')).toHaveTextContent('Beaten 1');
    expect(screen.getByText('Old rival')).toBeInTheDocument();
  });

  it('shows nothing without a rival, and the error when it could not be loaded', () => {
    const { unmount } = render(<RivalCard rival={{ status: null, loading: false, error: null, pin: vi.fn() }} player={player} />);
    expect(screen.queryByLabelText('Your rival')).not.toBeInTheDocument();
    unmount();
    renderCard(null, 'Database is locked');
    expect(screen.getByRole('alert')).toHaveTextContent('Database is locked');
  });
});
