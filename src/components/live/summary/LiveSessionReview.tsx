import type { LiveSessionResult } from '../../../../shared/types/liveInsights.js';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import { formatLapTime, formatSignedDelta, UNKNOWN } from '../liveFormat.js';
import { formatAmount, formatPerLap, resourceName } from '../race/livePlanFormat.js';

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="min-w-0 border-l border-lmu-border pl-10">
    <h2 className="text-[44px] font-semibold text-lmu-muted">{label}</h2>
    <div className="mt-3 whitespace-nowrap font-mono text-[96px] font-bold tracking-[-0.025em]">{value}</div>
    {note && <p className="mt-3 text-[40px] font-semibold text-lmu-text-soft">{note}</p>}
  </div>;
}

/** Live result, explicitly provisional; only captured clean laps contribute to the average. */
export function LiveSessionReview({ snapshot, result }: { snapshot: LiveSnapshot; result: LiveSessionResult }) {
  const quali = result.kind === 'qualifying';
  const settledQuali = quali && result.settled === true;
  const record = snapshot.identity?.personalBestSeconds ?? null;
  const delta = record !== null && result.bestLap !== null ? result.bestLap - record : null;
  const unit = result.resourceKind === 'fuel' ? 'L' : '%';
  const consumptionDelta = result.actualPerLap !== null && result.plannedPerLap !== null ? result.actualPerLap - result.plannedPerLap : null;
  return <section aria-label="Live session result" data-testid="live-session-review" className="flex min-h-0 flex-1 flex-col justify-center gap-10">
    <div>
      <h1 className="text-[120px] font-bold leading-tight tracking-[-0.03em]">{quali ? settledQuali ? 'QUALIFYING COMPLETE' : 'QUALIFYING · WAITING' : result.finishStatus === 2 ? 'RACE · DNF' : result.finishStatus === 3 ? 'RACE · DISQUALIFIED' : 'RACE COMPLETE'}</h1>
      {!settledQuali && <p className="mt-5 text-[48px] font-semibold text-lmu-warn">PROVISIONAL RESULT</p>}
    </div>
    <div className="grid grid-cols-3 gap-10">
      <Figure label="CLASS POSITION" value={result.classPlace !== null ? `P${result.classPlace}` : UNKNOWN} note={result.overallPlace !== null && result.overallPlace !== result.classPlace ? `OVERALL P${result.overallPlace}` : undefined}/>
      <Figure label="BEST VALID LAP" value={formatLapTime(result.bestLap)}/>
      <Figure label={quali ? 'VS PERSONAL RECORD' : 'CLEAN AVERAGE'} value={quali ? delta === null ? UNKNOWN : `${formatSignedDelta(delta)} s` : formatLapTime(result.cleanAverage)} note={quali ? undefined : `${result.cleanLaps} CLEAN LAPS${result.completeHistory ? '' : ' · CAPTURED ONLY'}`}/>
    </div>
    <div className="grid grid-cols-3 gap-10 border-t border-lmu-border pt-12">
      <Figure label={quali ? 'FITTED TYRE TREAD' : 'PIT STOPS'} value={quali ? result.tyreTread === null ? UNKNOWN : `${Math.round(result.tyreTread * 100)}%` : result.pitStops?.toString() ?? UNKNOWN}/>
      <Figure label={result.resourceKind ? `${resourceName(result.resourceKind)} REMAINING` : 'RESOURCE REMAINING'} value={`${formatAmount(result.resourceRemaining, unit)}${unit}`}/>
      <Figure label={quali ? 'MEASURED USE / LAP' : 'USE VS START PLAN'} value={quali ? `${formatPerLap(result.actualPerLap, unit)} ${unit}` : consumptionDelta === null ? UNKNOWN : `${consumptionDelta >= 0 ? '+' : '−'}${formatPerLap(Math.abs(consumptionDelta), unit)} ${unit}`} note={quali ? undefined : 'LAST CLEAN LAPS'}/>
    </div>
    {snapshot.audit?.status === 'unavailable' && <p className="text-[40px] text-lmu-muted">STRATEGY HISTORY COULD NOT BE SAVED</p>}
  </section>;
}
