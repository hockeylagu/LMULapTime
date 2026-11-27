import { Box3, Matrix4, ShaderChunk, ShaderLib, Vector3, Vector4, type IUniform, type Material, type MeshPhysicalMaterial, type Object3D, type Texture } from 'three';
import { patchTextureFocus } from '../scenery/textureFocus.js';
import type { CarAppearance, CarSurface } from '../../../../../shared/types/scenes/car.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import type { ReflectionCubes } from '../reflectionCube.js';
import { patchAmbientLookup } from '../scenery/materials/patchSurfaceShader.js';
import { patchTrackLights } from '../night/trackLightProgram.js';
import { OVERHEAD_GLSL, overheadUniforms, type CarOverhead } from './overheadMap.js';
import { PAINT_LAYERS, paintLayers } from './paintLayers.js';

/**
 * The coats' environment lookups (`FRAGMENT.reflection` replaces three's prefiltered lookups): each coat reads the car's own
 * reflection cubes, sharp at or under the package's roughness cutoff and convolved above it, at the package's level rule for that
 * coat. Until the first probe completes, three's prefiltered sky environment stands in. The direct sun keeps the floored roughness
 * of `FRAGMENT.physical`, which keeps its lobe finite.
 */
const BASE_LOOKUP = 'vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
const COAT_LOOKUP = 'clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );';
const PAINT_BASE_LOOKUP = 'vec3 iblRadiance = paintReflection( geometryViewDir, geometryNormal, paintBaseRoughness, PAINT_BASE_EXPLICIT, paintBaseCos );';
const PAINT_COAT_LOOKUP = 'clearcoatRadiance += paintReflection( geometryViewDir, geometryClearcoatNormal, paintCoatRoughness, PAINT_COAT_EXPLICIT, paintCoatCos );';
for (const lookup of [BASE_LOOKUP, COAT_LOOKUP]) if (!ShaderChunk.lights_fragment_maps.includes(lookup)) throw Error('three.js lights_fragment_maps changed: the car paint reflection lookups need updating');
/** The clear coat's Fresnel angle, which takes the box-projected reflection's half vector (`FRAGMENT.declarations`). */
const COAT_FRESNEL = 'float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );';
if (!ShaderLib.physical.fragmentShader.includes(COAT_FRESNEL)) throw Error('three.js meshphysical changed: the car paint coat Fresnel needs updating');

/** How far outside the reflection box a surface point still reads the box-projected cube, metres (the reference viewer's slack). */
const BOX_SLACK_M = 0.05;
/**
 * The reflected car's cube box (the package's `reflectionBox`): the axis-aligned box of its corners under the car's frame, read
 * as the paint draws (the frame is then this frame's), and its centre. w 0: no box.
 */
const boxLow = new Vector4(), boxHigh = new Vector3(), boxMiddle = new Vector3();
const boxUniforms = {
  paint_boxLow: {get value() { placeBox(); return boxLow; }},
  paint_boxHigh: {get value() { placeBox(); return boxHigh; }},
  paint_boxCentre: {get value() { placeBox(); return boxMiddle; }},
};
let boxed: {frame: Object3D; corners: CarAppearance['reflectionBox']} | null = null;
const placedFrame = new Matrix4(), measured = new Box3(), corner = new Vector3();
function placeBox(): void {
  if (!boxed) { boxLow.w = 0; return; }
  const world = boxed.frame.matrixWorld;
  if (boxLow.w === 1 && placedFrame.equals(world)) return;
  placedFrame.copy(world); measured.makeEmpty();
  for (const point of boxed.corners) measured.expandByPoint(corner.set(point[0], point[1], point[2]).applyMatrix4(world));
  measured.getCenter(boxMiddle); boxHigh.copy(measured.max); boxLow.set(measured.min.x, measured.min.y, measured.min.z, 1);
}

/**
 * The car whose probe the paint reads (car/carReflection.ts): `frame`, its native car frame in the scene (the body envelope), and
 * the corners of its reflection box in that frame; null for none. Its paint reads the cube box-projected, as the game's paint
 * reads its car cube within the box it binds for the car. Ours: one box, the reflected car's; the cars that share its probe lie
 * outside it and read the cube by direction (the game binds each car's own box).
 */
export function setPaintBox(frame: Object3D | null, corners: CarAppearance['reflectionBox'] = []): void {
  boxed = frame && corners.length ? {frame, corners} : null;
  boxLow.w = 0;
}
/**
 * The sun's glint (`FRAGMENT.glint`) joins the direct sun's specular of both coats right after three evaluates it, inside the
 * directional light loop: `directLight` carries the shadowed sun there, which the later chunks no longer have.
 */
const DIRECTIONAL_LIGHTS = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const RE_DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
const DIRECTIONAL_AT = ShaderChunk.lights_fragment_begin.indexOf(DIRECTIONAL_LIGHTS);
if (DIRECTIONAL_AT < 0 || !ShaderChunk.lights_fragment_begin.slice(DIRECTIONAL_AT).includes(RE_DIRECT)) throw Error('three.js lights_fragment_begin changed: the car paint sun glint needs updating');
const LIGHTS_WITH_GLINT = ShaderChunk.lights_fragment_begin.slice(0, DIRECTIONAL_AT) + ShaderChunk.lights_fragment_begin.slice(DIRECTIONAL_AT).replace(RE_DIRECT, `${RE_DIRECT}
    reflectedLight.directSpecular = paintGlint(reflectedLight.directSpecular, directLight, geometryViewDir, geometryNormal, paintBaseRoughness + paintCoatRoughness * paintCoat, material.specularColor, material.specularF90);
    clearcoatSpecularDirect = paintGlint(clearcoatSpecularDirect, directLight, geometryViewDir, geometryClearcoatNormal, paintCoatRoughness, material.clearcoatF0, material.clearcoatF90);`);

/** The scene's light units per package unit, as a GLSL literal: the glint's limit is stated in the package's units. */
const GAME_LIGHT_UNIT_LITERAL = Number.isInteger(GAME_LIGHT_UNIT) ? `${GAME_LIGHT_UNIT}.0` : String(GAME_LIGHT_UNIT);

/** Each paint material's uniforms, for the reflection cubes a probe hands it later, and what stands over its car. */
const paintUniforms = new WeakMap<Material, Record<string, IUniform>>();
const paintOverheads = new WeakMap<Material, {current: CarOverhead | null}>();

/** Whether a material is car paint, which reads the probe's cubes by its own rule. */
export const isCarPaint = (material: Material): boolean => paintUniforms.has(material);

/**
 * Gives a car paint material the car's reflection cubes (null: back to three's sky environment until the next probe), and what
 * stands over the scenery around the car, to tell where the probe is stale. False for a material that is not car paint.
 */
export function setPaintReflection(material: Material, cubes: Pick<ReflectionCubes, 'sharp' | 'convolved' | 'levels'> | null,
  overhead: CarOverhead | null = null): boolean {
  const uniforms = paintUniforms.get(material);
  if (!uniforms) return false;
  uniforms.paint_sharp.value = cubes?.sharp ?? null; uniforms.paint_convolved.value = cubes?.convolved ?? null;
  uniforms.paint_levels.value = cubes?.levels ?? 1; uniforms.paint_probe.value = cubes ? 1 : 0;
  paintOverheads.get(material)!.current = cubes ? overhead : null;
  return true;
}

/**
 * Layered car paint on three's physical model, driven by the package's paint description. The region map blends five paint
 * setups (square-rooted channels, saturation split into red/green/blue/white, black for the rest; refractive indices blended as
 * square roots). The base coat sets the roughness, the base-to-coat Fresnel and the metallic share (flakes at half strength, their
 * average), only for paint with a flake map: without one the flake colour tinted plain paint (a blue cast on red and grey); the clear coat sets
 * three's coat strength, roughness and air-to-coat Fresnel; the lacquer tints what passes through the coat over its optical
 * depth. The AO/spec mask gives ambient occlusion (green) and specular occlusion (red, times the albedo alpha on the base coat).
 * Carbon fibre (red region only) darkens the albedo toward the carbon colour and multiplies the weave overlay. Not carried:
 * orange-peel and carbon normals, metal flakes, damage, wear and rain.
 */
const FRAGMENT = {
  declarations: `${PAINT_LAYERS.declarations}
    uniform vec3 paint_glint; uniform vec4 paint_edge; uniform float paint_coatCutoff, paint_lodScale, paint_levels, paint_probe;
    uniform samplerCube paint_sharp, paint_convolved;${OVERHEAD_GLSL}
    uniform vec4 paint_boxLow; uniform vec3 paint_boxHigh, paint_boxCentre;
    // Each coat's Fresnel angle: the half vector of the view and the direction its reflection reads (-1 until read).
    float paintBaseCos = -1.0, paintCoatCos = -1.0;
    // The game's box projection: a point in the reflected car's box reads the cube toward where its reflected ray leaves the box,
    // seen from the box's centre; any other point by the ray's direction.
    vec3 paintBoxRead(vec3 r) {
      if (paint_boxLow.w < 0.5) return r;
      vec3 p = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz + cameraPosition;
      if (any(lessThan(p, paint_boxLow.xyz - ${BOX_SLACK_M})) || any(greaterThan(p, paint_boxHigh + ${BOX_SLACK_M}))) return r;
      vec3 nr = normalize(r), safe = mix(vec3(-1e-6), vec3(1e-6), step(0.0, nr)) + nr;
      vec3 t = (mix(paint_boxLow.xyz, paint_boxHigh, step(0.0, nr)) - p) / safe;
      return p + nr * max(min(min(t.x, t.y), t.z), 0.0) - paint_boxCentre;
    }
    // The sun's glint on smooth paint (the package's shading.sunGlint and smallEdge): the reflection cube holds no sun disc, so a
    // coat under the roughness cutoff adds a disc of the cosine threshold to its direct specular, the whole term scaled; the
    // result is limited where the highlight's screen-space edge is small (its limit squared, in the package's light units).
    vec3 paintGlint(vec3 spec, IncidentLight light, vec3 viewDir, vec3 n, float roughness, vec3 f0, float f90) {
      vec3 h = normalize(light.direction + viewDir);
      float dotNH = saturate(dot(n, h)), dotNL = saturate(dot(n, light.direction)), dotVH = saturate(dot(viewDir, h));
      float e = paint_edge.x * dotNH, edge = saturate(length(vec2(dFdx(e), dFdy(e))));
      if (roughness >= paint_glint.y) return spec;
      float disc = dotNH > paint_glint.x ? 1.0 / (1.0 - paint_glint.x) : 0.0;
      vec3 glint = (spec + light.color * dotNL * F_Schlick(f0, f90, dotVH) * disc) * paint_glint.z;
      float limit = mix(paint_edge.z, paint_edge.w, saturate(1.0 / (1.0 - paint_edge.y * edge)) + roughness);
      return min(glint, vec3(limit * limit * ${GAME_LIGHT_UNIT_LITERAL}));
    }
    vec3 paintProbe(vec3 r, float roughness, bool explicitLevel) {
      vec3 light = vec3(0.0);
      if (roughness <= paint_coatCutoff) light = texture(paint_sharp, r).rgb;
      else {
        float level = min(saturate((roughness - paint_coatCutoff) / (1.0 - paint_coatCutoff)) * paint_lodScale, paint_levels - 1.0);
        light = explicitLevel ? textureLod(paint_convolved, r, level).rgb : texture(paint_convolved, r, level).rgb;
      }
      return light;
    }
    // A coat's reflection of the car's own cubes (the package's shading.carPaintReflection): sharp at or under the roughness cutoff,
    // else the convolved cube at the cutoff-relative roughness times the level scale, as the level itself or added to the
    // hardware level, clamped to the convolved cube's last level. Three's sky environment stands in before the first probe.
    // Where the scenery overhead makes the probe stale (car/overheadMap.ts), three's sky environment, or the probe read toward that
    // scenery from the face's eye. \`halfCos\`: the coat's Fresnel angle for the direction read (\`paintBoxRead\`).
    vec3 paintReflection(vec3 viewDir, vec3 n, float roughness, bool explicitLevel, out float halfCos) {
      vec3 light = vec3(0.0);
      halfCos = saturate(dot(n, viewDir));
      if (paint_probe < 0.5) light = getIBLRadiance(viewDir, n, roughness);
      else {
        vec3 r = paintBoxRead(transformDirectionByInverseViewMatrix(reflect(-viewDir, n), viewMatrix));
        halfCos = saturate(dot(normalize(normalize((viewMatrix * vec4(r, 0.0)).xyz) + viewDir), viewDir));
        light = paintProbe(r, roughness, explicitLevel);
        vec4 fix = overheadFix(r);
        if (fix.w < 0.0) light = mix(light, getIBLRadiance(viewDir, n, roughness), -fix.w);
        else if (fix.w > 0.0) light = mix(light, paintProbe(fix.xyz, roughness, explicitLevel), fix.w);
      }
      return light;
    }`,
  roughness: '#include <roughnessmap_fragment>\nroughnessFactor = clamp(paintBaseRoughness, 0.0, 1.0);',
  metalness: '#include <metalnessmap_fragment>\nmetalnessFactor = 0.0;',
  physical: `#include <lights_physical_fragment>
    material.specularColor = vec3(paintBaseF0 * paintBaseSpecular);
    material.specularColorBlended = mix(material.specularColor, diffuseColor.rgb, metalnessFactor);
    material.specularF90 = mix(paintBaseSpecular, 1.0, metalnessFactor);
    material.clearcoat = paintCoat; material.clearcoatF0 = vec3(paintCoatF0);
    material.clearcoatRoughness = min(max(paintCoatRoughness, 0.0525) + geometryRoughness, 1.0);`,
  occlusion: `#include <aomap_fragment>
    // The base coat reflects the environment by its specular strength and Schlick's Fresnel at the angle of the direction read.
    reflectedLight.indirectSpecular = radiance * paintBaseSpecular * (paintBaseF0 + (1.0 - paintBaseF0) * pow(1.0 - (paintBaseCos < 0.0 ? saturate(dot(normal, geometryViewDir)) : paintBaseCos), 5.0));
    reflectedLight.directSpecular *= paintBaseOcclusion; reflectedLight.indirectSpecular *= paintBaseOcclusion;
    clearcoatSpecularDirect *= paintCoatOcclusion; clearcoatSpecularIndirect *= paintCoatOcclusion;${PAINT_LAYERS.diffuse}`,
  // The metallic layer replaces that share of the base layer: the base coat's reflection through the lacquer, faded off
  // the facing angle, mixed with light bounced inside the coat, tinted by the flake colour. The flakes' sun sparkle needs the flake
  // map's normals and is not carried.
  metallic: `if (paintMetallic > 0.0) {
      vec3 flakes = paintLacquer * radiance * clamp(pow2(saturate(dot(normal, geometryViewDir))) * 3.0, 0.0, 1.0) * 0.5;
      vec3 bounced = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) * 0.5;
      outgoingLight = mix(outgoingLight, mix(flakes, bounced, paintBounce) * paintFlake, paintMetallic);
    }
    `,
  absorption: `outgoingLight = outgoingLight * ${PAINT_LAYERS.absorption} * ( 1.0 - material.clearcoat * Fcc )`,
};

/**
 * Turns a physical material carrying the paint albedo into layered car paint, from the appearance's `paint` description. A
 * paint without a region map is all black region (an empty region map reads as zero). Maps the paint does not declare
 * fall back to the albedo for sampling but are neutralized by their parameters (no carbon strength, full AO only when declared).
 * `shading` is the package's shading section: the sun glint, its edge limit and the coat's sharp-reflection cutoff.
 */
export function configureCarPaint(material: MeshPhysicalMaterial, paint: CarSurface, texture: (path: string) => Texture, shading: SceneryShading): void {
  const albedo = material.map;
  if (!albedo) throw Error(`Car paint ${paint.kind} has no albedo`);
  const layers = paintLayers(paint, texture, albedo);
  const overhead = {current: null as CarOverhead | null};
  const uniforms: Record<string, IUniform> = {
    ...layers.uniforms, ...overheadUniforms(() => overhead.current), ...boxUniforms,
    paint_glint: {value: new Vector3(shading.sunGlint.cosineThreshold, shading.sunGlint.roughnessCutoff, shading.sunGlint.smoothSpecularScale)},
    paint_edge: {value: new Vector4(shading.smallEdge.detectorScale, shading.smallEdge.edgeScale, shading.smallEdge.limitMin, shading.smallEdge.limitMax)},
    paint_coatCutoff: {value: shading.carPaintReflection.roughnessCutoff}, paint_lodScale: {value: shading.carPaintReflection.lodScale},
    paint_sharp: {value: null}, paint_convolved: {value: null}, paint_levels: {value: 1}, paint_probe: {value: 0},
  };
  paintUniforms.set(material, uniforms); paintOverheads.set(material, overhead);
  const {clearCoatLod, baseCoatLod} = shading.carPaintReflection;
  const variant = `${layers.variant}-${clearCoatLod}-${baseCoatLod}`;
  material.clearcoat = 1; // Enables three's coat layer; its strength is set per pixel.
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    patchTrackLights(shader, 'near'); // Before the paint replaces the occlusion include.
    const fragment = layers.fragment(shader.fragmentShader.replace('void main() {', `${FRAGMENT.declarations}\nvoid main() {`)
      .replace('#include <lights_fragment_begin>', LIGHTS_WITH_GLINT)
      .replace('#include <map_fragment>', PAINT_LAYERS.albedo).replace('#include <roughnessmap_fragment>', FRAGMENT.roughness)
      .replace('#include <metalnessmap_fragment>', FRAGMENT.metalness).replace('#include <lights_physical_fragment>', FRAGMENT.physical)
      .replace('#include <aomap_fragment>', FRAGMENT.occlusion)
      .replace('outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc )', FRAGMENT.metallic + FRAGMENT.absorption));
    shader.fragmentShader = fragment;
    patchAmbientLookup(shader); // The paint's own reflection model keeps its reflectance; only the ambient lookup is shared.
    shader.fragmentShader = shader.fragmentShader // The ambient patch inlines the chunk the lookups live in.
      .replace(BASE_LOOKUP, PAINT_BASE_LOOKUP.replace('PAINT_BASE_EXPLICIT', String(baseCoatLod === 'explicit')))
      .replace(COAT_LOOKUP, PAINT_COAT_LOOKUP.replace('PAINT_COAT_EXPLICIT', String(clearCoatLod === 'explicit')))
      .replace(COAT_FRESNEL, 'float dotNVcc = paintCoatCos < 0.0 ? saturate( dot( geometryClearcoatNormal, geometryViewDir ) ) : paintCoatCos;')
      .replace('#include <map_fragment>', ShaderChunk.map_fragment); // Written out: the livery's lookup fades in as it sharpens.
    patchTextureFocus(shader, ['map', 'paint_region', 'paint_carbon', 'paint_aoSpec']);
  };
  material.customProgramCacheKey = () => `lmu-car-paint-${variant}`;
  material.addEventListener('dispose', layers.dispose);
}
