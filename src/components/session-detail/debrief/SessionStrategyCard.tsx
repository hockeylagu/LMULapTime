import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { SessionStrategy } from '../../../../shared/types/index.js';
import { formatTime } from '../../../../shared/domain/timing/timeFormat.js';
import { treadTone } from '../../../../shared/domain/live/liveInsights.js';
import { apiErrorMessage } from '../../../api/apiClient.js';
import type { SessionStrategyResult } from '../../../api/sessionStrategyApi.js';
import type { RequestState } from '../../../api/useRequest.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { SummaryStat } from '../overview/SummaryStat.js';
import { useModalFocus } from '../../common/useModalFocus.js';
import { StrategyPlanVsActual } from './StrategyPlanVsActual.js';

const CORNER_NAMES = { FL: 'front left', FR: 'front right', RL: 'rear left', RR: 'rear right' } as const;

function Stat({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-lmu-muted">{label}</p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-white">{children}</p>
      {note && <p className="text-[11px] text-lmu-muted">{note}</p>}
    </div>
  );
}

const amount = (value: number | null, unit: string, digits = 1) => (value === null ? '—' : `${value.toFixed(digits)}${unit === '%' ? ' %' : ' L'}`);

function StrategyMetrics({ strategy }: { strategy: SessionStrategy }) {
  const ve = strategy.kind === 've';
  const used = ve ? strategy.perLap.ve : strategy.perLap.fuel;
  const left = ve ? strategy.flag.ve : strategy.flag.fuel;
  const { tyres, pace, fuelRatio } = strategy;
  const drift = pace.first !== null && pace.last !== null && pace.laps >= 6 ? pace.last - pace.first : null;
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-4">
      <Stat label={`${ve ? 'VE' : 'Fuel'} per lap`} note={`median of ${strategy.perLap.laps} clean laps${ve && strategy.perLap.fuel !== null ? ` · ${amount(strategy.perLap.fuel, 'L', 2)} fuel` : ''}`}>
        {amount(used, ve ? '%' : 'L', 2)}
      </Stat>
      <Stat label="Left at the flag" note={strategy.flag.laps !== null ? `est. ${strategy.flag.laps.toFixed(1)} laps of use · started on ${amount(ve ? strategy.start.ve : strategy.start.fuel, ve ? '%' : 'L', 0)}` : undefined}>
        {amount(left, ve ? '%' : 'L')}
      </Stat>
      {ve && (
        <Stat label="Fuel ratio" note={fuelRatio.needed === null ? undefined : fuelRatio.set !== null && fuelRatio.set.toFixed(2) === fuelRatio.needed.toFixed(2) ? 'covers every clean lap' : `${fuelRatio.needed.toFixed(2)} covers every clean lap`}>
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
  );
}

function PitStops({ strategy }: { strategy: SessionStrategy }) {
  const ve = strategy.kind === 've';
  if (!strategy.stops.length) return <p className="text-sm text-lmu-text-soft">No pit stops · {strategy.laps} laps on one load</p>;
  return (
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
  );
}

function StrategyModal({ result, open, onClose }: { result: SessionStrategyResult; open: boolean; onClose: () => void }) {
  const dialogRef = useModalFocus(open, onClose);
  if (!open) return null;
  const { strategy, plan } = result;
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="race-strategy-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-lmu-rule/80 bg-lmu-card" onClick={event => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-lmu-border px-5 py-3">
          <h2 id="race-strategy-title" className="text-lg font-semibold text-white">Race strategy</h2>
          <button type="button" onClick={onClose} aria-label="Close strategy" className={`rounded-lg p-2 text-lmu-muted hover:bg-lmu-raised hover:text-white ${FOCUS_RING}`}>
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div role="region" aria-label="Strategy details" tabIndex={0} className={`space-y-5 overflow-y-auto px-5 py-4 ${FOCUS_RING}`}>
          {plan && <StrategyPlanVsActual plan={plan} strategy={strategy} />}
          <section aria-labelledby="strategy-pit-stops" className="space-y-2">
            <h3 id="strategy-pit-stops" className="text-sm font-semibold text-white">Pit stops</h3>
            <PitStops strategy={strategy} />
          </section>
          <section aria-labelledby="strategy-race-metrics" className="space-y-2">
            <h3 id="strategy-race-metrics" className="text-sm font-semibold text-white">{strategy.kind === 've' ? 'VE, fuel, tyres and pace' : 'Fuel, tyres and pace'}</h3>
            <StrategyMetrics strategy={strategy} />
          </section>
          <p className="text-xs text-lmu-muted">
            Consumption and wear use clean laps only, excluding start, pit and slow laps. Fuel and VE added at a stop are estimates.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StrategySummary({ strategy }: { strategy: SessionStrategy }) {
  const ve = strategy.kind === 've';
  const remaining = ve ? strategy.flag.ve : strategy.flag.fuel;
  const label = ve ? 'VE' : 'Fuel';
  const { stops } = strategy;
  return (
    <div className="grid grid-cols-2 gap-x-6">
      <SummaryStat
        label="Pit stops"
        value={stops.length}
        hint={stops.length === 0 ? 'none' : `${stops.length === 1 ? 'lap' : 'laps'} ${stops.map(stop => stop.lap).join(', ')}`}
      />
      <SummaryStat
        label={`${label} at finish`}
        value={remaining === null ? '—' : amount(remaining, ve ? '%' : 'L')}
        hint={strategy.flag.laps !== null ? `est. ${strategy.flag.laps.toFixed(1)} laps of use` : undefined}
      />
    </div>
  );
}

/** The race's strategy (read once by the debrief, which shows this card only with a recording or an error). */
export function SessionStrategyCard({ state }: { state: RequestState<SessionStrategyResult | null> }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="debrief-race-strategy" className="space-y-2.5" data-testid="session-strategy">
      <h3 id="debrief-race-strategy" className="text-sm font-semibold text-white">Race strategy</h3>
      {state.error !== null && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-lmu-loss">{apiErrorMessage(state.error, 'Could not read the strategy.')}</p>
          <button type="button" onClick={state.reload} className={SECONDARY_BUTTON}>Retry strategy</button>
        </div>
      )}
      {state.data && (
        <>
          <StrategySummary strategy={state.data.strategy} />
          <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={SECONDARY_BUTTON}>View full strategy</button>
          <StrategyModal result={state.data} open={open} onClose={() => setOpen(false)} />
        </>
      )}
    </section>
  );
}
