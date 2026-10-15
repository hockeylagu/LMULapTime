import { MAP_COLORS, SECTOR_COLORS } from '../../../../utils/themeColors.js';
import { placeMarkerNear } from './markerPlacement.js';
import type { MarkerObstacle, RibbonIndex } from './cornerRibbonClearance.js';
import { MarkerGuide } from './MarkerGuide.js';

type Point = { sx: number; sy: number };
export type SectorMapMarker = { key: 's1' | 's2' } & ({ left: Point; right: Point; point?: never }
  | { point: Point; left?: never; right?: never });

/** Move only the sector badges; braking boards retain their canonical positions. */
export function placeSectorMarkers(markers: SectorMapMarker[], markerScale: number, zoomLevel: number,
  obstacles: readonly MarkerObstacle[] = [], ribbon?: RibbonIndex) {
  const gap = 18 + 12 / (1 + Math.max(0, zoomLevel));
  const occupied = [...obstacles];
  return markers.map(marker => {
    const point = marker.point ?? marker.right;
    const dx = marker.left ? marker.right.sx - marker.left.sx : 0;
    const dy = marker.left ? marker.right.sy - marker.left.sy : -1;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length, ny = dy / length;
    // Include the badge's extent along the gate normal, so its nearest edge clears the ribbon.
    const edge = 13 * Math.abs(nx) + 9 * Math.abs(ny);
    const box = placeMarkerNear({ anchor: point, direction: { sx: nx, sy: ny }, distance: (edge + gap) * markerScale },
      13.5 * markerScale, 9.5 * markerScale, 8 * markerScale, occupied, ribbon);
    const { x, y, hw, hh } = box;
    const distance = Math.hypot(x - point.sx, y - point.sy) || 1;
    // The badge may have turned off the gate normal when that side was crowded; tether along its actual side.
    const ux = (x - point.sx) / distance, uy = (y - point.sy) / distance;
    const reach = Math.max(0, distance - (13 * Math.abs(ux) + 9 * Math.abs(uy)) * markerScale);
    occupied.push(box);
    return { ...marker, x, y, hw, hh, connectorX: point.sx + ux * reach, connectorY: point.sy + uy * reach };
  });
}

/** Canonical road gates when available; otherwise a point at the replay's recorded sector crossing. */
export function GpsSectorMarkers({ markers, markerScale, obstacles = [] }: {
  markers: ReturnType<typeof placeSectorMarkers>; markerScale: number; obstacles?: readonly MarkerObstacle[];
}) {
  return <g aria-label="Sector timing markers" className="pointer-events-none select-none">
    {markers.map(marker => {
      const color = SECTOR_COLORS[marker.key];
      const point = marker.point ?? marker.right;
      return <g key={marker.key} data-testid={`map-sector-${marker.key}`}>
        <title>{marker.key.toUpperCase()} end</title>
        {marker.left && <line x1={marker.left.sx} y1={marker.left.sy} x2={marker.right.sx} y2={marker.right.sy}
          stroke={color} strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {marker.point && <circle cx={point.sx} cy={point.sy} r={3 * markerScale} fill={color} />}
        <MarkerGuide from={point} to={{ sx: marker.connectorX, sy: marker.connectorY }}
          badgeCenter={{ sx: marker.x, sy: marker.y }} obstacles={obstacles}
          stroke={color} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <g transform={`translate(${marker.x}, ${marker.y}) scale(${markerScale})`}>
          <rect x="-13" y="-9" width="26" height="18" rx="3" fill={MAP_COLORS.markerBg} stroke={color} />
          <text textAnchor="middle" dominantBaseline="central" fill={color} fontSize="10" fontFamily="Consolas, monospace" fontWeight="bold">
            {marker.key.toUpperCase()}
          </text>
        </g>
      </g>;
    })}
  </g>;
}
