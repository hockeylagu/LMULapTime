import { describe, expect, it, vi } from 'vitest';
import { Color, Scene, Vector3, WebGLRenderTarget, type Object3D, type WebGLRenderer } from 'three';
import { createAutoExposure, EXPOSURE_PASS, exposureUniforms, inverseToneCurve, lawExposure, meterGrey, meterUnit, profileAt, RESET_METERINGS, toneCurve, whiteBalance } from '../../../../src/components/replay/view3d/autoExposure.js';
import { BLOOM_PASS } from '../../../../src/components/replay/view3d/bloom.js';
import { testCamera } from '../../../helpers/scenes/sceneryProfiles.js';

/** A synthetic camera type (profiles at sun strengths 0 and 60). */
const TYPE = testCamera().types.external;

/** A direct sun whose strongest channel is `strength`, at an elevation. */
const sun = (strength: number, elevationDeg: number) => ({rgb: new Color(strength, strength / 2, strength / 4), elevationDeg});

describe('autoExposure', () => {
  it("tone-maps with the profile's curve: dark toe, compressed shoulder, invertible", () => {
    const curve = {a: 2.5, b: 0.6}, z = Math.exp(-2.5 * 0.5);
    expect(toneCurve(curve, 0)).toBe(0);
    expect(toneCurve(curve, 0.5)).toBeCloseTo((1 - z) * (1 - 0.6 * z) ** 2, 9);
    expect(toneCurve(curve, 0.18)).toBeLessThan(0.18);
    expect(toneCurve(curve, 10)).toBeLessThanOrEqual(1);
    for (const y of [0, 0.05, 0.3, 0.7, 0.95]) expect(toneCurve(curve, inverseToneCurve(curve, y))).toBeCloseTo(y, 6);
  });

  it("takes each profile value at its knot of direct-sun strength, interpolates between and holds past the ends", () => {
    // Knots 0 and 60: a sun whose strongest channel is 30, above 1°, sits half way; at or below the horizon it is profile 0.
    expect(profileAt(TYPE, sun(30, 0))).toEqual({targetExposure: 0.4, lightDarkBorder: 1.5, minExposure: 0, maxExposure: 4, whiteBalanceK: 7000, toneCurve: {a: 2.5, b: 0.6}, sunGlareScalar: 1, bloom: {threshold: 1.5, remapFactor: 0.5, luminance: 1.5}});
    const mid = profileAt(TYPE, sun(30, 30));
    expect(mid.targetExposure).toBeCloseTo(0.3); expect(mid.whiteBalanceK).toBeCloseTo(6750);
    expect(mid.lightDarkBorder).toBeCloseTo(1.375); expect(mid.maxExposure).toBeCloseTo(2.5);
    expect(mid.toneCurve.a).toBeCloseTo(2.75); expect(mid.toneCurve.b).toBeCloseTo(0.65);
    expect(profileAt(TYPE, sun(30, -20)).targetExposure).toBe(0.4);
    expect(profileAt(TYPE, sun(70, 30)).targetExposure).toBe(0.2);
  });

  it('blends each profile toward its overcast look by the cloud cover squared, raised to the profile power', () => {
    // Full cover: the overcast look (target 1.5x, 7500 K, curve 2 / 0.5).
    const covered = profileAt(TYPE, sun(30, 0), 1);
    expect(covered.targetExposure).toBeCloseTo(0.6, 12); expect(covered.whiteBalanceK).toBe(7500); expect(covered.toneCurve).toEqual({a: 2, b: 0.5});
    expect([covered.lightDarkBorder, covered.minExposure, covered.maxExposure]).toEqual([2, 0.1, 5]);
    // Half cover with power 1: a quarter of the way (the sun is taken as half hidden by half the sky covered).
    const half = profileAt(TYPE, sun(30, 0), 0.5);
    expect(half.targetExposure).toBeCloseTo(0.4 + 0.2 * 0.25, 12); expect(half.whiteBalanceK).toBeCloseTo(7125, 9);
    // Between profiles, each end blends first, then the position interpolates.
    expect(profileAt(TYPE, sun(30, 30), 1).targetExposure).toBeCloseTo(0.45, 12);
  });

  it('exposes by the law U · (B · T)^(1 - s) · (G / (U · L))^s inside the look limits: brighter scenes get less exposure, by the adaptation scale', () => {
    const unit = meterUnit(2.2), look = {...profileAt(TYPE, sun(30, 0)), targetExposure: 0.3, lightDarkBorder: 1.5, minExposure: 0.05, maxExposure: 2};
    // G is the target on the meter's scale: −ln(1 − 0.3).
    const grey = -Math.log(0.7), at = (light: number) => unit * (1.5 * 0.3) ** 0.6 * (grey / light) ** 0.4;
    expect(meterGrey(0.3)).toBeCloseTo(grey, 12);
    expect(lawExposure(look, 0.4, Math.log(1 / unit), unit)).toBeCloseTo(at(1), 9);
    expect(lawExposure(look, 0.4, Math.log(4 / unit), unit)).toBeCloseTo(at(4), 9);
    expect(lawExposure(look, 0.6, Math.log(4), unit)).toBeLessThan(lawExposure(look, 0.4, Math.log(4), unit));
    // A very dark scene stops at the maximum, a very bright one at the minimum (both on the camera's scale, so times U).
    expect(lawExposure(look, 0.4, Math.log(1e-9 / unit), unit)).toBeCloseTo(unit * 2, 12);
    expect(lawExposure(look, 0.4, Math.log(1e9 / unit), unit)).toBeCloseTo(unit * 0.05, 12);
    expect(meterUnit(4.4)).toBeCloseTo(unit / 2, 12); // The package's scale, not a constant of the app.
  });

  it('leaves colours alone at 6500 K and cools them toward a bluer profile white, keeping green', () => {
    const grey = (kelvin: number) => new Vector3(0.5, 0.5, 0.5).applyMatrix3(whiteBalance(kelvin));
    expect(grey(6500).toArray().map(c => Number(c.toFixed(6)))).toEqual([0.5, 0.5, 0.5]);
    const cool = grey(7500); // White shows as the profile's bluer white.
    expect(cool.y).toBeCloseTo(0.5, 6); expect(cool.z).toBeGreaterThan(cool.y); expect(cool.y).toBeGreaterThan(cool.x);
    expect(cool.x / cool.y).toBeCloseTo(0.923, 3); // Capture 21459 (7500 K): the game's white shows red at 0.957 of green after the encode.
  });

  it('links the canvas pass for the canvas and the metering pass for its own target, and leaves the renderer as it was', async () => {
    const before = new WebGLRenderTarget(4, 4), compiled: {pass: Object3D; target: WebGLRenderTarget | null}[] = [];
    let current: WebGLRenderTarget | null = before;
    const renderer = {
      getRenderTarget: () => current, setRenderTarget: (target: WebGLRenderTarget | null) => { current = target; },
      compileAsync: vi.fn(async (pass: Object3D) => { compiled.push({pass, target: current}); }),
    } as unknown as WebGLRenderer;
    const exposure = createAutoExposure(renderer, testCamera(), sun(30, 40), () => {});
    expect(exposure.target).toMatchObject({samples: 4, depthBuffer: true, resolveDepthBuffer: false});
    await exposure.link();
    expect(current).toBe(before);
    // The canvas pass draws to the canvas; the metering pass to its small target, neither the HDR target nor the one set before.
    expect(compiled[0].target).toBeNull();
    expect(compiled[1].target).toBeInstanceOf(WebGLRenderTarget);
    expect([exposure.target, before]).not.toContain(compiled[1].target);
    exposure.dispose();
  });

  it("chooses the active type's profile by a new sun and weather, keeping the type", () => {
    const invalidate = vi.fn(), exposure = createAutoExposure({} as WebGLRenderer, testCamera(), sun(30, 0), invalidate);
    exposure.setType('onboard'); invalidate.mockClear();
    const before = exposure.display();
    exposure.setSun(sun(70, 30), 1);
    expect(exposure.display()).not.toBe(before);
    expect(exposure.display().toneCurve).toEqual(profileAt(testCamera().types.onboard, sun(70, 30), 1).toneCurve);
    expect(invalidate).toHaveBeenCalled();
    exposure.dispose();
  });

  it("meters and adapts on the GPU: the canvas pass and the adaptation read one state target, the adaptation writes the other", () => {
    const passes: string[] = [];
    let target: WebGLRenderTarget | null = null;
    const initRenderTarget = vi.fn();
    const renderer = {
      getContext: () => ({}), getRenderTarget: () => target, setRenderTarget: (next: WebGLRenderTarget | null) => { target = next; },
      // The bloom's passes are `bloom.test.ts`'s; here one stands for them all.
      initRenderTarget, render: (scene: Scene) => {
        const pass = `${scene.name || 'replay'}>${target ? `${target.width}x${target.height}` : 'canvas'}`;
        if (scene.name !== BLOOM_PASS) passes.push(pass); else if (passes.at(-1) !== BLOOM_PASS) passes.push(BLOOM_PASS);
      },
      getDrawingBufferSize: (size: {set(x: number, y: number): unknown}) => size.set(8, 8),
    } as unknown as WebGLRenderer;
    const exposure = createAutoExposure(renderer, testCamera(), sun(30, 40), () => {});
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const shown = () => exposureUniforms.exposure_state.value;
      exposure.render(new Scene(), {} as never);
      // The replay into the HDR target, the canvas pass, the metering and the adaptation into a 1 × 1 state: nothing read back.
      expect(passes).toEqual(['replay>8x8', BLOOM_PASS, `${EXPOSURE_PASS}>canvas`, `${EXPOSURE_PASS}>32x18`, `${EXPOSURE_PASS}>1x1`]);
      expect(initRenderTarget).toHaveBeenCalledTimes(2);
      const first = shown();
      passes.length = 0; now += 17; exposure.render(new Scene(), {} as never);
      // Within the metering period (four frames at 60 Hz): no metering, the state adapted again into the other target.
      expect(passes).toEqual(['replay>8x8', BLOOM_PASS, `${EXPOSURE_PASS}>canvas`, `${EXPOSURE_PASS}>1x1`]);
      expect(shown()).not.toBe(first);
      now += 17; exposure.render(new Scene(), {} as never);
      expect(shown()).toBe(first);
      expect(target).toBeNull();
    } finally { exposure.dispose(); vi.restoreAllMocks(); }
    expect(exposureUniforms.exposure_state.value).toBeNull();
  });

  it("gives the GPU the law in stops, as lawExposure has it, and the adaptation's values", () => {
    let material: {uniforms: Record<string, {value: unknown}>} | null = null;
    const renderer = {
      getRenderTarget: () => null, setRenderTarget() {}, initRenderTarget() {}, getDrawingBufferSize: (size: {set(x: number, y: number): unknown}) => size.set(8, 8),
      render: (scene: Scene) => {
        const mesh = scene.children[0] as unknown as {material: {uniforms: Record<string, {value: unknown}>}} | undefined;
        if (mesh?.material.uniforms.logUnit) material = mesh.material;
      },
    } as unknown as WebGLRenderer;
    const camera = testCamera(), exposure = createAutoExposure(renderer, camera, sun(30, 40), () => {}, 'onboard');
    exposure.render(new Scene(), {} as never);
    const u = material!.uniforms, value = (name: string) => u[name].value as number;
    const look = profileAt(camera.types.onboard, sun(30, 40)), unit = meterUnit(camera.sceneLuminanceScale), scale = camera.types.onboard.adaptationScale;
    // The shader's target for a metered luminance L (natural log), from its uniforms, is the law's exposure in stops.
    for (const metering of [-6, -1, 0, 2, 9]) {
      const free = (1 - value('scale')) * value('logBorder') + value('scale') * (value('logGrey') - value('logUnit') - metering / Math.LN2);
      const stops = value('logUnit') + Math.min(value('logMax'), Math.max(value('logMin'), free));
      expect(stops).toBeCloseTo(Math.log2(lawExposure(look, scale, metering, unit)), 9);
    }
    expect((u.adaptation.value as {toArray(): number[]}).toArray()).toEqual([0.25, 1, -1, -1]);
    // A camera type switch gives the next adaptation the new type's law, metering the new window at once.
    expect(value('fresh')).toBe(1);
    exposure.render(new Scene(), {} as never); expect(value('fresh')).toBe(0);
    exposure.setType('tv'); exposure.render(new Scene(), {} as never);
    expect(value('scale')).toBe(camera.types.tv.adaptationScale); expect(value('fresh')).toBe(1);
    exposure.dispose();
  });

  it('lands on the law at the next RESET_METERINGS meterings after a reset, metering at once, then adapts again', () => {
    let material: {uniforms: Record<string, {value: unknown}>} | null = null;
    const renderer = {
      getRenderTarget: () => null, setRenderTarget() {}, initRenderTarget() {}, getDrawingBufferSize: (size: {set(x: number, y: number): unknown}) => size.set(8, 8),
      render: (scene: Scene) => {
        const mesh = scene.children[0] as unknown as {material: {uniforms: Record<string, {value: unknown}>}} | undefined;
        if (mesh?.material.uniforms.logUnit) material = mesh.material;
      },
    } as unknown as WebGLRenderer;
    const invalidate = vi.fn(), exposure = createAutoExposure(renderer, testCamera(), sun(30, 40), invalidate);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const frame = () => { now += 17; exposure.render(new Scene(), {} as never); const u = material!.uniforms; return `${String(u.fresh.value)}${String(u.snap.value)}`; };
      frame(); frame();
      invalidate.mockClear(); exposure.reset(); expect(invalidate).toHaveBeenCalled();
      // Metering every fourth frame: each metering lands until four have, the frames between adapt.
      const seen = Array.from({length: 17}, frame);
      expect(seen.filter(each => each === '11')).toHaveLength(RESET_METERINGS);
      expect(seen[0]).toBe('11'); expect(seen.slice(-4)).not.toContain('11'); expect(seen).not.toContain('01');
    } finally { exposure.dispose(); vi.restoreAllMocks(); }
  });

  it('reads the state back on quiet frames only, at most every 250 ms, and stops asking for frames once it has settled', () => {
    const frames: Array<() => void> = [], flush = () => frames.splice(0).forEach(callback => callback());
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
    const calls: string[] = [], signals: string[] = [];
    let state = [0, 0, 0, 0], fenceFails = false;
    const gl = {
      PIXEL_PACK_BUFFER: 1, STREAM_READ: 2, RGBA: 3, FLOAT: 4, SYNC_GPU_COMMANDS_COMPLETE: 7, WAIT_FAILED: 8, TIMEOUT_EXPIRED: 9, ALREADY_SIGNALED: 10,
      createBuffer: () => { calls.push('createBuffer'); return {}; }, deleteBuffer: () => calls.push('deleteBuffer'),
      bindBuffer: () => {}, bufferData: () => {}, readPixels: () => calls.push('readPixels'),
      fenceSync: () => (fenceFails ? null : {}), flush: () => {}, deleteSync: () => calls.push('deleteSync'),
      clientWaitSync: () => (signals.shift() === 'pending' ? 9 : 10),
      getBufferSubData: (_target: number, _offset: number, into: Float32Array) => { calls.push('getBufferSubData'); into.set(state); },
    };
    const invalidated = vi.fn();
    const renderer = {
      getContext: () => gl, getRenderTarget: () => null, setRenderTarget() {}, initRenderTarget() {}, render() {},
      getDrawingBufferSize: (size: {set(x: number, y: number): unknown}) => size.set(8, 8),
    } as unknown as WebGLRenderer;
    const camera = testCamera(), exposure = createAutoExposure(renderer, camera, sun(30, 40), invalidated);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const frame = (quiet: boolean) => { now += 17; invalidated.mockClear(); exposure.render(new Scene(), {} as never, quiet); };
    try {
      // A frame something else asked for (the replay moving) reads nothing back, and asks for the next.
      frame(false);
      expect(calls).toEqual([]); expect(invalidated).toHaveBeenCalled();
      // A quiet frame reads the state; the fence has not signalled at the next frame's top, then has.
      signals.push('pending', 'signalled');
      frame(true);
      expect(calls).toEqual(['createBuffer', 'readPixels']);
      exposure.collect(); expect(calls).not.toContain('getBufferSubData');
      // Not yet settled: 1 stop off the law's target for its metering. The reading asks for more frames.
      const look = profileAt(camera.types.external, sun(30, 40)), unit = meterUnit(camera.sceneLuminanceScale);
      const target = Math.log2(lawExposure(look, camera.types.external.adaptationScale, -1, unit));
      state = [target - 1, 0, -1, 1]; invalidated.mockClear();
      flush();
      expect(calls.slice(-3)).toEqual(['getBufferSubData', 'deleteSync', 'deleteBuffer']); expect(invalidated).toHaveBeenCalled();
      // The next reading waits 250 ms; then on the target it settles, and quiet frames stop asking.
      frame(true); expect(calls.filter(call => call === 'readPixels')).toHaveLength(1);
      now += 250; frame(true); expect(calls.filter(call => call === 'readPixels')).toHaveLength(2);
      state = [target, 0, -1, 1]; exposure.collect();
      frame(true); expect(invalidated).not.toHaveBeenCalled();
      // A frame that moved unsettles it again; a reading taken before such a frame is dropped.
      frame(false); expect(invalidated).toHaveBeenCalled();
      now += 250; frame(true); frame(false); exposure.collect();
      frame(true); expect(invalidated).toHaveBeenCalled();
      // A fence that cannot be made (a lost context) lets its reading's buffer go.
      fenceFails = true; now += 250; frame(true); fenceFails = false;
      expect(calls.slice(-2)).toEqual(['readPixels', 'deleteBuffer']);
      // After a reset (the viewer's day/night switch, paused), quiet frames read nothing back until its meterings have landed, and
      // keep asking for frames meanwhile: a first metering of a frame exposed for the other light lands on its own target.
      now += 250; exposure.reset();
      const reads = () => calls.filter(call => call === 'readPixels').length, before = reads();
      for (let i = 0; i < 12; i++) { frame(true); expect(invalidated).toHaveBeenCalled(); }
      expect(reads()).toBe(before);
      frame(true); expect(reads()).toBe(before + 1);
      // A reading pending at dispose lets its buffer and fence go.
      now += 250; frame(true);
      exposure.dispose();
      expect(calls.slice(-2)).toEqual(['deleteSync', 'deleteBuffer']);
    } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
  });
});
