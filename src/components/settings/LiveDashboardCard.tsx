import React, { useEffect, useRef, useState } from 'react';
import type { LiveSettings } from '../../../shared/types/live.js';
import { apiErrorMessage, isAbortError } from '../../api/apiClient.js';
import { fetchLiveSettings, saveLiveSettings } from '../../api/liveStream.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { FeedbackMessage, SettingsPanel, type SettingsFeedback } from './SettingsPanel.js';

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

  const toggle = async (autoOpen: boolean) => {
    setIsSaving(true);
    setMessage(null);
    try {
      const next = await saveLiveSettings({ autoOpen });
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
      {settings === null && !message ? (
        <p role="status" className="text-xs text-lmu-muted">Loading live dashboard settings…</p>
      ) : (
        <label className="flex items-center gap-3 text-sm text-lmu-text cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.autoOpen === true}
            disabled={settings === null || isSaving}
            onChange={(event) => void toggle(event.target.checked)}
            className={`h-4 w-4 accent-lmu-accent ${FOCUS_RING}`}
          />
          Switch the open app to the live dashboard when LMU starts
        </label>
      )}
      <FeedbackMessage feedback={message} />
    </SettingsPanel>
  );
};
