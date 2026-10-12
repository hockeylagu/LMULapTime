import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Dashboard } from '../../../src/components/dashboard/Dashboard.js';
import { makeSessionCard } from '../../helpers/sessionCardFixture.js';

vi.mock('../../../src/components/track-detail/TrackCircuitLayout.js', () => ({ TrackCircuitLayout: () => null }));

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
        carClass: 'Hyper',
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
        carClass: 'GT3',
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
      id: 'sess-ricard-1',
      filename: '2026_05_30_R1.xml',
      trackVenue: 'Paul Ricard',
      timeString: '2026/05/30 18:00',
      sessionType: 'Race' as const,
      sessionName: 'R1',
      driversCount: 1,
      playerDriver: {
        name: 'Player',
        carType: 'Oreca 07',
        carClass: 'LMP2',
        bestLapTime: 95.0,
        bestLapTimeString: '1:35.000',
        bestS1: 25.0,
        bestS2: 35.0,
        bestS3: 35.0,
        theoreticalBest: 95.0,
        theoreticalBestString: '1:35.000',
        bestLapPaceCategory: 'Competitive' as const,
        bestLapPacePercentage: 101.2,
        lapsCount: 10,
      },
    },
    {
      id: 'sess-le-mans-1',
      filename: '2026_05_31_P1.xml',
      trackVenue: 'Le Mans',
      timeString: '2026/05/31 10:00',
      sessionType: 'Practice' as const,
      sessionName: 'P1',
      driversCount: 1,
      playerDriver: {
        name: 'Player',
        carType: 'Cadillac V-Series.R',
        carClass: 'Hyper',
        bestLapTime: 200.0,
        bestLapTimeString: '3:20.000',
        bestS1: 50.0,
        bestS2: 70.0,
        bestS3: 80.0,
        theoreticalBest: 200.0,
        theoreticalBestString: '3:20.000',
        bestLapPaceCategory: 'Midpack' as const,
        bestLapPacePercentage: 104.0,
        lapsCount: 3,
      },
    },
    {
      id: 'sess-empty-1',
      filename: '2026_06_01_P2.xml',
      trackVenue: 'Spa',
      timeString: '2026/06/01 10:00',
      sessionType: 'Practice' as const,
      sessionName: 'P2',
      driversCount: 0,
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 499P',
        carClass: 'Hyper',
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
  ].map(session => makeSessionCard(session));

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

    expect(screen.getByText('Totals')).toBeInTheDocument();
    expect(screen.getByText('Driving')).toBeInTheDocument();
    expect(screen.getAllByText('Spa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Monza').length).toBeGreaterThan(0);

    const sessionCard = screen.getByText('2026/05/28 14:00').closest('div.cursor-pointer');
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
    const spaIdentity = JSON.stringify(['Spa', '']);
    fireEvent.change(trackSelect, { target: { value: spaIdentity } });
    expect(setSelectedTrack).toHaveBeenCalledWith(spaIdentity);

    const searchInput = screen.getByPlaceholderText(/search track, car, file/i);
    fireEvent.change(searchInput, { target: { value: 'Porsche' } });
    expect(setSearchQuery).toHaveBeenCalledWith('Porsche');

    const qualBtn = screen.getByRole('button', { name: 'Qualifying' });
    fireEvent.click(qualBtn);
    expect(setFilterType).toHaveBeenCalledWith('Qualifying');
  });

  it('applies URL-backed session filters and view mode on mount', () => {
    window.location.hash = '#/?track=Monza&type=Qualifying&q=Porsche&sort=date-asc&view=table';

    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    const table = screen.getByRole('table');
    expect(within(table).getByText('Porsche 911 GT3')).toBeInTheDocument();
    expect(within(table).queryByText('Ferrari 499P')).not.toBeInTheDocument();
  });

  it('handles sort dropdown changes (date-asc, pace-asc, pace-desc)', () => {
    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedTrack="All"
        setSelectedTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
      />
    );

    const comboboxes = screen.getAllByRole('combobox');
    const sortSelect = comboboxes[1];

    fireEvent.change(sortSelect, { target: { value: 'date-asc' } });
    fireEvent.change(sortSelect, { target: { value: 'pace-asc' } });
    fireEvent.change(sortSelect, { target: { value: 'pace-desc' } });
    fireEvent.change(sortSelect, { target: { value: 'date-desc' } });
  });

  it('expands and collapses Show More Circuits, Cars, and Benchmarks', () => {
    const setSelectedCarClass = vi.fn();
    const onSelectSession = vi.fn();

    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={onSelectSession}
        selectedTrack="All"
        setSelectedTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={setSelectedCarClass}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
      />
    );

    // Expand using bottom button
    const moreButtons = screen.getAllByRole('button', { name: /Show All/i });
    expect(moreButtons.length).toBeGreaterThan(0);
    fireEvent.click(moreButtons[0]);

    // Collapse again
    const lessButtons = screen.getAllByRole('button', { name: /Show Top 3 Only/i });
    expect(lessButtons.length).toBeGreaterThan(0);
    fireEvent.click(lessButtons[0]);
  });

  it('toggles Hide Empty Sessions filter', () => {
    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedTrack="All"
        setSelectedTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
      />
    );

    const hideEmptyBtn = screen.getByRole('button', { name: /Hide Empty Sessions/i });
    fireEvent.click(hideEmptyBtn);
    fireEvent.click(hideEmptyBtn);
  });

  it('shows reset button when track is selected and clicking it resets to All', () => {
    const setSelectedTrack = vi.fn();
    const { rerender } = render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedTrack="Spa"
        setSelectedTrack={setSelectedTrack}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
      />
    );

    // Reset button should exist when track !== 'All'
    const resetTrackBtn = screen.getByRole('button', { name: /Reset track filter/i });
    expect(resetTrackBtn).toBeInTheDocument();

    fireEvent.click(resetTrackBtn);
    expect(setSelectedTrack).toHaveBeenCalledWith('All');

    // When selectedTrack is 'All', reset button should not exist
    rerender(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedTrack="All"
        setSelectedTrack={setSelectedTrack}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Reset track filter/i })).not.toBeInTheDocument();
  });

  it('toggles Has Replay filter and filters sessions by replay presence', () => {
    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedTrack="All"
        setSelectedTrack={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
        filterType="All"
        setFilterType={vi.fn()}
        searchQuery=""
        setSearchQuery={vi.fn()}
      />
    );

    const hasReplayBtn = screen.getByRole('button', { name: /Filter sessions with replay/i });
    expect(hasReplayBtn).toBeInTheDocument();
    expect(hasReplayBtn).toHaveAttribute('title', expect.stringContaining('replay'));

    // Initially all non-empty sessions are shown (mockSessions has 4 non-empty, only 1 has matchingReplayFile: sess-spa-1)
    expect(screen.getAllByText('P1').length).toBeGreaterThan(0);

    // Toggle Has Replay filter ON
    fireEvent.click(hasReplayBtn);

    // Toggle Has Replay filter OFF
  });
});
