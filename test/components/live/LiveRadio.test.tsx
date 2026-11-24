import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRadioCallEvent } from '../../../shared/types/live.js';
import { LiveRadio } from '../../../src/components/live/display/LiveRadio.js';
import { RadioPlayer } from '../../../src/components/live/display/radioPlayer.js';

class Utterance {
  volume = 1; lang = ''; rate = 1;
  onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
const speak = vi.fn<(utterance: Utterance) => void>();
const cancel = vi.fn();
const report = vi.fn();
const call = (id: number, priority: 1 | 2 | 3, text = `call ${id}`): LiveRadioCallEvent => ({ id, priority, text, expiresAt: 10_000 });
const spoken = () => speak.mock.calls.map(([utterance]) => utterance.text);
const begin = (index: number) => speak.mock.calls[index][0].onstart?.();
const finish = (index: number) => speak.mock.calls[index][0].onend?.();
const activated = (value: boolean) => Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: value }, configurable: true });

describe('dashboard radio', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    speak.mockClear(); cancel.mockClear(); report.mockClear();
    activated(true);
    vi.useFakeTimers();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'userActivation'); });

  it('says calls in turn at the set volume and reports each as spoken', () => {
    const player = new RadioPlayer(report, () => 0);
    player.configure(60, true);
    player.play(call(1, 2));
    player.play(call(2, 3));
    expect(spoken()).toEqual(['call 1']);
    expect(speak.mock.calls[0][0].volume).toBe(0.6);
    finish(0);
    expect(report).toHaveBeenCalledWith(1, 'spoken');
    expect(spoken()).toEqual(['call 1', 'call 2']);
    finish(1);
    expect(report).toHaveBeenLastCalledWith(2, 'spoken');
  });

  it('reports a call the voice failed on, and goes on to the next', () => {
    const player = new RadioPlayer(report, () => 0);
    player.play(call(1, 2));
    player.play(call(2, 3));
    speak.mock.calls[0][0].onerror?.();
    expect(report).toHaveBeenCalledWith(1, 'failed');
    expect(spoken()).toEqual(['call 1', 'call 2']);
  });

  it('lets a P1 cut a P2 and speak after a short gap, reporting the cut and waiting calls as interrupted', () => {
    const player = new RadioPlayer(report, () => 0);
    player.play(call(1, 2));
    player.play(call(2, 3));
    player.play(call(3, 1, 'Box this lap.'));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(report.mock.calls).toEqual([[2, 'interrupted'], [1, 'interrupted']]);
    expect(spoken()).toEqual(['call 1']);
    vi.advanceTimersByTime(50);
    expect(spoken()).toEqual(['call 1', 'Box this lap.']);
    // The cut call's late end changes nothing.
    finish(0);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('makes a P1 wait for a P1 that is speaking, ahead of the other calls', () => {
    const player = new RadioPlayer(report, () => 0);
    player.play(call(1, 1, 'Car stopped on track.'));
    player.play(call(2, 2));
    player.play(call(3, 1, 'Yellow, sector 3.'));
    expect(cancel).not.toHaveBeenCalled();
    expect(report.mock.calls).toEqual([[2, 'interrupted']]);
    finish(0);
    expect(spoken()).toEqual(['Car stopped on track.', 'Yellow, sector 3.']);
  });

  it('fails a call the browser never starts or never ends, and goes on to the next', () => {
    const player = new RadioPlayer(report, () => 0);
    player.play(call(1, 1));
    player.play(call(2, 2));
    vi.advanceTimersByTime(2000);
    expect(report.mock.calls).toEqual([[1, 'failed']]);
    expect(cancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    expect(spoken()).toEqual(['call 1', 'call 2']);
    // Once started a call has its speaking time: 3 s and 200 ms a character.
    begin(1);
    vi.advanceTimersByTime(4000);
    expect(report).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(report).toHaveBeenLastCalledWith(2, 'failed');
  });

  it('skips a waiting call that is late by its turn, and says the one after it', () => {
    let clock = 0;
    const player = new RadioPlayer(report, () => clock);
    player.play(call(1, 2));
    player.play(call(2, 3));
    player.play({ ...call(3, 3), expiresAt: 60_000 });
    clock = 20_000;
    finish(0);
    expect(spoken()).toEqual(['call 1', 'call 3']);
    expect(report.mock.calls).toEqual([[1, 'spoken'], [2, 'late']]);
  });

  it('reports calls as locked before a click, and the ones that arrive late as late', () => {
    const player = new RadioPlayer(report, () => 20_000);
    player.play(call(1, 1));
    expect(report.mock.calls).toEqual([[1, 'late']]);
    const live = new RadioPlayer(report, () => 0);
    live.configure(80, false);
    live.play(call(2, 1));
    expect(report).toHaveBeenCalledWith(2, 'locked');
    expect(speak).not.toHaveBeenCalled();
  });

  it('asks for one click after a reload, then plays', () => {
    activated(false);
    const player = new RadioPlayer(report, () => 0);
    const ready = vi.fn();
    render(<LiveRadio player={player} enabled volume={80} output={null} onReady={ready} />);
    player.play(call(1, 1));
    expect(report).toHaveBeenCalledWith(1, 'locked');
    // The server is told once the radio can speak, so the calls it could not say come again.
    expect(ready).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Click to enable radio' }));
    expect(ready).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Click to enable radio' })).not.toBeInTheDocument();
    player.play(call(2, 1));
    expect(spoken()).toEqual(['call 2']);
  });

  it("says a call in the engineer's clips on the radio output, and in the browser voice when a sentence has no clip", async () => {
    const heard = [true, false];
    const clips = { say: vi.fn(() => Promise.resolve(heard.shift() ?? true)), stop: vi.fn(), setOutput: vi.fn(), dispose: vi.fn() };
    const player = new RadioPlayer(report, () => 0, clips);
    player.configure(60, true, 'headset');
    expect(clips.setOutput).toHaveBeenCalledWith('headset');
    player.play(call(1, 2, 'Box in 2 laps.'));
    player.play(call(2, 2, 'Rejoin P4.'));
    expect(clips.say).toHaveBeenCalledWith('Box in 2 laps.', false, 40, 60);
    expect(speak).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(report.mock.calls).toEqual([[1, 'spoken']]);
    // No clip for the second call: the browser says it.
    expect(spoken()).toEqual(['Rejoin P4.']);
    finish(0);
    expect(report).toHaveBeenLastCalledWith(2, 'spoken');
    // A P1 cuts a clip, and a clip that never ends fails on the time limit.
    clips.say.mockImplementation(() => new Promise<boolean>(() => {}));
    player.play(call(3, 2));
    player.play(call(4, 1, 'Box this lap.'));
    expect(clips.stop).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenLastCalledWith(3, 'interrupted');
    await vi.advanceTimersByTimeAsync(50 + 3000 + 13 * 200);
    expect(report).toHaveBeenLastCalledWith(4, 'failed');
    player.dispose();
    expect(clips.dispose).toHaveBeenCalledTimes(1);
  });

  it('unlocks on any key press too', () => {
    activated(false);
    render(<LiveRadio player={new RadioPlayer(report, () => 0)} enabled volume={80} output={null} onReady={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.queryByRole('button', { name: 'Click to enable radio' })).not.toBeInTheDocument();
  });

  it('shows nothing and stops speaking when the voice is off in Settings', () => {
    const player = new RadioPlayer(report, () => 0);
    const ready = vi.fn();
    const { container, rerender } = render(<LiveRadio player={player} enabled volume={80} output={null} onReady={ready} />);
    // A page already clicked can speak from the start.
    expect(ready).toHaveBeenCalledTimes(1);
    player.play(call(1, 2));
    rerender(<LiveRadio player={player} enabled={false} volume={80} output={null} onReady={ready} />);
    expect(report).toHaveBeenCalledWith(1, 'interrupted');
    expect(container).toBeEmptyDOMElement();
  });
});
