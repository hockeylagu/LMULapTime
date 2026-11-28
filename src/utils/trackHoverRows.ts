import { MAP_COLORS } from './themeColors.js';

/** A tooltip row's text and colour. */
export interface HoverText {
  text: string;
  colour: string;
  bold: boolean;
}

/** What the racing line's hover tooltip says at a sample (the 2D map's and the 3D view's): speed, delta, pedals, distance. */
export interface TrackHoverRows {
  speed: string;
  delta: HoverText | null;
  pedal: HoverText;
  distance: string | null;
}

/** The hovered sample's rows, the same in the 2D and the 3D tooltip. */
export function trackHoverRows(
  point: {speedKmh?: number; throttle?: number; brake?: number}, deltaTimeSec?: number | null, distM?: number,
): TrackHoverRows {
  const throttle = Math.round(point.throttle ?? 0), brake = Math.round(point.brake ?? 0);
  const delta = deltaTimeSec === null || deltaTimeSec === undefined ? null : {
    text: `${deltaTimeSec > 0 ? '+' : ''}${deltaTimeSec.toFixed(2)}s`, bold: true,
    colour: deltaTimeSec < -0.01 ? MAP_COLORS.gripLimit : deltaTimeSec > 0.01 ? MAP_COLORS.baselineBrake : MAP_COLORS.markerMuted,
  };
  const pedal = brake > 5 ? {text: `BRK ${brake}%`, colour: MAP_COLORS.baselineBrake, bold: true}
    : throttle > 5 ? {text: `THR ${throttle}%`, colour: MAP_COLORS.gripLimit, bold: true}
      : {text: 'COAST', colour: MAP_COLORS.markerDimmed, bold: false};
  return {speed: `${Math.round(point.speedKmh ?? 0)} km/h`, delta, pedal, distance: distM === undefined ? null : `${Math.round(distM)}m`};
}
