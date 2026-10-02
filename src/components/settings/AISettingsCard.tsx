import React, { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Save, Trash2 } from 'lucide-react';
import { apiErrorMessage, fetchJson, postJson } from '../../api/apiClient.js';
import { FeedbackMessage, SettingsFeedback, SettingsPanel } from './SettingsPanel.js';

interface AiSettingsResponse {
  configured: boolean;
  model: string;
  keySource: 'environment' | 'session' | null;
}

const AI_MODELS = ['gemini-3.7-flash', 'gemini-3.8-flash'] as const;

export const AISettingsCard: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>('gemini-3.7-flash');
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [message, setMessage] = useState<SettingsFeedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = () => {
    fetchJson<AiSettingsResponse>('/api/ai/settings')
      .then(nextSettings => {
        setSettings(nextSettings);
        setModel(nextSettings.model);
      })
      .catch(() => setMessage({ tone: 'error', text: 'Unable to read AI settings.' }));
  };

  useEffect(() => { loadSettings(); }, []);

  const save = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const data = await postJson<AiSettingsResponse>('/api/ai/settings', { apiKey, model });
      setApiKey('');
      setSettings(data);
      setMessage({ tone: 'ok', text: 'Gemini key is active for this server session.' });
    } catch (error) {
      setMessage({ tone: 'error', text: apiErrorMessage(error, 'Unable to save the key.') });
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (settings?.keySource === 'environment') {
      setMessage({ tone: 'error', text: 'The environment key cannot be removed from Settings.' });
      return;
    }
    if (!window.confirm('Remove the Gemini key and disable AI reports for this server session?')) return;
    setIsSaving(true);
    try {
      setSettings(await postJson<AiSettingsResponse>('/api/ai/settings', { apiKey: '' }));
      setMessage({ tone: 'ok', text: 'Gemini key removed from the server session.' });
    } catch {
      setMessage({ tone: 'error', text: 'Unable to remove the Gemini key.' });
    } finally {
      setIsSaving(false);
    }
  };

  const statusText = !settings?.configured
    ? 'Not configured'
    : settings.keySource === 'environment' ? 'Ready, key from the environment' : 'Ready, key set this session';

  return (
    <SettingsPanel
      sectionId="ai-settings"
      aside={<span className={`text-xs font-mono ${settings?.configured ? 'text-lmu-gain' : 'text-lmu-muted'}`}>{statusText}</span>}
    >
      <p className="text-xs leading-relaxed text-lmu-muted">Uses Gemini {settings?.model || model} to explain LMU's calculated lap data. The key is held only in server memory and must be entered again after a server restart.</p>
      <p className="text-xs leading-relaxed text-lmu-muted">Lap analytics and driver names used in a comparison are sent to Google Gemini when a report is generated.</p>
      <div className="flex gap-2">
        <KeyRound className="mt-2 h-4 w-4 shrink-0 text-lmu-muted" />
        <input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Gemini API key" aria-label="Gemini API key" className="min-w-0 flex-1 rounded-lg border border-lmu-border bg-lmu-bg px-3 py-2 text-sm text-white focus:border-lmu-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text" autoComplete="off" />
      </div>
      <label className="block text-xs font-semibold text-lmu-muted" htmlFor="ai-model">Gemini model</label>
      <select id="ai-model" value={model} onChange={event => setModel(event.target.value)} className="w-full rounded-lg border border-lmu-border bg-lmu-bg px-3 py-2 text-sm text-white focus:border-lmu-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text">
        {AI_MODELS.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={isSaving || !apiKey.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-lmu-accent px-3 py-2 text-xs font-bold text-white hover:bg-lmu-accent/90 transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"><Save className="h-3.5 w-3.5" /> Save Key</button>
        <button type="button" onClick={() => void remove()} disabled={isSaving || !settings?.configured || settings.keySource === 'environment'} className="inline-flex items-center gap-1.5 rounded-lg border border-lmu-rule bg-lmu-card hover:bg-lmu-card-hover transition-colors px-3 py-2 text-xs font-semibold text-lmu-text-soft disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"><Trash2 className="h-3.5 w-3.5" /> Remove Session Key</button>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-lmu-border px-3 py-2 text-xs font-semibold text-lmu-muted hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"><ExternalLink className="h-3.5 w-3.5" /> Get Gemini Key</a>
      </div>
      <FeedbackMessage feedback={message} />
    </SettingsPanel>
  );
};
