import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardHero } from '../../src/components/dashboard/DashboardHero.js';
import type { TrackBoundaryGeometry } from '../../src/components/replay/map/index.js';
import type { SessionSummary } from '../../src/components/dashboard/Dashboard.js';

describe('DashboardHero', () => {
  const mockGeometry: TrackBoundaryGeometry = {
    layoutKey: 'le_mans_24h',
    circuitId: 'le_mans',
    layoutId: '24h',
    trackVenue: 'Circuit de la Sarthe',
    trackCourse: '24 Heures du Mans',
    lengthM: 13626,
    bounds: { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000, spanX: 1000, spanZ: 1000 },
    leftBoundary: [[100, 100], [500, 800], [500, 100]],
    rightBoundary: [[120, 100], [520, 800], [520, 100]],
    centerline: [[110, 100], [510, 800], [510, 100]],
    startFinish: [110, 100],
  };
  const mockSessions: SessionSummary[] = [
    {
      id: 'session-old',
      filename: 'old.xml',
      trackVenue: 'Circuit de Spa-Francorchamps',
      timeString: '2026/09/20 14:00:00',
      sessionType: 'Race',
      sessionName: 'Race 1',
      driversCount: 20,
      playerDriver: {
        name: 'Samuel Lague',
        carType: 'BMW M4 LMGT3',
        carClass: 'LMGT3',
        bestLapTime: 138.5,
        bestLapTimeString: '2:18.500',
        bestS1: 40,
        bestS2: 50,
        bestS3: 48.5,
        theoreticalBest: 138.5,
        theoreticalBestString: '2:18.500',
        bestLapPacePercentage: 103.5,
        bestLapPaceCategory: 'Good',
        position: 10,
        lapsCount: 8,
        laps: [
          { lapNum: 1, position: 12, lapTime: 140, lapTimeString: '2:20.000', s1: null, s2: null, s3: null, topSpeed: 280, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
        ],
      },
    },
    {
      id: 'session-new',
      filename: 'new.xml',
      trackVenue: 'Circuit de la Sarthe',
      timeString: '2026/09/23 22:30:00',
      sessionType: 'Race',
      sessionName: 'Race 1',
      driversCount: 24,
      matchingReplayFile: {
        name: 'le_mans_gt3_100hz.Vcr',
        path: '/replays/le_mans_gt3_100hz.Vcr',
      },
      playerDriver: {
        name: 'Samuel Lague',
        carType: 'Chevrolet Corvette Z06 LMGT3.R',
        carClass: 'LMGT3',
        bestLapTime: 240.47,
        bestLapTimeString: '4:00.470',
        bestS1: 70,
        bestS2: 90,
        bestS3: 80.47,
        theoreticalBest: 240.47,
        theoreticalBestString: '4:00.470',
        bestLapPacePercentage: 102.4,
        bestLapPaceCategory: 'Good',
        position: 8,
        lapsCount: 6,
        gridPosition: 15,
        positionGain: 7,
        laps: [
          { lapNum: 1, position: 15, lapTime: 245, lapTimeString: '4:05.000', s1: null, s2: null, s3: null, topSpeed: 295, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
          { lapNum: 2, position: 8, lapTime: 240.47, lapTimeString: '4:00.470', s1: null, s2: null, s3: null, topSpeed: 298, fCompound: 'M', rCompound: 'M', isPitStop: false, isValid: true },
        ],
      },
    },
  ];

  it('renders welcome back greeting with driver name and active stint badge', () => {
    const onSelectSession = vi.fn();
    render(<DashboardHero sessions={mockSessions} onSelectSession={onSelectSession} trackGeometry={mockGeometry} />);

    expect(screen.getByText(/Welcome back,/i)).toBeInTheDocument();
    expect(screen.getByText('Samuel Lague')).toBeInTheDocument();
    expect(screen.getByText(/Active Stint/i)).toBeInTheDocument();
  });

  it('displays the latest outing spotlight details correctly with circuit layout outline', () => {
    const onSelectSession = vi.fn();
    render(<DashboardHero sessions={mockSessions} onSelectSession={onSelectSession} trackGeometry={mockGeometry} />);

    expect(screen.getByText('Circuit de la Sarthe')).toBeInTheDocument();
    expect(screen.getByText(/Chevrolet Corvette Z06 LMGT3.R/)).toBeInTheDocument();
    expect(screen.getByText('4:00.470')).toBeInTheDocument();
    expect(screen.getByText('P8')).toBeInTheDocument();
    expect(screen.getByText('(+7)')).toBeInTheDocument();
    expect(screen.getByText('(102.4%)')).toBeInTheDocument();

    // Verify track circuit layout outline element is rendered instead of a map pin
    const circuitLayout = screen.getByTestId('track-circuit-layout');
    expect(circuitLayout).toBeInTheDocument();
    fireEvent.click(circuitLayout);
    expect(onSelectSession).toHaveBeenCalledWith('session-new');
  });

  it('fires callbacks when clicking Replay and Session Details buttons with green standard replay styling', () => {
    const onSelectSession = vi.fn();
    const onOpenReplay = vi.fn();

    render(
      <DashboardHero
        sessions={mockSessions}
        onSelectSession={onSelectSession}
        onOpenReplay={onOpenReplay}
        trackGeometry={mockGeometry}
      />
    );

    const replayBtn = screen.getByTestId('hero-launch-replay-btn');
    expect(replayBtn).toBeInTheDocument();
    expect(replayBtn).toHaveTextContent('Launch Replay');
    expect(replayBtn.className).toContain('text-emerald-400');
    expect(replayBtn.className).toContain('border-emerald-500/30');

    fireEvent.click(replayBtn);
    expect(onOpenReplay).toHaveBeenCalledWith('session-new');

    const detailsBtn = screen.getByTestId('hero-inspect-session-btn');
    fireEvent.click(detailsBtn);
    expect(onSelectSession).toHaveBeenCalledWith('session-new');
  });

  it('renders red badge for Race session type', () => {
    render(<DashboardHero sessions={mockSessions} onSelectSession={vi.fn()} trackGeometry={mockGeometry} />);
    const badge = screen.getByTestId('hero-session-type-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Race');
    expect(badge.className).toContain('text-lmu-accent');
    expect(badge.className).toContain('bg-lmu-accent/20');
  });

  it('renders yellow 100Hz replay button when session has DuckDB telemetry', () => {
    const duckSessions = [
      {
        ...mockSessions[1],
        hasDuckDbTelemetry: true,
      },
    ];

    render(
      <DashboardHero
        sessions={duckSessions}
        onSelectSession={vi.fn()}
        onOpenReplay={vi.fn()}
        trackGeometry={mockGeometry}
      />
    );

    const replayBtn = screen.getByTestId('hero-launch-replay-btn');
    expect(replayBtn).toBeInTheDocument();
    expect(replayBtn).toHaveTextContent('Launch 100Hz Replay');
    expect(replayBtn.className).toContain('text-amber-300');
    expect(replayBtn.className).toContain('border-amber-500/40');
  });

  it('renders pace sparkline and recent momentum metrics', () => {
    render(<DashboardHero sessions={mockSessions} onSelectSession={vi.fn()} trackGeometry={mockGeometry} />);

    expect(screen.getByTestId('dashboard-pace-sparkline')).toBeInTheDocument();
    expect(screen.getByText(/Recent Form & Momentum/i)).toBeInTheDocument();
    expect(screen.getByText('Clean Lap Rate')).toBeInTheDocument();
    expect(screen.getByText('Lap Consistency')).toBeInTheDocument();
    expect(screen.getByText('Race Net Positions')).toBeInTheDocument();
    expect(screen.getByText('+7')).toBeInTheDocument(); // net positions
  });

  it('renders nothing when sessions list is empty', () => {
    const { container } = render(<DashboardHero sessions={[]} onSelectSession={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
