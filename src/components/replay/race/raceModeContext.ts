import { createContext } from 'react';

/**
 * Opens the race mode of the inspector on a car (replay slot) and lap, from the lap view; null
 * outside an inspector page.
 */
export const RaceModeContext = createContext<((slot: number | null, lapNumber: number | null) => void) | null>(null);
