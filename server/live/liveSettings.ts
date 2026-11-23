import type { LiveSettings } from '../../shared/types/live.js';
import { DEFAULT_LIVE_SETTINGS, PEDAL_TRACE_SECONDS_CHOICES, RESERVE_SECONDS_CHOICES, VOICE_VOLUME_CHOICES } from '../../shared/types/live.js';
import type { SessionDatabase } from '../core/db.js';

const AUTO_OPEN_KEY = 'live_auto_open';
const RESERVE_KEY = 'live_reserve_seconds';
const PEDAL_TRACE_KEY = 'live_pedal_trace_seconds';
const DIAGNOSTICS_KEY = 'live_diagnostics';
const VOICE_KEY = 'live_voice';
const VOICE_VOLUME_KEY = 'live_voice_volume';
const VOICE_OUTPUT_KEY = 'live_voice_output';

type SettingsStore = Pick<SessionDatabase, 'getMetadata' | 'setMetadata'>;

export const isReserveSeconds = (value: unknown): value is number =>
  typeof value === 'number' && (RESERVE_SECONDS_CHOICES as readonly number[]).includes(value);

export const isPedalTraceSeconds = (value: unknown): value is number =>
  typeof value === 'number' && (PEDAL_TRACE_SECONDS_CHOICES as readonly number[]).includes(value);

export const isVoiceVolume = (value: unknown): value is number =>
  typeof value === 'number' && (VOICE_VOLUME_CHOICES as readonly number[]).includes(value);

/** A browser audio output id, or null for the Windows default. */
export const isVoiceOutput = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && value.length > 0 && value.length <= 256);

/** Auto-open and the voice are on until the driver turns them off; the voice volume is 80 % and the output the Windows default until changed; the reserve is 45 s of driving until changed; diagnostics are off until turned on. */
export function loadLiveSettings(store: SettingsStore): LiveSettings {
  const reserve = Number(store.getMetadata(RESERVE_KEY));
  const pedalTrace = Number(store.getMetadata(PEDAL_TRACE_KEY));
  const volume = Number(store.getMetadata(VOICE_VOLUME_KEY));
  return {
    autoOpen: store.getMetadata(AUTO_OPEN_KEY) !== 'false',
    reserveSeconds: store.getMetadata(RESERVE_KEY) !== null && isReserveSeconds(reserve) ? reserve : DEFAULT_LIVE_SETTINGS.reserveSeconds,
    pedalTraceSeconds: isPedalTraceSeconds(pedalTrace) ? pedalTrace : DEFAULT_LIVE_SETTINGS.pedalTraceSeconds,
    diagnostics: store.getMetadata(DIAGNOSTICS_KEY) === 'true',
    voice: store.getMetadata(VOICE_KEY) !== 'false',
    voiceVolume: isVoiceVolume(volume) ? volume : DEFAULT_LIVE_SETTINGS.voiceVolume,
    voiceOutput: store.getMetadata(VOICE_OUTPUT_KEY) || null,
  };
}

export function saveLiveSettings(store: SettingsStore, settings: LiveSettings): void {
  store.setMetadata(AUTO_OPEN_KEY, settings.autoOpen ? 'true' : 'false');
  store.setMetadata(RESERVE_KEY, String(settings.reserveSeconds));
  store.setMetadata(PEDAL_TRACE_KEY, String(settings.pedalTraceSeconds));
  store.setMetadata(DIAGNOSTICS_KEY, settings.diagnostics ? 'true' : 'false');
  store.setMetadata(VOICE_KEY, settings.voice ? 'true' : 'false');
  store.setMetadata(VOICE_VOLUME_KEY, String(settings.voiceVolume));
  store.setMetadata(VOICE_OUTPUT_KEY, settings.voiceOutput ?? '');
}
