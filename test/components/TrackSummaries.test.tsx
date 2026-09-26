import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrackSummaries, TrackSessionSummary } from '../../src/components/track-summaries/index.js';

describe('TrackSummaries component', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );
  });

  const mockSessions: TrackSessionSummary[] = [
    {
      id: 'spa-sess',
      trackVenue: 'Spa',
      timeString: '2026/05/28 14:00',
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 499P',
        carClass: 'LMH',
        bestLapTime: 122.0,
        bestLapTimeString: '2:02.000',
        bestS1: 34.0,
        bestS2: 42.0,
        bestS3: 46.0,
        lapsCount: 15,
      },
    },
    {
      id: 'monza-sess',
      trackVenue: 'Monza',
      timeString: '2026/05/27 14:00',
      playerDriver: {
        name: 'Player',
        carType: 'Porsche 911 GT3',
        carClass: 'LMGT3',
        bestLapTime: 108.0,
        bestLapTimeString: '1:48.000',
        bestS1: 28.0,
        bestS2: 38.0,
        bestS3: 42.0,
        lapsCount: 5,
      },
    },
  ];

  it('renders track cards and allows selecting a track', async () => {
    const onSelectTrack = vi.fn();
    const setSelectedCarClass = vi.fn();

    render(
      <TrackSummaries
        sessions={mockSessions}
        onSelectTrack={onSelectTrack}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Track Records & Benchmarks/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Spa')).toBeInTheDocument();
    expect(screen.getByText('Monza')).toBeInTheDocument();

    const spaCard = screen.getByText('Spa').closest('div.backdrop-blur-md');
    expect(spaCard).not.toBeNull();
    if (spaCard) {
      fireEvent.click(spaCard);
      expect(onSelectTrack).toHaveBeenCalledWith('Spa');
    }
  });

  it('filters by car class and sorts tracks', async () => {
    const setSelectedCarClass = vi.fn();

    render(
      <TrackSummaries
        sessions={mockSessions}
        onSelectTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'LMGT3' })).toBeInTheDocument();
    });

    const lmgt3Btn = screen.getByRole('button', { name: 'LMGT3' });
    fireEvent.click(lmgt3Btn);
    expect(setSelectedCarClass).toHaveBeenCalledWith('LMGT3');

    const sortSelect = screen.getByRole('combobox');
    fireEvent.change(sortSelect, { target: { value: 'name-desc' } });
    fireEvent.change(sortSelect, { target: { value: 'pace-asc' } });
    fireEvent.change(sortSelect, { target: { value: 'last-session-desc' } });
  });

  it('computes class-filtered summaries directly from sessions', async () => {
    const sessions = [
      {
        id: 'spa-lmh',
        filename: 'spa-lmh.xml',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        timeString: '2026/05/28 14:00',
        sessionType: 'Practice' as const,
        sessionName: 'P1',
        driversCount: 1,
        playerDriver: {
          name: 'LMH Driver', carType: 'Ferrari 499P', carClass: 'LMH',
          bestLapTime: 130, bestLapTimeString: '2:10.000',
          bestS1: 40, bestS2: 45, bestS3: 45, lapsCount: 8,
        },
      },
      {
        id: 'spa-gt3',
        filename: 'spa-gt3.xml',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        timeString: '2026/05/29 14:00',
        sessionType: 'Practice' as const,
        sessionName: 'P2',
        driversCount: 1,
        playerDriver: {
          name: 'GT3 Driver', carType: 'Porsche 911 GT3', carClass: 'LMGT3',
          bestLapTime: 140, bestLapTimeString: '2:20.000',
          bestS1: 43, bestS2: 48, bestS3: 49, lapsCount: 4,
        },
      },
    ];
    const onSelectTrack = vi.fn();
    const { rerender } = render(
      <TrackSummaries
        sessions={sessions}
        onSelectTrack={onSelectTrack}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    expect(await screen.findByText('2 Sessions • 12 Total Laps')).toBeInTheDocument();
    expect(screen.getAllByText('2:10.000')).toHaveLength(2);

    rerender(
      <TrackSummaries
        sessions={sessions}
        onSelectTrack={onSelectTrack}
        selectedCarClass="LMGT3"
        setSelectedCarClass={vi.fn()}
      />
    );

    expect(await screen.findByText('1 Sessions • 4 Total Laps')).toBeInTheDocument();
    expect(screen.getAllByText('2:20.000')).toHaveLength(2);
  });

  it('keeps distinct layouts at the same venue in separate summaries', async () => {
    const sessions = ['Layout A', 'Layout B'].map((trackCourse, index) => ({
      id: `layout-${index}`,
      filename: `layout-${index}.xml`,
      trackVenue: 'Test Circuit',
      trackCourse,
      timeString: `2026/05/2${8 + index} 14:00`,
      sessionType: 'Practice' as const,
      sessionName: `P${index + 1}`,
      driversCount: 1,
      playerDriver: {
        name: 'Player', carType: 'Ferrari 499P', carClass: 'LMH',
        bestLapTime: 130 + index, bestLapTimeString: '2:10.000',
        bestS1: 40, bestS2: 45, bestS3: 45, lapsCount: 1,
      },
    }));

    render(
      <TrackSummaries
        sessions={sessions}
        onSelectTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    expect(await screen.findByRole('heading', { level: 2, name: /2 Tracks/i })).toBeInTheDocument();
    expect(screen.getByText('Test Circuit (Layout A)')).toBeInTheDocument();
    expect(screen.getByText('Test Circuit (Layout B)')).toBeInTheDocument();
  });

  it('handles empty track summaries list', async () => {
    render(
      <TrackSummaries
        sessions={[]}
        onSelectTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Track Records & Benchmarks \(0 Tracks\)/i })).toBeInTheDocument();
    });
  });
});
