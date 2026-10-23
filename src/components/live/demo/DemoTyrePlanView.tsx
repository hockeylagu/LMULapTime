import { useSyncExternalStore, type ReactNode } from 'react';
import type { LiveTimingStore } from '../../../api/liveStream.js';
import type { LiveSnapshot } from '../../../../shared/types/live.js';
import { LivePedalTrace } from '../LivePedalTrace.js';
import { LivePracticeHistory } from '../LivePracticeHistory.js';
import { LiveSessionBar } from '../LiveSessionBar.js';
import { LiveStateScreen } from '../LiveStateScreen.js';
import { liveScreen } from '../liveScreens.js';
import { LiveRacePlan } from '../race/LiveRacePlan.js';
import { CompoundText } from '../race/CompoundText.js';
import type { PedalBuffer } from '../pedalBuffer.js';
import { racePlanView } from '../race/raceAction.js';
import { formatAmount, resourceName } from '../race/livePlanFormat.js';
import { LiveStrategySpeech } from '../display/LiveStrategySpeech.js';
import { planChangeCall, type DemoStopCall, type DemoTyrePlan } from './demoTyrePlan.js';
import { demoLapStart, showsStrategy } from './strategyWindow.js';

/**
 * One part of the stop call: the part that changed stays bright, the parts that stand are muted. No amber mark: the
 * medium's sidewall is the same colour, so it would read as the compound.
 */
function Part({ changed, children }: { changed: boolean; children: ReactNode }) {
  return <span className={changed ? '' : 'text-lmu-muted'}>{children}</span>;
}

/** A change of plan read at speed, in the trace's place: that it changed and why in a few words, then the whole stop. */
function PlanChangeStrip({ reason, next }: { reason?: string; next: DemoStopCall }) {
  return (
    <section aria-label="Plan changed" data-testid="demo-tyre-plan" className="flex h-full items-center gap-14 px-9">
      <div className="shrink-0">
        <p className="text-[64px] font-bold leading-tight text-lmu-warn">PLAN CHANGED</p>
        {reason && <p className="text-[48px] font-semibold leading-tight text-lmu-text-soft">{reason}</p>}
      </div>
      <p className="whitespace-nowrap font-mono text-[112px] font-bold leading-none">
        <span className="text-lmu-muted">LAP {next.lap} · </span>
        <Part changed={next.changed === 've'}>{next.ve === null ? 'NO VE' : `VE ${next.ve}%`}</Part>
        <span className="text-lmu-muted"> · </span>
        <Part changed={next.changed === 'tyres'}><CompoundText text={next.tyres} /></Part>
      </p>
    </section>
  );
}

/** On track the race view as it is, the strip taking the pedal trace's place on the first straight of each lap. */
function DemoStrategyDriving({ snapshot, store, buffer, plan }: { snapshot: LiveSnapshot; store: LiveTimingStore; buffer: PedalBuffer; plan: DemoTyrePlan }) {
  const strip = useSyncExternalStore(listener => buffer.subscribe(listener),
    () => showsStrategy(buffer.visible, demoLapStart(buffer.latest ?? 0)));
  const view = racePlanView(snapshot);
  const cells = view.cells.map(cell => ({ ...cell, ...plan.cells?.[cell.label] })) as typeof view.cells;
  const resource = snapshot.strategy?.resource;
  // Preview the next MFD target mid-stint; the shared pit view expands the setup below three laps.
  if (view.mode === 'stint' && resource?.race) {
    const countdown = cells.find(cell => cell.label === 'PIT IN');
    if (countdown) {
      const target = resource.kind === 've' && plan.next ? plan.next.ve : resource.race.neededAfterStop;
      countdown.note = target === null && plan.next ? 'MFD · NO VE' : `MFD · ${resourceName(resource.kind)} ${formatAmount(target, resource.unit)}${resource.unit}`;
      if (resource.race.stopsAfterNext > 0) countdown.detail ??= `+${resource.race.stopsAfterNext} MORE STOPS`;
    }
  }
  return <>
    <LiveSessionBar snapshot={snapshot} connection="live" />
    <LiveRacePlan view={{ ...view, cells }} store={store} />
    <LivePracticeHistory laps={snapshot.recentLaps} best={snapshot.sessionBest} store={store} completedRows={2} estimate />
    <div className="h-[294px] shrink-0 overflow-hidden border-t border-lmu-border pt-3">
      {strip && plan.next ? <PlanChangeStrip reason={plan.reason} next={plan.next} /> : <LivePedalTrace buffer={buffer} />}
    </div>
    <LiveStrategySpeech snapshot={snapshot} connection="live" buffer={buffer} plan={plan.next ? planChangeCall(plan.reason, plan.next) : null} />
  </>;
}

/**
 * The tentative tyre plan, the demo's strategy scenarios: in the garage the TYRES row takes the plan's call (the race
 * strategy under it is the real engine's); in the race the tyre cell carries the next stop's call.
 */
export function DemoTyrePlanView({ snapshot, store, buffer, plan }: { snapshot: LiveSnapshot; store: LiveTimingStore; buffer: PedalBuffer; plan: DemoTyrePlan }) {
  if (snapshot.lifecycle === 'driving') return <DemoStrategyDriving snapshot={snapshot} store={store} buffer={buffer} plan={plan} />;
  const screen = liveScreen(snapshot);
  const checks = screen.checks.map(check => check.label === 'TYRES' && plan.check ? { ...check, ...plan.check } : check);
  return <><LiveSessionBar snapshot={snapshot} connection="live" /><LiveStateScreen screen={{ ...screen, checks }} quali={plan.quali} /></>;
}
