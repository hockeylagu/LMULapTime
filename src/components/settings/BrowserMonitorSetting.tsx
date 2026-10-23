import { useEffect, useState } from 'react';
import type { DesktopBrowserSettings } from '../../../shared/types/status.js';
import { apiErrorMessage, fetchJson, isAbortError, postJson } from '../../api/apiClient.js';
import { Select } from '../common/dropdown/Select.js';
import { FeedbackMessage, type SettingsFeedback } from './SettingsPanel.js';

export function BrowserMonitorSetting() {
  const [settings, setSettings] = useState<DesktopBrowserSettings | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedback | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    void fetchJson<DesktopBrowserSettings>('/api/desktop/browser', { signal: request.signal }).then(next => {
      if (!request.signal.aborted) setSettings(next);
    }).catch((error: unknown) => {
      if (!isAbortError(error) && !request.signal.aborted) {
        setFeedback({ tone: 'error', text: apiErrorMessage(error, 'Unable to read monitors.') });
      }
    });
    return () => request.abort();
  }, []);

  const save = async (monitor: string) => {
    setSaving(true);
    setFeedback(null);
    try {
      setSettings(await postJson<DesktopBrowserSettings>('/api/desktop/browser', { monitor }));
      setFeedback({ tone: 'ok', text: 'Browser monitor saved.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: apiErrorMessage(error, 'Unable to save the browser monitor.') });
    } finally { setSaving(false); }
  };

  if (settings?.supported === false) return null;
  const disconnected = settings?.monitor && !settings.monitors.some(monitor => monitor.id === settings.monitor);
  const options = [
    { value: '', label: 'Browser default' },
    ...(settings?.monitors ?? []).map(monitor => ({ value: monitor.id,
      label: `Display ${monitor.id.replace(/^.*DISPLAY/, '')}${monitor.primary ? ' · Primary' : ''} · ${monitor.width} × ${monitor.height}` })),
    ...(disconnected ? [{ value: settings.monitor, label: `${settings.monitor.replace(/^.*DISPLAY/, 'Display ')} · Disconnected`, disabled: true }] : []),
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm text-lmu-text">
        <label htmlFor="browser-monitor">Browser monitor for tray double-click</label>
        <Select id="browser-monitor" value={settings?.monitor ?? ''} options={options}
          onChange={monitor => void save(monitor)} disabled={!settings || saving} busy={saving}
          size="compact" className="w-72" />
      </div>
      {!settings && !feedback && <p role="status" className="text-xs text-lmu-muted">Loading monitors…</p>}
      <p className="text-xs leading-relaxed text-lmu-muted">
        Opens a new browser window on this display when you double-click the tray icon. Applies immediately.
        Monitor placement supports Edge, Chrome, Firefox, Brave and Vivaldi.
      </p>
      {disconnected && <p role="status" className="text-xs text-lmu-muted">The saved monitor is disconnected. The browser will use its default placement.</p>}
      <FeedbackMessage feedback={feedback} />
    </div>
  );
}
