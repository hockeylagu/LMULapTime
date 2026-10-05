import React from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, Activity } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { getDisplayTrackName } from '../../../../shared/domain/formatters.js';
import { linkClickHandler } from '../../../utils/linkClick.js';

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent';

export interface SessionLapTableActionsProps {
  session: DetailedSession;
  lapNum: number;
  selectedDriver?: DriverData;
  telemetryUrl?: string;
  onOpenTelemetry: () => void;
}

export const SessionLapTableActions: React.FC<SessionLapTableActionsProps> = ({
  session,
  lapNum,
  selectedDriver,
  telemetryUrl,
  onOpenTelemetry,
}) => {
  const trackName = getDisplayTrackName(session.trackVenue, session.trackCourse);
  const carClass = selectedDriver?.carClass || 'LMGT3';
  const compareUrl = `/leaderboard?track=${encodeURIComponent(trackName)}&carClass=${encodeURIComponent(
    carClass
  )}&sessionId=${encodeURIComponent(session.id)}&lapNum=${lapNum}`;

  const telemetryClassName = `p-1.5 rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer ${FOCUS_RING} ${
    session.matchingReplayFile
      ? 'bg-lmu-gain-strong/15 hover:bg-lmu-gain-strong/30 text-lmu-gain-soft hover:text-lmu-gain-soft border border-lmu-gain-strong/40'
      : 'bg-lmu-accent/20 hover:bg-lmu-accent/35 text-lmu-accent-text hover:text-white border border-lmu-accent/40'
  }`;

  const telemetryTitle = session.matchingReplayFile
    ? `Inspect Replay for Lap ${lapNum} Telemetry`
    : `Open Lap ${lapNum} in Telemetry`;

  return (
    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
      {telemetryUrl ? (
        <Link
          to={telemetryUrl}
          onClick={linkClickHandler(() => onOpenTelemetry())}
          aria-label={`Telemetry for lap ${lapNum}`}
          className={telemetryClassName}
          title={telemetryTitle}
        >
          <Activity className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpenTelemetry}
          aria-label={`Telemetry for lap ${lapNum}`}
          className={telemetryClassName}
          title={telemetryTitle}
        >
          <Activity className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      <Link
        to={compareUrl}
        aria-label={`Compare lap ${lapNum}`}
        className={`p-1.5 rounded-lg bg-lmu-bg hover:bg-lmu-raised hover:text-white text-lmu-muted border border-lmu-border hover:border-lmu-rule transition-all flex items-center justify-center cursor-pointer ${FOCUS_RING}`}
        title={`Compare Lap ${lapNum}`}
      >
        <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
};
