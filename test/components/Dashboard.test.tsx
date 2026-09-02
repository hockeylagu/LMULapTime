import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
        carClass: 'LMH',
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
    expect(screen.getByText('Distance Driven')).toBeInTheDocument();
    expect(screen.getByText('Driving Time')).toBeInTheDocument();
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

    // Expand Show More buttons
    const moreButtons = screen.getAllByText(/\+1 More/i);
    moreButtons.forEach(btn => fireEvent.click(btn));

    // Collapse again
    const lessButtons = screen.getAllByText(/Show Less/i);
    lessButtons.forEach(btn => fireEvent.click(btn));
  });

  it('toggles Hide Empty Results filter', () => {
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

    const hideEmptyBtn = screen.getByRole('button', { name: /Hide Empty Results/i });
    fireEvent.click(hideEmptyBtn);
    fireEvent.click(hideEmptyBtn);
  });

  it('accurately displays Driving Overview aggregated metrics', () => {
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

    // Header sessions badge
    expect(screen.getByText('5 Sessions')).toBeInTheDocument();
    // Total laps row
    expect(screen.getByText('22 laps')).toBeInTheDocument();
    // Distance Driven and Driving Time
    expect(screen.getByText('Distance Driven')).toBeInTheDocument();
    expect(screen.getByText('Driving Time')).toBeInTheDocument();
    // Footer tracks count
    expect(screen.getByText(/Across 4 Unique Circuits/i)).toBeInTheDocument();
  });

  it('calculates Driving Overview lap count and km driven using completed laps (valid or not, excluding incomplete)', () => {
    const sessionsWithMixedLaps = [
      {
        id: 'sess-mixed-1',
        filename: '2026_06_10_P1.xml',
        trackVenue: 'Spa',
        trackLengthMeters: 7004,
        timeString: '2026/06/10 14:00',
        sessionType: 'Practice' as const,
        sessionName: 'P1',
        driversCount: 1,
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
          lapsCount: 2,
          laps: [
            { lapNum: 1, position: 1, lapTime: 122.0, lapTimeString: '2:02.000', s1: 34, s2: 42, s3: 46, topSpeed: 320, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: true },
            { lapNum: 2, position: 1, lapTime: 125.0, lapTimeString: '2:05.000', s1: 35, s2: 43, s3: 47, topSpeed: 318, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: false }, // invalid but completed
            { lapNum: 3, position: 1, lapTime: null, lapTimeString: '--:--.---', s1: null, s2: null, s3: null, topSpeed: null, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: false }, // incomplete
          ],
        },
      },
    ];

    render(
      <Dashboard
        sessions={sessionsWithMixedLaps}
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

    // 2 completed laps displayed in Circuits, Cars, and Driving Overview (1 valid + 1 invalid, excluding incomplete lap 3)
    const lapBadges = screen.getAllByText('2 laps');
    expect(lapBadges.length).toBeGreaterThanOrEqual(1);
    // Distance driven: (7004 / 1000) * 2 = 14.008 km -> 14 km
    expect(screen.getByText('14 km')).toBeInTheDocument();
    expect(screen.getByText('Total Laps Driven')).toBeInTheDocument();
  });

  it('renders empty search state and provides Reset All Filters button', () => {
    const setSelectedTrack = vi.fn();
    const setSelectedCarClass = vi.fn();
    const setFilterType = vi.fn();
    const setSearchQuery = vi.fn();

    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={vi.fn()}
        selectedTrack="Spa"
        setSelectedTrack={setSelectedTrack}
        selectedCarClass="LMGT3"
        setSelectedCarClass={setSelectedCarClass}
        filterType="Race"
        setFilterType={setFilterType}
        searchQuery="NonexistentQueryString"
        setSearchQuery={setSearchQuery}
      />
    );

    expect(screen.getByText('No sessions found matching filters.')).toBeInTheDocument();
    const resetBtn = screen.getByRole('button', { name: /Reset All Filters/i });
    fireEvent.click(resetBtn);

    expect(setSelectedTrack).toHaveBeenCalledWith('All');
    expect(setSelectedCarClass).toHaveBeenCalledWith('All');
    expect(setFilterType).toHaveBeenCalledWith('All');
    expect(setSearchQuery).toHaveBeenCalledWith('');
  });

  it('allows clicking a benchmark lap item to select session', () => {
    const onSelectSession = vi.fn();
    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={onSelectSession}
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

    const alienBenchmarkRow = screen.getByTitle('Open session details for Spa');
    fireEvent.click(alienBenchmarkRow);
    expect(onSelectSession).toHaveBeenCalledWith('sess-spa-1');
  });

  it('toggles between Cards view and Table view and allows selecting sessions from table', () => {
    const onSelectSession = vi.fn();
    render(
      <Dashboard
        sessions={mockSessions}
        onSelectSession={onSelectSession}
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

    // Initial state: Cards view
    const cardsButton = screen.getByRole('button', { name: /Cards view/i });
    const tableButton = screen.getByRole('button', { name: /Table view/i });
    expect(cardsButton).toBeInTheDocument();
    expect(tableButton).toBeInTheDocument();

    // Switch to Table view
    fireEvent.click(tableButton);

    // Check table headers
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByText('Track / Layout')).toBeInTheDocument();
    expect(screen.getByText('Date & Time')).toBeInTheDocument();
    expect(screen.getByText('Car / Class')).toBeInTheDocument();
    expect(screen.getByText('Benchmark Pace')).toBeInTheDocument();

    // Click on a table row
    const tableRow = within(table).getByText('2026/05/28 14:00').closest('tr');
    expect(tableRow).not.toBeNull();
    if (tableRow) {
      fireEvent.click(tableRow);
      expect(onSelectSession).toHaveBeenCalledWith('sess-spa-1');
    }

    // Switch back to Cards view
    fireEvent.click(cardsButton);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
