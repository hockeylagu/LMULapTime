import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DriverRaceStandingsRow } from '../../../src/components/session-detail/standings/DriverRaceStandingsRow.js';
import type { DriverData, LapTrackLimit } from '../../../shared/types/index.js';

const driver = (trackLimits: LapTrackLimit[]): DriverData => ({
  name: 'Driver', carType: 'GT3', carClass: 'GT3', carNumber: '14', teamName: 'Team', isPlayer: true,
  position: 6, classPosition: 6, gridPosition: 13, positionGain: 7, bestLapTime: 106.086, bestLapNumber: 8,
  bestS1: 22.5, bestS2: 37.8, bestS3: 45.4, theoreticalBest: 105.755, declaredLapsCount: 12, laps: [], trackLimits,
});

describe('DriverRaceStandingsRow', () => {
  it('counts the track limit events and, apart, the warnings among them (Portimão 2026-10-29)', () => {
    const limit = (action: string): LapTrackLimit => ({ description: action, action });
    render(<DriverRaceStandingsRow selectedDriver={driver([
      limit('Warning'), ...Array.from({ length: 9 }, () => limit('No Further Action')), limit('Warning'),
    ])} isMultiClass={false} />);
    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getByText('2 warnings')).toBeTruthy();
  });

  it('says one warning in the singular and none without warnings', () => {
    const { rerender } = render(<DriverRaceStandingsRow selectedDriver={driver([{ description: 'w', action: 'Warning' }])} isMultiClass={false} />);
    expect(screen.getByText('1 warning')).toBeTruthy();
    rerender(<DriverRaceStandingsRow selectedDriver={driver([{ description: 'n', action: 'No Further Action' }])} isMultiClass={false} />);
    expect(screen.getByText('0 warnings')).toBeTruthy();
  });
});
