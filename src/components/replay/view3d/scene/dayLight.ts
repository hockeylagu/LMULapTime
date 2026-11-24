import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import type { SurfaceConfig } from '../scenery/materials/surfaceConfig.js';

/**
 * The day share of the scene's light, 0 (night) to 1 (day): the scene's ambient level over the package's night level, saturated
 * (dayShare). A screen glows between its night and day strengths by it, and a surface that glows at night only (`flags.emissive`
 * 'night') glows while it is under 1. Day until the scene sets it.
 */
export const sceneDayLight = { value: 1 };

/**
 * The day share under a sun of green radiance `sunGreen` (the package's light unit, before GAME_LIGHT_UNIT): the ambient's red is the sun's
 * green × `perSunGreen[0]`. The package fits that share for a sun above `fit.minSunElevationDeg` and light cloud; lower, the sun's
 * green still falls toward zero and the share with it.
 */
export const dayShare = (ambient: SceneryShading['ambient'], sunGreen: number): number =>
  Math.min(1, Math.max(0, ambient.perSunGreen[0] * sunGreen / ambient.nightLevel));

/** Whether a surface's glow follows the day share: a screen, or a surface lit at night only. */
export const readsDayLight = (config: Pick<SurfaceConfig, 'kind' | 'flags'>): boolean =>
  config.kind === 'dashboard' || config.kind === 'externalMonitor' || config.flags.emissive === 'night';

/** A screen's strength at a day share: its night strength in the dark, its day strength in full day. */
export const screenStrength = (night: number, day: number, dayLight: number): number => night + (day - night) * dayLight;
