import React from 'react';
import { Clock, ArrowLeftRight } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../server/types.js';
import { getDisplayTrackName } from '../../utils/formatters.js';
import { SessionLapTableRow } from './SessionLapTableRow.js';

export interface SessionLapTableProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  isMultiClass: boolean;
  hasTireWearData: boolean;
  hasFuelData: boolean;
  hasVirtualEnergyData: boolean;
  isCurrentSessionAllTimePB: boolean;
}

export const SessionLapTable: React.FC<SessionLapTableProps> = ({
  session,
  selectedDriver,
  isMultiClass,
  hasTireWearData,
  hasFuelData,
  hasVirtualEnergyData,
  isCurrentSessionAllTimePB,
}) => {
  const bestLap = selectedDriver?.bestLapTime ?? null;
  const bestS1 = selectedDriver?.bestS1 ?? null;
  const bestS2 = selectedDriver?.bestS2 ?? null;
  const bestS3 = selectedDriver?.bestS3 ?? null;
  const theoBest = selectedDriver?.theoreticalBest ?? null;

  return (
    <div className="glass-panel p-5 rounded-2xl relative space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-lmu-border/60 pb-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-lmu-accent" />
            <span>Lap Timing & Telemetry ({selectedDriver?.laps?.length || 0} Laps)</span>
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Click any lap row or Telemetry button to inspect rich telemetry, or compare side-by-side.
          </p>
        </div>

        {/* Open Full Comparison Studio */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
              const carClass = selectedDriver?.carClass || 'LMGT3';
              window.location.hash = `#compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
                carClass
              )}&sessionId=${encodeURIComponent(session.id)}`;
            }}
            className="px-3.5 py-1.5 rounded-xl bg-lmu-accent/20 hover:bg-lmu-accent/30 border border-lmu-accent/40 text-lmu-accent text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            title="Open full telemetry comparator studio for this session"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Open in Comparison Studio</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs text-lmu-muted">
          <thead className="bg-lmu-bg/80 uppercase font-semibold text-white border-b border-lmu-border">
            <tr>
              <th className="px-3 py-3">Lap</th>
              <th
                className="px-3 py-3"
                title={isMultiClass ? `Class Position (in ${selectedDriver?.carClass || 'Class'})` : 'Position'}
              >
                {isMultiClass ? 'Class Pos' : 'Pos'}
              </th>
              <th className="px-3 py-3 text-right">Lap Time</th>
              <th className="px-3 py-3 text-center">Pace Category</th>
              <th className="px-3 py-3 text-right">Delta</th>
              <th className="px-3 py-3 text-right" title="Consecutive lap-to-lap delta (Lap N - Lap N-1)">
                Δ Prev
              </th>
              <th className="px-3 py-3 text-right">Sector 1</th>
              <th className="px-3 py-3 text-right">Sector 2</th>
              <th className="px-3 py-3 text-right">Sector 3</th>
              <th className="px-3 py-3 text-right">Top Speed</th>
              <th className="px-3 py-3 text-center">Tire Compound</th>
              {hasTireWearData && <th className="px-3 py-3 text-center">Tire Wear</th>}
              {hasFuelData && (
                <th className="px-3 py-3 text-center">{hasVirtualEnergyData ? 'Fuel & VE' : 'Fuel'}</th>
              )}
              <th className="px-3 py-3 text-center">Status</th>
              <th className="px-2 py-3 text-center w-16" title="Telemetry & Compare">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-lmu-border/50 font-mono">
            {(selectedDriver?.laps || []).map((l, idx, allLaps) => (
              <SessionLapTableRow
                key={l.lapNum}
                session={session}
                selectedDriver={selectedDriver}
                lap={l}
                prevLap={idx > 0 ? allLaps[idx - 1] : null}
                bestLap={bestLap}
                bestS1={bestS1}
                bestS2={bestS2}
                bestS3={bestS3}
                theoBest={theoBest}
                isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
                isMultiClass={isMultiClass}
                hasTireWearData={hasTireWearData}
                hasFuelData={hasFuelData}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
