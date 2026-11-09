import { Vector3, type IUniform } from 'three';

/**
 * Lighting normals for camera-facing foliage cards: the card's facing normal tilts sideways by the corner's side (saturating
 * at a metre, so the two halves of a wide card read as the two sides of a crown) and upward above a metre over the pivot, the
 * up-tilt fading as the card comes to face the sun. Nothing tilts downward: the base of a tree keeps the facing normal, so it
 * is lit like the trunk around it rather than reading as an underside. Backlit cards get a normal the translucency can use.
 */

/** Toward the sun in scene space, shared by every card's program (set by the scene environment). */
export const crownSun: IUniform<Vector3> = { value: new Vector3(0, 1, 0) };

/** The uniform name a card's vertex program reads the sun direction from. */
export const CROWN_SUN_UNIFORM = 'surface_crownSun';

/** GLSL for `beginnormal_vertex`: the crown normal of a card facing `eye`, as a local normal (transpose(M) * world normal). */
export function crownNormalGlsl(eye: string): string {
  return `{ vec3 toEye = ${eye} - (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz; toEye.y = 0.0;
      if (length(toEye) > 0.0001) {
        vec3 facing = normalize(toEye), across = normalize(cross(vec3(0.0,1.0,0.0), toEye));
        float side = clamp(2.0 * clamp(_lmu_corner.x, 0.0, 1.0) - 1.0, -1.0, 1.0);
        float up = clamp(2.0 * clamp(_lmu_corner.y, 0.0, 1.0) - 1.0, 0.0, 1.0) * clamp(1.0 - dot(facing, ${CROWN_SUN_UNIFORM}), 0.0, 1.0);
        vec3 crownNormal = facing + across * side + vec3(0.0, up, 0.0);
        objectNormal = normalize(normalize(crownNormal) * mat3(modelMatrix));
      } }`;
}
