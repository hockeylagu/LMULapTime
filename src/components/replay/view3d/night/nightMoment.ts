/**
 * One replay moment's night facts, from the package's night model (`sky.night`) and the layout's night scenes (`night.scenes`): the
 * sun and the moon where the replay's own scene is, the night light (nightLight.ts), which body lights the scene, the light level that
 * switches the track lights and the weight of the night sky dome. The scene's place and date stand in for the layout's daylight ones:
 * a venue's night replays can run on another scene than the one the daylight was taken from (Algarve's WEC scene).
 */
import type { SceneryNight, SceneryNightScene, ScenerySkyNight } from '../../../../../shared/packageContract/index.js';
import type { SceneryDaylight } from '../../../../../shared/types/scenes/scenery.js';
import { lightLevel, nightLight, sunDirectShare, trackLightsOn, type NightLight } from './nightLight.js';
import { skyBodies, type SkyBodies, type SkyPlace } from './skyBodies.js';

/**
 * The track lights' threshold where the scene's GDB sets none. The game's default is not traced; this is ours: Qatar's 0.525, the
 * one threshold a GDB sets, which also has Bahrain's lights on with the sun 2.9° up (level 0.44) as the captures show.
 */
export const UNTRACED_NIGHT_LIGHT_THRESHOLD = 0.525;

/** Where the sun and the moon are worked out: the replay's night scene, else the layout's daylight place and date. */
export interface NightPlace extends SkyPlace { date: string; threshold: number }

/** The replay's night scene by its `sceneDesc` (the clock's `scene`); a layout of one scene has no choice to make. */
export function nightScene(night: SceneryNight, scene: string | undefined): SceneryNightScene | undefined {
  return night.scenes.find(entry => entry.sceneDesc === scene) ?? (night.scenes.length === 1 ? night.scenes[0] : undefined);
}

export function nightPlace(night: SceneryNight, daylight: SceneryDaylight, scene: string | undefined): NightPlace {
  const found = nightScene(night, scene);
  if (!found) return {latitudeDeg: daylight.latitudeDeg, longitudeDeg: daylight.longitudeDeg, utcOffsetHours: daylight.utcOffsetHours, date: daylight.date,
    threshold: UNTRACED_NIGHT_LIGHT_THRESHOLD};
  return {latitudeDeg: found.latitudeDeg, longitudeDeg: found.longitudeDeg, utcOffsetHours: found.utcOffsetHours, date: found.date,
    threshold: found.nightLightThreshold ?? UNTRACED_NIGHT_LIGHT_THRESHOLD};
}

export interface NightMoment {
  bodies: SkyBodies;
  light: NightLight;
  /** The sun's direct share (0 at 1° below the horizon): the moon lights the scene once it is 0. */
  sunShare: number;
  /** The game's light level and whether it switches the track lights on. */
  level: number; lightsOn: boolean;
  /** Whether the ambient is under the package's night level: the game's night switch (night-only nodes and emission). */
  night: boolean;
  /** The ambient's red over the night level, saturated: the game's day blend of screens. */
  dayShare: number;
  /**
   * How much of the sky dome is the night (Perez) branch: 0 above `dome.perezWeightZeroAboveDeg` of sun, 1 below
   * `dome.perezWeightOneBelowDeg`. The endpoints are the package's; the shape between them is not traced: ours is linear.
   */
  domeWeight: number;
}

/** The dome's night weight at a refracted sun elevation (linear between the package's endpoints: our shape). */
export function domeWeight(model: ScenerySkyNight, sunElevationDeg: number): number {
  const {perezWeightZeroAboveDeg: zero, perezWeightOneBelowDeg: one} = model.dome;
  return Math.min(1, Math.max(0, (zero - sunElevationDeg) / (zero - one)));
}

/**
 * The night facts at a local clock second of the place's date. `xyzToRgb` is the sky's; `nightLevel` the package's
 * `shading.ambient.nightLevel`.
 */
export function nightMoment(model: ScenerySkyNight, xyzToRgb: Parameters<typeof nightLight>[1], place: NightPlace, localSeconds: number, nightLevel: number): NightMoment {
  const bodies = skyBodies(place, place.date, localSeconds), light = nightLight(model, xyzToRgb, bodies);
  const level = lightLevel(model, localSeconds, second => skyBodies(place, place.date, second).sun.elevationDeg);
  return {
    bodies, light, sunShare: sunDirectShare(model, bodies.sun.elevationDeg), level, lightsOn: trackLightsOn(place.threshold, level),
    night: light.ambient[0] < nightLevel, dayShare: Math.min(1, Math.max(0, light.ambient[0] / nightLevel)), domeWeight: domeWeight(model, bodies.sun.elevationDeg),
  };
}
