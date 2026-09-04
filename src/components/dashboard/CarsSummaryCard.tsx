import React from 'react';
import { Award, ChevronDown } from 'lucide-react';
import { RankBadge } from '../common';

export interface CarsSummaryCardProps {
  rankedCars: { car: string; laps: number }[];
  visibleCars: { car: string; laps: number }[];
  showMoreCars: boolean;
  setShowMoreCars: (val: boolean | ((prev: boolean) => boolean)) => void;
  onSelectCar: (car: string) => void;
}

export const CarsSummaryCard: React.FC<CarsSummaryCardProps> = ({
  rankedCars,
  visibleCars,
  showMoreCars,
  setShowMoreCars,
  onSelectCar,
}) => {
  return (
    <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
        <p className="text-xs font-bold text-lmu-cyan uppercase tracking-wider flex items-center gap-1.5">
          <Award className="w-4 h-4 text-lmu-cyan" />
          <span>Cars {rankedCars.length > 3 && `(${visibleCars.length}/${rankedCars.length})`}</span>
        </p>
        {rankedCars.length > 3 && (
          <button
            type="button"
            onClick={() => setShowMoreCars(!showMoreCars)}
            className="text-[10px] text-lmu-cyan hover:text-white font-semibold transition-colors flex items-center gap-0.5"
          >
            <span>{showMoreCars ? 'Show Less' : `+${rankedCars.length - 3} More`}</span>
            <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreCars ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className={`space-y-1.5 flex-1 ${showMoreCars ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
        {visibleCars.length > 0 ? (
          visibleCars.map((item, idx) => (
            <div
              key={item.car}
              onClick={() => onSelectCar(item.car.split(' ')[0] || item.car)}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={`Filter by ${item.car}`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={idx + 1} firstPlaceColor="text-lmu-cyan" />
                <span className="text-white font-medium truncate max-w-[130px] group-hover:text-lmu-cyan transition-colors">
                  {item.car}
                </span>
              </div>
              <span className="text-lmu-muted font-mono shrink-0 text-[11px]">{item.laps} laps</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-lmu-muted">No car data</p>
        )}
      </div>

      {rankedCars.length > 3 && (
        <button
          type="button"
          onClick={() => setShowMoreCars(!showMoreCars)}
          className="w-full text-center text-[10px] text-lmu-muted hover:text-lmu-cyan font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
        >
          <span>{showMoreCars ? 'Show Top 3 Only' : `Show All ${rankedCars.length} Cars`}</span>
          <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreCars ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};
