import type { ReactNode } from 'react';
import { useLiveTiming, type LiveTimingStore } from '../../../api/liveStream.js';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import { LiveDelta } from '../LiveDelta.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, RULED } from '../raceColumns.js';
import type { RacePlanView, PlanReadout, PlanTone } from './raceAction.js';

const TONE: Record<Exclude<PlanTone, null>, string> = {
  gain: 'text-lmu-gain',
  loss: 'text-lmu-loss',
  warn: 'text-lmu-warn',
  wet: 'text-lmu-blue',
  muted: 'text-lmu-muted',
};
const tone = (value: PlanTone | undefined): string => (value ? TONE[value] : '');

const LABEL = 'h-[58px] whitespace-nowrap text-[48px] font-semibold text-lmu-text-soft';
const NOTE = 'h-[60px] whitespace-nowrap text-[44px] font-semibold';

function Readout({ readout, size, testId, children }: { readout: PlanReadout; size: 'action' | 'cell'; testId: string; children?: ReactNode }) {
  // Words (CALCULATING, THIS LAP, a tyre call) take a smaller size than figures so they fit the column.
  const words = /[A-Z]{2}/.test(readout.value);
  const value = size === 'action'
    ? `h-[250px] ${words ? 'text-[104px] leading-[250px]' : 'text-[200px] leading-[1.2]'} tracking-[-0.04em]`
    : `h-[150px] ${words ? 'text-[68px] leading-[150px]' : 'text-[120px] leading-[1.2]'} tracking-[-0.025em]`;
  // The lead value is the page's title while driving a race.
  const Value = size === 'action' ? 'h1' : 'div';
  return (
    <div data-testid={testId} className="min-w-0">
      {/* Label, value and note always hold their lines, so a mode change never moves the row. */}
      <h2 className={LABEL}>{readout.label}</h2>
      <Value className={`${value} overflow-hidden text-ellipsis whitespace-nowrap font-mono font-bold ${tone(readout.tone)}`}>
        {children ?? readout.value}
        {readout.unit && <span className="ml-3 text-[56px] font-normal text-lmu-text-soft">{readout.unit}</span>}
      </Value>
      <p className={`${NOTE} ${tone(readout.noteTone)}`}>{readout.note ?? ''}</p>
      {readout.detail && <p className={`whitespace-nowrap text-[40px] font-semibold ${tone(readout.detailTone ?? 'muted')}`}>{readout.detail}</p>}
    </div>
  );
}

/** Only this readout subscribes to the 5 Hz timing stream; strategy and the page stay on snapshots. */
function SprintDelta({ store }: { store: LiveTimingStore }) {
  const timing = useLiveTiming(store);
  return <LiveDelta seconds={timing?.deltaSeconds ?? null} />;
}

/**
 * The race advice: one lead readout (pit countdown, per-lap use mid-stint, lap delta in a sprint, pit now)
 * and the supporting values. A finish-covered sprint gives pace two columns and keeps only resource and tread.
 */
export function LiveRacePlan({ snapshot, view, store }: { snapshot: LiveSnapshot; view: RacePlanView; store: LiveTimingStore }) {
  const session = snapshot.session;
  const lap = session?.playerLapsCompleted != null ? session.playerLapsCompleted + 1 : null;
  return (
    <section
      aria-label="Race plan"
      data-testid="live-race-plan"
      data-mode={view.mode}
      className={`${RACE_ROW} min-h-0 flex-1 items-center`}
    >
      <div className={`${RACE_LEAD} ${view.mode === 'sprint' ? 'col-span-2' : ''}`}>
        <Readout readout={view.action} size="action" testId="live-race-action">
          {view.mode === 'sprint' ? <SprintDelta store={store} /> : undefined}
        </Readout>
        <p data-testid="live-race-position" className="whitespace-nowrap font-mono text-[48px] font-semibold text-lmu-muted">
          LAP {lap ?? '—'} · {session?.playerPlace != null ? `P${session.playerPlace}` : '—'}
        </p>
      </div>
      {view.cells.map((cell, index) => (
        <div key={index} className={`${RACE_COLUMN} ${RULED} self-center`}>
          <Readout readout={cell} size="cell" testId={`live-race-cell-${index + 1}`} />
        </div>
      ))}
    </section>
  );
}
