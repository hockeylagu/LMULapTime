import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryCornerStrip } from '../../src/components/replay/telemetry/TelemetryCornerStrip.js';
import { CornerSegmentComparison } from '../../src/utils/cornerAnalysis.js';

const mockCorners: CornerSegmentComparison[] = [
  {
    type: 'corner',
    segmentIndex: 1,
    cornerNumber: 1,
    entryDistM: 300,
    minDistM: 450,
    exitDistM: 600,
    lengthM: 300,
    primaryTimeSec: 3.52,
    timeDeltaSec: 0.12,
    primaryEntrySpeedKmh: 180,
    baselineEntrySpeedKmh: 185,
    entrySpeedDeltaKmh: -5,
    primaryMinSpeedKmh: 95,
    baselineMinSpeedKmh: 100,
    minSpeedDeltaKmh: -5,
    primaryExitSpeedKmh: 140,
    baselineExitSpeedKmh: 142,
    exitSpeedDeltaKmh: -2,
    primaryBrakingDistM: 320,
    baselineBrakingDistM: 330,
    brakingPointDeltaM: -10,
    primaryThrottleOnDistM: 470,
    baselineThrottleOnDistM: 460,
    throttleOnDeltaM: 10,
  },
  {
    type: 'corner',
    segmentIndex: 3,
    cornerNumber: 2,
    entryDistM: 1100,
    minDistM: 1250,
    exitDistM: 1400,
    lengthM: 300,
    primaryTimeSec: 4.15,
    timeDeltaSec: -0.08,
    primaryEntrySpeedKmh: 200,
    baselineEntrySpeedKmh: 195,
    entrySpeedDeltaKmh: 5,
    primaryMinSpeedKmh: 110,
    baselineMinSpeedKmh: 105,
    minSpeedDeltaKmh: 5,
    primaryExitSpeedKmh: 160,
    baselineExitSpeedKmh: 155,
    exitSpeedDeltaKmh: 5,
    primaryBrakingDistM: 1120,
    baselineBrakingDistM: 1110,
    brakingPointDeltaM: 10,
    primaryThrottleOnDistM: 1260,
    baselineThrottleOnDistM: 1270,
    throttleOnDeltaM: -10,
  },
  {
    type: 'corner',
    segmentIndex: 5,
    cornerNumber: 3,
    entryDistM: 2200,
    minDistM: 2350,
    exitDistM: 2500,
    lengthM: 300,
    primaryTimeSec: 2.85,
    timeDeltaSec: 0.0,
    primaryEntrySpeedKmh: 220,
    baselineEntrySpeedKmh: 220,
    entrySpeedDeltaKmh: 0,
    primaryMinSpeedKmh: 130,
    baselineMinSpeedKmh: 130,
    minSpeedDeltaKmh: 0,
    primaryExitSpeedKmh: 180,
    baselineExitSpeedKmh: 180,
    exitSpeedDeltaKmh: 0,
    primaryBrakingDistM: 2210,
    baselineBrakingDistM: 2210,
    brakingPointDeltaM: 0,
    primaryThrottleOnDistM: 2360,
    baselineThrottleOnDistM: 2360,
    throttleOnDeltaM: 0,
  },
];

describe('TelemetryCornerStrip', () => {
  it('renders null when corners array is empty', () => {
    const { container } = render(<TelemetryCornerStrip corners={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders corner labels and lap times when not comparing', () => {
    render(<TelemetryCornerStrip corners={mockCorners} isCompareMode={false} />);

    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText('T2')).toBeInTheDocument();
    expect(screen.getByText('T3')).toBeInTheDocument();

    expect(screen.getByText('3.52s')).toBeInTheDocument();
    expect(screen.getByText('4.15s')).toBeInTheDocument();
    expect(screen.getByText('2.85s')).toBeInTheDocument();
  });

  it('renders corner deltas with positive and negative indicators when comparing', () => {
    render(<TelemetryCornerStrip corners={mockCorners} isCompareMode={true} />);

    // Positive delta (loss)
    const t1Delta = screen.getByText('+0.12');
    expect(t1Delta).toBeInTheDocument();
    expect(t1Delta).toHaveClass('text-rose-400');

    // Negative delta (gain)
    const t2Delta = screen.getByText('-0.08');
    expect(t2Delta).toBeInTheDocument();
    expect(t2Delta).toHaveClass('text-emerald-400');

    // Zero delta (neutral)
    const t3Delta = screen.getByText('±0.00');
    expect(t3Delta).toBeInTheDocument();
    expect(t3Delta).toHaveClass('text-slate-400');
  });

  it('highlights the selected corner with active styling and glow', () => {
    render(
      <TelemetryCornerStrip
        corners={mockCorners}
        selectedCornerNumber={2}
        isCompareMode={true}
      />
    );

    const t2Btn = screen.getByRole('button', { name: 'Turn 2' });
    expect(t2Btn.className).toContain('border-cyan-400');
    expect(t2Btn.className).toContain('bg-cyan-950/40');
  });

  it('triggers onSelectCorner and onJumpToDistance when clicked', () => {
    const handleSelectCorner = vi.fn();
    const handleJumpToDistance = vi.fn();

    render(
      <TelemetryCornerStrip
        corners={mockCorners}
        onSelectCorner={handleSelectCorner}
        onJumpToDistance={handleJumpToDistance}
        isCompareMode={true}
      />
    );

    const t1Btn = screen.getByRole('button', { name: 'Turn 1' });
    fireEvent.click(t1Btn);

    expect(handleSelectCorner).toHaveBeenCalledWith(1);
    expect(handleJumpToDistance).toHaveBeenCalledWith(450); // minDistM
  });

  it('does not render sector or distance markers above corners', () => {
    render(
      <TelemetryCornerStrip
        corners={mockCorners}
        isCompareMode={false}
      />
    );

    expect(screen.queryByText('S2')).not.toBeInTheDocument();
    expect(screen.queryByText('S3')).not.toBeInTheDocument();
    expect(screen.queryByText('450m')).not.toBeInTheDocument();
  });

  it('renders dedicated ST straight card before T1 and handles interaction', () => {
    const mockStraight = {
      type: 'straight' as const,
      segmentIndex: 0,
      entryDistM: 0,
      exitDistM: 300,
      lengthM: 300,
      primaryTimeSec: 4.82,
      timeDeltaSec: -0.05,
      primaryTopSpeedKmh: 240,
      baselineTopSpeedKmh: 238,
      topSpeedDeltaKmh: 2,
      primaryExitSpeedKmh: 240,
      baselineExitSpeedKmh: 238,
      exitSpeedDeltaKmh: 2,
    };

    const handleSelectCorner = vi.fn();
    const handleJumpToDistance = vi.fn();

    // Solo mode
    const { rerender } = render(
      <TelemetryCornerStrip
        corners={mockCorners}
        initialStraight={mockStraight}
        isCompareMode={false}
        onSelectCorner={handleSelectCorner}
        onJumpToDistance={handleJumpToDistance}
      />
    );

    const stBtn = screen.getByRole('button', { name: 'Main Straight ST' });
    expect(stBtn).toBeInTheDocument();
    expect(screen.getByText('ST')).toBeInTheDocument();
    expect(screen.getByText('4.82s')).toBeInTheDocument();

    // Clicking ST deselects corner and jumps to straight midpoint
    fireEvent.click(stBtn);
    expect(handleSelectCorner).toHaveBeenCalledWith(null);
    expect(handleJumpToDistance).toHaveBeenCalledWith(150);

    // Compare mode
    rerender(
      <TelemetryCornerStrip
        corners={mockCorners}
        initialStraight={mockStraight}
        isCompareMode={true}
        onSelectCorner={handleSelectCorner}
        onJumpToDistance={handleJumpToDistance}
      />
    );

    const deltaSpan = screen.getByText('-0.05');
    expect(deltaSpan).toBeInTheDocument();
    expect(deltaSpan).toHaveClass('text-emerald-400');
  });
});
