import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionRaceStandings } from '../../src/components/session-detail/standings/SessionRaceStandings.js';
import { DetailedSession, DriverData, LapData } from '../../server/core/types.js';

const makeLap = (overrides: Partial<LapData> = {}): LapData => ({
  lapNum: 1,
  position: 1,
  lapTime: 100,
  lapTimeString: '1:40.000',
  s1: 30,
  s2: 35,
  s3: 35,
  topSpeed: 250,
  fCompound: 'Soft',
  rCompound: 'Soft',
  elapsedSeconds: 100,
  elapsedTimeString: '1:40.000',
  isPitStop: false,
  isValid: true,
  ...overrides,
});

const makeDriver = (overrides: Partial<DriverData> = {}): DriverData => ({
  name: 'Driver',
  carType: 'Prototype',
  carClass: 'LMH',
  carNumber: '1',
  teamName: 'Team',
  isPlayer: false,
  position: 1,
  classPosition: 1,
  bestLapTime: 100,
  bestLapTimeString: '1:40.000',
  bestLapNum: 1,
  bestS1: 30,
  bestS2: 35,
  bestS3: 35,
  theoreticalBest: 100,
  theoreticalBestString: '1:40.000',
  lapsCount: 1,
  laps: [makeLap()],
  ...overrides,
});

const makeSession = (drivers: DriverData[]): DetailedSession => ({
  id: 'standings-test',
  filename: 'standings.xml',
  filePath: 'C:\\LMU\\standings.xml',
  trackVenue: 'Spa',
  trackCourse: 'GP',
  trackEvent: 'Test Event',
  trackLengthMeters: 7004,
  timeString: '2026/09/15 14:00',
  timestamp: 0,
  sessionType: 'Race',
  sessionName: 'R1',
  driversCount: drivers.length,
  drivers,
});

const getDriverRows = () => screen.getAllByRole('row').slice(1);

describe('SessionRaceStandings', () => {
  it('uses the site accent at 15% opacity for the selected driver row', () => {
    const selectedDriver = makeDriver({ name: 'Selected Driver', carNumber: '50' });
    const otherDriver = makeDriver({ name: 'Other Driver', position: 2, classPosition: 2, carNumber: '5' });

    render(
      <SessionRaceStandings
        session={makeSession([selectedDriver, otherDriver])}
        selectedDriverName="Selected Driver"
        setSelectedDriverName={vi.fn()}
        isMultiClass={false}
      />,
    );

    expect(screen.getByText('Selected Driver').closest('tr')).toHaveClass('bg-lmu-accent/15', 'border-l-lmu-accent');
    expect(screen.getByText('Other Driver').closest('tr')).not.toHaveClass('bg-lmu-accent/15');
  });

  it('renders Safety as the final column after Time', () => {
    render(
      <SessionRaceStandings
        session={makeSession([makeDriver({ name: 'Alpha' }), makeDriver({ name: 'Bravo', position: 2 })])}
        selectedDriverName=""
        setSelectedDriverName={vi.fn()}
        isMultiClass={false}
      />,
    );

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim());
    expect(headers.slice(-2)).toEqual(['Time', 'Safety']);
  });

  it('sorts by car number and only shows the direction icon on the active column', () => {
    const drivers = [
      makeDriver({ name: 'Alpha', position: 1, carNumber: '50', bestLapTime: 100 }),
      makeDriver({ name: 'Bravo', position: 2, classPosition: 2, carNumber: '5', bestLapTime: 101 }),
      makeDriver({ name: 'Charlie', position: 3, classPosition: 3, carNumber: '20', bestLapTime: 102 }),
    ];

    render(
      <SessionRaceStandings
        session={makeSession(drivers)}
        selectedDriverName=""
        setSelectedDriverName={vi.fn()}
        isMultiClass={false}
      />,
    );

    const positionButton = screen.getByTitle('Sort by Pos');
    const numberButton = screen.getByTitle('Sort by #');
    expect(positionButton.querySelector('svg')).not.toBeNull();
    expect(numberButton.querySelector('svg')).toBeNull();

    fireEvent.click(numberButton);

    const rowText = getDriverRows().map((row) => row.textContent);
    expect(rowText[0]).toContain('Bravo');
    expect(rowText[1]).toContain('Charlie');
    expect(rowText[2]).toContain('Alpha');
    expect(positionButton.querySelector('svg')).toBeNull();
    expect(numberButton.querySelector('svg')).not.toBeNull();
  });
});