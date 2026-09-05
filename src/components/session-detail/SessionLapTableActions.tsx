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
    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onOpenTelemetry}
        aria-label="Telemetry"
        className={`p-1.5 rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer shadow-sm ${
          session.matchingReplayFile
            ? 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 hover:text-emerald-100 border border-emerald-500/40'
            : 'bg-lmu-accent/20 hover:bg-lmu-accent/35 text-lmu-accent hover:text-white border border-lmu-accent/40'
        }`}
        title={
          session.matchingReplayFile
            ? `Inspect Replay for Lap ${lapNum} Telemetry`
            : `Open Lap ${lapNum} in Telemetry Studio`
        }
      >
        <Activity className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => {
          const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
          const carClass = selectedDriver?.carClass || 'LMGT3';
          window.location.hash = `#compare?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
            carClass
          )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${lapNum}`;
        }}
        aria-label="Compare"
        className="p-1.5 rounded-lg bg-lmu-bg hover:bg-lmu-accent hover:text-white text-lmu-muted border border-lmu-border transition-all flex items-center justify-center cursor-pointer"
        title={`Compare Lap ${lapNum} in Telemetry Studio`}
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
