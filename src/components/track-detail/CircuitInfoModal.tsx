import React from 'react';
import { createPortal } from 'react-dom';
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
import { useModalFocus } from '../common/useModalFocus.js';
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
  const shouldFetch = isOpen && propGeometry === undefined;
  const { trackGeometry: fetchedGeometry } = useTrackBoundaryGeometry(
    shouldFetch
      ? { trackVenue: trackName, trackCourse, layoutKey: specs.layoutKey }
      : { layoutKey: null, trackVenue: null, trackCourse: null }
  );
  const trackGeometry = propGeometry !== undefined ? propGeometry : fetchedGeometry;

  const dialogRef = useModalFocus(isOpen, onClose);

  if (!isOpen) return null;

  const displayLengthM = [xmlTrackLengthMeters, trackGeometry?.lengthM, specs.officialLengthMeters]
    .find((length): length is number => typeof length === 'number' && Number.isFinite(length) && length > 0) ?? 0;
  const displayLengthKm = (displayLengthM / 1000).toFixed(3);
  const displayLengthMi = (displayLengthM * 0.000621371).toFixed(3);

  const timingGates = trackGeometry?.timingGates;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${specs.officialName} Circuit Information`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-lmu-card border border-lmu-border rounded-2xl overflow-hidden p-6 space-y-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-lmu-border pb-3 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="shrink-0">
              <TrackCircuitLayout
                trackName={trackName}
                trackCourse={trackCourse}
                layoutKey={specs.layoutKey}
                trackGeometry={trackGeometry}
                size="detail"
              />
            </div>
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <div className="flex items-center gap-2">
                <span className="text-base" title={specs.country}>{specs.flagEmoji}</span>
                <h3 className="text-lg font-semibold text-white leading-tight">
                  {specs.officialName}
                </h3>
              </div>
              <p className="text-xs text-lmu-cyan font-medium mt-1">
                {specs.layoutName} {specs.fiaGrade && `• ${specs.fiaGrade}`}
              </p>
              <p className="text-[11px] text-lmu-muted">
                {specs.city}, {specs.country}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close circuit information"
            onClick={onClose}
            className="p-1.5 rounded-lg text-lmu-muted hover:text-white hover:bg-lmu-raised transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div role="region" aria-label="Circuit specifications and sources" tabIndex={0} className="space-y-4 overflow-y-auto pr-1 min-h-0 flex-1 custom-scrollbar text-xs [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2">
          {/* Key Circuit Specifications Grid */}
          <div className="grid grid-cols-3 gap-4">
            {/* Length */}
            <div className="py-1 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-lmu-muted text-[11px] font-semibold">
                <Ruler className="w-3.5 h-3.5 text-lmu-cyan" />
                <span>Length</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-semibold font-mono text-white">
                  {displayLengthKm} km
                </div>
                <div className="text-[11px] text-lmu-muted font-mono">
                  {displayLengthM.toLocaleString()} m ({displayLengthMi} mi)
                </div>
              </div>
            </div>

            {/* Turns */}
            <div className="py-1 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-lmu-muted text-[11px] font-semibold">
                <Compass className="w-3.5 h-3.5 text-lmu-cyan" />
                <span>Turns</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-semibold font-mono text-white">
                  {specs.turnCount} Turns
                </div>
                <div className="text-[11px] text-lmu-muted">
                  {specs.direction}
                </div>
              </div>
            </div>

            {/* Elevation Delta */}
            <div className="py-1 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-lmu-muted text-[11px] font-semibold">
                <Mountain className="w-3.5 h-3.5 text-lmu-cyan" />
                <span>Elevation</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-semibold font-mono text-white">
                  {specs.elevationChangeMeters !== undefined ? `${specs.elevationChangeMeters} m` : 'Unknown'}
                </div>
                <div className="text-[11px] text-lmu-muted font-mono">
                  {specs.elevationChangeMeters !== undefined
                    ? `${Math.round(specs.elevationChangeMeters * 3.28084)} ft Delta`
                    : 'Profile Pending'}
                </div>
              </div>
            </div>
          </div>

          {/* Famous Corners Breakdown */}
          {specs.famousCorners.length > 0 && (
            <div className="pt-4 border-t border-lmu-border space-y-2">
              <div className="flex items-center gap-2 text-lmu-text font-semibold text-xs">
                <Flag className="w-3.5 h-3.5 text-lmu-muted" />
                <span>Notable Corners & Sectors</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {specs.famousCorners.map((corner, i) => (
                  <span
                    key={i}
                    className="text-lmu-text-soft text-[11px]"
                  >
                    {corner}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timing Gates / Sector Stations */}
          {timingGates && (
            <div className="pt-4 border-t border-lmu-border space-y-2">
              <div className="flex items-center gap-2 text-lmu-text font-semibold text-xs">
                <Award className="w-3.5 h-3.5 text-lmu-muted" />
                <span>Official Timing Loops & Sectors</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="py-1">
                  <div className="text-lmu-gold">Sector 1 Gate</div>
                  <div className="font-mono font-semibold text-lmu-text mt-0.5">
                    {timingGates.sector1 ? `${Math.round(timingGates.sector1.stationM)} m` : 'N/A'}
                  </div>
                </div>
                <div className="py-1">
                  <div className="text-lmu-blue">Sector 2 Gate</div>
                  <div className="font-mono font-semibold text-lmu-text mt-0.5">
                    {timingGates.sector2 ? `${Math.round(timingGates.sector2.stationM)} m` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ingestion & Source Origin Details */}
          <div className="pt-4 border-t border-lmu-border space-y-2.5">
            <div className="flex items-center gap-2 text-lmu-text font-semibold text-xs">
              <FileCode className="w-3.5 h-3.5 text-lmu-cyan" />
              <span>Data Source & Ingestion Pipeline</span>
            </div>

            <div className="space-y-2 text-[11px] text-lmu-text-soft">
              <div className="flex items-start gap-2">
                <Layers className="w-3.5 h-3.5 text-lmu-muted shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Physical Road Boundaries: </span>
                  <span className="text-lmu-text-soft">{specs.boundarySourceDescription}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FileCode className="w-3.5 h-3.5 text-lmu-muted shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white">Parsed From: </span>
                  <span className="text-lmu-text-soft">{specs.parsedFrom}</span>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-lmu-muted shrink-0 mt-0.5" />
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
        <div className="pt-3 border-t border-lmu-border flex items-center justify-between gap-3 text-[11px] text-lmu-muted shrink-0">
          <span>Layout Key: <span className="font-mono text-lmu-muted">{specs.layoutKey}</span></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-lmu-raised hover:bg-lmu-rule text-white font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>, document.body
  );
};
