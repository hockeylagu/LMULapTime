import React from 'react';

export interface GpsSceneHudOverlayProps {
  isStationary: boolean;
}

export const GpsSceneHudOverlay: React.FC<GpsSceneHudOverlayProps> = ({
  isStationary,
}) => {
  return (
    <>

      {isStationary && (
        <div className="absolute top-2 left-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur">
          <span>🅿️ Car Parked in Pit / Garage</span>
        </div>
      )}
    </>
  );
};
