import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TrackDetail } from '../../src/components/TrackDetail';

describe('TrackDetail component', () => {
  const mockTrackDataWithMultipleClasses = {
    trackName: 'Spa',
    normalizedTrackName: 'Spa',
    sessionsCount: 3,
    sessions: [
      {
        id: 'sess-hypercar-1',
        filename: 'spa_hypercar.xml',
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
      {
        id: 'sess-gt3-1',
        filename: 'spa_gt3.xml',
        trackVenue: 'Spa',
        trackCourse: 'GP',
        timeString: '2026/05/29 16:00',
        sessionType: 'Qualifying',
        sessionName: 'Q1',
        driversCount: 1,
        playerDriver: {
          name: 'Player',
          carType: 'Porsche 911 GT3',
          carClass: 'LMGT3',
          bestLapTime: 138.0,
          bestLapTimeString: '2:18.000',
          bestS1: 40.0,
          bestS2: 48.0,
          bestS3: 50.0,
          theoreticalBest: 138.0,
          bestLapPaceCategory: 'Competitive' as const,
          bestLapPacePercentage: 101.2,
          lapsCount: 4,
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
      {
        key: 'spa_lmgt3',
        trackName: 'Spa',
        carClass: 'LMGT3',
        patch: '1.4+',
        target100Sec: 135.0,
        targets: {
          alienSec: 135.0,
          competitiveSec: 136.35,
          goodSec: 137.7,
          goodMidpackSec: 139.05,
          midpackSec: 140.4,
          midpackTailSec: 141.75,
          tailEnderSec: 143.1,
          offlineSec: 144.45,
        },
      },
    ],
  };

  const mockTrackDataNoBenchmarks = {
    trackName: 'CustomModCircuit',
    normalizedTrackName: 'CustomModCircuit',
    sessionsCount: 1,
    sessions: [
      {
        id: 'sess-custom-1',
        filename: 'custom_session.xml',
        trackVenue: 'CustomModCircuit',
        trackCourse: 'Layout A',
        timeString: '2026/05/30 14:00',
        sessionType: 'Practice',
        sessionName: 'P1',
        driversCount: 1,
        playerDriver: {
          name: 'Player',
          carType: 'Formula Spec',
          carClass: 'Formula',
          bestLapTime: 75.0,
          bestLapTimeString: '1:15.000',
          bestS1: 20.0,
          bestS2: 25.0,
          bestS3: 30.0,
          theoreticalBest: 75.0,
          lapsCount: 5,
        },
      },
    ],
    benchmarks: [],
  };

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTrackDataWithMultipleClasses),
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
      expect(onSelectSession).toHaveBeenCalledWith('sess-hypercar-1');
    }
  });

  it('strictly isolates benchmark targets by vehicle class (LMH vs LMGT3)', async () => {
    const setSelectedCarClass = vi.fn();

    // Render with LMH selected
    const { rerender } = render(
      <TrackDetail
        trackName="Spa"
        onBack={vi.fn()}
        onSelectSession={vi.fn()}
        selectedCarClass="LMH"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      // LMH Alien benchmark target is 2:00.000 (120s)
      expect(screen.getByText('2:00.000')).toBeInTheDocument();
      // GT3 Alien benchmark target of 2:15.000 (135s) must NOT be displayed in LMH mode
      expect(screen.queryByText('2:15.000')).not.toBeInTheDocument();
    });

    // Switch class to LMGT3
    rerender(
      <TrackDetail
        trackName="Spa"
        onBack={vi.fn()}
        onSelectSession={vi.fn()}
        selectedCarClass="LMGT3"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      // LMGT3 Alien benchmark target is 2:15.000 (135s)
      expect(screen.getByText('2:15.000')).toBeInTheDocument();
      // LMH Alien target of 2:00.000 must NOT be displayed in LMGT3 mode
      expect(screen.queryByText('2:00.000')).not.toBeInTheDocument();
    });
  });

  it('displays graceful fallback when a circuit has no benchmark targets', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTrackDataNoBenchmarks),
    });

    render(
      <TrackDetail
        trackName="CustomModCircuit"
        onBack={vi.fn()}
        onSelectSession={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'CustomModCircuit' })).toBeInTheDocument();
      expect(screen.getByText(/No reference benchmarks found for this track/i)).toBeInTheDocument();
    });
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

  it('filters by car model and car class', async () => {
    const setSelectedCarClass = vi.fn();
    render(
      <TrackDetail
        trackName="Spa"
        onBack={vi.fn()}
        onSelectSession={vi.fn()}
        selectedCarClass="LMH"
        setSelectedCarClass={setSelectedCarClass}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Spa' })).toBeInTheDocument();
    });

    // Subfilter by car model
    const carModelBtn = screen.getByRole('button', { name: /Ferrari 499P/i });
    fireEvent.click(carModelBtn);

    // Switch car class
    const lmgt3Btn = screen.getByRole('button', { name: 'LMGT3' });
    fireEvent.click(lmgt3Btn);
    expect(setSelectedCarClass).toHaveBeenCalledWith('LMGT3');
  });

  it('toggles between Cards view and Table view in TrackDetail', async () => {
    const onSelectSession = vi.fn();
    render(
      <TrackDetail
        trackName="Spa"
        onBack={vi.fn()}
        onSelectSession={onSelectSession}
        selectedCarClass="LMH"
        setSelectedCarClass={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Spa' })).toBeInTheDocument();
    });

    const cardsButton = screen.getByRole('button', { name: /Cards view/i });
    const tableButton = screen.getByRole('button', { name: /Table view/i });
    expect(cardsButton).toBeInTheDocument();
    expect(tableButton).toBeInTheDocument();

    // Switch to Table view
    fireEvent.click(tableButton);
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // Verify row selection in table view
    const tableRow = within(table).getByText('2026/05/28 14:00').closest('tr');
    expect(tableRow).not.toBeNull();
    if (tableRow) {
      fireEvent.click(tableRow);
      expect(onSelectSession).toHaveBeenCalledWith('sess-hypercar-1');
    }

    // Switch back to Cards view
    fireEvent.click(cardsButton);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('allows sorting sessions by Best Position (P1 First) in TrackDetail', async () => {
    render(
      <TrackDetail
        trackName="Spa"
        onBack={vi.fn()}
        onSelectSession={vi.fn()}
        selectedCarClass="All"
        setSelectedCarClass={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Spa' })).toBeInTheDocument();
    });

    const comboboxes = screen.getAllByRole('combobox');
    const sortSelect = comboboxes[comboboxes.length - 1];
    fireEvent.change(sortSelect, { target: { value: 'pos-asc' } });
    expect(sortSelect).toHaveValue('pos-asc');
  });
});
