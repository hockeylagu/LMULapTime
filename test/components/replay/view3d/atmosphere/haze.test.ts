import { Color, ShaderChunk, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { createHaze } from '../../../../../src/components/replay/view3d/atmosphere/haze.js';

const shape = (originY: number) => ({originY, height: {amount: 0.5, rate: 0.01, exponent: 2}, sunDirection: new Vector3(0, 1, 0), sunRadiance: new Color(1, 1, 1), sunward: 0.3});

it("writes each scene's own haze terms back before it compiles, whichever scene was built last", () => {
  const first = createHaze(shape(12)), second = createHaze(shape(-40));
  first();
  expect(ShaderChunk.fog_pars_fragment).toContain('HAZE_ORIGIN_Y = 12.0');
  second();
  expect(ShaderChunk.fog_pars_fragment).toContain('HAZE_ORIGIN_Y = -40.0');
  first();
  expect(ShaderChunk.fog_pars_fragment).toContain('HAZE_ORIGIN_Y = 12.0');
  expect(ShaderChunk.fog_fragment).toContain('max( vFogDepth, 0.0 )');
});
