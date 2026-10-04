import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

/**
 * Expands the map (its `data-replay-surface="map"` container) over the whole window; Escape or the button
 * restores it. A window overlay rather than the Fullscreen API, which embedded browsers can refuse.
 */
export const MapFullscreenButton: React.FC = () => {
  const [active, setActive] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const map = buttonRef.current?.closest<HTMLElement>('[data-replay-surface="map"]');
    if (!map) return;
    map.toggleAttribute('data-map-expanded', active);
    if (!active) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setActive(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); map.removeAttribute('data-map-expanded'); };
  }, [active]);
  const label = active ? 'Exit full screen (Esc)' : 'Full screen map';
  return <button ref={buttonRef} type="button" onClick={() => setActive(value => !value)} aria-label={label}
    aria-pressed={active} title={label}
    className={`w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 text-lmu-muted hover:text-white transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}>
    {active ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
  </button>;
};
