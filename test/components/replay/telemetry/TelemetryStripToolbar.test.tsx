import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryStripToolbar } from '../../../../src/components/replay/telemetry/TelemetryStripToolbar.js';

describe('TelemetryStripToolbar', () => {
  it('renders mode buttons and triggers mode changes', () => {
    const handleChangeMode = vi.fn();
    render(
      <TelemetryStripToolbar
        interactionMode="scrub"
        onChangeInteractionMode={handleChangeMode}
        isZoomed={false}
        viewStart={0}
        viewEnd={100}
        onResetZoom={vi.fn()}
      />
    );

    const zoomBtn = screen.getByRole('button', { name: /Zoom Range/i });
    fireEvent.click(zoomBtn);
    expect(handleChangeMode).toHaveBeenCalledWith('zoom');
  });

  it('toggles Zoom range and shows Full lap only while zoomed', () => {
    const onReset = vi.fn(); const onMode = vi.fn();
    const { rerender } = render(<TelemetryStripToolbar interactionMode="scrub" onChangeInteractionMode={onMode} isZoomed={false} viewStart={0} viewEnd={100} onResetZoom={onReset} />);
    expect(screen.queryByRole('button', { name: 'Move cursor' })).not.toBeInTheDocument();
    expect(screen.queryByText('Drag:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom range' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Full lap' })).not.toBeInTheDocument();
    rerender(<TelemetryStripToolbar interactionMode="zoom" onChangeInteractionMode={onMode} isZoomed={true} viewStart={20} viewEnd={40} spanTimeSec={8.5} onResetZoom={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom range' }));
    expect(onMode).toHaveBeenLastCalledWith('scrub');
    expect(screen.getByText('8.50 s')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Full lap' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('renders resolution button with sample rate and opens popover on click', () => {
    const handleChangeResolution = vi.fn();
    render(
      <TelemetryStripToolbar
        interactionMode="scrub"
        onChangeInteractionMode={vi.fn()}
        isZoomed={false}
        viewStart={0}
        viewEnd={100}
        onResetZoom={vi.fn()}
        telemetryResolution="high"
        onChangeResolution={handleChangeResolution}
        pointsCount={2400}
        vcrRawPointsCount={7200}
        vcrRawSampleRateHz={60}
      />
    );

    const resBtn = screen.getByRole('button', { name: /^60 Hz$/i });
    expect(resBtn).toBeInTheDocument();
    expect(resBtn).not.toHaveTextContent(/pts/i);

    // Click to open resolution popover
    fireEvent.click(resBtn);
    expect(screen.getByText(/Telemetry Resolution & Fidelity/i)).toBeInTheDocument();
    // The button and the popover both name the rate.
    expect(screen.getAllByText(/60 Hz/i).length).toBeGreaterThan(1);
  });

  it('displays Full Raw badge when resolution is full or isFullResolution is true', () => {
    render(
      <TelemetryStripToolbar
        interactionMode="scrub"
        onChangeInteractionMode={vi.fn()}
        isZoomed={false}
        viewStart={0}
        viewEnd={100}
        onResetZoom={vi.fn()}
        telemetryResolution="full"
        onChangeResolution={vi.fn()}
        pointsCount={7200}
        vcrRawPointsCount={7200}
        vcrRawSampleRateHz={60}
        isFullResolution={true}
      />
    );

    expect(screen.getByRole('button', { name: /60 Hz · Full raw/i })).toBeInTheDocument();
  });

  it('renders interactive data source switcher inside resolution popover and triggers onSelectSource', () => {
    const handleSelectSource = vi.fn();
    render(
      <TelemetryStripToolbar
        interactionMode="scrub"
        onChangeInteractionMode={vi.fn()}
        isZoomed={false}
        viewStart={0}
        viewEnd={100}
        onResetZoom={vi.fn()}
        source="duckdb"
        duckdbFilename="Bahrain_Test.duckdb"
        hasDuckDb={true}
        onSelectSource={handleSelectSource}
        onChangeResolution={vi.fn()}
        telemetryResolution="high"
        pointsCount={2400}
        duckdbRawSampleRateHz={100}
      />
    );

    // Open resolution popover
    const resBtn = screen.getByRole('button', { name: /^100 Hz$/i });
    expect(resBtn).not.toHaveTextContent(/pts/i);
    fireEvent.click(resBtn);

    const vcrBtn = screen.getByRole('button', { name: /Native VCR/i });
    expect(vcrBtn).toBeInTheDocument();

    const duckBtn = screen.getByRole('button', { name: /Native telemetry/i });
    expect(duckBtn).toBeInTheDocument();

    fireEvent.click(vcrBtn);
    expect(handleSelectSource).toHaveBeenCalledWith('vcr');

    fireEvent.click(duckBtn);
    expect(handleSelectSource).toHaveBeenCalledWith('duckdb');
  });

  it('steps the cursor and reads out lap time and distance, not frames', () => {
    const handleStepIndex = vi.fn();
    render(
      <TelemetryStripToolbar
        interactionMode="scrub"
        onChangeInteractionMode={vi.fn()}
        isZoomed={false}
        viewStart={0}
        viewEnd={100}
        onResetZoom={vi.fn()}
        onStepIndex={handleStepIndex}
        currentFrame={50}
        totalFrames={100}
        currentTimeSec={12.5}
        currentDistM={1234}
      />
    );

    const leftBtn = screen.getByRole('button', { name: 'Step backward' });
    const rightBtn = screen.getByRole('button', { name: 'Step forward' });
    expect(screen.getByText('1,234 m')).toBeInTheDocument();
    expect(screen.queryByText(/Frame/)).not.toBeInTheDocument();

    fireEvent.click(leftBtn);
    expect(handleStepIndex).toHaveBeenCalledWith(-1);

    fireEvent.click(rightBtn);
    expect(handleStepIndex).toHaveBeenCalledWith(1);
  });
});
