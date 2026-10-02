import { useEffect } from 'react';

/** Longest wait for the page above the target to stop changing height. */
const SETTLE_WINDOW_MS = 2500;

/**
 * Keeps a deep-linked section under the header while the content above it is still loading. It watches the
 * page height and re-aligns each time it grows, until the window ends or the user scrolls on their own.
 */
export function useDeepLinkAlign(sectionId: string | null, align: (sectionId: string) => void): void {
  useEffect(() => {
    if (!sectionId || typeof ResizeObserver === 'undefined') return;
    let userScrolled = false;
    const stop = () => { userScrolled = true; };
    const events: Array<keyof WindowEventMap> = ['wheel', 'touchmove', 'keydown', 'pointerdown'];
    events.forEach((name) => window.addEventListener(name, stop, { passive: true }));

    let lastHeight = document.documentElement.scrollHeight;
    const observer = new ResizeObserver(() => {
      const height = document.documentElement.scrollHeight;
      if (userScrolled || height === lastHeight) return;
      lastHeight = height;
      align(sectionId);
    });
    observer.observe(document.body);
    const timer = setTimeout(() => observer.disconnect(), SETTLE_WINDOW_MS);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      events.forEach((name) => window.removeEventListener(name, stop));
    };
    // Runs once for the link the page opened with.
  }, []);
}
