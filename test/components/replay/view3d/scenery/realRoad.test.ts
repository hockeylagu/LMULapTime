import { BufferAttribute, BufferGeometry, Group, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { REALROAD_NONE } from '../../../../../shared/packageContract/scenery.js';
import { patchSurfaceShader } from '../../../../../src/components/replay/view3d/scenery/materials/patchSurfaceShader.js';
import { shaderParts, surfaceTextureUnits } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import type { SurfaceConfig, SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import {
  ASSUMED_RUBBER, assumedSurfaceState, createRealRoadSurface, fillVertexStates, gatherPointStates, medianRubber, REALROAD_POINT_ATTRIBUTE,
  REALROAD_STATE_ATTRIBUTE, realRoadUniforms,
} from '../../../../../src/components/replay/view3d/scenery/realRoad.js';
import { surface } from './surfaceFixture.js';

const map = (texture: string, uv: SurfaceMap['uv'] = 'uv0'): SurfaceMap => ({ texture, uv, scale: [1, 1], srgb: false });
const GROOVE = { albedo: [0.1, 0.11, 0.14], roughness: 0.6, specular: 0.5 };
const MARBLES = { albedo: [0.08, 0.08, 0.09], roughness: 0.9, specular: 0.175 };
const DUST = { albedo: [0.44, 0.41, 0.36], roughness: 0.95, specular: 0.5, overallScale: 0.5, marbleScale: 0.5 };

function road(flags: Record<string, string>, maps: Record<string, SurfaceMap> = {}): SurfaceConfig {
  return surface('road', { maps: { albedo: map('A'), ...maps }, flags, parameters: { groove: GROOVE, marbles: MARBLES, dust: DUST } });
}
function kerb(flags: Record<string, string>, maps: Record<string, SurfaceMap> = {}): SurfaceConfig {
  return surface('kerb', { maps: { albedo: map('A'), ...maps }, flags, parameters: { groove: GROOVE, marbles: MARBLES, dust: DUST, kerbBlend: { groove: 0.4, marbles: 0.2 } } });
}
const literal = (config: SurfaceConfig) => shaderParts(config, { uniforms: false }).albedo.replace(/\s+/g, '');

describe('surface state attribute', () => {
  it('gathers each point the rubber and loose material of its element, none for a point without one', () => {
    const state = Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80]), out = new Uint8Array(6).fill(9);
    gatherPointStates(Uint32Array.from([1, REALROAD_NONE, 0]), state, out);
    expect([...out]).toEqual([50, 60, 0, 0, 10, 20]);
  });
  it('writes each vertex its point, none for a vertex without one or past the table', () => {
    const out = new Uint8Array(8).fill(9);
    fillVertexStates(Float32Array.from([1, -1, 0, 2]), Uint8Array.from([1, 2, 3, 4]), out);
    expect([...out]).toEqual([3, 4, 0, 0, 1, 2, 0, 0]);
  });
  it('takes the median rubber of the elements', () => {
    expect(medianRubber(Uint8Array.from([0, 9, 9, 9, 51, 0, 0, 0, 255, 0, 0, 0]))).toBe(51 / 255);
    expect(medianRubber(assumedSurfaceState(5))).toBe(ASSUMED_RUBBER / 255);
  });
  it('gives new vertices the state drawn now, writes the followed ones again on each state and forgets them once disposed', () => {
    const surfaceState = createRealRoadSurface(Uint32Array.from([0, REALROAD_NONE, 1]), 2);
    const geometry = new BufferGeometry();
    geometry.setAttribute(REALROAD_POINT_ATTRIBUTE, new BufferAttribute(Float32Array.from([2, 0, 1]), 1));
    const plain = new BufferGeometry(), root = new Group().add(new Mesh(geometry), new Mesh(plain));
    surfaceState.prepare(root);
    const written = geometry.getAttribute(REALROAD_STATE_ATTRIBUTE) as BufferAttribute;
    expect([written.itemSize, written.normalized, [...written.array]]).toEqual([2, true, [ASSUMED_RUBBER, 0, ASSUMED_RUBBER, 0, 0, 0]]);
    expect(plain.getAttribute(REALROAD_STATE_ATTRIBUTE)).toBeUndefined();
    surfaceState.follow([root]);
    const version = written.version;
    surfaceState.setState(Uint8Array.from([200, 30, 0, 0, 100, 0, 0, 0]));
    expect([...written.array]).toEqual([100, 0, 200, 30, 0, 0]);
    expect(written.version).toBeGreaterThan(version);
    expect(realRoadUniforms.surface_realRoadMedian.value).toBe(100 / 255);
    expect(() => surfaceState.setState(new Uint8Array(4))).toThrow(/2 elements/);
    geometry.dispose();
    surfaceState.setState(null);
    expect([...written.array]).toEqual([100, 0, 200, 30, 0, 0]);
    surfaceState.dispose();
    expect(realRoadUniforms.surface_realRoadMedian.value).toBe(0);
  });
  it('refuses a table naming an element past the count', () => {
    expect(() => createRealRoadSurface(Uint32Array.from([0, 3]), 3)).toThrow(/element 3 of 3/);
  });
});

describe('road and kerb surface state terms', () => {
  it('lays the groove by the vertex rubber over the road details, weighted by the mask below and above half', () => {
    const glsl = literal(road({ groove: 'perVertex', grooveMap: 'on', roadDetailsMap: 'on' }, { groove: map('G'), roadDetails: map('R') }));
    expect(glsl).toContain('floatrealRoadGroove=vSurfaceRealRoad.x,realRoadMarbles=0.0');
    expect(glsl).toContain('floatgroovePerc=mix(roadDetails.g,1.0,realRoadGroove);');
    expect(glsl).toContain('floatsurfaceGroove=max(2.0*max(groovePerc-0.5,0.0)*grooveMask.g,grooveMask.r*min(1.5*groovePerc,1.0));');
    expect(glsl).toContain('diffuseColor.rgb=mix(diffuseColor.rgb,grooveAlbedo*grooveAlbedo,surfaceGroove);');
    // The mix comes after the tint and the roughness adjustment, on the finished road.
    expect(glsl.indexOf('surfaceGroove=')).toBeGreaterThan(glsl.indexOf('surfaceAO=mix(1.0,aoSpec.g'));
  });
  it('reads a full mask without the mask flag, none for a flag without its map, and the track median for a track-average groove', () => {
    expect(literal(road({ groove: 'perVertex' }))).toContain('vec2grooveMask=vec2(1.0);');
    expect(literal(road({ groove: 'perVertex', grooveMap: 'on' }))).toContain('vec2grooveMask=vec2(0.0);');
    expect(literal(road({ groove: 'perVertex' }))).toContain('floatgroovePerc=realRoadGroove;');
    expect(literal(road({ groove: 'trackAverage' }))).toContain('floatrealRoadGroove=surface_realRoadMedian');
    expect(literal(road({}))).not.toContain('surfaceGroove');
  });
  it('clears dust with a quarter of the groove and gathers it with marbles, then lays the marbles by their mask', () => {
    const glsl = literal(road({ groove: 'perVertex', dust: 'on', marbles: 'on', marbleDustMap: 'on', roadDetailsMap: 'on' }, { marbleDust: map('M', 'worldPlanar'), roadDetails: map('R') }));
    expect(glsl).toContain('realRoadMarbles=vSurfaceRealRoad.y');
    expect(glsl).toContain('texture2D(surface_marbleDust,(vSurfaceXZ*');
    expect(glsl).toContain('floatdustBlend=clamp(0.5-4.0*realRoadGroove,0.0,1.0)*0.50000000*clamp((max(realRoadMarbles*0.50000000,roadDetails.r)-marbleDustMask.g)/0.5,0.0,1.0);');
    expect(glsl).toContain('floatmarblesBlend=realRoadMarbles*marbleDustMask.r;');
    expect(glsl).toContain('diffuseColor.rgb=mix(diffuseColor.rgb,marblesAlbedo*marblesAlbedo,marblesBlend);');
    // Dust and marbles go on after the groove, in that order.
    expect(glsl.indexOf('surfaceGroove=')).toBeLessThan(glsl.indexOf('dustBlend='));
    expect(glsl.indexOf('dustBlend=')).toBeLessThan(glsl.indexOf('marblesBlend='));
    expect(literal(road({ dust: 'on' }))).toContain('vec2marbleDustMask=vec2(1.0);');
  });
  it('moves the kerb alternate blend by the groove and marbles, lays its groove by the square root, and flattens it under dust and marbles', () => {
    const config = kerb({ groove: 'perVertex', marbles: 'on', blendWetMask: 'on', roadDetailsMap: 'on' }, { normal: map('N'), blendWet: map('W'), roadDetails: map('R') });
    const glsl = literal(config);
    expect(glsl).toContain('clamp(roadDetails.b*0.40000000+realRoadGroove*0.40000000+realRoadMarbles*0.20000000,0.0,1.0)');
    expect(glsl).toContain('diffuseColor.rgb=mix(diffuseColor.rgb,grooveAlbedo*grooveAlbedo,sqrt(surfaceGroove));');
    expect(shaderParts(config, { uniforms: false }).normals).toContain('blendWet.r*realRoadKeep*0.5');
  });
  it('reads the vertex state in the vertex stage, with no texture', () => {
    const vertex = '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <worldpos_vertex>';
    const fragment = ['common', 'map_fragment', 'roughnessmap_fragment', 'metalnessmap_fragment', 'normal_fragment_maps', 'lights_physical_fragment', 'aomap_fragment',
      'emissivemap_fragment', 'normal_fragment_begin', 'lights_physical_pars_fragment', 'shadowmap_pars_fragment', 'lights_fragment_begin', 'lights_fragment_maps',
      'lights_fragment_end', 'opaque_fragment'].map(chunk => `#include <${chunk}>`).join('\n');
    const patched = (config: SurfaceConfig) => {
      const shader = { uniforms: {}, vertexShader: vertex, fragmentShader: fragment } as unknown as Parameters<typeof patchSurfaceShader>[0];
      patchSurfaceShader(shader, config, {});
      return shader;
    };
    const perVertex = patched(road({ groove: 'perVertex' }));
    expect(perVertex.vertexShader).toContain(`attribute vec2 ${REALROAD_STATE_ATTRIBUTE};`);
    expect(perVertex.vertexShader).toContain(`vSurfaceRealRoad = ${REALROAD_STATE_ATTRIBUTE};`);
    expect(perVertex.fragmentShader).toContain('varying vec2 vSurfaceRealRoad;');
    const average = patched(road({ groove: 'trackAverage' }));
    expect(average.vertexShader).not.toContain(REALROAD_STATE_ATTRIBUTE);
    expect(average.uniforms.surface_realRoadMedian).toBe(realRoadUniforms.surface_realRoadMedian);
    // An attribute, not a texture: the state takes no texture unit, so a road keeps its batch.
    expect(surfaceTextureUnits(road({ marbles: 'on' }))).toBe(surfaceTextureUnits(road({})));
  });
});
