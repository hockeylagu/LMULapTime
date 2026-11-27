import { type Color, type FogExp2, type IUniform, type Material, type Object3D, type Scene, type ShaderMaterial, type Vector3 } from 'three';
import { composedParts, type ShaderPart } from '../shaders/composer.js';
import { SCENE_BLOCK, sceneBlock, setScene } from '../shaders/sceneBlock.js';
import type { HeightHaze } from './skyDome.js';

/**
 * The replay's haze, in the programs of the materials that compose `hazePart`: the scene's `FogExp2` holds its colour and density,
 * and the scene writes them with the layout's terms into the scene block (`createHaze`'s apply, sceneBlock.ts) before each of its
 * renders. One program serves every scene; a scene's materials draw with its own haze. three's own fog is off in every composed
 * material; a fog-enabled material would draw three's plain fog beside the haze: `assertHazed` finds it.
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

const VERTEX_PARS = '  varying float vHazeDepth;\n  varying vec3 vHazeWorld;\n';
// World position from the view-space one: the view matrix's rotation is orthonormal, so its transpose undoes it.
const VERTEX = '  vHazeDepth = length( mvPosition.xyz );\n  vHazeWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );\n';
/** The fragment's haze (the scene block's terms), its distance in the exponent scaled by the material's `HAZE_DISTANCE_SCALE`. */
const FRAGMENT_PARS = '  varying float vHazeDepth;\n  varying vec3 vHazeWorld;\n  uniform float HAZE_DISTANCE_SCALE;\n';
const FRAGMENT = `  {
    float hazeFactor = 1.0 - exp( - HAZE_DISTANCE_SCALE * haze_density * vHazeDepth );
    hazeFactor *= 1.0 - HAZE_HEIGHT_AMOUNT * pow( clamp( ( vHazeWorld.y + HAZE_ORIGIN_Y ) * HAZE_HEIGHT_RATE, 0.0, 1.0 ), HAZE_HEIGHT_EXPONENT );
    float hazeSun = clamp( dot( HAZE_SUN_DIRECTION, normalize( vHazeWorld - cameraPosition ) ), 0.0, 1.0 );
    vec3 hazeColour = mix( haze_colour, HAZE_SUN_RADIANCE, hazeSun * hazeSun * HAZE_SUNWARD );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColour, hazeFactor );
  }
`;

/**
 * The haze of one scene: the returned apply writes `fog`'s colour and density as they are then, and the shape's terms, into the scene
 * block; hazed materials drawn afterwards use them.
 */
export function createHaze(shape: HazeShape, fog: FogExp2): () => void {
  const {originY, height, sunDirection, sunRadiance, sunward} = shape;
  const sun = sunDirection.toArray(), light = [sunRadiance.r, sunRadiance.g, sunRadiance.b];
  for (const value of [originY, height.amount, height.rate, height.exponent, sunward, ...sun, ...light]) {
    if (!Number.isFinite(value)) throw Error(`Haze value is not finite: ${value}`);
  }
  return () => {
    fog.color.toArray(sceneBlock, SCENE_BLOCK.offsets.haze_colour); setScene('haze_density', fog.density);
    setScene('HAZE_ORIGIN_Y', originY);
    setScene('HAZE_HEIGHT_AMOUNT', height.amount); setScene('HAZE_HEIGHT_RATE', height.rate); setScene('HAZE_HEIGHT_EXPONENT', height.exponent);
    setScene('HAZE_SUN_DIRECTION', sun); setScene('HAZE_SUN_RADIANCE', light); setScene('HAZE_SUNWARD', sunward);
  };
}

/**
 * The haze as a part of a composed program: its varyings once the position is final, the haze on the encoded colour, from the
 * scene block's terms. Its distance in the exponent is scaled by the material's `HAZE_DISTANCE_SCALE` (1, the scene's haze as it is;
 * `setHazeDistanceScale`). Last in its slots. The block holds the haze of the scene that wrote it last: a scene that draws hazed
 * materials writes its own (`createHaze`'s apply) before each of its renders, or it draws with another scene's haze.
 */
export const hazePart: ShaderPart = {
  name: 'haze',
  slots: {
    vertexPars: {at: 100, glsl: VERTEX_PARS},
    vertexOutputs: {at: 100, glsl: VERTEX},
    fragmentPars: {at: 100, glsl: FRAGMENT_PARS},
    fragmentOutput: {at: 100, glsl: FRAGMENT},
  },
  uniforms: () => ({HAZE_DISTANCE_SCALE: {value: 1}}),
};

/** Scales the haze's distance in the exponent of a composed material with `hazePart` (a cloud takes half). */
export function setHazeDistanceScale(material: ShaderMaterial, scale: number): void {
  if (!composedParts(material)?.includes(hazePart)) throw Error(`Material ${material.name || material.type} has no haze part`);
  if (!Number.isFinite(scale) || scale <= 0) throw Error(`Haze distance scale is not positive: ${scale}`);
  (material.uniforms.HAZE_DISTANCE_SCALE as IUniform<number>).value = scale;
}

/**
 * Throws when a visible object of a scene with fog draws a fog-enabled material: it would draw three's plain fog beside the replay's
 * haze (a composed material's fog is off; compose `hazePart`). Call it once the scene's content is built. It checks no haze values:
 * `hazePart` reads the scene block's, so the scene must also write its haze (`createHaze`) before it renders.
 */
export function assertHazed(scene: Scene): void {
  if (!scene.fog) return;
  const bare = new Set<string>();
  scene.traverseVisible((object: Object3D) => {
    if ((object.layers.mask & 1) === 0) return; // Not drawn by the scene camera (a shadow-only batch).
    const {material} = object as Object3D & {material?: Material | Material[]};
    for (const each of material === undefined ? [] : [material].flat()) {
      if ('fog' in each && each.fog === true && each.visible) bare.add(`${each.name || each.type} on ${object.name || object.type}`);
    }
  });
  if (bare.size) throw Error(`Fog-enabled materials without the replay haze (compose hazePart): ${[...bare].join('; ')}`);
}
