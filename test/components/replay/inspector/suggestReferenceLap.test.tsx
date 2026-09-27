import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { suggestReferenceLap } from '../../../../src/components/replay/inspector/suggestReferenceLap.js';
import { ReplayCompareButton } from '../../../../src/components/replay/inspector/ReplayCompareButton.js';
import type { ComparableLap, ReplayTrajectoryData } from '../../../../shared/types/index.js';

const RACE = 'Daytona International Speedway Road Course R1 10.Vcr';
const PRACTICE = 'Daytona International Speedway Road Course P1 20.Vcr';
const QUALI = 'Daytona International Speedway Road Course Q1 9.Vcr';
const ME = 'Samuel Lague';

function lap(replay: string, lapNum: number, lapTime: number, extra: Partial<ComparableLap> = {}): ComparableLap {
  return {
    id: `${replay}_${lapNum}`,
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

describe('suggestReferenceLap', () => {
  it('suggests the driver fastest lap in the same car when it beats the lap on screen', () => {
    expect(suggestReferenceLap(laps, RACE, ME, 20, 95.894)?.id).toBe(`${PRACTICE}_24`);
  });

  it('suggests nothing when the lap on screen is already the best', () => {
    expect(suggestReferenceLap(laps, PRACTICE, ME, 24, 95.658)).toBeNull();
  });

  it('skips laps the parser marked non-representative', () => {
    const marked = laps.map(l => (l.id === `${PRACTICE}_24` ? { ...l, nonRepresentativeReason: 'offPace' as const } : l));
    expect(suggestReferenceLap(marked, RACE, ME, 20, 95.894)?.id).toBe(`${QUALI}_7`);
  });

  it('suggests nothing for a driver without laps in this replay', () => {
    expect(suggestReferenceLap(laps, RACE, 'Alexandr Malynych', 20, 95.746)).toBeNull();
  });
});

describe('ReplayCompareButton', () => {
  it('compares with the suggested lap in one click', () => {
    const onSelectCompareLap = vi.fn();
    const trajectory = { currentLap: 20, laps: [{ lapNumber: 20, lapTimeSec: 95.9, validatedTimeSec: 95.894 }] } as unknown as ReplayTrajectoryData;

    render(
      <ReplayCompareButton
        replayName={RACE}
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
