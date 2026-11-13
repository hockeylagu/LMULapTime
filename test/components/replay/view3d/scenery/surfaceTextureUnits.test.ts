import { ShaderChunk, ShaderLib, type WebGLProgramParametersWithUniforms } from 'three';
import { expect, it } from 'vitest';
import { patchSurfaceShader } from '../../../../../src/components/replay/view3d/scenery/materials/patchSurfaceShader.js';
import { BATCH_VERTEX_TEXTURES, CASCADE_SAMPLERS, REFLECTION_SAMPLERS, THREE_SAMPLERS, surfaceTextureUnits } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import type { SurfaceConfig, SurfaceKind, SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { surface } from './surfaceFixture.js';

const MAP: SurfaceMap = {texture: 't', uv: 'uv0', scale: [1, 1], srgb: true};
const mapsOf = (...keys: string[]) => Object.fromEntries(keys.map(key => [key, MAP]));
const TERRAIN_KEYS = ['layerA', 'layerB', 'layerC', 'layerD', 'normalA', 'normalB', 'mix', 'pattern', 'splatter', 'splatterOverlay'];
const SAMPLERS = /uniform\s+(?:highp\s+)?u?sampler\w+\s+\w+/g;

const count = (source: string) => source.match(SAMPLERS)?.length ?? 0;

/** The sampler declarations `config` adds to three's standard fragment shader (its includes stay unresolved; its own optional ones are not counted). */
function declared(config: SurfaceConfig): number {
  const shader = {uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader} as unknown as WebGLProgramParametersWithUniforms;
  patchSurfaceShader(shader, config, {});
  return count(shader.fragmentShader) - count(ShaderLib.standard.fragmentShader);
}

it('counts the samplers the surface program declares, plus the two of three', () => {
  const terrain = (maps: number) => surface('terrain', {maps: mapsOf(...TERRAIN_KEYS.slice(0, maps)), flags: {layers: '4'}});
  const configs = [
    terrain(10), terrain(9), surface('standard', {maps: mapsOf('albedo', 'normal')}), surface('glass', {maps: mapsOf('albedo')}),
    surface('diffuse', {maps: mapsOf('albedo')}), surface('highLumSun', {maps: mapsOf('albedo')}), surface('road', {maps: mapsOf('layerA', 'mix', 'splatter')}),
  ];
  for (const config of configs) expect(surfaceTextureUnits(config) - THREE_SAMPLERS).toBe(declared(config));
  expect(declared(terrain(10))).toBe(10 + REFLECTION_SAMPLERS + CASCADE_SAMPLERS);
  const plain: SurfaceKind[] = ['glass', 'diffuse', 'highLumSun'];
  for (const kind of plain) expect(surfaceTextureUnits(surface(kind, {maps: mapsOf('albedo')}))).toBe(1 + CASCADE_SAMPLERS + THREE_SAMPLERS);
});

it('matches the samplers three adds: environment and DFG table in the program, two vertex textures in a batch', () => {
  expect(ShaderChunk.lights_physical_pars_fragment).toContain('uniform sampler2D dfgLUT;');
  expect(ShaderChunk.envmap_common_pars_fragment).toContain('uniform samplerCube envMap;');
  expect(THREE_SAMPLERS).toBe(2);
  expect(ShaderChunk.batching_pars_vertex.match(SAMPLERS)?.length).toBe(BATCH_VERTEX_TEXTURES + 1); // The third is the optional colour texture.
  expect(ShaderChunk.batching_pars_vertex).toContain('#ifdef USE_BATCHING_COLOR');
});
