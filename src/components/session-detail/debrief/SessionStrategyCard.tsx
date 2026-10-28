import type { ReactNode } from 'react';
import { Fuel, Loader2 } from 'lucide-react';
import type { SessionStrategy } from '../../../../shared/types/index.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { treadTone } from '../../../../shared/domain/live/liveInsights.js';
import { apiErrorMessage } from '../../../api/apiClient.js';
import { fetchSessionStrategy } from '../../../api/sessionStrategyApi.js';
import { useRequest } from '../../../api/useRequest.js';
import { StrategyPlanVsActual } from './StrategyPlanVsActual.js';

const CORNER_NAMES = { FL: 'front left', FR: 'front right', RL: 'rear left', RR: 'rear right' } as const;

function Stat({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="p-2.5 rounded-lg bg-lmu-bg/60 border border-lmu-border/50">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-lmu-muted">{label}</p>
      <p className="text-sm font-mono font-bold text-white">{children}</p>
      {note && <p className="text-[11px] text-lmu-muted">{note}</p>}
    </div>
  );
}

const amount = (value: number | null, unit: string, digits = 1) => (value === null ? '—' : `${value.toFixed(digits)}${unit === '%' ? ' %' : ' L'}`);

function StrategyBody({ strategy }: { strategy: SessionStrategy }) {
  const ve = strategy.kind === 've';
  const used = ve ? strategy.perLap.ve : strategy.perLap.fuel;
  const left = ve ? strategy.flag.ve : strategy.flag.fuel;
  const { tyres, pace, fuelRatio } = strategy;
  const drift = pace.first !== null && pace.last !== null && pace.laps >= 6 ? pace.last - pace.first : null;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat label="Stops" note={strategy.stops.length ? `lap ${strategy.stops.map(stop => stop.lap).join(', ')}` : `${strategy.laps} laps on one load`}>
          {strategy.stops.length || 'None'}
        </Stat>
        <Stat label={`${ve ? 'VE' : 'Fuel'} per lap`} note={`median of ${strategy.perLap.laps} clean laps${ve && strategy.perLap.fuel !== null ? ` · ${amount(strategy.perLap.fuel, 'L', 2)} fuel` : ''}`}>
          {amount(used, ve ? '%' : 'L', 2)}
        </Stat>
        <Stat label="Left at the flag" note={strategy.flag.laps !== null ? `${strategy.flag.laps.toFixed(1)} laps of use · started on ${amount(ve ? strategy.start.ve : strategy.start.fuel, ve ? '%' : 'L', 0)}` : undefined}>
          {amount(left, ve ? '%' : 'L')}
        </Stat>
        {ve && (
          <Stat label="Fuel ratio" note={fuelRatio.needed !== null ? `${fuelRatio.needed.toFixed(2)} covers every clean lap` : undefined}>
            {fuelRatio.set === null ? '—' : fuelRatio.set.toFixed(2)}
          </Stat>
        )}
        <Stat label="Tyre wear" note={tyres.corner ? `${CORNER_NAMES[tyres.corner]}, the most worn${tyres.compound ? ` · ${tyres.compound}` : ''}` : tyres.compound ?? undefined}>
          {tyres.wearPerLap === null ? '—' : `${(tyres.wearPerLap * 100).toFixed(2)} % / lap`}
        </Stat>
        <Stat label="Tread at the flag">
          <span className={{ loss: 'text-lmu-loss', warn: 'text-lmu-warn', none: '' }[treadTone(tyres.treadAtFlag) ?? 'none']}>
            {tyres.treadAtFlag === null ? '—' : `${Math.round(tyres.treadAtFlag * 100)} %`}
          </span>
        </Stat>
        <Stat label="Clean pace" note={drift !== null ? `last 3 ${drift >= 0 ? '+' : '−'}${Math.abs(drift).toFixed(3)} s vs first 3` : undefined}>
          {pace.clean === null ? '—' : formatTime(pace.clean)}
        </Stat>
      </div>
      {strategy.stops.length > 0 && (
        <ul className="space-y-0.5 text-xs text-lmu-muted">
          {strategy.stops.map(stop => (
            <li key={stop.lap}>
              <span className="text-white">Lap {stop.lap}</span>
              {ve && stop.veAdded !== null && <> · <span className="font-mono text-white">+{stop.veAdded.toFixed(1)} %</span> VE</>}
              {stop.fuelAdded !== null && <> · <span className="font-mono text-white">+{stop.fuelAdded.toFixed(1)} L</span> fuel</>}
              {' · '}{stop.tyres.length === 0 ? 'no tyres' : stop.tyres.length === 4 ? 'four tyres' : `tyres ${stop.tyres.join(' ')}`}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-lmu-muted">
        From your own telemetry recording. Use per lap and wear come from the clean laps only (no start lap, pit laps or slow laps); a stop&apos;s load is the rise over its lap plus one lap of use.
      </p>
    </>
  );
}

/**
 * What the race used, for the next race's plan: stops, use per lap, what was left at the flag, the fuel ratio, the
 * tyre wear and the pace over the race. Sprints with no stop measure the same figures. A race recorded live adds
 * the plan shown before the start beside what it did.
 */
export function SessionStrategyCard({ sessionId }: { sessionId: string }) {
  const state = useRequest(sessionId, (id, signal) => fetchSessionStrategy(id, signal));
  return (
    <section className="space-y-3" data-testid="session-strategy">
      <div className="flex items-center gap-2">
        <Fuel className="w-3.5 h-3.5 text-lmu-warn" />
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Strategy</h4>
      </div>
      {state.loading && <p className="flex items-center gap-2 text-xs text-lmu-muted py-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading your telemetry...</p>}
      {state.error !== null && <p role="alert" className="text-xs text-lmu-loss">{apiErrorMessage(state.error, 'Could not read the strategy.')}</p>}
      {state.data && <StrategyBody strategy={state.data.strategy} />}
      {state.data?.plan && <StrategyPlanVsActual plan={state.data.plan} strategy={state.data.strategy} />}
      {!state.loading && state.error === null && !state.data && (
        <p className="text-xs text-lmu-muted py-1">No telemetry recording is linked to this race, so there is no fuel, VE or wear to read.</p>
      )}
    </section>
  );
}
