import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryStripToolbar } from '../../src/components/replay/index.js';

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
        telemetryResolution={2400}
        onChangeResolution={handleChangeResolution}
        pointsCount={2400}
        rawPointsCount={7200}
        rawSampleRateHz={60}
      />
    );

    const resBtn = screen.getByRole('button', { name: /60Hz • 2[,.]?400 pts/i });
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
        telemetryResolution={2400}
        pointsCount={2400}
        rawSampleRateHz={100}
      />
    );

    // Open resolution popover
    const resBtn = screen.getByRole('button', { name: /100Hz • 2[,.]?400 pts/i });
    fireEvent.click(resBtn);

    const vcrBtn = screen.getByRole('button', { name: /🎬 Native VCR/i });
    expect(vcrBtn).toBeInTheDocument();

    const duckBtn = screen.getByRole('button', { name: /⚡ 100Hz DuckDB/i });
    expect(duckBtn).toBeInTheDocument();

    fireEvent.click(vcrBtn);
    expect(handleSelectSource).toHaveBeenCalledWith('vcr');

    fireEvent.click(duckBtn);
    expect(handleSelectSource).toHaveBeenCalledWith('duckdb');
  });

  it('renders left and right arrows to move the scrub line and triggers onStepIndex', () => {
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
      />
    );

    const leftBtn = screen.getByRole('button', { name: /Step backward \(Left Arrow\)/i });
    const rightBtn = screen.getByRole('button', { name: /Step forward \(Right Arrow\)/i });

    expect(leftBtn).toBeInTheDocument();
    expect(rightBtn).toBeInTheDocument();

    fireEvent.click(leftBtn);
    expect(handleStepIndex).toHaveBeenCalledWith(-1);

    fireEvent.click(rightBtn);
    expect(handleStepIndex).toHaveBeenCalledWith(1);
  });
});
