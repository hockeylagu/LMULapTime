import type { LiveSnapshot } from '../../../../shared/types/live.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, RULED } from '../raceColumns.js';
import { racePlanView, type PlanReadout, type PlanTone } from './raceAction.js';

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

function Readout({ readout, size, testId }: { readout: PlanReadout; size: 'action' | 'cell'; testId: string }) {
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
        {readout.value}
        {readout.unit && <span className="ml-3 text-[56px] font-normal text-lmu-text-soft">{readout.unit}</span>}
      </Value>
      <p className={`${NOTE} ${tone(readout.noteTone)}`}>{readout.note ?? ''}</p>
    </div>
  );
}

/**
 * The race advice: one lead readout (pit countdown, per-lap use mid-stint, spare per lap in a sprint, pit now)
 * and three fixed cells beside it (the MFD values, tyres, pit time or the forecast).
 */
export function LiveRacePlan({ snapshot }: { snapshot: LiveSnapshot }) {
  const view = racePlanView(snapshot);
  const session = snapshot.session;
  const lap = session?.playerLapsCompleted != null ? session.playerLapsCompleted + 1 : null;
  return (
    <section
      aria-label="Race plan"
      data-testid="live-race-plan"
      data-mode={view.mode}
      className={`${RACE_ROW} min-h-0 flex-1 items-center`}
    >
      <div className={RACE_LEAD}>
        <Readout readout={view.action} size="action" testId="live-race-action" />
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
