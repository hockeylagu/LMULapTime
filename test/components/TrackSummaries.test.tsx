import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrackSummaries } from '../../src/components/TrackSummaries';

describe('TrackSummaries component', () => {
  const mockTracksMap = {
    'Spa': {
      trackVenue: 'Spa',
      sessionsCount: 5,
      totalLaps: 25,
      bestLapTime: 122.5,
      bestLapDriver: 'Player',
      bestLapCar: 'Ferrari 499P',
      bestS1: 35.1,
      bestS2: 42.2,
      bestS3: 45.2,
      theoreticalBest: 122.5,
      carsUsed: ['Ferrari 499P'],
    },
    'Monza': {
      trackVenue: 'Monza',
      sessionsCount: 3,
      totalLaps: 18,
      bestLapTime: 108.0,
      bestLapDriver: 'Player',
      bestLapCar: 'Porsche 911 GT3',
      bestS1: 28.0,
      bestS2: 38.0,
      bestS3: 42.0,
      theoreticalBest: 108.0,
      carsUsed: ['Porsche 911 GT3'],
    },
  };

  const mockSessions = [
    {
      id: 'sess1',
      filename: 'sess1.xml',
      trackVenue: 'Spa',
      timeString: '2026/05/28 14:00',
      sessionType: 'Practice' as const,
      sessionName: 'P1',
      driversCount: 1,
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 499P',
        carClass: 'LMH',
        bestLapTime: 122.5,
        bestLapTimeString: '2:02.500',
        bestS1: 35.1,
        bestS2: 42.2,
        bestS3: 45.2,
        lapsCount: 5,
      },
    },
    {
      id: 'sess2',
      filename: 'sess2.xml',
      trackVenue: 'Monza',
      timeString: '2026/05/29 16:00',
      sessionType: 'Qualifying' as const,
      sessionName: 'Q1',
      driversCount: 1,
      playerDriver: {
        name: 'Player',
        carType: 'Porsche 911 GT3',
        carClass: 'LMGT3',
        bestLapTime: 108.0,
        bestLapTimeString: '1:48.000',
        bestS1: 28.0,
        bestS2: 38.0,
        bestS3: 42.0,
        lapsCount: 3,
      },
    },
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ entries: {} }),
    });
  });

  it('renders track cards and allows selecting a track', () => {
    const onSelectTrack = vi.fn();
    const setSelectedCarClass = vi.fn();

    render(
      <TrackSummaries
        sessions={mockSessions}
        tracksMap={mockTracksMap}
        onSelectTrack={onSelectTrack}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    expect(screen.getByText(/Track Records & Benchmarks/)).toBeInTheDocument();
    expect(screen.getByText('Spa')).toBeInTheDocument();
    expect(screen.getByText('Monza')).toBeInTheDocument();

    const spaCard = screen.getByText('Spa');
    fireEvent.click(spaCard);
    expect(onSelectTrack).toHaveBeenCalledWith('Spa');
  });

  it('filters by car class and sorts tracks', () => {
    const setSelectedCarClass = vi.fn();

    render(
      <TrackSummaries
        sessions={mockSessions}
        tracksMap={mockTracksMap}
        onSelectTrack={vi.fn()}
        selectedCarClass="LMGT3"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    const hypercarBtn = screen.getByRole('button', { name: /Hypercar/i });
    fireEvent.click(hypercarBtn);
    expect(setSelectedCarClass).toHaveBeenCalledWith('LMH');
  });
});
