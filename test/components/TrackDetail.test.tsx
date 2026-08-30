import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrackDetail } from '../../src/components/TrackDetail';

describe('TrackDetail component', () => {
  const mockTrackData = {
    trackName: 'Spa',
    normalizedTrackName: 'Spa',
    sessionsCount: 2,
    sessions: [
      {
        id: 'sess1',
        filename: 'sess1.xml',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        timeString: '2026/05/28 14:00',
        sessionType: 'Practice',
        sessionName: 'P1',
        driversCount: 1,
        matchingReplayFile: { name: 'spa_p1.vcr', path: 'C:\\spa_p1.vcr' },
        playerDriver: {
          name: 'Player',
          carType: 'Ferrari 499P',
          carClass: 'LMH',
          bestLapTime: 122.0,
          bestLapTimeString: '2:02.000',
          bestS1: 35.0,
          bestS2: 42.0,
          bestS3: 45.0,
          theoreticalBest: 122.0,
          bestLapPaceCategory: 'Alien' as const,
          bestLapPacePercentage: 100.1,
          lapsCount: 5,
        },
      },
    ],
    benchmarks: [
      {
        key: 'spa_lmh',
        trackName: 'Spa',
        carClass: 'LMH',
        patch: '1.4+',
        target100Sec: 120.0,
        targets: {
          alienSec: 120.0,
          competitiveSec: 121.2,
          goodSec: 122.4,
          goodMidpackSec: 123.6,
          midpackSec: 124.8,
          midpackTailSec: 126.0,
          tailEnderSec: 127.2,
          offlineSec: 128.4,
        },
      },
    ],
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockTrackData),
    });
  });

  it('renders benchmark targets and sessions list', async () => {
    const onBack = vi.fn();
    const onSelectSession = vi.fn();
    const setSelectedCarClass = vi.fn();

    render(
      <TrackDetail
        trackName="Spa"
        onBack={onBack}
        onSelectSession={onSelectSession}
        selectedCarClass="LMH"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Spa' })).toBeInTheDocument();
      expect(screen.getByText('Appropriate Reference Lap Times')).toBeInTheDocument();
      expect(screen.getAllByText('Ferrari 499P').length).toBeGreaterThan(0);
    });

    const sessionCard = screen.getByText('2026/05/28 14:00').closest('div.glass-panel');
    expect(sessionCard).not.toBeNull();
    if (sessionCard) {
      fireEvent.click(sessionCard);
      expect(onSelectSession).toHaveBeenCalledWith('sess1');
    }
  });

  it('handles back button click', async () => {
    const onBack = vi.fn();
    render(
      <TrackDetail
        trackName="Spa"
        onBack={onBack}
        onSelectSession={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Back to Tracks')).toBeInTheDocument();
    });

    const backBtn = screen.getByRole('button', { name: /back to tracks/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });
});
