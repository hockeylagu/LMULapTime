import { describe, expect, it } from 'vitest';
import { DoubleSide, MeshBasicMaterial, Texture, Vector2, Vector4, type IUniform, type Matrix3 } from 'three';
import { SURFACE_UV } from '../../../../../src/components/replay/view3d/scenery/materials/shaderContext.js';
import { composedCutOut, composedMaterial, composedParts, composedTextures, composedVariant, composeShader, cutOutOf } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { depthCutOutPart, depthTemplate } from '../../../../../src/components/replay/view3d/shaders/depthTemplate.js';

const includes = (source: string) => [...source.matchAll(/#include <(\w+)>/g)].map(match => match[1]);

describe('depth template', () => {
  it("packs depth as three's depth material does, from three's chunks unchanged", () => {
    const {vertexShader, fragmentShader} = composeShader(depthTemplate, []);
    expect(includes(vertexShader)).toEqual(['common', 'batching_pars_vertex', 'batching_vertex', 'begin_vertex', 'project_vertex']);
    expect(includes(fragmentShader)).toEqual(['common', 'alphatest_pars_fragment']);
    expect(fragmentShader).toContain('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );');
    expect(fragmentShader).toContain('#ifdef USE_REVERSED_DEPTH_BUFFER');
  });
  it('reads the opacity and alpha test off the material at upload', () => {
    const material = composedMaterial(depthTemplate, [], {opacity: 0.5, alphaTest: 0.25});
    expect([material.uniforms.opacity.value, material.uniforms.alphaTest.value]).toEqual([0.5, 0.25]);
    material.alphaTest = 0.75;
    expect(material.uniforms.alphaTest.value).toBe(0.75);
  });
  it("cuts a caster by a surface's cut-out where the surface reads it, on the surface's own uniforms, one program for every cut-out", () => {
    const texture = new Texture(), shift = {value: new Vector2(0.5, 0)};
    const cut = cutOutOf({value: texture}, {value: new Vector4(0, 1, 0, 0)}, {scale: {value: new Vector2(4, 2)}, shift});
    const material = composedMaterial(depthTemplate, [depthCutOutPart(cut)], {alphaTest: 0.5});
    expect([material.uniforms.cutOut_map, material.uniforms.cutOut_uvSets, material.uniforms.cutOut_scale, material.uniforms.cutOut_shift])
      .toEqual([cut.map, cut.uvSets, cut.scale, cut.shift]);
    expect(material.uniforms.cutOut_shift).toBe(shift);
    expect((material.uniforms.cutOut_transform.value as Matrix3).elements).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(composedTextures(material)).toEqual([texture]);
    // The surface's UV sets and world XZ, summed by the surface's own function, then turned, scaled and shifted.
    expect(material.vertexShader).toContain('vSurfaceXZ = position.xz; vSurfaceUV01 = vec4( uv, uv1 ); vSurfaceUV23 = vec4( uv2, uv3 );');
    expect(material.fragmentShader).toContain(SURFACE_UV);
    expect(material.fragmentShader).toContain('texture2D( cutOut_map, ( cutOut_transform * vec3( surfaceUv( cutOut_uvSets ), 1.0 ) ).xy * cutOut_scale + cutOut_shift )');
    expect(material.fragmentShader).toContain('if ( diffuseColor.a < alphaTest ) discard;');
    const other = composedMaterial(depthTemplate, [depthCutOutPart(cutOutOf({value: null}, {value: new Vector4()}))]);
    expect(other.customProgramCacheKey()).toBe(material.customProgramCacheKey());
    expect([(other.uniforms.cutOut_scale.value as Vector2).toArray(), (other.uniforms.cutOut_shift.value as Vector2).toArray()]).toEqual([[1, 1], [0, 0]]);
  });
  it("makes a variant of a composed material with parts and parameters of its own", () => {
    const base = composedMaterial(depthTemplate, []), cut = depthCutOutPart(cutOutOf({value: null}, {value: new Vector4()}));
    const variant = composedVariant(base, [cut], {side: DoubleSide, alphaTest: 0.5});
    expect(composedParts(variant)).toEqual([cut]);
    expect([variant.side, variant.alphaTest]).toEqual([DoubleSide, 0.5]);
    expect(variant.customProgramCacheKey()).not.toBe(base.customProgramCacheKey());
    expect(composedCutOut(variant)).toBeNull(); expect(composedCutOut(base)).toBeNull();
    expect(() => composedVariant(new MeshBasicMaterial(), [])).toThrow('is not composed');
  });
  it('lets one part only give the cut-out of a material, and only from uniforms it gives', () => {
    const named = (name: string, key: string) => ({name, slots: {}, uniforms: () => ({[`${name}_map`]: {value: null}, [`${name}_uv`]: {value: new Vector4()}}),
      cutOut: (own: Record<string, IUniform>) => cutOutOf(own[key], own[`${name}_uv`])});
    const material = composedMaterial(depthTemplate, [named('a', 'a_map')]);
    expect(composedCutOut(material)?.map).toBe(material.uniforms.a_map);
    expect(() => composedMaterial(depthTemplate, [named('a', 'a_map'), named('b', 'b_map')])).toThrow('already cuts out');
    expect(() => composedMaterial(depthTemplate, [named('a', 'other')])).toThrow('names a uniform its part does not give');
  });
});
