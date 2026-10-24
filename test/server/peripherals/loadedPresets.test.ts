import { describe, expect, it, vi } from 'vitest';
import { DEVICE, PRESET, fakePlugin, setup, snapshot } from './fixtures.js';

describe('loaded peripheral presets', () => {
  it('reads wheel and base profiles without a session, LMU tags, or hardware writes', async () => {
    const plugin = fakePlugin();
    const base = { ...DEVICE, role: 'base' as const, deviceUuid: 'base', name: 'Alpha' };
    vi.mocked(plugin.listDevices).mockResolvedValue({ ok: true, devices: [base, DEVICE] });
    vi.mocked(plugin.listPresets).mockImplementation(async device => ({ ok: true, presets: [{ ...PRESET,
      presetUuid: device.deviceUuid, name: `${device.name} profile`, tags: [], active: true }] }));
    const fixture = await setup({ ...snapshot('offline'), session: null }, plugin);
    try {
      const before = fixture.host.catalog();
      const loaded = await fixture.host.loadedPresets();
      expect(loaded.devices.map(row => row.preset?.name)).toEqual(['Alpha profile', 'Wheel profile']);
      expect(loaded.devices.every(row => row.error === null)).toBe(true);
      expect(fixture.host.catalog()).toEqual(before);
      expect(plugin.selectPreset).not.toHaveBeenCalled();
      expect(fixture.host.status().lastRun).toBeNull();
    } finally { fixture.close(); }
  });
  it('keeps successful devices when another device fails and refuses ambiguous active profiles', async () => {
    const plugin = fakePlugin();
    const base = { ...DEVICE, role: 'base' as const, deviceUuid: 'base' };
    vi.mocked(plugin.listDevices).mockResolvedValue({ ok: true, devices: [base, DEVICE] });
    vi.mocked(plugin.listPresets).mockImplementation(async device => device.role === 'base'
      ? { ok: false, error: 'Base disconnected' } : { ok: true, presets: [{ ...PRESET, active: true }] });
    const fixture = await setup({ ...snapshot('offline'), session: null }, plugin);
    try {
      const loaded = await fixture.host.loadedPresets();
      expect(loaded.devices[0]).toMatchObject({ preset: null, error: 'Base disconnected' });
      expect(loaded.devices[1].preset?.name).toBe(PRESET.name);
      vi.mocked(plugin.listPresets).mockResolvedValue({ ok: true, presets: [{ ...PRESET, active: true }, { ...PRESET, presetUuid: 'other', active: true }] });
      expect((await fixture.host.loadedPresets()).devices.every(row => row.preset === null && row.error?.includes('multiple'))).toBe(true);
      vi.mocked(plugin.listDevices).mockResolvedValue({ ok: true, devices: [] });
      expect((await fixture.host.loadedPresets()).devices).toEqual([]);
      await fixture.host.configure({ enabled: false, automatic: false, wheel: null });
      vi.mocked(plugin.listDevices).mockClear();
      await expect(fixture.host.loadedPresets()).rejects.toThrow('Enable an installed');
      expect(plugin.listDevices).not.toHaveBeenCalled();
    } finally { fixture.close(); }
  });
});
