import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Crosshair, Loader2 } from 'lucide-react';
import type { ComparableLap, DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { useSessionDebrief } from './useSessionDebrief.js';
import { debriefCornerLink, SessionDebrief } from './loadSessionDebrief.js';
import { DebriefCornerRow } from './DebriefCornerRow.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';

export interface SessionDebriefCardProps {
  session: DetailedSession;
  selectedDriver: DriverData;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(3)}s`;
}

function LapLabel({ lap }: { lap: ComparableLap }) {
  const when = [lap.sessionType, lap.dateString?.split(' ')[0]].filter(Boolean).join(' ');
  return (
    <>
      <span className="text-white">{lap.driverName}</span>{' '}
      <span className="font-mono text-white">{formatTime(lap.lapTime)}</span>
      {when ? ` (${when})` : ''}
    </>
  );
}

function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  return <span className={`font-mono font-bold ${delta > 0 ? 'text-lmu-loss' : 'text-lmu-gain'}`}> {formatDelta(delta)}</span>;
}

/** The analysed lap, the realistic target the corners are ranked against, and the fastest lap for technique. */
function ReferenceLines({ debrief }: { debrief: SessionDebrief }) {
  return (
    <div className="space-y-0.5 text-xs text-lmu-muted">
      <p>
        Lap {debrief.lapNumber} <span className="font-mono text-white">{formatTime(debrief.lapTimeSec)}</span>
        <Delta delta={debrief.lapDeltaSec} /> vs {debrief.technique ? 'realistic target ' : ''}<LapLabel lap={debrief.reference} />
      </p>
      {debrief.technique && (
        <p>
          Technique from the fastest: <LapLabel lap={debrief.technique} /><Delta delta={debrief.techniqueDeltaSec} />
        </p>
      )}
    </div>
  );
}

/**
 * The first thing to read after a session: the corners of the best lap that cost the most
 * against a realistic same-car target (about 0.5% faster), with how the fastest same-car lap
 * drives them, ranked deterministically (time lost x how often it happens x comparison
 * confidence), each one a click away in telemetry.
 */
export const SessionDebriefCard: React.FC<SessionDebriefCardProps> = ({ session, selectedDriver }) => {
  const navigate = useNavigate();
  // Building a race debrief reads every car's replay, so it only starts when asked for.
  const key = `${session.id}|${selectedDriver.name}`;
  const [request, setRequest] = useState<{ key: string; attempt: number } | null>(null);
  const attempt = request?.key === key ? request.attempt : 0;
  const state = useSessionDebrief(session, selectedDriver, attempt);
  const requestDebrief = () => setRequest({ key, attempt: attempt + 1 });

  return (
    <div className="bg-lmu-card p-5 rounded-2xl border border-lmu-border space-y-3" data-testid="session-debrief">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-lmu-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-lmu-warn" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Debrief: Where the Time Goes</h3>
        </div>
        <span className="text-xs text-lmu-muted">vs other {selectedDriver.carType} laps on this layout</span>
      </div>

      <p role="status" aria-atomic="true" className="sr-only">
        {state.status === 'loading' ? 'Comparing laps for your debrief.' : state.status === 'ready' ? 'Your lap debrief is ready.' : state.status === 'unavailable' ? 'No lap comparison is available.' : ''}
      </p>
      {state.status === 'idle' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1">
          <p className="text-xs text-lmu-muted">
            Ranks the corners of your best lap that cost the most against a realistic {selectedDriver.carType} target, with what the fastest lap does there.
          </p>
          <button
            type="button"
            onClick={requestDebrief}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-lmu-warn-strong/15 text-lmu-warn-soft border border-lmu-warn-strong/40 hover:bg-lmu-warn-strong/25 whitespace-nowrap ${FOCUS_RING}`}
          >
            <Crosshair className="w-3.5 h-3.5" /> Show where the time goes
          </button>
        </div>
      )}
      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-xs text-lmu-muted py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparing your best lap with other {selectedDriver.carType} laps and placing the traffic (the first time for a race takes a few seconds)...
        </p>
      )}
      {state.status === 'unavailable' && <p className="text-xs text-lmu-muted py-1">{state.reason}</p>}
      {state.status === 'error' && (
        <div className="flex items-center justify-between gap-2 py-1">
          <p role="alert" className="text-xs text-lmu-loss">{state.message}</p>
          <button type="button" onClick={requestDebrief} className={`text-xs font-bold text-lmu-info hover:text-lmu-info-soft whitespace-nowrap ${FOCUS_RING}`}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <ReferenceLines debrief={state.debrief} />
          {state.debrief.corners.length > 0 ? (
            <ol>
              {state.debrief.corners.map((corner, i) => (
                <DebriefCornerRow
                  key={corner.cornerNumber}
                  rank={i + 1}
                  corner={corner}
                  hasTechnique={state.debrief.technique !== null}
                  toLink={(cornerNumber, against) => debriefCornerLink(state.debrief, cornerNumber, against)}
                  onOpen={(cornerNumber, against) => navigate(debriefCornerLink(state.debrief, cornerNumber, against))}
                />
              ))}
            </ol>
          ) : (
            <p className="text-xs text-lmu-gain py-1">You matched or beat the reference through every corner.</p>
          )}
          <p className="text-[11px] text-lmu-muted">
            Ranked by time lost × how often you lose it ({state.debrief.lapsTimed} laps timed) × comparison confidence ({Math.round(state.debrief.confidence * 100)}%).
            {state.debrief.trafficKnown && ' Passes through a corner with another car within a second are left out, and a corner of this lap driven in traffic ranks lower.'}
          </p>
          {state.debrief.caveats.map((caveat) => (
            <p key={caveat} className="text-[11px] text-lmu-warn-soft">{caveat}</p>
          ))}
        </>
      )}
    </div>
  );
};
