import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionDetail } from '../../src/components/SessionDetail';

describe('SessionDetail component', () => {
  const mockDetailedSession = {
    id: 'sess123',
    filename: '2026_05_28_P1.xml',
    filePath: 'C:\\Results\\2026_05_28_P1.xml',
    trackVenue: 'Spa',
    trackCourse: 'GP',
    trackEvent: 'Test Event',
    trackLengthMeters: 7004,
    timeString: '2026/05/28 14:00',
    timestamp: 1780000000000,
    sessionType: 'Practice' as const,
    sessionName: 'P1',
    weatherInfo: '☀️ Dry • Daytime',
    driversCount: 2,
    matchingReplayFile: { name: 'spa_replay.vcr', path: 'C:\\Replays\\spa_replay.vcr', sizeBytes: 1024 },
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
      bestLapPaceCategory: 'Competitive' as const,
      bestLapPacePercentage: 101.0,
      lapsCount: 2,
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
        lapsCount: 2,
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
        ],
      },
    ],
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/session/')) {
        return Promise.resolve({ json: () => Promise.resolve(mockDetailedSession) });
      }
      if (url.includes('/api/reference-laptimes')) {
        return Promise.resolve({ json: () => Promise.resolve({ entries: {} }) });
      }
      if (url.includes('/api/progression')) {
        return Promise.resolve({ json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });
  });

  it('renders session telemetry, lap table, and driver stats', async () => {
    const onBack = vi.fn();
    render(<SessionDetail sessionId="sess123" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getAllByText('Spa').length).toBeGreaterThan(0);
      expect(screen.getByText(/Sim Driver/)).toBeInTheDocument();
      expect(screen.getByText('Lap Telemetry Table (2 Laps)')).toBeInTheDocument();
      expect(screen.getAllByText('2:02.000').length).toBeGreaterThan(0);
    });

    const backBtn = screen.getByRole('button', { name: /back to sessions/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it('copies replay file path when clicking Copy Path', async () => {
    const writeTextMock = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Matching Replay/i)).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /copy path/i });
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('C:\\Replays\\spa_replay.vcr');
  });
});
