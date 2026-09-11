import React, { useEffect, useState } from 'react';
import { BrainCircuit, ExternalLink, KeyRound, Save, Trash2 } from 'lucide-react';

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
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = () => {
    fetch('/api/ai/settings')
      .then(response => response.json())
      .then(data => {
        const nextSettings = data as AiSettingsResponse;
        setSettings(nextSettings);
        setModel(nextSettings.model);
      })
      .catch(() => setMessage('Unable to read AI settings.'));
  };

  useEffect(() => { loadSettings(); }, []);

  const save = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, model }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save the key.');
      setApiKey('');
      setSettings(data as AiSettingsResponse);
      setMessage('Gemini key is active for this server session.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save the key.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (settings?.keySource === 'environment') {
      setMessage('The environment key cannot be removed from Settings.');
      return;
    }
    if (!window.confirm('Remove the Gemini key and disable AI reports for this server session?')) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      });
      const data = await response.json();
      setSettings(data as AiSettingsResponse);
      setMessage('Gemini key removed from the server session.');
    } catch {
      setMessage('Unable to remove the Gemini key.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-lmu-accent" />
          <h3 className="text-base font-bold uppercase tracking-wider text-white">AI Lap Reports</h3>
        </div>
        <span className={`rounded px-2.5 py-0.5 text-xs font-semibold ${settings?.configured ? 'bg-emerald-400/15 text-emerald-300' : 'bg-lmu-card text-lmu-muted'}`}>
          {settings?.configured ? `Ready (${settings.keySource})` : 'Not configured'}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-lmu-muted">Uses Gemini {settings?.model || model} to explain LMU's calculated lap data. The key is held only in server memory and must be entered again after a server restart.</p>
      <p className="text-xs leading-relaxed text-lmu-muted">Lap analytics and driver names used in a comparison are sent to Google Gemini when a report is generated.</p>
      <div className="flex gap-2">
        <KeyRound className="mt-2 h-4 w-4 shrink-0 text-lmu-muted" />
        <input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Gemini API key" aria-label="Gemini API key" className="min-w-0 flex-1 rounded-lg border border-lmu-border bg-lmu-bg px-3 py-2 text-sm text-white outline-none focus:border-lmu-accent" autoComplete="off" />
      </div>
      <label className="block text-xs font-semibold text-lmu-muted" htmlFor="ai-model">Gemini model</label>
      <select id="ai-model" value={model} onChange={event => setModel(event.target.value)} className="w-full rounded-lg border border-lmu-border bg-lmu-bg px-3 py-2 text-sm text-white outline-none focus:border-lmu-accent">
        {AI_MODELS.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} disabled={isSaving || !apiKey.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-lmu-accent px-3 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"><Save className="h-3.5 w-3.5" /> Save Key</button>
        <button type="button" onClick={() => void remove()} disabled={isSaving || !settings?.configured || settings.keySource === 'environment'} className="inline-flex items-center gap-1.5 rounded-lg border border-lmu-accent/30 bg-lmu-accent/10 hover:bg-lmu-accent/20 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"><Trash2 className="h-3.5 w-3.5 text-lmu-accent" /> Remove Session Key</button>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-lmu-border px-3 py-2 text-xs font-semibold text-lmu-muted hover:text-white"><ExternalLink className="h-3.5 w-3.5" /> Get Gemini Key</a>
      </div>
      {message && <p role="status" className="text-xs text-lmu-muted">{message}</p>}
    </div>
  );
};
