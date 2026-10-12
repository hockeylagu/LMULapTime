import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Dashboard } from '../../../src/components/dashboard/Dashboard.js';
import { makeDetailedSession, makeSessionCard } from '../../helpers/sessionCardFixture.js';

vi.mock('../../../src/components/track-detail/TrackCircuitLayout.js', () => ({ TrackCircuitLayout: () => null }));

describe('Dashboard component - Metrics, Views & Aggregations', () => {
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
      trackCourse: '1A',
      timeString: '2026/05/30 18:00',
      sessionType: 'Race' as const,
      sessionName: 'R1',
      driversCount: 1,
      playerDriver: {
        name: 'Player',
        carType: 'Ferrari 296 GT3',
        carClass: 'GT3',
        bestLapTime: 115.0,
        bestLapTimeString: '1:55.000',
        bestS1: 30.0,
        bestS2: 40.0,
        bestS3: 45.0,
        theoreticalBest: 115.0,
        theoreticalBestString: '1:55.000',
        bestLapPaceCategory: 'Competitive' as const,
        bestLapPacePercentage: 101.2,
        position: 1,
        lapsCount: 8,
      },
    },
    {
      id: 'sess-sebring-1',
      filename: '2026_05_31_P2.xml',
      trackVenue: 'Sebring',
      timeString: '2026/05/31 10:00',
      sessionType: 'Practice' as const,
      sessionName: 'P2',
      driversCount: 1,
      playerDriver: {
        name: 'Player',
        carType: 'Cadillac V-Series.R',
        carClass: 'Hyper',
        bestLapTime: 110.0,
        bestLapTimeString: '1:50.000',
        bestS1: 29.0,
        bestS2: 39.0,
        bestS3: 42.0,
        theoreticalBest: 110.0,
        theoreticalBestString: '1:50.000',
        bestLapPaceCategory: 'Alien' as const,
        bestLapPacePercentage: 100.4,
        lapsCount: 5,
      },
    },
    {
      id: 'sess-empty-1',
      filename: '2026_06_01_P1.xml',
      trackVenue: 'Le Mans',
      timeString: '2026/06/01 12:00',
      sessionType: 'Practice' as const,
      sessionName: 'P1',
      driversCount: 1,
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

    // Header sessions count
    expect(screen.getByText('5 sessions')).toBeInTheDocument();
    // Total laps figure
    const totals = screen.getByText('Totals').closest('div.rounded-2xl') as HTMLElement;
    expect(within(totals).getByText('22')).toBeInTheDocument();
    expect(within(totals).getByText('Driving')).toBeInTheDocument();
    expect(screen.queryByText(/Across 4 Unique Circuits/i)).not.toBeInTheDocument();
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
          carClass: 'Hyper',
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
            { lapNum: 2, position: 1, lapTime: 125.0, lapTimeString: '2:05.000', s1: 35, s2: 43, s3: 47, topSpeed: 318, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: false },
            { lapNum: 3, position: 1, lapTime: null, lapTimeString: '--:--.---', s1: null, s2: null, s3: null, topSpeed: null, fCompound: 'H', rCompound: 'H', isPitStop: false, isValid: false },
          ],
        },
      },
    ].map(session => makeDetailedSession(session));

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

    const totals = screen.getByText('Totals').closest('div.rounded-2xl') as HTMLElement;
    expect(within(totals).getByText('2')).toBeInTheDocument();
    expect(within(totals).getByText('14')).toBeInTheDocument();
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
        selectedCarClass="GT3"
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

  it('provides Reset All Filters button when replay-only is the sole active filter and clears it on click', () => {
    window.location.hash = '#/?hasReplay=true';
    const noReplaySessions = mockSessions.filter((s) => !s.matchingReplayFile);

    render(
      <Dashboard
        sessions={noReplaySessions}
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

    expect(screen.getByText('No sessions found matching filters.')).toBeInTheDocument();
    const resetBtn = screen.getByRole('button', { name: /Reset All Filters/i });
    expect(resetBtn).toBeInTheDocument();
    fireEvent.click(resetBtn);

    expect(window.location.hash).not.toContain('hasReplay=true');
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

    const cardsButton = screen.getByRole('button', { name: /Cards view/i });
    const tableButton = screen.getByRole('button', { name: /Table view/i });
    expect(cardsButton).toBeInTheDocument();
    expect(tableButton).toBeInTheDocument();

    fireEvent.click(tableButton);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(within(table).getByText('Track / Layout')).toBeInTheDocument();
    expect(within(table).getByText('Date & Time')).toBeInTheDocument();
    expect(within(table).getByText('Car / Class')).toBeInTheDocument();
    expect(within(table).getByText('Benchmark Pace')).toBeInTheDocument();

    const tableRow = within(table).getByText('2026/05/28 14:00').closest('tr');
    expect(tableRow).not.toBeNull();
    if (tableRow) {
      fireEvent.click(tableRow);
      expect(onSelectSession).toHaveBeenCalledWith('sess-spa-1');
    }

    fireEvent.click(cardsButton);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('allows sorting sessions by Best Position (P1 First)', () => {
    const sessionsWithPositions = [
      {
        ...mockSessions[0],
        id: 'sess-p3',
        playerDriver: { ...mockSessions[0].playerDriver, position: 3 },
      },
      {
        ...mockSessions[1],
        id: 'sess-p1',
        playerDriver: { ...mockSessions[1].playerDriver, position: 1 },
      },
    ].map(session => makeSessionCard(session));

    render(
      <Dashboard
        sessions={sessionsWithPositions}
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
    const sortSelect = comboboxes[comboboxes.length - 1];
    fireEvent.change(sortSelect, { target: { value: 'pos-asc' } });
    expect(sortSelect).toHaveValue('pos-asc');
  });

  it('counts laps for full track with alternate layout rather than aggregating into the circuit', () => {
    const sessionsWithLayouts = [
      {
        ...mockSessions[0],
        id: 'sess-ricard-short',
        trackVenue: 'Paul Ricard',
        trackCourse: '1A-V2-Short',
        playerDriver: {
          ...mockSessions[0].playerDriver,
          lapsCount: 8,
          bestLapPacePercentage: 101.1,
          bestLapPaceCategory: 'Alien' as const,
          bestLapTimeString: '1:20.000',
        },
      },
      {
        ...mockSessions[0],
        id: 'sess-ricard-full',
        trackVenue: 'Paul Ricard',
        trackCourse: '1A',
        playerDriver: {
          ...mockSessions[0].playerDriver,
          lapsCount: 12,
          bestLapPacePercentage: 101.5,
          bestLapPaceCategory: 'Good' as const,
          bestLapTimeString: '1:45.000',
        },
      },
    ].map(session => makeSessionCard(session));

    render(
      <Dashboard
        sessions={sessionsWithLayouts}
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

    expect(screen.getByTitle('View Paul Ricard (1A V2 Short) Track Details')).toBeInTheDocument();
    expect(screen.getByTitle('View Paul Ricard (1A) Track Details')).toBeInTheDocument();
    expect(screen.getAllByText('8').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);

    const totals = screen.getByText('Totals').closest('div.rounded-2xl') as HTMLElement;
    expect(within(totals).getByText('20')).toBeInTheDocument();
  });

  it('synchronizes card expansion across all cards and reveals extended driving overview statistics', () => {
    const sessionsWithExtStats = [
      ...mockSessions,
      {
        id: 'sess-fuji-1',
        filename: '2026_05_31_R2.xml',
        trackVenue: 'Fuji',
        timeString: '2026/05/31 19:00',
        sessionType: 'Race' as const,
        sessionName: 'R2',
        driversCount: 1,
        playerDriver: {
          name: 'Player',
          carType: 'BMW M4 LMGT3',
          carClass: 'GT3',
          bestLapTime: 100.0,
          bestLapTimeString: '1:40.000',
          bestS1: 25.0,
          bestS2: 35.0,
          bestS3: 40.0,
          theoreticalBest: 100.0,
          theoreticalBestString: '1:40.000',
          bestLapPaceCategory: 'Alien' as const,
          bestLapPacePercentage: 100.2,
          position: 1,
          lapsCount: 10,
          laps: [
            {
              lapNum: 1,
              position: 1,
              lapTime: 100.0,
              lapTimeString: '1:40.000',
              s1: 25.0,
              s2: 35.0,
              s3: 40.0,
              topSpeed: 312.5,
              fCompound: 'Medium',
              rCompound: 'Medium',
              isPitStop: false,
              isValid: true,
            },
            {
              lapNum: 2,
              position: 1,
              lapTime: 110.0,
              lapTimeString: '1:50.000',
              s1: 28.0,
              s2: 38.0,
              s3: 44.0,
              topSpeed: 305.0,
              fCompound: 'Medium',
              rCompound: 'Medium',
              isPitStop: true,
              isValid: true,
            },
          ],
        },
      },
    ].map(session => makeSessionCard(session));

    render(
      <Dashboard
        sessions={sessionsWithExtStats}
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

    expect(screen.queryByText('Clean flying laps')).not.toBeInTheDocument();
    expect(screen.queryByText('Pit stops')).not.toBeInTheDocument();

    const expandButton = screen.getByRole('button', { name: /Show All Driving Stats/i });
    expect(expandButton).toBeInTheDocument();
    fireEvent.click(expandButton);

    expect(screen.getByText('Clean flying laps')).toBeInTheDocument();
    expect(screen.getByText('Avg benchmark pace')).toBeInTheDocument();
    expect(screen.getByText('Race wins · podiums')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Pit stops')).toBeInTheDocument();
    expect(screen.getByTestId('overview-fun-facts')).toHaveTextContent('312.5 km/h');

    const collapseButtons = screen.getAllByRole('button', { name: /Show Top 3 Only/i });
    expect(collapseButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(collapseButtons[0]);

    expect(screen.queryByText('Clean flying laps')).not.toBeInTheDocument();
    expect(screen.queryByText('Pit stops')).not.toBeInTheDocument();
  });

  it('opens replay on the best lap of the session when launch replay button is clicked in dashboard hero', () => {
    const replaySessions = [
      {
        id: 'sess-hero-replay',
        filename: '2026_06_01_R1.xml',
        trackVenue: 'Spa',
        timeString: '2026/06/01 15:00',
        sessionType: 'Race' as const,
        sessionName: 'R1',
        driversCount: 1,
        matchingReplayFile: { name: 'spa_hero.vcr', path: 'C:\\spa_hero.vcr' },
        playerDriver: {
          name: 'Player',
          carType: 'Ferrari 499P',
          carClass: 'Hyper',
          bestLapTime: 121.5,
          bestLapTimeString: '2:01.500',
          bestLapNum: 3,
          driverOrdinal: 0,
          bestLapOrdinal: 2,
          bestS1: 34.0,
          bestS2: 41.5,
          bestS3: 46.0,
          theoreticalBest: 121.5,
          theoreticalBestString: '2:01.500',
          bestLapPaceCategory: 'Alien' as const,
          bestLapPacePercentage: 100.1,
          lapsCount: 5,
          laps: [
            { lapNum: 1, position: 1, lapTime: 125.0, lapTimeString: '2:05.000', s1: null, s2: null, s3: null, topSpeed: 300, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
            { lapNum: 2, position: 1, lapTime: 123.0, lapTimeString: '2:03.000', s1: null, s2: null, s3: null, topSpeed: 305, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
            { lapNum: 3, position: 1, lapTime: 121.5, lapTimeString: '2:01.500', s1: null, s2: null, s3: null, topSpeed: 310, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
          ],
        },
      },
    ].map(session => makeSessionCard(session));

    render(
      <Dashboard
        sessions={replaySessions}
        onSelectSession={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    const replayBtn = screen.getByTestId('hero-launch-replay-btn');
    expect(replayBtn).toBeInTheDocument();
    fireEvent.click(replayBtn);

    expect(window.location.hash).toContain('/telemetry?');
    expect(window.location.hash).toContain('sessionId=sess-hero-replay');
    expect(window.location.hash).toContain('driverOrdinal=0');
    expect(window.location.hash).toContain('lapOrdinal=2');
  });
});
