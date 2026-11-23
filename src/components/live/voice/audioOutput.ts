/** An audio output the radio can play on. */
export interface AudioOutput { id: string; label: string }

/** Chrome and Edge let Web Audio pick its output; other browsers keep the default. */
type RoutableContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/** Sends `context` to the output `id` (null: the Windows default); false when the browser cannot. */
export async function routeAudio(context: AudioContext, id: string | null): Promise<boolean> {
  const routable = context as RoutableContext;
  if (typeof routable.setSinkId !== 'function') return false;
  try {
    await routable.setSinkId(id ?? '');
    return true;
  } catch {
    // An output unplugged since it was chosen: the default plays instead.
    await routable.setSinkId('').catch(() => {});
    return false;
  }
}

export const audioOutputChoice = (): boolean => typeof (globalThis.AudioContext?.prototype as RoutableContext | undefined)?.setSinkId === 'function';

/**
 * The outputs of this computer. Without the microphone permission Chrome hides them (one entry with an empty id) or
 * their names (empty labels); the pseudo-devices "default" and "communications" are left out, since null already
 * means the default.
 */
export async function listAudioOutputs(): Promise<AudioOutput[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(device => device.kind === 'audiooutput' && device.deviceId !== '' && device.deviceId !== 'default' && device.deviceId !== 'communications')
    .map((device, index) => ({ id: device.deviceId, label: device.label || `Output ${index + 1}` }));
}

/** Asks once for the microphone so the browser shows output names; nothing is recorded, the stream stops at once. */
export async function revealAudioOutputNames(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}
