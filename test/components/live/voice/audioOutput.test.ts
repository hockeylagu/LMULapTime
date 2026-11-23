import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioOutputChoice, listAudioOutputs, revealAudioOutputNames, routeAudio } from '../../../../src/components/live/voice/audioOutput.js';

const devices = (list: Partial<MediaDeviceInfo>[]) => ({ enumerateDevices: () => Promise.resolve(list) });

describe('radio audio output', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('routes a context to the chosen output, the default for null, and back to the default when the output is gone', async () => {
    const setSinkId = vi.fn((id: string) => (id === 'gone' ? Promise.reject(new Error('NotFoundError')) : Promise.resolve()));
    const context = { setSinkId } as unknown as AudioContext;
    expect(await routeAudio(context, 'headset')).toBe(true);
    expect(await routeAudio(context, null)).toBe(true);
    expect(setSinkId).toHaveBeenLastCalledWith('');
    expect(await routeAudio(context, 'gone')).toBe(false);
    expect(setSinkId).toHaveBeenLastCalledWith('');
    expect(await routeAudio({} as AudioContext, 'headset')).toBe(false);
  });

  it('says whether the browser can pick an output', () => {
    vi.stubGlobal('AudioContext', class { setSinkId() { return Promise.resolve(); } });
    expect(audioOutputChoice()).toBe(true);
    vi.stubGlobal('AudioContext', class {});
    expect(audioOutputChoice()).toBe(false);
  });

  it('lists the real outputs, with a name even when the browser hides it', async () => {
    vi.stubGlobal('navigator', { mediaDevices: devices([
      { kind: 'audiooutput', deviceId: 'default', label: 'Default' },
      { kind: 'audiooutput', deviceId: 'communications', label: 'Communications' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
      { kind: 'audiooutput', deviceId: 'a1', label: 'Headset' },
      { kind: 'audiooutput', deviceId: 'b2', label: '' },
      { kind: 'audiooutput', deviceId: '', label: '' },
    ]) });
    expect(await listAudioOutputs()).toEqual([{ id: 'a1', label: 'Headset' }, { id: 'b2', label: 'Output 2' }]);
    vi.stubGlobal('navigator', {});
    expect(await listAudioOutputs()).toEqual([]);
  });

  it('asks for the microphone once to reveal the names and stops it at once', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) } });
    await revealAudioOutputNames();
    expect(stop).toHaveBeenCalledOnce();
  });
});
