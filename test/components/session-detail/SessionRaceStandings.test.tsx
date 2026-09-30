import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionRaceStandings } from '../../../src/components/session-detail/standings/SessionRaceStandings.js';
import { DetailedSession, DriverData, LapData } from '../../../server/core/types.js';

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
  it('leads with class position for both GT3 and Hypercar, keeping overall secondary', () => {
    const drivers = [
      makeDriver({ name: 'Hypercar driver', carClass: 'LMH', position: 2, classPosition: 2 }),
      makeDriver({ name: 'GT3 driver', carClass: 'LMGT3', position: 12, classPosition: 1 }),
    ];
    render(<SessionRaceStandings session={makeSession(drivers)} selectedDriverName="GT3 driver"
      setSelectedDriverName={vi.fn()} isMultiClass />);
    for (const driver of drivers) {
      const row = screen.getByText(driver.name).closest('tr')!;
      const position = within(row).getAllByRole('cell')[0];
      expect(within(position).getByText(`P${driver.classPosition}`, { exact: true })).toHaveClass('text-sm', 'font-bold', 'text-white');
      if (driver.classPosition !== driver.position) {
        expect(within(position).getByText(`(P${driver.position})`)).toHaveClass('text-[11px]', 'font-normal', 'text-lmu-muted');
        expect(within(position).getByLabelText(`P${driver.position} overall`)).toBeInTheDocument();
      } else {
        expect(within(position).queryByText(`(P${driver.position})`)).not.toBeInTheDocument();
      }
      expect(row).toHaveAccessibleName(expect.stringContaining(`P${driver.classPosition} in ${driver.carClass}`));
    }
  });
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

  it('shows all safety signals together, including cleared limits when a penalty exists', () => {
    const driver = makeDriver({ name: 'Alpha', totalIncidents: 2, totalTrackLimits: 3, totalPenalties: 1,
      trackLimits: [{ description: 'No Further Action', warningPoints: 0 }] });
    render(
      <SessionRaceStandings session={makeSession([driver, makeDriver({ name: 'Bravo', position: 2 })])}
        selectedDriverName="Alpha" setSelectedDriverName={vi.fn()} isMultiClass={false} />,
    );
    const row = screen.getByRole('row', { name: 'P1 Alpha: show their laps' });
    expect(within(row).getByRole('img', { name: '2 contacts / incidents' })).toHaveClass('text-lmu-warn-soft');
    expect(within(row).getByRole('img', { name: '3 track limits, cleared' })).toHaveClass('text-lmu-text-soft');
    expect(within(row).getByRole('img', { name: '1 penalty' })).toHaveClass('text-lmu-loss-soft');
    expect(row.querySelector('[title*="Contacts / Incidents"]')).toHaveAttribute('title', expect.stringContaining('No Further Action'));
  });

  it('uses the existing warning and serious track-limit severity instead of the count', () => {
    const warning = makeDriver({ name: 'Warning', totalTrackLimits: 12,
      trackLimits: [{ description: 'Track limit warning', warningPoints: 0.25 }] });
    const serious = makeDriver({ name: 'Serious', position: 2, totalTrackLimits: 1,
      trackLimits: [{ description: 'Track limit violation', warningPoints: 0.75 }] });
    render(
      <SessionRaceStandings session={makeSession([warning, serious])} selectedDriverName=""
        setSelectedDriverName={vi.fn()} isMultiClass={false} />,
    );
    expect(screen.getByRole('img', { name: '12 track limits, warning' })).toHaveClass('text-lmu-warn-soft');
    expect(screen.getByRole('img', { name: '1 track limits, serious' })).toHaveClass('text-lmu-loss-soft');
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
describe('SessionRaceStandings outside a race', () => {
  const qualifying = (drivers: DriverData[]): DetailedSession => ({ ...makeSession(drivers), sessionType: 'Qualifying', sessionName: 'Q1' });

  it('drops the grid gain and shows the gap of the best lap', () => {
    render(
      <SessionRaceStandings
        session={qualifying([
          makeDriver({ name: 'Alpha', bestLapTime: 100 }),
          makeDriver({ name: 'Bravo', position: 2, classPosition: 2, bestLapTime: 100.456 }),
        ])}
        selectedDriverName=""
        setSelectedDriverName={vi.fn()}
        isMultiClass={false}
      />,
    );

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim());
    expect(headers).not.toContain('+/-');
    expect(headers.slice(-2)).toEqual(['Gap', 'Safety']);
    expect(screen.getByText('Fastest')).toBeInTheDocument();
    expect(screen.getByText('+0.456s')).toBeInTheDocument();
    expect(screen.queryByText(/Finishing order/)).not.toBeInTheDocument();
  });

  it('selects a driver from the keyboard', () => {
    const select = vi.fn();
    render(
      <SessionRaceStandings
        session={qualifying([makeDriver({ name: 'Alpha' }), makeDriver({ name: 'Bravo', position: 2 })])}
        selectedDriverName="Alpha"
        setSelectedDriverName={select}
        isMultiClass={false}
      />,
    );

    const bravo = screen.getByText('Bravo').closest('tr') as HTMLElement;
    expect(bravo).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(bravo, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith('Bravo');
    expect(screen.getByText('Alpha').closest('tr')).toHaveAttribute('aria-current', 'true');
  });
});
