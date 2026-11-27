import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, RedFormat, RepeatWrapping, RGBAFormat, Vector2, Vector3, type IUniform, type ShaderMaterial, type Texture } from 'three';
import type { CloudMapLevels, SceneryClouds, SceneryCloudMaterial } from '../../../../../shared/types/scenes/clouds.js';
import { composedMaterial, type ShaderPart } from '../shaders/composer.js';
import { litTemplate } from '../shaders/litTemplate.js';
import type { CloudSheet } from './clouds.js';
import { hazePart, setHazeDistanceScale } from './haze.js';

/**
 * The replay's clouds, drawn: one mesh per placed sheet (clouds.ts) with the first of its materials, lit by the package's cloud
 * lighting (SceneryCloudLight; the pipeline's docs/SCENE_PACKAGE.md "Clouds" states the formula). The sheets stand where the replay
 * moment puts them, fixed in the world around the LMU local origin: the camera moves under them. They are drawn behind everything
 * (at the far limit, hidden by the scenery), far to near from the camera, each blended over the sky by its alpha.
 *
 * The lighting is worked in LMU local axes, the axes the sheets and their vertex frames are laid out in: the scene's z is the
 * opposite one. The ambient light is the scene's environment in the direction the light maps give.
 */
export interface CloudLayerLight {
  /** Toward the sun, scene space, unit length. */
  sunDirection: Vector3;
  /** The green channel of the direct sun's light before the clouds dim it, in scene units. */
  sunGreen: number;
  /** The cloud coverage, 0 clear to 1 overcast. */
  cloudCover: number;
}

export interface CloudLayer {
  group: Group;
  /** Orders the sheets far to near from the camera (scene space): before the other transparent objects, each over the ones behind it. */
  order(camera: Vector3): void;
  dispose(): void;
}

const CLOUD_VERTEX_PARS = `
attribute vec3 cloudTangent;
attribute vec3 cloudBinormal;
attribute vec3 cloudNormal;
attribute float cloudFade;
varying vec2 vCloudUv;
varying vec3 vCloudTangent;
varying vec3 vCloudBinormal;
varying vec3 vCloudNormal;
varying vec3 vCloudRay;
varying float vCloudFade;
`;
/** Drawn at the far limit: behind everything, hidden by the scenery. */
const CLOUD_VERTEX_FAR = `
#ifdef USE_REVERSED_DEPTH_BUFFER
gl_Position.z = 0.0;
#else
gl_Position.z = gl_Position.w;
#endif
`;
/** The ray from the camera to the point, with z turned to LMU local axes. */
const CLOUD_VERTEX = `
vCloudUv = uv; vCloudTangent = cloudTangent; vCloudBinormal = cloudBinormal; vCloudNormal = cloudNormal; vCloudFade = cloudFade;
vec3 cloudRay = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz - cameraPosition;
vCloudRay = vec3( cloudRay.x, cloudRay.y, - cloudRay.z );
`;
const CLOUD_FRAGMENT_PARS = `
uniform sampler2D cloudAlphaMap;
uniform sampler2D cloudDensityMap;
uniform sampler2D cloudSideMap;
uniform sampler2D cloudEndMap;
uniform vec2 cloudUvScale;
uniform vec2 cloudUvOffset;
uniform vec3 cloudOpacity; // scalar, visibility, random range
uniform vec3 cloudAlpha; // gain, power from, power to
uniform vec2 cloudRandom; // the cloud's two randoms
uniform vec3 cloudAlbedoMax;
uniform vec3 cloudAlbedoMin;
uniform vec2 cloudAlbedoRandom; // max, min
uniform vec2 cloudAmbient; // scalar, occlusion
uniform vec4 cloudBacklight; // narrow scalar, narrow power, wide scalar, wide power
uniform float cloudBase;
uniform float cloudDepthScale;
uniform float cloudSunLight; // the sun's weight for the coverage, times its light, over pi
uniform vec3 cloudSunDirection;
varying vec2 vCloudUv;
varying vec3 vCloudTangent;
varying vec3 vCloudBinormal;
varying vec3 vCloudNormal;
varying vec3 vCloudRay;
varying float vCloudFade;
`;
const CLOUD_FRAGMENT = `
{
  vec2 cloudUv = vCloudUv * cloudUvScale + cloudUvOffset;
  vec3 side = texture2D( cloudSideMap, cloudUv ).rgb, end = texture2D( cloudEndMap, cloudUv ).rgb;
  float density = texture2D( cloudDensityMap, cloudUv ).r;
  float shown = cloudOpacity.y * vCloudFade * ( 1.0 - cloudOpacity.z * cloudRandom.x );
  diffuseColor.a = clamp( cloudAlpha.x * shown, 0.0, 1.0 ) * pow( texture2D( cloudAlphaMap, cloudUv ).r, mix( cloudAlpha.y, cloudAlpha.z, shown ) ) * cloudOpacity.x;
  vec3 sun = cloudSunDirection;
  vec3 toSun = normalize( vec3(
    vCloudTangent.x * sun.x + vCloudBinormal.x * sun.y + vCloudNormal.x * sun.z,
    cloudDepthScale * ( vCloudTangent.z * sun.x + vCloudBinormal.z * sun.y + vCloudNormal.z * sun.z ),
    vCloudTangent.y * sun.x + vCloudBinormal.y * sun.y + vCloudNormal.y * sun.z ) );
  float sunlit = toSun.x * toSun.x * ( toSun.x > 0.0 ? side.r : side.g ) + toSun.y * toSun.y * ( toSun.y > 0.0 ? end.b : end.g ) + toSun.z * toSun.z * ( toSun.z > 0.0 ? side.b : end.r );
  float through = clamp( dot( sun, normalize( vCloudRay ) ), 0.0, 1.0 );
  float lit = cloudBase + ( 1.0 - cloudBase ) * sunlit + ( cloudBacklight.x * pow( through, cloudBacklight.y ) + cloudBacklight.z * pow( through, cloudBacklight.w ) ) * sqrt( sunlit );
  vec3 albedo = mix( cloudAlbedoMin * ( 1.0 - cloudAlbedoRandom.y * cloudRandom.y ), cloudAlbedoMax * ( 1.0 - cloudAlbedoRandom.x * cloudRandom.y ), density * mix( 1.0, sunlit, shown ) );
  vec2 lean = vec2( side.r - side.g, end.g - end.b );
  vec3 open = normalize( vec3( lean, sqrt( max( 0.0, 1.0 - dot( lean, lean ) ) ) ) );
  vec3 openWorld = vCloudTangent * open.x + vCloudBinormal * open.y + vCloudNormal * open.z;
  // The environment's light from that direction; the lookup takes a view-space normal and returns pi times the light.
  vec3 ambient = getIBLIrradiance( normalize( ( viewMatrix * vec4( openWorld.x, openWorld.y, - openWorld.z, 0.0 ) ).xyz ) ) * RECIPROCAL_PI * cloudAmbient.x * ( density * cloudAmbient.y + 1.0 - cloudAmbient.y );
  outgoingLight = ( vec3( cloudSunLight * lit ) + ambient ) * albedo * albedo;
}
`;

/** A package map as a wrapping, trilinear texture with the package's own levels; three channels are padded to four. */
function mapTexture(map: CloudMapLevels & { channels?: 1 | 3 }): DataTexture {
  const levels = map.mips.map((source, i) => {
    const width = Math.max(1, map.width >> i), height = Math.max(1, map.height >> i);
    if (map.channels !== 3) return { data: source, width, height };
    const data = new Uint8Array(width * height * 4).fill(255);
    for (let texel = 0; texel < width * height; texel++) data.set(source.subarray(texel * 3, texel * 3 + 3), texel * 4);
    return { data, width, height };
  });
  const texture = new DataTexture(levels[0].data, map.width, map.height, map.channels === 3 ? RGBAFormat : RedFormat);
  texture.mipmaps = levels; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = RepeatWrapping; texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** A cloud material's uniforms (its light block, maps and the field's alpha rule) for the lighting of a moment. */
function cloudUniforms(clouds: SceneryClouds, material: SceneryCloudMaterial, light: CloudLayerLight, texture: (key: string, alpha?: boolean) => Texture) {
  const { opacity, light: L } = material, { alpha, averagedInputs: A } = clouds, { x, y, z } = light.sunDirection;
  const weight = L.diffuse.clear + (L.diffuse.overcast - L.diffuse.clear) * light.cloudCover;
  return {
    cloudAlphaMap: { value: texture(material.cloudMap, true) }, cloudDensityMap: { value: texture(material.cloudMap) },
    cloudSideMap: { value: texture(material.sideMap) }, cloudEndMap: { value: texture(material.endMap) },
    cloudUvScale: { value: new Vector2(...L.uv.scale) }, cloudUvOffset: { value: new Vector2(...L.uv.offset) },
    cloudOpacity: { value: new Vector3(opacity.scalar, opacity.visibility, opacity.randomRange) },
    cloudAlpha: { value: new Vector3(alpha.gain, alpha.powerFrom, alpha.powerTo) }, cloudRandom: { value: new Vector2(A.red, A.green) },
    cloudAlbedoMax: { value: new Vector3(...L.albedo.max) }, cloudAlbedoMin: { value: new Vector3(...L.albedo.min) },
    cloudAlbedoRandom: { value: new Vector2(L.albedo.randomMax, L.albedo.randomMin) }, cloudAmbient: { value: new Vector2(L.ambient.scalar, L.ambient.occlusion) },
    cloudBacklight: { value: [L.backlight.narrowScalar, L.backlight.narrowPower, L.backlight.wideScalar, L.backlight.widePower] },
    cloudBase: { value: L.backlight.base }, cloudDepthScale: { value: L.diffuse.depthScale },
    cloudSunLight: { value: weight * light.sunGreen / Math.PI }, cloudSunDirection: { value: new Vector3(x, y, -z) },
  };
}

/** The maps of a cloud material: the warm-up uploads them with the layer. */
const CLOUD_MAPS = ['cloudAlphaMap', 'cloudDensityMap', 'cloudSideMap', 'cloudEndMap'] as const;

/**
 * The program of a cloud sheet: the lit template (for the environment lookup) with the cloud's own light and alpha in place of the
 * template's, drawn at the far limit, under the haze at half its distance: a cloud takes the square root of the haze's distance term.
 * The light the template works out is not drawn.
 */
function cloudMaterial(uniforms: Record<string, IUniform>): ShaderMaterial {
  const cloud: ShaderPart = {
    name: 'cloud',
    slots: {
      vertexPars: {at: 0, glsl: CLOUD_VERTEX_PARS}, vertexView: {at: 0, glsl: CLOUD_VERTEX_FAR}, vertexOutputs: {at: 0, glsl: CLOUD_VERTEX},
      fragmentPars: {at: 0, glsl: CLOUD_FRAGMENT_PARS}, fragmentLight: {at: 0, glsl: CLOUD_FRAGMENT},
    },
    uniforms: () => uniforms,
    ownTextures: CLOUD_MAPS,
  };
  // One pass for both sides: a sheet never overlaps itself, and three's two-pass path looks the program up again before each pass.
  const material = composedMaterial(litTemplate, [cloud, hazePart], {transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true});
  material.name = 'cloud-sheet';
  // Flat shaded (a program parameter three reads off any material; a shader material has no field for it): a sheet has no normal
  // attribute, so the template's light model takes the face normal (three's `FLAT_SHADED`) instead of normalizing a zero one into NaN.
  Object.assign(material, {flatShading: true});
  setHazeDistanceScale(material, 0.5);
  return material;
}

/** A sheet's geometry in scene axes around its centre, with its vertex frame (LMU local axes) and fade. */
function sheetGeometry(sheet: CloudSheet): BufferGeometry {
  const count = sheet.vertices.length / 3, position = new Float32Array(count * 3), axes = [0, 1, 2].map(() => new Float32Array(count * 3));
  const [cx, cy, cz] = sheet.centre;
  for (let v = 0; v < count; v++) {
    position.set([sheet.vertices[v * 3] - cx, sheet.vertices[v * 3 + 1] - cy, cz - sheet.vertices[v * 3 + 2]], v * 3);
    axes.forEach((axis, k) => axis.set(sheet.frame.subarray(v * 9 + k * 3, v * 9 + k * 3 + 3), v * 3));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(Float32Array.from(sheet.uvs), 2));
  ['cloudTangent', 'cloudBinormal', 'cloudNormal'].forEach((name, k) => geometry.setAttribute(name, new BufferAttribute(axes[k], 3)));
  geometry.setAttribute('cloudFade', new BufferAttribute(new Float32Array(count).fill(sheet.fade), 1));
  geometry.setIndex(sheet.triangles);
  return geometry;
}

/**
 * The cloud layer of a moment: the placed sheets as meshes, each at its centre, in a group at `fieldOrigin` (where the cloud
 * field's origin is in the scene: the LMU local origin at the height the sheets were placed for). Nothing in it moves.
 */
export function createCloudLayer(clouds: SceneryClouds, sheets: CloudSheet[], light: CloudLayerLight, fieldOrigin: Vector3): CloudLayer {
  const group = new Group(), textures = new Map<string, DataTexture>(), materials = new Map<string, ShaderMaterial>();
  group.name = 'clouds'; group.position.copy(fieldOrigin);
  const texture = (key: string, alpha = false) => {
    const id = `${alpha ? 'alpha' : 'light'}:${key}`;
    let made = textures.get(id);
    if (!made) { made = mapTexture(alpha ? clouds.maps[key] : clouds.lightMaps[key]); textures.set(id, made); }
    return made;
  };
  const materialOf = (cloud: SceneryCloudMaterial) => {
    let made = materials.get(cloud.name);
    if (made) return made;
    made = cloudMaterial(cloudUniforms(clouds, cloud, light, texture));
    materials.set(cloud.name, made);
    return made;
  };
  // Each sheet's mesh at its centre, in the scene.
  const placed = sheets.map(sheet => {
    const mesh = new Mesh(sheetGeometry(sheet), materialOf(sheet.materials[0]));
    mesh.frustumCulled = false; mesh.position.set(sheet.centre[0], sheet.centre[1], -sheet.centre[2]);
    group.add(mesh);
    return {mesh, at: mesh.position.clone().add(fieldOrigin), distance: 0};
  });
  group.traverse(object => { object.updateMatrix(); object.matrixAutoUpdate = false; });
  group.updateMatrixWorld(true);
  // Three's own sort would draw them near to far under the reversed depth buffer: the clip depth falls with distance there.
  const order = (camera: Vector3) => {
    for (const sheet of placed) sheet.distance = sheet.at.distanceToSquared(camera);
    [...placed].sort((a, b) => b.distance - a.distance).forEach((sheet, i) => { sheet.mesh.renderOrder = i - placed.length; });
  };
  order(new Vector3()); // From the scene origin until a camera orders them.
  return {
    group,
    order,
    dispose() {
      group.children.forEach(child => { (child as Mesh).geometry.dispose(); });
      materials.forEach(material => { material.dispose(); }); textures.forEach(made => { made.dispose(); });
    },
  };
}
