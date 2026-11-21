import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/apiClient.js';
import { fetchSequenceMaps, regenerateSequenceMap, sequenceMapsChanged } from '../../../api/cornerApi.js';
import { useRequest } from '../../../api/useRequest.js';
import type { SettingsFeedback } from '../SettingsPanel.js';

/** How often the list is read again while a map regenerates. */
const POLL_MS = 2000;

/** The sequence maps, reloaded while one regenerates, and the action that starts it. */
export function useSequenceMaps() {
  const maps = useRequest({}, (_request, signal) => fetchSequenceMaps(signal), { keepPrevious: true });
  const [feedback, setFeedback] = useState<SettingsFeedback | null>(null);
  const regenerating = maps.data?.regenerating ?? null;
  const { reload } = maps;
  // The map last seen regenerating: once the list no longer names it, it is done (or failed).
  const [watching, setWatching] = useState<string | null>(null);
  // Regenerations finished on this page, to tell the views their maps may have changed.
  const [finished, setFinished] = useState(0);
  if (regenerating && regenerating !== watching) setWatching(regenerating);
  if (!regenerating && watching && maps.data && !maps.loading) {
    const failed = maps.data.failed?.map === watching ? maps.data.failed : null;
    setWatching(null);
    setFinished(count => count + 1);
    setFeedback(failed
      ? { tone: 'error', text: `The map could not be regenerated: ${failed.error}` }
      : { tone: 'ok', text: "Map regenerated, and its layout's sequence times rebuilt" });
  }

  // The lap view and the corner card read the new map's corners and passes from now on.
  useEffect(() => {
    if (finished > 0) sequenceMapsChanged();
  }, [finished]);

  useEffect(() => {
    if (!regenerating) return;
    const timer = setTimeout(reload, POLL_MS);
    return () => clearTimeout(timer);
  }, [regenerating, maps.data, reload]);

  const regenerate = async (layoutKey: string, carClass: string) => {
    setFeedback(null);
    try {
      const started = await regenerateSequenceMap(layoutKey, carClass);
      setWatching(started.regenerating);
    } catch (error) {
      setFeedback({ tone: 'error', text: apiErrorMessage(error, 'Could not regenerate the map') });
    }
    reload();
  };

  return { ...maps, regenerating, regenerate, feedback };
}
