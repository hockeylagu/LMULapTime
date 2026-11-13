import { ShaderChunk, Vector3, type Color, type IUniform, type Material, type Object3D, type Scene, type WebGLProgramParametersWithUniforms } from 'three';
import type { HeightHaze } from './skyDome.js';

/**
 * The replay's haze, in the programs of the materials that call `hazeProgram`: the fog density and colour stay three's `FogExp2`
 * uniforms, and the layout's terms are uniforms shared by every hazed material, which a scene writes (`createHaze`'s apply) before
 * each of its renders. One program serves every scene; a scene's materials draw with its own haze. three's own fog chunks are
 * left alone: a fog-enabled material that skips `hazeProgram` is found by `assertHazed`.
 *
 * - Distance: 1 − exp(−density·d), linear in the exponent (not three's squared exponential), d the distance from the eye along
 *   the ray (three's view depth under-hazed the frame's edges, by a tenth at 48° of view and more in wide trackside views).
 * - Height: haze thins with the fragment's height above the native zero, by amount · saturate(y · rate)^exponent of what remains.
 * - Sun: the haze colour turns toward the sun's light by sunward · saturate(sun · ray)², per pixel along the view ray.
 */
export interface HazeShape {
  /** The scene origin's height in LMU local metres: scene y plus this is the native height. */
  originY: number;
  height: HeightHaze;
  /** Toward the sun, scene space, unit length. */
  sunDirection: Vector3;
  /** The sun light's colour times its intensity. */
  sunRadiance: Color;
  /** The largest share the haze turns toward the sun's light. */
  sunward: number;
}

/** The haze terms of the scene that rendered last, read by every hazed program (names as in the GLSL). */
const uniforms = {
  HAZE_ORIGIN_Y: {value: 0}, HAZE_HEIGHT_AMOUNT: {value: 0}, HAZE_HEIGHT_RATE: {value: 0}, HAZE_HEIGHT_EXPONENT: {value: 1},
  HAZE_SUN_DIRECTION: {value: new Vector3()}, HAZE_SUN_RADIANCE: {value: new Vector3()}, HAZE_SUNWARD: {value: 0},
} satisfies Record<string, IUniform>;

const EXPECTED = {vertex: 'vFogDepth = - mvPosition.z;', fragment: 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );'};
if (!ShaderChunk.fog_vertex.includes(EXPECTED.vertex) || !ShaderChunk.fog_fragment.includes(EXPECTED.fragment)) throw Error('three.js fog chunks changed: the replay haze needs updating');

const VERTEX_PARS = '#ifdef USE_FOG\n  varying float vFogDepth;\n  varying vec3 vFogWorld;\n#endif\n';
// World position from the view-space one: the view matrix's rotation is orthonormal, so its transpose undoes it.
const VERTEX = '#ifdef USE_FOG\n  vFogDepth = length( mvPosition.xyz );\n  vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );\n#endif\n';
const FRAGMENT_PARS = `${ShaderChunk.fog_pars_fragment}
#ifdef USE_FOG
  varying vec3 vFogWorld;
  uniform float HAZE_ORIGIN_Y;
  uniform float HAZE_HEIGHT_AMOUNT, HAZE_HEIGHT_RATE, HAZE_HEIGHT_EXPONENT;
  uniform vec3 HAZE_SUN_DIRECTION, HAZE_SUN_RADIANCE;
  uniform float HAZE_SUNWARD;
#endif
`;
/** The fragment's haze; `distance` is the GLSL of the distance term. */
const fragment = (distance: string) => `#ifdef USE_FOG
  float fogFactor = 1.0 - exp( - ${distance} );
  fogFactor *= 1.0 - HAZE_HEIGHT_AMOUNT * pow( clamp( ( vFogWorld.y + HAZE_ORIGIN_Y ) * HAZE_HEIGHT_RATE, 0.0, 1.0 ), HAZE_HEIGHT_EXPONENT );
  float hazeSun = clamp( dot( HAZE_SUN_DIRECTION, normalize( vFogWorld - cameraPosition ) ), 0.0, 1.0 );
  vec3 hazeColour = mix( fogColor, HAZE_SUN_RADIANCE, hazeSun * hazeSun * HAZE_SUNWARD );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColour, fogFactor );
#endif
`;

/** The haze of one scene: the returned apply writes its terms into the shared uniforms; hazed materials drawn afterwards use them. */
export function createHaze(shape: HazeShape): () => void {
  const {originY, height, sunDirection, sunRadiance, sunward} = shape;
  const sun = sunDirection.clone(), light = new Vector3(sunRadiance.r, sunRadiance.g, sunRadiance.b);
  for (const value of [originY, height.amount, height.rate, height.exponent, sunward, ...sun.toArray(), ...light.toArray()]) {
    if (!Number.isFinite(value)) throw Error(`Haze value is not finite: ${value}`);
  }
  return () => {
    uniforms.HAZE_ORIGIN_Y.value = originY;
    uniforms.HAZE_HEIGHT_AMOUNT.value = height.amount; uniforms.HAZE_HEIGHT_RATE.value = height.rate; uniforms.HAZE_HEIGHT_EXPONENT.value = height.exponent;
    uniforms.HAZE_SUN_DIRECTION.value.copy(sun); uniforms.HAZE_SUN_RADIANCE.value.copy(light); uniforms.HAZE_SUNWARD.value = sunward;
  };
}

/** The distance scale of each hazed material (1 for the scene's haze as it is). */
const hazed = new WeakMap<Material, number>();

/** Whether `material` draws the replay's haze. */
export const isHazed = (material: Material): boolean => hazed.has(material);

/**
 * Makes `material` draw the scene's haze where three's fog would go (a fog-enabled material of a scene with `scene.fog`): call it
 * from the factory that builds the material, after its own `onBeforeCompile` and `customProgramCacheKey` are set; it chains with
 * both. `distanceScale` multiplies the exponent's distance (a cloud takes half). Calling it again with the same scale does nothing.
 */
export function hazeProgram(material: Material, distanceScale = 1): void {
  const done = hazed.get(material);
  if (done !== undefined) {
    if (done !== distanceScale) throw Error(`Material ${material.name || material.type} is hazed with distance scale ${done}, not ${distanceScale}`);
    return;
  }
  hazed.set(material, distanceScale);
  const own = material.onBeforeCompile.bind(material);
  // three's default key is the compile hook's source: read it before this hook replaces it.
  const ownText = material.onBeforeCompile.toString();
  const key = Object.hasOwn(material, 'customProgramCacheKey') ? material.customProgramCacheKey.bind(material) : () => ownText;
  if (!Number.isFinite(distanceScale) || distanceScale <= 0) throw Error(`Haze distance scale is not positive: ${distanceScale}`);
  const literal = String(distanceScale), distance = distanceScale === 1 ? 'fogDensity * vFogDepth' : `${/[.e]/.test(literal) ? literal : literal + '.0'} * fogDensity * vFogDepth`;
  const swap = (source: string, include: string, code: string) => {
    if (!source.includes(include)) throw Error(`Material ${material.name || material.type} has no ${include} to take the haze`);
    return source.replace(include, () => code);
  };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    own(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = swap(swap(shader.vertexShader, '#include <fog_pars_vertex>', VERTEX_PARS), '#include <fog_vertex>', VERTEX);
    shader.fragmentShader = swap(swap(shader.fragmentShader, '#include <fog_pars_fragment>', FRAGMENT_PARS), '#include <fog_fragment>', fragment(distance));
  };
  material.customProgramCacheKey = () => `${key()}|haze${distanceScale}`;
  material.needsUpdate = true;
}

/**
 * Throws when a visible object of a scene with fog draws a fog-enabled material that skipped `hazeProgram`: it would draw three's
 * plain fog beside the replay's haze. Call it once the scene's content is built.
 */
export function assertHazed(scene: Scene): void {
  if (!scene.fog) return;
  const bare = new Set<string>();
  scene.traverseVisible((object: Object3D) => {
    if ((object.layers.mask & 1) === 0) return; // Not drawn by the scene camera (a shadow-only batch).
    const {material} = object as Object3D & {material?: Material | Material[]};
    for (const each of material === undefined ? [] : [material].flat()) {
      if ('fog' in each && each.fog === true && each.visible && !hazed.has(each)) bare.add(`${each.name || each.type} on ${object.name || object.type}`);
    }
  });
  if (bare.size) throw Error(`Fog-enabled materials without the replay haze (call hazeProgram): ${[...bare].join('; ')}`);
}
