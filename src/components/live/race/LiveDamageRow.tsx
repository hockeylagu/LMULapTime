import type { LiveDamage } from '../../../../shared/types/liveStrategy.js';
import { UNKNOWN } from '../liveFormat.js';
import { RACE_COLUMN, RACE_LEAD, RACE_ROW, UNRULED } from '../raceColumns.js';

const LABEL = 'mb-2 whitespace-nowrap text-[48px] font-semibold text-lmu-text-soft';
const VALUE = 'whitespace-nowrap font-mono text-[88px] font-semibold leading-[1.1] tracking-[-0.025em]';
const UNIT = 'ml-3 text-[48px] font-normal text-lmu-text-soft';

const signed = (value: number): string => (value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

/**
 * A red alert in the session bar's place while damage matters: the pace it costs (measured on the driver's own laps),
 * laps since the impact, the loss to the finish at that pace, and the repair time the game estimates, with the bar's
 * data status at its right end. Never a repair call: the driver weighs the two.
 */
export function LiveDamageRow({ damage, lapsLeft, status }: {
  damage: LiveDamage; lapsLeft: number | null; status: { label: string; className: string };
}) {
  const pace = damage.paceLossPerLap;
  return (
    <section
      aria-label="Damage impact"
      data-testid="live-damage-row"
      className={`${RACE_ROW} relative h-[184px] shrink-0 items-center rounded-xl bg-lmu-loss/15 ring-2 ring-inset ring-lmu-loss`}
    >
      <div className={RACE_LEAD}>
        <h2 className={LABEL}>PACE LOSS · MEASURED</h2>
        <div className={`${VALUE} ${pace ? 'text-lmu-loss' : ''}`}>
          {pace === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : signed(pace)}
          <span className={UNIT}>s/lap</span>
        </div>
      </div>
      <div className={`${RACE_COLUMN} ${UNRULED}`}>
        <h2 className={LABEL}>SINCE IMPACT</h2>
        <div className={VALUE}>
          {damage.lapsSinceImpact ?? UNKNOWN}
          <span className={UNIT}>{damage.lapsSinceImpact === 1 ? 'LAP' : 'LAPS'}</span>
        </div>
      </div>
      <div className={`${RACE_COLUMN} ${UNRULED}`}>
        <h2 className={LABEL}>{lapsLeft !== null ? `TO FINISH · ${lapsLeft} ${lapsLeft === 1 ? 'LAP' : 'LAPS'}` : 'TO FINISH'}</h2>
        <div className={`${VALUE} ${damage.lossToFinish ? 'text-lmu-loss' : ''}`}>
          {damage.lossToFinish === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : signed(damage.lossToFinish)}
          <span className={UNIT}>s</span>
        </div>
      </div>
      <div className={`${RACE_COLUMN} ${UNRULED}`}>
        <h2 className={LABEL}>REPAIR TIME · EST.</h2>
        <div className={VALUE}>
          {damage.repairSeconds === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : damage.repairSeconds}
          <span className={UNIT}>s</span>
        </div>
      </div>
      <div data-testid="live-status" className={`absolute bottom-[34px] right-9 font-mono text-[48px] font-semibold ${status.className}`}>{status.label}</div>
    </section>
  );
}
