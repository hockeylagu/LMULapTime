import type { GarageCheck } from './liveScreens.js';
import { UNKNOWN } from './liveFormat.js';
import { CompoundText } from './race/CompoundText.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, RULED, UNRULED } from './raceColumns.js';

const ACTION_TONE: Record<NonNullable<GarageCheck['action']>['tone'], string> = {
  ok: 'text-lmu-gain',
  change: 'text-lmu-loss',
  warn: 'text-lmu-warn',
};

const HEAD = 'whitespace-nowrap text-[48px] font-semibold text-lmu-muted';
// Words (NEW, USED MED) take a smaller size than figures so they fit the column at the same baseline.
const value = (text: string): string =>
  `h-[144px] whitespace-nowrap font-mono font-bold tracking-[-0.025em] leading-[144px] ${/[A-Z]{2}/.test(text) ? 'text-[96px]' : 'text-[120px]'}`;

/** A value, with the compound after it; MEDIUM reads MED so `USED MED` fits the column. Compounds take their colour. */
function Value({ text, unit, compound, className = '' }: { text: string; unit?: string; compound?: string; className?: string }) {
  return (
    <div className={`${value(text)} ${className}`}>
      <CompoundText text={compound ? `${text} ${compound.replace('MEDIUM', 'MED')}` : text} />
      {unit && <span className="ml-3 text-[56px] font-normal text-lmu-text-soft">{unit}</span>}
    </div>
  );
}

/**
 * The garage before a session as a checklist on the race columns: what to set, what the garage holds now, and the
 * one thing to do about it (raise the VE, fit new tyres), so the answer reads without comparing two numbers.
 */
export function LiveGarageChecklist({ checks, compact = false }: { checks: GarageCheck[]; compact?: boolean }) {
  return (
    <section aria-label="Garage checklist" data-testid="live-garage-checks" className={compact ? '' : 'mt-16'}>
      <div aria-hidden="true" className={`${RACE_ROW} pb-4`}>
        <span className={RACE_LEAD} />
        <span className={`${RACE_COLUMN} ${UNRULED} ${HEAD}`}>TO SET</span>
        <span className={`${RACE_COLUMN} ${UNRULED} ${HEAD}`}>IN GARAGE</span>
        <span className={`${RACE_COLUMN} ${UNRULED}`} />
      </div>
      {checks.map((check) => (
        <div
          key={check.label}
          data-testid="live-garage-check"
          data-action={check.action?.tone}
          className={`${RACE_ROW} items-center border-t border-lmu-border py-6`}
        >
          <div className={RACE_LEAD}>
            <h2 className="whitespace-nowrap text-[64px] font-semibold text-lmu-text">
              {check.label}
            </h2>
            {check.note && <p className="mt-3 text-[36px] font-semibold text-lmu-muted">{check.note}</p>}
          </div>
          <div className={`${RACE_COLUMN} ${RULED}`}><Value text={check.target} unit={check.unit} /></div>
          <div className={`${RACE_COLUMN} ${RULED}`}><Value text={check.current} unit={check.unit} compound={check.current === UNKNOWN ? undefined : check.compound} className="text-lmu-text-soft" /></div>
          <div className={`${RACE_COLUMN} ${RULED}`}>
            <div className={`h-[144px] whitespace-nowrap font-mono ${check.action && check.action.text.length > 9 ? 'text-[72px]' : 'text-[96px]'} font-bold leading-[144px] tracking-[-0.025em] ${check.action ? ACTION_TONE[check.action.tone] : ''}`}>
              {check.action?.text ?? ''}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
