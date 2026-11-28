import { useEffect, useEffectEvent } from 'react';
import { heldKeyOf, type HeldKey } from './heldKeys.js';

/** What the 3D camera's held keys reach: the scene's `holdKey` and `releaseKeys` (`cameraActions`). */
export interface HeldKeyActions {
  onHoldKey: (key: HeldKey, down: boolean) => void;
  onReleaseKeys: () => void;
}

/**
 * The held keys' ends: a key released anywhere stops its move (its press went through the view's own key rules), and the window
 * losing focus stops every key (no keyup comes). Off while `enabled` is false.
 */
export function useHeldCameraKeys(actions: HeldKeyActions | undefined, enabled = true): void {
  const releaseKey = useEffectEvent((key: HeldKey) => actions?.onHoldKey(key, false));
  const release = useEffectEvent(() => actions?.onReleaseKeys());
  const on = enabled && actions !== undefined;
  useEffect(() => {
    if (!on) return;
    const up = (event: KeyboardEvent) => {
      const key = heldKeyOf(event.key);
      if (key) releaseKey(key);
    };
    const blur = () => release();
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      release();
    };
  }, [on]);
}
