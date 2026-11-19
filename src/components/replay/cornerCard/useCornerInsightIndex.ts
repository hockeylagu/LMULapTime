import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/apiClient.js';
import { onSequenceMapsChanged } from '../../../api/cornerSequenceApi.js';
import { fetchSessionSequencePasses } from '../../../api/replayApi.js';
import { indexCornerInsight, type CornerInsightIndex } from './cornerInsight.js';

/** The card's data for a session: its index, or why there is none, while it loads neither. */
export interface CornerInsightState {
  index: CornerInsightIndex | null;
  reason: string | null;
  loading: boolean;
}

interface Loaded { sessionId: string; index: CornerInsightIndex | null; reason: string | null }

// The last sessions' answers, kept so the lap and race views (and a switch between them) read each once; two, for a
// lap compared with a lap of another session.
const KEPT = 2;
let kept: Loaded[] = [];
// Requests in flight, shared by every card that mounts before the answer lands (the lap view mounts two).
const pending = new Map<string, Promise<Loaded>>();
const keptFor = (sessionId: string | null | undefined) => (sessionId ? kept.find(entry => entry.sessionId === sessionId) ?? null : null);

function loadSession(sessionId: string): Promise<Loaded> {
  const inFlight = pending.get(sessionId);
  if (inFlight) return inFlight;
  const request = fetchSessionSequencePasses(sessionId).then(
    (response): Loaded => {
      // Passes not built yet are not kept either: ingestion can build them while the app runs.
      if (!response.available) return { sessionId, index: null, reason: response.reason };
      const entry = { sessionId, index: indexCornerInsight(response), reason: null };
      kept = [entry, ...kept.filter(other => other.sessionId !== sessionId)].slice(0, KEPT);
      return entry;
    },
    // A failed request is not kept: the next card to mount asks again.
    (error: unknown): Loaded => ({ sessionId, index: null, reason: apiErrorMessage(error, 'Corner times are unavailable.') }),
  ).finally(() => pending.delete(sessionId));
  pending.set(sessionId, request);
  return request;
}

/** Every car's passes through its class's turn sequences, indexed for the corner card; one request per session. */
export function useCornerInsightIndex(sessionId: string | null | undefined): CornerInsightState {
  const [loaded, setLoaded] = useState(() => keptFor(sessionId));
  useEffect(() => {
    if (!sessionId || keptFor(sessionId)) return;
    let live = true;
    void loadSession(sessionId).then(entry => { if (live) setLoaded(entry); });
    return () => { live = false; };
  }, [sessionId]);
  const current = sessionId && loaded?.sessionId === sessionId ? loaded : keptFor(sessionId);
  return { index: current?.index ?? null, reason: current?.reason ?? null, loading: Boolean(sessionId) && !current };
}

/** Forgets the kept answers: a scan or a map regeneration may have rebuilt the sequence passes. */
export function forgetCornerInsightIndex(): void {
  kept = [];
  pending.clear();
}

onSequenceMapsChanged(forgetCornerInsightIndex);
