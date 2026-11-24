import { NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector2, Vector3, Vector4, type IUniform, type Texture } from 'three';
import type { CarSurface } from '../../../../../shared/types/scenes/car.js';
import type { CarMapRef } from '../../../../../shared/packageContract/bodyDescriptor.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';

/** The paint regions, in the order the region map blends them (black is what no channel covers). */
const REGIONS = ['black', 'red', 'green', 'blue', 'white'] as const;
/** The maps the paint layers sample besides the albedo, by descriptor key. */
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
 * The paint's layers, as every program that draws car paint reads them (the full models' layered paint, `carPaint`, and the far
 * models' paint, `farCars`). The region map blends five paint setups (square-rooted channels, saturation split into
 * red/green/blue/white, black for the rest; refractive indices blended as square roots): the clear coat's strength, roughness and
 * index, the base coat's roughness, index and specular strength, the lacquer the light passes through. The AO/spec mask gives
 * ambient occlusion (green) and specular occlusion (red, times the albedo alpha on the base coat). Carbon fibre (red region only)
 * darkens the albedo toward the carbon colour and multiplies the weave overlay.
 */
export const PAINT_LAYERS = {
  /** The layers' uniforms, the values `albedo` leaves for the rest of the program, and the Fresnel the diffuse light loses by. */
  declarations: `
    uniform sampler2D paint_region, paint_aoSpec, paint_carbon;
    uniform vec4 paint_coat[5], paint_base[5]; uniform vec3 paint_lacquer[5];
    uniform vec3 paint_carbonColour, paint_flakeColour; uniform vec2 paint_carbonScale; uniform float paint_coatStrength, paint_lacquerThickness;
    float paintCoat, paintCoatIndex, paintCoatRoughness, paintCoatF0, paintBaseF0, paintBaseSpecular, paintBaseRoughness, paintMetallic, paintBounce, paintAO, paintCoatOcclusion, paintBaseOcclusion; vec3 paintLacquer, paintFlake;
    // Unpolarized Fresnel reflectance from air into a medium of index n, at incidence cosine c.
    float paintFresnelAvg(float c, float n) {
      float t = sqrt(max(1.0 - (1.0 - c * c) / (n * n), 0.0));
      float s = (c - n * t) / (c + n * t + 1e-6), p = (t - n * c) / (t + n * c + 1e-6);
      return 0.5 * (s * s + p * p);
    }`,
  /** In place of three's `map_fragment`: the albedo, then the layers at this pixel. */
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
  /** After three's `aomap_fragment`: what the diffuse light loses to the mask and the coats. */
  diffuse: `
    reflectedLight.indirectDiffuse *= paintAO;
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
  /** What the lacquer lets through of the light leaving the paint under it, over its optical depth at the view angle. */
  absorption: 'mix(vec3(1.0), pow(paintLacquer, vec3(paint_lacquerThickness / clamp(dot(geometryViewDir, normal) + 0.001, 0.001, 1.0))), paintCoat)',
};

/**
 * A paint map's own texture, sampled on the albedo's UVs with repeat and decoded by the map's colour role (the region map is a
 * colour stage: read through sRGB, then square-rooted in the shader).
 */
function paintMap(texture: (path: string) => Texture, map: CarMapRef | undefined, fallback: Texture): Texture {
  if (!map?.texture) return fallback;
  const copy = texture(map.texture);
  copy.wrapS = RepeatWrapping; copy.wrapT = RepeatWrapping; copy.anisotropy = MAX_ANISOTROPY;
  copy.colorSpace = map.srgb ? SRGBColorSpace : NoColorSpace;
  copy.needsUpdate = true;
  return copy;
}

/** A paint description's named group of values; a missing one is a package error. */
function group(owner: Record<string, unknown> | undefined, name: string): Record<string, unknown> {
  const value = owner?.[name];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Car paint has no ${name}`);
  return value as Record<string, unknown>;
}

/**
 * The layers of a paint description for a program that carries `PAINT_LAYERS`: its uniforms (`texture` hands each map its own
 * copy; a map the paint does not declare falls back to `albedo` for sampling and is neutralized by `fragment`), the program
 * variant they need, and `fragment`, which fits a patched fragment shader to the maps declared: a paint without a region map is
 * all black region, one without an AO/spec mask is unoccluded. `dispose` frees the maps' copies.
 */
export function paintLayers(paint: CarSurface, texture: (path: string) => Texture, albedo: Texture) {
  const parameters = paint.parameters ?? {};
  const regions = REGIONS.map(name => group(group(parameters, 'regions'), name));
  const coat = regions.map(r => new Vector4(number(r, 'clearCoatSpecStrength'), number(r, 'clearCoatRoughness'), Math.sqrt(number(r, 'clearCoatRefractiveIndex')), number(r, 'baseCoatSpecStrength')));
  const base = regions.map((r, i) => new Vector4(number(r, 'baseCoatRoughness'), Math.sqrt(number(r, 'baseCoatRefractiveIndex')),
    i === 0 && paint.maps.metallicFlakeNoise?.texture ? number(r, 'metallicPaintStrength') : 0, i === 1 && paint.maps.carbon?.texture ? number(r, 'carbonFibreStrength') : 0));
  const lacquer = regions.map(r => colour(r.lacquerColour));
  const carbonScale = group(parameters, 'uvScale').carbonFibre;
  if (!Array.isArray(carbonScale) || carbonScale.length !== 2 || !carbonScale.every(Number.isFinite)) throw Error('Car paint has no uvScale.carbonFibre');
  const region = paint.maps.region?.texture, aoSpec = paint.maps.aoSpec?.texture;
  const uniforms: Record<string, IUniform> = {
    // No region map: a black texel everywhere selects the black region. The albedo stands in and its colour is ignored below.
    paint_region: {value: paintMap(texture, paint.maps.region, albedo)}, paint_aoSpec: {value: paintMap(texture, paint.maps.aoSpec, albedo)},
    paint_carbon: {value: paintMap(texture, paint.maps.carbon, albedo)},
    paint_coat: {value: coat}, paint_base: {value: base}, paint_lacquer: {value: lacquer},
    paint_carbonColour: {value: colour(parameters.carbonFibreAlbedoColour)},
    paint_flakeColour: {value: colour(parameters.metallicFlakeColour)},
    paint_carbonScale: {value: new Vector2(carbonScale[0] as number, carbonScale[1] as number)},
    paint_coatStrength: {value: number(parameters, 'clearCoatStrength')}, paint_lacquerThickness: {value: Math.max(0.001, number(parameters, 'lacquerThickness'))},
  };
  return {
    uniforms,
    variant: `${region ? 'region' : 'black'}-${aoSpec ? 'ao' : 'noao'}`,
    fragment(shader: string): string {
      let fitted = shader;
      if (!region) fitted = fitted.replace('sqrt(texture2D(paint_region, vMapUv).rgb)', 'vec3(0.0)');
      if (!aoSpec) fitted = fitted.replace('vec4 aoSpec = texture2D(paint_aoSpec, vMapUv);', 'vec4 aoSpec = vec4(1.0);');
      return fitted;
    },
    dispose: (): void => {
      for (const key of ['paint_region', 'paint_aoSpec', 'paint_carbon']) { const map = uniforms[key].value as Texture; if (map !== albedo) map.dispose(); }
    },
  };
}
