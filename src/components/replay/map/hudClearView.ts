/** A map view as `useGpsMapPanZoom` holds it: its zoom and the offset of its centre from the view box's centre. */
export interface MapView {
  zoom: number;
  x: number;
  y: number;
}

/** A box in view box units (`min`, `max`) or pixels. */
interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The view that shows `track` (its extent in view box units) whole and as large as it fits, clear of the HUD in the map's top right
 * corner: beside it or under it, whichever leaves the track larger, `marginPx` from every edge. `size` is the map's drawn area in
 * pixels, `hud` the HUD's left edge and bottom in those pixels. The square view box is drawn to fit (SVG `meet`): its shorter
 * side spans the area's shorter side, and the view box's centre sits at the area's centre. Null while the area has no size.
 */
export function hudClearView(
  size: {width: number; height: number}, hud: {left: number; bottom: number}, track: Box,
  viewBoxSize: number, baseZoom: number, marginPx: number,
): MapView | null {
  const {width, height} = size;
  if (width <= 0 || height <= 0) return null;
  const trackWidth = Math.max(track.maxX - track.minX, 1), trackHeight = Math.max(track.maxY - track.minY, 1);
  const beside: Box = {minX: marginPx, minY: marginPx, maxX: hud.left - marginPx, maxY: height - marginPx};
  const under: Box = {minX: marginPx, minY: hud.bottom + marginPx, maxX: width - marginPx, maxY: height - marginPx};
  // Pixels per view box unit that fit the track in a free box.
  const fit = (free: Box) => Math.min((free.maxX - free.minX) / trackWidth, (free.maxY - free.minY) / trackHeight);
  const free = fit(beside) >= fit(under) ? beside : under, scale = fit(free);
  if (!(scale > 0)) return null;
  // The visible square's side is the area's shorter side at that scale.
  const zoom = viewBoxSize / ((Math.min(width, height) / scale) * baseZoom);
  // The track's centre lands on the free box's centre; the area's centre shows the view's centre.
  const centreX = (track.minX + track.maxX) / 2 - ((free.minX + free.maxX) / 2 - width / 2) / scale;
  const centreY = (track.minY + track.maxY) / 2 - ((free.minY + free.maxY) / 2 - height / 2) / scale;
  return {zoom, x: centreX - viewBoxSize / 2, y: centreY - viewBoxSize / 2};
}
