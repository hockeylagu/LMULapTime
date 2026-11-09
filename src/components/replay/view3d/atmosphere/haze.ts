import { ShaderChunk, type Color, type Vector3 } from 'three';
import type { HeightHaze } from './perezSky.js';

/**
 * The replay's haze in three's fog chunks, for one scene: the fog density and colour stay three's `FogExp2` uniforms, and the
 * layout's constant terms are written into the chunks when the scene is built (each replay scene has its own renderer, so its
 * programs compile from its own chunks).
 *
 * - Distance: 1 − exp(−density·d), linear in the exponent (not three's squared exponential), the view depth clamped at zero: a
 *   fragment behind the eye gave NaN, which spread through the post-processing as black blocks.
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

const THREE_FOG = {
  vertexPars: ShaderChunk.fog_pars_vertex, vertex: ShaderChunk.fog_vertex, fragmentPars: ShaderChunk.fog_pars_fragment, fragment: ShaderChunk.fog_fragment,
};
const EXPECTED = {vertex: 'vFogDepth = - mvPosition.z;', fragment: 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );'};
if (!THREE_FOG.vertex.includes(EXPECTED.vertex) || !THREE_FOG.fragment.includes(EXPECTED.fragment)) throw Error('three.js fog chunks changed: the replay haze needs updating');

/** A GLSL float literal. */
const float = (value: number): string => {
  if (!Number.isFinite(value)) throw Error(`Haze value is not finite: ${value}`);
  const text = String(value);
  return /[.e]/.test(text) ? text : `${text}.0`;
};

/** Writes the haze for a scene into three's fog chunks; materials compiled afterwards draw it. */
export function installHaze(shape: HazeShape): void {
  const {originY, height, sunDirection: sun, sunRadiance: light, sunward} = shape;
  ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n  varying float vFogDepth;\n  varying vec3 vFogWorld;\n#endif\n';
  // World position from the view-space one: the view matrix's rotation is orthonormal, so its transpose undoes it.
  ShaderChunk.fog_vertex = '#ifdef USE_FOG\n  vFogDepth = - mvPosition.z;\n  vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );\n#endif\n';
  ShaderChunk.fog_pars_fragment = `${THREE_FOG.fragmentPars}
#ifdef USE_FOG
  varying vec3 vFogWorld;
  const float HAZE_ORIGIN_Y = ${float(originY)};
  const float HAZE_HEIGHT_AMOUNT = ${float(height.amount)}, HAZE_HEIGHT_RATE = ${float(height.rate)}, HAZE_HEIGHT_EXPONENT = ${float(height.exponent)};
  const vec3 HAZE_SUN_DIRECTION = vec3( ${float(sun.x)}, ${float(sun.y)}, ${float(sun.z)} );
  const vec3 HAZE_SUN_RADIANCE = vec3( ${float(light.r)}, ${float(light.g)}, ${float(light.b)} );
  const float HAZE_SUNWARD = ${float(sunward)};
#endif
`;
  ShaderChunk.fog_fragment = `#ifdef USE_FOG
  float fogFactor = 1.0 - exp( - fogDensity * max( vFogDepth, 0.0 ) );
  fogFactor *= 1.0 - HAZE_HEIGHT_AMOUNT * pow( clamp( ( vFogWorld.y + HAZE_ORIGIN_Y ) * HAZE_HEIGHT_RATE, 0.0, 1.0 ), HAZE_HEIGHT_EXPONENT );
  float hazeSun = clamp( dot( HAZE_SUN_DIRECTION, normalize( vFogWorld - cameraPosition ) ), 0.0, 1.0 );
  vec3 hazeColour = mix( fogColor, HAZE_SUN_RADIANCE, hazeSun * hazeSun * HAZE_SUNWARD );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hazeColour, fogFactor );
#endif
`;
}
