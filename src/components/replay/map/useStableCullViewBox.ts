import { useState } from 'react';
import { nextCullViewBox } from './replayMapUtils.js';

/**
 * The view box for viewport culling of memoised map layers: unchanged while the camera moves within the
 * padded safe area (follow mode moves it every frame), replaced when the view leaves it or the zoom changes
 * meaningfully. `undefined` when culling is off.
 */
export function useStableCullViewBox(liveViewBox: string, enabled: boolean): string | undefined {
  const [committed, setCommitted] = useState<string | null>(null);
  const next = enabled ? nextCullViewBox(committed, liveViewBox) : null;
  if (next !== committed) setCommitted(next);
  return next ?? undefined;
}
