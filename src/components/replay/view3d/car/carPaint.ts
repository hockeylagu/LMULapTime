import { Box3, Matrix4, Vector3, Vector4, type IUniform, type Material, type Object3D, type Texture } from 'three';
import type { CarAppearance, CarSurface } from '../../../../../shared/types/scenes/car.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import type { ReflectionCubes } from '../reflectionCube.js';
import { focusedLookup } from '../scenery/textureFocus.js';
import type { ShaderDefines, ShaderPart } from '../shaders/composer.js';
import { SCENE_BLOCK, sceneBlock } from '../shaders/sceneBlock.js';
import { OVERHEAD_GLSL, overheadUniforms, type CarOverhead } from './overheadMap.js';
import { PAINT_LAYERS, paintAlbedo, paintLayers, paintSamplers } from './paintLayers.js';
/** How far outside the reflection box a surface point still reads the box-projected cube, metres (the reference viewer's slack). */
const BOX_SLACK_M = 0.05;
/**
 * The reflected car's cube box (the package's `reflectionBox`): the axis-aligned box of its corners under the car's frame as the
 * frame stands this frame, and its centre, in the scene block (`paint_boxLow`, w 0: no box; `paint_boxHigh`, `paint_boxCentre`).
 */
let boxed: {frame: Object3D; corners: CarAppearance['reflectionBox']} | null = null, placed = false;
const placedFrame = new Matrix4(), measured = new Box3(), corner = new Vector3(), centre = new Vector3();

/** Places the reflected car's box for the frame (`setPaintBox`): once the frame's world matrices are updated, before it renders. */
export function placePaintBox(): void {
  const low = SCENE_BLOCK.offsets.paint_boxLow;
  if (!boxed) { sceneBlock[low + 3] = 0; return; }
  const world = boxed.frame.matrixWorld;
  if (placed && placedFrame.equals(world)) return;
  placedFrame.copy(world); measured.makeEmpty(); placed = true;
  for (const point of boxed.corners) measured.expandByPoint(corner.set(point[0], point[1], point[2]).applyMatrix4(world));
  measured.min.toArray(sceneBlock, low); sceneBlock[low + 3] = 1;
  measured.max.toArray(sceneBlock, SCENE_BLOCK.offsets.paint_boxHigh); measured.getCenter(centre).toArray(sceneBlock, SCENE_BLOCK.offsets.paint_boxCentre);
}

/**
 * The car whose probe the paint reads (car/carReflection.ts): `frame`, its native car frame in the scene (the body envelope), and
 * the corners of its reflection box in that frame; null for none. Its paint reads the cube box-projected, as the game's paint
 * reads its car cube within the box it binds for the car. Ours: one box, the reflected car's; the cars that share its probe lie
 * outside it and read the cube by direction (the game binds each car's own box). The box is placed each frame (`placePaintBox`).
 */
export function setPaintBox(frame: Object3D | null, corners: CarAppearance['reflectionBox'] = []): void {
  boxed = frame && corners.length ? {frame, corners} : null;
  placed = false; sceneBlock[SCENE_BLOCK.offsets.paint_boxLow + 3] = 0;
}

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

/** The paint's declarations: its layers, the sun's glint, the coats' reflection of the car's probe and its box. */
const DECLARATIONS = `${PAINT_LAYERS.declarations}
    uniform vec3 paint_glint; uniform vec4 paint_edge; uniform float paint_coatCutoff, paint_lodScale, paint_levels, paint_probe;
    uniform samplerCube paint_sharp, paint_convolved;${OVERHEAD_GLSL}
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
    }`

/**
 * Layered car paint on three's physical model with its clear coat, driven by the package's paint description (`PAINT_LAYERS`, on
 * the albedo the material's map part reads first, carStandardSurface.ts). The base coat sets the roughness, the base-to-coat Fresnel
 * and the metallic share (flakes at half strength, their average), only for paint with a flake map: without one the flake colour
 * tinted plain paint (a blue cast on red and grey); the clear coat sets three's coat strength, roughness and air-to-coat Fresnel; the
 * lacquer tints what passes through the coat over its optical depth. The AO/spec mask gives ambient occlusion (green) and specular
 * occlusion (red, times the albedo alpha on the base coat). Not carried: orange-peel and carbon normals, metal flakes, damage, wear
 * and rain.
 *
 * Each coat reads the car's own reflection cubes in place of three's environment lookups, sharp at or under the package's roughness
 * cutoff and convolved above it, at the package's level rule for that coat (explicit levels or a bias, scene-wide: the program's
 * shape). Until the first probe completes, three's prefiltered sky environment stands in. The direct sun keeps the floored
 * roughness of the coat, which keeps its lobe finite; the clear coat's Fresnel takes the box-projected reflection's half vector.
 */
function paintPart(maps: {region: boolean; aoSpec: boolean}, shading: SceneryShading, uniforms: Record<string, IUniform>): ShaderPart {
  const {clearCoatLod, baseCoatLod} = shading.carPaintReflection;
  return {
    name: 'carPaint',
    slots: {
      fragmentPars: {at: 10, glsl: `uniform float clearcoat, clearcoatRoughness;\n${DECLARATIONS}`},
      fragmentAlbedo: {at: 10, glsl: paintAlbedo(maps, focusedLookup)},
      fragmentColour: {at: 0, glsl: '  #include <alphatest_fragment>\n  roughnessFactor = clamp(paintBaseRoughness, 0.0, 1.0);\n  metalnessFactor = 0.0;'},
      fragmentMaterial: {at: 0, glsl: `    material.specularColor = vec3(paintBaseF0 * paintBaseSpecular);
    material.specularColorBlended = mix(material.specularColor, diffuseColor.rgb, metalnessFactor);
    material.specularF90 = mix(paintBaseSpecular, 1.0, metalnessFactor);
    material.clearcoat = paintCoat; material.clearcoatF0 = vec3(paintCoatF0);
    material.clearcoatRoughness = min(max(paintCoatRoughness, 0.0525) + geometryRoughness, 1.0);`},
      // The sun's glint joins the direct sun's specular of both coats right after it is evaluated: `directLight` carries the shadowed sun.
      fragmentSunDirect: {at: 50, glsl: `    reflectedLight.directSpecular = paintGlint(reflectedLight.directSpecular, directLight, geometryViewDir, geometryNormal, paintBaseRoughness + paintCoatRoughness * paintCoat, material.specularColor, material.specularF90);
    clearcoatSpecularDirect = paintGlint(clearcoatSpecularDirect, directLight, geometryViewDir, geometryClearcoatNormal, paintCoatRoughness, material.clearcoatF0, material.clearcoatF90);`},
      fragmentRadiance: {at: 0, glsl: `  radiance = paintReflection( geometryViewDir, geometryNormal, paintBaseRoughness, ${baseCoatLod === 'explicit'}, paintBaseCos );
  clearcoatRadiance = paintReflection( geometryViewDir, geometryClearcoatNormal, paintCoatRoughness, ${clearCoatLod === 'explicit'}, paintCoatCos );`},
      fragmentOcclusion: {at: 10, glsl: `    // The base coat reflects the environment by its specular strength and Schlick's Fresnel at the angle of the direction read.
    reflectedLight.indirectSpecular = radiance * paintBaseSpecular * (paintBaseF0 + (1.0 - paintBaseF0) * pow(1.0 - (paintBaseCos < 0.0 ? saturate(dot(normal, geometryViewDir)) : paintBaseCos), 5.0));
    reflectedLight.directSpecular *= paintBaseOcclusion; reflectedLight.indirectSpecular *= paintBaseOcclusion;
    clearcoatSpecularDirect *= paintCoatOcclusion; clearcoatSpecularIndirect *= paintCoatOcclusion;${PAINT_LAYERS.diffuse}`},
      // The coat's share of the outgoing light, as three's physical program mixes it. The metallic layer replaces that share of the base
      // layer first: the base coat's reflection through the lacquer, faded off the facing angle, mixed with light bounced inside the
      // coat, tinted by the flake colour. The flakes' sun sparkle needs the flake map's normals and is not carried.
      fragmentLight: {at: 0, glsl: `  { float dotNVcc = paintCoatCos < 0.0 ? saturate( dot( geometryClearcoatNormal, geometryViewDir ) ) : paintCoatCos;
    vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
    if (paintMetallic > 0.0) {
      vec3 flakes = paintLacquer * radiance * clamp(pow2(saturate(dot(normal, geometryViewDir))) * 3.0, 0.0, 1.0) * 0.5;
      vec3 bounced = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) * 0.5;
      outgoingLight = mix(outgoingLight, mix(flakes, bounced, paintBounce) * paintFlake, paintMetallic);
    }
    outgoingLight = outgoingLight * ${PAINT_LAYERS.absorption} * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat; }`},
    },
    uniforms: () => uniforms,
    ownTextures: paintSamplers(maps),
  };
}

/** What a car paint material is built from: its part, defines, the samplers its lookups fade in, and how its material is bound. */
export interface CarPaint {
  part: ShaderPart;
  /** three's clear coat on the physical model (the coat's strength is set per pixel). */
  defines: ShaderDefines;
  /** The paint maps' samplers its lookups read (the albedo's is the map part's), by uniform name. */
  samplers: Record<string, IUniform>;
  /** Makes the material built with `part` the paint the probe hands its cubes (`setPaintReflection`). */
  bind: (material: Material) => void;
  dispose: () => void;
}

/**
 * Car paint from the appearance's `paint` description over its albedo `map`. A paint without a region map is all black region
 * (an empty region map reads as zero). Maps the paint does not declare are not read (`paintAlbedo`). `shading` is the package's
 * shading section: the sun glint, its edge limit and the coat's sharp-reflection cutoff.
 */
export function carPaint(paint: CarSurface, map: Texture, texture: (path: string) => Texture, shading: SceneryShading): CarPaint {
  const layers = paintLayers(paint, texture, map);
  const overhead = {current: null as CarOverhead | null};
  const uniforms: Record<string, IUniform> = {
    ...layers.uniforms, ...overheadUniforms(() => overhead.current),
    paint_glint: {value: new Vector3(shading.sunGlint.cosineThreshold, shading.sunGlint.roughnessCutoff, shading.sunGlint.smoothSpecularScale)},
    paint_edge: {value: new Vector4(shading.smallEdge.detectorScale, shading.smallEdge.edgeScale, shading.smallEdge.limitMin, shading.smallEdge.limitMax)},
    paint_coatCutoff: {value: shading.carPaintReflection.roughnessCutoff}, paint_lodScale: {value: shading.carPaintReflection.lodScale},
    paint_sharp: {value: null}, paint_convolved: {value: null}, paint_levels: {value: 1}, paint_probe: {value: 0},
    // three's clear coat inputs, which the paint sets per pixel (`fragmentMaterial`).
    clearcoat: {value: 1}, clearcoatRoughness: {value: 0},
  };
  return {
    part: paintPart(layers.maps, shading, uniforms),
    defines: {USE_CLEARCOAT: ''},
    samplers: Object.fromEntries(paintSamplers(layers.maps).map(name => [name, uniforms[name]])),
    bind: material => { paintUniforms.set(material, uniforms); paintOverheads.set(material, overhead); },
    dispose: layers.dispose,
  };
}