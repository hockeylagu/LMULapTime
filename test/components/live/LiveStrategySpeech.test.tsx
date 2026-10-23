import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveStrategySpeech } from '../../../src/components/live/display/LiveStrategySpeech.js';
import { strategySpeech } from '../../../src/components/live/display/strategySpeech.js';
import { planChangeCall } from '../../../src/components/live/demo/demoTyrePlan.js';
import { PedalBuffer } from '../../../src/components/live/pedalBuffer.js';
import { liveSession, liveSnapshot, liveStrategy } from '../../helpers/liveSnapshot.js';

const empty = new PedalBuffer();
/** `seconds` of pedal samples at 20 Hz, ending at `end`. */
const pedals = (buffer: PedalBuffer, end: number, seconds: number, throttle: number, brake: number) => act(() => {
  buffer.push(Array.from({ length: seconds * 20 }, (_, index) => ({ t: end - seconds + (index + 1) / 20, throttle, brake })));
});
const speak = vi.fn();
const cancel = vi.fn();
const snapshot = () => liveSnapshot({ strategy: liveStrategy() });
const warningSnapshot = () => {
  const value = snapshot();
  value.strategy!.resource!.race!.sparePerLap = -0.3;
  return value;
};

describe('strategy voice POC', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(public text: string) {}
    });
    speak.mockClear(); cancel.mockClear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('leaves voice selection to the browser with the original English language setting', () => {
    render(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={empty} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    expect(speak.mock.calls[0][0].voice).toBeUndefined();
    expect(speak.mock.calls[0][0].lang).toBe('en-GB');
    expect(screen.getByText('Strategy voice · browser default')).toBeInTheDocument();
  });

  it('starts muted, stays quiet across laps and only repeats on request', () => {
    const { rerender } = render(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={empty} />);
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].text).toBe('Energy use too high. Save to hold our pit lap.');
    rerender(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={empty} />);
    expect(speak).toHaveBeenCalledTimes(1);
    rerender(<LiveStrategySpeech snapshot={{ ...warningSnapshot(), session: liveSession({ playerLapsCompleted: 13 }) }} connection="live" buffer={empty} />);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Read strategy' }));
    expect(speak).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Mute strategy voice' }));
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Read strategy' })).toBeDisabled();
  });

  it('interrupts for an urgent pit call on the same lap and cancels on disconnect or unmount', () => {
    const { rerender, unmount } = render(<LiveStrategySpeech snapshot={snapshot()} connection="live" buffer={empty} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    const urgent = snapshot();
    urgent.strategy!.resource!.race!.pitInLaps = 0;
    rerender(<LiveStrategySpeech snapshot={urgent} connection="live" buffer={empty} />);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1][0].text).toBe('Box this lap. Energy 38 percent, new medium.');
    rerender(<LiveStrategySpeech snapshot={urgent} connection="disconnected" buffer={empty} />);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Read strategy' })).toBeDisabled();
    rerender(<LiveStrategySpeech snapshot={{ ...warningSnapshot(), audit: { runId: 'new-race', status: 'recording' } }} connection="live" buffer={empty} />);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it('shows unavailable browsers and speech failures without crashing', () => {
    speak.mockImplementationOnce(() => { throw new Error('Audio blocked'); });
    const { unmount } = render(<LiveStrategySpeech snapshot={snapshot()} connection="live" buffer={empty} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    expect(screen.getByText('Voice failed. Try Read strategy.')).toBeInTheDocument();
    unmount();
    vi.stubGlobal('speechSynthesis', undefined);
    render(<LiveStrategySpeech snapshot={snapshot()} connection="live" buffer={empty} />);
    expect(screen.getByRole('button', { name: 'Enable strategy voice' })).toBeDisabled();
  });

  it('withholds advice while paused, in the garage, practicing, calculating or disconnected', () => {
    expect(strategySpeech({ ...snapshot(), session: liveSession({ gamePhase: 9 }) }, 'live')).toBeNull();
    expect(strategySpeech({ ...snapshot(), lifecycle: 'garage' }, 'live')).toBeNull();
    expect(strategySpeech({ ...snapshot(), session: liveSession({ kind: 'practice' }) }, 'live')).toBeNull();
    expect(strategySpeech(liveSnapshot(), 'live')).toBeNull();
    expect(strategySpeech(liveSnapshot({ strategy: liveStrategy({ resource: null }) }), 'live')).toBeNull();
    expect(strategySpeech(snapshot(), 'disconnected')).toBeNull();
  });

  it('stays silent for routine pit countdown and finish coverage', () => {
    const finish = snapshot();
    finish.strategy!.resource!.race!.finishReachable = true;
    const call = strategySpeech(finish, 'live');
    expect(call).toBeNull();
    expect(strategySpeech(snapshot(), 'live')).toBeNull();
    finish.strategy!.resource!.race!.finishReachable = false;
    finish.strategy!.resource!.race!.pitInLaps = 1;
    expect(strategySpeech(finish, 'live')).toBeNull();
  });

  it('explains excess consumption and interrupts when that implication changes mid-lap', () => {
    const over = snapshot();
    over.strategy!.resource!.race!.sparePerLap = -0.3;
    const call = strategySpeech(over, 'live');
    expect(call?.text).toBe('Energy use too high. Save to hold our pit lap.');
    expect(call?.key).not.toBe(strategySpeech(snapshot(), 'live')?.key);
  });

  it('explains an insufficient pit menu setting as an action', () => {
    const pit = snapshot();
    pit.strategy!.resource!.race!.pitInLaps = 1;
    pit.strategy!.resource!.race!.neededAfterStop = 62;
    expect(strategySpeech(pit, 'live')?.text).toBe('Pit energy setting too low. Set 62 percent.');
  });

  it('explains damage costs without claiming repairs will be faster overall', () => {
    const damaged = snapshot();
    damaged.strategy!.damage = { wheel: null, body: 0.4, suspension: null, partsDetached: false,
      impactLap: 10, lapsSinceImpact: 2, paceLossPerLap: 1, lossToFinish: 45, repairSeconds: 30, significant: true };
    expect(strategySpeech(damaged, 'live')?.text).toBe('Repair estimate is below the projected damage loss. Pit-lane time still needs adding.');
    damaged.strategy!.damage.repairSeconds = 50;
    expect(strategySpeech(damaged, 'live')?.text).toBe('Repairs alone cost at least as much as the projected damage loss.');
    damaged.strategy!.damage.wheel = { problem: 'flat', corner: 'FR' };
    expect(strategySpeech(damaged, 'live')?.text).toBe('front right puncture. Box now.');
  });

  it('explains the saving tradeoff without promising it is achievable', () => {
    const saving = snapshot();
    saving.strategy!.resource!.saving = { targetPerLap: 2.4, savePerLap: 0.1, savePercent: 4, shortfall: 1, source: 'measured' };
    expect(strategySpeech(saving, 'live')?.text).toBe('4 percent less energy would avoid the stop.');
  });

  it('explains tyre coverage and a penalty service limitation', () => {
    const tyres = snapshot();
    tyres.strategy!.tyres!.coverage = { target: 'pit', projectedTread: 0.3, setsNeeded: 2, availableSetsCover: true };
    expect(strategySpeech(tyres, 'live')?.text).toBe('Tyres projected below our limit before the stop. Plan a tyre change.');
    tyres.strategy!.pit!.state = 'entering';
    tyres.strategy!.pit!.penalties = 1;
    expect(strategySpeech(tyres, 'live')?.text).toBe('Stop and go. No service on this stop.');
  });

  it('suppresses bouncing estimates and countdown narration but calls box this lap', () => {
    const { rerender } = render(<LiveStrategySpeech snapshot={snapshot()} connection="live" buffer={empty} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    const over = snapshot();
    over.strategy!.resource!.race!.sparePerLap = -0.3;
    rerender(<LiveStrategySpeech snapshot={over} connection="live" buffer={empty} />);
    rerender(<LiveStrategySpeech snapshot={snapshot()} connection="live" buffer={empty} />);
    rerender(<LiveStrategySpeech snapshot={over} connection="live" buffer={empty} />);
    expect(speak).toHaveBeenCalledTimes(2);
    for (const laps of [2, 1, 0]) {
      const pit = snapshot();
      pit.strategy!.resource!.race!.pitInLaps = laps;
      rerender(<LiveStrategySpeech snapshot={pit} connection="live" buffer={empty} />);
    }
    expect(speak.mock.calls.slice(2).map(call => call[0].text)).toEqual(['Box this lap. Energy 38 percent, new medium.']);
  });

  it('connects tyre coverage to an incorrect pit menu choice', () => {
    const value = snapshot();
    value.strategy!.resource!.race!.pitInLaps = 1;
    value.strategy!.tyres!.coverage = { target: 'pit', projectedTread: 0.3, setsNeeded: 2, availableSetsCover: true };
    value.strategy!.pit!.mfd!.tyres = 'No Change';
    expect(strategySpeech(value, 'live')?.text).toBe('Tyres projected below our limit. Your pit menu is set to no change.');
  });

  it('explains when fuel limits an otherwise covered energy plan', () => {
    const value = snapshot();
    value.strategy!.resource!.race!.finishReachable = true;
    value.strategy!.fuelRatio = { recommended: 0.9, source: 'measured', pairedLaps: 4,
      garageSetting: 0.8, mfdSetting: 0.8, excessLitres: null, fuelBiasLaps: -1 };
    expect(strategySpeech(value, 'live')?.text).toBe('Fuel runs out before energy. Check your fuel ratio.');
    value.strategy!.resource!.race!.finishReachable = false;
    value.strategy!.resource!.race!.pitInLaps = 1;
    expect(strategySpeech(value, 'live')?.text).toBe('Fuel ratio too low. Set 0.90.');
  });

  it('says the whole stop on the box call, no tyre change included', () => {
    const value = snapshot();
    value.strategy!.resource!.race!.pitInLaps = 0;
    value.strategy!.pit!.mfd!.tyres = 'No Change';
    expect(strategySpeech(value, 'live')).toMatchObject({ text: 'Box this lap. Energy 38 percent, no tyre change.', urgent: true });
  });

  it('holds routine calls for a straight while urgent ones interrupt', () => {
    const buffer = new PedalBuffer();
    const { rerender } = render(<LiveStrategySpeech snapshot={snapshot()} connection="live" buffer={buffer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    pedals(buffer, 10, 2, 0.2, 0.9);
    rerender(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={buffer} />);
    expect(speak).toHaveBeenCalledTimes(1);
    pedals(buffer, 10.5, 0.5, 1, 0);
    expect(speak).toHaveBeenCalledTimes(1);
    pedals(buffer, 11.2, 0.7, 1, 0);
    expect(speak.mock.calls[1][0].text).toBe('Energy use too high. Save to hold our pit lap.');
    pedals(buffer, 12, 0.8, 0.1, 1);
    const box = snapshot();
    box.strategy!.resource!.race!.pitInLaps = 0;
    rerender(<LiveStrategySpeech snapshot={box} connection="live" buffer={buffer} />);
    expect(speak.mock.calls[2][0].text).toBe('Box this lap. Energy 38 percent, new medium.');
  });

  it('voices a plan change on the straight, after urgent calls', () => {
    expect(planChangeCall('TYRES WEARING FAST', { lap: 19, ve: 72, tyres: 'NEW MED', changed: 'tyres' }).text)
      .toBe('Plan change. Tyres wearing fast. Box lap 19, energy 72 percent, new medium.');
    const plan = planChangeCall('USING LESS VE', { lap: 21, ve: 58, tyres: 'NO CHANGE', changed: 've' });
    expect(plan.text).toBe('Plan change. Using less energy. Box lap 21, energy 58 percent, no tyre change.');
    const { rerender } = render(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={empty} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    rerender(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={empty} plan={plan} />);
    expect(speak.mock.calls[1][0].text).toBe(plan.text);
  });
});
