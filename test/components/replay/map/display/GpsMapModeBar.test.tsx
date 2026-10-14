import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GpsMapModeBar } from '../../../../../src/components/replay/map/display/GpsMapModeBar.js';

describe('GpsMapModeBar', () => {
  it('turns off the selected heat map and leaves all modes unselected for normal colors', () => {
    const onChangeColorBy = vi.fn();
    const { rerender } = render(<GpsMapModeBar colorBy="gainLoss" isCompareMode hasBaseline onChangeColorBy={onChangeColorBy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gain / Loss' }));
    expect(onChangeColorBy).toHaveBeenCalledWith('default');
    rerender(<GpsMapModeBar colorBy="default" isCompareMode hasBaseline onChangeColorBy={onChangeColorBy} />);
    for (const name of ['Pedal', 'Speed', 'Delta', 'Gain / Loss']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Gain / Loss' }));
    expect(onChangeColorBy).toHaveBeenLastCalledWith('gainLoss');
  });
  it('exposes which comparison line is faded', () => {
    render(<GpsMapModeBar hasBaseline onToggleFadedLine={vi.fn()} fadedLine="baseline" />);
    expect(screen.getByRole('button', { name: 'Fade primary line' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Restore baseline line' })).toHaveAttribute('aria-pressed', 'true');
  });
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
    expect(screen.queryByRole('button', { name: 'Gain / Loss' })).toBeNull();

    rerender(
      <GpsMapModeBar
        colorBy="pedal"
        onChangeColorBy={onChangeColorBy}
        isCompareMode={true}
        hasBaseline={true}
      />
    );
    expect(screen.getByRole('button', { name: /delta/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gain / Loss' }));
    expect(onChangeColorBy).toHaveBeenCalledWith('gainLoss');
  });

  it('renders Primary and Baseline line fade toggles when hasBaseline is true', () => {
    const onToggleFadedLine = vi.fn();
    render(
      <GpsMapModeBar
        hasBaseline={true}
        onToggleFadedLine={onToggleFadedLine}
        fadedLine="none"
      />
    );

    const mineBtn = screen.getByRole('button', { name: /primary/i });
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
