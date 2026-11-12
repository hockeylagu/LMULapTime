import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DriverRaceStandingsRow } from '../../../src/components/session-detail/standings/DriverRaceStandingsRow.js';
import type { DriverData, LapData, LapTrackLimit } from '../../../shared/types/index.js';
import { makeDetailedSession } from '../../helpers/sessionCardFixture.js';

const session = makeDetailedSession();

const driver = (trackLimits: LapTrackLimit[]): DriverData => ({
  name: 'Driver', carType: 'GT3', carClass: 'GT3', carNumber: '14', teamName: 'Team', isPlayer: true,
  position: 6, classPosition: 6, gridPosition: 13, positionGain: 7, bestLapTime: 106.086, bestLapNumber: 8,
  bestS1: 22.5, bestS2: 37.8, bestS3: 45.4, theoreticalBest: 105.755, declaredLapsCount: 12, laps: [], trackLimits,
});

describe('DriverRaceStandingsRow', () => {
  it('gives the peak and the laps led within the class in a multiclass race', () => {
    const lap = (lapNumber: number, position: number): LapData => ({ lapNumber, position, lapTime: 100, s1: 30, s2: 35, s3: 35,
      topSpeed: 250, fCompound: 'Dry', rCompound: 'Dry', isPitStop: false, isValid: true });
    // Overall P19 at best P15, yet first of the class on lap 2: the only class rival ran behind then.
    const player: DriverData = { ...driver([]), carClass: 'LMP3', position: 19, classPosition: 2, gridPosition: 37, classGridPosition: 3,
      highestPosition: 15, lapsLedCount: 0, laps: [lap(1, 20), lap(2, 15), lap(3, 19)] };
    const rival: DriverData = { ...driver([]), name: 'Rival', carClass: 'LMP3', position: 18, classPosition: 1, laps: [lap(1, 18), lap(2, 16), lap(3, 18)] };
    const hyper: DriverData = { ...driver([]), name: 'Hyper', carClass: 'Hyper', position: 1, classPosition: 1, laps: [lap(1, 1), lap(2, 1), lap(3, 1)] };
    render(<DriverRaceStandingsRow session={makeDetailedSession({ drivers: [player, rival, hyper] })} selectedDriver={player} isMultiClass />);
    expect(screen.getByText('Peak').parentElement).toHaveTextContent('PeakP1best in class');
    expect(screen.getByText('Laps led').parentElement).toHaveTextContent('Laps led1');
  });

  it('counts the track limit events and, apart, the warnings among them (Portimão 2026-10-29)', () => {
    const limit = (action: string): LapTrackLimit => ({ description: action, action });
    render(<DriverRaceStandingsRow session={session} selectedDriver={driver([
      limit('Warning'), ...Array.from({ length: 9 }, () => limit('No Further Action')), limit('Warning'),
    ])} isMultiClass={false} />);
    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getByText('2 warnings')).toBeTruthy();
  });

  it('says one warning in the singular and none without warnings', () => {
    const { rerender } = render(<DriverRaceStandingsRow session={session} selectedDriver={driver([{ description: 'w', action: 'Warning' }])} isMultiClass={false} />);
    expect(screen.getByText('1 warning')).toBeTruthy();
    rerender(<DriverRaceStandingsRow session={session} selectedDriver={driver([{ description: 'n', action: 'No Further Action' }])} isMultiClass={false} />);
    expect(screen.getByText('0 warnings')).toBeTruthy();
  });
});
