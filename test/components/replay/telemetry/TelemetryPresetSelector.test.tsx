import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryPresetSelector } from '../../../../src/components/replay/telemetry/presets/TelemetryPresetSelector.js';
import { DEFAULT_TELEMETRY_PRESETS } from '../../../../src/components/replay/telemetry/presets/telemetryPresets.js';

describe('TelemetryPresetSelector', () => {
  it('renders active preset name and opens menu on click', () => {
    const handleSelect = vi.fn();
    const handleOpenManage = vi.fn();

    render(
      <TelemetryPresetSelector
        presets={DEFAULT_TELEMETRY_PRESETS}
        activePresetId="default"
        onSelectPreset={handleSelect}
        onOpenManageModal={handleOpenManage}
      />
    );

    expect(screen.getByText('Standard Telemetry')).toBeInTheDocument();

    // Open dropdown
    const dropdownBtn = screen.getByTestId('telemetry-preset-dropdown-btn');
    fireEvent.click(dropdownBtn);

    expect(screen.getByTestId('telemetry-preset-menu')).toBeInTheDocument();
    expect(screen.getByText('Powertrain & Inputs')).toBeInTheDocument();

    // Select Powertrain & Inputs
    fireEvent.click(screen.getByTestId('telemetry-preset-option-powertrain'));
    expect(handleSelect).toHaveBeenCalledWith('powertrain');
  });

  it('triggers onOpenManageModal when manage button clicked', () => {
    const handleOpenManage = vi.fn();

    render(
      <TelemetryPresetSelector
        presets={DEFAULT_TELEMETRY_PRESETS}
        activePresetId="default"
        onSelectPreset={vi.fn()}
        onOpenManageModal={handleOpenManage}
      />
    );

    const manageBtn = screen.getByTestId('telemetry-preset-manage-btn');
    fireEvent.click(manageBtn);
    expect(handleOpenManage).toHaveBeenCalled();
  });
});
