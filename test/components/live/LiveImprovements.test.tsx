import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LivePage } from '../../../src/components/live/LivePage.js';
import { LiveStateScreen } from '../../../src/components/live/LiveStateScreen.js';
import { racePlanView } from '../../../src/components/live/race/raceAction.js';
import { liveScreen } from '../../../src/components/live/liveScreens.js';
import { FakeEventSource } from '../../helpers/fakeEventSource.js';
import { liveSession, liveSnapshot, liveStrategy } from '../../helpers/liveSnapshot.js';
import type { LiveSessionResult } from '../../../shared/types/liveInsights.js';
import { planGarage } from '../../../shared/domain/live/liveResourcePlan.js';

const result: LiveSessionResult = { kind: 'qualifying', settled: true, trackName: 'Bahrain', vehicleName: 'Ferrari', classPlace: 4, overallPlace: 12, finishStatus: 1,
  bestLap: 121.406, cleanAverage: 122, cleanLaps: 3, completeHistory: true, pitStops: 0, resourceKind: 've', resourceRemaining: 20,
  actualPerLap: 2.5, plannedPerLap: 2.6, tyreTread: 0.93 };

describe('live dashboard improvements', () => {
  it('shows the estimated first pit lap in the planned-stop preparation preview', () => {
    const garage = { ...planGarage({ kind: 've', formationLap: true, sessionSeconds: 2700, lapSeconds: 121.4, perLap: 4.5,
      perLapSource: 'measured', lapsMeasured: 8, reserveLaps: .5, capacity: 100, setInGarage: 100 }), tyres: null };
    const makeScreen = () => liveScreen(liveSnapshot({ lifecycle: 'garage', strategy: liveStrategy({ garage }) }));
    const { rerender } = render(<LiveStateScreen screen={makeScreen()} />);
    expect(screen.getByText('45 MIN · 1 STOP PLANNED · PIT ~LAP 20')).toBeInTheDocument();
    garage.firstPitLap = null;
    rerender(<LiveStateScreen screen={makeScreen()} />);
    expect(screen.getByText('45 MIN · 1 STOP PLANNED · PIT LAP UNKNOWN')).toBeInTheDocument();
  });
  it('omits repeated matching settings and routine counts while retaining actual mismatches and uncertainty', () => {
    const strategy = liveStrategy();
    strategy.resource!.race!.pitInLaps = 1;
    strategy.resource!.race!.neededAfterStop = 50;
    strategy.fuelRatio = { recommended: .84, source: 'measured', pairedLaps: 8, garageSetting: .84, mfdSetting: .84, excessLitres: 0, fuelBiasLaps: .3 };
    strategy.forecast = { change: 'rain', chance: 80, atSeconds: 2000, lap: 18 };
    const matching = racePlanView(liveSnapshot({ strategy }));
    expect(matching.cells[0].note).toBeUndefined();
    expect(matching.cells[0].detail).toBe('RATIO 0.84');
    expect(matching.cells[1].note).toBeUndefined();
    expect(matching.cells[2]?.note).toBeUndefined();
    strategy.pit!.mfd!.resourceValue = 40;
    expect(racePlanView(liveSnapshot({ strategy })).cells[0].note).toBe('SET 40% · RAISE');
    strategy.pit!.mfd!.resourceValue = null;
    expect(racePlanView(liveSnapshot({ strategy })).cells[0].note).toBe('MFD NOT READ');
  });
  it('keeps the finish-covered view to pace, finish resource and tread, with no unchangeable ratio or routine subtitles', () => {
    const strategy = liveStrategy();
    strategy.resource!.race = { ...strategy.resource!.race!, finishReachable: true, atFinish: 7, pitInLaps: null };
    strategy.fuelRatio = { recommended: .84, source: 'measured', pairedLaps: 8, mfdSetting: .8, garageSetting: .84, excessLitres: 0, fuelBiasLaps: .3 };
    strategy.tyres!.coverage = { target: 'finish', projectedTread: .87, setsNeeded: 0, availableSetsCover: true };
    const view = racePlanView(liveSnapshot({ strategy }));
    expect(view.mode).toBe('sprint');
    expect(view.action.note).toBeUndefined();
    expect(view.cells).toHaveLength(2);
    expect(view.cells[0].note).toBeUndefined();
    expect(view.cells[1]).toMatchObject({ label: 'TREAD AT FINISH', value: '~87' });
    expect(view.cells[1].note).toBeUndefined();
    expect(view.cells[1].detail).toBeUndefined();
    strategy.tyres!.coverage.projectedTread = .39;
    expect(racePlanView(liveSnapshot({ strategy })).cells[1]).toMatchObject({ note: 'BELOW 40% MIN', tone: 'loss' });
  });

  it('requests a new set without inventing a compound when the fitted compound is unknown', () => {
    const strategy = liveStrategy();
    strategy.resource!.race!.pitInLaps = 0;
    strategy.pit!.mfd!.tyres = 'No Change';
    strategy.tyres = { ...strategy.tyres!, compound: null, coverage: { target: 'pit', projectedTread: .35, setsNeeded: 1, availableSetsCover: true } };
    expect(racePlanView(liveSnapshot({ strategy })).cells[1]).toMatchObject({ value: 'NEW SET', note: 'SET NO CHANGE' });
  });
  beforeEach(() => { FakeEventSource.install(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('promotes a modest measured saving scenario without claiming it is achievable, and keeps pit advice for a large deficit', () => {
    const strategy = liveStrategy();
    const resource = { ...strategy.resource!, saving: { targetPerLap: 2.4, savePerLap: 0.1, savePercent: 4, shortfall: 1, source: 'measured' as const } };
    const snapshot = liveSnapshot({ strategy: { ...strategy, resource } });
    expect(racePlanView(snapshot)).toMatchObject({ mode: 'saving', action: { label: 'TO SKIP STOP', value: '2.40', note: 'SAVE 0.10 %/LAP' } });
    resource.saving.savePercent = 30;
    expect(racePlanView(snapshot).mode).toBe('stint');
    resource.saving.savePercent = 4; resource.lapsMeasured = 1;
    expect(racePlanView(snapshot).mode).toBe('stint');
  });

  it('shows actual pit settings alongside targets and flags a tyre change when projected tread runs out', () => {
    const strategy = liveStrategy();
    const view = racePlanView(liveSnapshot({ strategy: { ...strategy,
      resource: { ...strategy.resource!, race: { ...strategy.resource!.race!, pitInLaps: 1 } },
      pit: { ...strategy.pit!, mfd: { resourceValue: 20, resourceText: '20%', tyres: 'No Change', repair: 'Repair All', fuelRatio: 0.8 } },
      tyres: { ...strategy.tyres!, coverage: { target: 'pit', projectedTread: 0.35, setsNeeded: 1, availableSetsCover: true } },
      fuelRatio: { recommended: 0.84, source: 'measured', pairedLaps: 5, mfdSetting: 0.8, garageSetting: 0.86, excessLitres: 0, fuelBiasLaps: -0.5 },
    } }));
    expect(view.cells[0]).toMatchObject({ note: 'SET 20% · RAISE', detail: 'RATIO 0.84 · SET 0.80' });
    expect(view.cells[1]).toMatchObject({ value: 'NEW MEDIUM', note: 'SET NO CHANGE', noteTone: 'loss' });
    expect(view.cells[2]?.note).toBe('REPAIR: ALL');
  });

  it('includes qualifying context and the actual fuel ratio in race preparation', () => {
    const strategy = liveStrategy();
    const screen = liveScreen(liveSnapshot({ lifecycle: 'garage', session: liveSession({ inRealtime: false }), qualifyingResult: result,
      strategy: { ...strategy, garage: { kind: 've', unit: '%', sessionMinutes: 20, laps: 10, lapSeconds: 120, perLap: 2.5, perLapSource: 'measured', lapsMeasured: 3,
        reserveLaps: 0.5, needed: 27, stops: 0, setInGarage: 30, tyres: null },
        fuelRatio: { recommended: 0.84, source: 'game', pairedLaps: 0, garageSetting: 0.86, mfdSetting: null, excessLitres: 0.54, fuelBiasLaps: null } },
    }));
    expect(screen.note).toBe('QUALI P4 2:01.406');
    expect(screen.preparation).toEqual({ laps: 9, length: '20 MIN', stopPlan: 'NO STOP PLANNED' });
    expect(screen.checks[1]).toMatchObject({ label: 'FUEL RATIO', target: '0.84', current: '0.86', action: { text: 'LOWER' } });
    expect(screen.checks[0].note).toBeUndefined();
    expect(screen.checks[1].note).toBe('GAME ESTIMATE');
    // On the grid the clock is the countdown to the start: no length, laps or stop plan until the green flag.
    const grid = liveScreen(liveSnapshot({ lifecycle: 'garage', session: liveSession({ inRealtime: false }),
      strategy: { ...strategy, garage: { kind: 've', unit: '%', sessionMinutes: null, laps: null, lapSeconds: 120, perLap: 2.5, perLapSource: 'measured',
        lapsMeasured: 3, reserveLaps: 0.5, needed: null, stops: null, setInGarage: 30, tyres: null } } }));
    expect(grid.preparation).toEqual({ laps: null, length: 'LAPS AT THE START', stopPlan: null });
  });

  it('promotes preparation laps out of the subtitle and shows unknown laps without inventing a count', () => {
    const preparation = { title: 'RACE', note: '', muted: false, checks: [], showTrace: false,
      preparation: { laps: 11, length: '20 MIN', stopPlan: 'NO STOP PLANNED' } };
    const { rerender } = render(<LiveStateScreen screen={preparation} />);
    expect(screen.getByTestId('live-preparation-laps')).toHaveTextContent('~11LAPS');
    expect(screen.getByText('20 MIN · NO STOP PLANNED')).toBeInTheDocument();
    rerender(<LiveStateScreen screen={{ ...preparation, preparation: { ...preparation.preparation, laps: null } }} />);
    expect(screen.getByTestId('live-preparation-laps')).toHaveTextContent('—LAPS');
  });

  it('shows passive post-qualifying and post-race summaries with partial-history labels and silent automatic saving', () => {
    render(<LivePage />);
    const send = (kind: 'qualifying' | 'race', settled = true) => act(() => FakeEventSource.byUrl('/api/live/stream').emit('snapshot', liveSnapshot({
      lifecycle: 'garage', session: liveSession({ kind, inRealtime: false, gamePhase: 8 }), result: { ...result, kind, completeHistory: false, settled },
      audit: { runId: 'saved-session', status: 'recording' },
      identity: { layoutKey: 'bahrain_wec', layoutName: 'Bahrain', carClass: 'GT3', vehicleModel: null, personalBestSeconds: 121 },
    })));
    send('qualifying', false);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('QUALIFYING · WAITING');
    expect(screen.getByText('PROVISIONAL RESULT')).toBeInTheDocument();
    send('qualifying');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('QUALIFYING COMPLETE');
    expect(screen.queryByText('PROVISIONAL RESULT')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-session-review')).toHaveTextContent('+0.406 s');
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['LMU']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    send('race');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RACE COMPLETE');
    expect(screen.getByText(/CAPTURED ONLY/)).toBeInTheDocument();
    expect(screen.queryByText('ESTIMATES AND SETTINGS SAVED')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['LMU']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
