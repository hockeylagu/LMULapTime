import type { ReactNode } from 'react';
import type { LiveTimingStore } from '../../../api/liveStream.js';
import { LiveEstimatedLap } from '../LiveEstimatedLap.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, RULED } from '../raceColumns.js';
import type { RacePlanView, PlanReadout, PlanTone } from './raceAction.js';
import { COMPOUND_CLASS } from './livePlanFormat.js';
import { CompoundText } from './CompoundText.js';

const TONE: Record<Exclude<PlanTone, null>, string> = {
  gain: 'text-lmu-gain',
  loss: 'text-lmu-loss',
  warn: 'text-lmu-warn',
  muted: 'text-lmu-muted',
  ...COMPOUND_CLASS,
};
export const tone = (value: PlanTone | undefined): string => (value ? TONE[value] : '');

const LABEL = 'h-[58px] whitespace-nowrap text-[48px] font-semibold text-lmu-text-soft';
const NOTE = 'h-[60px] whitespace-nowrap text-[44px] font-semibold';

/** One plan readout: label, value, note and detail on fixed lines, shared by the race plan and the practice timing. */
export function PlanReadoutView({ readout, size, testId, children }: { readout: PlanReadout; size: 'action' | 'cell'; testId: string; children?: ReactNode }) {
  // Words (CALCULATING, THIS LAP, a tyre call) take a smaller size than figures so they fit the column.
  const words = /[A-Z]{2}/.test(readout.value);
  // A lap time (1:36.600) is too wide for a column at the figure size.
  const long = !words && readout.value.length > 6;
  const value = size === 'action'
    ? `h-[250px] ${words ? 'text-[104px] leading-[250px]' : 'text-[200px] leading-[1.2]'} tracking-[-0.04em]`
    : `h-[150px] ${words ? `${readout.value.length > 12 ? 'text-[56px]' : 'text-[68px]'} leading-[150px]` : long ? 'text-[96px] leading-[150px]' : 'text-[120px] leading-[1.2]'} tracking-[-0.025em]`;
  // The lead value is the page's title while driving a race.
  const Value = size === 'action' ? 'h1' : 'div';
  return (
    <div data-testid={testId} className="min-w-0">
      {/* Reserve both info lines even when empty, keeping labels and values still as advice changes. */}
      <h2 className={LABEL}>
        {readout.label}{readout.labelAccent && <> · <span className={tone(readout.labelAccentTone)}>{readout.labelAccent}</span></>}
      </h2>
      <Value className={`${value} overflow-hidden text-ellipsis whitespace-nowrap font-mono font-bold ${tone(readout.tone)}`}>
        {children ?? readout.value}
        {readout.unit && <span className="ml-3 text-[56px] font-normal text-lmu-text-soft">{readout.unit}</span>}
      </Value>
      <p className={`${NOTE} ${size === 'action' && !words ? 'relative -top-[48px]' : ''} ${tone(readout.noteTone)}`}>
        {readout.compoundNote ? <CompoundText text={readout.note ?? ''} /> : readout.note ?? ''}
      </p>
      <p className={`h-[60px] whitespace-nowrap ${readout.detail && readout.detail.length > 26 ? 'text-[32px]' : 'text-[40px]'} font-semibold ${tone(readout.detailTone ?? 'muted')}`}>{readout.detail ?? ''}</p>
    </div>
  );
}

/**
 * The race advice: one lead readout (pit countdown, per-lap use mid-stint, the estimated lap in a sprint, pit now)
 * and the supporting values. A finish-covered sprint gives pace two columns and keeps only resource and tread.
 */
export function LiveRacePlan({ view, store }: { view: RacePlanView; store: LiveTimingStore }) {
  return (
    <section
      aria-label="Race plan"
      data-testid="live-race-plan"
      data-mode={view.mode}
      className={`${RACE_ROW} min-h-0 flex-1 items-center`}
    >
      <div className={`${RACE_LEAD} ${view.mode === 'sprint' ? 'col-span-2' : ''}`}>
        <PlanReadoutView readout={view.action} size="action" testId="live-race-action">
          {/* Only this readout follows the timing stream; strategy and the page stay on snapshots. */}
          {view.mode === 'sprint' ? <LiveEstimatedLap store={store} /> : undefined}
        </PlanReadoutView>
      </div>
      {view.cells.map((cell, index) => (
        <div key={index} className={`${RACE_COLUMN} ${RULED} self-center`}>
          <PlanReadoutView readout={cell} size="cell" testId={`live-race-cell-${index + 1}`} />
        </div>
      ))}
    </section>
  );
}
