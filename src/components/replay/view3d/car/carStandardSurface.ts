import { Vector4, type Color, type IUniform, type Texture } from 'three';
import { focusedLookup } from '../scenery/textureFocus.js';
import { cutOutOf, type ShaderPart } from '../shaders/composer.js';

/** The weights of the UV sets 0 to 3 a map reads by its channel: one of them 1, so the weighted sum is that set exactly. */
const CHANNEL_WEIGHTS: readonly (readonly [number, number, number, number])[] = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

/**
 * A car part's albedo map (`map`): read on its UV set (the texture's `channel`, a weight per set, so maps on other sets share the
 * program) through the texture's own transform (its repeat, as three's `mapTransform`), times the colour so far, as three's
 * `map_fragment` reads it before the vertex colour. `focus`: the lookup fades in as the texture sharpens (textureFocus.ts; the
 * material then takes `textureFocusPart` for `map`). The coordinates are `vCarMapUv` for the families that read them too. The
 * texture is the material's own, and cuts it out where it is alpha tested.
 */
export function carMapPart(map: Texture, focus: boolean): ShaderPart {
  const weights = CHANNEL_WEIGHTS[map.channel];
  if (!weights) throw Error(`Car map ${map.name || map.uuid} reads UV set ${map.channel}`);
  const uniforms: Record<string, IUniform> = {
    map: {value: map}, carMap_uv: {value: new Vector4(...weights)},
    // The map's transform as three refreshes it for its own materials (an auto-updated texture recomputes its matrix first).
    carMap_transform: {get value() { if (map.matrixAutoUpdate) map.updateMatrix(); return map.matrix; }},
  };
  const sets = [1, 2, 3].map(set => `#ifndef USE_UV${set}\nattribute vec2 uv${set};\n#endif`).join('\n');
  return {
    name: 'carMap',
    slots: {
      vertexPars: {at: 5, glsl: `${sets}\nuniform mat3 carMap_transform;\nuniform vec4 carMap_uv;\nvarying vec2 vCarMapUv;`},
      vertexOutputs: {at: 5, glsl: '  vCarMapUv = ( carMap_transform * vec3( uv * carMap_uv.x + uv1 * carMap_uv.y + uv2 * carMap_uv.z + uv3 * carMap_uv.w, 1.0 ) ).xy;'},
      fragmentPars: {at: 5, glsl: 'uniform sampler2D map;\nvarying vec2 vCarMapUv;'},
      fragmentAlbedo: {at: 0, glsl: `  diffuseColor *= ${focus ? focusedLookup('map', 'vCarMapUv') : 'texture2D( map, vCarMapUv )'};`},
    },
    uniforms: () => uniforms,
    ownTextures: ['map'],
    cutOut: own => cutOutOf(own.map, own.carMap_uv, {transform: own.carMap_transform}),
  };
}

/** A car part's values on three's standard model: its colour, roughness and metalness, and its emission (none: black). */
export interface CarStandard { colour: Color; roughness: number; metalness: number; emissive?: Color }

/**
 * A car part on three's standard model without a surface description of its own (number plates, effects, the far models' parts):
 * its colour (`diffuse`, first on the albedo, before its map), roughness and metalness as three's standard material reads them, its
 * emission, and the alpha test where three defines it. Every value is the material's own uniform. A ghost takes roughness 0.7 and
 * no metal (`composedGhost`).
 */
export function carStandardPart({colour, roughness, metalness, emissive}: CarStandard): ShaderPart {
  for (const value of [roughness, metalness]) if (!Number.isFinite(value)) throw Error(`Car material value is not finite: ${value}`);
  const uniforms: Record<string, IUniform> = {diffuse: {value: colour}, roughness: {value: roughness}, metalness: {value: metalness}, ...(emissive ? {emissive: {value: emissive}} : {})};
  return {
    name: 'carStandard',
    slots: {
      fragmentPars: {at: 8, glsl: `uniform vec3 diffuse;${emissive ? '\nuniform vec3 emissive;' : ''}\nuniform float roughness, metalness;`},
      fragmentAlbedo: {at: -10, glsl: '  diffuseColor.rgb *= diffuse;'},
      fragmentColour: {at: 0, glsl: '  #include <alphatest_fragment>\n  roughnessFactor = roughness;\n  metalnessFactor = metalness;'},
      ...(emissive ? {fragmentEmission: {at: 0, glsl: '  totalEmissiveRadiance = emissive;'}} : {}),
    },
    uniforms: () => uniforms,
    ghost: {roughness: 0.7, metalness: 0},
  };
}
