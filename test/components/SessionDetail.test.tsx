import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionDetail } from '../../src/components/SessionDetail';

describe('SessionDetail component', () => {
  const mockDetailedSession = {
    id: 'sess123',
    filename: '2026_05_28_P1.xml',
    filePath: 'C:\\LMU\\UserData\\LOG\\Results\\2026_05_28_P1.xml',
    trackVenue: 'Spa',
    trackCourse: 'GP',
    timeString: '2026/05/28 14:00',
    sessionType: 'Practice',
    sessionName: 'P1',
    eventTimeString: '14:00:00',
    eventName: 'Test Event',
    ambientTemp: '24°C',
    trackTemp: '32°C',
    weatherCondition: '☀️ Dry',
    timeOfDayCategory: 'Daytime',
    isNight: false,
    isWet: false,
    driversCount: 2,
    weather: {
      condition: 'Dry' as const,
      timeOfDay: 'Daytime' as const,
      weatherString: '☀️ Dry • Daytime',
    },
    settings: {
      modeSetting: 'Race Weekend',
      damageMultiplier: 50,
      fuelMultiplier: 1,
      tireMultiplier: 1,
      tireWarmers: true,
      fixedSetups: false,
      durationMinutes: 60,
    },
    matchingReplayFile: {
      name: 'spa_replay.vcr',
      path: 'C:\\LMU\\UserData\\Replays\\spa_replay.vcr',
      sizeFormatted: '4.2 MB',
      createdDateFormatted: '2026/05/28 14:30',
    },
    playerDriver: {
      name: 'Sim Driver',
      carType: 'Ferrari 499P',
      carClass: 'LMH',
      carNumber: '50',
      teamName: 'AF Corse',
      isPlayer: true,
      position: 1,
      classPosition: 1,
      bestLapTime: 122.0,
      bestLapTimeString: '2:02.000',
      bestS1: 34.0,
      bestS2: 42.0,
      bestS3: 46.0,
      theoreticalBest: 122.0,
      theoreticalBestString: '2:02.000',
      bestLapPaceCategory: 'Alien' as const,
      bestLapPacePercentage: 100.1,
      avgFuelPerLap: 2.5,
      estFuelStintLaps: 40,
      avgVePerLap: 3.8,
      estVeStintLaps: 26,
      lapsCount: 3,
      laps: [
        {
          lapNum: 1,
          position: 1,
          lapTime: 123.0,
          lapTimeString: '2:03.000',
          s1: 35.0,
          s2: 42.0,
          s3: 46.0,
          topSpeed: 320.0,
          fCompound: 'Hard',
          rCompound: 'Hard',
          tireWear: { fl: 98.0, fr: 98.0, rl: 97.5, rr: 97.5, avg: 97.8 },
          fuel: 97.5,
          fuelUsed: 2.5,
          virtualEnergy: 96.2,
          virtualEnergyUsed: 3.8,
          elapsedSeconds: 123.0,
          elapsedTimeString: '2:03.0',
          isPitStop: false,
          isValid: true,
          paceCategory: 'Good' as const,
          pacePercentage: 102.0,
        },
        {
          lapNum: 2,
          position: 1,
          lapTime: 122.0,
          lapTimeString: '2:02.000',
          s1: 34.0,
          s2: 42.0,
          s3: 46.0,
          topSpeed: 322.0,
          fCompound: 'Hard',
          rCompound: 'Hard',
          tireWear: { fl: 95.0, fr: 94.5, rl: 94.0, rr: 94.0, avg: 94.4 },
          fuel: 95.0,
          fuelUsed: 2.5,
          virtualEnergy: 92.4,
          virtualEnergyUsed: 3.8,
          elapsedSeconds: 245.0,
          elapsedTimeString: '4:05.0',
          isPitStop: false,
          isValid: true,
          paceCategory: 'Competitive' as const,
          pacePercentage: 101.0,
        },
        {
          lapNum: 3,
          position: 1,
          lapTime: 135.0,
          lapTimeString: '2:15.000',
          s1: 36.0,
          s2: 45.0,
          s3: 54.0,
          topSpeed: 290.0,
          fCompound: 'Hard',
          rCompound: 'Hard',
          tireWear: { fl: 92.0, fr: 91.0, rl: 90.5, rr: 90.5, avg: 91.0 },
          fuel: 92.5,
          fuelUsed: 2.5,
          virtualEnergy: 88.6,
          virtualEnergyUsed: 3.8,
          elapsedSeconds: 380.0,
          elapsedTimeString: '6:20.0',
          pitStopDuration: 13.0,
          pitStopDurationString: '+13.0s',
          isPitStop: true,
          isValid: false,
          paceCategory: 'Offline' as const,
          pacePercentage: 112.5,
        },
      ],
    },
    drivers: [
      {
        name: 'Sim Driver',
        carType: 'Ferrari 499P',
        carClass: 'LMH',
        carNumber: '50',
        teamName: 'AF Corse',
        isPlayer: true,
        position: 1,
        classPosition: 1,
        bestLapTime: 122.0,
        bestLapTimeString: '2:02.000',
        bestS1: 34.0,
        bestS2: 42.0,
        bestS3: 46.0,
        theoreticalBest: 122.0,
        theoreticalBestString: '2:02.000',
        avgFuelPerLap: 2.5,
        estFuelStintLaps: 40,
        avgVePerLap: 3.8,
        estVeStintLaps: 26,
        lapsCount: 3,
        laps: [
          {
            lapNum: 1,
            position: 1,
            lapTime: 123.0,
            lapTimeString: '2:03.000',
            s1: 35.0,
            s2: 42.0,
            s3: 46.0,
            topSpeed: 320.0,
            fCompound: 'Hard',
            rCompound: 'Hard',
            tireWear: { fl: 98.0, fr: 98.0, rl: 97.5, rr: 97.5, avg: 97.8 },
            fuel: 97.5,
            fuelUsed: 2.5,
            virtualEnergy: 96.2,
            virtualEnergyUsed: 3.8,
            elapsedSeconds: 123.0,
            elapsedTimeString: '2:03.0',
            isPitStop: false,
            isValid: true,
            paceCategory: 'Good' as const,
            pacePercentage: 102.0,
          },
          {
            lapNum: 2,
            position: 1,
            lapTime: 122.0,
            lapTimeString: '2:02.000',
            s1: 34.0,
            s2: 42.0,
            s3: 46.0,
            topSpeed: 322.0,
            fCompound: 'Hard',
            rCompound: 'Hard',
            tireWear: { fl: 95.0, fr: 94.5, rl: 94.0, rr: 94.0, avg: 94.4 },
            fuel: 95.0,
            fuelUsed: 2.5,
            virtualEnergy: 92.4,
            virtualEnergyUsed: 3.8,
            elapsedSeconds: 245.0,
            elapsedTimeString: '4:05.0',
            isPitStop: false,
            isValid: true,
            paceCategory: 'Competitive' as const,
            pacePercentage: 101.0,
          },
          {
            lapNum: 3,
            position: 1,
            lapTime: 135.0,
            lapTimeString: '2:15.000',
            s1: 36.0,
            s2: 45.0,
            s3: 54.0,
            topSpeed: 290.0,
            fCompound: 'Hard',
            rCompound: 'Hard',
            tireWear: { fl: 92.0, fr: 91.0, rl: 90.5, rr: 90.5, avg: 91.0 },
            fuel: 92.5,
            fuelUsed: 2.5,
            virtualEnergy: 88.6,
            virtualEnergyUsed: 3.8,
            elapsedSeconds: 380.0,
            elapsedTimeString: '6:20.0',
            pitStopDuration: 13.0,
            pitStopDurationString: '+13.0s',
            isPitStop: true,
            isValid: false,
            paceCategory: 'Offline' as const,
            pacePercentage: 112.5,
          },
        ],
      },
      {
        name: 'AI Driver 2',
        carType: 'Porsche 963',
        carClass: 'LMH',
        carNumber: '5',
        teamName: 'Penske',
        isPlayer: false,
        position: 2,
        classPosition: 2,
        bestLapTime: 124.0,
        bestLapTimeString: '2:04.000',
        bestS1: 35.0,
        bestS2: 43.0,
        bestS3: 46.0,
        theoreticalBest: 124.0,
        theoreticalBestString: '2:04.000',
        lapsCount: 1,
        laps: [
          {
            lapNum: 1,
            position: 2,
            lapTime: 124.0,
            lapTimeString: '2:04.000',
            s1: 35.0,
            s2: 43.0,
            s3: 46.0,
            topSpeed: 318.0,
            fCompound: 'Medium',
            rCompound: 'Medium',
            isPitStop: false,
            isValid: true,
            paceCategory: 'Good' as const,
            pacePercentage: 102.8,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailedSession),
    });
  });

  it('renders session telemetry, lap table, and driver stats', async () => {
    const onBack = vi.fn();
    render(<SessionDetail sessionId="sess123" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getAllByText('Spa').length).toBeGreaterThan(0);
      expect(screen.getByText(/Sim Driver/)).toBeInTheDocument();
      expect(screen.getByText(/Lap Timing & Telemetry \(3 Laps\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('2:02.000').length).toBeGreaterThan(0);
    });

    // Metric buttons on telemetry chart
    const sectorsBtn = screen.getByRole('button', { name: /sectors \(s1\/s2\/s3\)/i });
    fireEvent.click(sectorsBtn);

    const topSpeedBtn = screen.getByRole('button', { name: /^top speed$/i });
    fireEvent.click(topSpeedBtn);

    const lapPaceBtn = screen.getByRole('button', { name: /^lap pace$/i });
    fireEvent.click(lapPaceBtn);

    const backBtn = screen.getByRole('button', { name: /back to sessions/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it('allows switching drivers and exporting CSV', async () => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Sim Driver/)).toBeInTheDocument();
    });

    // Switch driver
    const driverSelect = screen.getByRole('combobox');
    fireEvent.change(driverSelect, { target: { value: 'AI Driver 2' } });

    await waitFor(() => {
      expect(screen.getAllByText(/Porsche 963/i).length).toBeGreaterThan(0);
    });

    // Click Export CSV
    const exportBtn = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(exportBtn);
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it('copies replay file path when clicking Copy Path', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy Replay/i })).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Copy Replay/i });
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('C:\\LMU\\UserData\\Replays\\spa_replay.vcr');
  });

  it('navigates to track detail when clicking track heading', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Spa/i })).toBeInTheDocument();
    });

    const trackHeading = screen.getByRole('heading', { level: 2, name: /Spa/i });
    fireEvent.click(trackHeading);
    expect(window.location.hash).toBe('#track/Spa');
  });

  it('opens the full comparison studio when clicking compare buttons', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry \(3 Laps\)/i)).toBeInTheDocument();
    });

    const compareButtons = screen.getAllByRole('button', { name: /Compare/i });
    expect(compareButtons.length).toBeGreaterThan(0);

    // Click compare on first lap
    fireEvent.click(compareButtons[0]);

    // Verify hash changed to full comparison studio with session & lap parameters
    expect(window.location.hash).toContain('compare');
    expect(window.location.hash).toContain('sessionId=sess123');
    expect(window.location.hash).toContain('lapNum=1');

    // Click Open in Comparison Studio in header
    const openStudioBtn = screen.getByRole('button', { name: /Open in Comparison Studio/i });
    fireEvent.click(openStudioBtn);
    expect(window.location.hash).toContain('compare');
    expect(window.location.hash).toContain('sessionId=sess123');
  });

  it('switches to Tire Wear chart metric and displays tire wear in table', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry/i)).toBeInTheDocument();
    });

    // Check that Tire Wear column is rendered in the table
    expect(screen.getByRole('columnheader', { name: /Tire Wear/i })).toBeInTheDocument();
    expect(screen.getByText('97.8%')).toBeInTheDocument();
    expect(screen.getByText('94.4%')).toBeInTheDocument();

    // Click Tire Wear metric toggle
    const tireWearToggle = screen.getByRole('button', { name: /Tire Wear/i });
    fireEvent.click(tireWearToggle);

    expect(screen.getByText(/Tire Wear & Degradation Telemetry/i)).toBeInTheDocument();
  });

  it('renders session rules and server configuration badges', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Rules & Config:/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Race Weekend/i)).toBeInTheDocument();
    expect(screen.getByText(/50%/i)).toBeInTheDocument();
    expect(screen.getByText(/Warm Tires/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Setup/i)).toBeInTheDocument();
    expect(screen.getByText(/60 min/i)).toBeInTheDocument();
  });

  it('switches to Fuel & Energy chart metric and displays stint strategy banner on top of chart', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /Fuel & VE/i })).toBeInTheDocument();
    });

    // Before clicking Fuel & Energy toggle, the fuel estimate is not rendered
    expect(screen.queryByText(/Avg Fuel Usage/i)).not.toBeInTheDocument();

    // Click Fuel & Energy toggle
    const fuelToggle = screen.getByRole('button', { name: /Fuel & Energy/i });
    fireEvent.click(fuelToggle);

    expect(screen.getByText(/Fuel Consumption & Virtual Energy Telemetry/i)).toBeInTheDocument();

    // Check stint strategy summary on top of the chart
    expect(screen.getByText(/Avg Fuel Usage/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2.5%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/~40/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg Virtual Energy/i)).toBeInTheDocument();
    expect(screen.getAllByText(/3.8%/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/~26/i)).toBeInTheDocument();

    // Check Setup Fuel Ratio Optimizer banner
    expect(screen.getByText(/Recommended Setup Fuel Ratio:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0.66/i).length).toBeGreaterThan(0);
  });

  it('renders elapsed session finish times and pit stop duration tooltips in lap table', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry/i)).toBeInTheDocument();
    });

    // Check elapsed finish tooltip on lap cell
    expect(screen.getByTitle('Session Time: 2:03.0')).toBeInTheDocument();

    // Check pit stop badge tooltip
    expect(screen.getByTitle('Estimated pit loss: +13.0s')).toBeInTheDocument();
  });

  it('disables chart buttons and hides table columns when tire wear and fuel data are missing', async () => {
    const driverWithoutData = {
      ...mockDetailedSession.drivers[0],
      avgFuelPerLap: null,
      estFuelStintLaps: null,
      avgVePerLap: null,
      estVeStintLaps: null,
      laps: [
        {
          lapNum: 1,
          position: 1,
          lapTime: 122.0,
          lapTimeString: '2:02.000',
          s1: 34.0,
          s2: 42.0,
          s3: 46.0,
          topSpeed: 322.0,
          fCompound: 'Hard',
          rCompound: 'Hard',
          tireWear: undefined,
          fuel: null,
          fuelUsed: null,
          virtualEnergy: null,
          virtualEnergyUsed: null,
          isPitStop: false,
          isValid: true,
        },
      ],
    };

    const sessionWithoutData = {
      ...mockDetailedSession,
      playerDriver: driverWithoutData,
      drivers: [driverWithoutData],
    };

    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/session/sess123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sessionWithoutData),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Lap Timing & Telemetry/i)).toBeInTheDocument();
    });

    // Stint strategy card should NOT be rendered
    expect(screen.queryByText(/Avg Fuel Usage/i)).not.toBeInTheDocument();

    // Chart buttons for Tire Wear and Fuel should be disabled
    const tireWearBtn = screen.getByRole('button', { name: /Tire Wear/i });
    const fuelBtn = screen.getByRole('button', { name: /^Fuel/i });
    expect(tireWearBtn).toBeDisabled();
    expect(fuelBtn).toBeDisabled();

    // Columns should NOT be rendered in table
    expect(screen.queryByRole('columnheader', { name: /Tire Wear/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Fuel/i })).not.toBeInTheDocument();
  });
});
