import React from 'react';
import { useNavigate } from 'react-router';
import { Crosshair, Loader2 } from 'lucide-react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { useSessionDebrief } from './useSessionDebrief.js';
import { debriefCornerLink, SessionDebrief } from './loadSessionDebrief.js';
import { DebriefCornerRow } from './DebriefCornerRow.js';

export interface SessionDebriefCardProps {
  session: DetailedSession;
  selectedDriver: DriverData;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(3)}s`;
}

function ReferenceLine({ debrief }: { debrief: SessionDebrief }) {
  const { reference } = debrief;
  const when = [reference.sessionType, reference.dateString?.split(' ')[0]].filter(Boolean).join(' ');
  return (
    <p className="text-xs text-lmu-muted">
      Lap {debrief.lapNumber} <span className="font-mono text-white">{formatTime(debrief.lapTimeSec)}</span>
      {debrief.lapDeltaSec !== null && (
        <span className={`font-mono font-bold ${debrief.lapDeltaSec > 0 ? 'text-rose-400' : 'text-emerald-400'}`}> {formatDelta(debrief.lapDeltaSec)}</span>
      )}
      {' '}vs <span className="text-white">{reference.driverName}</span>{' '}
      <span className="font-mono text-white">{formatTime(reference.lapTime)}</span>
      {when ? ` (${when})` : ''}
    </p>
  );
}

/**
 * The first thing to read after a session: the corners of the best lap that cost the most
 * against the fastest same-car lap on this layout, ranked deterministically (time lost x how
 * often it happens x comparison confidence), each one a click away in telemetry.
 */
export const SessionDebriefCard: React.FC<SessionDebriefCardProps> = ({ session, selectedDriver }) => {
  const navigate = useNavigate();
  const state = useSessionDebrief(session, selectedDriver);

  return (
    <div className="bg-lmu-card/75 backdrop-blur-md p-4 rounded-xl border border-lmu-border/70 space-y-3" data-testid="session-debrief">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-lmu-border/50 pb-2">
        <div className="flex items-center gap-1.5">
          <Crosshair className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Debrief: Where the Time Goes</h3>
        </div>
        <span className="text-xs text-lmu-muted">vs the fastest {selectedDriver.carType} on this layout</span>
      </div>

      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-xs text-lmu-muted py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparing your best lap with the fastest {selectedDriver.carType}...
        </p>
      )}
      {state.status === 'unavailable' && <p className="text-xs text-lmu-muted py-1">{state.reason}</p>}
      {state.status === 'error' && <p className="text-xs text-rose-400 py-1">{state.message}</p>}

      {state.status === 'ready' && (
        <>
          <ReferenceLine debrief={state.debrief} />
          {state.debrief.corners.length > 0 ? (
            <ol>
              {state.debrief.corners.map((corner, i) => (
                <DebriefCornerRow
                  key={corner.cornerNumber}
                  rank={i + 1}
                  corner={corner}
                  onOpen={(cornerNumber) => navigate(debriefCornerLink(state.debrief, cornerNumber))}
                />
              ))}
            </ol>
          ) : (
            <p className="text-xs text-emerald-400 py-1">You matched or beat the reference through every corner.</p>
          )}
          <p className="text-[11px] text-lmu-muted">
            Ranked by time lost × how often you lose it ({state.debrief.lapsTimed} laps timed) × comparison confidence ({Math.round(state.debrief.confidence * 100)}%).
          </p>
          {state.debrief.caveats.map((caveat) => (
            <p key={caveat} className="text-[11px] text-amber-300">{caveat}</p>
          ))}
        </>
      )}
    </div>
  );
};
