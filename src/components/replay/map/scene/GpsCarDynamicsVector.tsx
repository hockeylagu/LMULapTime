import React from 'react';

export interface GpsCarDynamicsVectorProps {
  accelLatG?: number;
  accelLonG?: number;
  unitsPerMeter: number;
  markerScale: number;
  opacity?: number;
  colorOverride?: string;
}

export const GpsCarDynamicsVector: React.FC<GpsCarDynamicsVectorProps> = ({
  accelLatG = 0,
  accelLonG = 0,
  unitsPerMeter,
  markerScale,
  opacity = 0.95,
  colorOverride,
}) => {
  const totalG = Math.hypot(accelLatG, accelLonG);
  if (totalG < 0.12 || !Number.isFinite(totalG) || unitsPerMeter <= 0) return null;

  // 1G maps to ~1.6 meters in world space
  const pixelsPerG = unitsPerMeter * 1.6;
  // In the car's SVG display frame, -screenY is forward, +screenY is rearward,
  // -screenX is left and +screenX is right. These are not ISO vehicle axes.
  // Inertial load transfer (where the weight goes):
  // In telemetry, turning right has accelLatG < 0, transferring load to outside left tires (-X).
  // Turning left has accelLatG > 0, transferring load to outside right tires (+X).
  // Braking (accelLonG < 0) transfers load forward to front tires (-Y).
  // Drive / acceleration (accelLonG > 0) squats rearward to rear tires (+Y).
  const tipX = accelLatG * pixelsPerG;
  const tipY = accelLonG * pixelsPerG;
  const length = Math.hypot(tipX, tipY);
  if (length < 2 * markerScale) return null;

  const color = colorOverride ?? (totalG >= 2.2 ? '#f87171' : totalG >= 1.4 ? '#fbbf24' : '#38bdf8');
  const uX = tipX / length;
  const uY = tipY / length;
  const arrowSize = Math.max(3.5 * markerScale, Math.min(8 * markerScale, length * 0.4));

  // Arrowhead polygon vertices
  const p1X = tipX;
  const p1Y = tipY;
  const p2X = tipX - uX * arrowSize - uY * (arrowSize * 0.45);
  const p2Y = tipY - uY * arrowSize + uX * (arrowSize * 0.45);
  const p3X = tipX - uX * arrowSize + uY * (arrowSize * 0.45);
  const p3Y = tipY - uY * arrowSize - uX * (arrowSize * 0.45);

  // Shaft connects to base of arrowhead so rounded linecap doesn't poke through tip
  const shaftEndDist = Math.max(0, length - arrowSize * 0.6);
  const shaftEndX = uX * shaftEndDist;
  const shaftEndY = uY * shaftEndDist;

  const tooltip = `Load transfer (opposite acceleration): ${totalG.toFixed(2)}G (${accelLatG >= 0 ? '+' : ''}${accelLatG.toFixed(2)}G Lat, ${accelLonG >= 0 ? '+' : ''}${accelLonG.toFixed(2)}G Lon)`;

  return (
    <g
      data-testid="gps-car-dynamics-vector"
      className="pointer-events-none select-none"
      opacity={opacity}
    >
      <title>{tooltip}</title>
      <line
        x1={0}
        y1={0}
        x2={shaftEndX}
        y2={shaftEndY}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`${p1X},${p1Y} ${p2X},${p2Y} ${p3X},${p3Y}`}
        fill={color}
        stroke={color}
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
};
