import { useMemo } from 'react';
import {
  projectTrajectoryPoints, projectBoundaryPoints, computeTrackBoundaryPathD, buildContinuousSvgPath,
  computeEffectiveBounds, projectStartFinishGate,
} from '../replayMapUtils.js';
import { useMapDisplay } from '../display/useMapDisplay.js';
import { activeTrackBounds } from '../display/mapLayers.js';
import { useTrackBoundaryGeometry } from '../useTrackBoundaryGeometry.js';
import type { GpsTrackMapProps } from '../gpsTrackMapTypes.js';

export const VIEWBOX_SIZE = 800;
export const PADDING = 60;

/** Supplied `trackGeometry` wins; `undefined` loads it from the local package for this layout. */
type Options = Pick<GpsTrackMapProps, 'points' | 'baselinePoints' | 'bounds' | 'trackGeometry' | 'mapDisplay'
  | 'layoutKey' | 'trackVenue' | 'trackCourse' | 'dataPluginRevision'>;

/** Static scene geometry: the track package, the shared bounds and every lap/boundary projected into SVG space. */
export function useGpsSceneProjection({ points, baselinePoints, bounds, trackGeometry, mapDisplay,
  layoutKey, trackVenue, trackCourse, dataPluginRevision }: Options) {
  const { trackGeometry: fetchedGeometry } = useTrackBoundaryGeometry({
    packageRevision: dataPluginRevision,
    layoutKey: trackGeometry === undefined ? layoutKey : null,
    trackVenue: trackGeometry === undefined ? trackVenue : null,
    trackCourse: trackGeometry === undefined ? trackCourse : null,
  });
  const geometry = trackGeometry !== undefined ? trackGeometry : fetchedGeometry;
  const { display, error: displayError } = useMapDisplay(geometry, mapDisplay);
  const activeBounds = useMemo(() => activeTrackBounds(geometry), [geometry]);
  const effectiveBaselinePoints = useMemo(() => baselinePoints ?? [], [baselinePoints]);
  const effectiveBounds = useMemo(
    () => computeEffectiveBounds(bounds, activeBounds, effectiveBaselinePoints),
    [bounds, activeBounds, effectiveBaselinePoints],
  );
  const svgPoints = useMemo(() => projectTrajectoryPoints(points, effectiveBounds, VIEWBOX_SIZE, PADDING), [points, effectiveBounds]);
  const baselineSvgPoints = useMemo(
    () => projectTrajectoryPoints(effectiveBaselinePoints, effectiveBounds, VIEWBOX_SIZE, PADDING),
    [effectiveBaselinePoints, effectiveBounds],
  );
  const { leftSvgPoints, rightSvgPoints, centerlineSvgPoints } = useMemo(() => ({
    leftSvgPoints: geometry?.leftBoundary ? projectBoundaryPoints(geometry.leftBoundary, effectiveBounds, VIEWBOX_SIZE, PADDING) : [],
    rightSvgPoints: geometry?.rightBoundary ? projectBoundaryPoints(geometry.rightBoundary, effectiveBounds, VIEWBOX_SIZE, PADDING) : [],
    centerlineSvgPoints: geometry?.centerline ? projectBoundaryPoints(geometry.centerline, effectiveBounds, VIEWBOX_SIZE, PADDING) : [],
  }), [geometry, effectiveBounds]);
  const trackBoundaryPathD = useMemo(
    () => computeTrackBoundaryPathD(centerlineSvgPoints, leftSvgPoints, rightSvgPoints),
    [centerlineSvgPoints, leftSvgPoints, rightSvgPoints],
  );
  const { gateLeftSvg, gateRightSvg } = useMemo(
    () => projectStartFinishGate(geometry, effectiveBounds, VIEWBOX_SIZE, PADDING),
    [geometry, effectiveBounds],
  );
  const pathD = useMemo(() => buildContinuousSvgPath(svgPoints), [svgPoints]);
  return {
    geometry, display, displayError, effectiveBaselinePoints, effectiveBounds, svgPoints, baselineSvgPoints,
    leftSvgPoints, rightSvgPoints, centerlineSvgPoints, trackBoundaryPathD, gateLeftSvg, gateRightSvg, pathD,
  };
}
