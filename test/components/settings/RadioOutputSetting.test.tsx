import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RadioOutputSetting } from '../../../src/components/settings/RadioOutputSetting.js';

const output = vi.hoisted(() => ({
  choice: vi.fn(() => true),
  list: vi.fn(() => Promise.resolve([{ id: 'a1', label: 'Headset' }])),
  reveal: vi.fn(() => Promise.resolve()),
  route: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../../src/components/live/voice/audioOutput.js', () => ({
  audioOutputChoice: output.choice, listAudioOutputs: output.list, revealAudioOutputNames: output.reveal, routeAudio: output.route,
}));

const tones: number[] = [];
class FakeContext {
  public currentTime = 0;
  public destination = {};
  public close = vi.fn(() => Promise.resolve());
  public createGain() { return { gain: { value: 1 }, connect: vi.fn() }; }
  public createOscillator() {
    const tone = { frequency: { value: 0 }, connect: vi.fn(), start: () => tones.push(tone.frequency.value), stop: vi.fn() };
    return tone;
  }
}

describe('RadioOutputSetting', () => {
  beforeEach(() => { vi.stubGlobal('AudioContext', FakeContext); tones.length = 0; output.choice.mockReturnValue(true); });
  afterEach(() => vi.unstubAllGlobals());

  it('picks a device, back to the Windows default, and tests the chosen output', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RadioOutputSetting value={null} volume={80} disabled={false} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Radio output' });
    expect(select).toHaveTextContent('Windows default');
    await waitFor(() => expect(output.list).toHaveBeenCalled());
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'Headset' }));
    expect(onChange).toHaveBeenLastCalledWith('a1');
    rerender(<RadioOutputSetting value="a1" volume={80} disabled={false} onChange={onChange} />);
    expect(select).toHaveTextContent('Headset');
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', { name: 'Windows default' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Test output' }));
    await waitFor(() => expect(tones).toEqual([880, 1320]));
    expect(output.route).toHaveBeenCalledWith(expect.any(FakeContext), 'a1');
    expect(screen.queryByRole('button', { name: 'Show device names' })).toBeNull();
  });

  it('reveals hidden device names on request, and says when the browser refuses', async () => {
    output.list.mockResolvedValueOnce([{ id: 'b2', label: 'Output 1' }]);
    output.reveal.mockRejectedValueOnce(new Error('NotAllowedError'));
    render(<RadioOutputSetting value="b2" volume={80} disabled={false} onChange={vi.fn()} />);
    const show = await screen.findByRole('button', { name: 'Show device names' });
    fireEvent.click(show);
    expect(await screen.findByText(/The browser refused the microphone/)).toBeInTheDocument();
    fireEvent.click(show);
    await waitFor(() => expect(output.reveal).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/The browser refused the microphone/)).toBeNull());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show device names' })).toBeNull());
  });

  it('shows a chosen device as not connected while the list misses it, and offers the names when nothing is listed', async () => {
    output.list.mockResolvedValueOnce([]);
    render(<RadioOutputSetting value="a1" volume={80} disabled={false} onChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Show device names' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Radio output' })).toHaveTextContent('Chosen device (not connected)');
  });

  it('says the radio stays on the default when the browser cannot pick an output', () => {
    output.choice.mockReturnValue(false);
    render(<RadioOutputSetting value={null} volume={80} disabled={false} onChange={vi.fn()} />);
    expect(screen.getByText('This browser plays the radio on the Windows default output only.')).toBeInTheDocument();
  });
});
