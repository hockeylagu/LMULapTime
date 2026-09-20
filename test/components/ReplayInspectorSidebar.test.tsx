import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReplayInspectorSidebar } from '../../src/components/replay/inspector/ReplayInspectorSidebar.js';
import { ReplayTrajectoryData } from '../../server/core/types.js';
import { CornerSegmentComparison } from '../../src/utils/cornerAnalysis.js';

describe('ReplayInspectorSidebar', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ configured: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const trajectory: ReplayTrajectoryData = {
    replayName: 'test_replay',
    trackLengthM: 1000,
    currentLap: 1,
    pointsCount: 3,
    bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 },
    points: [
      { x: 0, y: 0, z: 0, rotY: 0, speedKmh: 100, throttle: 100, brake: 0, timeSec: 0 },
      { x: 10, y: 0, z: 10, rotY: 0, speedKmh: 80, throttle: 0, brake: 100, timeSec: 0.5 },
      { x: 20, y: 0, z: 20, rotY: 0, speedKmh: 120, throttle: 100, brake: 0, timeSec: 1.0 },
    ],
  };

  const corner: CornerSegmentComparison = {
    type: 'corner',
    segmentIndex: 0,
    cornerNumber: 1,
    entryDistM: 0,
    minDistM: 10,
    exitDistM: 20,
    lengthM: 20,
    primaryTimeSec: 1.0,
    primaryEntrySpeedKmh: 100,
    baselineEntrySpeedKmh: 100,
    entrySpeedDeltaKmh: 0,
    primaryMinSpeedKmh: 80,
    baselineMinSpeedKmh: 80,
    minSpeedDeltaKmh: 0,
    primaryExitSpeedKmh: 120,
    baselineExitSpeedKmh: 120,
    exitSpeedDeltaKmh: 0,
    primaryBrakingDistM: 5,
    baselineBrakingDistM: 5,
    brakingPointDeltaM: 0,
    primaryThrottleOnDistM: 15,
    baselineThrottleOnDistM: 15,
    throttleOnDeltaM: 0,
    timeDeltaSec: 0,
  };

  const baseProps = {
    activeTab: 'corners' as const,
    setActiveTab: vi.fn(),
    cornerCount: 1,
    colorBy: 'pedal' as const,
    setColorBy: vi.fn(),
    isCompareMode: false,
    cornerSubView: 'compare' as const,
    setCornerSubView: vi.fn(),
    trajectory,
    currentIndex: 0,
    setCurrentIndex: vi.fn(),
    cornerSegments: [corner],
    selectedCornerNumber: null,
    handleSelectCorner: vi.fn(),
    baselineLapNumber: null,
    lapSegments: [corner],
    drivers: [],
    selectedDriverSlot: null,
    isSelfAnalysis: true,
    consistencyStats: { lapCount: 0, stats: [], leastConsistent: null },
    cornerConsistencyStats: [],
    isCornerConsistencyLoading: false,
    handleSelectBaselineLap: vi.fn(),
    formatLapTime: (s?: number | null) => `${s ?? 0}s`,
    availableConsistencyLaps: [],
    excludedConsistencyLaps: new Set<number>(),
    toggleConsistencyLap: vi.fn(),
  };

  it('renders double panel with GPS map on left and corners table on right when activeTab is corners', () => {
    render(<ReplayInspectorSidebar {...baseProps} />);

    // Header toggle buttons
    const cornersToggle = screen.getByRole('button', { name: /Corners \(1\)/i });
    const aiReportToggle = screen.getByRole('button', { name: /AI Report/i });
    expect(cornersToggle).toBeInTheDocument();
    expect(aiReportToggle).toBeInTheDocument();
    expect(cornersToggle).toHaveAttribute('aria-pressed', 'true');
    expect(aiReportToggle).toHaveAttribute('aria-pressed', 'false');

    // Close button on the same row as the tabs
    expect(screen.getByRole('button', { name: /Close side panel/i })).toBeInTheDocument();

    // Map elements present on the left
    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pedal Points/i })).toBeInTheDocument();

    // Corners table present on the right
    expect(screen.getAllByText('T1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /vs Baseline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Consistency/i })).toBeInTheDocument();
  });

  it('renders corner details docked under corners table when a corner is selected', () => {
    render(<ReplayInspectorSidebar {...baseProps} selectedCornerNumber={1} />);

    // Corner details rendered
    expect(screen.getByText(/Turn 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Entry Phase/i)).toBeInTheDocument();
    expect(screen.getByText(/Apex Phase/i)).toBeInTheDocument();
  });

  it('toggles corners panel closed (back to map) when active corners toggle is clicked', () => {
    const setActiveTab = vi.fn();
    render(<ReplayInspectorSidebar {...baseProps} setActiveTab={setActiveTab} />);

    fireEvent.click(screen.getByRole('button', { name: /Corners \(1\)/i }));
    expect(setActiveTab).toHaveBeenCalledWith('map');
  });

  it('closes side panel and clears corner selection when close (X) button on tabs row is clicked', () => {
    const setActiveTab = vi.fn();
    const handleSelectCorner = vi.fn();
    render(
      <ReplayInspectorSidebar
        {...baseProps}
        selectedCornerNumber={1}
        setActiveTab={setActiveTab}
        handleSelectCorner={handleSelectCorner}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Close side panel/i }));
    expect(setActiveTab).toHaveBeenCalledWith('map');
    expect(handleSelectCorner).toHaveBeenCalledWith(null);
  });

  it('renders single panel with GPS map only when activeTab is map', () => {
    render(<ReplayInspectorSidebar {...baseProps} activeTab="map" />);

    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close side panel/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/vs Baseline/i)).not.toBeInTheDocument();
  });

  it('renders AI Report alongside the GPS map when activeTab is ai-report and allows closing with X on tabs row', async () => {
    const setActiveTab = vi.fn();
    render(<ReplayInspectorSidebar {...baseProps} activeTab="ai-report" setActiveTab={setActiveTab} />);

    // Map is still present on the left
    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();

    // AI Report UI is on the right
    await waitFor(() => {
      expect(screen.getByText(/Select a completed lap to generate an AI report/i)).toBeInTheDocument();
    });

    // Close button on the same row as the tabs
    const closeBtn = screen.getByRole('button', { name: /Close side panel/i });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(setActiveTab).toHaveBeenCalledWith('map');
  });
});
