import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryPresetModal } from '../../../../src/components/replay/telemetry/presets/TelemetryPresetModal.js';
import { DEFAULT_TELEMETRY_PRESETS, TelemetryPreset } from '../../../../src/components/replay/telemetry/presets/telemetryPresets.js';

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
    expect(screen.getByText(/Lateral Track Offset/i)).toBeInTheDocument();
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

  it('duplicates, applies, and deletes a custom preset', () => {
    const handleSave = vi.fn();
    const handleSelect = vi.fn();
    const custom: TelemetryPreset = {
      id: 'custom-one', name: 'Custom One', isBuiltIn: false, channels: ['speed', 'delta'],
    };
    const { rerender } = render(
      <TelemetryPresetModal
        isOpen={true}
        onClose={vi.fn()}
        presets={[...DEFAULT_TELEMETRY_PRESETS, custom]}
        activePresetId={custom.id}
        onSavePresets={handleSave}
        onSelectActivePreset={handleSelect}
        onResetDefaults={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle(/Duplicate this preset/i));
    expect(handleSave).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'Custom One (Copy)', isBuiltIn: false }),
    ]));
    expect(handleSelect).toHaveBeenCalled();

    const duplicatedPresets = handleSave.mock.calls[0][0] as TelemetryPreset[];
    const duplicatedId = duplicatedPresets[duplicatedPresets.length - 1].id;
    rerender(
      <TelemetryPresetModal
        isOpen={true}
        onClose={vi.fn()}
        presets={duplicatedPresets}
        activePresetId={duplicatedId}
        onSavePresets={handleSave}
        onSelectActivePreset={handleSelect}
        onResetDefaults={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Apply & Use Preset/i }));
    expect(handleSelect).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle(/Delete this preset/i));
    expect(handleSave.mock.calls[handleSave.mock.calls.length - 1]?.[0]).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ id: duplicatedId }),
    ]));
    rerender(<TelemetryPresetModal isOpen={false} onClose={vi.fn()} presets={duplicatedPresets} activePresetId="default" onSavePresets={handleSave} onSelectActivePreset={handleSelect} onResetDefaults={vi.fn()} />);
  });

  it('keeps the final active channel and supports reset and close actions', () => {
    const handleSave = vi.fn();
    const handleReset = vi.fn();
    const handleClose = vi.fn();
    const singleChannel: TelemetryPreset = {
      id: 'single', name: 'Single Channel', isBuiltIn: false, channels: ['speed'],
    };
    const { rerender } = render(
      <TelemetryPresetModal
        isOpen={true}
        onClose={handleClose}
        presets={[singleChannel]}
        activePresetId="single"
        onSavePresets={handleSave}
        onSelectActivePreset={vi.fn()}
        onResetDefaults={handleReset}
      />
    );

    const speedCheckbox = screen.getByLabelText(/Vehicle Speed/i);
    expect(speedCheckbox).toBeChecked();
    fireEvent.click(speedCheckbox);
    expect(handleSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle(/Reset all presets/i));
    expect(handleReset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Apply & Use Preset/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    rerender(
      <TelemetryPresetModal
        isOpen={false}
        onClose={handleClose}
        presets={[singleChannel]}
        activePresetId="single"
        onSavePresets={handleSave}
        onSelectActivePreset={vi.fn()}
        onResetDefaults={handleReset}
      />
    );
    expect(screen.queryByTestId('telemetry-preset-modal')).not.toBeInTheDocument();
  });
});
