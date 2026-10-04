import React from 'react';

interface Props { markerScale: number; spanM: number; }

export const MapScaleBar: React.FC<Props> = ({ markerScale, spanM }) => {
  const metersPerPixel = spanM / 680 * markerScale;
  if (!(metersPerPixel > 0)) return null;
  const target = metersPerPixel * 80;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const meters = [1, 2, 5, 10].map(n => n * magnitude).reduce((last, n) => n <= target ? n : last, magnitude);
  return <div className="absolute bottom-10 left-3 pointer-events-none text-lmu-text-soft text-[10px] font-mono select-none">
    <div className="border-x border-b border-lmu-muted h-1.5" style={{ width: meters / metersPerPixel }} />
    <span>{meters >= 1000 ? `${meters / 1000} km` : `${meters} m`}</span>
  </div>;
};
