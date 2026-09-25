import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { MapPin, ChevronDown } from 'lucide-react';
import { RankBadge } from '../common';

export interface CircuitsSummaryCardProps {
  rankedTracks: { track: string; laps: number; km: number }[];
  visibleTracks?: { track: string; laps: number; km: number }[];
  showMoreTracks: boolean;
  setShowMoreTracks: (val: boolean | ((prev: boolean) => boolean)) => void;
  selectedCarClass?: string;
}

export const CircuitsSummaryCard: React.FC<CircuitsSummaryCardProps> = ({
  rankedTracks,
  visibleTracks,
  showMoreTracks,
  setShowMoreTracks,
  selectedCarClass = 'All',
}) => {
  const navigate = useNavigate();
  const [unit, setUnit] = useState<'laps' | 'km'>('laps');

  const sourceTracks = rankedTracks && rankedTracks.length > 0 ? rankedTracks : (visibleTracks || []);

  const sortedTracks = useMemo(() => {
    return [...sourceTracks].sort((a, b) => (unit === 'km' ? b.km - a.km : b.laps - a.laps));
  }, [sourceTracks, unit]);

  const displayTracks = showMoreTracks ? sortedTracks : sortedTracks.slice(0, 3);

  return (
    <div className="bg-lmu-card/75 backdrop-blur-md border border-white/[0.07] p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
        <p className="text-xs font-bold text-lmu-gold uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-lmu-gold" />
          <span>Circuits {sourceTracks.length > 3 && `(${displayTracks.length}/${sourceTracks.length})`}</span>
        </p>
        <div className="flex items-center gap-0.5 bg-lmu-card/60 rounded-full p-0.5 border border-lmu-border/50">
          <button
            type="button"
            onClick={() => setUnit('laps')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${unit === 'laps' ? 'bg-lmu-gold text-black' : 'text-lmu-muted hover:text-white'}`}
          >
            Laps
          </button>
          <button
            type="button"
            onClick={() => setUnit('km')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${unit === 'km' ? 'bg-lmu-gold text-black' : 'text-lmu-muted hover:text-white'}`}
          >
            Km
          </button>
        </div>
      </div>

      <div className={`space-y-1.5 flex-1 ${showMoreTracks ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
        {displayTracks.length > 0 ? (
          displayTracks.map((item, idx) => (
            <div
              key={item.track}
              onClick={() => {
                const suffix = selectedCarClass !== 'All' ? `?carClass=${encodeURIComponent(selectedCarClass)}` : '';
                navigate(`/track/${encodeURIComponent(item.track)}${suffix}`);
              }}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={`View ${item.track} Track Details`}
            >
              <div className="flex items-center gap-1.5 min-w-0 mr-2">
                <RankBadge rank={idx + 1} firstPlaceColor="text-lmu-gold" />
                <span className="text-white font-medium truncate group-hover:text-lmu-gold transition-colors" title={item.track}>
                  {item.track}
                </span>
              </div>
              <span className="text-lmu-muted font-mono shrink-0 text-[11px]">
                {unit === 'km' ? `${item.km.toFixed(0)} km` : `${item.laps} laps`}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-lmu-muted">No track data</p>
        )}
      </div>

      {sourceTracks.length > 3 && (
        <button
          type="button"
          onClick={() => setShowMoreTracks(!showMoreTracks)}
          className="w-full text-center text-[10px] text-lmu-muted hover:text-lmu-accent font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
        >
          <span>{showMoreTracks ? 'Show Top 3 Only' : `Show All ${sourceTracks.length} Circuits`}</span>
          <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreTracks ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};
