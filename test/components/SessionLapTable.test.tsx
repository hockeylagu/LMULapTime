import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DetailedSession, DriverData } from '../../server/core/types.js';
import { SessionLapTable } from '../../src/components/session-detail/table/SessionLapTable.js';
import { mockDetailedSession } from './mockSessionDetail.js';

describe('SessionLapTable inferred timing', () => {
  it('displays a valid elapsed-time estimate and sorts unavailable laps last', () => {
    const selectedDriver = {
      ...mockDetailedSession.playerDriver,
      bestLapTime: 100,
      laps: [
        { ...mockDetailedSession.playerDriver.laps[0], lapNum: 1, lapTime: 110, lapTimeString: '1:50.000', elapsedSeconds: 110 },
        {
          ...mockDetailedSession.playerDriver.laps[1], lapNum: 2, lapTime: null, lapTimeString: '--:--.---',
          elapsedSeconds: 213, s1: 30, s2: 34, s3: 39, isInferred: false,
        },
        { ...mockDetailedSession.playerDriver.laps[2], lapNum: 3, lapTime: null, lapTimeString: '--:--.---', elapsedSeconds: null },
      ],
    } as unknown as DriverData;
    const session = {
      ...mockDetailedSession,
      playerDriver: selectedDriver,
      drivers: [selectedDriver],
    } as unknown as DetailedSession;

    render(
      <SessionLapTable
        session={session}
        selectedDriver={selectedDriver}
        isMultiClass={false}
        hasTireWearData={false}
        hasFuelData={false}
        hasVirtualEnergyData={false}
        isCurrentSessionAllTimePB={false}
      />
    );

    expect(screen.getByText('~1:43.000')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Sort by Lap Time'));

    expect(screen.getAllByTitle(/Click to open telemetry for Lap/).map(row => row.getAttribute('title'))).toEqual([
      'Click to open telemetry for Lap 2',
      'Click to open telemetry for Lap 1',
      'Click to open telemetry for Lap 3',
    ]);
  });
});