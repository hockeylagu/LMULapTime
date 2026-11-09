import { ShaderChunk } from 'three';

/**
 * How a surface takes its diffuse light from the scene's environment map, shared by the scenery surfaces and the cars: looked up
 * with the normal's height halved, so an up-facing surface (road, grass, roof) gets a mix of horizon and zenith light instead of
 * the zenith's blue alone, and a down-facing one a horizon mix instead of ground bounce alone. The unhalved lookup gave asphalt and
 * grass a blue cast against the reference captures. Scenery reflections follow the package (sceneryReflection.ts).
 */

const IRRADIANCE_LOOKUP = 'getIBLIrradiance( geometryNormal )';
const HALVED_LOOKUP = 'getIBLIrradiance( normalize( geometryNormal * vec3( 1.0, 0.5, 1.0 ) ) )';
if (!ShaderChunk.lights_fragment_maps.includes(IRRADIANCE_LOOKUP)) throw Error('three.js lights_fragment_maps changed: the ambient lookup needs updating');

/** Replaces three's environment include in a program with the halved-height irradiance lookup. */
export function patchAmbientLookup(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', ShaderChunk.lights_fragment_maps.replace(IRRADIANCE_LOOKUP, HALVED_LOOKUP));
}

