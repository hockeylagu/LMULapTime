/**
 * How densely the replay inspector asks for a lap. 'standard' and 'high' are a fixed spacing
 * along the lap, so every track gets the same density (a fixed point count spread Le Mans' 13.6 km
 * three times thinner than Bahrain); 'full' is every recorded sample.
 *
 * At 2 m the pedal points of the four reference lap pairs match full resolution within 5 m (0-1 m
 * on three of them), corner deltas within 2 ms (tools/analysis/measureLapDensity.ts). Scrubbing
 * and panning cost the same at any density.
 */
export type TelemetryResolution = 'standard' | 'high' | 'full';

export const DEFAULT_TELEMETRY_RESOLUTION: TelemetryResolution = 'high';

/** Metres between points for the spaced resolutions. */
export const TELEMETRY_POINT_SPACING_M: Record<Exclude<TelemetryResolution, 'full'>, number> = {
  standard: 4,
  high: 2,
};

/** The `/trajectory` query parameter for a resolution. */
export function trajectoryResolutionQuery(resolution: TelemetryResolution): string {
  return resolution === 'full' ? 'maxPoints=0' : `pointSpacingM=${TELEMETRY_POINT_SPACING_M[resolution]}`;
}
