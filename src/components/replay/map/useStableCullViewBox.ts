import { useMemo, useRef } from 'react';
import { nextCullViewBox } from './replayMapUtils.js';

/**
 * The view box for viewport culling of memoised map layers: unchanged while the camera moves within the
 * padded safe area (follow mode moves it every frame), replaced when the view leaves it or the zoom changes
 * meaningfully. `undefined` when culling is off.
 */
export function useStableCullViewBox(liveViewBox: string, enabled: boolean): string | undefined {
  const committed = useRef<string | null>(null);
  return useMemo(() => {
    if (!enabled) { committed.current = null; return undefined; }
    committed.current = nextCullViewBox(committed.current, liveViewBox);
    return committed.current;
  }, [liveViewBox, enabled]);
}
