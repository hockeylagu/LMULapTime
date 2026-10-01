import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryResolutionPopover } from '../../../../src/components/replay/index.js';

describe('TelemetryResolutionPopover', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <TelemetryResolutionPopover
        isOpen={false}
        onClose={vi.fn()}
        telemetryResolution="high"
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
        telemetryResolution="high"
        onChangeResolution={vi.fn()}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={60}
      />
    );

    expect(screen.getByText(/Telemetry Resolution & Fidelity/i)).toBeInTheDocument();
    expect(screen.getByText(/60 Hz/i)).toBeInTheDocument();
    expect(screen.getByText(/7,200 raw pts/i)).toBeInTheDocument();
    expect(screen.getByText('3.0× fewer points')).toBeInTheDocument();
    expect(screen.getByText(/Trade-off:/i)).toBeInTheDocument();
  });

  it('shows separate VCR and DuckDB resolutions', () => {
    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={vi.fn()}
        telemetryResolution="high"
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
    expect(screen.queryByText('Recorded samples:')).not.toBeInTheDocument();
    expect(screen.queryByText(/7,200 raw pts/i)).not.toBeInTheDocument();
    expect(screen.getByText('Every sample')).toBeInTheDocument();
  });

  it('disables DuckDB and explains an incomplete lap fallback', () => {
    const onSelectSource = vi.fn();
    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={vi.fn()}
        telemetryResolution="high"
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
        telemetryResolution="high"
        onChangeResolution={handleChangeResolution}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={60}
      />
    );

    // Click Standard (one point every 4 m)
    const standardBtn = screen.getByRole('button', { name: /Standard.*1 pt \/ 4 m/i });
    fireEvent.click(standardBtn);
    expect(handleChangeResolution).toHaveBeenCalledWith('standard');

    // Click High (one point every 2 m, the default)
    fireEvent.click(screen.getByRole('button', { name: /High.*1 pt \/ 2 m/i }));
    expect(handleChangeResolution).toHaveBeenCalledWith('high');

    // Click Full Raw (100% uncompressed)
    const fullRawBtn = screen.getByRole('button', { name: /Full Raw/i });
    fireEvent.click(fullRawBtn);
    expect(handleChangeResolution).toHaveBeenCalledWith('full');
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();

    render(
      <TelemetryResolutionPopover
        isOpen={true}
        onClose={handleClose}
        telemetryResolution="high"
        onChangeResolution={vi.fn()}
        pointsCount={2400}
      />
    );

    const closeBtn = screen.getByTitle(/Close/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
