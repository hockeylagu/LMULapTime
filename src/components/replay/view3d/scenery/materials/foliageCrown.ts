import { Float32BufferAttribute, type BufferGeometry } from 'three';

/**
 * Spherical normals for camera-facing foliage cards, the standard technique for lighting billboard trees: each corner's normal
 * points out of a sphere around the card's crown (across by the corner's side, up or down by its height from the crown's middle,
 * and toward the eye by the crown's radius), so tops and sun sides light, undersides and far sides shade, and light through the
 * leaves (translucency) has a normal to work with. A flat card normal left every frond lit alike, and backlit palms black.
 */
export const CROWN_ATTRIBUTE = '_lmu_crown';

/** Per vertex, the lowest and highest corner height of its card (cards are the vertices sharing one pivot). Computed once at load. */
export function addFoliageCrown(geometry: BufferGeometry): void {
  if (geometry.hasAttribute(CROWN_ATTRIBUTE)) return;
  const pivots = geometry.getAttribute('_lmu_pivot'), corners = geometry.getAttribute('_lmu_corner');
  const spans = new Map<string, [number, number]>(), keys: string[] = [];
  for (let i = 0; i < corners.count; i++) {
    const key = `${pivots.getX(i)},${pivots.getY(i)},${pivots.getZ(i)}`, y = corners.getY(i);
    keys.push(key);
    const span = spans.get(key);
    if (span) { span[0] = Math.min(span[0], y); span[1] = Math.max(span[1], y); } else spans.set(key, [y, y]);
  }
  const crown = new Float32Array(corners.count * 2);
  keys.forEach((key, i) => { const span = spans.get(key) as [number, number]; crown[2 * i] = span[0]; crown[2 * i + 1] = span[1]; });
  geometry.setAttribute(CROWN_ATTRIBUTE, new Float32BufferAttribute(crown, 2));
}

/** GLSL for `beginnormal_vertex`: the crown normal of a card facing `eye`, as a local normal (transpose(M) * world normal). */
export function crownNormalGlsl(eye: string): string {
  return `{ vec3 toEye = ${eye} - (modelMatrix * vec4(_lmu_pivot, 1.0)).xyz; toEye.y = 0.0;
      if (length(toEye) > 0.0001) {
        vec3 facing = normalize(toEye), across = normalize(cross(vec3(0.0,1.0,0.0), toEye));
        float middle = 0.5 * (${CROWN_ATTRIBUTE}.x + ${CROWN_ATTRIBUTE}.y), radius = max(0.5 * (${CROWN_ATTRIBUTE}.y - ${CROWN_ATTRIBUTE}.x), 0.01);
        vec3 crownNormal = across * _lmu_corner.x + vec3(0.0, _lmu_corner.y - middle, 0.0) + facing * radius;
        objectNormal = normalize(normalize(crownNormal) * mat3(modelMatrix));
      } }`;
}
