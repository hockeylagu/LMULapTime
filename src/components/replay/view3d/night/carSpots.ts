/**
 * The cars' spots (the body's GEN spots, `CarLights.spots`), per pixel in every program that takes the track lights
 * (trackLightProgram.ts). A car's headlights follow its replay headlight bit, by day too, as the game's do; its tail spot shines in
 * `states.braking` while it brakes, headlights on or off, else not at all (`spotColour`).
 *
 * The game picks at most 20 of the frame's spots per scene object, every headlight before any other spot, each by how near its car
 * is to the focus car: with ten cars' lamps on in reach no tail spot reaches its road. Ours is one scene-wide list of the spots in the
 * camera's view by the same rule, up to `CAR_SPOTS` (a headlight's 400 m reach puts nearly every lit car's beams in each object's
 * list, so the scene-wide list is the objects' near the camera). Ours too: a surface takes a spot only
 * when the lamp is in front of it, so a tail lamp under a rear wing leaves the wing's top dark (the game's term asks only that the
 * surface face against the beam), and a tail spot lights by the angle of incidence as well, so its red gathers on the road
 * under the lamps rather than evenly over its whole wide cone. A car takes no light of its own spots, as an object in the game never does: in the cars'
 * programs a spot skips the points inside its car's box (`SpotCar.box`). And the road under a car takes none of its lamps (ours: the
 * game's spots cast no shadow): a spot lights only what lies ahead of its lamp along the beam on the ground, fading in over the first half metre. They add nothing while
 * the venue is captured (the pass block's `surface_emission` 0), as the game's ambient probe takes no lamps, nor in the car's probe
 * (`carSpot_shown` 0, `withoutCarSpots`). The list is the scene block's (sceneBlock.ts).
 */
import { Frustum, Matrix4, Vector3, type Box3, type Camera } from 'three';
import type { CarLights } from '../../../../../shared/packageContract/index.js';
import { GAME_LIGHT_UNIT } from '../atmosphere/sunSamples.js';
import { glslNumber } from '../scenery/materials/shaderContext.js';
import { CAR_SPOTS, SCENE_BLOCK, sceneBlock, setScene, withPass } from '../shaders/sceneBlock.js';

/**
 * A car with its headlights on or braking (`isBraking`): its lights, its native car frame in the scene (the body envelope's world
 * matrix), which of the two, and its body's bounds in that frame (null while unknown: its spots then light it too).
 */
export interface SpotCar { lights: CarLights; frame: Matrix4; headlights: boolean; braking: boolean; box: Box3 | null }

/** How far outside its bounds a car's surface still counts as its own, metres: the bounds are measured on another level of the body. */
const OWN_SLACK_M = 0.05;

/**
 * The scene block's spot list: per spot four vec4s (`carSpot_spots`: position and range; direction and cos(outer / 2); attenuation and
 * cos(inner / 2); colour and falloff) and, read by the cars' programs only, two of its car's box (`carSpot_owners`: centre and half
 * width; the car's length axis on the ground (x, z), half length and half height; a half length of 0 is no box).
 */
const SPOTS_AT = SCENE_BLOCK.offsets.carSpot_spots, OWNERS_AT = SCENE_BLOCK.offsets.carSpot_owners;
/** Writes the `index`th vec4 of a list at `list` in the scene block. */
function setVec4(list: number, index: number, x: number, y: number, z: number, w: number): void {
  const at = list + 4 * index;
  sceneBlock[at] = x; sceneBlock[at + 1] = y; sceneBlock[at + 2] = z; sceneBlock[at + 3] = w;
}

/**
 * Draws without the spots: the car's reflection probe (car/carReflection.ts), as the game's mirror pass, whose draws list no spot
 * (captures of 2026-11-26), so the mirror and the paint do not show the road lit by the car's own beams.
 */
export function withoutCarSpots(draw: () => void): void {
  withPass({carSpot_shown: 0}, draw);
}

type Spot = CarLights['spots'][number];
interface Beam { key: number; position: Vector3; direction: Vector3; spot: Spot; colour: Spot['colour']; car: SpotCar }

export interface CarSpots {
  /** Places the spots of `cars` and keeps the `CAR_SPOTS` the game picks for `camera`'s view and `focus` (scene coordinates). */
  update(cars: readonly SpotCar[], camera: Camera, focus: Vector3 | null): void;
  dispose(): void;
}

/**
 * A spot's colour this frame: the tail spot (the one with states) while the car brakes; a headlight by the headlights. Ours: the
 * tail spot's `states.lit` (headlights on, not braking) lights nothing, too strong a red on the road for a position lamp; the
 * game's list, headlights first, leaves it out anyway with the field's headlights in reach.
 */
export function spotColour(spot: Spot, headlights: boolean, braking: boolean): Spot['colour'] | null {
  if (spot.states) return braking ? spot.states.braking : null;
  return headlights ? spot.colour : null;
}

const boxCentre = new Vector3(), lengthAxis = new Vector3(), sideAxis = new Vector3(), upAxis = new Vector3();
const levelLength = new Vector3(), levelSide = new Vector3(), WORLD_UP = new Vector3(0, 1, 0);

/**
 * A spot's car box for the cars' programs (`carSpot_owners`): no box (half length 0) while the car's bounds are unknown. The programs
 * test a level box (`OWN_CAR_TEST`: along the car's heading on the level, across it, and up), so a car on a grade or banking gets
 * the level box round its tilted one: each half extent sums the tilted box's half axes along that direction.
 */
function placeOwner({box, frame}: SpotCar, spot: number): void {
  if (!box || box.isEmpty()) { sceneBlock.fill(0, OWNERS_AT + 8 * spot, OWNERS_AT + 8 * spot + 8); return; }
  box.getCenter(boxCentre).applyMatrix4(frame);
  frame.extractBasis(sideAxis, upAxis, lengthAxis);
  // The box's half axes in the world, frame scale included.
  sideAxis.multiplyScalar((box.max.x - box.min.x) / 2); upAxis.multiplyScalar((box.max.y - box.min.y) / 2); lengthAxis.multiplyScalar((box.max.z - box.min.z) / 2);
  levelLength.set(lengthAxis.x, 0, lengthAxis.z).normalize(); levelSide.set(levelLength.z, 0, -levelLength.x);
  const half = (along: Vector3) => Math.abs(sideAxis.dot(along)) + Math.abs(upAxis.dot(along)) + Math.abs(lengthAxis.dot(along)) + OWN_SLACK_M;
  setVec4(OWNERS_AT, 2 * spot, boxCentre.x, boxCentre.y, boxCentre.z, half(levelSide));
  setVec4(OWNERS_AT, 2 * spot + 1, levelLength.x, levelLength.z, half(levelLength), half(WORLD_UP));
}

export function createCarSpots(): CarSpots {
  const pool: Beam[] = [], cosHalf = (degrees: number) => Math.cos(degrees * Math.PI / 360);
  const frustum = new Frustum(), viewProjection = new Matrix4(), owner = new Vector3();
  const across = new Vector3(), up = new Vector3(), points = Array.from({length: 5}, () => new Vector3()), UP = new Vector3(0, 1, 0);
  /**
   * The game's view test of a spot: the square pyramid round its cone, apex at the lamp, base range far along the beam and
   * range · tan(outer / 2) to each side (sides level), is out only when all five points lie outside one view plane.
   */
  const inView = (beam: Beam) => {
    const {rangeM, outerConeDeg} = beam.spot, half = rangeM * Math.tan(Math.min(outerConeDeg, 179) * Math.PI / 360);
    across.crossVectors(UP, beam.direction).normalize(); up.crossVectors(beam.direction, across);
    points[0].copy(beam.position);
    for (let i = 1; i < 5; i++) {
      points[i].copy(beam.position).addScaledVector(beam.direction, rangeM)
        .addScaledVector(across, i % 2 ? half : -half).addScaledVector(up, i < 3 ? half : -half);
    }
    return frustum.planes.every(plane => points.some(point => plane.distanceToPoint(point) >= 0));
  };
  return {
    update(cars, camera, focus) {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
      const ref = focus ?? camera.position;
      let count = 0;
      for (const car of cars) {
        const {lights, frame, headlights, braking} = car;
        // One key per car: its distance to the focus car.
        const key = owner.setFromMatrixPosition(frame).distanceToSquared(ref);
        for (const spot of lights.spots) {
          const colour = spotColour(spot, headlights, braking);
          if (!colour) continue;
          const beam = pool[count] ??= {key: 0, position: new Vector3(), direction: new Vector3(), spot, colour, car};
          beam.spot = spot; beam.colour = colour; beam.key = key; beam.car = car;
          beam.position.set(...spot.position).applyMatrix4(frame);
          beam.direction.set(...spot.direction).transformDirection(frame);
          if (inView(beam)) count++;
        }
      }
      // Headlights before the tail spots, each by key; a stable sort keeps the cars' order on ties and a car's two headlights in order.
      const tail = (beam: Beam) => beam.spot.states ? 1 : 0;
      const nearest = pool.slice(0, count).sort((a, b) => tail(a) - tail(b) || a.key - b.key).slice(0, CAR_SPOTS);
      nearest.forEach(({position, direction, spot, colour, car}, i) => {
        setVec4(SPOTS_AT, 4 * i, position.x, position.y, position.z, spot.rangeM);
        setVec4(SPOTS_AT, 4 * i + 1, direction.x, direction.y, direction.z, cosHalf(spot.outerConeDeg));
        setVec4(SPOTS_AT, 4 * i + 2, spot.attenuation[0], spot.attenuation[1], spot.attenuation[2], cosHalf(spot.innerConeDeg));
        // A tail spot (the one with states) carries its falloff negated: it lights by the angle of incidence too.
        setVec4(SPOTS_AT, 4 * i + 3, colour[0], colour[1], colour[2], spot.states ? -spot.falloff : spot.falloff);
        placeOwner(car, i);
      });
      setScene('carSpot_count', nearest.length);
    },
    dispose() { setScene('carSpot_count', 0); },
  };
}

/**
 * How far ahead of its lamp a spot's light on the ground fades in, metres (ours): the body below the lamp hides the ground nearest
 * it, and a hard edge at the lamp drew a line across the road.
 */
const AHEAD_FADE_M = 0.5;

/** A car's own spots skip its body: the point inside the spot's car box (`carSpot_owners`). */
const OWN_CAR_TEST = `
    vec4 ownCentre = carSpot_owners[2 * i], ownAxis = carSpot_owners[2 * i + 1];
    vec3 fromCar = point - ownCentre.xyz;
    if (abs(fromCar.x * ownAxis.x + fromCar.z * ownAxis.y) < ownAxis.z && abs(fromCar.x * ownAxis.y - fromCar.z * ownAxis.x) < ownCentre.w
      && abs(fromCar.y) < ownAxis.w) continue;`;

/**
 * The fragment's declarations: the spot list and the game's spot term at a world point and normal. Ours: a spot lights only what
 * lies ahead of its lamp along the beam on the ground, so the road under its car stays dark; `ownCar`, the cars' programs, where a
 * car's own spots also skip its body (`carSpot_owners`).
 */
export function carSpotDeclarations(ownCar: boolean): string {
  return `vec3 carSpotLight(vec3 point, vec3 normal) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${CAR_SPOTS}; i++) {
    if (float(i) >= carSpot_count) break;
    vec4 dirOuter = carSpot_spots[4 * i + 1];
    float facing = dot(-dirOuter.xyz, normal);
    if (facing <= -0.05) continue;${ownCar ? OWN_CAR_TEST : ''}
    vec4 posRange = carSpot_spots[4 * i];
    vec3 fromLight = point - posRange.xyz;
    float ahead = dot(fromLight.xz, dirOuter.xz);
    if (ahead <= 0.0) continue;
    float d = length(fromLight);
    if (d <= 0.0 || d >= posRange.w) continue;
    float rho = dot(dirOuter.xyz, fromLight / d);
    if (rho < dirOuter.w) continue;
    // Ours: only a surface that faces the lamp takes it (the top of a wing above a tail lamp does not).
    float toLamp = dot(normal, -fromLight / d);
    if (toLamp <= 0.0) continue;
    vec4 attenInner = carSpot_spots[4 * i + 2];
    vec4 rgbFalloff = carSpot_spots[4 * i + 3];
    float coeff = rho < attenInner.w ? pow(clamp((rho - dirOuter.w) / (attenInner.w - dirOuter.w), 0.0, 1.0), abs(rgbFalloff.w)) : 1.0;
    // Ours: a tail spot (negative falloff) by the angle of incidence too, so its glow gathers under the lamps and fades along the
    // road, where the game's term lights the whole cone evenly out to the range.
    sum += rgbFalloff.rgb * clamp(coeff / (attenInner.x + d * (attenInner.y + d * attenInner.z)), 0.0, 1.0)
      * (1.0 - d / posRange.w) * smoothstep(-0.05, 0.2, facing) * (rgbFalloff.w < 0.0 ? toLamp : 1.0)
      * smoothstep(0.0, ${AHEAD_FADE_M.toFixed(1)}, ahead);
  }
  return sum * (${glslNumber(GAME_LIGHT_UNIT)} * surface_emission * carSpot_shown);
}`;
}

/** The beams at the fragment's world point and normal (`lampPoint`, `lampNormal` where the lamp light is added). */
export const CAR_SPOT_TERM = 'carSpotLight(lampPoint,lampNormal)';
