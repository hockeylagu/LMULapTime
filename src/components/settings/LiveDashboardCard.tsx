import React, { useEffect, useRef, useState } from 'react';
import type { LiveSettings } from '../../../shared/types/live.js';
import { DEFAULT_LIVE_SETTINGS, PEDAL_TRACE_SECONDS_CHOICES, RESERVE_SECONDS_CHOICES, VOICE_VOLUME_CHOICES } from '../../../shared/types/live.js';
import { apiErrorMessage, isAbortError } from '../../api/apiClient.js';
import { fetchLiveSettings, saveLiveSettings } from '../../api/liveStream.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { Select } from '../common/dropdown/Select.js';
import { FeedbackMessage, SettingsPanel, type SettingsFeedback } from './SettingsPanel.js';
import { BrowserMonitorSetting } from './BrowserMonitorSetting.js';
import { RadioOutputSetting } from './RadioOutputSetting.js';
import { radioVoiceSupported, speakRadio } from '../live/voice/browserVoice.js';
import { ClipVoice } from '../live/voice/clipVoice.js';

/** A demo call, so George's prepared clip exists for it (`tools/dev/prepareVoiceClips.ts`). */
const VOICE_SAMPLE = 'Box this lap. Energy 38 percent. No tyre change.';

/** VE or fuel kept at the pit entry and in a stop's load, in seconds of driving (the server accepts these values only). */
const RESERVE_OPTIONS = RESERVE_SECONDS_CHOICES.map(seconds => ({
  value: seconds,
  label: seconds === 0 ? 'No reserve' : `${seconds} s of driving`,
}));

/** George's clip on the chosen output; the browser's voice (Windows default only) when the clips are not prepared. */
function playSample(clips: ClipVoice, output: string | null, volume: number): void {
  const browserVoice = () => {
    if (!radioVoiceSupported()) return;
    window.speechSynthesis.cancel();
    speakRadio(VOICE_SAMPLE, volume);
  };
  clips.stop();
  clips.setOutput(output);
  void clips.say(VOICE_SAMPLE, true, 0, volume).then(heard => { if (!heard) browserVoice(); }, browserVoice);
}

/** The live dashboard options: the page itself lives at `#/live`. */
export const LiveDashboardCard: React.FC = () => {
  const [settings, setSettings] = useState<LiveSettings | null>(null);
  const [message, setMessage] = useState<SettingsFeedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saved = useRef(0);
  const [clips] = useState(() => new ClipVoice());
  useEffect(() => () => clips.dispose(), [clips]);

  useEffect(() => {
    const request = new AbortController();
    const startedAt = saved.current;
    fetchLiveSettings(request.signal)
      .then((next) => { if (saved.current === startedAt) setSettings(next); })
      .catch((error: unknown) => {
        if (isAbortError(error) || request.signal.aborted) return;
        setMessage({ tone: 'error', text: apiErrorMessage(error, 'Unable to read the live dashboard settings.') });
      });
    return () => request.abort();
  }, []);

  const save = async (change: Partial<LiveSettings>) => {
    setIsSaving(true);
    setMessage(null);
    try {
      const next = await saveLiveSettings(change);
      saved.current += 1;
      setSettings(next);
    } catch (error) {
      if (!isAbortError(error)) setMessage({ tone: 'error', text: apiErrorMessage(error, 'Unable to save the live dashboard settings.') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsPanel sectionId="live-dashboard">
      <p className="text-xs leading-relaxed text-lmu-muted">
        A fullscreen page for a second screen or an overlay, at <span className="font-mono">/#/live</span>. It follows the game while LMU runs.
      </p>
      <div>
        <a href="#/live?demo=1" className={`text-sm font-medium text-lmu-accent-text underline underline-offset-4 ${FOCUS_RING}`}>Open demo</a>
        <p className="mt-1 text-xs leading-relaxed text-lmu-muted">Preview dashboard scenarios with sample data, without running LMU.</p>
      </div>
      {settings === null && !message ? (
        <p role="status" className="text-xs text-lmu-muted">Loading live dashboard settings…</p>
      ) : (
        <>
          <label className="flex items-center gap-3 text-sm text-lmu-text cursor-pointer">
            <input
              type="checkbox"
              checked={settings?.autoOpen === true}
              disabled={settings === null || isSaving}
              onChange={(event) => void save({ autoOpen: event.target.checked })}
              className={`h-4 w-4 accent-lmu-accent ${FOCUS_RING}`}
            />
            Switch the open app to the live dashboard when LMU starts
          </label>
          <div className="flex items-center gap-3 text-sm text-lmu-text">
            <label htmlFor="live-reserve">VE and fuel reserve at the pit entry and in what a stop loads</label>
            <Select
              id="live-reserve"
              value={settings?.reserveSeconds ?? null}
              onChange={(reserveSeconds) => void save({ reserveSeconds })}
              options={RESERVE_OPTIONS}
              disabled={settings === null || isSaving}
              size="compact"
              mono
              className="w-36"
            />
          </div>
          <div className="flex items-center gap-3 text-sm text-lmu-text">
            <label htmlFor="live-pedal-duration">Pedal trace history</label>
            <Select id="live-pedal-duration" value={settings?.pedalTraceSeconds ?? DEFAULT_LIVE_SETTINGS.pedalTraceSeconds}
              onChange={pedalTraceSeconds => void save({ pedalTraceSeconds })}
              options={PEDAL_TRACE_SECONDS_CHOICES.map(value => ({ value, label: `${value} seconds` }))}
              disabled={settings === null || isSaving} size="compact" mono className="w-36" />
          </div>
          <p className="text-xs text-lmu-muted">Applies to the live dashboard and the demo.</p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm text-lmu-text cursor-pointer">
              <input
                type="checkbox"
                checked={settings?.voice ?? DEFAULT_LIVE_SETTINGS.voice}
                disabled={settings === null || isSaving}
                onChange={(event) => void save({ voice: event.target.checked })}
                className={`h-4 w-4 accent-lmu-accent ${FOCUS_RING}`}
              />
              Radio voice calls
            </label>
            <div className="flex items-center gap-3 text-sm text-lmu-text">
              <label htmlFor="live-voice-volume">Voice volume</label>
              <Select id="live-voice-volume" value={settings?.voiceVolume ?? DEFAULT_LIVE_SETTINGS.voiceVolume}
                onChange={voiceVolume => void save({ voiceVolume })}
                options={VOICE_VOLUME_CHOICES.map(value => ({ value, label: `${value} %` }))}
                disabled={settings === null || isSaving || settings.voice === false} size="compact" mono className="w-28" />
              <button type="button" disabled={settings === null || settings.voice === false}
                onClick={() => playSample(clips, settings?.voiceOutput ?? null, settings?.voiceVolume ?? DEFAULT_LIVE_SETTINGS.voiceVolume)}
                className={`rounded border border-lmu-rule px-3 py-1 text-sm text-lmu-text-soft hover:bg-lmu-card disabled:cursor-not-allowed disabled:text-lmu-faint ${FOCUS_RING}`}>
                Play sample
              </button>
            </div>
            <RadioOutputSetting value={settings?.voiceOutput ?? null} volume={settings?.voiceVolume ?? DEFAULT_LIVE_SETTINGS.voiceVolume}
              disabled={settings === null || isSaving || settings.voice === false} onChange={voiceOutput => void save({ voiceOutput })} />
            <p className="text-xs leading-relaxed text-lmu-muted">
              Radio calls on the live dashboard: urgent ones at once, the others on a straight. They play from George&apos;s prepared clips
              on the radio output; a call with no clip yet is said in the browser&apos;s English voice, which always plays on the Windows
              default. Play sample does the same.
              {!radioVoiceSupported() && ' This browser has no voice.'}
            </p>
          </div>
          <div>
            <label className="flex items-center gap-3 text-sm text-lmu-text cursor-pointer">
              <input
                type="checkbox"
                checked={settings?.diagnostics === true}
                disabled={settings === null || isSaving}
                onChange={(event) => void save({ diagnostics: event.target.checked })}
                className={`h-4 w-4 accent-lmu-accent ${FOCUS_RING}`}
              />
              Write a diagnostic file with each recording
            </label>
            <p className="mt-1 text-xs leading-relaxed text-lmu-muted">
              For investigating a problem: game requests and app state go to a file beside the recording. Starts with the next session. Failures are saved in the recording either way.
            </p>
          </div>
        </>
      )}
      <FeedbackMessage feedback={message} />
      <BrowserMonitorSetting />
    </SettingsPanel>
  );
};
