import { useEffect, useState } from 'react';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import type { RadioPlayer } from './radioPlayer.js';
import { radioVoiceSupported } from './useStrategyRadio.js';

/** Chrome plays audio only after a click in the page; a click earlier in the same page counts. */
const pageActivated = (): boolean => navigator.userActivation?.hasBeenActive ?? true;

/**
 * The dashboard's radio voice: the server decides the calls, `player` says them at the volume set in Settings. Audio
 * only: nothing shows on the dashboard except, after a reload with the voice on, one notice until the page is clicked.
 */
export function LiveRadio({ player, enabled, volume }: { player: RadioPlayer; enabled: boolean; volume: number }) {
  const supported = radioVoiceSupported();
  const [activated, setActivated] = useState(pageActivated);
  useEffect(() => {
    if (activated) return;
    const unlock = () => setActivated(true);
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, [activated]);
  useEffect(() => {
    player.configure(volume, activated);
    if (!enabled) player.stop();
  }, [player, volume, activated, enabled]);
  useEffect(() => () => player.stop(), [player]);
  if (!supported || !enabled || activated) return null;
  // Positioned over the frame, so it never moves the dashboard.
  return <button type="button" onClick={() => setActivated(true)}
    className={`absolute bottom-7 right-14 rounded border border-lmu-rule bg-lmu-card px-6 py-2 text-[36px] font-semibold text-lmu-text-soft ${FOCUS_RING}`}>
    Click to enable radio
  </button>;
}
