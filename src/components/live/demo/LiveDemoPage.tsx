import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LiveTimingStore } from '../../../api/liveStream.js';
import { updateSearchParams } from '../../../utils/urlParams.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../common/buttonStyles.js';
import { Select } from '../../common/dropdown/Select.js';
import { LiveFrame } from '../LiveFrame.js';
import { LiveDashboardView } from '../display/LiveDashboardView.js';
import { PedalBuffer } from '../pedalBuffer.js';
import { DemoCornerView } from './DemoCornerView.js';
import { DemoTyrePlanView } from './DemoTyrePlanView.js';
import { demoTyrePlanFor } from './demoTyrePlan.js';
import { DEMO_STRAIGHT_SECONDS } from './strategyWindow.js';
import { createDemoState, DEMO_SCENARIOS } from './demoScenarios.js';
import { DEMO_CLASS_OPTIONS } from './demoClasses.js';
import { knownCarClass } from '../../../../shared/domain/vehicleMapping.js';
import { useLiveDashboardSettings } from '../../../api/useLiveDashboardSettings.js';

const GROUPS = [...new Set(DEMO_SCENARIOS.map(s => s.group))];

function buildDemo(scenario: string, carClass: string, reserveSeconds: number, pedalTraceSeconds: number) {
  const state = createDemoState(scenario, carClass, reserveSeconds);
  const timing = new LiveTimingStore();
  timing.set(state.timing);
  const buffer = new PedalBuffer(pedalTraceSeconds);
  // The strategy scenarios on track stop on the straight after the line, where the strip shows.
  const end = demoTyrePlanFor(scenario, carClass)?.cells ? Math.ceil(pedalTraceSeconds / 10) * 10 + DEMO_STRAIGHT_SECONDS : pedalTraceSeconds;
  buffer.push(Array.from({ length: end * 50 + 1 }, (_, i) => pedalSample(i / 50)));
  return { state, timing, buffer };
}

/** Explicit opt-in: mounts no game stream and needs no backend or recorded files. */
export default function LiveDemoPage() {
  const { reserveSeconds, pedalTraceSeconds } = useLiveDashboardSettings();
  const [params, setParams] = useSearchParams();
  const requested = params.get('scenario') ?? 'race';
  const requestedIndex = DEMO_SCENARIOS.findIndex(s => s.id === requested);
  const index = requestedIndex < 0 ? DEMO_SCENARIOS.findIndex(s => s.id === 'race') : requestedIndex;
  const selected = DEMO_SCENARIOS[index];
  const requestedClass = params.get('carClass');
  const carClass = knownCarClass(requestedClass) ?? 'GT3';
  const [tour, setTour] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [controls, setControls] = useState(params.get('controls') !== 'hidden');
  // The stores are mutable (the animation pushes pedal samples), so they live in state, rebuilt when the inputs change.
  const demoKey = `${selected.id}|${carClass}|${reserveSeconds}|${pedalTraceSeconds}`;
  const [demo, setDemo] = useState(() => ({ key: demoKey, ...buildDemo(selected.id, carClass, reserveSeconds, pedalTraceSeconds) }));
  if (demo.key !== demoKey) setDemo({ key: demoKey, ...buildDemo(selected.id, carClass, reserveSeconds, pedalTraceSeconds) });
  const { state, timing, buffer } = demo;
  const tyrePlan = demoTyrePlanFor(selected.id, carClass);

  useEffect(() => {
    const previous = document.title;
    document.title = 'LMU Live · Demo';
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    if (!tour) return;
    const timer = setInterval(() => {
      updateSearchParams(params, setParams, { scenario: DEMO_SCENARIOS[(index + 1) % DEMO_SCENARIOS.length].id });
    }, 5000);
    return () => clearInterval(timer);
  }, [tour, index, params, setParams]);
  useEffect(() => {
    if (!animate || state.connection !== 'live' || (state.snapshot?.lifecycle !== 'driving' && state.snapshot?.lifecycle !== 'starting')) return;
    let t = buffer.latest ?? 0;
    const timer = setInterval(() => { t += 0.05; buffer.push([pedalSample(t)]); }, 50);
    return () => clearInterval(timer);
  }, [animate, state, buffer]);

  const choose = (id: string) => updateSearchParams(params, setParams, { scenario: id });
  return <>
    <LiveFrame>{selected.id === 'corners' && state.snapshot ? <DemoCornerView snapshot={state.snapshot} store={timing} buffer={buffer} />
      : tyrePlan && state.snapshot ? <DemoTyrePlanView snapshot={state.snapshot} store={timing} buffer={buffer} plan={tyrePlan} />
        : <LiveDashboardView snapshot={state.snapshot} connection={state.connection} timing={timing} buffer={buffer} />}</LiveFrame>
    <aside aria-label="Offline demo controls" className="fixed bottom-3 left-1/2 z-50 w-max max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl border border-lmu-border bg-lmu-card p-3 font-sans text-sm text-lmu-text shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        <strong className="text-lmu-warn">DEMO · SAMPLE DATA</strong>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => setControls(!controls)} aria-expanded={controls}>{controls ? 'Hide controls' : 'Show controls'}</button>
        {!controls && <span className="text-lmu-text-soft">{selected.label}</span>}
      </div>
      {controls && <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="demo-scenario">Scenario <span className="font-mono">{index + 1}/{DEMO_SCENARIOS.length}</span></label>
        <Select id="demo-scenario" value={selected.id} onChange={choose} size="compact" className="w-72"
          options={GROUPS.map(group => ({ group, options: DEMO_SCENARIOS.filter(s => s.group === group).map(s => ({ value: s.id, label: s.label })) }))} />
        <label htmlFor="demo-class">Car class</label>
        <Select id="demo-class" value={carClass} onChange={value => updateSearchParams(params, setParams, { carClass: value === 'GT3' ? null : value })}
          options={DEMO_CLASS_OPTIONS.map(option => ({ value: option.id, label: option.label }))} size="compact" className="w-40" />
        <button type="button" className={SECONDARY_BUTTON} onClick={() => choose(DEMO_SCENARIOS[(index - 1 + DEMO_SCENARIOS.length) % DEMO_SCENARIOS.length].id)}>Previous</button>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => choose(DEMO_SCENARIOS[(index + 1) % DEMO_SCENARIOS.length].id)}>Next</button>
        <button type="button" className={SECONDARY_BUTTON} aria-pressed={tour} onClick={() => { if (!tour) choose(DEMO_SCENARIOS[0].id); setTour(!tour); }}>{tour ? 'Stop tour' : 'Tour all · 5 s each'}</button>
        <label className="flex items-center gap-2"><input type="checkbox" checked={animate} onChange={e => setAnimate(e.target.checked)} className={FOCUS_RING} />Animate pedals</label>
        <a href="#/live" className={`text-lmu-text-soft underline underline-offset-4 ${FOCUS_RING}`}>Exit demo</a>
        {requested !== selected.id && <p role="status" className="w-full text-lmu-warn">Unknown scenario “{requested}”. Showing mid-stint.</p>}
        {requestedClass && !knownCarClass(requestedClass) && <p role="status" className="w-full text-lmu-warn">Unknown car class “{requestedClass}”. Using GT3.</p>}
      </div>}
    </aside>
  </>;
}

function pedalSample(t: number) {
  const phase = t % 10;
  return { t, brake: phase < 1 ? phase * 0.9 : phase < 3 ? 0.9 * (1 - (phase - 1) / 2) ** 2 : 0,
    throttle: phase < 3.2 ? 0 : Math.min(1, (phase - 3.2) / 2) };
}
