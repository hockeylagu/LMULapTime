import { createContext } from 'react';
import type { ReplayLapSummary } from '../../../../shared/types/index.js';

export interface ReplayFullscreenControls {
  primary: ReplayLapChoice;
  baseline?: Omit<ReplayLapChoice, 'laps' | 'onSelect'>;
  onOpenBaselinePicker: () => void;
  onRemoveBaseline?: () => void;
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
export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;

/** `,` / `<` slows playback one step, `.` / `>` speeds it up; null for any other key or past either end. */
export function steppedPlaybackSpeed(key: string, speed: number): number | null {
  const direction = key === ',' || key === '<' ? -1 : key === '.' || key === '>' ? 1 : 0;
  if (!direction) return null;
  const at = PLAYBACK_SPEEDS.findIndex(option => option === speed);
  return PLAYBACK_SPEEDS[(at < 0 ? PLAYBACK_SPEEDS.indexOf(1) : at) + direction] ?? null;
}

/** Fullscreen controls share the inspector's session locators, load state and playback speed. */
export const ReplayFullscreenControlsContext = createContext<ReplayFullscreenControls | null>(null);
