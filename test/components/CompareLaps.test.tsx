import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CompareLaps } from '../../src/components/CompareLaps';

describe('CompareLaps component', () => {
  const mockSessions = [
    {
      id: 'sess1',
      trackVenue: 'Spa',
      trackCourse: 'GP',
      timeString: '2026/05/28 14:00',
      sessionType: 'Practice',
      sessionName: 'P1',
    },
    {
      id: 'sess2',
      trackVenue: 'Bahrain',
      trackCourse: 'Grand Prix',
      timeString: '2026/05/29 16:00',
      sessionType: 'Qualifying',
      sessionName: 'Q1',
    },
  ];

  const mockCompareData = {
    laps: [
      {
        id: 'sess1_Sim Driver_lap_1',
        sessionId: 'sess1',
        sessionName: 'P1',
        sessionType: 'Practice',
        dateString: '2026/05/28 14:00',
        driverName: 'Sim Driver',
        carType: 'Ferrari 296 GT3',
        carClass: 'LMGT3',
        lapNum: 1,
        lapTime: 122.5,
        lapTimeString: '2:02.500',
        s1: 30.5,
        s2: 45.5,
        s3: 46.5,
        topSpeed: 280.0,
        isValid: true,
        isSessionBest: false,
      },
      {
        id: 'sess1_Sim Driver_lap_2',
        sessionId: 'sess1',
        sessionName: 'P1',
        sessionType: 'Practice',
        dateString: '2026/05/28 14:00',
        driverName: 'Sim Driver',
        carType: 'Ferrari 296 GT3',
        carClass: 'LMGT3',
        lapNum: 2,
        lapTime: 121.8,
        lapTimeString: '2:01.800',
        s1: 30.2,
        s2: 45.1,
        s3: 46.5,
        topSpeed: 282.5,
        isValid: true,
        isSessionBest: true,
      },
    ],
    allTimeBestLap: {
      id: 'sess1_Sim Driver_lap_2',
      sessionId: 'sess1',
      sessionName: 'P1',
      driverName: 'Sim Driver',
      carType: 'Ferrari 296 GT3',
      carClass: 'LMGT3',
      lapNum: 2,
      lapTime: 121.8,
      lapTimeString: '2:01.800',
      s1: 30.2,
      s2: 45.1,
      s3: 46.5,
      topSpeed: 282.5,
      isValid: true,
      tag: '⭐ All-Time Best Lap',
    },
    overallTrackBestLap: {
      id: 'sess1_Pro Driver_lap_5',
      sessionId: 'sess1',
      sessionName: 'P1',
      driverName: 'Pro Driver',
      carType: 'Porsche 911 GT3.R',
      carClass: 'LMGT3',
      lapNum: 5,
      lapTime: 120.5,
      lapTimeString: '2:00.500',
      s1: 29.9,
      s2: 44.8,
      s3: 45.8,
      topSpeed: 284.0,
      isValid: true,
      tag: '🏆 All-Time Best (Pro Driver)',
    },
    bestS1: 30.2,
    bestS2: 45.1,
    bestS3: 46.5,
    bestS1String: '30.200',
    bestS2String: '45.100',
    bestS3String: '46.500',
    theoreticalBestSec: 121.8,
    theoreticalBestString: '2:01.800',
    benchmarks: [
      {
        key: 'Spa_LMGT3',
        trackName: 'Spa',
        carClass: 'LMGT3',
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
    vi.restoreAllMocks();
    window.location.hash = '#compare';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/compare/laps')) {
        if (url.includes('playerOnly=false')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ...mockCompareData,
                laps: [
                  ...mockCompareData.laps,
                  {
                    id: 'sess1_AI Driver_lap_3',
                    sessionId: 'sess1',
                    sessionName: 'P1',
                    sessionType: 'Practice',
                    dateString: '2026/05/28 14:00',
                    driverName: 'AI Driver',
                    carType: 'Aston Martin Vantage GT3',
                    carClass: 'LMGT3',
                    lapNum: 3,
                    lapTime: 120.9,
                    lapTimeString: '2:00.900',
                    s1: 30.0,
                    s2: 44.9,
                    s3: 46.0,
                    topSpeed: 283.0,
                    isValid: true,
                    isSessionBest: true,
                  },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCompareData),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  it('renders CompareLaps studio with title and filter controls', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    expect(screen.getByText('Multi-Lap & Cross-Session Comparator')).toBeInTheDocument();
    expect(screen.getByText('Telemetry Studio')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(1\/4\)/i)).toBeInTheDocument();
    });
  });

  it('allows adding theoretical optimal and all-time track best laps on demand', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(1\/4\)/i)).toBeInTheDocument();
    });

    // Click + Theoretical Best
    const theoBtn = screen.getByRole('button', { name: /\+ Theoretical Best/i });
    fireEvent.click(theoBtn);

    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(2\/4\)/i)).toBeInTheDocument();
    });

    // Click + All-Time Best
    const allTimeBtn = screen.getByRole('button', { name: /\+ All-Time Best/i });
    fireEvent.click(allTimeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(3\/4\)/i)).toBeInTheDocument();
    });
  });

  it('allows adding and removing laps from comparison', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    await waitFor(() => {
      expect(screen.getByText('Clear')).toBeInTheDocument();
    });

    // Clear all
    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText('No Laps Selected for Comparison')).toBeInTheDocument();
    });

    // Click + Compare on the table row
    const compareButtons = screen.getAllByRole('button', { name: /Compare/i });
    const rowCompareBtn = compareButtons.find(b => b.textContent?.includes('Compare'));
    if (rowCompareBtn) {
      fireEvent.click(rowCompareBtn);
      await waitFor(() => {
        expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison/i)).toBeInTheDocument();
      });
    }
  });

  it('allows setting a different baseline lap and updating deltas', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison/i)).toBeInTheDocument();
    });

    // Add Theoretical Best so we have at least 2 laps to switch baseline
    const theoBtn = screen.getByRole('button', { name: /\+ Theoretical Best/i });
    fireEvent.click(theoBtn);

    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(2\/4\)/i)).toBeInTheDocument();
    });

    const setBaselineButtons = screen.getAllByRole('button', { name: /Set Baseline/i });
    if (setBaselineButtons.length > 0) {
      fireEvent.click(setBaselineButtons[0]);
      expect(screen.getAllByText(/Active Baseline/i).length).toBeGreaterThan(0);
    }
  });

  it('allows changing Available Laps ordering (Best, Last, Speed, S1/S2/S3)', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Order:/i)).toBeInTheDocument();
    });

    const sortSelect = screen.getByLabelText(/Order:/i) as HTMLSelectElement;
    expect(sortSelect.value).toBe('lap-asc');

    // Change to Most Recent (Last)
    fireEvent.change(sortSelect, { target: { value: 'date-desc' } });
    expect(sortSelect.value).toBe('date-desc');

    // Change to Highest Top Speed
    fireEvent.change(sortSelect, { target: { value: 'speed-desc' } });
    expect(sortSelect.value).toBe('speed-desc');

    // Click column header to activate lap-asc, then lap-desc
    const lapTimeHeader = screen.getByRole('columnheader', { name: /Lap Time/i });
    fireEvent.click(lapTimeHeader);
    expect(sortSelect.value).toBe('lap-asc');

    fireEvent.click(lapTimeHeader);
    expect(sortSelect.value).toBe('lap-desc');
  });

  it('allows toggling Hide Empty Laps filter', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    await waitFor(() => {
      expect(screen.getByText('Hide Empty Laps')).toBeInTheDocument();
    });

    const hideEmptyBtn = screen.getByText('Hide Empty Laps');
    fireEvent.click(hideEmptyBtn);

    // Verify it can be toggled back
    fireEvent.click(hideEmptyBtn);
    expect(hideEmptyBtn).toBeInTheDocument();
  });

  it('loads both the requested session lap and personal best, and provides quick-add button when removed', async () => {
    render(
      <CompareLaps
        sessions={mockSessions}
        initialTrack="Spa"
        initialCarClass="LMGT3"
        initialSessionId="sess1"
        initialLapNum={1}
      />
    );

    await waitFor(() => {
      // Both Lap 1 (2:02.500) and Personal Best Lap 2 (2:01.800) are in the deck (2/4)
      expect(screen.getAllByText('2:02.500').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2:01.800').length).toBeGreaterThan(0);
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(2\/4\)/i)).toBeInTheDocument();
    });

    // Remove Personal Best lap from deck
    const removeButtons = screen.getAllByTitle('Remove from comparison');
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[1]); // remove PB lap

    await waitFor(() => {
      // Deck drops to 1/4 and + Personal Best button appears in toolbar
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(1\/4\)/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+ Personal Best \(2:01\.800\)/i })).toBeInTheDocument();
    });

    // Click + Personal Best button to re-add it easily
    const addPbBtn = screen.getByRole('button', { name: /\+ Personal Best \(2:01\.800\)/i });
    fireEvent.click(addPbBtn);

    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(2\/4\)/i)).toBeInTheDocument();
    });
  });

  it('highlights the fastest sectors in available laps table with distinct colors matching SessionDetail', async () => {
    render(
      <CompareLaps
        sessions={mockSessions}
        initialTrack="Spa"
        initialCarClass="LMGT3"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Available Laps on Spa/i)).toBeInTheDocument();
    });

    // In mockCompareData:
    // Lap 1 has s1: 30.5, s2: 45.5, s3: 46.5
    // Lap 2 has s1: 30.2, s2: 45.1, s3: 46.5 (Best S1, Best S2, and tied for Best S3)
    const bestS1Cell = screen.getByTitle('Best Sector 1');
    expect(bestS1Cell).toHaveClass('text-lmu-gold');
    expect(bestS1Cell).toHaveTextContent('30.200');

    const bestS2Cell = screen.getByTitle('Best Sector 2');
    expect(bestS2Cell).toHaveClass('text-lmu-blue');
    expect(bestS2Cell).toHaveTextContent('45.100');

    const bestS3Cells = screen.getAllByTitle('Best Sector 3');
    expect(bestS3Cells.length).toBeGreaterThan(0);
    expect(bestS3Cells[0]).toHaveClass('text-lmu-green');
  });

  it('clears default selections when changing to all drivers', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    // Initial load selects player's PB lap (2:01.800)
    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(1\/4\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('2:01.800').length).toBeGreaterThan(0);
    });

    // Switch Driver Scope to All Drivers
    const allDriversBtn = screen.getByRole('button', { name: /All Drivers/i });
    fireEvent.click(allDriversBtn);

    // All Drivers starts empty so the user can choose the comparison explicitly.
    await waitFor(() => {
      expect(screen.getByText('No Laps Selected for Comparison')).toBeInTheDocument();
    });

    // In the table, AI Driver's lap 3 is now available.
    await waitFor(() => {
      expect(screen.getByText('AI Driver')).toBeInTheDocument();
    });

    // Click + Compare on AI Driver's lap row
    const compareButtons = screen.getAllByRole('button', { name: /Compare/i });
    const aiCompareBtn = compareButtons.find(b => b.textContent?.includes('Compare'));
    expect(aiCompareBtn).toBeDefined();
    if (aiCompareBtn) {
      fireEvent.click(aiCompareBtn);
    }

    // The chosen all-driver lap is now in the comparison deck.
    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(1\/4\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('2:00.900').length).toBeGreaterThan(0);
    });

    // Switch back to Player Only
    const playerOnlyBtn = screen.getByRole('button', { name: /Player Only/i });
    fireEvent.click(playerOnlyBtn);

    // The explicit all-driver selection remains in the comparison deck.
    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(1\/4\)/i)).toBeInTheDocument();
      expect(screen.getAllByText('2:00.900').length).toBeGreaterThan(0);
    });
  });

  it('renders Compare Telemetry button when 2 laps are selected and launches comparison modal', async () => {
    const sessionsWithReplay = [
      {
        ...mockSessions[0],
        matchingReplayFile: { name: 'spa_p1.vcr', path: 'C:\\spa_p1.vcr', sizeBytes: 1024 },
      },
    ];

    render(
      <CompareLaps
        sessions={sessionsWithReplay}
        initialTrack="Spa GP"
        initialCarClass="LMGT3"
        initialSessionId="sess1"
        initialLapNum={1}
      />
    );

    // Two laps (Lap 1 & Personal Best Lap 2) are selected initially (2/4)
    await waitFor(() => {
      expect(screen.getByText(/Side-by-Side Lap Telemetry Comparison \(2\/4\)/i)).toBeInTheDocument();
    });

    // "Compare Telemetry" button is visible ONLY ONCE (in the chart header) and styled with green gradient
    const compareTelemetryButtons = screen.getAllByRole('button', { name: /Compare Telemetry/i });
    expect(compareTelemetryButtons).toHaveLength(1);
    expect(compareTelemetryButtons[0].className).toContain('from-emerald-500');
    expect(compareTelemetryButtons[0].className).toContain('to-teal-600');

    // Click "Compare Telemetry"
    fireEvent.click(compareTelemetryButtons[0]);

    // Modal dialog opens with return button
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTitle('Return to Lap Times')).toBeInTheDocument();
    });

    // Close the modal
    fireEvent.click(screen.getByTitle('Return to Lap Times'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});


