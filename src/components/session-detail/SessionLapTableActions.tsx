import React from 'react';
import { ArrowLeftRight, Activity } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../server/types.js';
import { getDisplayTrackName } from '../../utils/formatters.js';

export interface SessionLapTableActionsProps {
  session: DetailedSession;
  lapNum: number;
  selectedDriver?: DriverData;
  onOpenTelemetry: () => void;
}

export const SessionLapTableActions: React.FC<SessionLapTableActionsProps> = ({
  session,
  lapNum,
  selectedDriver,
  onOpenTelemetry,
}) => {
  return (
    <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onOpenTelemetry}
        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm ${
          session.matchingReplayFile
            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
            : 'bg-lmu-accent/20 hover:bg-lmu-accent/30 text-lmu-accent border border-lmu-accent/40'
        }`}
        title={
          session.matchingReplayFile
            ? `Inspect Replay for Lap ${lapNum} Telemetry`
            : `Open Lap ${lapNum} in Telemetry Studio`
        }
      >
        <Activity className="w-3 h-3" />
        <span>Telemetry</span>
      </button>

      <button
        onClick={() => {
          const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
          const carClass = selectedDriver?.carClass || 'LMGT3';
          window.location.hash = `#compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
            carClass
          )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${lapNum}`;
        }}
        className="px-2 py-1 rounded-lg bg-lmu-bg hover:bg-lmu-accent hover:text-white text-lmu-muted border border-lmu-border text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
        title={`Compare Lap ${lapNum} in Telemetry Studio`}
      >
        <ArrowLeftRight className="w-3 h-3" />
        <span>Compare</span>
      </button>
    </div>
  );
};
