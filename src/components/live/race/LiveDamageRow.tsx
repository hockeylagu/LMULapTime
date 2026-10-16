import type { LiveDamage } from '../../../../shared/types/liveStrategy.js';
import { UNKNOWN } from '../liveFormat.js';

const LABEL = 'mb-2 whitespace-nowrap text-[48px] font-semibold text-lmu-text-soft';
const VALUE = 'whitespace-nowrap font-mono text-[88px] font-semibold leading-[1.1] tracking-[-0.025em]';
const UNIT = 'ml-3 text-[48px] font-normal text-lmu-text-soft';

const signed = (value: number): string => (value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1));

/**
 * Takes the last-lap row's place while damage matters: the pace it costs (measured on the driver's own laps),
 * laps since the impact, the loss to the finish at that pace, and the repair time the game estimates.
 * Never a repair call: the driver weighs the two.
 */
export function LiveDamageRow({ damage, lapsLeft }: { damage: LiveDamage; lapsLeft: number | null }) {
  const pace = damage.paceLossPerLap;
  return (
    <section
      aria-label="Damage impact"
      data-testid="live-damage-row"
      className="grid h-[184px] shrink-0 grid-cols-[1.3fr_1fr_1fr_1fr] items-center rounded-xl border border-lmu-loss/40 px-9"
    >
      <div>
        <h2 className={LABEL}>PACE LOSS · MEASURED</h2>
        <div className={`${VALUE} ${pace ? 'text-lmu-loss' : ''}`}>
          {pace === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : signed(pace)}
          <span className={UNIT}>s/lap</span>
        </div>
      </div>
      <div>
        <h2 className={LABEL}>SINCE IMPACT</h2>
        <div className={VALUE}>
          {damage.lapsSinceImpact ?? UNKNOWN}
          <span className={UNIT}>{damage.lapsSinceImpact === 1 ? 'LAP' : 'LAPS'}</span>
        </div>
      </div>
      <div>
        <h2 className={LABEL}>{lapsLeft !== null ? `TO FINISH · ${lapsLeft} ${lapsLeft === 1 ? 'LAP' : 'LAPS'}` : 'TO FINISH'}</h2>
        <div className={`${VALUE} ${damage.lossToFinish ? 'text-lmu-loss' : ''}`}>
          {damage.lossToFinish === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : signed(damage.lossToFinish)}
          <span className={UNIT}>s</span>
        </div>
      </div>
      <div>
        <h2 className={LABEL}>REPAIR TIME · EST.</h2>
        <div className={VALUE}>
          {damage.repairSeconds === null ? <span className="text-lmu-muted">{UNKNOWN}</span> : damage.repairSeconds}
          <span className={UNIT}>s</span>
        </div>
      </div>
    </section>
  );
}
