import { describe, expect, it, vi } from 'vitest';
import { Color, Vector3, WebGLRenderTarget, type Object3D, type WebGLRenderer } from 'three';
import { adaptExposure, createAutoExposure, inverseToneCurve, lawExposure, meteredLuminance, meterGrey, meterUnit, profileAt, toneCurve, whiteBalance } from '../../../../src/components/replay/view3d/autoExposure.js';
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
    expect(profileAt(TYPE, sun(30, 0))).toEqual({targetExposure: 0.4, lightDarkBorder: 1.5, minExposure: 0, maxExposure: 4, whiteBalanceK: 7000, toneCurve: {a: 2.5, b: 0.6}, sunGlareScalar: 1});
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

  it('meters the luminance of the tone-mapped taps\' mean through the curve\'s exponential alone; a sun glint barely counts', () => {
    const curve = {a: 2.658, b: 0.665}, exposure = 0.5, taps = 128 * 72;
    const reading = (lights: number[]) => {
      const mean = lights.reduce((sum, light) => sum + toneCurve(curve, light * exposure), 0) / lights.length;
      return meteredLuminance([mean, mean, mean], exposure);
    };
    // A reference frame's reading: mean displayed luminance 0.1658 reads as 0.1813 exposed (the curve's exact inverse would be 0.2112).
    expect(Math.exp(meteredLuminance([0.1658, 0.1658, 0.1658], 1))).toBeCloseTo(0.1813, 4);
    expect(inverseToneCurve(curve, 0.1658)).toBeCloseTo(0.2112, 3);
    // Rec. 709 weights over the channels' means.
    expect(meteredLuminance([0.5, 0.1, 0.2], 1)).toBeCloseTo(Math.log(-Math.log(1 - (0.2126 * 0.5 + 0.7152 * 0.1 + 0.0722 * 0.2))), 12);
    const scene = Array<number>(taps).fill(0.15);
    const glint = [...scene.slice(1), 6000]; // One tap on glass catching the sun: capped at 1 by the curve.
    expect(Math.abs(reading(glint) - reading(scene))).toBeLessThan(0.01);
  });
  it('leaves colours alone at 6500 K and warms them under a bluer profile white', () => {
    const grey = (kelvin: number) => new Vector3(0.5, 0.5, 0.5).applyMatrix3(whiteBalance(kelvin));
    expect(grey(6500).toArray().map(c => Number(c.toFixed(6)))).toEqual([0.5, 0.5, 0.5]);
    const low = grey(7000); // The bluer light is corrected toward warm.
    expect(low.x).toBeGreaterThan(low.y); expect(low.y).toBeGreaterThan(low.z);
    expect(low.z / low.x).toBeCloseTo(0.89, 2); // 500 K warmer: blue about 11 % under red.
  });

  it('adapts the exposure in stops: a blend fraction per 0.15 s, capped in stops a second, smoothed twice, landing on the target', () => {
    const external = { sensitivity: 0.25, speedLimit: 1, delayS: 0, darkAdaptation: { scale: -1, sensitivity: -1, speedLimit: -1 } };
    // One 0.15 s frame toward a target 0.1 stop up: k = 0.25, the step 0.025, smoothed from rest to 0.25 of it.
    const first = adaptExposure({ log2: 0, step: 0 }, 0.1, 0.15, external);
    expect(first.log2).toBeCloseTo(0.025 * 0.25, 12); expect(first.step).toBeCloseTo(0.00625, 12);
    // Far off, the cap holds: at most one stop a second, here 0.15 stop for the frame, whichever way.
    expect(adaptExposure({ log2: 0, step: 0 }, -10, 0.15, external).log2).toBeGreaterThanOrEqual(-0.15);
    expect(adaptExposure({ log2: 0, step: 0 }, -10, 0.15, external).log2).toBeLessThan(0);
    // A step that would pass the target lands on it and stops.
    expect(adaptExposure({ log2: 0, step: 0 }, 1e-4, 0.15, { ...external, sensitivity: 1, speedLimit: 10000 })).toEqual({ log2: 1e-4, step: 0 });
    expect(adaptExposure({ log2: 0, step: 0 }, 1, 0, external)).toEqual({ log2: 0, step: 0 });
    // A darkening scene takes the dark set when it has its own values.
    const dark = { ...external, darkAdaptation: { scale: 1, sensitivity: 1, speedLimit: 10000 } };
    expect(adaptExposure({ log2: 0, step: 0 }, 2, 0.15, dark)).toEqual({ log2: 2, step: 0 });
    expect(adaptExposure({ log2: 0, step: 0 }, -2, 0.15, dark).log2).toBeGreaterThan(-0.15 - 1e-12);
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

  it('reads the metering target into a pack buffer of its own, once its fence has signalled, and adapts to the reading', async () => {
    const frames: Array<() => void> = [], flush = () => frames.splice(0).forEach(callback => callback());
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
    const half = 0x3c00; // 1.0 as a half float: every metered cell reads 1.
    const calls: string[] = [], signals = ['pending', 'signalled'];
    let fenceFails = false;
    const gl = {
      PIXEL_PACK_BUFFER: 1, STREAM_READ: 2, RGBA: 3, HALF_FLOAT: 4, IMPLEMENTATION_COLOR_READ_FORMAT: 5, IMPLEMENTATION_COLOR_READ_TYPE: 6,
      SYNC_GPU_COMMANDS_COMPLETE: 7, WAIT_FAILED: 8, TIMEOUT_EXPIRED: 9, ALREADY_SIGNALED: 10,
      getParameter: (name: number) => name === 5 ? 3 : 4,
      createBuffer: () => { calls.push('createBuffer'); return {}; }, deleteBuffer: () => calls.push('deleteBuffer'),
      bindBuffer: () => {}, bufferData: () => calls.push('bufferData'), readPixels: () => calls.push('readPixels'),
      fenceSync: () => (fenceFails ? null : {}), flush: () => {}, deleteSync: () => calls.push('deleteSync'),
      clientWaitSync: () => { calls.push('wait'); return signals.shift() === 'pending' ? 9 : 10; },
      getBufferSubData: (_target: number, _offset: number, into: Uint16Array) => { calls.push('getBufferSubData'); into.fill(half); },
    };
    const invalidated = vi.fn();
    const renderer = {
      getContext: () => gl, getRenderTarget: () => null, setRenderTarget() {}, render() {}, toneMappingExposure: 1,
      getDrawingBufferSize: (size: {set(x: number, y: number): unknown}) => size.set(8, 8),
    } as unknown as WebGLRenderer;
    const exposure = createAutoExposure(renderer, testCamera(), sun(30, 40), invalidated);
    try {
      exposure.render({} as never, {} as never);
      expect(calls).toEqual(['createBuffer', 'bufferData', 'readPixels']);
      flush(); // The fence has not signalled: no data is fetched yet.
      expect(calls).not.toContain('getBufferSubData');
      flush();
      expect(calls.slice(-4)).toEqual(['wait', 'getBufferSubData', 'deleteSync', 'deleteBuffer']);
      expect(invalidated).toHaveBeenCalled(); // The first reading is unadapted.
      // The next reading, a period on (four frames at 60 Hz): none before it.
      let now = performance.now();
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      for (let frame = 0; frame < 3; frame++) { now += 17; exposure.render({} as never, {} as never); }
      expect(calls.filter(call => call === 'readPixels')).toHaveLength(1);
      now += 17; exposure.render({} as never, {} as never);
      expect(calls.filter(call => call === 'createBuffer')).toHaveLength(2); // Written once each: the browser's copy of it stays.
      expect(calls.filter(call => call === 'readPixels')).toHaveLength(2);
      // A frame's top fetches it before the frame poll does; the poll then finds nothing to fetch.
      signals.push('signalled');
      exposure.collect();
      expect(calls.slice(-4)).toEqual(['wait', 'getBufferSubData', 'deleteSync', 'deleteBuffer']);
      const fetched = calls.length;
      flush(); exposure.collect();
      expect(calls).toHaveLength(fetched);
      // A fence that cannot be made (a lost context) lets its reading's buffer go.
      fenceFails = true; now += 300; exposure.render({} as never, {} as never); fenceFails = false;
      expect(calls.slice(-2)).toEqual(['readPixels', 'deleteBuffer']);
      // A reading pending at dispose lets its buffer and fence go.
      now += 300; exposure.render({} as never, {} as never);
      exposure.dispose();
      expect(calls.slice(-2)).toEqual(['deleteSync', 'deleteBuffer']);
    } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
  });
});
