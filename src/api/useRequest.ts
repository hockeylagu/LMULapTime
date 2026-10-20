import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { isAbortError } from './apiClient.js';

export interface RequestState<T> {
  /** The answer to the current request; with `keepPrevious`, the last answer until the current one arrives. */
  data: T | null;
  /** Why the current request failed; a new request clears it at once. */
  error: unknown;
  /** True until the current request has answered or failed. */
  loading: boolean;
  /** Sends the current request again. */
  reload: () => void;
}

export interface RequestOptions {
  /** Shows the previous answer while another request loads, instead of nothing. */
  keepPrevious?: boolean;
  /** Changing it sends the same request again and keeps its answer on screen until the new one arrives. */
  refresh?: string | number;
}

/**
 * Loads `request` and answers only for it: the answer is stored with the request it belongs to, so a
 * changed request never shows another request's data, error or finished loading state. The request is
 * the identity, compared as JSON, so `load` must read everything it sends from `request`. `null` loads nothing.
 */
export function useRequest<R, T>(
  request: R | null,
  load: (request: R, signal: AbortSignal) => Promise<T>,
  options: RequestOptions = {},
): RequestState<T> {
  const identity = request === null ? null : JSON.stringify(request);
  // Each change of request starts a new run: coming back to an earlier request never shows its old answer.
  const [run, setRun] = useState({ identity, number: 0 });
  if (run.identity !== identity) setRun({ identity, number: run.number + 1 });
  const runNumber = run.identity === identity ? run.number : run.number + 1;
  const [version, setVersion] = useState(0);
  const attempt = identity === null ? null : `${runNumber}|${identity}|${options.refresh ?? ''}|${version}`;
  const [answer, setAnswer] = useState<{ run: number; attempt: string; data: T | null; error: unknown } | null>(null);
  const send = useEffectEvent((signal: AbortSignal) => load(request as R, signal));

  useEffect(() => {
    if (attempt === null) return;
    const controller = new AbortController();
    send(controller.signal).then(
      data => { if (!controller.signal.aborted) setAnswer({ run: runNumber, attempt, data, error: null }); },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setAnswer(previous => ({ run: runNumber, attempt, data: previous?.run === runNumber ? previous.data : null, error }));
      },
    );
    return () => controller.abort();
  }, [attempt, runNumber]);

  const reload = useCallback(() => setVersion(value => value + 1), []);
  const sameRequest = answer !== null && answer.run === runNumber;
  return {
    data: identity === null || !answer || (!sameRequest && !options.keepPrevious) ? null : answer.data,
    error: answer?.attempt === attempt ? answer.error : null,
    loading: attempt !== null && answer?.attempt !== attempt,
    reload,
  };
}
