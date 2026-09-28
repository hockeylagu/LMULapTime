import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import type { LeaderboardEntry } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { buildTelemetryComparePath } from '../../../utils/telemetryCompareLink.js';
import { DebriefCornerRow } from '../../session-detail/debrief/DebriefCornerRow.js';
import { loadRivalDebrief, RivalDebrief } from './loadRivalDebrief.js';

export interface RivalDebriefPanelProps {
  player: LeaderboardEntry;
  rival: LeaderboardEntry;
}

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; debrief: RivalDebrief };

/** The debrief against the rival, built when asked: where the time is and what to change. */
export const RivalDebriefPanel: React.FC<RivalDebriefPanelProps> = ({ player, rival }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const pairKey = `${player.bestLap.sessionId}:${player.bestLap.lapNum}|${rival.driverName}:${rival.bestLap.sessionId}:${rival.bestLap.lapNum}`;

  // Another pair of laps: the debrief shown belongs to the previous one.
  useEffect(() => {
    setState({ kind: 'idle' });
    return () => controllerRef.current?.abort();
  }, [pairKey]);

  const build = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: 'loading' });
    loadRivalDebrief(player, rival, controller.signal)
      .then((debrief) => setState({ kind: 'ready', debrief }))
      .catch((err) => {
        if (isAbortError(err)) return;
        setState({ kind: 'error', message: apiErrorMessage(err, 'The debrief could not be built.') });
      });
  };

  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <button
        type="button"
        onClick={build}
        disabled={state.kind === 'loading'}
        className="px-2.5 py-1 rounded-lg border border-sky-500/40 text-xs font-bold text-sky-300 hover:bg-sky-500/10 transition-all cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
      >
        <Search className="w-3.5 h-3.5" />
        {state.kind === 'loading' ? 'Reading both laps…' : "Where's the time?"}
      </button>
    );
  }

  if (state.kind === 'error') {
    return <p role="alert" className="text-xs text-rose-300">{state.message}</p>;
  }

  const { debrief } = state;
  return (
    <div className="rounded-xl border border-lmu-border bg-lmu-bg/60 px-4 py-2" aria-label="Where the time is">
      <div className="text-[10px] uppercase tracking-wider text-lmu-muted pt-1">Where the time is, against {rival.driverName}</div>
      {debrief.corners.length === 0 ? (
        <p className="text-xs text-lmu-muted py-2">No corner loses more than a few hundredths: the gap is spread along the lap.</p>
      ) : (
        <ol>
          {debrief.corners.map((corner, i) => (
            <DebriefCornerRow
              key={corner.cornerNumber}
              rank={i + 1}
              corner={corner}
              hasTechnique={false}
              onOpen={(cornerNumber) => navigate(buildTelemetryComparePath(searchParams, debrief.yours, debrief.theirs, cornerNumber))}
            />
          ))}
        </ol>
      )}
      {debrief.caveats.map((caveat) => (
        <p key={caveat} className="text-[11px] text-amber-300/80 pb-1">{caveat}</p>
      ))}
    </div>
  );
};
