import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionLapStewardsLine } from '../../../src/components/session-detail/table/SessionLapStewardsLine.js';
import { DriverData, LapData, LapTrackLimit } from '../../../shared/types/index.js';

const makeTrackLimit = (lapNumber: number, elapsedSeconds: number, warningPoints = 0): LapTrackLimit => ({
  description: warningPoints > 0 ? `Track limits violation (+${warningPoints} pts)` : 'Track limits review (No Further Action)',
  lapNumber,
  elapsedSeconds,
  warningPoints,
  currentPoints: warningPoints,
  action: warningPoints > 0 ? 'Warning' : 'No Further Action',
});

const makeLap = (lapNumber: number): LapData => ({
  lapNumber,
  position: 1,
  lapTime: 120,
  s1: 40,
  s2: 40,
  s3: 40,
  topSpeed: 250,
  fCompound: 'Soft',
  rCompound: 'Soft',
  elapsedSeconds: lapNumber * 120,
  isPitStop: false,
  isValid: true,
});

const makeDriver = (overrides: Partial<DriverData> = {}): DriverData => {
  const first = makeTrackLimit(1, 100.2);
  const second = makeTrackLimit(2, 230.9, 0.25);
  return {
    name: 'Selected Driver',
    carType: 'Prototype',
    carClass: 'Hyper',
    carNumber: '50',
    teamName: 'Team',
    isPlayer: true,
    position: 1,
    classPosition: 1,
    bestLapTime: 120,
    bestS1: 40,
    bestS2: 40,
    bestS3: 40,
    theoreticalBest: 120,
    declaredLapsCount: 2,
    trackLimits: [first, second],
    laps: [makeLap(1), makeLap(2)],
    ...overrides,
  };
};

describe('SessionLapStewardsLine', () => {
  it('tallies the events in the worst track limit color, without repeating those on laps', () => {
    render(<SessionLapStewardsLine driver={makeDriver()} />);

    const tally = screen.getByText('2 track limits');
    expect(tally).toHaveClass('text-lmu-warn');
    expect(screen.queryByText(/Not on a lap/)).not.toBeInTheDocument();
  });

  it('lists the events no lap holds', () => {
    const driver = makeDriver();
    driver.trackLimits = [...(driver.trackLimits ?? []), makeTrackLimit(9, 1500)];
    render(<SessionLapStewardsLine driver={driver} />);

    expect(screen.getByText(/Not on a lap/)).toBeInTheDocument();
    expect(screen.getByText('Track limits review (No Further Action)')).toBeInTheDocument();
  });

  it('renders nothing for a clean driver', () => {
    const { container } = render(
      <SessionLapStewardsLine driver={makeDriver({ trackLimits: [], laps: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
