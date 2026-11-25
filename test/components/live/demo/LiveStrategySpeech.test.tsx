import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveStrategySpeech } from '../../../../src/components/live/demo/LiveStrategySpeech.js';
import { planChangeCall } from '../../../../src/components/live/demo/demoTyrePlan.js';
import { PedalBuffer } from '../../../../src/components/live/pedalBuffer.js';
import { liveSession, liveSnapshot, liveStrategy } from '../../../helpers/liveSnapshot.js';

const empty = new PedalBuffer();
/** `seconds` of pedal samples at 20 Hz, ending at `end`. */
const pedals = (buffer: PedalBuffer, end: number, seconds: number, throttle: number, brake: number) => act(() => {
  buffer.push(Array.from({ length: seconds * 20 }, (_, index) => ({ t: end - seconds + (index + 1) / 20, throttle, brake })));
});
const speak = vi.fn<(utterance: SpeechSynthesisUtterance) => void>();
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

  it('says when the voice failed, and clears it on the next read', () => {
    render(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={empty} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    const first = speak.mock.calls[0][0];
    act(() => { first.onerror?.(new Event("error") as SpeechSynthesisErrorEvent); });
    expect(screen.getByText('Voice failed. Try Read strategy.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read strategy' }));
    act(() => { speak.mock.calls[1][0].onend?.(new Event("end") as SpeechSynthesisEvent); });
    expect(screen.getByText('Strategy voice · browser default')).toBeInTheDocument();
  });

  it('starts muted, stays quiet across laps and only repeats on request', () => {
    const { rerender } = render(<LiveStrategySpeech snapshot={warningSnapshot()} connection="live" buffer={empty} />);
    expect(speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable strategy voice' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].text).toBe('Energy use too high. Save to pit on lap 19.');
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
    expect(speak.mock.calls[1][0].text).toBe('Box this lap. Energy 38 percent. New medium.');
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

  it('suppresses bouncing estimates and counts the stop down to box this lap', () => {
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
    expect(speak.mock.calls.slice(2).map(call => call[0].text)).toEqual(['Box in 2 laps.', 'Box next lap.', 'Box this lap. Energy 38 percent. New medium.']);
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
    expect(speak.mock.calls[1][0].text).toBe('Energy use too high. Save to pit on lap 19.');
    pedals(buffer, 12, 0.8, 0.1, 1);
    const box = snapshot();
    box.strategy!.resource!.race!.pitInLaps = 0;
    rerender(<LiveStrategySpeech snapshot={box} connection="live" buffer={buffer} />);
    expect(speak.mock.calls[2][0].text).toBe('Box this lap. Energy 38 percent. New medium.');
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
