import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LivePage } from '../../../src/components/live/LivePage.js';
import { racePlanView } from '../../../src/components/live/race/raceAction.js';
import type { LiveSnapshot } from '../../../shared/types/live.js';
import type { LiveRacePlan, LiveStrategy } from '../../../shared/types/liveStrategy.js';
import { FakeEventSource } from '../../helpers/fakeEventSource.js';
import { liveSession, liveSnapshot, liveStrategy, liveTiming } from '../../helpers/liveSnapshot.js';

const source = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];
const send = (value: LiveSnapshot) => act(() => source().emit('snapshot', value));

const base = liveStrategy();
const withRace = (race: Partial<LiveRacePlan>, patch: Partial<LiveStrategy> = {}): LiveSnapshot => {
  const resource = base.resource;
  if (!resource?.race) throw new Error('fixture without a race plan');
  return liveSnapshot({ strategy: { ...base, ...patch, resource: { ...resource, race: { ...resource.race, ...race } } } });
};
const texts = (snapshot: LiveSnapshot) => {
  const view = racePlanView(snapshot);
  return { mode: view.mode, action: `${view.action.label}|${view.action.value}|${view.action.unit ?? ''}|${view.action.note ?? ''}`, cells: view.cells.map(cell => `${cell.label}|${cell.value}|${cell.note ?? ''}`) };
};

describe('racePlanView', () => {
  it('leads with the per-lap use mid-stint, with the spare per lap, the pit countdown, tyres and VE now', () => {
    expect(texts(withRace({}))).toEqual({
      mode: 'stint',
      action: 'VE / LAP · LAST 3|2.5|%|+0.2 % SPARE / LAP',
      cells: ['PIT IN|6|', 'TYRES · MEDIUM|91|0.4% / LAP', 'VE NOW|62|'],
    });
    expect(racePlanView(withRace({ sparePerLap: -0.3 })).action).toMatchObject({ tone: 'loss', note: '−0.3 % OVER / LAP' });
  });

  it('leads with the pit countdown two laps out: the MFD VE needed against the setting, the tyre call and the stop time', () => {
    expect(texts(withRace({ pitInLaps: 2 }))).toEqual({
      mode: 'pit',
      action: 'PIT IN|2|LAPS|',
      cells: ['VE · MFD|38|SET 50%', 'TYRES · MFD|NEW MEDIUM|', 'PIT TIME · EST.|34–41|'],
    });
    expect(racePlanView(withRace({ pitInLaps: 0 })).action).toMatchObject({ label: 'PIT', value: 'THIS LAP' });
    const short = racePlanView(withRace({ pitInLaps: 1, neededAfterStop: 62 }));
    expect(short.cells[0]).toMatchObject({ value: '62', note: 'SET 50% · RAISE', noteTone: 'loss' });
  });

  it('shows a pending penalty as a stop-and-go with the repair kept for the stop after', () => {
    const pit = { ...base.pit!, penalties: 1, serviceSeconds: null, serviceMaxSeconds: null, penaltySeconds: 10 };
    const damage = { wheel: null, body: 0.4, suspension: 0.1, partsDetached: false, impactLap: 9, lapsSinceImpact: 2, paceLossPerLap: null, lossToFinish: null, repairSeconds: 30, significant: true };
    expect(texts(withRace({ pitInLaps: 1 }, { pit, damage })).cells[2]).toBe('STOP & GO|10|THEN REPAIR 30 s');
  });

  it('leads with pace when the reserve is covered, and keeps projected finish VE secondary', () => {
    expect(texts(withRace({ finishReachable: true, atFinish: 7, pitInLaps: null, pitLap: null, sparePerLap: 0.8 }))).toMatchObject({
      mode: 'sprint', action: 'CURRENT VS BEST|—||',
    });
    expect(racePlanView(withRace({ finishReachable: true, atFinish: 7, pitInLaps: null })).cells[0]).toMatchObject({ label: 'VE AT FINISH', value: '~7' });
  });

  it('overrides every plan with PIT NOW for a flat or lost wheel, and shows the stop while in the pit', () => {
    const damage = { wheel: { problem: 'flat' as const, corner: 'RL' as const }, body: 0, suspension: 0, partsDetached: false, impactLap: 9, lapsSinceImpact: 0, paceLossPerLap: null, lossToFinish: null, repairSeconds: null, significant: true };
    expect(texts(withRace({}, { damage })).action).toBe('|PIT NOW||FLAT · REAR LEFT');
    expect(texts(withRace({}, { pit: { ...base.pit!, state: 'stopped' } })).action).toBe('PIT STOP · EST.|34–41|s|');
  });

  it('sets the MFD for a stop this lap when pitting for damage or early, not for the later planned stop', () => {
    const damage = { wheel: { problem: 'flat' as const, corner: 'RL' as const }, body: 0, suspension: 0, partsDetached: false, impactLap: 9, lapsSinceImpact: 0, paceLossPerLap: null, lossToFinish: null, repairSeconds: null, significant: true };
    // Planned in 6 laps for 38; stopping now needs 58, more than the 50 set.
    expect(racePlanView(withRace({}, { damage })).cells[0]).toMatchObject({ value: '58', note: 'SET 50% · RAISE', noteTone: 'loss' });
    expect(racePlanView(withRace({}, { pit: { ...base.pit!, state: 'entering' } })).cells[0]).toMatchObject({ value: '58', noteTone: 'loss' });
    // Even with the finish reachable, a stop for damage has its target.
    expect(racePlanView(withRace({ finishReachable: true, pitInLaps: null, neededAfterStop: null, neededStopNow: 20 }, { damage })).cells[0]).toMatchObject({ value: '20', noteTone: 'gain' });
    // The countdown to the planned stop keeps the planned target.
    expect(racePlanView(withRace({ pitInLaps: 2 })).cells[0]).toMatchObject({ value: '38' });
  });

  it('calculates until the per-lap use and the laps left are known, naming the forecast when there is one', () => {
    expect(texts(liveSnapshot({ strategy: null })).mode).toBe('calculating');
    const forecast = { change: 'rain' as const, chance: 60, atSeconds: 900, lap: 20 };
    expect(texts(withRace({}, { forecast })).cells[2]).toBe('RAIN · 60%|~LAP 20|');
  });
});

describe('race page with a plan', () => {
  beforeEach(() => {
    FakeEventSource.install();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('streams sprint pace into the primary readout and returns to pit advice when the margin is lost', () => {
    render(<LivePage />);
    send(withRace({ finishReachable: true, atFinish: 7, pitInLaps: null }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('—');
    act(() => source().emit('timing', liveTiming({ deltaSeconds: -0.184, tyreSurfaceAvgC: 92 })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('−0.184s');
    expect(screen.getByTestId('live-race-cell-1')).toHaveTextContent('VE AT FINISH~7%');
    expect(screen.queryByTestId('live-race-cell-3')).not.toBeInTheDocument();
    expect(screen.queryByText('RESERVE COVERED')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-race-deltas')).toHaveTextContent('TYRE SURFACE AVG');
    expect(screen.getByTestId('live-last-lap')).toBeInTheDocument();
    send(withRace({ finishReachable: false, pitInLaps: 0 }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('THIS LAP');
    expect(screen.getByTestId('live-race-deltas')).toHaveTextContent('CURRENT VS BEST');
  });

  it('keeps the plan readouts in place across modes, and swaps the last-lap row for the damage row only when damage matters', () => {
    render(<LivePage />);
    send(withRace({}));
    const plan = screen.getByTestId('live-race-plan');
    expect(plan).toHaveAttribute('data-mode', 'stint');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2.5%');
    send({ ...withRace({ pitInLaps: 2 }), sequence: 2 });
    expect(screen.getByTestId('live-race-plan')).toBe(plan);
    expect(plan).toHaveAttribute('data-mode', 'pit');
    expect(screen.getByTestId('live-race-cell-1')).toHaveTextContent('VE · MFD38%SET 50%');
    expect(screen.getByTestId('live-last-lap')).toBeInTheDocument();

    const damage = { wheel: null, body: 0.4, suspension: 0.1, partsDetached: false, impactLap: 9, lapsSinceImpact: 3, paceLossPerLap: 0.8, lossToFinish: 4, repairSeconds: 30, significant: true };
    send({ ...withRace({}, { damage }), sequence: 3, lapsLeft: { laps: 5, estimated: true } });
    const row = screen.getByTestId('live-damage-row');
    expect(row).toHaveTextContent('PACE LOSS · MEASURED+0.8s/lap');
    expect(row).toHaveTextContent('SINCE IMPACT3LAPS');
    expect(row).toHaveTextContent('TO FINISH · 5 LAPS+4.0s');
    expect(row).toHaveTextContent('REPAIR TIME · EST.30s');
    expect(screen.queryByTestId('live-last-lap')).not.toBeInTheDocument();
    send({ ...withRace({}, { damage: { ...damage, significant: false } }), sequence: 4 });
    expect(screen.getByTestId('live-last-lap')).toBeInTheDocument();
  });

  it('puts the forecast change in the weather slot instead of the track temperature', () => {
    render(<LivePage />);
    send(withRace({}, { forecast: { change: 'rain', chance: 60, atSeconds: 900, lap: 20 } }));
    expect(screen.getByTestId('live-forecast')).toHaveTextContent('RAIN ~LAP 20 · 60%');
    expect(screen.queryByTestId('live-track-temp')).not.toBeInTheDocument();
  });

  it('shows the garage as a checklist: what to set, what the garage holds and what to do, then the loading progress', () => {
    render(<LivePage />);
    const garage = {
      kind: 've' as const, unit: '%' as const, sessionMinutes: 15, laps: 13, lapSeconds: 75.285, perLap: 2.5, perLapSource: 'measured' as const,
      lapsMeasured: 6, reserveLaps: 0.5, needed: 34, stops: 0, setInGarage: 30,
      tyres: { compound: 'Medium', used: true, wear: 0.98, newSets: 55 },
    };
    const inGarage = (kind: 'qualifying' | 'race' | 'practice', patch: Partial<typeof garage>, sequence: number) => liveSnapshot({
      sequence, lifecycle: 'garage', session: liveSession({ kind, inRealtime: false }), strategy: { ...base, resource: null, pit: null, garage: { ...garage, ...patch } },
    });
    const rows = () => screen.getAllByTestId('live-garage-check');

    send(inGarage('qualifying', {}, 1));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('QUALIFYING');
    expect(screen.getByText('15 MIN')).toBeInTheDocument();
    expect(screen.getByTestId('live-preparation-laps')).toHaveTextContent('~13LAPS');
    expect(rows()[0]).toHaveTextContent('VE34%30%RAISE +4%');
    expect(rows()[0]).toHaveAttribute('data-action', 'change');
    // Qualifying and the race want a new set: the one carried over is a change to make.
    expect(rows()[1]).toHaveTextContent('TYRES · MEDIUMNEWUSED 98%FIT NEW');

    send(inGarage('race', { setInGarage: 40, tyres: { ...garage.tyres, used: false, wear: 1 } }, 2));
    expect(rows()[0]).toHaveAttribute('data-action', 'ok');
    expect(rows()[1]).toHaveTextContent('TYRES · MEDIUMNEWNEWOK');
    send(inGarage('race', { tyres: { ...garage.tyres, newSets: 0 } }, 3));
    expect(rows()[1]).toHaveAttribute('data-action', 'warn');
    expect(rows()[1]).toHaveTextContent('NO NEW SETS');
    // Practice: any set will do, no call.
    send(inGarage('practice', {}, 4));
    expect(rows()[1]).toHaveTextContent('TYRES · MEDIUMANYUSED 98%');
    expect(rows()[1]).not.toHaveAttribute('data-action');

    send(liveSnapshot({ sequence: 5, lifecycle: 'loading', session: null, loadingProgress: 0.42 }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('LOADING');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
