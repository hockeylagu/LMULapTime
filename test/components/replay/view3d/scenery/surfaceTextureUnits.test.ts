import { MeshStandardMaterial, ShaderChunk, Texture } from 'three';
import { expect, it } from 'vitest';
import { surfaceMaterial } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceProgram.js';
import { BATCH_VERTEX_TEXTURES, CASCADE_SAMPLERS, LIT_SAMPLERS, REFLECTION_SAMPLERS, surfaceTextureUnits } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import type { SurfaceConfig, SurfaceKind, SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { composedMaterial } from '../../../../../src/components/replay/view3d/shaders/composer.js';
import { litTemplate } from '../../../../../src/components/replay/view3d/shaders/litTemplate.js';
import { surface } from './surfaceFixture.js';

const MAP: SurfaceMap = {texture: 't', uv: 'uv0', scale: [1, 1], srgb: true};
const mapsOf = (...keys: string[]) => Object.fromEntries(keys.map(key => [key, MAP]));
const TERRAIN_KEYS = ['layerA', 'layerB', 'layerC', 'layerD', 'normalA', 'normalB', 'mix', 'pattern', 'splatter', 'splatterOverlay'];
const SAMPLERS = /uniform\s+(?:highp\s+)?u?sampler\w+\s+\w+/g;

const count = (source: string) => source.match(SAMPLERS)?.length ?? 0;

/** The sampler declarations of `config`'s composed program (surfaceProgram.ts; three's includes stay unresolved, so its `dfgLUT` is not counted). */
function declared(config: SurfaceConfig): number {
  return count(surfaceMaterial(new MeshStandardMaterial(), config, Object.fromEntries(Object.keys(config.maps).map(key => [key, new Texture()]))).fragmentShader);
}

it("counts the samplers the surface program declares, the lit template's environment among them, plus three's DFG table", () => {
  const terrain = (maps: number) => surface('terrain', {maps: mapsOf(...TERRAIN_KEYS.slice(0, maps)), flags: {layers: '4'}});
  const configs = [
    terrain(10), terrain(9), surface('standard', {maps: mapsOf('albedo', 'normal')}), surface('glass', {maps: mapsOf('albedo')}),
    surface('diffuse', {maps: mapsOf('albedo')}), surface('highLumSun', {maps: mapsOf('albedo')}), surface('road', {maps: mapsOf('layerA', 'mix', 'splatter')}),
  ];
  for (const config of configs) expect(surfaceTextureUnits(config) - 1).toBe(declared(config));
  expect(declared(terrain(10))).toBe(10 + REFLECTION_SAMPLERS + CASCADE_SAMPLERS + 1);
  const plain: SurfaceKind[] = ['glass', 'diffuse', 'highLumSun'];
  for (const kind of plain) expect(surfaceTextureUnits(surface(kind, {maps: mapsOf('albedo')}))).toBe(1 + CASCADE_SAMPLERS + LIT_SAMPLERS);
});

it('matches the lit samplers: the environment the template declares and the DFG table of three, two vertex textures in a batch', () => {
  expect(ShaderChunk.lights_physical_pars_fragment).toContain('uniform sampler2D dfgLUT;');
  const lit = composedMaterial(litTemplate, []).fragmentShader;
  expect(lit).toContain('uniform samplerCube envMap;'); expect(lit).not.toContain('envmap_common_pars_fragment');
  expect(LIT_SAMPLERS).toBe(2);
  expect(ShaderChunk.batching_pars_vertex.match(SAMPLERS)?.length).toBe(BATCH_VERTEX_TEXTURES + 1); // The third is the optional colour texture.
  expect(ShaderChunk.batching_pars_vertex).toContain('#ifdef USE_BATCHING_COLOR');
});
