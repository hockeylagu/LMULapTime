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
      expect(screen.getByText('spa_replay.vcr')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /copy path/i });
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
});
