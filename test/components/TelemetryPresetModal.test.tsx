import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryPresetModal } from '../../src/components/replay/telemetry/TelemetryPresetModal.js';
import { DEFAULT_TELEMETRY_PRESETS, TelemetryPreset } from '../../src/components/replay/telemetry/telemetryPresets.js';

describe('TelemetryPresetModal', () => {
  it('renders presets and channels when open', () => {
    render(
      <TelemetryPresetModal
        isOpen={true}
        onClose={vi.fn()}
        presets={DEFAULT_TELEMETRY_PRESETS}
        activePresetId="default"
        onSavePresets={vi.fn()}
        onSelectActivePreset={vi.fn()}
        onResetDefaults={vi.fn()}
      />
    );

    expect(screen.getByText(/Telemetry Channel Presets/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Standard Telemetry/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Engine RPM/i)).toBeInTheDocument();
    expect(screen.getByText(/Tire Temperatures/i)).toBeInTheDocument();
  });

  it('allows renaming a preset', () => {
    const handleSave = vi.fn();
    render(
      <TelemetryPresetModal
        isOpen={true}
        onClose={vi.fn()}
        presets={DEFAULT_TELEMETRY_PRESETS}
        activePresetId="default"
        onSavePresets={handleSave}
        onSelectActivePreset={vi.fn()}
        onResetDefaults={vi.fn()}
      />
    );

    // Click rename icon
    const renameBtn = screen.getByTitle(/Rename preset/i);
    fireEvent.click(renameBtn);

    // Input field should now appear
    const input = screen.getByDisplayValue('Standard Telemetry');
    fireEvent.change(input, { target: { value: 'My Renamed Layout' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSave).toHaveBeenCalled();
    const updatedPresets = handleSave.mock.calls[0][0] as TelemetryPreset[];
    expect(updatedPresets[0].name).toBe('My Renamed Layout');
  });

  it('allows toggling channels on and off', () => {
    const handleSave = vi.fn();
    render(
      <TelemetryPresetModal
        isOpen={true}
        onClose={vi.fn()}
        presets={DEFAULT_TELEMETRY_PRESETS}
        activePresetId="default"
        onSavePresets={handleSave}
        onSelectActivePreset={vi.fn()}
        onResetDefaults={vi.fn()}
      />
    );

    // Toggle Engine RPM on
    const rpmCheckbox = screen.getByLabelText(/Engine RPM/i);
    expect(rpmCheckbox).not.toBeChecked();
    fireEvent.click(rpmCheckbox);

    expect(handleSave).toHaveBeenCalled();
    const updatedPresets = handleSave.mock.calls[0][0] as TelemetryPreset[];
    expect(updatedPresets[0].channels).toContain('rpm');
  });

  it('allows creating a new custom preset', () => {
    const handleSave = vi.fn();
    render(
      <TelemetryPresetModal
        isOpen={true}
        onClose={vi.fn()}
        presets={DEFAULT_TELEMETRY_PRESETS}
        activePresetId="default"
        onSavePresets={handleSave}
        onSelectActivePreset={vi.fn()}
        onResetDefaults={vi.fn()}
      />
    );

    const newBtn = screen.getByRole('button', { name: /New/i });
    fireEvent.click(newBtn);

    expect(handleSave).toHaveBeenCalled();
    const updatedPresets = handleSave.mock.calls[0][0] as TelemetryPreset[];
    expect(updatedPresets.length).toBe(DEFAULT_TELEMETRY_PRESETS.length + 1);
  });
});
