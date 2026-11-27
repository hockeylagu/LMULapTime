import { Matrix3, Matrix4, Vector3, type DirectionalLight, type IUniform, type Scene, type Texture } from 'three';
import { SCENE_BLOCK, sceneBlock, setPass, setScene, writeMatrix3 } from './sceneBlock.js';

/**
 * The cube face size of the environments a scene is lit by (the first environment and the venue capture, sceneEnvironment.ts).
 */
export const ENVIRONMENT_FACE_PX = 128;

/**
 * What three defines for a built-in material on a PMREM environment, as `WebGLProgram` writes them, but for `ENVMAP_MAX_LOD` (the
 * environment's last level, the only size three's chunks read): the lit template defines it from the scene block or the material's
 * own environment (litTemplate.ts), so a program reads an environment of any size without another variant.
 */
export const ENVIRONMENT_DEFINES = {USE_ENVMAP: '', ENVMAP_TYPE_PMREM: ''} as const;

/** The last level of a PMREM environment, as three takes it for its defines (its levels less one); throws for any other texture. */
export function environmentMaxLod(texture: Texture): number {
  const {isPMREMTexture, mipmaps} = texture as Texture & {isPMREMTexture?: boolean; mipmaps?: unknown[]};
  if (isPMREMTexture !== true || !mipmaps?.length) throw Error(`Environment ${texture.name || texture.uuid} is not a PMREM`);
  return mipmaps.length - 1;
}

/** The scene's environment, which every lit composed program samples unless its material has its own (a texture: no block member). */
export const sceneEnvironmentMap: IUniform<Texture | null> = {value: null};

/**
 * The light of one scene for the lit composed programs: the returned apply writes `sun` (a directional light at the scene's root:
 * toward it, world space, unit length; its colour times its intensity) and the environment's turn and last level into the scene block,
 * the environment's share into the pass block (`scene.environmentIntensity`, 0 while the venue's first capture is taken) and the
 * environment into `sceneEnvironmentMap`: the values three gives its built-in materials from the light and the scene. Call it before
 * each render of the scene.
 */
export function sceneLight(scene: Scene, sun: DirectionalLight): () => void {
  const rotation = new Matrix4(), turn = new Matrix3(), toSun = new Vector3();
  return () => {
    const {environment} = scene;
    toSun.subVectors(sun.position, sun.target.position).normalize().toArray(sceneBlock, SCENE_BLOCK.offsets.lit_sunDirection);
    toSun.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity).toArray(sceneBlock, SCENE_BLOCK.offsets.lit_sunColour);
    if (environment) setScene('lit_environmentMaxLod', environmentMaxLod(environment));
    sceneEnvironmentMap.value = environment;
    setPass({lit_environmentIntensity: scene.environmentIntensity});
    // As three turns the scene's rotation for its materials (WebGLMaterials): the transpose, a PMREM taking no cube flip.
    writeMatrix3(sceneBlock, SCENE_BLOCK.offsets.lit_environmentRotation, turn.setFromMatrix4(rotation.makeRotationFromEuler(scene.environmentRotation)).transpose());
  };
}
