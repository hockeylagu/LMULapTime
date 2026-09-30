import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DetailedSession, DriverData } from '../../../server/core/types.js';
import { SessionLapTable } from '../../../src/components/session-detail/table/SessionLapTable.js';
import { mockDetailedSession } from './mockSessionDetail.js';
import * as lapPositions from '../../../shared/domain/lapPlaces.js';

describe('SessionLapTable optimal delta', () => {
  it('reuses rank calculations on sort and expansion, and refreshes them for changed session data', () => {
    const ranks = vi.spyOn(lapPositions, 'lapClassPositions');
    const session = mockDetailedSession as unknown as DetailedSession;
    const driver = session.playerDriver;
    const view = (data: DetailedSession) => <SessionLapTable session={data} selectedDriver={driver} isMultiClass
      hasTireWearData={false} hasFuelData={false} hasVirtualEnergyData={false} isCurrentSessionAllTimePB={false} />;
    const { rerender } = render(view(session));
    const initialCalls = ranks.mock.calls.length;
    fireEvent.click(screen.getByTitle('Sort by Pos'));
    fireEvent.click(screen.getByRole('button', { name: 'Show what happened on lap 3' }));
    expect(ranks).toHaveBeenCalledTimes(initialCalls);
    rerender(view({ ...session, drivers: [...session.drivers] }));
    expect(ranks.mock.calls.length).toBeGreaterThan(initialCalls);
    ranks.mockRestore();
  });
  it('sorts multiclass laps by the class position shown rather than overall position', () => {
    const base = mockDetailedSession.playerDriver;
    const selectedDriver = { ...base, carClass: 'LMGT3', laps: [
      { ...base.laps[0], lapNum: 1, position: 11 },
      { ...base.laps[1], lapNum: 2, position: 12 },
    ] } as unknown as DriverData;
    const rival = { ...selectedDriver, name: 'GT3 rival', laps: [
      { ...selectedDriver.laps[0], position: 10 },
      { ...selectedDriver.laps[1], position: 20 },
    ] };
    const session = { ...mockDetailedSession, drivers: [selectedDriver, rival] } as unknown as DetailedSession;
    render(<SessionLapTable session={session} selectedDriver={selectedDriver} isMultiClass
      hasTireWearData={false} hasFuelData={false} hasVirtualEnergyData={false} isCurrentSessionAllTimePB={false} />);
    fireEvent.click(screen.getByTitle('Sort by Pos'));
    expect(screen.getAllByTitle(/Click to open telemetry for Lap/).map(row => row.getAttribute('title'))).toEqual([
      'Click to open telemetry for Lap 2', 'Click to open telemetry for Lap 1',
    ]);
  });
  it('keeps the optimal gap visible on the best lap, sorts it, and spans the resource columns in details', () => {
    const selectedDriver = { ...mockDetailedSession.playerDriver, theoreticalBest: 121 } as unknown as DriverData;
    const session = { ...mockDetailedSession, playerDriver: selectedDriver } as unknown as DetailedSession;
    const { rerender } = render(
      <SessionLapTable session={session} selectedDriver={selectedDriver} isMultiClass={false}
        hasTireWearData hasFuelData hasVirtualEnergyData isCurrentSessionAllTimePB={false} />
    );
    const bestRow = screen.getByTitle('Click to open telemetry for Lap 2');
    expect(within(bestRow).getByText('Session best')).toBeInTheDocument();
    expect(within(bestRow).getByText('+1.000s')).toBeInTheDocument();
    expect(within(bestRow).getAllByRole('cell')).toHaveLength(14);

    fireEvent.click(screen.getByTitle('Sort by Δ vs optimal'));
    expect(screen.getAllByTitle(/Click to open telemetry for Lap/).map(row => row.getAttribute('title'))).toEqual([
      'Click to open telemetry for Lap 2',
      'Click to open telemetry for Lap 1',
      'Click to open telemetry for Lap 3',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Show what happened on lap 3' }));
    expect(screen.getByTestId('lap-details-3').querySelector('td')).toHaveAttribute('colspan', '14');

    rerender(
      <SessionLapTable session={session} selectedDriver={selectedDriver} isMultiClass={false}
        hasTireWearData hasFuelData hasVirtualEnergyData isCurrentSessionAllTimePB />
    );
    expect(within(bestRow).getByText('Personal best')).toBeInTheDocument();
    expect(within(bestRow).getByText('+1.000s')).toBeInTheDocument();
  });
});

describe('SessionLapTable inferred timing', () => {
  it('marks the elapsed-time estimate from the parser and sorts unavailable laps last', () => {
    const selectedDriver = {
      ...mockDetailedSession.playerDriver,
      bestLapTime: 100,
      laps: [
        { ...mockDetailedSession.playerDriver.laps[0], lapNum: 1, lapTime: 110, lapTimeString: '1:50.000', elapsedSeconds: 110 },
        {
          ...mockDetailedSession.playerDriver.laps[1], lapNum: 2, lapTime: 103, lapTimeString: '1:43.000',
          elapsedSeconds: 213, s1: 30, s2: 34, s3: 39, isInferred: true,
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

describe('SessionLapTable traffic', () => {
  it('shows who the driver met on track, and why a lap is left out of the pace', () => {
    const gt3 = { name: 'Rui Paiva', carClass: 'GT3', sameClass: false };
    const selectedDriver = {
      ...mockDetailedSession.playerDriver,
      laps: [
        { ...mockDetailedSession.playerDriver.laps[0], lapNum: 1 },
        {
          ...mockDetailedSession.playerDriver.laps[1], lapNum: 2, nonRepresentativeReason: 'traffic',
          traffic: { ahead: { car: gt3, gapSec: 2 }, behind: null, following: false, passed: [gt3], passedBy: [] },
        },
      ],
    } as unknown as DriverData;
    const session = { ...mockDetailedSession, playerDriver: selectedDriver, drivers: [selectedDriver] } as unknown as DetailedSession;

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

    // The status column only carries icons; the reason is in the icon's tooltip.
    expect(screen.getByText('Traffic').closest('[title]')?.getAttribute('title')).toBe('Slower than your median lap while in multiclass traffic: left out of the average and consistency');
    expect(screen.queryByTestId('lap-details-2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show what happened on lap 1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show what happened on lap 2' }));

    const details = screen.getByTestId('lap-details-2');
    expect(details).toHaveTextContent('Left out of average');
    expect(details).toHaveTextContent('Around youOther classes: passed Rui Paiva (GT3)');
    expect(details).not.toHaveTextContent('start of the lap');
    // Expanding does not open the telemetry.
    expect(window.location.hash).not.toContain('telemetry');

    fireEvent.click(screen.getByRole('button', { name: 'Hide what happened on lap 2' }));
    expect(screen.queryByTestId('lap-details-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show lap details/ }));
    expect(screen.getByTestId('lap-details-2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hide lap details/ })).toBeInTheDocument();
  });

  it('marks rain and wet tyres on the laps that had them, and nothing on a dry lap', () => {
    const selectedDriver = {
      ...mockDetailedSession.playerDriver,
      laps: [
        { ...mockDetailedSession.playerDriver.laps[0], lapNum: 1 },
        { ...mockDetailedSession.playerDriver.laps[1], lapNum: 2, conditions: { wetTyres: true, rain: 18 } },
      ],
    } as unknown as DriverData;
    const session = { ...mockDetailedSession, playerDriver: selectedDriver, drivers: [selectedDriver] } as unknown as DetailedSession;

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

    expect(screen.getAllByText('Rain')).toHaveLength(1);
    expect(screen.getByText('Rain').closest('[title]')?.getAttribute('title')).toBe('Rain 18/25: judged against your other laps in the same conditions');
    expect(screen.getAllByText('Wet tyres')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Show what happened on lap 2' }));

    expect(screen.getByTestId('lap-details-2')).toHaveTextContent('ConditionsRain 18/25 · On wet tyres: judged against your other laps in the same conditions');
  });
});
