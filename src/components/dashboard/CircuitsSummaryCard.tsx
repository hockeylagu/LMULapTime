import React from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { RankBadge } from '../common';

export interface CircuitsSummaryCardProps {
  rankedTracks: { track: string; laps: number }[];
  visibleTracks: { track: string; laps: number }[];
  showMoreTracks: boolean;
  setShowMoreTracks: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const CircuitsSummaryCard: React.FC<CircuitsSummaryCardProps> = ({
  rankedTracks,
  visibleTracks,
  showMoreTracks,
  setShowMoreTracks,
}) => {
  return (
    <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
        <p className="text-xs font-bold text-lmu-gold uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-lmu-gold" />
          <span>Circuits {rankedTracks.length > 3 && `(${visibleTracks.length}/${rankedTracks.length})`}</span>
        </p>
        {rankedTracks.length > 3 && (
          <button
            type="button"
            onClick={() => setShowMoreTracks(!showMoreTracks)}
            className="text-[10px] text-lmu-accent hover:text-white font-semibold transition-colors flex items-center gap-0.5"
          >
            <span>{showMoreTracks ? 'Show Less' : `+${rankedTracks.length - 3} More`}</span>
            <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreTracks ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className={`space-y-1.5 flex-1 ${showMoreTracks ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
        {visibleTracks.length > 0 ? (
          visibleTracks.map((item, idx) => (
            <div
              key={item.track}
              onClick={() => {
                window.location.hash = `track/${encodeURIComponent(item.track)}`;
              }}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={`View ${item.track} Track Details`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={idx + 1} firstPlaceColor="text-lmu-gold" />
                <span className="text-white font-medium truncate group-hover:text-lmu-gold transition-colors">
                  {item.track}
                </span>
              </div>
              <span className="text-lmu-muted font-mono shrink-0 text-[11px]">{item.laps} laps</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-lmu-muted">No track data</p>
        )}
      </div>

      {rankedTracks.length > 3 && (
        <button
          type="button"
          onClick={() => setShowMoreTracks(!showMoreTracks)}
          className="w-full text-center text-[10px] text-lmu-muted hover:text-lmu-accent font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
        >
          <span>{showMoreTracks ? 'Show Top 3 Only' : `Show All ${rankedTracks.length} Circuits`}</span>
          <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreTracks ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};
