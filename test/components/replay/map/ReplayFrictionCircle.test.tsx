import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReplayFrictionCircle } from '../../../../src/components/replay/map/ReplayFrictionCircle.js';
import type { ReplayTelemetryPoint } from '../../../../shared/types/index.js';

describe('ReplayFrictionCircle', () => {
  it('does not infer grip or draw a dot from absent or non-finite acceleration', () => {
    const { rerender } = render(<ReplayFrictionCircle points={[{ x: 0, y: 0, z: 0 }]} currentIndex={0} />);
    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByText('Grip available')).not.toBeInTheDocument();
    expect(screen.queryByTestId('friction-circle-dot')).not.toBeInTheDocument();
    rerender(<ReplayFrictionCircle points={[{ x: 0, y: 0, z: 0, accelLatG: NaN, accelLonG: 0 }]} currentIndex={0} />);
    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
    expect(screen.queryByTestId('friction-circle-dot')).not.toBeInTheDocument();
  });

  it('respects an explicitly unavailable aligned baseline instead of guessing from its array', () => {
    const point = { x: 0, y: 0, z: 0, distM: 100, accelLatG: 0, accelLonG: 0 };
    render(<ReplayFrictionCircle points={[point]} currentIndex={0} baselinePoint={null} baselinePoints={[point]} />);
    expect(screen.queryByTestId('friction-circle-baseline-dot')).not.toBeInTheDocument();
    expect(screen.getByTestId('friction-circle-dot')).toBeInTheDocument();
  });
  const basePoint: ReplayTelemetryPoint = {
    x: 0,
    y: 0,
    z: 0,
    timeSec: 10.0,
    speedKmh: 150,
    accelLatG: 0,
    accelLonG: 0,
  };

  it('renders labels with BRAKE at top, DRIVE at bottom, and L/R for lateral load', () => {
    render(<ReplayFrictionCircle points={[basePoint]} currentIndex={0} />);

    expect(screen.getByText('BRAKE')).toBeInTheDocument();
    expect(screen.getByText('DRIVE')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('moves the dot to the top (y < 64) under braking (accelLonG < 0) for front axle load', () => {
    const brakingPoint = { ...basePoint, accelLonG: -2.0, accelLatG: 0 };
    render(<ReplayFrictionCircle points={[brakingPoint]} currentIndex={0} />);

    // Center is (64, 64). Under braking, load moves forward/top (y < 64).
    const dot = screen.getByTestId('friction-circle-dot');
    const cy = Number(dot?.getAttribute('cy'));
    const cx = Number(dot?.getAttribute('cx'));
    expect(cx).toBeCloseTo(64, 1);
    expect(cy).toBeLessThan(64);
  });

  it('moves the dot to the bottom (y > 64) under acceleration (accelLonG > 0) for rear axle squat', () => {
    const drivePoint = { ...basePoint, accelLonG: 1.5, accelLatG: 0 };
    render(<ReplayFrictionCircle points={[drivePoint]} currentIndex={0} />);

    const dot = screen.getByTestId('friction-circle-dot');
    const cy = Number(dot?.getAttribute('cy'));
    const cx = Number(dot?.getAttribute('cx'));
    expect(cx).toBeCloseTo(64, 1);
    expect(cy).toBeGreaterThan(64);
  });

  it('moves the dot to the left (x < 64) in a right turn (accelLatG < 0) for outside tire load', () => {
    const rightTurnPoint = { ...basePoint, accelLatG: -2.0, accelLonG: 0 };
    render(<ReplayFrictionCircle points={[rightTurnPoint]} currentIndex={0} />);

    const dot = screen.getByTestId('friction-circle-dot');
    const cx = Number(dot?.getAttribute('cx'));
    const cy = Number(dot?.getAttribute('cy'));
    expect(cx).toBeLessThan(64);
    expect(cy).toBeCloseTo(64, 1);
  });

  it('moves the dot to the right (x > 64) in a left turn (accelLatG > 0) for outside tire load', () => {
    const leftTurnPoint = { ...basePoint, accelLatG: 2.0, accelLonG: 0 };
    render(<ReplayFrictionCircle points={[leftTurnPoint]} currentIndex={0} />);

    const dot = screen.getByTestId('friction-circle-dot');
    const cx = Number(dot?.getAttribute('cx'));
    const cy = Number(dot?.getAttribute('cy'));
    expect(cx).toBeGreaterThan(64);
    expect(cy).toBeCloseTo(64, 1);
  });

  it('renders only 1 dot when no baseline is provided', () => {
    render(<ReplayFrictionCircle points={[basePoint]} currentIndex={0} />);

    expect(screen.getByTestId('friction-circle-dot')).toBeInTheDocument();
    expect(screen.queryByTestId('friction-circle-baseline-dot')).toBeNull();
  });

  it('renders 2 dots (primary and baseline) with distinctive colors when comparing', () => {
    const primary = { ...basePoint, accelLatG: -1.5, accelLonG: -1.0 };
    const baseline = { ...basePoint, accelLatG: 1.2, accelLonG: 0.5 };

    render(
      <ReplayFrictionCircle
        points={[primary]}
        currentIndex={0}
        baselinePoint={baseline}
      />
    );

    const primaryDot = screen.getByTestId('friction-circle-dot');
    const baselineDot = screen.getByTestId('friction-circle-baseline-dot');

    expect(primaryDot).toBeInTheDocument();
    expect(baselineDot).toBeInTheDocument();

    // Primary dot has primary sky/cyan fill when comparing
    expect(primaryDot.getAttribute('fill')).toBe('#38BDF8');
    // Baseline dot has baseline amber fill
    expect(baselineDot.getAttribute('fill')).toBe('#F59E0B');

    // Both dots reflect their respective coordinates
    expect(Number(primaryDot.getAttribute('cx'))).toBeLessThan(64);
    expect(Number(baselineDot.getAttribute('cx'))).toBeGreaterThan(64);

    // Displays both Primary and Baseline labels in the readout
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
  });

  it('resolves baseline point from baselinePoints array by matching distance', () => {
    const primary = { ...basePoint, distM: 100, accelLatG: 1.0, accelLonG: 0 };
    const baselinePoints = [
      { ...basePoint, distM: 50, accelLatG: 0.5, accelLonG: 0 },
      { ...basePoint, distM: 100, accelLatG: -1.5, accelLonG: -0.5 },
      { ...basePoint, distM: 150, accelLatG: 0.2, accelLonG: 0.2 },
    ];

    render(
      <ReplayFrictionCircle
        points={[primary]}
        currentIndex={0}
        baselinePoints={baselinePoints}
      />
    );

    const baselineDot = screen.getByTestId('friction-circle-baseline-dot');
    expect(baselineDot).toBeInTheDocument();
    // Matches the 2nd baseline point with distM: 100 (accelLatG: -1.5 -> x < 64)
    expect(Number(baselineDot.getAttribute('cx'))).toBeLessThan(64);
  });
});

