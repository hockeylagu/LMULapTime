/**
 * The track lights at night (docs/SCENE_PACKAGE.md "Night", track lights and light lists): which of the layout's lights reach a piece of
 * scenery or a car, and what one light adds at a point. The game adds them per vertex, diffuse only, under the ambient occlusion.
 */

type Vec3 = readonly [number, number, number];

/** One of the layout's track lights (the package's night `lights`): an omni light in the scenery frame. */
export interface TrackLight {position: Vec3; rangeM: number; colour: Vec3}

/** The game stretches the vertical distance to a light below the vertex by this factor (the package contract states it). */
const BELOW_STRETCH = 20;

const distanceSquared = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** The lights whose range reaches a bounding sphere, by index, nearest its centre first. */
export function lightsInReach(lights: readonly TrackLight[], centre: Vec3, radius: number): number[] {
  return lights.flatMap((light, index) => {
    const d2 = distanceSquared(light.position, centre), reach = light.rangeM + radius;
    return d2 < reach * reach ? [{index, d2}] : [];
  }).sort((a, b) => a.d2 - b.d2).map(entry => entry.index);
}

/**
 * The lights that light a scenery node: its light list where it carries one (`extras.lmuLightList`) and the layout has an entry for that
 * id, every light in reach of its bounding sphere otherwise (a venue-shared piece capped only in another layout takes them all).
 */
export function sceneryNodeLights(lights: readonly TrackLight[], lists: ReadonlyMap<number, readonly number[]>, listId: number | undefined, centre: Vec3, radius: number): readonly number[] {
  const listed = listId === undefined ? undefined : lists.get(listId);
  return listed ?? lightsInReach(lights, centre, radius);
}

/** What one track light adds at a point with a unit normal, before the albedo and the occlusion: N·L · colour · saturate(1 − d / range). */
export function trackLightAt(light: TrackLight, point: Vec3, normal: Vec3): [number, number, number] {
  const dx = light.position[0] - point[0], dz = light.position[2] - point[2];
  // A light below the vertex: its vertical distance counts twenty times.
  const dy = (light.position[1] - point[1]) * (light.position[1] < point[1] ? BELOW_STRETCH : 1);
  const d = Math.hypot(dx, dy, dz);
  if (d === 0) return [0, 0, 0];
  const facing = Math.max(0, (normal[0] * dx + normal[1] * dy + normal[2] * dz) / d), fade = Math.min(1, Math.max(0, 1 - d / light.rangeM));
  return light.colour.map(c => c * facing * fade) as [number, number, number];
}
