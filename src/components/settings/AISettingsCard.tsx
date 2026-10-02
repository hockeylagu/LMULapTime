import React, { useRef, useState } from 'react';
import { ExternalLink, KeyRound, Save, Trash2 } from 'lucide-react';
import { postJson } from '../../api/apiClient.js';
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { aiKeyErrorMessage, cleanApiKey } from './aiKey.js';
import { InlineConfirm } from './controls/InlineConfirm.js';
import { useInlineConfirm } from './controls/useInlineConfirm.js';
import { AiSettingsResponse, AiSettingsState, useAiSettings } from './hooks/useAiSettings.js';
import { FeedbackMessage, SettingsFeedback, SettingsPanel } from './SettingsPanel.js';
import { FIELD_LABEL } from './labelStyles.js';

const AI_MODELS = ['gemini-3.7-flash', 'gemini-3.8-flash'] as const;

const FIELD_LABEL_BLOCK = `block mb-1.5 ${FIELD_LABEL}`;
const FIELD_CLASS = `rounded-xl border border-lmu-border bg-lmu-bg px-3 py-2 text-sm text-lmu-text focus:border-lmu-accent ${FOCUS_RING}`;

/** The state line for the panel heading and the status strip. */
export function aiStatusText(settings: AiSettingsResponse | null, loadError: string | null): string | null {
  if (!settings) return loadError ? 'Status unavailable' : null;
  if (!settings.configured) return 'Optional · not set up';
  return settings.keySource === 'environment' ? 'Ready, key from the environment' : 'Ready, key set this session';
}

const AISettingsPanel: React.FC<{ ai: AiSettingsState }> = ({ ai }) => {
  const { settings, setSettings, loadError } = ai;
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string>(settings?.model ?? 'gemini-3.7-flash');
  const [syncedModel, setSyncedModel] = useState<string | undefined>(settings?.model);
  const [message, setMessage] = useState<SettingsFeedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const removeConfirm = useInlineConfirm('ai-settings-heading');
  const busy = useRef(false);

  // Follow the model the server reports, the first time it is known.
  if (settings && syncedModel !== settings.model) {
    setSyncedModel(settings.model);
    setModel(settings.model);
  }

  const cleanedKey = cleanApiKey(apiKey);

  const save = async () => {
    if (!cleanedKey || busy.current) return;
    busy.current = true;
    setIsSaving(true);
    setMessage(null);
    try {
      const data = await postJson<AiSettingsResponse>('/api/ai/settings', { apiKey: cleanedKey, model });
      setApiKey('');
      setSettings(data);
      setMessage({ tone: 'ok', text: 'Gemini key is active for this server session.' });
    } catch (error) {
      setMessage({ tone: 'error', text: aiKeyErrorMessage(error, cleanedKey, 'Unable to save the key.') });
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    setIsSaving(true);
    setMessage(null);
    try {
      setSettings(await postJson<AiSettingsResponse>('/api/ai/settings', { apiKey: '' }));
      setMessage({ tone: 'ok', text: 'Gemini key removed from the server session.' });
    } catch (error) {
      setMessage({ tone: 'error', text: aiKeyErrorMessage(error, cleanedKey, 'Unable to remove the Gemini key.') });
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  };

  const requestRemove = () => {
    if (settings?.keySource === 'environment') {
      setMessage({ tone: 'error', text: 'The environment key cannot be removed from Settings.' });
      return;
    }
    setMessage(null);
    removeConfirm.open();
  };

  const statusText = aiStatusText(settings, loadError);

  return (
    <SettingsPanel
      sectionId="ai-settings"
      aside={statusText && <span className={`text-xs font-semibold ${settings?.configured ? 'text-lmu-gain' : 'text-lmu-muted'}`}>{statusText}</span>}
    >
      <p className="text-xs leading-relaxed text-lmu-muted">Optional. Uses Gemini {settings?.model || model} to explain LMU's calculated lap data; every number comes from the app, not the model. The key is held only in server memory and must be entered again after a server restart.</p>
      <p className="text-xs leading-relaxed text-lmu-muted">Lap analytics and driver names used in a comparison are sent to Google Gemini when a report is generated.</p>
      {loadError && (
        <div className="flex flex-wrap items-center gap-3">
          <FeedbackMessage feedback={{ tone: 'error', text: loadError }} />
          <button type="button" onClick={ai.reload} disabled={ai.isLoading} className={SECONDARY_BUTTON}>Retry</button>
        </div>
      )}
      <div>
        <label className={FIELD_LABEL_BLOCK} htmlFor="ai-api-key">Gemini API key</label>
        <div className="flex gap-2">
          <KeyRound className="mt-2.5 h-4 w-4 shrink-0 text-lmu-muted" aria-hidden="true" />
          <input id="ai-api-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} spellCheck={false} placeholder="Paste a key from Google AI Studio" className={`min-w-0 flex-1 ${FIELD_CLASS}`} autoComplete="off" />
        </div>
      </div>
      <div>
        <label className={FIELD_LABEL_BLOCK} htmlFor="ai-model">Gemini model</label>
        <select id="ai-model" value={model} onChange={event => setModel(event.target.value)} className={`w-64 ${FIELD_CLASS}`}>
          {AI_MODELS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={isSaving || !cleanedKey} data-busy={isSaving} className={PRIMARY_BUTTON}><Save className="h-3.5 w-3.5" aria-hidden="true" /> Save Key</button>
        {removeConfirm.isOpen ? (
          <InlineConfirm
            label="Confirm removing the Gemini key"
            message="Remove the key and turn AI reports off for this server session?"
            confirmLabel="Remove key"
            confirmIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            onConfirm={() => removeConfirm.confirm(() => void remove())}
            onCancel={removeConfirm.cancel}
          />
        ) : (
          <button ref={removeConfirm.triggerRef} type="button" onClick={requestRemove} disabled={isSaving || !settings?.configured || settings.keySource === 'environment'} className={SECONDARY_BUTTON}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove session key</button>
        )}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 h-8 rounded-lg border border-lmu-border px-3 text-xs font-semibold text-lmu-muted hover:text-lmu-text hover:border-lmu-rule transition-colors ${FOCUS_RING}`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Get a Gemini key</a>
      </div>
      <FeedbackMessage feedback={message} />
    </SettingsPanel>
  );
};

const SelfLoadingAISettings: React.FC = () => <AISettingsPanel ai={useAiSettings()} />;

/** The Gemini key panel. Settings passes the shared state; on its own the card reads it itself. */
export const AISettingsCard: React.FC<{ ai?: AiSettingsState }> = ({ ai }) =>
  ai ? <AISettingsPanel ai={ai} /> : <SelfLoadingAISettings />;
