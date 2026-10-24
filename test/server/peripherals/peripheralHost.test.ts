import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePlugin, PRESET, setup, snapshot } from './fixtures.js';
import { SessionLoadDetector } from '../../../server/peripherals/sessionLoadDetector.js';

describe('one-shot peripheral host', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('selects once before driving, not on snapshots, garage returns or subsequent weekend sessions', async () => {
    const fixture = await setup();
    try {
      await vi.advanceTimersByTimeAsync(3000);
      expect(fixture.plugin.selectPreset).toHaveBeenCalledTimes(1);
      expect(fixture.host.status().lastRun?.wheel?.outcome).toBe('applied');
      fixture.frame(snapshot('driving'));
      fixture.frame({ ...snapshot(), session: { ...snapshot().session!, kind: 'qualifying', sessionCode: 5 } });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fixture.plugin.selectPreset).toHaveBeenCalledTimes(1);
      // A manual Apply in the garage after the handled load is allowed; the preset is already active, so nothing is sent.
      const manual = await fixture.host.execute({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      expect(manual.wheel?.outcome).toBe('already-active');
      expect(fixture.plugin.selectPreset).toHaveBeenCalledTimes(1);
    } finally { fixture.close(); }
  });
  it('applies manually in the garage when automatic switching is off, and never switches again for that load', async () => {
    const fixture = await setup();
    try {
      await fixture.host.configure({ enabled: true, automatic: false, wheel: fixture.host.status().settings.wheel });
      await vi.advanceTimersByTimeAsync(5000);
      expect(fixture.plugin.selectPreset).not.toHaveBeenCalled();
      const manual = await fixture.host.execute({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      expect(manual.wheel?.outcome).toBe('applied');
      await fixture.host.configure({ enabled: true, automatic: true, wheel: fixture.host.status().settings.wheel });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fixture.plugin.selectPreset).toHaveBeenCalledTimes(1);
    } finally { fixture.close(); }
  });
  it('keeps a menu Apply running through menu snapshots and cancels it when a session loads', async () => {
    const plugin = fakePlugin();
    // Every readback waits until the test releases it, then gives the fake plugin's real answer.
    let read = vi.mocked(plugin.readActivePreset).getMockImplementation()!;
    const release: (() => void)[] = [];
    vi.mocked(plugin.readActivePreset).mockImplementation((device, signal) => new Promise(resolve => { release.push(() => resolve(read(device, signal))); }));
    const releaseAll = async () => {
      for (let round = 0; round < 3; round++) {
        while (release.length) release.shift()!();
        await vi.advanceTimersByTimeAsync(10);
      }
    };
    const menu = { ...snapshot('menu'), session: null };
    const fixture = await setup(menu, plugin);
    try {
      const applied = fixture.host.execute({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      await vi.advanceTimersByTimeAsync(10);
      fixture.frame({ ...menu, sequence: 2 });
      await releaseAll();
      expect((await applied).wheel?.outcome).toBe('applied');
      expect(plugin.selectPreset).toHaveBeenCalledTimes(1);

      vi.mocked(plugin.selectPreset).mockClear();
      read = async () => ({ ok: true, presetUuid: '1' });
      const cancelled = fixture.host.execute({ model: 'Ferrari 296 LMGT3', carClass: 'GT3' });
      await vi.advanceTimersByTimeAsync(10);
      fixture.frame({ ...snapshot('loading'), session: null });
      await releaseAll();
      expect((await cancelled).wheel?.outcome).toBe('skipped');
      expect(plugin.selectPreset).not.toHaveBeenCalled();
    } finally { fixture.close(); }
  });
  it('sends no selection when the preset is already active', async () => {
    const plugin = fakePlugin();
    vi.mocked(plugin.readActivePreset).mockResolvedValue({ ok: true, presetUuid: PRESET.presetUuid });
    const fixture = await setup(snapshot(), plugin);
    try {
      await vi.advanceTimersByTimeAsync(3000);
      expect(plugin.selectPreset).not.toHaveBeenCalled();
      expect(fixture.host.status().lastRun?.wheel?.outcome).toBe('already-active');
    } finally { fixture.close(); }
  });
  it.each(['menu', 'driving', 'starting', 'finished', 'loading'] as const)('never switches automatically after starting in %s', async lifecycle => {
    const fixture = await setup(snapshot(lifecycle));
    try {
      await vi.advanceTimersByTimeAsync(5000);
      expect(fixture.plugin.selectPreset).not.toHaveBeenCalled();
      if (['driving', 'starting', 'finished'].includes(lifecycle)) {
        fixture.frame(snapshot());
        await vi.advanceTimersByTimeAsync(5000);
        expect(fixture.plugin.selectPreset).not.toHaveBeenCalled();
      }
    } finally { fixture.close(); }
  });
  it('cancels a selection when driving starts during readback and consumes the load', async () => {
    const plugin = fakePlugin();
    let finish: ((value: { ok: true; presetUuid: string }) => void) | undefined;
    vi.mocked(plugin.readActivePreset).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const fixture = await setup(snapshot(), plugin);
    try {
      await vi.advanceTimersByTimeAsync(3000);
      fixture.frame(snapshot('driving'));
      finish?.({ ok: true, presetUuid: '1' });
      await vi.advanceTimersByTimeAsync(10);
      fixture.frame(snapshot());
      await vi.advanceTimersByTimeAsync(5000);
      expect(plugin.selectPreset).not.toHaveBeenCalled();
    } finally { fixture.close(); }
  });
  it('does not retry rejected or uncertain requests or unknown readback', async () => {
    const plugin = fakePlugin();
    vi.mocked(plugin.selectPreset).mockResolvedValue({ outcome: 'uncertain', error: 'timeout' });
    const fixture = await setup(snapshot(), plugin);
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(plugin.selectPreset).toHaveBeenCalledTimes(1);
      expect(fixture.host.status().lastRun?.wheel?.outcome).toBe('uncertain');
    } finally { fixture.close(); }
  });
  it('skips unknown active presets without writing', async () => {
    const plugin = fakePlugin();
    vi.mocked(plugin.readActivePreset).mockResolvedValue({ ok: false, error: 'ambiguous selection' });
    const fixture = await setup(snapshot(), plugin);
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(plugin.selectPreset).not.toHaveBeenCalled();
      expect(fixture.host.status().lastRun?.wheel?.outcome).toBe('skipped');
    } finally { fixture.close(); }
  });
  it('cancels stale car work and handles the next loaded car only once', async () => {
    const plugin = fakePlugin();
    let finish: ((value: { ok: true; presetUuid: string }) => void) | undefined;
    vi.mocked(plugin.readActivePreset).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const fixture = await setup(snapshot(), plugin);
    try {
      await vi.advanceTimersByTimeAsync(3000);
      const changed = snapshot();
      changed.session = { ...changed.session!, vehicleName: 'Porsche 963', vehicleClass: 'Hyper' };
      fixture.frame(changed);
      finish?.({ ok: true, presetUuid: '1' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(plugin.selectPreset).not.toHaveBeenCalled();
      expect(fixture.host.status().lastRun?.car.model).toBe('Porsche 963');
      expect(fixture.host.status().lastRun?.wheel?.outcome).toBe('unmapped');
    } finally { fixture.close(); }
  });
  it('disabled plugins make no vendor requests', async () => {
    const fixture = await setup(snapshot('offline'));
    try {
      await fixture.host.configure({ enabled: false, automatic: true, wheel: null });
      vi.mocked(fixture.plugin.checkHealth).mockClear();
      fixture.frame(snapshot());
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fixture.plugin.selectPreset).not.toHaveBeenCalled();
      expect(fixture.plugin.checkHealth).not.toHaveBeenCalled();
    } finally { fixture.close(); }
  });
  it('a new car or actual load creates a new generation, not a garage return', () => {
    const detector = new SessionLoadDetector();
    detector.update(snapshot(), 0);
    const first = detector.generation;
    detector.consume();
    detector.update(snapshot('driving'), 100);
    detector.update(snapshot(), 200);
    expect(detector.generation).toBe(first);
    expect(detector.phase).toBe('handled');
    detector.update(snapshot('loading'), 300);
    detector.update(snapshot(), 400);
    expect(detector.generation).toBeGreaterThan(first);
    expect(detector.ready(3400)).toBe(true);
  });
});
