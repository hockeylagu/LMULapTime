import { useMemo } from 'react';
import {
  projectTrajectoryPoints, projectBoundaryPoints, computeTrackBoundaryPathD, buildContinuousSvgPath,
  computeEffectiveBounds, projectStartFinishGate,
} from '../replayMapUtils.js';
import { useMapDisplay } from '../display/useMapDisplay.js';
import { activeTrackBounds } from '../display/mapLayers.js';
import { useTrackBoundaryGeometry } from '../useTrackBoundaryGeometry.js';
import type { GpsTrackMapProps } from '../gpsTrackMapTypes.js';
import type { SectorMapMarker } from './GpsSectorMarkers.js';

export const VIEWBOX_SIZE = 800;
export const PADDING = 60;

/** Supplied `trackGeometry` wins; `undefined` loads it from the local package for this layout. */
type Options = Pick<GpsTrackMapProps, 'points' | 'baselinePoints' | 'bounds' | 'trackGeometry' | 'mapDisplay'
  | 'layoutKey' | 'trackVenue' | 'trackCourse' | 'dataPluginRevision' | 'sectors'>;

/** Static scene geometry: the track package, the shared bounds and every lap/boundary projected into SVG space. */
export function useGpsSceneProjection({ points, baselinePoints, bounds, trackGeometry, mapDisplay,
  layoutKey, trackVenue, trackCourse, dataPluginRevision, sectors }: Options) {
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
  const sectorMarkers = useMemo(() => {
    const markers: SectorMapMarker[] = [];
    for (const key of ['s1', 's2'] as const) {
      const gate = geometry?.timingGates?.[key === 's1' ? 'sector1' : 'sector2'];
      if (gate && [...gate.left, ...gate.right].every(Number.isFinite)
        && (gate.left[0] !== gate.right[0] || gate.left[1] !== gate.right[1])) {
        const [left, right] = projectBoundaryPoints([gate.left, gate.right], effectiveBounds, VIEWBOX_SIZE, PADDING);
        markers.push({ key, left, right });
        continue;
      }
      const frame = sectors?.[key === 's1' ? 's1Frame' : 's2Frame'];
      if (frame === undefined || !Number.isInteger(frame) || frame <= 0 || frame >= svgPoints.length - 1) continue;
      const point = svgPoints[frame];
      if (Number.isFinite(point.sx) && Number.isFinite(point.sy)) markers.push({ key, point });
    }
    return markers;
  }, [geometry, effectiveBounds, sectors, svgPoints]);
  return {
    geometry, display, displayError, effectiveBaselinePoints, effectiveBounds, svgPoints, baselineSvgPoints,
    leftSvgPoints, rightSvgPoints, centerlineSvgPoints, trackBoundaryPathD, gateLeftSvg, gateRightSvg, pathD, sectorMarkers,
  };
}
