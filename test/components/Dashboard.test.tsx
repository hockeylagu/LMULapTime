import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from '../../src/components/Dashboard';

describe('Dashboard component', () => {
  const mockSessions = [
    {
      id: 'sess-spa-1',
      filename: '2026_05_28_P1.xml',
      trackVenue: 'Spa',
      timeString: '2026/05/28 14:00',
      sessionType: 'Practice' as const,
      sessionName: 'P1',
      driversCount: 2,
      matchingReplayFile: { name: 'spa.vcr', path: 'C:\\spa.vcr' },
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 499P',
        carClass: 'LMH',
        bestLapTime: 122.0,
        bestLapTimeString: '2:02.000',
        bestS1: 34.0,
        bestS2: 42.0,
        bestS3: 46.0,
        theoreticalBest: 122.0,
        theoreticalBestString: '2:02.000',
        bestLapPaceCategory: 'Alien' as const,
        bestLapPacePercentage: 100.1,
        lapsCount: 5,
      },
    },
    {
      id: 'sess-monza-1',
      filename: '2026_05_29_Q1.xml',
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
        theoreticalBest: 108.0,
        theoreticalBestString: '1:48.000',
        bestLapPaceCategory: 'Good' as const,
        bestLapPacePercentage: 102.5,
        lapsCount: 4,
      },
    },
    {
      id: 'sess-empty-1',
      filename: '2026_05_30_P2.xml',
      trackVenue: 'Spa',
      timeString: '2026/05/30 10:00',
      sessionType: 'Practice' as const,
      sessionName: 'P2',
      driversCount: 0,
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 499P',
        carClass: 'LMH',
        bestLapTime: null,
        bestLapTimeString: '--:--.---',
        bestS1: null,
        bestS2: null,
        bestS3: null,
        theoreticalBest: null,
        theoreticalBestString: '--:--.---',
        lapsCount: 0,
      },
    },
  ];

  it('renders summary cards, session cards, and allows selecting session', () => {
    const onSelectSession = vi.fn();
    const setSelectedTrack = vi.fn();
    const setSelectedCarClass = vi.fn();
    const setFilterType = vi.fn();
    const setSearchQuery = vi.fn();

    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={onSelectSession}
        selectedTrack="All"
        setSelectedTrack={setSelectedTrack}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
        filterType="All"
        setFilterType={setFilterType}
        searchQuery=""
        setSearchQuery={setSearchQuery}
      />
    );

    expect(screen.getByText('Driving Overview')).toBeInTheDocument();
    expect(screen.getAllByText('Spa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Monza').length).toBeGreaterThan(0);

    const sessionCard = screen.getByText('2026/05/28 14:00').closest('div.glass-panel');
    expect(sessionCard).not.toBeNull();
    if (sessionCard) {
      fireEvent.click(sessionCard);
      expect(onSelectSession).toHaveBeenCalledWith('sess-spa-1');
    }
  });

  it('allows changing track filter, car class filter, and search input', () => {
    const setSelectedTrack = vi.fn();
    const setSelectedCarClass = vi.fn();
    const setFilterType = vi.fn();
    const setSearchQuery = vi.fn();

    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedTrack="All"
        setSelectedTrack={setSelectedTrack}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
        filterType="All"
        setFilterType={setFilterType}
        searchQuery=""
        setSearchQuery={setSearchQuery}
      />
    );

    const comboboxes = screen.getAllByRole('combobox');
    const trackSelect = comboboxes[0];
    fireEvent.change(trackSelect, { target: { value: 'Spa' } });
    expect(setSelectedTrack).toHaveBeenCalledWith('Spa');

    const searchInput = screen.getByPlaceholderText(/search track, car, file/i);
    fireEvent.change(searchInput, { target: { value: 'Porsche' } });
    expect(setSearchQuery).toHaveBeenCalledWith('Porsche');

    const qualBtn = screen.getByRole('button', { name: 'Qualifying' });
    fireEvent.click(qualBtn);
    expect(setFilterType).toHaveBeenCalledWith('Qualifying');
  });
});
