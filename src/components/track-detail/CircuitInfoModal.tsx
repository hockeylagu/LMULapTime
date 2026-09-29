import React, { useEffect } from 'react';
import {
  X,
  Ruler,
  Compass,
  FileCode,
  Layers,
  Flag,
  Info,
  Award,
  Mountain,
} from 'lucide-react';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { TrackCircuitLayout } from './TrackCircuitLayout.js';
import { useTrackBoundaryGeometry, TrackBoundaryGeometry } from '../replay/map/index.js';

export interface CircuitInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackName: string;
  trackCourse?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
  xmlTrackLengthMeters?: number | null;
}

export const CircuitInfoModal: React.FC<CircuitInfoModalProps> = ({
  isOpen,
  onClose,
  trackName,
  trackCourse,
  trackGeometry: propGeometry,
  xmlTrackLengthMeters,
}) => {
  const specs = getCircuitSpecification(trackName, trackCourse);
  const shouldFetch = propGeometry === undefined;
  const { trackGeometry: fetchedGeometry } = useTrackBoundaryGeometry(
    shouldFetch
      ? { trackVenue: trackName, trackCourse, layoutKey: specs.layoutKey }
      : { layoutKey: null, trackVenue: null, trackCourse: null }
  );
  const trackGeometry = propGeometry !== undefined ? propGeometry : fetchedGeometry;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayLengthM = xmlTrackLengthMeters || trackGeometry?.lengthM || specs.officialLengthMeters;
  const displayLengthKm = (displayLengthM / 1000).toFixed(3);
  const displayLengthMi = (displayLengthM * 0.000621371).toFixed(3);

  const timingGates = trackGeometry?.timingGates;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${specs.officialName} Circuit Information`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-lmu-card border border-lmu-rule/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-lmu-border pb-3">
          <div className="flex items-center gap-3.5">
            <div className="p-1.5 rounded-xl bg-lmu-raised/80 border border-lmu-rule">
              <TrackCircuitLayout
                trackName={trackName}
                trackCourse={trackCourse}
                layoutKey={specs.layoutKey}
                trackGeometry={trackGeometry}
                size="detail"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base" title={specs.country}>{specs.flagEmoji}</span>
                <h3 className="text-lg font-extrabold text-white leading-tight">
                  {specs.officialName}
                </h3>
              </div>
              <p className="text-xs text-lmu-gold font-medium mt-0.5">
                {specs.layoutName} {specs.fiaGrade && `• ${specs.fiaGrade}`}
              </p>
              <p className="text-[11px] text-lmu-muted">
                {specs.city}, {specs.country}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-raised transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar text-xs">
          {/* Key Circuit Specifications Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Length */}
            <div className="p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-lmu-accent-text text-[11px] font-semibold">
                <Ruler className="w-3.5 h-3.5" />
                <span>Length</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold font-mono text-white">
                  {displayLengthKm} km
                </div>
                <div className="text-[10px] text-lmu-muted font-mono">
                  {displayLengthM.toLocaleString()} m ({displayLengthMi} mi)
                </div>
              </div>
            </div>

            {/* Turns */}
            <div className="p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-lmu-purple text-[11px] font-semibold">
                <Compass className="w-3.5 h-3.5" />
                <span>Turns</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold font-mono text-white">
                  {specs.turnCount} Turns
                </div>
                <div className="text-[10px] text-lmu-muted">
                  {specs.direction}
                </div>
              </div>
            </div>

            {/* Elevation Delta */}
            <div className="p-3 rounded-xl bg-lmu-raised/60 border border-lmu-rule/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-lmu-gain text-[11px] font-semibold">
                <Mountain className="w-3.5 h-3.5" />
                <span>Elevation</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold font-mono text-white">
                  {specs.elevationChangeMeters !== undefined ? `${specs.elevationChangeMeters} m` : 'Flat'}
                </div>
                <div className="text-[10px] text-lmu-muted font-mono">
                  {specs.elevationChangeMeters !== undefined
                    ? `${Math.round(specs.elevationChangeMeters * 3.28084)} ft Delta`
                    : 'Profile Pending'}
                </div>
              </div>
            </div>
          </div>

          {/* Famous Corners Breakdown */}
          {specs.famousCorners.length > 0 && (
            <div className="p-3.5 rounded-xl bg-lmu-raised/40 border border-lmu-rule/50 space-y-2">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Flag className="w-3.5 h-3.5 text-lmu-purple" />
                <span>Notable Corners & Sectors</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {specs.famousCorners.map((corner, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-lmu-raised border border-lmu-rule text-lmu-text-soft text-[11px] font-medium"
                  >
                    {corner}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timing Gates / Sector Stations */}
          {timingGates && (
            <div className="p-3.5 rounded-xl bg-lmu-raised/40 border border-lmu-rule/50 space-y-2">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Award className="w-3.5 h-3.5 text-lmu-gold" />
                <span>Official Timing Loops & Sectors</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-lmu-raised/70 border border-lmu-rule">
                  <div className="text-lmu-muted">Sector 1 Gate</div>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {timingGates.sector1 ? `${Math.round(timingGates.sector1.stationM)} m` : 'N/A'}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-lmu-raised/70 border border-lmu-rule">
                  <div className="text-lmu-muted">Sector 2 Gate</div>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {timingGates.sector2 ? `${Math.round(timingGates.sector2.stationM)} m` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ingestion & Source Origin Details */}
          <div className="p-3.5 rounded-xl bg-lmu-raised/40 border border-lmu-rule/50 space-y-2.5">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <FileCode className="w-3.5 h-3.5 text-lmu-info" />
              <span>Data Source & Ingestion Pipeline</span>
            </div>

            <div className="space-y-2 text-[11px] text-lmu-text-soft">
              <div className="flex items-start gap-2">
                <Layers className="w-3.5 h-3.5 text-lmu-gold shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Physical Road Boundaries: </span>
                  <span className="text-lmu-text-soft">{specs.boundarySourceDescription}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FileCode className="w-3.5 h-3.5 text-lmu-gain shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Parsed From: </span>
                  <span className="text-lmu-text-soft">{specs.parsedFrom}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-lmu-aqua shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Coordinate System: </span>
                  <span className="text-lmu-text-soft">
                    Pre-aligned 1:1 Metric LMU World Space (scale factor 0.99 &lt; s &lt; 1.01).
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-lmu-border flex items-center justify-between text-[11px] text-lmu-faint">
          <span>Layout Key: <span className="font-mono text-lmu-muted">{specs.layoutKey}</span></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-lmu-raised hover:bg-lmu-rule text-white font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
