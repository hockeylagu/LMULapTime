import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplayCompareButton } from '../../../../../src/components/replay/inspector/compare/ReplayCompareButton.js';
import type { ComparableLap, ReplayTrajectoryData } from '../../../../../shared/types/index.js';

const RACE = 'Daytona International Speedway Road Course R1 10.Vcr';
const PRACTICE = 'Daytona International Speedway Road Course P1 20.Vcr';
const QUALI = 'Daytona International Speedway Road Course Q1 9.Vcr';
const ME = 'Samuel Lague';

function lap(replay: string, lapNum: number, lapTime: number, extra: Partial<ComparableLap> = {}): ComparableLap {
  return {
    id: `${replay}_${lapNum}`,
    sessionId: replay,
    driverName: ME,
    carType: 'Peugeot 9x8',
    carClass: 'Hyper',
    lapNum,
    lapTime,
    lapTimeString: '',
    s1: null,
    s2: null,
    s3: null,
    topSpeed: null,
    isValid: true,
    matchingReplayFile: replay,
    ...extra,
  } as ComparableLap;
}

const laps = [
  lap(RACE, 20, 95.894),
  lap(RACE, 16, 95.961),
  lap(QUALI, 7, 95.683),
  lap(PRACTICE, 24, 95.658),
  // Faster, but in another car at this track: never the suggestion.
  lap(PRACTICE, 3, 94.9, { carType: 'Porsche 963' }),
];

describe('ReplayCompareButton', () => {
  it('compares with the suggested lap in one click', () => {
    const onSelectCompareLap = vi.fn();
    const trajectory = { currentLap: 20, laps: [{ lapNumber: 20, lapTimeSec: 95.9, validatedTimeSec: 95.894 }] } as unknown as ReplayTrajectoryData;

    render(
      <ReplayCompareButton
        sessionId={RACE}
        driverName={ME}
        trajectory={trajectory}
        availableCompareLaps={laps}
        onToggleCompare={vi.fn()}
        onSelectCompareLap={onSelectCompareLap}
        formatLapTime={(sec) => (sec ? sec.toFixed(3) : '')}
      />
    );

    fireEvent.click(screen.getByText('vs your best 95.658'));
    expect(onSelectCompareLap).toHaveBeenCalledWith(expect.objectContaining({ lapNum: 24, matchingReplayFile: PRACTICE }));
  });
});
