import React from 'react';

export interface GpsSceneHudOverlayProps {
  hasGhost: boolean;
  isStationary: boolean;
  currentPos?: {
    speedKmh?: number;
    throttle?: number;
    brake?: number;
  } | null;
}

export const GpsSceneHudOverlay: React.FC<GpsSceneHudOverlayProps> = ({
  hasGhost,
  isStationary,
  currentPos,
}) => {
  return (
    <>
      {hasGhost && !isStationary && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-[#0a0e17]/90 backdrop-blur border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono shadow-lg pointer-events-none">
          <div className="flex items-center gap-1 text-sky-400">
            <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] shadow-[0_0_6px_#38bdf8]" />
            <span className="font-bold">Primary</span>
          </div>
          <span className="text-white/30">|</span>
          <div className="flex items-center gap-1 text-amber-400">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]" />
            <span className="font-bold">Ghost Lap</span>
          </div>
        </div>
      )}

      {isStationary && (
        <div className="absolute top-2 left-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur">
          <span>🅿️ Car Parked in Pit / Garage</span>
        </div>
      )}

      {currentPos && (
        <div className="absolute bottom-2 right-2 z-20 flex items-center gap-3 bg-[#0a0e17]/90 backdrop-blur border border-white/10 px-3 py-1 rounded-lg text-xs font-mono shadow-lg pointer-events-none">
          <div>
            <span className="text-lmu-muted text-[10px]">SPEED: </span>
            <span className="font-bold text-sky-400">{Math.round(currentPos.speedKmh || 0)} km/h</span>
          </div>
          <div>
            <span className="text-lmu-muted text-[10px]">THR: </span>
            <span className="font-bold text-emerald-400">{Math.round(currentPos.throttle || 0)}%</span>
          </div>
          <div>
            <span className="text-lmu-muted text-[10px]">BRK: </span>
            <span className="font-bold text-rose-400">{Math.round(currentPos.brake || 0)}%</span>
          </div>
        </div>
      )}
    </>
  );
};
