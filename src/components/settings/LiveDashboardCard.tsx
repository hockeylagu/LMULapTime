import React, { useEffect, useRef, useState } from 'react';
import type { LiveSettings } from '../../../shared/types/live.js';
import { DEFAULT_LIVE_SETTINGS, PEDAL_TRACE_SECONDS_CHOICES, RESERVE_LAP_CHOICES } from '../../../shared/types/live.js';
import { apiErrorMessage, isAbortError } from '../../api/apiClient.js';
import { fetchLiveSettings, saveLiveSettings } from '../../api/liveStream.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { Select } from '../common/dropdown/Select.js';
import { FeedbackMessage, SettingsPanel, type SettingsFeedback } from './SettingsPanel.js';

/** VE or fuel kept at the pit entry or the finish (the server accepts these values only). */
const RESERVE_OPTIONS = RESERVE_LAP_CHOICES.map(laps => ({
  value: laps,
  label: laps === 0 ? 'No reserve' : `${laps} ${laps === 1 ? 'lap' : 'laps'}`,
}));

/** The live dashboard options: the page itself lives at `#/live`. */
export const LiveDashboardCard: React.FC = () => {
  const [settings, setSettings] = useState<LiveSettings | null>(null);
  const [message, setMessage] = useState<SettingsFeedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saved = useRef(0);

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
            <label htmlFor="live-reserve">VE and fuel reserve at the pit entry and the finish</label>
            <Select
              id="live-reserve"
              value={settings?.reserveLaps ?? null}
              onChange={(reserveLaps) => void save({ reserveLaps })}
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
          <p className="text-xs text-lmu-muted">Applies to the live dashboard and demo, including the corner preview.</p>
        </>
      )}
      <FeedbackMessage feedback={message} />
      <div className="border-t border-lmu-border pt-4">
        <p className="text-xs leading-relaxed text-lmu-muted">Strategy history saves estimates, your garage and pit settings, and measured outcomes locally. Export it to compare consumption and fuel-ratio accuracy over time.</p>
        <a href="/api/live/audit.csv" download className={`mt-3 inline-block text-sm font-medium text-lmu-accent-text underline underline-offset-4 ${FOCUS_RING}`}>Export strategy history (CSV)</a>
      </div>
    </SettingsPanel>
  );
};
