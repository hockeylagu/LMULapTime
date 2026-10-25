import type { ReactNode } from 'react';
import type { LiveRaceStrategies, LiveRaceStrategyBasis, LiveRaceStrategy as Strategy } from '../../../shared/types/liveStrategy.js';
import { LIVE_TYRE_TREAD_FLOOR } from '../../../shared/domain/live/liveInsights.js';
import { CompoundText } from './race/CompoundText.js';

const LABEL = 'whitespace-nowrap text-[32px] font-semibold text-lmu-text-soft';

const UNIT = 'ml-2 font-sans text-[44px] font-semibold text-lmu-text-soft';

/** The tyres as the checklist says them: `NEW MED`, in the compound's colour. */
const Tyres = ({ text }: { text: string }) => <CompoundText text={text.replace('MEDIUM', 'MED')} />;

/** Where the use and the wear come from, when not from the event's own laps; nothing once the event measured both. */
export function basisText(basis: LiveRaceStrategyBasis | undefined): string | null {
  if (!basis) return null;
  const races = basis.races === 1 ? 'YOUR LAST RACE' : `YOUR LAST ${basis.races} RACES`;
  if (basis.wear === 'learned') return `WEAR LEARNED (${basis.sessions ?? 0})${basis.use === 'history' ? ` · USE FROM ${races}` : basis.use === 'game' ? ' · GAME ESTIMATE' : ''}`;
  if (basis.use === 'history' && basis.wear === 'history') return `FROM ${races}`;
  if (basis.use === 'history') return `USE FROM ${races}`;
  if (basis.wear === 'history') return `WEAR FROM ${races}${basis.use === 'game' ? ' · GAME ESTIMATE' : ''}`;
  return basis.use === 'game' ? 'GAME ESTIMATE' : null;
}

/**
 * One figure as two grid cells, so every label shares the top row and every value the bottom one on a common
 * baseline, whatever its size. The unit (`%`, `· LAP 17`) is set small, as in the race plan.
 */
function Stat({ label, value, unit, className = '', large = false }: { label: string; value: ReactNode; unit?: string; className?: string; large?: boolean }) {
  return <>
    <p className={LABEL}>{label}</p>
    <p className={`whitespace-nowrap font-mono font-bold leading-none ${large ? 'text-[96px]' : 'text-[64px]'} ${className}`}>
      {value}{unit && <span className={UNIT}>{unit}</span>}
    </p>
  </>;
}

/** The VE plan first and largest (how many stops, what to load), then the race tyres and the tread they finish on. */
function StrategyCard({ strategy, resource, unit }: { strategy: Strategy; resource: string; unit: string }) {
  const tread = strategy.treadAtFlag;
  return (
    <div className="grid grid-flow-col grid-rows-[auto_auto] items-baseline justify-between gap-y-3 rounded-2xl border-2 border-lmu-accent bg-lmu-card px-10 py-5">
      <Stat label="STOPS" value={strategy.stops === 0 ? 'NONE' : strategy.stops} large
        unit={strategy.stops > 0 && strategy.pitLap !== null ? `· LAP ${strategy.pitLap}` : undefined} />
      <Stat label={`${resource} START`} value={strategy.loadStart} unit={unit} large />
      {strategy.loadToFinish !== null && <Stat label={`${resource} TO FINISH`} value={strategy.loadToFinish} unit={unit} large />}
      <Stat label="TYRES START" value={<Tyres text={strategy.tyresStart} />} />
      {strategy.tyresStop !== null && <Stat label="TYRES AT STOP" value={<Tyres text={strategy.tyresStop} />} />}
      <Stat label="TREAD AT FLAG" value={tread === null ? '—' : `~${Math.round(tread * 100)}`} unit={tread === null ? undefined : `%${strategy.treadCorner ? ` ${strategy.treadCorner}` : ''}`}
        className={tread !== null && tread < LIVE_TYRE_TREAD_FLOOR ? 'text-lmu-loss' : ''} />
    </div>
  );
}

/**
 * The race plan the strategy engine chose in the garage before the race, and on one line the next best, by what it
 * changes and what it costs: the engineer's call, nothing to pick. `quali` names the set qualifying takes, when known.
 */
export function LiveRaceStrategy({ strategies, quali }: { strategies: LiveRaceStrategies; quali?: string }) {
  const { chosen, nextBest: next } = strategies;
  const resource = strategies.kind === 've' ? 'VE' : 'FUEL';
  const basis = basisText(strategies.basis);
  return (
    <section aria-label="Race strategy" data-testid="live-race-strategy" className="shrink-0 border-t border-lmu-border pt-3">
      <div className="flex items-baseline gap-8">
        <h2 className="whitespace-nowrap text-[48px] font-bold leading-tight text-lmu-text">
          RACE STRATEGY · {chosen.name}
          {quali && <> · QUALI ON <Tyres text={quali} /></>}
        </h2>
        <span className={LABEL}>{strategies.raceMinutes} MIN · ~{strategies.laps} LAPS{basis && ` · ${basis}`}</span>
      </div>
      <div className="mt-2"><StrategyCard strategy={chosen} resource={resource} unit={strategies.unit} /></div>
      {next && <p className={`${LABEL} mt-2 px-10 text-lmu-muted`}>
        NEXT BEST · {next.name}
        {next.gapSeconds !== null && <> · <span className="font-mono">{next.gapSeconds < 0 ? '−' : '+'}{Math.abs(next.gapSeconds).toFixed(1)} s</span></>}
        {/* Only where it differs from the chosen plan: the line says what the alternative would change. */}
        {next.loadStart !== chosen.loadStart && <> · {resource} START <span className="font-mono">{next.loadStart}{strategies.unit}</span></>}
        {next.tyresStart !== chosen.tyresStart && <> · START <Tyres text={next.tyresStart} /></>}
        {next.tyresStop !== null && next.tyresStop !== chosen.tyresStop && <> · AT STOP <Tyres text={next.tyresStop} /></>}
        {/* Quicker but not chosen: the tyres would not last. */}
        {next.treadAtFlag !== null && next.treadAtFlag < LIVE_TYRE_TREAD_FLOOR && <> · <span className="text-lmu-loss">TREAD AT FLAG ~{Math.round(next.treadAtFlag * 100)}%</span></>}
      </p>}
    </section>
  );
}
