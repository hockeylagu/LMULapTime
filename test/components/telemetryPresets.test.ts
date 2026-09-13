import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadTelemetryPresets,
  saveTelemetryPresets,
  loadActivePresetId,
  saveActivePresetId,
  resetTelemetryPresetsToDefault,
  DEFAULT_TELEMETRY_PRESETS,
  AVAILABLE_TELEMETRY_CHANNELS,
  TelemetryPreset,
} from '../../src/components/replay/telemetry/telemetryPresets.js';

describe('telemetryPresets - Management and Storage', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    });
  });

  it('provides comprehensive list of uncombined telemetry channels', () => {
    const channelIds = AVAILABLE_TELEMETRY_CHANNELS.map(c => c.id);
    expect(channelIds).toContain('speed');
    expect(channelIds).toContain('delta');
    expect(channelIds).toContain('throttle');
    expect(channelIds).toContain('brake');
    expect(channelIds).toContain('gear');
    expect(channelIds).toContain('steer');
    expect(channelIds).toContain('rpm');
    expect(channelIds).toContain('tire-temps');
    expect(channelIds).toContain('tire-wear');
    expect(channelIds).toContain('brake-temps');
    expect(channelIds).toContain('lateral-offset');
  });

  it('loads default presets when localStorage is empty', () => {
    const presets = loadTelemetryPresets();
    expect(presets.length).toBe(DEFAULT_TELEMETRY_PRESETS.length);
    expect(presets[0].id).toBe('default');
    expect(presets[0].name).toBe('Standard Telemetry');
    expect(presets[0].channels).toEqual(['speed', 'delta', 'throttle', 'brake', 'gear', 'steer']);
  });

  it('persists and reloads modified and renamed presets', () => {
    const custom: TelemetryPreset[] = [
      {
        id: 'my-custom',
        name: 'My Alien Telemetry',
        channels: ['speed', 'rpm', 'tire-temps'],
      },
    ];
    saveTelemetryPresets(custom);
    const loaded = loadTelemetryPresets();
    expect(loaded.length).toBe(1);
    expect(loaded[0].name).toBe('My Alien Telemetry');
    expect(loaded[0].channels).toEqual(['speed', 'rpm', 'tire-temps']);
  });

  it('persists and reloads the active preset ID', () => {
    const presets = loadTelemetryPresets();
    expect(loadActivePresetId(presets)).toBe('default');

    saveActivePresetId('thermals');
    expect(loadActivePresetId(presets)).toBe('thermals');
  });

  it('resets presets to factory defaults', () => {
    saveTelemetryPresets([
      { id: 'corrupted', name: 'Corrupted', channels: ['speed'] },
    ]);
    const defs = resetTelemetryPresetsToDefault();
    expect(defs.length).toBe(DEFAULT_TELEMETRY_PRESETS.length);
    expect(defs.find(p => p.id === 'thermals')?.channels).toContain('tire-temps');
  });
});
