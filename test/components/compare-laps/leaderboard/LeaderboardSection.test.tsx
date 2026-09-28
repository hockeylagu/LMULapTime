import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LeaderboardSection, LeaderboardSectionProps } from '../../../../src/components/compare-laps/leaderboard/LeaderboardSection.js';
import { rankForTime } from '../../../../src/components/compare-laps/leaderboard/StandingHeader.js';
import { BENCHMARK, board } from './leaderboardFixtures.js';

const renderSection = (props: Partial<LeaderboardSectionProps> = {}) => {
  const handlers = { onScopeChange: vi.fn(), onCompare: vi.fn(), onTelemetry: vi.fn() };
  render(
    <LeaderboardSection
      board={board(40, 30, BENCHMARK)}
      loading={false}
      error={null}
      carClass="LMGT3"
      scope="class"
      playerCarType="Ferrari 296 LMGT3"
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('LeaderboardSection', () => {
  it('shows where the player stands: rank, gap to P1, pace band and sector ranks', () => {
    renderSection();
    expect(screen.getByText('Your rank').parentElement).toHaveTextContent('P30/40top 75%');
    expect(screen.getByText('Gap to P1').parentElement).toHaveTextContent('+2.900');
    expect(screen.getByText('Vs alien target').parentElement).toHaveTextContent('102.8%Good');
    expect(screen.getByText('S1 P30')).toBeInTheDocument();
  });

  it('lists the top and the drivers around the player, and shows everyone on demand', () => {
    renderSection();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Driver 1')).toBeInTheDocument();
    expect(within(table).queryByText('Driver 20')).not.toBeInTheDocument();
    expect(within(table).getByText('Me')).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Alien pace, 100%/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /14 more drivers/ }));
    expect(within(table).getByText('Driver 20')).toBeInTheDocument();
  });

  it('compares with a driver and opens the telemetry of both laps', () => {
    const { onCompare, onTelemetry } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with Driver 29' }));
    expect(onCompare).toHaveBeenCalledWith(expect.objectContaining({ driverName: 'Driver 29' }));
    fireEvent.click(screen.getByRole('button', { name: 'Telemetry against Driver 29' }));
    expect(onTelemetry).toHaveBeenCalledWith(expect.objectContaining({ driverName: 'Driver 29' }));
    expect(screen.queryByRole('button', { name: 'Compare with Me' })).not.toBeInTheDocument();
  });

  it('marks the rival, and offers to make any driver ahead the rival', () => {
    const onPin = vi.fn();
    renderSection({ rivalName: 'Driver 29', onPin });
    const table = screen.getByRole('table');
    expect(within(table).getByText('Driver 29').parentElement).toHaveTextContent('Rival');
    expect(screen.queryByRole('button', { name: 'Make Driver 29 your rival' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make Driver 31 your rival' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Make Driver 28 your rival' }));
    expect(onPin).toHaveBeenCalledWith('Driver 28');
  });

  it('greys out the telemetry of a lap without a replay', () => {
    const b = board(5, 5);
    b.entries[1] = { ...b.entries[1], bestLap: { ...b.entries[1].bestLap, replayName: null } };
    renderSection({ board: b });
    expect(screen.getByRole('button', { name: 'Telemetry against Driver 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Telemetry against Driver 1' })).toBeEnabled();
  });

  it('switches between the whole class and the player car, and between orders', () => {
    const { onScopeChange } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'My car' }));
    expect(onScopeChange).toHaveBeenCalledWith('car');
    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    expect(screen.getByRole('button', { name: 'S2' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).queryByRole('row', { name: /Alien/ })).not.toBeInTheDocument();
  });

  it('invites the player to drive when they are not on the board, and says why a board failed', () => {
    renderSection({ board: board(3, null) });
    expect(screen.getByText(/no clean dry lap here/)).toBeInTheDocument();
  });

  it('shows the error of a board that could not be loaded', () => {
    renderSection({ board: null, error: 'Database is locked' });
    expect(screen.getByRole('alert')).toHaveTextContent('Database is locked');
  });
});

describe('rankForTime', () => {
  it('ranks a time among the other drivers', () => {
    const b = board(10, 8);
    expect(rankForTime(b, 100.25, b.player!)).toBe(4);
    expect(rankForTime(b, 99, b.player!)).toBe(1);
  });
});
