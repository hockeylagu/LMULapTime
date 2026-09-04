import React from 'react';
import { TrendingUp, TrendingDown, ShieldCheck } from 'lucide-react';
import { DriverData } from '../../../server/types.js';

export interface DriverRaceStandingsRowProps {
  selectedDriver: DriverData;
  isMultiClass: boolean;
}

export const DriverRaceStandingsRow: React.FC<DriverRaceStandingsRowProps> = ({
  selectedDriver,
  isMultiClass,
}) => {
  const displayPosDelta =
    isMultiClass && selectedDriver.classGridPosition && selectedDriver.classPosition
      ? selectedDriver.classGridPosition - selectedDriver.classPosition
      : selectedDriver.positionGain;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
      {/* Starting Grid */}
      <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
        <p className="text-[10px] uppercase font-semibold text-lmu-muted truncate">Starting Grid</p>
        <p className="text-base font-mono font-extrabold text-white mt-0.5 whitespace-nowrap">
          {isMultiClass && selectedDriver.classGridPosition ? (
            <>
              P{selectedDriver.classGridPosition}
              {selectedDriver.gridPosition && (
                <span className="text-[10px] font-normal text-lmu-muted ml-1" title="Overall Starting Grid">
                  (OA: P{selectedDriver.gridPosition})
                </span>
              )}
            </>
          ) : selectedDriver.gridPosition ? (
            `P${selectedDriver.gridPosition}`
          ) : (
            '-'
          )}
        </p>
      </div>

      {/* Finish Position */}
      <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
        <p className="text-[10px] uppercase font-semibold text-lmu-muted truncate">Finish Position</p>
        <p
          className={`text-base font-mono font-extrabold mt-0.5 whitespace-nowrap ${
            selectedDriver.classPosition === 1 || (!isMultiClass && selectedDriver.position === 1)
              ? 'text-lmu-gold'
              : 'text-white'
          }`}
        >
          {isMultiClass && selectedDriver.classPosition && selectedDriver.classPosition > 0 ? (
            <>
              P{selectedDriver.classPosition}
              {selectedDriver.position && (
                <span className="text-[10px] font-normal text-lmu-muted ml-1" title="Overall Finish Position">
                  (OA: P{selectedDriver.position})
                </span>
              )}
            </>
          ) : selectedDriver.position ? (
            `P${selectedDriver.position}`
          ) : (
            '-'
          )}
        </p>
      </div>

      {/* Position Delta */}
      <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
        <p className="text-[10px] uppercase font-semibold text-lmu-muted truncate">
          {isMultiClass ? 'Class Pos Delta' : 'Position Delta'}
        </p>
        <p
          className={`text-base font-mono font-extrabold mt-0.5 flex items-center justify-center gap-1 ${
            (displayPosDelta ?? 0) > 0
              ? 'text-lmu-green'
              : (displayPosDelta ?? 0) < 0
              ? 'text-rose-400'
              : 'text-white'
          }`}
        >
          {(displayPosDelta ?? 0) > 0 && <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />}
          {(displayPosDelta ?? 0) < 0 && <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />}
          <span>
            {displayPosDelta !== null && displayPosDelta !== undefined
              ? `${displayPosDelta > 0 ? '+' : ''}${displayPosDelta}`
              : '-'}
          </span>
          <span className="text-[10px] font-normal text-lmu-muted hidden xl:inline">
            {(displayPosDelta ?? 0) > 0 ? 'Gained' : (displayPosDelta ?? 0) < 0 ? 'Lost' : 'Net'}
          </span>
        </p>
      </div>

      {/* Laps Led */}
      <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
        <p className="text-[10px] uppercase font-semibold text-lmu-muted truncate">Laps Led (P1)</p>
        <p className="text-base font-mono font-extrabold text-lmu-gold mt-0.5">
          {selectedDriver.lapsLedCount ?? 0}
          <span className="text-[10px] font-normal text-lmu-muted ml-1">laps</span>
        </p>
      </div>

      {/* Peak Position */}
      <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
        <p className="text-[10px] uppercase font-semibold text-lmu-muted truncate">Peak Position</p>
        <p className="text-base font-mono font-extrabold text-lmu-cyan mt-0.5">
          {selectedDriver.highestPosition ? `P${selectedDriver.highestPosition}` : '-'}
        </p>
      </div>

      {/* Pit Stops */}
      <div className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center">
        <p className="text-[10px] uppercase font-semibold text-lmu-muted truncate">Pit Stops</p>
        <p className="text-base font-mono font-extrabold text-amber-300 mt-0.5">
          {selectedDriver.pitStopsCount ?? 0}
          <span className="text-[10px] font-normal text-lmu-muted ml-1">stops</span>
        </p>
      </div>

      {/* Incidents & Limits */}
      <div
        className="p-2 rounded-lg bg-lmu-bg/70 border border-lmu-border/50 text-center cursor-help"
        title={`Incidents: ${selectedDriver.totalIncidents ?? 0}\nTrack Limits: ${selectedDriver.totalTrackLimits ?? 0}\nPenalties: ${selectedDriver.totalPenalties ?? 0}`}
      >
        <p className="text-[10px] uppercase font-semibold text-lmu-muted truncate">Incidents & Limits</p>
        <p className="text-base font-mono font-extrabold mt-0.5">
          {(selectedDriver.totalIncidents ?? 0) === 0 && (selectedDriver.totalPenalties ?? 0) === 0 ? (
            <span className="text-emerald-400 text-sm flex items-center justify-center gap-1 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Clean</span>
            </span>
          ) : (
            <span className="text-rose-400 text-sm flex items-center justify-center gap-1 font-bold">
              <span>{selectedDriver.totalIncidents ?? 0}x</span>
              <span className="text-[10px] font-normal text-lmu-muted font-sans truncate">
                ({selectedDriver.totalTrackLimits ?? 0} TL
                {selectedDriver.totalPenalties ? `, ${selectedDriver.totalPenalties}P` : ''})
              </span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
};
