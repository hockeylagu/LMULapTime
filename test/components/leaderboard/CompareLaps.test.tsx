import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CompareLaps, telemetryPair } from '../../../src/components/leaderboard/index.js';
import type { ComparableLap } from '../../../shared/types/index.js';

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

  const lap = (lapNum: number, lapTime: number, lapTimeString: string, sectors: [number, number, number]) => ({
    id: `sess1_Sim Driver_lap_${lapNum}`,
    sessionId: 'sess1',
    sessionName: 'P1',
    sessionType: 'Practice',
    dateString: '2026/05/28 14:00',
    driverName: 'Sim Driver',
    carType: 'Ferrari 296 GT3',
    carClass: 'LMGT3',
    lapNum,
    lapTime,
    lapTimeString,
    s1: sectors[0],
    s2: sectors[1],
    s3: sectors[2],
    topSpeed: 280.0,
    isValid: true,
  });

  const mockCompareData = {
    laps: [lap(1, 122.5, '2:02.500', [30.5, 45.5, 46.5]), lap(2, 121.8, '2:01.800', [30.2, 45.1, 46.5])],
    allTimeBestLap: { ...lap(2, 121.8, '2:01.800', [30.2, 45.1, 46.5]), tag: '⭐ All-Time Best Lap' },
    overallTrackBestLap: {
      ...lap(5, 120.5, '2:00.500', [29.9, 44.8, 45.8]),
      id: 'sess1_Pro Driver_lap_5',
      driverName: 'Pro Driver',
      tag: '🏆 All-Time Best (Pro Driver)',
    },
    bestS1: 30.2,
    bestS2: 45.1,
    bestS3: 46.5,
    theoreticalBestSec: 121.8,
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
        expect(url).toContain('playerOnly=true');
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCompareData) });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  it('opens on the personal best, in one card without the lap table or its filters', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);

    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(1));
    expect(screen.getAllByRole('region', { name: 'Compare laps' })).toHaveLength(1);
    expect(screen.queryByText(/Available Laps/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /All Drivers/i })).not.toBeInTheDocument();
  });

  it('allows adding theoretical optimal and all-time track best laps on demand', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: /\+ Theoretical Best/i }));
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));

    // Two laps are compared at most: the all-time best joins the newest pick, the theoretical best.
    fireEvent.click(screen.getByRole('button', { name: /\+ All-Time Best/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /\+ Personal Best/i })).toBeInTheDocument());
    expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2);
  });

  it('adds the rival lap from the presets, then hides the preset', async () => {
    const rivalLap = {
      ...lap(3, 121.0, '2:01.000', [30.0, 45.0, 46.0]),
      id: 'board_Rival_lap',
      driverName: 'Rival',
      isPlayer: false,
    } as ComparableLap;
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" rivalLap={rivalLap} />);
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: /\+ Rival \(2:01\.000\)/ }));
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: /\+ Rival/ })).not.toBeInTheDocument();
    expect(screen.getByText('Your rival')).toBeInTheDocument();
  });

  it('works out where the time is on its own when the page asks to analyse the pair', async () => {
    const rivalLap = { ...lap(3, 121.0, '2:01.000', [30.0, 45.0, 46.0]), id: 'board_Rival_lap', driverName: 'Rival', isPlayer: false } as ComparableLap;
    const mine = { ...lap(2, 121.8, '2:01.800', [30.2, 45.1, 46.5]), isPlayer: true } as ComparableLap;
    render(
      <CompareLaps
        sessions={mockSessions}
        initialTrack="Spa"
        initialCarClass="LMGT3"
        compareRequest={{ key: 1, lap: mine, reference: rivalLap, analyse: true }}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('has no replay to compare with');
  });

  it('analyses the requested pair once: putting it back after removing a lap waits for the click', async () => {
    const rivalLap = { ...lap(3, 121.0, '2:01.000', [30.0, 45.0, 46.0]), id: 'board_Rival_lap', driverName: 'Rival', isPlayer: false } as ComparableLap;
    const mine = { ...lap(2, 121.8, '2:01.800', [30.2, 45.1, 46.5]), isPlayer: true } as ComparableLap;
    render(
      <CompareLaps
        sessions={mockSessions}
        initialTrack="Spa"
        initialCarClass="LMGT3"
        rivalLap={rivalLap}
        compareRequest={{ key: 1, lap: mine, reference: rivalLap, analyse: true }}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('has no replay to compare with');

    fireEvent.click(within(screen.getByTestId('compare-baseline')).getByTitle('Remove from comparison'));
    fireEvent.click(await screen.findByRole('button', { name: /\+ Rival/ }));
    expect(await screen.findByRole('button', { name: "Where's the time?" })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the comparison and says how to pick laps', async () => {
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" />);
    await waitFor(() => expect(screen.getByText('Clear')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => expect(screen.getByText('No laps selected for comparison')).toBeInTheDocument());
    expect(screen.getByText(/Pick two drivers on the leaderboard/)).toBeInTheDocument();
  });

  it('shows the lap time delta against the baseline, and swaps the baseline', async () => {
    render(
      <CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" initialSessionId="sess1" initialLapNum={1} />
    );
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));
    expect(screen.getByTestId('compare-baseline')).toHaveTextContent(/Sim Driver.*2:02\.500/);
    expect(screen.getByTestId('lap-time-delta')).toHaveTextContent('-0.700s');

    fireEvent.click(screen.getByRole('button', { name: /Swap baseline/i }));
    expect(screen.getByTestId('compare-baseline')).toHaveTextContent(/Sim Driver.*2:01\.800/);
    expect(screen.getByTestId('lap-time-delta')).toHaveTextContent('+0.700s');
  });

  it('loads both the requested session lap and personal best, and provides quick-add button when removed', async () => {
    render(
      <CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" initialSessionId="sess1" initialLapNum={1} />
    );
    await waitFor(() => {
      expect(screen.getAllByText('2:02.500').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2:01.800').length).toBeGreaterThan(0);
      expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2);
    });

    const removeButtons = screen.getAllByTitle('Remove from comparison');
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[1]);

    await waitFor(() => {
      expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(1);
      expect(screen.getByRole('button', { name: /\+ Personal Best \(2:01\.800\)/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ Personal Best \(2:01\.800\)/i }));
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));
  });

  it('restores the comparison session, driver, and lap as the active baseline', async () => {
    render(
      <CompareLaps
        sessions={mockSessions}
        initialTrack="Spa"
        initialCarClass="LMGT3"
        initialSessionId="sess1"
        initialLapNum={1}
        initialCompareSessionId="sess1"
        initialCompareDriver="Sim Driver"
        initialCompareLapNum={2}
      />
    );
    await waitFor(() => {
      expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2);
      expect(screen.getByTestId('compare-baseline')).toHaveTextContent(/Sim Driver.*2:01\.800/);
    });
  });

  it('reports the laps compared to the page', async () => {
    const onComparedLapsChange = vi.fn();
    render(<CompareLaps sessions={mockSessions} initialTrack="Spa" initialCarClass="LMGT3" onComparedLapsChange={onComparedLapsChange} />);
    await waitFor(() => expect(onComparedLapsChange).toHaveBeenLastCalledWith(['sess1_Sim Driver_lap_2']));
  });

  it('renders Compare Telemetry button when 2 laps are selected and navigates to telemetry', async () => {
    const sessionsWithReplay = [
      { ...mockSessions[0], matchingReplayFile: { name: 'spa_p1.vcr', path: 'C:\\spa_p1.vcr', sizeBytes: 1024 } },
    ];
    render(
      <CompareLaps sessions={sessionsWithReplay} initialTrack="Spa GP" initialCarClass="LMGT3" initialSessionId="sess1" initialLapNum={1} />
    );
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));

    const compareTelemetryButtons = screen.getAllByRole('link', { name: /Compare Telemetry/i });
    expect(compareTelemetryButtons).toHaveLength(1);
    fireEvent.click(compareTelemetryButtons[0]);

    await waitFor(() => {
      expect(window.location.hash).toContain('/telemetry?');
      expect(window.location.hash).toContain('replayName=spa_p1.vcr');
      expect(window.location.hash).toContain('compareSessionId=');
      expect(window.location.hash).toContain('compareLapNum=');
    });
  });

  it('displays error banner when replay files cannot be located for telemetry comparison', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/replays')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCompareData) });
    });
    render(
      <CompareLaps sessions={mockSessions} initialTrack="Spa GP" initialCarClass="LMGT3" initialSessionId="sess1" initialLapNum={1} />
    );
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Compare Telemetry/i }));
    await waitFor(() => {
      expect(screen.getByText(/Unable to locate replay recording \(\.vcr\) for:/i)).toBeInTheDocument();
    });
  });

  it('locates replay recordings dynamically via /api/replays when session does not have matchingReplayFile', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/replays')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ name: 'dyn_spa.vcr', matchedSessionId: 'sess1' }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCompareData) });
    });
    render(
      <CompareLaps sessions={mockSessions} initialTrack="Spa GP" initialCarClass="LMGT3" initialSessionId="sess1" initialLapNum={1} />
    );
    await waitFor(() => expect(screen.queryAllByTitle('Remove from comparison')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: /Compare Telemetry/i }));
    await waitFor(() => expect(window.location.hash).toContain('replayName=dyn_spa.vcr'));
  });
});

describe('telemetryPair', () => {
  const lap = (id: string, isPlayer = false) => ({ id, isPlayer } as ComparableLap);

  it("opens the player's lap against the other driver's, whichever is the baseline", () => {
    const me = lap('me', true);
    const rival = lap('rival');
    expect(telemetryPair([rival, me], me)).toEqual({ target: me, base: rival });
    expect(telemetryPair([me, rival], rival)).toEqual({ target: me, base: rival });
  });

  it('otherwise opens the lap against the baseline', () => {
    const p1 = lap('P1');
    const p2 = lap('P2');
    expect(telemetryPair([p1, p2], p2)).toEqual({ target: p1, base: p2 });
    expect(telemetryPair([p1, p2], null)).toEqual({ target: p2, base: p1 });
  });
});
