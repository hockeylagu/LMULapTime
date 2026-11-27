import { Color, Material, Matrix3, MeshStandardMaterial, Vector4, type IUniform, type ShaderMaterial, type Texture } from 'three';
import { hazePart } from '../../atmosphere/haze.js';
import { composedMaterial, cutOutOf, type ShaderPart } from '../../shaders/composer.js';
import { litTemplate } from '../../shaders/litTemplate.js';
import { plainSurfacePart, setPlainSurface } from '../../shaders/plainSurface.js';

/** The glTF maps the plain program does not draw: a material with one throws. */
const UNDRAWN_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'lightMap', 'bumpMap', 'displacementMap', 'envMap'] as const;

/** A map's UV transform as three refreshes it for a built-in material: its matrix, updated first where it updates itself. */
function mapTransform(map: Texture): IUniform<Matrix3> {
  return {get value() { if (map.matrixAutoUpdate) map.updateMatrix(); return map.matrix; }};
}

/**
 * A glTF material's own inputs on the plain surface (shaders/plainSurface.ts): its base colour map (`gltf_map`, by its UV transform on
 * its UV set, 0 or 1 by `gltf_mapUv1`) times the colour, as three's `map_fragment` reads it before the vertex colour; the alpha test
 * where three defines it, after the colour; and its emission (colour times intensity) as three's standard material has it. Without a
 * map, only the alpha test and the emission.
 */
function gltfPart(map: Texture | null, emissive: Color): ShaderPart {
  const uniforms: Record<string, IUniform> = {gltf_emissive: {value: emissive}};
  if (map) Object.assign(uniforms, {gltf_map: {value: map}, gltf_mapTransform: mapTransform(map), gltf_mapUv1: {value: map.channel}});
  return {
    name: 'gltfSurface',
    slots: {
      ...(map ? {
        vertexPars: {at: 10, glsl: '#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nuniform mat3 gltf_mapTransform;\nuniform float gltf_mapUv1;\nvarying vec2 vGltfMapUv;'},
        vertexOutputs: {at: 10, glsl: '  vGltfMapUv = ( gltf_mapTransform * vec3( mix( uv, uv1, gltf_mapUv1 ), 1.0 ) ).xy;'},
      } : {}),
      fragmentPars: {at: 10, glsl: `uniform vec3 gltf_emissive;${map ? '\nuniform sampler2D gltf_map;\nvarying vec2 vGltfMapUv;' : ''}`},
      ...(map ? {fragmentAlbedo: {at: 0, glsl: '  diffuseColor *= texture2D( gltf_map, vGltfMapUv );'}} : {}),
      fragmentColour: {at: 10, glsl: '  #include <alphatest_fragment>'},
      fragmentEmission: {at: 0, glsl: '  totalEmissiveRadiance = gltf_emissive;'},
    },
    uniforms: () => uniforms,
    // Cut out on its UV set by its transform, as it is drawn.
    ...(map ? {ownTextures: ['gltf_map'], cutOut: (own: Readonly<Record<string, IUniform>>) =>
      cutOutOf(own.gltf_map, {value: new Vector4(1 - map.channel, map.channel, 0, 0)}, {transform: own.gltf_mapTransform})} : {}),
  };
}

/** Each glTF material's plain material, built once for every mesh that shares it. */
const built = new WeakMap<Material, ShaderMaterial>();

/**
 * A scenery mesh's glTF material without a surface description, on the plain lit program under the scene's haze, as three's standard
 * material draws it lit by the sun and the scene's environment: its colour, base colour map, roughness, metalness and emission, and
 * its own state (side, blending, transparency, alpha test, vertex colours, flat shading). Two-sided and blended (puddle decals), it
 * draws once with both sides, as a configured surface does. Throws for a material that is not three's standard material or carries a
 * map the plain program does not draw.
 */
export function gltfSurfaceMaterial(original: Material): ShaderMaterial {
  const known = built.get(original);
  if (known) return known;
  if (!(original instanceof MeshStandardMaterial) || original.type !== 'MeshStandardMaterial') throw Error(`Scenery material ${original.name || original.type} without a surface description is not a standard material`);
  for (const key of UNDRAWN_MAPS) if (original[key]) throw Error(`Scenery material ${original.name || '?'} without a surface description has a ${key}, which the plain program does not draw`);
  const map = original.map;
  if (map && map.channel !== 0 && map.channel !== 1) throw Error(`Scenery material ${original.name || '?'} reads its map from UV set ${map.channel}`);
  const material = composedMaterial(litTemplate, [plainSurfacePart, gltfPart(map, original.emissive.clone().multiplyScalar(original.emissiveIntensity)), hazePart]);
  setPlainSurface(material, {colour: original.color, roughness: original.roughness, metalness: original.metalness, environment: 1});
  Material.prototype.copy.call(material, original);
  // A program parameter three reads off any material; a shader material has no field for it.
  if (original.flatShading) Object.assign(material, {flatShading: true});
  material.forceSinglePass = true;
  built.set(original, material);
  return material;
}
