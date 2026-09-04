import React from 'react';
import { ArrowLeft, ArrowLeftRight, Car } from 'lucide-react';
import { VEHICLE_CLASS_OPTIONS } from '../../utils/paceCategory';

export interface TrackDetailHeaderProps {
  trackName: string;
  sessionsCount: number;
  onBack: () => void;
  selectedClass: string;
  setSelectedClass: (cls: string) => void;
  selectedCarModel: string;
  setSelectedCarModel: (model: string) => void;
  availableCarModels: string[];
}

export const TrackDetailHeader: React.FC<TrackDetailHeaderProps> = ({
  trackName,
  sessionsCount,
  onBack,
  selectedClass,
  setSelectedClass,
  selectedCarModel,
  setSelectedCarModel,
  availableCarModels,
}) => {
  return (
    <>
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-accent transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tracks
        </button>

        <button
          type="button"
          onClick={() => {
            const carClass = selectedClass !== 'All' ? selectedClass : 'LMGT3';
            window.location.hash = `compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(carClass)}`;
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-white hover:border-lmu-accent transition-all"
          title="Compare laps on this circuit"
        >
          <ArrowLeftRight className="w-4 h-4 text-lmu-gold" />
          Compare Laps on Circuit
        </button>
      </div>

      {/* Track Title Card */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30">
                Official Circuit
              </span>
              <span className="text-xs text-lmu-muted">{sessionsCount} Recorded Sessions</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white mt-1 truncate" title={trackName}>
              {trackName}
            </h2>
            <p className="text-xs text-lmu-muted mt-0.5">
              Benchmark Target Lap Times & Personal Telemetry per Vehicle Category
            </p>
          </div>

          {/* Vehicle Class Filter Buttons (Beside Circuit Title) */}
          <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold overflow-x-auto shrink-0">
            {VEHICLE_CLASS_OPTIONS.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => setSelectedClass(cls.id)}
                className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                  selectedClass === cls.id
                    ? 'bg-lmu-accent text-white shadow-md font-bold'
                    : 'text-lmu-muted hover:text-white'
                }`}
              >
                {cls.label}
              </button>
            ))}
          </div>
        </div>

        {/* Specific Car Model Sub-Filter Row */}
        {selectedClass !== 'All' && availableCarModels.length > 0 && (
          <div className="pt-3 border-t border-lmu-border/50 flex items-center gap-3 flex-wrap text-xs">
            <span className="text-xs font-semibold text-lmu-muted uppercase flex items-center gap-1.5 shrink-0">
              <Car className="w-3.5 h-3.5 text-lmu-accent" />
              Car Model:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedCarModel('All')}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  selectedCarModel === 'All'
                    ? 'bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/40 font-bold shadow-sm'
                    : 'bg-lmu-bg text-lmu-muted hover:text-white border border-lmu-border'
                }`}
              >
                All {selectedClass} Cars ({availableCarModels.length})
              </button>
              {availableCarModels.map((car) => (
                <button
                  key={car}
                  type="button"
                  onClick={() => setSelectedCarModel(car)}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    selectedCarModel === car
                      ? 'bg-lmu-accent text-white font-bold shadow-sm'
                      : 'bg-lmu-bg text-lmu-muted hover:text-white border border-lmu-border'
                  }`}
                >
                  {car}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
