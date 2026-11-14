import { describe, expect, it } from 'vitest';
import { tyreReadsAxle } from '../../../../../src/components/replay/view3d/car/tyreSurface.js';
import { shaderParts } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import type { SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { surface } from '../scenery/surfaceFixture.js';

const map = (texture: string, srgb = false): SurfaceMap => ({ texture, uv: 'uv0', scale: [1, 1], srgb });
const maps = { albedo: map('A', true), aoSpec: map('S'), normal: map('N') };
const tyre = (flags: Record<string, string> = {}) => surface('tyre', { maps, flags, parameters: { adjust: { roughness: 0.55 }, wear: { albedoMultiply: 0.61, roughnessAdjust: 0.28 } } });

describe('tyre surface', () => {
  it('takes roughness from the albedo alpha, remapped by the material roughness, and AO from the aoSpec green', () => {
    const parts = shaderParts(tyre(), { uniforms: false });
    expect(parts.albedo).toContain('surfaceRoughness=surfaceAdjust(base.a,0.55000000)');
    expect(parts.albedo).toContain('surfaceAO=aoSpec.g;');
    expect(parts.albedo).toContain('surfaceMetallic=0.0;');
    expect(parts.normals).toContain('surfaceNormal(normal,');
  });

  it('darkens and roughens worn rubber by the vertex colour green, only with wear darkening', () => {
    expect(shaderParts(tyre(), { uniforms: false }).albedo).not.toContain('tyreNew');
    const worn = shaderParts(tyre({ wearDarkening: 'on' }), { uniforms: false }).albedo;
    expect(worn).toContain('surfaceAlbedo*=mix(0.61000000,1.0,tyreNew);');
    expect(worn).toContain('mix(0.28000000,0.0,tyreNew)');
  });

  it('scales only the reflected environment by the aoSpec red and the ground and tread dampings', () => {
    expect(shaderParts(tyre(), { uniforms: false }).occlusion).toBe('reflectedLight.indirectSpecular*=aoSpec.r;');
    const ground = shaderParts(tyre({ groundDamping: 'on' }), { uniforms: false }).occlusion;
    expect(ground).toContain('clamp(0.85+inverseTransformDirection(geometryNormal,viewMatrix).y,0.0,1.0)');
    const both = shaderParts(tyre({ groundDamping: 'on', treadDamping: 'on' }), { uniforms: false });
    expect(both.occlusion).toContain('min(clamp(0.85+');
    expect(both.occlusion).toContain('abs(vSurfaceAxle)-0.075');
    expect(both.declarations).toContain('varying float vSurfaceAxle;');
  });

  it('passes the axle normal only to tread-damped tyres', () => {
    expect(tyreReadsAxle(tyre({ treadDamping: 'on' }))).toBe(true);
    expect(tyreReadsAxle(tyre())).toBe(false);
    expect(shaderParts(tyre()).declarations).not.toContain('vSurfaceAxle');
  });
});
