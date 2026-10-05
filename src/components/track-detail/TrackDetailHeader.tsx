import React, { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ArrowLeftRight, Car, Info } from 'lucide-react';
import { TrackCircuitLayout } from './TrackCircuitLayout.js';
import { VehicleClassPills } from '../common/VehicleClassPills.js';
import { BenchmarkLadder } from '../common/BenchmarkLadder.js';
import { CircuitInfoModal } from './CircuitInfoModal.js';
import { ReferenceLaptimeEntry } from '../../../shared/types/index.js';

export interface TrackDetailHeaderProps {
  trackName: string;
  trackCourse?: string;
  sessionsCount: number;
  onBack: () => void;
  selectedClass: string;
  setSelectedClass: (cls: string) => void;
  selectedCarModel: string;
  setSelectedCarModel: (model: string) => void;
  availableCarModels: string[];
  currentBenchmark?: ReferenceLaptimeEntry | null;
  bestLapTimeString?: string | null;
  bestLapCar?: string | null;
  xmlTrackLengthMeters?: number | null;
  trackGeometry?: import('../replay/map/index.js').TrackBoundaryGeometry | null;
}

export const TrackDetailHeader: React.FC<TrackDetailHeaderProps> = ({
  trackName,
  trackCourse,
  sessionsCount: _sessionsCount,
  onBack,
  selectedClass,
  setSelectedClass,
  selectedCarModel,
  setSelectedCarModel,
  availableCarModels,
  currentBenchmark,
  bestLapTimeString: _bestLapTimeString,
  bestLapCar: _bestLapCar,
  xmlTrackLengthMeters,
  trackGeometry,
}) => {
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const backUrl = selectedClass !== 'All' ? `/tracks?carClass=${encodeURIComponent(selectedClass)}` : '/tracks';
  const compareUrl = `/leaderboard?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
    selectedClass !== 'All' ? selectedClass : 'LMGT3'
  )}`;

  return (
    <>
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <Link
          to={backUrl}
          onClick={(e) => {
            if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              onBack();
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-accent transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tracks
        </Link>

        <Link
          to={compareUrl}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lmu-card border border-lmu-border text-xs font-medium text-lmu-text-soft hover:text-lmu-text hover:bg-lmu-cardHover transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2"
          title="Compare laps on this track"
        >
          <ArrowLeftRight className="w-4 h-4 text-lmu-muted" />
          Compare Laps
        </Link>
      </div>

      {/* Track Title Card */}
      <div className="bg-lmu-card border border-lmu-border p-6 rounded-2xl grid grid-cols-[160px_minmax(0,1fr)] items-stretch gap-6">
              <TrackCircuitLayout
                trackName={trackName}
                trackCourse={trackCourse}
                trackGeometry={trackGeometry}
                size="header"
              />
          <div className="min-w-0 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 max-w-full">
                  <h2 dir="auto" className="text-3xl font-extrabold text-white [overflow-wrap:anywhere]" title={trackName}>
                    {trackName}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsInfoModalOpen(true)}
                    className="p-1 rounded-md bg-lmu-raised/80 border border-lmu-rule/60 text-lmu-muted hover:text-lmu-accent-text hover:border-lmu-accent/40 hover:bg-lmu-raised transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
                    title={`View circuit info for ${trackName}`}
                    aria-label={`View circuit info for ${trackName}`}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-lmu-muted mt-0.5 truncate">
                  Benchmark Target Lap Times & Personal Telemetry per Vehicle Category
                </p>
              </div>
          {/* Vehicle class selection at the top right of the header */}
          <VehicleClassPills
            selectedClass={selectedClass}
            onSelectClass={setSelectedClass}
            className="shrink-0"
          />
            </div>

        {/* Specific Car Model Sub-Filter Row */}
        {selectedClass !== 'All' && availableCarModels.length > 0 && (
          <div className="pt-3 border-t border-lmu-border/50 flex items-center gap-3 flex-wrap text-xs">
            <span className="text-xs font-semibold text-lmu-muted uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <Car className="w-3.5 h-3.5 text-lmu-accent-text" />
              Car Model:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                aria-pressed={selectedCarModel === 'All'}
                onClick={() => setSelectedCarModel('All')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${selectedCarModel === 'All'
                  ? 'bg-lmu-accent/20 text-lmu-accent-text border border-lmu-accent/40 font-bold'
                  : 'bg-lmu-bg text-lmu-muted hover:text-white border border-lmu-border'
                  }`}
              >
                All {selectedClass} Cars ({availableCarModels.length})
              </button>
              {availableCarModels.map((car) => (
                <button
                  key={car}
                  type="button"
                  aria-pressed={selectedCarModel === car}
                  dir="auto"
                  onClick={() => setSelectedCarModel(car)}
                  className={`max-w-full [overflow-wrap:anywhere] px-3 py-1 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${selectedCarModel === car
                    ? 'bg-lmu-accent text-white font-bold'
                    : 'bg-lmu-bg text-lmu-muted hover:text-white border border-lmu-border'
                    }`}
                >
                  {car}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Merged Reference Lap Times: only times, no title or subtitle */}
        {currentBenchmark ? (
          <div className="pt-3 border-t border-lmu-border/50">
            <BenchmarkLadder benchmark={currentBenchmark} />
          </div>
        ) : (
          <div role="status" className="pt-3 border-t border-lmu-border/50 py-3 text-center text-xs text-lmu-muted">
            No reference benchmarks found for this track. Update reference lap time benchmarks in Settings.
          </div>
        )}

          </div>
      </div>

      <CircuitInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        trackName={trackName}
        trackCourse={trackCourse}
        xmlTrackLengthMeters={xmlTrackLengthMeters}
      />
    </>
  );
};
