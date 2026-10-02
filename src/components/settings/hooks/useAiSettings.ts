import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage, fetchJson, isAbortError } from '../../../api/apiClient.js';

export interface AiSettingsResponse {
  configured: boolean;
  model: string;
  keySource: 'environment' | 'session' | null;
}

export interface AiSettingsState {
  /** null until the server has answered. */
  settings: AiSettingsResponse | null;
  setSettings: (settings: AiSettingsResponse) => void;
  /** Why the settings could not be read, or null. */
  loadError: string | null;
  /** Reads the settings again (the Retry button). */
  reload: () => void;
  isLoading: boolean;
}

/** The Gemini key state; the AI card and the status strip share it. */
export function useAiSettings(): AiSettingsState {
  const [settings, setSettingsState] = useState<AiSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  // Once a save or remove has answered, a slower earlier read must not bring the old state back.
  const savedSince = useRef(0);

  const load = useCallback(() => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const startedAt = savedSince.current;
    setIsLoading(true);
    fetchJson<AiSettingsResponse>('/api/ai/settings', { signal: request.signal })
      .then((next) => {
        if (request.signal.aborted || savedSince.current !== startedAt) return;
        setSettingsState(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || request.signal.aborted) return;
        setLoadError(apiErrorMessage(err, 'Unable to read AI settings.'));
      })
      .finally(() => { if (!request.signal.aborted) setIsLoading(false); });
  }, []);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  const setSettings = useCallback((next: AiSettingsResponse) => {
    savedSince.current += 1;
    setSettingsState(next);
    setLoadError(null);
  }, []);

  return { settings, setSettings, loadError, reload: load, isLoading };
}
