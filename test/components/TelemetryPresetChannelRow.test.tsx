import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryPresetChannelRow } from '../../src/components/replay/telemetry/TelemetryPresetChannelRow';
import { TelemetryChannelInfo } from '../../src/components/replay/telemetry/telemetryPresets';

describe('TelemetryPresetChannelRow', () => {
  const baseChannel: TelemetryChannelInfo = {
    id: 'speed',
    name: 'Vehicle Speed',
    shortName: 'SPD',
    unit: 'km/h',
    description: 'Vehicle ground velocity',
    badgeColor: 'bg-sky-500/20 text-sky-400',
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
});
