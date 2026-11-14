import type { SurfaceConfig } from '../scenery/materials/surfaceConfig.js';

/**
 * The day share of the scene's light, 0 (night) to 1 (day): the reference's ambient level over 2.35, saturated. A screen glows
 * between its night and day strengths by it, and a surface that glows at night only (`flags.emissive` 'night') glows while it is
 * under 1. Day until the scene sets its ambient level.
 */
export const sceneDayLight = { value: 1 };

/** Whether a surface's glow follows the day share: a screen, or a surface lit at night only. */
export const readsDayLight = (config: Pick<SurfaceConfig, 'kind' | 'flags'>): boolean =>
  config.kind === 'dashboard' || config.kind === 'externalMonitor' || config.flags.emissive === 'night';

/** A screen's strength at a day share: its night strength in the dark, its day strength in full day. */
export const screenStrength = (night: number, day: number, dayLight: number): number => night + (day - night) * dayLight;
