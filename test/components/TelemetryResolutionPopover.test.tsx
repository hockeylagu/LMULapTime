import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryResolutionPopover } from '../../src/components/replay/TelemetryResolutionPopover';

describe('TelemetryResolutionPopover', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <TelemetryResolutionPopover
        isOpen={false}
        onClose={vi.fn()}
        telemetryResolution={2400}
        onChangeResolution={vi.fn()}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={60}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders replay fidelity stats, sample rate in Hz, and performance trade-off explainer when open', () => {
    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={vi.fn()}
        telemetryResolution={2400}
        onChangeResolution={vi.fn()}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={60}
      />
    );

    expect(screen.getByText(/Telemetry Resolution & Fidelity/i)).toBeInTheDocument();
    expect(screen.getByText(/60 Hz/i)).toBeInTheDocument();
    expect(screen.getByText(/7,200 pts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2,400 pts/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Trade-off:/i)).toBeInTheDocument();
  });

  it('triggers onChangeResolution when selecting different resolution presets', () => {
    const handleChangeResolution = vi.fn();
    const handleClose = vi.fn();

    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={handleClose}
        telemetryResolution={2400}
        onChangeResolution={handleChangeResolution}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={60}
      />
    );

    // Click Standard (1,200 pts)
    const standardBtn = screen.getByRole('button', { name: /Standard/i });
    fireEvent.click(standardBtn);
    expect(handleChangeResolution).toHaveBeenCalledWith(1200);

    // Click Full Raw (100% uncompressed)
    const fullRawBtn = screen.getByRole('button', { name: /Full Raw/i });
    fireEvent.click(fullRawBtn);
    expect(handleChangeResolution).toHaveBeenCalledWith(0);
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();

    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={handleClose}
        telemetryResolution={2400}
        onChangeResolution={vi.fn()}
        pointsCount={2400}
      />
    );

    const closeBtn = screen.getByTitle(/Close/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
