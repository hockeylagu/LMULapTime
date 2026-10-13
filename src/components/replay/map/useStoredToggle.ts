import { useCallback, useState } from 'react';

/** A boolean view preference remembered in localStorage; storage may be unavailable. */
export function useStoredToggle(key: string, fallback: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? fallback : saved === 'true';
    } catch { return fallback; }
  });
  const toggle = useCallback(() => setValue(current => {
    try { localStorage.setItem(key, String(!current)); } catch { /* Storage may be disabled. */ }
    return !current;
  }), [key]);
  return [value, toggle];
}
