import { useCallback, useEffect, useRef, useState } from 'react';
import { SETTINGS_HEADER_OFFSET_PX } from './settingsSections.js';

// How long scrolling must be quiet before a TOC click stops pinning its section as the active one.
const SETTLE_MS = 160;
// A smooth scroll that never starts (already at the target) must not pin the section forever.
const START_GRACE_MS = 700;

/**
 * Which section is the current one. While scrolling, it is the last section whose top has passed the
 * header line (the page bottom always selects the last section). A TOC click pins its section until
 * the scroll that follows settles, so the highlight does not flicker through the sections it passes.
 */
export function useSettingsScrollspy(sectionIds: string[]) {
  const [trackedId, setActiveId] = useState<string>(sectionIds[0] ?? '');
  const pinned = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const idsKey = sectionIds.join('|');

  const activeId = sectionIds.includes(trackedId) ? trackedId : (sectionIds[0] ?? '');

  const pin = useCallback((id: string) => {
    setActiveId(id);
    pinned.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { pinned.current = false; }, START_GRACE_MS);
  }, []);

  useEffect(() => {
    const ids = idsKey ? idsKey.split('|') : [];

    const measure = () => {
      frame.current = undefined;
      if (pinned.current || ids.length === 0) return;
      const root = document.documentElement;
      if (window.innerHeight + window.scrollY >= root.scrollHeight - 2) {
        setActiveId(ids[ids.length - 1]);
        return;
      }
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= SETTINGS_HEADER_OFFSET_PX + 8) current = id;
      }
      setActiveId(current);
    };

    const onScroll = () => {
      if (pinned.current) {
        // Keep the pin while the click's scroll is still moving, release it once it stops.
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => { pinned.current = false; }, SETTLE_MS);
        return;
      }
      if (frame.current === undefined) frame.current = window.requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // A page restored part-way down (reload, back) should open on the right section.
    if (window.scrollY > 0) measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    };
  }, [idsKey]);

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  return { activeId, pin };
}
