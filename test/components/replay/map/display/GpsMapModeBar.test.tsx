import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsMapModeBar } from '../../../../../src/components/replay/map/display/GpsMapModeBar.js';

describe('GpsMapModeBar', () => {
  it('renders Pedal and Speed buttons and triggers onChangeColorBy', () => {
    const onChangeColorBy = vi.fn();
    render(<GpsMapModeBar colorBy="pedal" onChangeColorBy={onChangeColorBy} />);

    expect(screen.getByTestId('gps-map-mode-bar')).toBeInTheDocument();
    const speedBtn = screen.getByRole('button', { name: /speed/i });
    expect(speedBtn).toBeInTheDocument();

    fireEvent.click(speedBtn);
    expect(onChangeColorBy).toHaveBeenCalledWith('speed');
  });

  it('renders Delta button when isCompareMode and hasBaseline are true', () => {
    const onChangeColorBy = vi.fn();
    const { rerender } = render(
      <GpsMapModeBar
        colorBy="pedal"
        onChangeColorBy={onChangeColorBy}
        isCompareMode={false}
        hasBaseline={false}
      />
    );
    expect(screen.queryByRole('button', { name: /delta/i })).toBeNull();

    rerender(
      <GpsMapModeBar
        colorBy="pedal"
        onChangeColorBy={onChangeColorBy}
        isCompareMode={true}
        hasBaseline={true}
      />
    );
    expect(screen.getByRole('button', { name: /delta/i })).toBeInTheDocument();
  });

  it('renders Pedal Points button when hasCorners is true and onTogglePedalMarkers is provided', () => {
    const onTogglePedalMarkers = vi.fn();
    const { rerender } = render(
      <GpsMapModeBar
        hasCorners={true}
        onTogglePedalMarkers={onTogglePedalMarkers}
        showPedalMarkers={false}
      />
    );

    const pedalPtsBtn = screen.getByRole('button', { name: /pedal points/i });
    expect(pedalPtsBtn).toBeInTheDocument();
    expect(pedalPtsBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pedalPtsBtn);
    expect(onTogglePedalMarkers).toHaveBeenCalled();

    rerender(
      <GpsMapModeBar
        hasCorners={true}
        onTogglePedalMarkers={onTogglePedalMarkers}
        showPedalMarkers={true}
      />
    );
    expect(pedalPtsBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders Mine and Baseline line fade toggles when hasBaseline is true', () => {
    const onToggleFadedLine = vi.fn();
    render(
      <GpsMapModeBar
        hasBaseline={true}
        onToggleFadedLine={onToggleFadedLine}
        fadedLine="none"
      />
    );

    const mineBtn = screen.getByRole('button', { name: /mine/i });
    const baselineBtn = screen.getByRole('button', { name: /baseline/i });

    expect(mineBtn).toBeInTheDocument();
    expect(baselineBtn).toBeInTheDocument();

    fireEvent.click(mineBtn);
    expect(onToggleFadedLine).toHaveBeenCalledWith('primary');

    fireEvent.click(baselineBtn);
    expect(onToggleFadedLine).toHaveBeenCalledWith('baseline');
  });

  it('renders G-Force button when onToggleGForce is provided and toggles state', () => {
    const onToggleGForce = vi.fn();
    const { rerender } = render(
      <GpsMapModeBar onToggleGForce={onToggleGForce} showGForce={false} />
    );

    const gForceBtn = screen.getByRole('button', { name: /g-force/i });
    expect(gForceBtn).toBeInTheDocument();
    expect(gForceBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(gForceBtn);
    expect(onToggleGForce).toHaveBeenCalled();

    rerender(<GpsMapModeBar onToggleGForce={onToggleGForce} showGForce={true} />);
    expect(gForceBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders G-Circle button when onToggleFrictionCircle is provided and toggles state', () => {
    const onToggleFrictionCircle = vi.fn();
    const { rerender } = render(
      <GpsMapModeBar onToggleFrictionCircle={onToggleFrictionCircle} showFrictionCircle={false} />
    );

    const frictionBtn = screen.getByRole('button', { name: /friction/i });
    expect(frictionBtn).toBeInTheDocument();
    expect(frictionBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(frictionBtn);
    expect(onToggleFrictionCircle).toHaveBeenCalledTimes(1);

    rerender(<GpsMapModeBar onToggleFrictionCircle={onToggleFrictionCircle} showFrictionCircle={true} />);
    expect(frictionBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
