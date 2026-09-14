import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryResolutionPopover } from '../../src/components/replay/index.js';

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

  it('shows separate VCR and DuckDB resolutions', () => {
    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={vi.fn()}
        telemetryResolution={2400}
        onChangeResolution={vi.fn()}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={100}
        vcrRawPointsCount={1800}
        vcrRawSampleRateHz={30}
        duckdbRawPointsCount={9600}
        duckdbRawSampleRateHz={100}
        source="duckdb"
        hasDuckDb={true}
        onSelectSource={vi.fn()}
      />
    );

    expect(screen.getByText('1,800 pts @ 30 Hz')).toBeInTheDocument();
    expect(screen.getByText('9,600 pts @ 100 Hz')).toBeInTheDocument();
  });

  it('disables DuckDB and explains an incomplete lap fallback', () => {
    const onSelectSource = vi.fn();
    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={vi.fn()}
        telemetryResolution={2400}
        onChangeResolution={vi.fn()}
        pointsCount={2400}
        hasDuckDb={true}
        source="vcr"
        duckdbUnavailableReason="DuckDB telemetry is incomplete for this lap; using Native VCR data."
        onSelectSource={onSelectSource}
      />
    );

    const duckdbButton = screen.getByRole('button', { name: /100Hz DuckDB/i });
    expect(duckdbButton).toBeDisabled();
    expect(screen.getByText(/DuckDB telemetry is incomplete/i)).toBeInTheDocument();

    fireEvent.click(duckdbButton);
    expect(onSelectSource).not.toHaveBeenCalled();
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
