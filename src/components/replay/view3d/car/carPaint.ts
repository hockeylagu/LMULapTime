import { RepeatWrapping, Vector2, Vector3, Vector4, type IUniform, type MeshPhysicalMaterial, type Texture } from 'three';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';

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
 * average; the flake map is not in the package); the clear coat sets
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
    float paintCoat, paintCoatRoughness, paintCoatF0, paintBaseF0, paintBaseSpecular, paintBaseRoughness, paintMetallic, paintBounce, paintAO, paintCoatOcclusion, paintBaseOcclusion; vec3 paintLacquer, paintFlake;`,
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
      paintCoatF0 = pow2((coatIndex - 1.0) / (coatIndex + 1.0));
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
    reflectedLight.indirectDiffuse *= paintAO;
    reflectedLight.directSpecular *= paintBaseOcclusion; reflectedLight.indirectSpecular *= paintBaseOcclusion;
    clearcoatSpecularDirect *= paintCoatOcclusion; clearcoatSpecularIndirect *= paintCoatOcclusion;`,
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
  const map = texture(path).clone();
  map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping; map.needsUpdate = true;
  return map;
}

/**
 * Turns a physical material carrying the paint albedo into layered car paint, from the appearance's `paint` description. A
 * paint without a region map is all black region (an empty region map reads as zero). Maps the paint does not declare
 * fall back to the albedo for sampling but are neutralized by their parameters (no carbon strength, full AO only when declared).
 */
export function configureCarPaint(material: MeshPhysicalMaterial, paint: CarSurface, texture: (path: string) => Texture): void {
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
    i === 0 ? number(r, 'metallicPaintStrength') : 0, i === 1 && paint.maps.carbon?.texture ? number(r, 'carbonFibreStrength') : 0));
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
  };
  const variant = `${region ? 'region' : 'black'}-${aoSpec ? 'ao' : 'noao'}`;
  material.clearcoat = 1; // Enables three's coat layer; its strength is set per pixel.
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    let fragment = shader.fragmentShader.replace('void main() {', `${FRAGMENT.declarations}\nvoid main() {`)
      .replace('#include <map_fragment>', FRAGMENT.albedo).replace('#include <roughnessmap_fragment>', FRAGMENT.roughness)
      .replace('#include <metalnessmap_fragment>', FRAGMENT.metalness).replace('#include <lights_physical_fragment>', FRAGMENT.physical)
      .replace('#include <aomap_fragment>', FRAGMENT.occlusion)
      .replace('outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc )', FRAGMENT.metallic + FRAGMENT.absorption);
    if (!region) fragment = fragment.replace('sqrt(texture2D(paint_region, vMapUv).rgb)', 'vec3(0.0)');
    if (!aoSpec) fragment = fragment.replace('vec4 aoSpec = texture2D(paint_aoSpec, vMapUv);', 'vec4 aoSpec = vec4(1.0);');
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `lmu-car-paint-${variant}`;
  material.addEventListener('dispose', () => {
    for (const key of ['paint_region', 'paint_aoSpec', 'paint_carbon']) { const map = uniforms[key].value as Texture; if (map !== albedo) map.dispose(); }
  });
}
