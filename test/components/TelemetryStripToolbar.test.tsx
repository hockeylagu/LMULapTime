import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryStripToolbar } from '../../src/components/replay/TelemetryStripToolbar';

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
        hasBaseline={false}
      />
    );

    const zoomBtn = screen.getByRole('button', { name: /Zoom Range/i });
    fireEvent.click(zoomBtn);
    expect(handleChangeMode).toHaveBeenCalledWith('zoom');
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
        hasBaseline={false}
        telemetryResolution={2400}
        onChangeResolution={handleChangeResolution}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={60}
      />
    );

    const resBtn = screen.getByRole('button', { name: /60Hz • 2400 pts/i });
    expect(resBtn).toBeInTheDocument();

    // Click to open resolution popover
    fireEvent.click(resBtn);
    expect(screen.getByText(/Telemetry Resolution & Fidelity/i)).toBeInTheDocument();
    expect(screen.getByText(/60 Hz/i)).toBeInTheDocument();
  });

  it('displays Full Raw badge when resolution is 0 or isFullResolution is true', () => {
    render(
      <TelemetryStripToolbar
        interactionMode="scrub"
        onChangeInteractionMode={vi.fn()}
        isZoomed={false}
        viewStart={0}
        viewEnd={100}
        onResetZoom={vi.fn()}
        hasBaseline={false}
        telemetryResolution={0}
        onChangeResolution={vi.fn()}
        pointsCount={7200}
        rawPointsCount={7200}
        rawSampleRateHz={60}
        isFullResolution={true}
      />
    );

    expect(screen.getByRole('button', { name: /60Hz • Full Raw/i })).toBeInTheDocument();
  });
});
