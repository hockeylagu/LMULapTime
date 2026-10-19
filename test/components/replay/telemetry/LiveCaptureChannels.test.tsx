import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TelemetryYawRateChannel } from '../../../../src/components/replay/telemetry/channels/dynamics/TelemetryYawRateChannel.js';
import { TelemetrySlipAngleChannel } from '../../../../src/components/replay/telemetry/channels/dynamics/TelemetrySlipAngleChannel.js';
import { fuseLiveTelemetry } from '../../../../shared/domain/live/liveTelemetryFusion.js';
import { liveEvidenceFixture, liveTrajectoryFixture } from '../../../helpers/liveEvidence.js';

describe('live capture chart source disclosure', () => {
  it('leaves real-data channels unbadged and labels computed values in capture gaps', () => {
    const trajectory = fuseLiveTelemetry(liveTrajectoryFixture(), liveEvidenceFixture());
    const props = { isCursorInView: true, cursorPct: 50 };
    const { rerender } = render(<><TelemetryYawRateChannel yawRatePath="M 0 50 L 1000 40" currentPoint={trajectory.points[0]} {...props} />
      <TelemetrySlipAngleChannel slipAnglePath="M 0 50 L 1000 40" currentPoint={trajectory.points[0]} {...props} /></>);
    expect(screen.queryByText('LIVE CAPTURE')).not.toBeInTheDocument();
    expect(screen.queryByText('LIVE VELOCITY')).not.toBeInTheDocument();
    expect(screen.queryByText('COMPUTED')).not.toBeInTheDocument();
    rerender(<><TelemetryYawRateChannel yawRatePath="M 0 50 L 1000 40" currentPoint={trajectory.points[2]} {...props} />
      <TelemetrySlipAngleChannel slipAnglePath="M 0 50 L 1000 40" currentPoint={trajectory.points[2]} {...props} /></>);
    expect(screen.queryByText('LIVE CAPTURE')).not.toBeInTheDocument();
    expect(screen.getAllByText('COMPUTED')).toHaveLength(2);
  });

});
