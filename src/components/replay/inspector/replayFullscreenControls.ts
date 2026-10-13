import { createContext } from 'react';
import type { ReplayLapSummary } from '../../../../shared/types/index.js';

export interface ReplayFullscreenControls {
  primary: ReplayLapChoice;
  baseline?: Omit<ReplayLapChoice, 'laps' | 'onSelect'>;
  onOpenBaselinePicker: () => void;
  playback: { speed: number; speeds: readonly number[]; onChangeSpeed: (speed: number) => void };
}

export interface ReplayLapChoice {
  laps: ReplayLapSummary[];
  lapNumber: number | null;
  onSelect: (lapNumber: number) => void;
  isLoading: boolean;
  error?: string | null;
  onRetry: () => void;
}

/** Inspector playback rates, shared by the header and the fullscreen playback strip. */
export const PLAYBACK_SPEEDS = [0.5, 1, 2] as const;

/** Fullscreen controls share the inspector's session locators, load state and playback speed. */
export const ReplayFullscreenControlsContext = createContext<ReplayFullscreenControls | null>(null);
