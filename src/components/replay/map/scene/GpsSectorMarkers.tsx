import { MAP_COLORS, SECTOR_COLORS } from '../../../../utils/themeColors.js';

type Point = { sx: number; sy: number };
export type SectorMapMarker = { key: 's1' | 's2' } & ({ left: Point; right: Point; point?: never }
  | { point: Point; left?: never; right?: never });

/** Move only the sector badges; braking boards retain their canonical positions. */
export function placeSectorMarkers(markers: SectorMapMarker[], markerScale: number, zoomLevel: number,
  obstacles: ReadonlyArray<{ x: number; y: number; hw: number; hh: number }> = []) {
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
    const hw = 13 * markerScale, hh = 9 * markerScale;
    let distance = (edge + gap) * markerScale;
    let x = point.sx + nx * distance, y = point.sy + ny * distance;
    // Each step clears one obstacle along the outward ray, so it cannot collide with that box again.
    for (let attempt = 0; attempt < occupied.length; attempt++) {
      const hit = occupied.find(box => Math.abs(x - box.x) < hw + box.hw + 6 * markerScale
        && Math.abs(y - box.y) < hh + box.hh + 6 * markerScale);
      if (!hit) break;
      distance = Math.max(distance, (hit.x - point.sx) * nx + (hit.y - point.sy) * ny
        + (hw + hit.hw) * Math.abs(nx) + (hh + hit.hh) * Math.abs(ny)
        + 7 * markerScale * (Math.abs(nx) + Math.abs(ny)));
      x = point.sx + nx * distance;
      y = point.sy + ny * distance;
    }
    occupied.push({ x, y, hw, hh });
    return { ...marker, x, y, hw, hh,
      connectorX: point.sx + nx * (distance - edge * markerScale), connectorY: point.sy + ny * (distance - edge * markerScale) };
  });
}

/** Canonical road gates when available; otherwise a point at the replay's recorded sector crossing. */
export function GpsSectorMarkers({ markers, markerScale }: { markers: ReturnType<typeof placeSectorMarkers>; markerScale: number }) {
  return <g aria-label="Sector timing markers" className="pointer-events-none select-none">
    {markers.map(marker => {
      const color = SECTOR_COLORS[marker.key];
      const point = marker.point ?? marker.right;
      return <g key={marker.key} data-testid={`map-sector-${marker.key}`}>
        <title>{marker.key.toUpperCase()} end</title>
        {marker.left && <line x1={marker.left.sx} y1={marker.left.sy} x2={marker.right.sx} y2={marker.right.sy}
          stroke={color} strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        {marker.point && <circle cx={point.sx} cy={point.sy} r={3 * markerScale} fill={color} />}
        <line x1={point.sx} y1={point.sy} x2={marker.connectorX} y2={marker.connectorY}
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
