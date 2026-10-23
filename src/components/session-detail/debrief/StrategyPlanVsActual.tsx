import type { SessionStrategy } from '../../../../shared/types/index.js';
import type { LiveRaceStrategies } from '../../../../shared/types/liveStrategy.js';

const level = (value: number | null, unit: string) => (value === null ? '—' : `${Math.round(value)}${unit === '%' ? ' %' : ' L'}`);
const tread = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)} %`);
const tyresChanged = (corners: readonly string[]) => (corners.length === 0 ? 'no change' : corners.length === 4 ? 'four tyres' : corners.join(' '));

/**
 * The plan the live dashboard showed before the start beside what the race did, side by side with no verdict: the
 * stops and pit lap, the loads, the tyres at the stop, the racing laps and the tread left at the flag.
 */
export function StrategyPlanVsActual({ plan, strategy }: { plan: LiveRaceStrategies; strategy: SessionStrategy }) {
  const { chosen, unit } = plan;
  const ve = strategy.kind === 've';
  const first = strategy.stops[0];
  const last = strategy.stops.at(-1);
  const rows: Array<[string, string, string]> = [
    ['Stops', `${chosen.stops}${chosen.pitLap !== null ? ` · lap ${chosen.pitLap}` : ''}`,
      `${strategy.stops.length}${first ? ` · lap ${first.lap}` : ''}`],
    [`${plan.kind === 've' ? 'VE' : 'Fuel'} at the start`, level(chosen.loadStart, unit), level(ve ? strategy.start.ve : strategy.start.fuel, unit)],
    ...(chosen.loadToFinish !== null || last ? [['Leaving the last stop', level(chosen.loadToFinish, unit), level(last?.levelAfter ?? null, unit)] as [string, string, string]] : []),
    ...(chosen.tyresStop !== null || last ? [['Tyres at the stop', chosen.tyresStop?.toLowerCase() ?? '—',
      strategy.stops.length ? strategy.stops.map(stop => tyresChanged(stop.tyres)).join(', ') : '—'] as [string, string, string]] : []),
    ['Racing laps', `~${plan.laps}`, `${strategy.laps}`],
    ['Tread at the flag', tread(chosen.treadAtFlag), tread(strategy.tyres.treadAtFlag)],
  ];
  return (
    <div data-testid="strategy-plan-vs-actual">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-lmu-muted mb-1">Plan vs actual · {chosen.name.toLowerCase()}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-lmu-muted text-left">
            <th className="font-normal py-0.5" />
            <th className="font-normal py-0.5">Planned</th>
            <th className="font-normal py-0.5">Actual</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, planned, actual]) => (
            <tr key={label} className="border-t border-lmu-border/40">
              <td className="py-1 text-lmu-muted">{label}</td>
              <td className="py-1 font-mono text-white">{planned}</td>
              <td className="py-1 font-mono text-white">{actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
