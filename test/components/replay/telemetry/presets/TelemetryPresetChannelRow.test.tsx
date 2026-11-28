import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryPresetChannelRow } from '../../../../../src/components/replay/telemetry/presets/TelemetryPresetChannelRow.js';
import { TelemetryChannelInfo } from '../../../../../src/components/replay/telemetry/presets/telemetryPresets.js';

describe('TelemetryPresetChannelRow', () => {
  const baseChannel: TelemetryChannelInfo = {
    id: 'speed',
    name: 'Vehicle Speed',
    shortName: 'SPD',
    unit: 'km/h',
    description: 'Vehicle ground velocity',
    badgeColor: 'bg-lmu-info-strong/20 text-lmu-info',
    lineColor: '#38bdf8',
    category: 'dynamics',
    isComputed: false,
  };

  it('renders direct channel when not computed and handles toggle checkbox', () => {
    const onToggle = vi.fn();
    const onMove = vi.fn();

    render(
      <TelemetryPresetChannelRow
        channel={baseChannel}
        isActive={false}
        isFirst={false}
        isLast={false}
        onToggle={onToggle}
        onMove={onMove}
      />
    );

    expect(screen.getByText('Vehicle Speed')).toBeInTheDocument();
    expect(screen.getByText('SPD')).toBeInTheDocument();
    expect(screen.getByText('DIRECT')).toBeInTheDocument();
    expect(screen.queryByTitle('Move channel up')).not.toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('speed');
  });

  it('renders computed badge when channel is computed and handles up/down moves when active', () => {
    const onToggle = vi.fn();
    const onMove = vi.fn();

    const computedChannel: TelemetryChannelInfo = {
      ...baseChannel,
      id: 'slip-angle',
      name: 'Estimated Slip Angle',
      shortName: 'SLIP',
      isComputed: true,
      category: 'dynamics',
    };

    const { rerender } = render(
      <TelemetryPresetChannelRow
        channel={computedChannel}
        isActive={true}
        isFirst={false}
        isLast={false}
        onToggle={onToggle}
        onMove={onMove}
      />
    );

    expect(screen.getByText('COMPUTED')).toBeInTheDocument();

    const upBtn = screen.getByTitle('Move channel up');
    const downBtn = screen.getByTitle('Move channel down');
    expect(upBtn).not.toBeDisabled();
    expect(downBtn).not.toBeDisabled();

    fireEvent.click(upBtn);
    expect(onMove).toHaveBeenCalledWith('slip-angle', 'up');

    fireEvent.click(downBtn);
    expect(onMove).toHaveBeenCalledWith('slip-angle', 'down');

    // Test disabled states when isFirst and isLast
    rerender(
      <TelemetryPresetChannelRow
        channel={computedChannel}
        isActive={true}
        isFirst={true}
        isLast={true}
        onToggle={onToggle}
        onMove={onMove}
      />
    );

    expect(screen.getByTitle('Move channel up')).toBeDisabled();
    expect(screen.getByTitle('Move channel down')).toBeDisabled();
  });

  it('renders WHEEL / TIRE category badge', () => {
    const wheelChannel: TelemetryChannelInfo = {
      ...baseChannel,
      id: 'tire-temps',
      name: 'Rotor Temperatures',
      category: 'wheels',
    };

    render(
      <TelemetryPresetChannelRow
        channel={wheelChannel}
        isActive={true}
        isFirst={false}
        isLast={false}
        onToggle={vi.fn()}
        onMove={vi.fn()}
      />
    );

    expect(screen.getByText('WHEEL / TIRE')).toBeInTheDocument();
  });

  it('renders ENERGY / FUEL category badge', () => {
    const energyChannel: TelemetryChannelInfo = {
      ...baseChannel,
      id: 'fuel',
      name: 'Fuel Remaining',
      category: 'energy',
    };

    render(
      <TelemetryPresetChannelRow
        channel={energyChannel}
        isActive={true}
        isFirst={false}
        isLast={false}
        onToggle={vi.fn()}
        onMove={vi.fn()}
      />
    );

    expect(screen.getByText('ENERGY / FUEL')).toBeInTheDocument();
  });

  it('shows a cut-off description whole on hover and with More, without toggling the channel', () => {
    const onToggle = vi.fn();
    const width = vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(1000);
    render(<TelemetryPresetChannelRow channel={baseChannel} isActive={false} isFirst={false} isLast={false} onToggle={onToggle} onMove={vi.fn()} />);
    width.mockRestore();
    expect(screen.getByTitle('Vehicle ground velocity (km/h)')).toHaveClass('truncate');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByTitle('Vehicle ground velocity (km/h)')).not.toHaveClass('truncate');
    expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true');
    expect(onToggle).not.toHaveBeenCalled();
  });
});
