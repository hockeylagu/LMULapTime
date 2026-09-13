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
import { getCircuitSpecification } from '../../utils/circuitSpecs.js';
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
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3.5">
            <div className="p-1.5 rounded-xl bg-slate-800/80 border border-slate-700">
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
              <p className="text-[11px] text-slate-400">
                {specs.city}, {specs.country}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-lmu-accent text-[11px] font-semibold">
                <Ruler className="w-3.5 h-3.5" />
                <span>Length</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold font-mono text-white">
                  {displayLengthKm} km
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {displayLengthM.toLocaleString()} m ({displayLengthMi} mi)
                </div>
              </div>
            </div>

            {/* Turns */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-purple-400 text-[11px] font-semibold">
                <Compass className="w-3.5 h-3.5" />
                <span>Turns</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold font-mono text-white">
                  {specs.turnCount} Turns
                </div>
                <div className="text-[10px] text-slate-400">
                  {specs.direction}
                </div>
              </div>
            </div>

            {/* Elevation Delta */}
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
                <Mountain className="w-3.5 h-3.5" />
                <span>Elevation</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold font-mono text-white">
                  {specs.elevationChangeMeters !== undefined ? `${specs.elevationChangeMeters} m` : 'Flat'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {specs.elevationChangeMeters !== undefined
                    ? `${Math.round(specs.elevationChangeMeters * 3.28084)} ft Delta`
                    : 'Profile Pending'}
                </div>
              </div>
            </div>
          </div>

          {/* Famous Corners Breakdown */}
          {specs.famousCorners.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Flag className="w-3.5 h-3.5 text-purple-400" />
                <span>Notable Corners & Sectors</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {specs.famousCorners.map((corner, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-medium"
                  >
                    {corner}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timing Gates / Sector Stations */}
          {timingGates && (
            <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Award className="w-3.5 h-3.5 text-lmu-gold" />
                <span>Official Timing Loops & Sectors</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-slate-800/70 border border-slate-700">
                  <div className="text-slate-400">Sector 1 Gate</div>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {timingGates.sector1 ? `${Math.round(timingGates.sector1.stationM)} m` : 'N/A'}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-slate-800/70 border border-slate-700">
                  <div className="text-slate-400">Sector 2 Gate</div>
                  <div className="font-mono font-bold text-white mt-0.5">
                    {timingGates.sector2 ? `${Math.round(timingGates.sector2.stationM)} m` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ingestion & Source Origin Details */}
          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2.5">
            <div className="flex items-center gap-2 text-white font-bold text-xs">
              <FileCode className="w-3.5 h-3.5 text-sky-400" />
              <span>Data Source & Ingestion Pipeline</span>
            </div>

            <div className="space-y-2 text-[11px] text-slate-300">
              <div className="flex items-start gap-2">
                <Layers className="w-3.5 h-3.5 text-lmu-gold shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Physical Road Boundaries: </span>
                  <span className="text-slate-300">{specs.boundarySourceDescription}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Parsed From: </span>
                  <span className="text-slate-300">{specs.parsedFrom}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Coordinate System: </span>
                  <span className="text-slate-300">
                    Pre-aligned 1:1 Metric LMU World Space (scale factor 0.99 &lt; s &lt; 1.01).
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>Layout Key: <span className="font-mono text-slate-400">{specs.layoutKey}</span></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
