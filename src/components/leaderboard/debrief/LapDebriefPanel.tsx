import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { apiErrorMessage } from '../../../api/apiClient.js';
import { useRequest } from '../../../api/useRequest.js';
import { buildTelemetryComparePath } from '../../../utils/telemetryCompareLink.js';
import { DebriefCornerRow } from '../../session-detail/debrief/DebriefCornerRow.js';
import type { LapDebrief } from './loadLapDebrief.js';

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; debrief: LapDebrief };

export interface LapDebriefPanelProps {
  /** Identifies the two laps: another key drops the debrief shown. */
  pairKey: string;
  /** Who (or which lap) the time is measured against. */
  againstLabel: string;
  load: (signal: AbortSignal) => Promise<LapDebrief>;
  /** Builds the debrief as soon as the pair is shown, without waiting for the click. */
  autoStart?: boolean;
}

/** Where one lap loses time to another, corner by corner, built when asked. */
export const LapDebriefPanel: React.FC<LapDebriefPanelProps> = ({ pairKey, againstLabel, load, autoStart = false }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // The pair asked for: shown at once with autoStart, otherwise on the click. Another pair starts over.
  const [askedPair, setAskedPair] = useState<string | null>(null);
  const asked = autoStart || askedPair === pairKey;
  const debriefAnswer = useRequest(asked ? { pairKey } : null, (_pair, signal) => load(signal));
  const state: PanelState = !asked ? { kind: 'idle' }
    : debriefAnswer.loading ? { kind: 'loading' }
    : debriefAnswer.error ? { kind: 'error', message: apiErrorMessage(debriefAnswer.error, 'The debrief could not be built.') }
    : debriefAnswer.data ? { kind: 'ready', debrief: debriefAnswer.data } : { kind: 'idle' };
  const build = () => {
    if (asked) debriefAnswer.reload();
    else setAskedPair(pairKey);
  };

  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <button
        type="button"
        onClick={build}
        disabled={state.kind === 'loading'}
        className="px-2.5 py-1 rounded-lg border border-lmu-border text-xs font-semibold text-lmu-muted hover:text-white hover:border-lmu-rule-strong transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent cursor-pointer inline-flex items-center gap-1.5 disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:cursor-wait"
      >
        <Search className="w-3.5 h-3.5" />
        {state.kind === 'loading' ? 'Reading both laps…' : "Where's the time?"}
      </button>
    );
  }

  if (state.kind === 'error') {
    return <p role="alert" className="text-xs text-lmu-loss-soft">{state.message}</p>;
  }

  const { debrief } = state;
  return (
    <div className="w-full rounded-xl border border-lmu-border bg-lmu-bg/60 px-4 py-2" aria-label="Where the time is">
      <div className="text-[10px] uppercase tracking-wider text-lmu-muted pt-1">Where the time is, against {againstLabel}</div>
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
              toLink={(cornerNumber) => buildTelemetryComparePath(searchParams, debrief.yours, debrief.theirs, cornerNumber)}
              onOpen={(cornerNumber) => void navigate(buildTelemetryComparePath(searchParams, debrief.yours, debrief.theirs, cornerNumber))}
            />
          ))}
        </ol>
      )}
      {debrief.caveats.map((caveat) => (
        <p key={caveat} className="text-[11px] text-lmu-warn-soft/80 pb-1">{caveat}</p>
      ))}
    </div>
  );
};
