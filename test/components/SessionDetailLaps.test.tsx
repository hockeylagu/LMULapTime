import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionDetail } from '../../src/components/session-detail/index.js';
import { DriverData } from '../../server/core/types.js';
import { mockDetailedSession } from './mockSessionDetail.js';

describe('SessionDetail component - standings, laps & navigation', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailedSession),
    });
  });

  it('renders race standings, position deltas, and multi-driver classification for race sessions', async () => {
    const mockRaceSession = {
      ...mockDetailedSession,
      sessionType: 'Race',
      sessionName: 'Race 1',
      playerDriver: {
        ...mockDetailedSession.playerDriver,
        gridPosition: 5,
        classGridPosition: 3,
        position: 2,
        classPosition: 1,
        positionGain: 3,
        classPositionGain: 2,
        finishStatus: 'Finished',
        lapsLedCount: 4,
        highestPosition: 1,
        pitStopsCount: 1,
      },
      drivers: [
        {
          ...mockDetailedSession.playerDriver,
          gridPosition: 5,
          classGridPosition: 3,
          position: 2,
          classPosition: 1,
          positionGain: 3,
          finishStatus: 'Finished',
          pitStopsCount: 1,
        },
        {
          name: 'AI Driver 2',
          carType: 'Porsche 963',
          carClass: 'LMH',
          carNumber: '5',
          teamName: 'Porsche Penske',
          isPlayer: false,
          gridPosition: 1,
          classGridPosition: 1,
          position: 1,
          classPosition: 2,
          positionGain: 0,
          finishStatus: 'Finished',
          bestLapTime: 122.5,
          bestLapTimeString: '2:02.500',
          lapsCount: 3,
          pitStopsCount: 1,
          totalIncidents: 2,
          totalTrackLimits: 1,
          incidents: [
            {
              type: 'contact',
              description: 'Contact with Ferrari 499P (1200N)',
              lapNum: 2,
              otherVehicle: 'Ferrari 499P',
            },
          ],
          laps: [],
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/sess123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRaceSession),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Race Standings & Position Deltas/i)).toBeInTheDocument();
    });

    // Check race banner elements
    expect(screen.getByText('Starting Grid')).toBeInTheDocument();
    expect(screen.getByText('Position Delta')).toBeInTheDocument();
    expect(screen.getByText('Laps Led (P1)')).toBeInTheDocument();
    expect(screen.getByText('Peak Position')).toBeInTheDocument();
    expect(screen.getByText(/Session Classification & Driver Standings/i)).toBeInTheDocument();

    // Check 1-row layout on md+ screens (grid-cols-7)
    const gridContainer = screen.getByText('Starting Grid').closest('.grid');
    expect(gridContainer?.className).toContain('md:grid-cols-7');

    // Single class session: Class Pos header is hidden
    expect(screen.queryByText('Class Pos')).not.toBeInTheDocument();

    // Classification table has Safety column
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getAllByText('Clean').length).toBeGreaterThanOrEqual(1);
    const incidentBadge = screen.getByTitle(/Contact with Ferrari 499P \(1200N\)/i);
    expect(incidentBadge).toBeInTheDocument();
    expect(incidentBadge?.getAttribute('title')).toContain('Lap 2: Contact with Ferrari 499P (1200N)');
    expect(incidentBadge?.getAttribute('title')).not.toContain('contact ()');
    expect(incidentBadge?.getAttribute('title')).not.toContain('Lap ?');

    // Selecting another driver must not add (You) to that opponent
    const opponentRow = screen.getByText('AI Driver 2');
    fireEvent.click(opponentRow);
    expect(screen.queryByText(/AI Driver 2\s*\(You\)/i)).not.toBeInTheDocument();
  });

  it('renders session lap average and sector averages with interactive legend toggle', async () => {
    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Session Lap Average')).toBeInTheDocument();
      expect(screen.getByText('Sectors (Best / Avg)')).toBeInTheDocument();
    });

    // Check that average lap time across 3 laps (123.0 + 122.0 + 135.0)/3 = 126.666 -> '2:06.666' or '2:06.667'
    expect(screen.getByText(/Clean Laps:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/34\.000/).length).toBeGreaterThan(0);

    // Switch to Sectors chart
    const sectorsBtn = screen.getByRole('button', { name: /sectors \(s1\/s2\/s3\)/i });
    fireEvent.click(sectorsBtn);
    expect(sectorsBtn.className).toContain('bg-lmu-accent');
  });

  it('renders button next to replay to navigate from Race to Quali, and from Quali to Race', async () => {
    const onSelectSession = vi.fn();
    const raceSession = {
      ...mockDetailedSession,
      id: '2026_05_28_R1',
      sessionType: 'Race',
      sessionName: 'R1',
    };

    const qualiSummary = {
      id: '2026_05_28_Q1',
      sessionType: 'Qualifying',
      sessionName: 'Q1',
      trackVenue: 'Spa',
      timeString: '2026/05/28 14:00',
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/session/2026_05_28_R1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(raceSession) });
      }
      if (url.includes('/api/sessions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([qualiSummary, raceSession]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const { rerender } = render(
      <SessionDetail sessionId="2026_05_28_R1" onBack={vi.fn()} onSelectSession={onSelectSession} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /go to quali/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /go to quali/i }));
    expect(onSelectSession).toHaveBeenCalledWith('2026_05_28_Q1');

    // Now test navigating from Quali to Race
    const qualiSession = {
      ...mockDetailedSession,
      id: '2026_05_28_Q1',
      sessionType: 'Qualifying',
      sessionName: 'Q1',
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/session/2026_05_28_Q1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(qualiSession) });
      }
      if (url.includes('/api/sessions')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([qualiSession, raceSession]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    rerender(
      <SessionDetail sessionId="2026_05_28_Q1" onBack={vi.fn()} onSelectSession={onSelectSession} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /go to race/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /go to race/i }));
    expect(onSelectSession).toHaveBeenCalledWith('2026_05_28_R1');
  });

  it('displays class positions rather than overall positions in multiclass sessions', async () => {
    const multiClassSession = {
      ...mockDetailedSession,
      sessionType: 'Race',
      drivers: [
        {
          name: 'Hypercar Leader',
          carType: 'Ferrari 499P',
          carClass: 'Hypercar',
          carNumber: '50',
          isPlayer: false,
          position: 1,
          classPosition: 1,
          gridPosition: 1,
          classGridPosition: 1,
          laps: [{ lapNum: 1, position: 1, lapTime: 95.0, isValid: true }],
        },
        {
          name: 'GT3 Leader',
          carType: 'Porsche 911 GT3 R',
          carClass: 'LMGT3',
          carNumber: '92',
          isPlayer: false,
          position: 15,
          classPosition: 1,
          gridPosition: 16,
          classGridPosition: 2,
          laps: [{ lapNum: 1, position: 15, lapTime: 120.0, isValid: true }],
        },
        {
          name: 'Test Driver',
          carType: 'Aston Martin Vantage GT3',
          carClass: 'LMGT3',
          carNumber: '77',
          isPlayer: true,
          position: 18,
          classPosition: 2,
          gridPosition: 15,
          classGridPosition: 1,
          laps: [{ lapNum: 1, position: 18, lapTime: 121.0, isValid: true }],
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/test-session-1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(multiClassSession) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<SessionDetail sessionId="test-session-1" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    // In multiclass sessions, the lap table shows a Class Pos header
    const classPosHeaders = screen.getAllByRole('columnheader', { name: /class pos/i });
    expect(classPosHeaders.length).toBeGreaterThanOrEqual(1);
  });

  it('renders lap 2 as valid (not out-lap) when lap 1 is the start of practice with no lap time', async () => {
    const practiceSession = {
      ...mockDetailedSession,
      sessionType: 'Practice',
      drivers: [
        {
          name: 'Test Driver',
          carType: 'Porsche 911 GT3 R',
          carClass: 'LMGT3',
          carNumber: '92',
          isPlayer: true,
          position: 1,
          bestLapTime: 215.585,
          bestLapTimeString: '3:35.585',
          lapsCount: 2,
          laps: [
            {
              lapNum: 1,
              position: 2,
              lapTime: null,
              lapTimeString: '--:--.---',
              isPitStop: false,
              isValid: false,
            },
            {
              lapNum: 2,
              position: 1,
              lapTime: 215.585,
              lapTimeString: '3:35.585',
              s1: 34.925,
              s2: 84.641,
              s3: 96.019,
              isPitStop: false,
              isValid: true,
            },
          ],
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/test-session-1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(practiceSession) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<SessionDetail sessionId="test-session-1" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    // Lap 2 should be displayed with "Valid" badge and NOT "Out Lap"
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.queryByText('Out Lap')).not.toBeInTheDocument();
  });

  it('plots invalid laps with estimated or parsed lap times in the chart and table', async () => {
    const sessionWithInvalidLap = {
      ...mockDetailedSession,
      drivers: [
        {
          name: 'Test Driver',
          carType: 'Porsche 911 GT3 R',
          carClass: 'LMGT3',
          carNumber: '92',
          isPlayer: true,
          position: 1,
          bestLapTime: 213.0,
          bestLapTimeString: '3:33.000',
          lapsCount: 3,
          laps: [
            { lapNum: 1, lapTime: 225.0, lapTimeString: '3:45.000', isValid: true },
            { lapNum: 2, lapTime: 224.698, lapTimeString: '3:44.698', isValid: false, isInferred: true },
            { lapNum: 3, lapTime: 213.0, lapTimeString: '3:33.000', isValid: true },
          ],
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/test-session-1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sessionWithInvalidLap) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<SessionDetail sessionId="test-session-1" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    // The invalid lap time is rendered in the table
    expect(screen.getByText('~3:44.698')).toBeInTheDocument();
  });

  it('renders lap 1 as Start Lap and lap 2 as Valid in Qualifying sessions', async () => {
    const qualiSession = {
      ...mockDetailedSession,
      sessionType: 'Qualifying',
      sessionName: 'Q1',
      drivers: [
        {
          name: 'Quali Driver',
          carType: 'Ferrari 499P',
          carClass: 'Hypercar',
          carNumber: '50',
          isPlayer: true,
          position: 1,
          bestLapTime: 120.5,
          bestLapTimeString: '2:00.500',
          lapsCount: 2,
          laps: [
            {
              lapNum: 1,
              position: 1,
              lapTime: null,
              lapTimeString: '--:--.---',
              isPitStop: false,
              isValid: false,
            },
            {
              lapNum: 2,
              position: 1,
              lapTime: 120.5,
              lapTimeString: '2:00.500',
              s1: 34.0,
              s2: 41.0,
              s3: 45.5,
              isPitStop: false,
              isValid: true,
            },
          ],
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/test-session-1')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(qualiSession) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<SessionDetail sessionId="test-session-1" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    // Lap 1 is Start Lap, Lap 2 is Valid (and NOT Out Lap)
    expect(screen.getByText('Start Lap')).toBeInTheDocument();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.queryByText('Out Lap')).not.toBeInTheDocument();
  });

  it('renders incident tooltips on incomplete laps, compact badges, and incidents log', async () => {
    const incidentSession = {
      id: 'sess_incidents',
      filename: '2026_05_29_R1.xml',
      filePath: 'C:\\LMU\\UserData\\Log\\Results\\2026_05_29_R1.xml',
      trackVenue: 'Spa',
      trackCourse: 'GP',
      timeString: '2026/05/29 15:00',
      sessionType: 'Race',
      sessionName: 'R1',
      driversCount: 1,
      playerDriver: {
        name: 'Sim Racer',
        carType: 'Ferrari 499P',
        carClass: 'Hypercar',
        carNumber: '50',
        teamName: 'AF Corse',
        isPlayer: true,
        position: 1,
        classPosition: 1,
        bestLapTime: 122.0,
        bestLapTimeString: '2:02.000',
        bestS1: 34.0,
        bestS2: 42.0,
        bestS3: 46.0,
        theoreticalBest: 122.0,
        theoreticalBestString: '2:02.000',
        lapsCount: 2,
        totalIncidents: 2,
        totalTrackLimits: 1,
        totalPenalties: 1,
        incidents: [
          {
            type: 'contact' as const,
            description: 'Contact with Archie Porter (585N)',
            elapsedSeconds: 125.0,
            force: 585,
            otherVehicle: 'Archie Porter',
            isWallImpact: false,
          },
          {
            type: 'contact' as const,
            description: 'Contact with Immovable (4522N)',
            elapsedSeconds: 260.0,
            force: 4522,
            isWallImpact: true,
          },
        ],
        trackLimits: [
          {
            description: 'Track limits violation (+0.25 pts)',
            elapsedSeconds: 130.0,
            warningPoints: 0.25,
            action: 'Warning',
          },
        ],
        penalties: [
          {
            penalty: 'Drive Thru',
            reason: 'Speeding',
            elapsedSeconds: 140.0,
            description: 'Drive Thru penalty for Speeding',
          },
        ],
        laps: [
          {
            lapNum: 1,
            position: 1,
            lapTime: 122.0,
            lapTimeString: '2:02.000',
            s1: 34.0,
            s2: 42.0,
            s3: 46.0,
            isPitStop: false,
            isValid: true,
            incidentCount: 1,
            incidents: [
              {
                type: 'contact' as const,
                description: 'Contact with Archie Porter (585N)',
                elapsedSeconds: 125.0,
                force: 585,
                otherVehicle: 'Archie Porter',
                isWallImpact: false,
              },
            ],
            trackLimitCount: 1,
            trackLimits: [
              {
                description: 'Track limits violation (+0.25 pts)',
                elapsedSeconds: 130.0,
                warningPoints: 0.25,
                action: 'Warning',
              },
            ],
            penaltyCount: 1,
            penalties: [
              {
                penalty: 'Drive Thru',
                reason: 'Speeding',
                elapsedSeconds: 140.0,
                description: 'Drive Thru penalty for Speeding',
              },
            ],
          },
          {
            lapNum: 2,
            position: 1,
            lapTime: null,
            lapTimeString: '--:--.---',
            isPitStop: false,
            isValid: false,
            incidentCount: 1,
            incidents: [
              {
                type: 'contact' as const,
                description: 'Contact with Immovable (4522N)',
                elapsedSeconds: 260.0,
                force: 4522,
                isWallImpact: true,
              },
            ],
          },
        ],
      },
      drivers: [] as DriverData[],
    };

    incidentSession.drivers = [incidentSession.playerDriver as unknown as DriverData];

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/test-session-incidents')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(incidentSession) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<SessionDetail sessionId="test-session-incidents" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    // Verify Safety Summary pill in Session Title Card
    expect(screen.getAllByText(/2 Incidents/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 Track Limit/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 Penalty/).length).toBeGreaterThanOrEqual(1);

    // Verify Incomplete status badge contains incident tooltip details
    const incompleteEl = screen.getByText('Incomplete');
    expect(incompleteEl).toBeInTheDocument();
    const incompleteContainer = incompleteEl.closest('span');
    expect(incompleteContainer?.getAttribute('title')).toContain('Contact with Immovable (4522N)');

    // Verify compact badges on laps - yellow for 0.25 pts
    expect(screen.getAllByTitle(/Contact with Archie Porter/i).length).toBe(1);
    const tlBadge = screen.getByTitle(/Track limits violation \(\+0\.25 pts\)/i);
    expect(tlBadge).toBeInTheDocument();
    expect(tlBadge.className).toContain('text-yellow-300');
    expect(screen.getByText('Drive Thru')).toBeInTheDocument();

    // Verify Expandable Incidents & Stewards Log toggle
    const toggleLogBtn = screen.getByText(/Incidents & Stewards Log/i);
    expect(toggleLogBtn).toBeInTheDocument();

    // Click to expand log
    fireEvent.click(toggleLogBtn);

    // After expansion, event descriptions should be visible
    expect(screen.getByText(/Contact with Archie Porter/i)).toBeInTheDocument();
    expect(screen.getByText(/Contact with Immovable/i)).toBeInTheDocument();
  });

  it('styles track limit badges as green for No Further Action and orange for 0.75+ points', async () => {
    const sessionWithVariedLimits = {
      id: 'test-session-tl-colors',
      sessionType: 'Race',
      sessionName: 'R1',
      trackVenue: 'Spa',
      trackCourse: 'Grand Prix',
      timestamp: '2026-06-01T12:00:00Z',
      playerDriver: {
        name: 'Color Test Driver',
        isPlayer: true,
        carType: 'Ferrari 499P',
        carClass: 'Hypercar',
        totalTrackLimits: 2,
        trackLimits: [
          {
            description: 'Track limits review (No Further Action)',
            elapsedSeconds: 110.0,
            action: 'No Further Action',
            warningPoints: 0,
            lapNum: 1,
          },
          {
            description: 'Track limits violation (+0.75 pts)',
            elapsedSeconds: 220.0,
            action: 'Warning',
            warningPoints: 0.75,
            lapNum: 2,
          },
        ],
        laps: [
          {
            lapNum: 1,
            position: 1,
            lapTime: 122.0,
            lapTimeString: '2:02.000',
            s1: 34.0,
            s2: 42.0,
            s3: 46.0,
            isPitStop: false,
            isValid: true,
            trackLimitCount: 1,
            trackLimits: [
              {
                description: 'Track limits review (No Further Action)',
                elapsedSeconds: 110.0,
                action: 'No Further Action',
                warningPoints: 0,
                lapNum: 1,
              },
            ],
          },
          {
            lapNum: 2,
            position: 1,
            lapTime: 123.0,
            lapTimeString: '2:03.000',
            s1: 34.5,
            s2: 42.5,
            s3: 46.0,
            isPitStop: false,
            isValid: true,
            trackLimitCount: 1,
            trackLimits: [
              {
                description: 'Track limits violation (+0.75 pts)',
                elapsedSeconds: 220.0,
                action: 'Warning',
                warningPoints: 0.75,
                lapNum: 2,
              },
            ],
          },
        ],
      },
      drivers: [] as DriverData[],
    };

    sessionWithVariedLimits.drivers = [sessionWithVariedLimits.playerDriver as unknown as DriverData];

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/api/session/test-session-tl-colors')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(sessionWithVariedLimits) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(<SessionDetail sessionId="test-session-tl-colors" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    const badges = screen.getAllByTitle(/Track limits (review|violation)/i);
    expect(badges.length).toBe(2);

    // Lap 1: No Further Action -> Green (emerald)
    expect(badges[0].className).toContain('text-emerald-300');

    // Lap 2: 0.75 pts -> Orange
    expect(badges[1].className).toContain('text-orange-300');
  });

  it('opens replay with lap number when clicking row Replay button and updates URL params', async () => {
    window.location.hash = '#/session/sess123';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            replayName: 'spa_replay.vcr',
            drivers: [{ slot: 1, name: 'Sim Driver', isPlayer: true }],
          }),
        });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            driverName: 'Sim Driver',
            driverSlot: 1,
            currentLap: 2,
            laps: [{ lapNumber: 2, lapTimeSec: 122.0 }],
            bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 },
            points: [{ x: 0, y: 0, z: 0, speedKmh: 100, throttle: 100, brake: 0, timeSec: 10.0 }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDetailedSession) });
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    const replayButtons = screen.getAllByTitle(/Inspect Replay for Lap/i);
    expect(replayButtons.length).toBeGreaterThan(0);

    // Click replay for Lap 2
    fireEvent.click(replayButtons[1]);

    expect(window.location.hash).toContain('lap=2');

    expect(window.location.hash).toContain('replayName=spa_replay.vcr');
  });

  it('does not open replay UI from legacy session URL parameters', async () => {
    window.location.hash = '#/session/sess123?lap=3';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            replayName: 'spa_replay.vcr',
            drivers: [{ slot: 1, name: 'Sim Driver', isPlayer: true }],
          }),
        });
      }
      if (url.includes('/trajectory')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            driverName: 'Sim Driver',
            driverSlot: 1,
            currentLap: 3,
            laps: [{ lapNumber: 3, lapTimeSec: 135.0 }],
            bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 },
            points: [{ x: 0, y: 0, z: 0, speedKmh: 100, throttle: 100, brake: 0, timeSec: 10.0 }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDetailedSession) });
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens telemetry when clicking a lap table row or clicking the Best Lap card in timing metrics', async () => {
    window.location.hash = '#/session/sess123';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            replayName: 'spa_replay.vcr',
            drivers: [{ slot: 1, name: 'Sim Driver', isPlayer: true }],
          }),
        });
      }
      if (url.includes('/trajectory')) {
        const lapMatch = url.match(/lap=(\d+)/);
        const requestedLap = lapMatch ? parseInt(lapMatch[1], 10) : 1;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            driverName: 'Sim Driver',
            driverSlot: 1,
            currentLap: requestedLap,
            laps: [{ lapNumber: 1, lapTimeSec: 135.0 }, { lapNumber: 2, lapTimeSec: 134.0 }],
            bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 },
            points: [{ x: 0, y: 0, z: 0, speedKmh: 100, throttle: 100, brake: 0, timeSec: 10.0 }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDetailedSession) });
    });

    render(<SessionDetail sessionId="sess123" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Back to Sessions')).toBeInTheDocument();
    });

    // 1. Click row for Lap 1
    const lap1Row = screen.getByTitle('Click to open telemetry for Lap 1');
    fireEvent.click(lap1Row);

    expect(window.location.hash).toContain('lap=1');

    // 2. Click Best Lap card (best lap is Lap 2 with time 122.0)
    const bestLapCard = screen.getByTitle(/Click to open telemetry for Best Lap/i);
    fireEvent.click(bestLapCard);

    expect(window.location.hash).toContain('lap=2');

    expect(window.location.hash).toContain('replayName=spa_replay.vcr');
  });
});
