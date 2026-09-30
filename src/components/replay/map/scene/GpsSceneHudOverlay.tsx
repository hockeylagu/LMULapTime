import React from 'react';

export interface GpsSceneHudOverlayProps {
  isStationary: boolean;
  className?: string;
}

export const GpsSceneHudOverlay: React.FC<GpsSceneHudOverlayProps> = ({
  isStationary,
  className = '',
}) => {
  return (
    <>
      {isStationary && (
        <div
          data-testid="gps-scene-hud-overlay"
          className={`absolute bottom-2.5 right-2.5 z-20 bg-lmu-warn-strong/20 border border-lmu-warn-strong/40 text-lmu-warn-soft px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur select-none pointer-events-none ${className}`}
        >
          <span>🅿️ Car Parked in Pit / Garage</span>
        </div>
      )}
    </>
  );
};
