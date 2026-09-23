import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CornerApexChart } from '../../src/components/replay/index.js';
import { CornerSegmentComparison } from '../../src/utils/cornerAnalysis.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

describe('CornerApexChart', () => {
  const corner: CornerSegmentComparison = {
    type: 'corner',
    segmentIndex: 0,
    cornerNumber: 3,
    entryDistM: 0,
    minDistM: 20,
    exitDistM: 40,
    lengthM: 40,
    primaryTimeSec: 1.2,
    primaryEntrySpeedKmh: 180,
    baselineEntrySpeedKmh: 175,
    entrySpeedDeltaKmh: 5,
    primaryMinSpeedKmh: 85,
    baselineMinSpeedKmh: 90,
    minSpeedDeltaKmh: -5,
    primaryExitSpeedKmh: 150,
    baselineExitSpeedKmh: 145,
    exitSpeedDeltaKmh: 5,
    primaryBrakingDistM: 5,
    baselineBrakingDistM: 5,
    brakingPointDeltaM: 0,
    primaryThrottleOnDistM: 30,
    baselineThrottleOnDistM: 30,
    throttleOnDeltaM: 0,
    timeDeltaSec: -0.1,
  };

  function buildPoints(speeds: number[]): ReplayTrajectoryPoint[] {
    return speeds.map((speedKmh, i) => ({
      x: i * 10,
      y: 0,
      z: 0,
      rotY: 0,
      speedKmh,
      throttle: 50,
      brake: 0,
      timeSec: i * 0.5,
    }));
  }

  const primaryPoints = buildPoints([180, 150, 120, 85, 110, 150]);
  const primaryDists = primaryPoints.map((_, i) => i * 10);

  it('renders the corner number heading and entry/min/exit speed callouts', () => {
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    expect(screen.getByText(/Turn 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Entry Phase/i)).toBeInTheDocument();
    expect(screen.getByText('180')).toBeInTheDocument();
    expect(screen.getByText(/Rotation Phase/i)).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText(/Exit Phase/i)).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('does not render a close button when onClose is omitted', () => {
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    expect(screen.queryByLabelText(/Close corner detail/i)).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        onClose={onClose}
      />
    );

    screen.getByLabelText(/Close corner detail/i).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a dashed baseline path when baseline points are provided', () => {
    const baselinePoints = buildPoints([175, 145, 115, 90, 105, 145]);
    const baselineDists = baselinePoints.map((_, i) => i * 10);

    const { container } = render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        baselinePoints={baselinePoints}
        baselineDists={baselineDists}
      />
    );

    const chartSvg = container.querySelector('[data-chart="speed-profile"] svg') ?? Array.from(container.querySelectorAll('svg')).find(el => !el.classList.contains('lucide'));
    const paths = chartSvg?.querySelectorAll('path') ?? [];
    expect(paths.length).toBe(2);
    expect(paths[0].getAttribute('stroke')).toBe('#f59e0b');
  });

  it('renders only the primary path when no baseline is provided', () => {
    const { container } = render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    const chartSvg = container.querySelector('[data-chart="speed-profile"] svg') ?? Array.from(container.querySelectorAll('svg')).find(el => !el.classList.contains('lucide'));
    const paths = chartSvg?.querySelectorAll('path') ?? [];
    expect(paths.length).toBe(1);
    expect(paths[0].getAttribute('stroke')).toBe('#38bdf8');
  });

  it('renders telemetry metrics in solo mode', () => {
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        isCompareMode={false}
      />
    );

    expect(screen.getByText('1.200s')).toBeInTheDocument();
    expect(screen.getByText('15m')).toBeInTheDocument(); // Brake point relative to apex (20m - 5m)
    expect(screen.getByText('10m')).toBeInTheDocument(); // Throttle point relative to apex (30m - 20m)
    expect(screen.getByText('40m')).toBeInTheDocument(); // Corner length
  });

  it('renders telemetry deltas in compare mode', () => {
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        isCompareMode={true}
      />
    );

    expect(screen.getByText('Brake Δ')).toBeInTheDocument();
    expect(screen.getByText('Thr 15% Δ')).toBeInTheDocument();
    expect(screen.getByText('Thr 90% Δ')).toBeInTheDocument();
    expect(screen.getByText('Δ Time')).toBeInTheDocument();
    expect(screen.getByText('-0.100s')).toBeInTheDocument();
  });

  it('renders technique deck with rotation complete, turn-in point, and track usage', () => {
    const techniqueCorner: CornerSegmentComparison = {
      ...corner,
      cornerAngleDeg: 92,
      turnDirection: 'right',
      primaryTurnInDistM: 10,
      primaryRotationAtThrottlePct: 82,
      primaryInitialThrottleDistM: 26,
      baselineInitialThrottleDistM: 28,
      initialThrottleDeltaM: -2,
      primaryTrackUsage: {
        entryOffsetM: 3.2,
        apexMarginM: 0.3,
        exitWidthM: 4.1,
        totalSweepM: 6.7,
      },
    };

    render(
      <CornerApexChart
        corner={techniqueCorner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        isCompareMode={true}
      />
    );

    expect(screen.getByText(/92° right/i)).toBeInTheDocument();
    expect(screen.getByText('Rotation')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('Thr 15% Δ')).toBeInTheDocument();
    expect(screen.getByText('-2m')).toBeInTheDocument();
    expect(screen.getByText('Thr 90% Δ')).toBeInTheDocument();
    expect(screen.queryByText(/Optimal \(Rotated\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/88\/100/i)).not.toBeInTheDocument();
    expect(screen.getByText('Exit Space Δ')).toBeInTheDocument();
    expect(screen.getByText('6.7m')).toBeInTheDocument();
  });

  it('renders exit space left and exit space delta correctly', () => {
    const exitSpaceCorner: CornerSegmentComparison = {
      ...corner,
      exitSpaceDeltaM: -0.8,
      primaryTrackUsage: {
        entryOffsetM: 3.2,
        apexMarginM: 0.3,
        exitWidthM: 5.5,
        exitSpaceLeftM: 0.5,
      },
    };

    const { rerender } = render(
      <CornerApexChart
        corner={exitSpaceCorner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        isCompareMode={false}
      />
    );

    expect(screen.getByText('Exit Space')).toBeInTheDocument();
    expect(screen.getByText('0.5m')).toBeInTheDocument();
    expect(screen.getByText('left')).toBeInTheDocument();

    rerender(
      <CornerApexChart
        corner={exitSpaceCorner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        isCompareMode={true}
      />
    );

    expect(screen.getByText('Exit Space Δ')).toBeInTheDocument();
    expect(screen.getByText('-0.8m')).toBeInTheDocument();
  });

  it('renders compact micro-bar without the technique deck and triggers onOpenCornersTab', () => {
    const onOpenCornersTab = vi.fn();
    const onClose = vi.fn();

    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        compact={true}
        onOpenCornersTab={onOpenCornersTab}
        onClose={onClose}
      />
    );

    // Micro-bar elements are present
    expect(screen.getByText(/Turn 3/i)).toBeInTheDocument();
    expect(screen.getByText(/ENTRY 180/i)).toBeInTheDocument();
    expect(screen.getByText(/MIN 85/i)).toBeInTheDocument();
    expect(screen.getByText(/EXIT 150/i)).toBeInTheDocument();

    // The heavy technique deck should NOT be rendered in compact mode
    expect(screen.queryByText(/Apex Geometry & Track Usage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Technique Dynamics/i)).not.toBeInTheDocument();

    // Clicking Technique triggers onOpenCornersTab
    const techniqueBtn = screen.getByRole('button', { name: /Technique/i });
    techniqueBtn.click();
    expect(onOpenCornersTab).toHaveBeenCalledTimes(1);

    // Clicking Close triggers onClose
    screen.getByLabelText(/Close corner detail/i).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders synchronized scrub line with current vehicle speed when currentIndex is within corner', () => {
    // index 2 is at distance 20m (within corner 0m..40m), speed 120 km/h
    render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        currentIndex={2}
      />
    );

    expect(screen.getByText('120 km/h')).toBeInTheDocument();
  });

  it('triggers onSelectIndex when clicking the speed profile chart to seek', () => {
    const onSelectIndex = vi.fn();
    const { container } = render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
        onSelectIndex={onSelectIndex}
      />
    );

    const scrubArea = container.querySelector('[title="Click or drag to scrub replay at this corner"]') as HTMLElement;
    expect(scrubArea).toBeInTheDocument();

    // Mock getBoundingClientRect
    vi.spyOn(scrubArea, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 95,
      right: 100,
      bottom: 95,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Click at 50% across (x: 50) -> target dist 20m -> index 2
    scrubArea.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50, bubbles: true }));
    expect(onSelectIndex).toHaveBeenCalledTimes(1);
    expect(onSelectIndex).toHaveBeenCalledWith(2);
  });

  it('does not render the mini gps map', () => {
    const { container } = render(
      <CornerApexChart
        corner={corner}
        primaryPoints={primaryPoints}
        primaryDists={primaryDists}
      />
    );

    expect(screen.queryByRole('button', { name: /toggle pedal markers/i })).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="gps-track-map"]')).not.toBeInTheDocument();
  });
});

