import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoRadioSampler } from '../../../../src/components/live/demo/DemoRadioSampler.js';

const kokoro = vi.hoisted(() => ({ say: vi.fn(() => Promise.resolve(900)), ended: vi.fn(() => Promise.resolve()), stop: vi.fn(), dispose: vi.fn(), setOutput: vi.fn() }));
const clips = vi.hoisted(() => ({ say: vi.fn((text: string) => Promise.resolve(text.startsWith('Box'))), stop: vi.fn(), setOutput: vi.fn(), dispose: vi.fn() }));
vi.mock('../../../../src/components/live/voice/clipVoice.js', () => ({ ClipVoice: class { say = clips.say; stop = clips.stop; setOutput = clips.setOutput; dispose = clips.dispose; } }));
vi.mock('../../../../src/components/live/voice/kokoroVoice.js', () => ({
  KokoroVoice: class { say = kokoro.say; ended = kokoro.ended; stop = kokoro.stop; dispose = kokoro.dispose; setOutput = kokoro.setOutput; },
}));

class Utterance { volume = 1; lang = ''; rate = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} }
const speak = vi.fn<(utterance: Utterance) => void>();
const cancel = vi.fn();
const spoken = () => speak.mock.calls.map(([utterance]) => utterance.text);

describe('demo radio sampler', () => {
  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    speak.mockClear(); cancel.mockClear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('plays the chosen call at the Settings volume, and every call in turn', () => {
    render(<DemoRadioSampler volume={60} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(spoken()).toEqual(['Box in 2 laps.']);
    expect(speak.mock.calls[0][0].volume).toBe(0.6);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(spoken().at(-1)).toBe('Box in 2 laps.');
    speak.mock.calls.at(-1)![0].onend?.();
    expect(spoken().at(-1)).toBe('Box next lap.');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(cancel).toHaveBeenCalled();
  });

  it('says the calls in a Kokoro voice at the chosen pace, one after another', async () => {
    render(<DemoRadioSampler volume={70} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Voice' }));
    fireEvent.click(document.querySelector<HTMLElement>('[role="option"][data-value="bm_george"]')!);
    fireEvent.click(screen.getByRole('combobox', { name: 'Speed' }));
    fireEvent.click(document.querySelector<HTMLElement>('[role="option"][data-value="0.9"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    await waitFor(() => expect(kokoro.say.mock.calls.at(-1)).toEqual(["No time for another lap.", "bm_george", 0.9, 70, 80]));
    expect(kokoro.say).toHaveBeenNthCalledWith(1, 'Box in 2 laps.', 'bm_george', 0.9, 70, 80);
    expect(screen.getByRole('status')).toHaveTextContent('900 ms to speak');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(kokoro.stop).toHaveBeenCalled();
  });

  it('joins George clips with the chosen gap on the chosen output, and counts the calls without clips', async () => {
    render(<DemoRadioSampler volume={70} output="headset" />);
    expect(clips.setOutput).toHaveBeenCalledWith('headset');
    fireEvent.click(screen.getByRole('combobox', { name: 'Voice' }));
    fireEvent.click(document.querySelector<HTMLElement>('[role="option"][data-value="clips-sentence"]')!);
    fireEvent.click(screen.getByRole('combobox', { name: 'Join gap' }));
    fireEvent.click(document.querySelector<HTMLElement>('[role="option"][data-value="80"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^No clips for \d+ of \d+ calls$/));
    expect(clips.say).toHaveBeenNthCalledWith(1, 'Box in 2 laps.', false, 80, 70);
  });

  it('is disabled without a browser voice', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    render(<DemoRadioSampler volume={60} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });
});
