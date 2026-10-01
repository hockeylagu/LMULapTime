import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TelemetrySteerChannel } from '../../../../../src/components/replay/telemetry/channels/inputs/TelemetrySteerChannel.js';
import { computeLapComparisons } from '../../../../../src/utils/replayComparison.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';

const points: ReplayTrajectoryPoint[] = Array.from({ length: 21 }, (_, i) => ({
  x: 0, y: 0, z: i * 1.5, timeSec: i * 0.05, speedKmh: 108,
  steerYaw: 20 + i * 1.75, yawRateDeg: 24 - i * 0.65, understeerDeg: 6, accelLatG: 1.2,
}));
const dists = points.map(p => p.z);
const props = { steerPath: 'M 0 50 L 1000 50', isCursorInView: true, cursorPct: 50, cumDists: dists, viewStart: 0, viewEnd: 20 };

describe('steering feedback', () => {
  it('does not restore filtered warnings at the cursor', () => {
    const stable = points.map(p => ({ ...p, steerYaw: 40, yawRateDeg: 20 }));
    const { container } = render(<TelemetrySteerChannel {...props} points={stable} currentPoint={stable[10]} />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
    expect(screen.queryByText(/US \(/)).not.toBeInTheDocument();
    expect(screen.queryByText('Compare a lap to check time cost')).not.toBeInTheDocument();
  });

  it('omits unknown time cost from the badge and gives a concrete driving experiment', () => {
    render(<TelemetrySteerChannel {...props} points={points} currentPoint={points[10]} />);
    expect(screen.getByText('SCRUB M')).toBeInTheDocument();
    expect(screen.queryByText(/time cost unknown/i)).not.toBeInTheDocument();
    const badge = screen.getByTitle(/Suspected tire scrub.*More steering but less rotation.*Time cost unconfirmed/);
    expect(badge.title).toContain('Try less steering lock');
    expect(badge.title).not.toContain('% severity');
    expect(screen.getByRole('button', { name: /US.*OS/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the observed local time loss and suppresses negligible events', () => {
    const baseline = points.map(p => ({ ...p, speedKmh: 120, timeSec: (p.timeSec ?? 0) * 0.8 }));
    const comps = computeLapComparisons(points, baseline).map((c, i) => ({ ...c, deltaTimeSec: 5 + i * 0.01 }));
    const { rerender, container } = render(<TelemetrySteerChannel {...props} points={points} pointComparisons={comps} currentPoint={points[10]} />);
    expect(screen.getByText('SCRUB M +0.20s')).toBeInTheDocument();
    expect(screen.getByTitle(/other causes may contribute/)).toBeInTheDocument();
    expect(screen.queryByText('Loss during event ≥0.10 s vs base')).not.toBeInTheDocument();
    rerender(<TelemetrySteerChannel {...props} points={points} pointComparisons={comps.map(c => ({ ...c, deltaTimeSec: 5 }))} currentPoint={points[10]} />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
    expect(screen.queryByText(/SCRUB \(/)).not.toBeInTheDocument();
  });
});
