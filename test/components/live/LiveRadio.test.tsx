import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRadioCallEvent } from '../../../shared/types/live.js';
import { LiveRadio } from '../../../src/components/live/display/LiveRadio.js';
import { RadioPlayer } from '../../../src/components/live/display/radioPlayer.js';

class Utterance { volume = 1; lang = ''; rate = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
const speak = vi.fn<(utterance: Utterance) => void>();
const cancel = vi.fn();
const report = vi.fn();
const call = (id: number, priority: 1 | 2 | 3, text = `call ${id}`): LiveRadioCallEvent => ({ id, priority, text, expiresAt: 10_000 });
const spoken = () => speak.mock.calls.map(([utterance]) => utterance.text);
const finish = (index: number) => speak.mock.calls[index][0].onend?.();
const activated = (value: boolean) => Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: value }, configurable: true });

describe('dashboard radio', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    speak.mockClear(); cancel.mockClear(); report.mockClear();
    activated(true);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'userActivation'); });

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

  it('lets a P1 cut in, reporting the cut and waiting calls as interrupted', () => {
    const player = new RadioPlayer(report, () => 0);
    player.play(call(1, 2));
    player.play(call(2, 3));
    player.play(call(3, 1, 'Box this lap.'));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(report.mock.calls).toEqual([[2, 'interrupted'], [1, 'interrupted']]);
    expect(spoken()).toEqual(['call 1', 'Box this lap.']);
  });

  it('reports calls as locked before a click, and skips late ones', () => {
    const player = new RadioPlayer(report, () => 20_000);
    player.play(call(1, 1));
    expect(report).not.toHaveBeenCalled();
    const live = new RadioPlayer(report, () => 0);
    live.configure(80, false);
    live.play(call(2, 1));
    expect(report).toHaveBeenCalledWith(2, 'locked');
    expect(speak).not.toHaveBeenCalled();
  });

  it('asks for one click after a reload, then plays', () => {
    activated(false);
    const player = new RadioPlayer(report, () => 0);
    render(<LiveRadio player={player} enabled volume={80} />);
    player.play(call(1, 1));
    expect(report).toHaveBeenCalledWith(1, 'locked');
    fireEvent.click(screen.getByRole('button', { name: 'Click to enable radio' }));
    expect(screen.queryByRole('button', { name: 'Click to enable radio' })).not.toBeInTheDocument();
    player.play(call(2, 1));
    expect(spoken()).toEqual(['call 2']);
  });

  it('unlocks on any key press too', () => {
    activated(false);
    render(<LiveRadio player={new RadioPlayer(report, () => 0)} enabled volume={80} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.queryByRole('button', { name: 'Click to enable radio' })).not.toBeInTheDocument();
  });

  it('shows nothing and stops speaking when the voice is off in Settings', () => {
    const player = new RadioPlayer(report, () => 0);
    const { container, rerender } = render(<LiveRadio player={player} enabled volume={80} />);
    player.play(call(1, 2));
    rerender(<LiveRadio player={player} enabled={false} volume={80} />);
    expect(report).toHaveBeenCalledWith(1, 'interrupted');
    expect(container).toBeEmptyDOMElement();
  });
});
