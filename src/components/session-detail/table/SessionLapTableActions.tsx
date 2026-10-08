import React from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight } from 'lucide-react';
import { ReplayGlyph, REPLAY_ACTION } from '../../common/replay/ReplayGlyph.js';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { linkClickHandler } from '../../../utils/linkClick.js';
import { sessionLapComparePath } from '../sessionDetailHelpers.js';

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
  const compareUrl = sessionLapComparePath(session, selectedDriver, lapNum);

  // With a replay, the lap opens in it with the same glyph as the session's replay button. Without one there is
  // nothing to open: the compare button leads to the lap's comparison.
  const hasReplay = Boolean(session.matchingReplayFile);
  const hasTelemetry = Boolean(session.hasDuckDbTelemetry || session.matchingReplayFile?.hasDuckDbTelemetry);
  const replayClassName = `${REPLAY_ACTION} p-1.5`;
  const replayTitle = `${hasTelemetry ? 'Replay + telemetry' : 'Replay'} for Lap ${lapNum}`;
  const replayIcon = <ReplayGlyph telemetry={hasTelemetry} size={14} />;

  return (
    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
      {hasReplay && (telemetryUrl ? (
        <Link
          to={telemetryUrl}
          onClick={linkClickHandler(() => onOpenTelemetry())}
          aria-label={`Telemetry for lap ${lapNum}`}
          className={replayClassName}
          title={replayTitle}
        >
          {replayIcon}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpenTelemetry}
          aria-label={`Telemetry for lap ${lapNum}`}
          className={replayClassName}
          title={replayTitle}
        >
          {replayIcon}
        </button>
      ))}

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
