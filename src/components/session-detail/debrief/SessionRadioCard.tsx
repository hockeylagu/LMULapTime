import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LiveRadioOutcome, SessionRadioCall } from '../../../../shared/types/index.js';
import { apiErrorMessage } from '../../../api/apiClient.js';
import type { RequestState } from '../../../api/useRequest.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';

/** What became of a call, as a short note; null when it was said in full. */
const OUTCOME_NOTES: Record<LiveRadioOutcome, string | null> = {
  spoken: null,
  sent: 'sent, not confirmed',
  interrupted: 'cut off by a newer call',
  locked: 'not said: voice not enabled on the page',
  failed: 'not said: the voice failed',
  queued: 'not said',
  'dropped-budget': 'not said: lap budget used',
  expired: 'not said: no slot in time',
  replaced: 'not said: replaced',
  'no-client': 'not said: no dashboard open',
};

const said = (outcome: LiveRadioOutcome) => outcome === 'spoken' || outcome === 'sent' || outcome === 'interrupted';

/** The engineer's radio calls of a live-recorded session, collapsed: every call proposed, in order, and whether it was heard. */
export function SessionRadioCard({ state }: { state: RequestState<SessionRadioCall[]> }) {
  const calls = state.data ?? [];
  const heard = calls.filter(call => said(call.outcome)).length;
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="debrief-radio" className="space-y-2.5" data-testid="session-radio">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="debrief-radio" className="text-sm font-semibold text-white">
          {calls.length > 0 ? (
            <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`flex items-center gap-1 ${FOCUS_RING}`}>
              {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              Radio
            </button>
          ) : 'Radio'}
        </h3>
        {calls.length > 0 && <p className="text-[11px] text-lmu-muted">{heard} of {calls.length} said</p>}
      </div>
      {state.error !== null && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-lmu-loss">{apiErrorMessage(state.error, 'Could not read the radio log.')}</p>
          <button type="button" onClick={state.reload} className={SECONDARY_BUTTON}>Retry radio</button>
        </div>
      )}
      {open && calls.length > 0 && (
        <ol className="space-y-1.5">
          {calls.map(call => {
            const note = OUTCOME_NOTES[call.outcome];
            return (
              <li key={call.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 text-xs">
                <span className="font-mono tabular-nums text-lmu-muted">{call.lap === null ? '—' : `Lap ${call.lap}`}</span>
                <span className="min-w-0">
                  <span className={said(call.outcome) ? (call.priority === 1 ? 'font-semibold text-white' : 'text-lmu-text-soft') : 'text-lmu-muted'}>{call.text}</span>
                  {note && <span className="block text-[11px] text-lmu-muted">{note}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
