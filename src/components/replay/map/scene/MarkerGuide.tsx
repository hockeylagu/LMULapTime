import type { SVGProps } from 'react';
import type { MarkerObstacle } from './cornerRibbonClearance.js';
import { markerLineHitsBox, type MarkerPoint } from './markerPlacement.js';

interface Props extends Omit<SVGProps<SVGLineElement>, 'from' | 'to'> {
  from: MarkerPoint;
  to: MarkerPoint;
  obstacles: readonly MarkerObstacle[];
  badgeCenter: MarkerPoint;
}

/** Decorative guides yield to badges; their physical anchors and the badges themselves stay put. */
export function MarkerGuide({ from, to, obstacles, badgeCenter, ...lineProps }: Props) {
  if (obstacles.some(box => !(box.x === badgeCenter.sx && box.y === badgeCenter.sy)
    && markerLineHitsBox(from, to, box, 0))) return null;
  return <line {...lineProps} x1={from.sx} y1={from.sy} x2={to.sx} y2={to.sy} />;
}
