import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TrackSummaries } from '../../src/components/TrackSummaries';

describe('TrackSummaries component', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );
  });
  const mockTrackSummaries = {
    Spa: {
      trackVenue: 'Spa',
      sessionsCount: 3,
      totalLaps: 15,
      bestLapTime: 122.0,
      bestLapTimeString: '2:02.000',
      bestLapDriver: 'Player',
      bestLapCar: 'Ferrari 499P',
      bestLapClass: 'LMH',
      bestS1: 34.0,
      bestS2: 42.0,
      bestS3: 46.0,
      theoreticalBest: 122.0,
      carsUsed: ['Ferrari 499P'],
    },
    Monza: {
      trackVenue: 'Monza',
      sessionsCount: 1,
      totalLaps: 5,
      bestLapTime: 108.0,
      bestLapTimeString: '1:48.000',
      bestLapDriver: 'Player',
      bestLapCar: 'Porsche 911 GT3',
      bestLapClass: 'LMGT3',
      bestS1: 28.0,
      bestS2: 38.0,
      bestS3: 42.0,
      theoreticalBest: 108.0,
      carsUsed: ['Porsche 911 GT3'],
    },
  };

  it('renders track cards and allows selecting a track', async () => {
    const onSelectTrack = vi.fn();
    const setSelectedCarClass = vi.fn();

    render(
      <TrackSummaries
        tracksMap={mockTrackSummaries}
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

    const spaCard = screen.getByText('Spa').closest('div.glass-panel');
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
        tracksMap={mockTrackSummaries}
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

  it('handles empty track summaries list', async () => {
    render(
      <TrackSummaries
        tracksMap={{}}
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
