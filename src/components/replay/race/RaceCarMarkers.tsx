import React, { type ReactNode } from 'react';
import type { RaceReplayCar } from '../../../../shared/types/index.js';
import { defaultVehicleSize } from '../../../../shared/domain/vehicleDimensions.js';
import { raceClassTone } from './raceClassTone.js';

/** The tooltip's box in screen pixels. */
const TOOLTIP_WIDTH = 240;
const TOOLTIP_HEIGHT = 96;

export interface RaceCarPosition {
  slot: number;
  sx: number;
  sy: number;
  /** Body heading on the map, degrees clockwise from up. */
  headingDeg: number;
  /** In the pits or out of the race: drawn faded, as its standings row. */
  dimmed?: boolean;
}

interface Props {
  viewBox: string;
  positions: RaceCarPosition[];
  cars: Map<number, RaceReplayCar>;
  followSlot: number | null;
  unitsPerMeter: number;
  markerScale: number;
  /** The car under the pointer here or in the standings: ringed, drawn on top, with `tooltip` beside it. */
  hoverSlot: number | null;
  tooltip?: ReactNode;
  onHover: (slot: number | null) => void;
  onFollow: (slot: number) => void;
}

/**
 * Every car on the race map, in its class colour: a class-sized body once it is big enough to
 * read, a dot below that. The followed car is drawn last in white with a class-coloured edge; zoomed out, it and the hovered
 * car are ringed (zoomed in, the bodies speak for themselves). Clicking a car follows it.
 * The tooltip sits above every car; it keeps its screen size at any zoom.
 */
export const RaceCarMarkers: React.FC<Props> = ({ viewBox, positions, cars, followSlot, unitsPerMeter, markerScale, hoverSlot, tooltip, onHover, onFollow }) => {
  const rank = (slot: number) => (slot === hoverSlot ? 2 : slot === followSlot ? 1 : 0);
  const ordered = [...positions].sort((a, b) => rank(a.slot) - rank(b.slot));
  const hovered = positions.find(position => position.slot === hoverSlot);
  return (
    <svg viewBox={viewBox} className="absolute inset-0 w-full h-full pointer-events-none" data-testid="race-car-markers">
      {ordered.map(({ slot, sx, sy, headingDeg, dimmed }) => {
        const car = cars.get(slot);
        const tone = raceClassTone(car?.carClass);
        const size = defaultVehicleSize(car?.carClass);
        const width = size.widthM * unitsPerMeter;
        const length = size.lengthM * unitsPerMeter;
        const followed = slot === followSlot;
        // Zoomed in enough to read a car's shape.
        const body = length >= 10 * markerScale;
        return (
          <g key={slot} transform={`translate(${sx}, ${sy})`} data-race-car={slot} opacity={dimmed && !followed && slot !== hoverSlot ? 0.4 : undefined}
            className="pointer-events-auto cursor-pointer"
            aria-label={carLabel(car, slot)}
            onPointerEnter={() => onHover(slot)} onPointerLeave={() => onHover(null)}
            onPointerDown={(event) => { event.stopPropagation(); onFollow(slot); }}>
            <circle r={10 * markerScale} fill="transparent" />
            {!body && slot === hoverSlot && !followed && <circle r={12 * markerScale} fill="none" className="stroke-lmu-text-soft" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            {!body && followed && <circle r={14 * markerScale} fill="none" className="stroke-lmu-text" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
            {body ? (
              <g transform={`rotate(${headingDeg})`}>
                <rect x={-width / 2} y={-length / 2} width={width} height={length} rx={width * 0.18}
                  className={`${followed ? 'fill-lmu-text' : tone.fill} ${tone.stroke}`} fillOpacity={followed ? 1 : 0.85}
                  strokeWidth={followed ? 2 : 1} vectorEffect="non-scaling-stroke" />
                <path d={`M ${-width * 0.28} ${-length * 0.2} H ${width * 0.28} L ${width * 0.22} ${-length * 0.05} H ${-width * 0.22} Z`}
                  className={followed ? 'fill-lmu-bg' : 'fill-lmu-text'} fillOpacity={0.7} />
              </g>
            ) : (
              <circle r={(followed ? 6 : 4.5) * markerScale} className={`${followed ? `fill-lmu-text ${tone.stroke}` : `${tone.fill} stroke-lmu-bg`}`}
                strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        );
      })}
      {hovered && tooltip && (
        <foreignObject x={hovered.sx + 14 * markerScale} y={hovered.sy - 14 * markerScale} width={TOOLTIP_WIDTH * markerScale} height={TOOLTIP_HEIGHT * markerScale}
          className="pointer-events-none overflow-visible">
          <div style={{ width: TOOLTIP_WIDTH, transform: `scale(${markerScale})`, transformOrigin: '0 0' }}>{tooltip}</div>
        </foreignObject>
      )}
    </svg>
  );
};

function carLabel(car: RaceReplayCar | undefined, slot: number): string {
  return `${car?.carNumber ? `#${car.carNumber} ` : ''}${car?.name ?? `Car ${slot}`}`;
}
