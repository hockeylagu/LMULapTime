import { RepeatWrapping, ShaderChunk, Vector2, Vector3, Vector4, type IUniform, type Material, type MeshPhysicalMaterial, type Texture } from 'three';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { SUN_UNIT } from '../atmosphere/sunSamples.js';
import type { ReflectionCubes } from '../reflectionCube.js';
import { patchAmbientLookup } from '../scenery/materials/ambientLookup.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';

/**
 * The coats' environment lookups (`FRAGMENT.reflection` replaces three's prefiltered lookups): each coat reads the car's own
 * reflection cubes, sharp at or under the package's roughness cutoff and convolved above it, at the package's level rule for that
 * coat. Until the first probe completes, three's prefiltered sky environment stands in. The direct sun keeps the floored roughness
 * of `FRAGMENT.physical`, which keeps its lobe finite.
 */
const BASE_LOOKUP = 'vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
const COAT_LOOKUP = 'clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );';
const PAINT_BASE_LOOKUP = 'vec3 iblRadiance = paintReflection( geometryViewDir, geometryNormal, paintBaseRoughness, PAINT_BASE_EXPLICIT );';
const PAINT_COAT_LOOKUP = 'clearcoatRadiance += paintReflection( geometryViewDir, geometryClearcoatNormal, paintCoatRoughness, PAINT_COAT_EXPLICIT );';
for (const lookup of [BASE_LOOKUP, COAT_LOOKUP]) if (!ShaderChunk.lights_fragment_maps.includes(lookup)) throw Error('three.js lights_fragment_maps changed: the car paint reflection lookups need updating');
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
const SUN_UNIT_LITERAL = Number.isInteger(SUN_UNIT) ? `${SUN_UNIT}.0` : String(SUN_UNIT);

/** Each paint material's uniforms, for the reflection cubes a probe hands it later. */
const paintUniforms = new WeakMap<Material, Record<string, IUniform>>();

/**
 * Gives a car paint material the car's reflection cubes (null: back to three's sky environment until the next probe). False for
 * a material that is not car paint.
 */
export function setPaintReflection(material: Material, cubes: Pick<ReflectionCubes, 'sharp' | 'convolved' | 'levels'> | null): boolean {
  const uniforms = paintUniforms.get(material);
  if (!uniforms) return false;
  uniforms.paint_sharp.value = cubes?.sharp ?? null; uniforms.paint_convolved.value = cubes?.convolved ?? null;
  uniforms.paint_levels.value = cubes?.levels ?? 1; uniforms.paint_probe.value = cubes ? 1 : 0;
  return true;
}

/** The paint regions, in the order the region map blends them (black is what no channel covers). */
const REGIONS = ['black', 'red', 'green', 'blue', 'white'] as const;
/** The maps the paint program samples besides the albedo, by descriptor key. */
export const PAINT_MAPS = ['region', 'aoSpec', 'carbon'] as const;

// The exporter fills every paint value the app reads (package v6); a missing one is a package error, not a default.
const number = (group: Record<string, unknown>, key: string): number => {
  const v = group[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw Error(`Car paint has no ${key}`);
  return v;
};
const colour = (value: unknown): Vector3 => {
  if (!Array.isArray(value) || value.length < 3 || !value.slice(0, 3).every(Number.isFinite)) throw Error('Car paint colour is not set');
  return new Vector3(...(value.slice(0, 3) as number[]));
};

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
  declarations: `
    uniform sampler2D paint_region, paint_aoSpec, paint_carbon;
    uniform vec4 paint_coat[5], paint_base[5]; uniform vec3 paint_lacquer[5];
    uniform vec3 paint_carbonColour, paint_flakeColour; uniform vec2 paint_carbonScale; uniform float paint_coatStrength, paint_lacquerThickness;
    uniform vec3 paint_glint; uniform vec4 paint_edge; uniform float paint_coatCutoff, paint_lodScale, paint_levels, paint_probe;
    uniform samplerCube paint_sharp, paint_convolved;
    float paintCoat, paintCoatIndex, paintCoatRoughness, paintCoatF0, paintBaseF0, paintBaseSpecular, paintBaseRoughness, paintMetallic, paintBounce, paintAO, paintCoatOcclusion, paintBaseOcclusion; vec3 paintLacquer, paintFlake;
    // Unpolarized Fresnel reflectance from air into a medium of index n, at incidence cosine c.
    float paintFresnelAvg(float c, float n) {
      float t = sqrt(max(1.0 - (1.0 - c * c) / (n * n), 0.0));
      float s = (c - n * t) / (c + n * t + 1e-6), p = (t - n * c) / (t + n * c + 1e-6);
      return 0.5 * (s * s + p * p);
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
      return min(glint, vec3(limit * limit * ${SUN_UNIT_LITERAL}));
    }
    // A coat's reflection of the car's own cubes (the package's shading.carPaintReflection): sharp at or under the roughness cutoff,
    // else the convolved cube at the cutoff-relative roughness times the level scale, as the level itself or added to the
    // hardware level, clamped to the convolved cube's last level. Three's sky environment stands in before the first probe.
    vec3 paintReflection(vec3 viewDir, vec3 n, float roughness, bool explicitLevel) {
      if (paint_probe < 0.5) return getIBLRadiance(viewDir, n, roughness);
      vec3 r = transformDirectionByInverseViewMatrix(reflect(-viewDir, n), viewMatrix);
      if (roughness <= paint_coatCutoff) return texture(paint_sharp, r).rgb;
      float level = min(saturate((roughness - paint_coatCutoff) / (1.0 - paint_coatCutoff)) * paint_lodScale, paint_levels - 1.0);
      return explicitLevel ? textureLod(paint_convolved, r, level).rgb : texture(paint_convolved, r, level).rgb;
    }`,
  albedo: `
    #include <map_fragment>
    {
      vec3 region = sqrt(texture2D(paint_region, vMapUv).rgb);
      float high = max(max(region.r, region.g), region.b), low = min(min(region.r, region.g), region.b);
      float saturation = clamp((high - low) / max(high, 1e-2), 0.0, 1.0);
      vec3 rgb = clamp(region + (saturation - 1.0), 0.0, 1.0);
      float white = clamp(high - saturation, 0.0, 1.0), sum = rgb.r + rgb.g + rgb.b + white, black = 1.0 - sum, scale = 1.0 / max(sum, 1.0);
      rgb *= scale; white *= scale;
      float weight[5]; weight[0] = black; weight[1] = rgb.r; weight[2] = rgb.g; weight[3] = rgb.b; weight[4] = white;
      vec4 coat = vec4(0.0), base = vec4(0.0); paintLacquer = vec3(0.0);
      for (int i = 0; i < 5; i++) { coat += weight[i] * paint_coat[i]; base += weight[i] * paint_base[i]; paintLacquer += weight[i] * paint_lacquer[i]; }
      // coat: strength, roughness, sqrt(index), base specular; base: roughness, sqrt(index), metallic (black only), carbon (red only).
      paintCoat = clamp(coat.x * paint_coatStrength, 0.0, 1.0);
      float coatIndex = mix(1.0, max(coat.z * coat.z, 1.0), paintCoat), baseIndex = max(base.y * base.y, 1.0);
      paintCoatIndex = coatIndex; paintCoatF0 = pow2((coatIndex - 1.0) / (coatIndex + 1.0));
      paintBaseF0 = pow2((baseIndex - coatIndex) / (baseIndex + coatIndex));
      paintCoatRoughness = coat.y; paintBaseSpecular = coat.w; paintBaseRoughness = base.x; paintMetallic = 0.5 * base.z;
      paintFlake = weight[0] * paint_flakeColour; paintBounce = 1.0 - pow(0.8, (coatIndex - 1.0) * 4.0 + 1.0);
      paintLacquer = clamp(paintLacquer, vec3(10.0 / 255.0), vec3(254.0 / 255.0));
      float carbon = base.w;
      if (carbon > 0.0) {
        diffuseColor.rgb = mix(diffuseColor.rgb, paint_carbonColour * paint_carbonColour, clamp(2.0 * carbon, 0.0, 1.0));
        diffuseColor.rgb *= mix(vec3(1.0), texture2D(paint_carbon, vMapUv * paint_carbonScale).rgb, carbon);
      }
      vec4 aoSpec = texture2D(paint_aoSpec, vMapUv);
      paintAO = aoSpec.g; paintCoatOcclusion = aoSpec.r; paintBaseOcclusion = aoSpec.r * diffuseColor.a;
      diffuseColor.a = 1.0;
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
    // The base coat reflects the environment by its specular strength and Schlick's Fresnel at the view angle.
    reflectedLight.indirectSpecular = radiance * paintBaseSpecular * (paintBaseF0 + (1.0 - paintBaseF0) * pow(1.0 - saturate(dot(normal, geometryViewDir)), 5.0));
    reflectedLight.indirectDiffuse *= paintAO;
    reflectedLight.directSpecular *= paintBaseOcclusion; reflectedLight.indirectSpecular *= paintBaseOcclusion;
    clearcoatSpecularDirect *= paintCoatOcclusion; clearcoatSpecularIndirect *= paintCoatOcclusion;
    #if NUM_DIR_LIGHTS > 0
    {
      // The sun's diffuse light loses what the clear coat and the base coat reflect at its incidence.
      float sunCos = saturate(dot(normal, directionalLights[0].direction)), coatReflects = paintFresnelAvg(sunCos, paintCoatIndex);
      reflectedLight.directDiffuse *= 1.0 - coatReflects - (paintBaseF0 + (1.0 - paintBaseF0) * pow(1.0 - sunCos, 5.0)) * (1.0 - coatReflects);
    }
    #endif
    {
      // Ambient light loses the base coat's hemispherical reflection (0.16 of the way from none to all, by its Fresnel), and part of
      // the light inside the coat is reflected back onto the paint (the share beyond the coat's critical angle), tinted by it again.
      float inside = 2.0 * acos(1.0 / paintCoatIndex) / PI;
      reflectedLight.indirectDiffuse = (1.0 - mix(0.16, 1.0, paintBaseF0)) * mix(reflectedLight.indirectDiffuse,
        (reflectedLight.indirectDiffuse + reflectedLight.directDiffuse) * material.diffuseColor, inside);
    }`,
  // The metallic layer replaces that share of the base layer: the base coat's reflection through the lacquer, faded off
  // the facing angle, mixed with light bounced inside the coat, tinted by the flake colour. The flakes' sun sparkle needs the flake
  // map's normals and is not carried.
  metallic: `if (paintMetallic > 0.0) {
      vec3 flakes = paintLacquer * radiance * clamp(pow2(saturate(dot(normal, geometryViewDir))) * 3.0, 0.0, 1.0) * 0.5;
      vec3 bounced = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) * 0.5;
      outgoingLight = mix(outgoingLight, mix(flakes, bounced, paintBounce) * paintFlake, paintMetallic);
    }
    `,
  absorption: 'outgoingLight = outgoingLight * mix(vec3(1.0), pow(paintLacquer, vec3(paint_lacquerThickness / clamp(dot(geometryViewDir, normal) + 0.001, 0.001, 1.0))), material.clearcoat) * ( 1.0 - material.clearcoat * Fcc )',
};

/** A paint map's own texture, sampled on the albedo's UVs with repeat. */
function paintMap(texture: (path: string) => Texture, path: string | undefined, fallback: Texture): Texture {
  if (!path) return fallback;
  const map = texture(path);
  map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping; map.anisotropy = MAX_ANISOTROPY; map.needsUpdate = true;
  return map;
}

/**
 * Turns a physical material carrying the paint albedo into layered car paint, from the appearance's `paint` description. A
 * paint without a region map is all black region (an empty region map reads as zero). Maps the paint does not declare
 * fall back to the albedo for sampling but are neutralized by their parameters (no carbon strength, full AO only when declared).
 * `shading` is the package's shading section: the sun glint, its edge limit and the coat's sharp-reflection cutoff.
 */
export function configureCarPaint(material: MeshPhysicalMaterial, paint: CarSurface, texture: (path: string) => Texture, shading: SceneryShading): void {
  const albedo = material.map;
  if (!albedo) throw Error(`Car paint ${paint.kind} has no albedo`);
  const parameters = paint.parameters ?? {};
  const group = (owner: Record<string, unknown> | undefined, name: string): Record<string, unknown> => {
    const value = owner?.[name];
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Car paint has no ${name}`);
    return value as Record<string, unknown>;
  };
  const regions = REGIONS.map(name => group(group(parameters, 'regions'), name));
  const coat = regions.map(r => new Vector4(number(r, 'clearCoatSpecStrength'), number(r, 'clearCoatRoughness'), Math.sqrt(number(r, 'clearCoatRefractiveIndex')), number(r, 'baseCoatSpecStrength')));
  const base = regions.map((r, i) => new Vector4(number(r, 'baseCoatRoughness'), Math.sqrt(number(r, 'baseCoatRefractiveIndex')),
    i === 0 && paint.maps.metallicFlakes?.texture ? number(r, 'metallicPaintStrength') : 0, i === 1 && paint.maps.carbon?.texture ? number(r, 'carbonFibreStrength') : 0));
  const lacquer = regions.map(r => colour(r.lacquerColour));
  const carbonScale = group(parameters, 'uvScale').carbonFibre;
  if (!Array.isArray(carbonScale) || carbonScale.length !== 2 || !carbonScale.every(Number.isFinite)) throw Error('Car paint has no uvScale.carbonFibre');
  const region = paint.maps.region?.texture, aoSpec = paint.maps.aoSpec?.texture;
  const uniforms: Record<string, IUniform> = {
    // No region map: a black texel everywhere selects the black region. The albedo stands in and its colour is ignored below.
    paint_region: {value: paintMap(texture, region, albedo)}, paint_aoSpec: {value: paintMap(texture, aoSpec, albedo)},
    paint_carbon: {value: paintMap(texture, paint.maps.carbon?.texture, albedo)},
    paint_coat: {value: coat}, paint_base: {value: base}, paint_lacquer: {value: lacquer},
    paint_carbonColour: {value: colour(parameters.carbonFibreAlbedoColour)},
    paint_flakeColour: {value: colour(parameters.metallicFlakeColour)},
    paint_carbonScale: {value: new Vector2(carbonScale[0] as number, carbonScale[1] as number)},
    paint_coatStrength: {value: number(parameters, 'clearCoatStrength')}, paint_lacquerThickness: {value: Math.max(0.001, number(parameters, 'lacquerThickness'))},
    paint_glint: {value: new Vector3(shading.sunGlint.cosineThreshold, shading.sunGlint.roughnessCutoff, shading.sunGlint.smoothSpecularScale)},
    paint_edge: {value: new Vector4(shading.smallEdge.detectorScale, shading.smallEdge.edgeScale, shading.smallEdge.limitMin, shading.smallEdge.limitMax)},
    paint_coatCutoff: {value: shading.carPaintReflection.roughnessCutoff}, paint_lodScale: {value: shading.carPaintReflection.lodScale},
    paint_sharp: {value: null}, paint_convolved: {value: null}, paint_levels: {value: 1}, paint_probe: {value: 0},
  };
  paintUniforms.set(material, uniforms);
  const {clearCoatLod, baseCoatLod} = shading.carPaintReflection;
  const variant = `${region ? 'region' : 'black'}-${aoSpec ? 'ao' : 'noao'}-${clearCoatLod}-${baseCoatLod}`;
  material.clearcoat = 1; // Enables three's coat layer; its strength is set per pixel.
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    let fragment = shader.fragmentShader.replace('void main() {', `${FRAGMENT.declarations}\nvoid main() {`)
      .replace('#include <lights_fragment_begin>', LIGHTS_WITH_GLINT)
      .replace('#include <map_fragment>', FRAGMENT.albedo).replace('#include <roughnessmap_fragment>', FRAGMENT.roughness)
      .replace('#include <metalnessmap_fragment>', FRAGMENT.metalness).replace('#include <lights_physical_fragment>', FRAGMENT.physical)
      .replace('#include <aomap_fragment>', FRAGMENT.occlusion)
      .replace('outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc )', FRAGMENT.metallic + FRAGMENT.absorption);
    if (!region) fragment = fragment.replace('sqrt(texture2D(paint_region, vMapUv).rgb)', 'vec3(0.0)');
    if (!aoSpec) fragment = fragment.replace('vec4 aoSpec = texture2D(paint_aoSpec, vMapUv);', 'vec4 aoSpec = vec4(1.0);');
    shader.fragmentShader = fragment;
    patchAmbientLookup(shader); // The paint's own reflection model keeps its reflectance; only the ambient lookup is shared.
    shader.fragmentShader = shader.fragmentShader // The ambient patch inlines the chunk the lookups live in.
      .replace(BASE_LOOKUP, PAINT_BASE_LOOKUP.replace('PAINT_BASE_EXPLICIT', String(baseCoatLod === 'explicit')))
      .replace(COAT_LOOKUP, PAINT_COAT_LOOKUP.replace('PAINT_COAT_EXPLICIT', String(clearCoatLod === 'explicit')));
  };
  material.customProgramCacheKey = () => `lmu-car-paint-${variant}`;
  material.addEventListener('dispose', () => {
    for (const key of ['paint_region', 'paint_aoSpec', 'paint_carbon']) { const map = uniforms[key].value as Texture; if (map !== albedo) map.dispose(); }
  });
}
