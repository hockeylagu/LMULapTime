import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
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
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const build = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: 'loading' });
    loadRef.current(controller.signal)
      .then((debrief) => setState({ kind: 'ready', debrief }))
      .catch((err) => {
        if (isAbortError(err)) return;
        setState({ kind: 'error', message: apiErrorMessage(err, 'The debrief could not be built.') });
      });
  }, []);

  // Another pair of laps: the debrief shown belongs to the previous one.
  useEffect(() => {
    if (autoStart) build();
    else setState({ kind: 'idle' });
    return () => controllerRef.current?.abort();
  }, [pairKey, autoStart, build]);

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
              onOpen={(cornerNumber) => navigate(buildTelemetryComparePath(searchParams, debrief.yours, debrief.theirs, cornerNumber))}
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
