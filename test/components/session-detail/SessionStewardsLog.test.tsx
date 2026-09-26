import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionStewardsLog } from '../../../src/components/session-detail/standings/SessionStewardsLog.js';
import { DriverData, LapData, LapTrackLimit } from '../../../server/core/types.js';

const makeTrackLimit = (lapNum: number, elapsedSeconds: number): LapTrackLimit => ({
  description: 'Track limits review (No Further Action)',
  lapNum,
  elapsedSeconds,
  warningPoints: 0,
  currentPoints: 0,
  action: 'No Further Action',
});

const makeLap = (trackLimits: LapTrackLimit[]): LapData => ({
  lapNum: trackLimits[0]?.lapNum ?? 1,
  position: 1,
  lapTime: 120,
  lapTimeString: '2:00.000',
  s1: 40,
  s2: 40,
  s3: 40,
  topSpeed: 250,
  fCompound: 'Soft',
  rCompound: 'Soft',
  elapsedSeconds: trackLimits[0]?.elapsedSeconds ?? 120,
  elapsedTimeString: '2:00.000',
  isPitStop: false,
  isValid: true,
  trackLimits,
  trackLimitCount: trackLimits.length,
});

const makeDriver = (): DriverData => {
  const firstTrackLimit = makeTrackLimit(1, 120.2);
  const secondTrackLimit = makeTrackLimit(2, 240.9);
  return {
    name: 'Selected Driver',
    carType: 'Prototype',
    carClass: 'LMH',
    carNumber: '50',
    teamName: 'Team',
    isPlayer: true,
    position: 1,
    classPosition: 1,
    bestLapTime: 120,
    bestLapTimeString: '2:00.000',
    bestS1: 40,
    bestS2: 40,
    bestS3: 40,
    theoreticalBest: 120,
    theoreticalBestString: '2:00.000',
    lapsCount: 2,
    totalIncidents: 0,
    totalTrackLimits: 2,
    totalPenalties: 0,
    trackLimits: [
      { ...firstTrackLimit },
      { ...secondTrackLimit },
    ],
    laps: [
      makeLap([firstTrackLimit]),
      makeLap([secondTrackLimit]),
    ],
  };
};

describe('SessionStewardsLog', () => {
  it('deduplicates cached lap and driver track-limit records', () => {
    render(
      <SessionStewardsLog
        selectedDriver={makeDriver()}
        showIncidentsLog
        setShowIncidentsLog={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Track limits review (No Further Action)')).toHaveLength(2);
  });

  it('keeps event badges on one line', () => {
    render(
      <SessionStewardsLog
        selectedDriver={makeDriver()}
        showIncidentsLog
        setShowIncidentsLog={vi.fn()}
      />,
    );

    const badges = screen.getAllByText('Track Limit', { exact: true });
    expect(badges).toHaveLength(2);
    badges.forEach((badge) => {
      expect(badge).toHaveClass('inline-flex', 'whitespace-nowrap');
    });
  });
});