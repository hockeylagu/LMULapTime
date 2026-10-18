import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveCaptureCoverage } from '../../../../src/components/replay/telemetry/LiveCaptureCoverage.js';
import { TelemetryYawRateChannel } from '../../../../src/components/replay/telemetry/channels/dynamics/TelemetryYawRateChannel.js';
import { TelemetrySlipAngleChannel } from '../../../../src/components/replay/telemetry/channels/dynamics/TelemetrySlipAngleChannel.js';
import { fuseLiveTelemetry } from '../../../../shared/domain/live/liveTelemetryFusion.js';
import { liveEvidenceFixture, liveTrajectoryFixture } from '../../../helpers/liveEvidence.js';

describe('live capture chart source disclosure', () => {
  it('reports served-point coverage and source quality without claiming a complete raw lap', () => {
    const trajectory = fuseLiveTelemetry(liveTrajectoryFixture(), liveEvidenceFixture());
    render(<LiveCaptureCoverage overlay={trajectory.liveCaptureOverlay} />);
    const label = screen.getByText('Live capture: yaw 50% · beta 50%');
    expect(label).toHaveAttribute('title', expect.stringContaining('Other points use computed estimates'));
    expect(label).toHaveAttribute('title', expect.stringContaining('5 dropped samples across the recording'));
    expect(label).toHaveAttribute('title', expect.stringContaining('XML patch Build-42'));
  });

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

  it('shows a reason when an expected capture is unavailable and stays absent for recordings without capture', () => {
    const { rerender } = render(<LiveCaptureCoverage overlay={{ state: 'unavailable', message: 'Capture file was removed' }} />);
    expect(screen.getByText('Live capture unavailable')).toHaveAttribute('title', 'Capture file was removed');
    rerender(<LiveCaptureCoverage />);
    expect(screen.queryByText('Live capture unavailable')).not.toBeInTheDocument();
  });
});
